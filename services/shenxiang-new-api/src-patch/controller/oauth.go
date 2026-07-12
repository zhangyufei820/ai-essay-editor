package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var (
	errOAuthBindSessionInvalid = errors.New("oauth bind session is invalid")
	errOAuthBindUserDisabled   = errors.New("oauth bind user is disabled")
)

const (
	oauthStateSessionKey               = "oauth_state"
	oauthRegistrationConsentSessionKey = "oauth_registration_consent"
	oauthRegistrationConsentMessage    = "请先阅读并同意用户协议和隐私政策"
	oauthLegacyMigrationMessage        = "该 OAuth 账户需要完成安全迁移后才能登录，请联系管理员"
)

type oauthStateClaims struct {
	RegistrationConsent bool
}

// providerParams returns map with Provider key for i18n templates
func providerParams(name string) map[string]any {
	return map[string]any{"Provider": name}
}

// GenerateOAuthCode generates a state code for OAuth CSRF protection
func GenerateOAuthCode(c *gin.Context) {
	generateOAuthCode(c, func() (string, error) {
		return common.GenerateRandomCharsKey(32)
	})
}

func generateOAuthCode(c *gin.Context, generateState func() (string, error)) {
	state, err := generateState()
	if err != nil {
		writeOAuthInternalFailure(
			c,
			http.StatusInternalServerError,
			"OAuth state generation failed",
			i18n.T(c, i18n.MsgGenerateFailed),
			err,
		)
		return
	}
	session := sessions.Default(c)
	affCode := c.Query("aff")
	if affCode != "" {
		session.Set("aff", affCode)
	}
	session.Set(oauthStateSessionKey, state)
	session.Set(oauthRegistrationConsentSessionKey, c.Query("registration_consent") == "true")
	if err := session.Save(); err != nil {
		writeOAuthInternalFailure(
			c,
			http.StatusInternalServerError,
			"OAuth state persistence failed",
			i18n.T(c, i18n.MsgDatabaseError),
			err,
		)
		return
	}
	common.ApiSuccess(c, state)
}

// HandleOAuth handles OAuth callback for all standard OAuth providers
func HandleOAuth(c *gin.Context) {
	providerName := c.Param("provider")
	provider := oauth.GetProvider(providerName)
	if provider == nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgOAuthUnknownProvider),
		})
		return
	}

	session := sessions.Default(c)

	// 1. Validate state (CSRF protection)
	state := c.Query("state")
	stateClaims, err := consumeOAuthState(session, state)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgOAuthStateInvalid),
		})
		return
	}

	// 2. Check if user is already logged in (bind flow)
	username := session.Get("username")
	if username != nil {
		user, err := getEnabledOAuthBindUser(c)
		if err != nil {
			writeOAuthBindAuthenticationError(c, err)
			return
		}
		handleOAuthBind(c, provider, user)
		return
	}

	// 3. Check if provider is enabled
	if !provider.IsEnabled() {
		common.ApiErrorI18n(c, i18n.MsgOAuthNotEnabled, providerParams(provider.GetName()))
		return
	}

	// 4. Handle error from provider
	errorCode := c.Query("error")
	if errorCode != "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": i18n.T(c, i18n.MsgOAuthConnectFailed, providerParams(provider.GetName())),
		})
		return
	}

	// 5. Exchange code for token
	code := c.Query("code")
	token, err := provider.ExchangeToken(c.Request.Context(), code, c)
	if err != nil {
		handleOAuthError(c, provider.GetName(), err)
		return
	}

	// 6. Get user info
	oauthUser, err := provider.GetUserInfo(c.Request.Context(), token)
	if err != nil {
		handleOAuthError(c, provider.GetName(), err)
		return
	}

	// 7. Find or create user
	user, err := findOrCreateOAuthUser(c, provider, oauthUser, session, stateClaims)
	if err != nil {
		writeOAuthUserResolutionError(c, provider.GetName(), err)
		return
	}

	// 8. Check user status
	if user.Status != common.UserStatusEnabled {
		common.ApiErrorI18n(c, i18n.MsgOAuthUserBanned)
		return
	}

	// 9. Setup login
	completeLogin(user, c)
}

// handleOAuthBind handles binding OAuth account to existing user
func handleOAuthBind(c *gin.Context, provider oauth.Provider, user *model.User) {
	if !provider.IsEnabled() {
		common.ApiErrorI18n(c, i18n.MsgOAuthNotEnabled, providerParams(provider.GetName()))
		return
	}

	// Exchange code for token
	code := c.Query("code")
	token, err := provider.ExchangeToken(c.Request.Context(), code, c)
	if err != nil {
		handleOAuthError(c, provider.GetName(), err)
		return
	}

	// Get user info
	oauthUser, err := provider.GetUserInfo(c.Request.Context(), token)
	if err != nil {
		handleOAuthError(c, provider.GetName(), err)
		return
	}

	// Check if this OAuth account is already bound (check both new ID and legacy ID)
	identityTaken, err := isOAuthProviderUserIDTaken(provider, oauthUser.ProviderUserID)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	if identityTaken {
		writeOAuthIdentityError(c, provider.GetName(), model.ErrUserOAuthIdentityAlreadyBound)
		return
	}
	// Also check legacy ID to prevent duplicate bindings during migration period
	if legacyID, ok := oauthUser.Extra["legacy_id"].(string); ok && legacyID != "" {
		legacyTaken, lookupErr := isOAuthProviderUserIDTaken(provider, legacyID)
		if lookupErr != nil {
			common.ApiErrorI18n(c, i18n.MsgDatabaseError)
			return
		}
		if legacyTaken {
			writeOAuthIdentityError(c, provider.GetName(), model.ErrUserOAuthIdentityAlreadyBound)
			return
		}
	}

	// Handle binding based on provider type
	if genericProvider, ok := provider.(*oauth.GenericOAuthProvider); ok {
		// Custom provider: use user_oauth_bindings table
		err = model.UpdateUserOAuthBinding(user.Id, genericProvider.GetProviderId(), oauthUser.ProviderUserID)
		if err != nil {
			if writeOAuthIdentityError(c, provider.GetName(), err) {
				return
			}
			common.ApiErrorI18n(c, i18n.MsgDatabaseError)
			return
		}
	} else {
		identityProvider, ok := builtInOAuthIdentityProvider(provider)
		if !ok {
			common.ApiErrorI18n(c, i18n.MsgDatabaseError)
			return
		}
		err = user.SetOAuthIdentity(identityProvider, oauthUser.ProviderUserID)
		if err != nil {
			if writeOAuthIdentityError(c, provider.GetName(), err) {
				return
			}
			common.ApiErrorI18n(c, i18n.MsgDatabaseError)
			return
		}
	}

	common.ApiSuccessI18n(c, i18n.MsgOAuthBindSuccess, gin.H{
		"action": "bind",
	})
}

func consumeOAuthState(session sessions.Session, state string) (oauthStateClaims, error) {
	expected, ok := session.Get(oauthStateSessionKey).(string)
	if state == "" || !ok || expected == "" || state != expected {
		return oauthStateClaims{}, errOAuthBindSessionInvalid
	}
	claims := oauthStateClaims{}
	if registrationConsent, ok := session.Get(oauthRegistrationConsentSessionKey).(bool); ok {
		claims.RegistrationConsent = registrationConsent
	}
	session.Delete(oauthStateSessionKey)
	session.Delete(oauthRegistrationConsentSessionKey)
	if err := session.Save(); err != nil {
		return oauthStateClaims{}, err
	}
	return claims, nil
}

func validateOAuthRegistrationConsent(claims oauthStateClaims) error {
	legalSettings := system_setting.GetLegalSettings()
	consentRequired := legalSettings.UserAgreement != "" || legalSettings.PrivacyPolicy != ""
	if consentRequired && !claims.RegistrationConsent {
		return &OAuthConsentRequiredError{}
	}
	return nil
}

func getEnabledOAuthBindUser(c *gin.Context) (*model.User, error) {
	session := sessions.Default(c)
	id, ok := session.Get("id").(int)
	if !ok || id <= 0 {
		return nil, errOAuthBindSessionInvalid
	}
	user, err := model.GetUserById(id, false)
	if err != nil {
		return nil, err
	}
	if user.Status != common.UserStatusEnabled {
		return nil, errOAuthBindUserDisabled
	}
	return user, nil
}

func writeOAuthBindAuthenticationError(c *gin.Context, err error) {
	if errors.Is(err, errOAuthBindUserDisabled) {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": common.TranslateMessage(c, i18n.MsgAuthUserBanned),
		})
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) && !errors.Is(err, errOAuthBindSessionInvalid) {
		common.SysLog(fmt.Sprintf("oauth bind user refresh failed: %v", err))
	}
	c.JSON(http.StatusUnauthorized, gin.H{
		"success": false,
		"message": common.TranslateMessage(c, i18n.MsgAuthNotLoggedIn),
	})
}

// findOrCreateOAuthUser finds existing user or creates new user
func findOrCreateOAuthUser(c *gin.Context, provider oauth.Provider, oauthUser *oauth.OAuthUser, session sessions.Session, stateClaims oauthStateClaims) (*model.User, error) {
	user, found, err := lookupOAuthProviderUser(provider, oauthUser.ProviderUserID)
	if err != nil {
		return nil, err
	}
	if found {
		if user.Id == 0 || user.DeletedAt.Valid {
			return nil, &OAuthUserDeletedError{}
		}
		return user, nil
	}
	user = &model.User{}

	if legacyID, ok := oauthUser.Extra["legacy_id"].(string); ok && legacyID != "" {
		_, legacyFound, lookupErr := lookupOAuthProviderUser(provider, legacyID)
		if lookupErr != nil {
			return nil, lookupErr
		}
		if legacyFound {
			return nil, &OAuthLegacyMigrationRequiredError{}
		}
	}

	// User doesn't exist, create new user if registration is enabled
	if !common.RegisterEnabled {
		return nil, &OAuthRegistrationDisabledError{}
	}
	if err := validateOAuthRegistrationConsent(stateClaims); err != nil {
		return nil, err
	}

	// Set up new user
	user.Username = provider.GetProviderPrefix() + strconv.Itoa(model.GetMaxUserId()+1)

	if oauthUser.Username != "" {
		if exists, err := model.CheckUserExistOrDeleted(oauthUser.Username, ""); err == nil && !exists {
			// 防止索引退化
			if len(oauthUser.Username) <= model.UserNameMaxLength {
				user.Username = oauthUser.Username
			}
		}
	}

	if oauthUser.DisplayName != "" {
		user.DisplayName = oauthUser.DisplayName
	} else if oauthUser.Username != "" {
		user.DisplayName = oauthUser.Username
	} else {
		user.DisplayName = provider.GetName() + " User"
	}
	if oauthUser.Email != "" {
		user.Email = oauthUser.Email
	}
	user.Role = common.RoleCommonUser
	user.Status = common.UserStatusEnabled

	// Handle affiliate code
	affCode := session.Get("aff")
	inviterId := 0
	if affCode != nil {
		inviterId, _ = model.GetUserIdByAffCode(affCode.(string))
	}

	// Use transaction to ensure user creation and OAuth binding are atomic
	if genericProvider, ok := provider.(*oauth.GenericOAuthProvider); ok {
		// Custom provider: create user and binding in a transaction
		err := model.DB.Transaction(func(tx *gorm.DB) error {
			// Create user
			if err := user.InsertWithTx(tx, inviterId); err != nil {
				return err
			}

			// Create OAuth binding
			binding := &model.UserOAuthBinding{
				UserId:         user.Id,
				ProviderId:     genericProvider.GetProviderId(),
				ProviderUserId: oauthUser.ProviderUserID,
			}
			if err := model.CreateUserOAuthBindingWithTx(tx, binding); err != nil {
				return err
			}

			return nil
		})
		if err != nil {
			return nil, normalizeOAuthRegistrationError(provider, oauthUser.ProviderUserID, err)
		}

		// Perform post-transaction tasks (logs, sidebar config, inviter rewards)
		user.FinalizeOAuthUserCreation(inviterId)
	} else {
		provider.SetProviderUserID(user, oauthUser.ProviderUserID)
		err := model.DB.Transaction(func(tx *gorm.DB) error {
			return user.InsertWithTx(tx, inviterId)
		})
		if err != nil {
			return nil, normalizeOAuthRegistrationError(provider, oauthUser.ProviderUserID, err)
		}

		// Perform post-transaction tasks
		user.FinalizeOAuthUserCreation(inviterId)
	}

	return user, nil
}

func builtInOAuthIdentityProvider(provider oauth.Provider) (model.UserOAuthProvider, bool) {
	switch provider.(type) {
	case *oauth.GitHubProvider:
		return model.UserOAuthProviderGitHub, true
	case *oauth.DiscordProvider:
		return model.UserOAuthProviderDiscord, true
	case *oauth.OIDCProvider:
		return model.UserOAuthProviderOIDC, true
	case *oauth.LinuxDOProvider:
		return model.UserOAuthProviderLinuxDO, true
	default:
		return "", false
	}
}

func lookupOAuthProviderUser(provider oauth.Provider, providerUserID string) (*model.User, bool, error) {
	if identityProvider, ok := builtInOAuthIdentityProvider(provider); ok {
		user, found, err := model.LookupUserByOAuthIdentity(identityProvider, providerUserID)
		if err != nil {
			return nil, false, &OAuthIdentityLookupError{}
		}
		return user, found, nil
	}
	if genericProvider, ok := provider.(*oauth.GenericOAuthProvider); ok {
		user, found, err := model.LookupUserByOAuthBinding(genericProvider.GetProviderId(), providerUserID)
		if err != nil {
			return nil, false, &OAuthIdentityLookupError{}
		}
		return user, found, nil
	}
	if !provider.IsUserIDTaken(providerUserID) {
		return nil, false, nil
	}
	user := &model.User{}
	if err := provider.FillUserByProviderID(user, providerUserID); err != nil {
		return nil, false, err
	}
	return user, true, nil
}

func normalizeOAuthRegistrationError(provider oauth.Provider, providerUserID string, registrationErr error) error {
	registrationErr = model.NormalizeUserOAuthIdentityError(registrationErr)
	if errors.Is(registrationErr, model.ErrUserOAuthIdentityAlreadyBound) {
		return registrationErr
	}
	_, found, lookupErr := lookupOAuthProviderUser(provider, providerUserID)
	if lookupErr != nil {
		return lookupErr
	}
	if found {
		return model.ErrUserOAuthIdentityAlreadyBound
	}
	return &OAuthRegistrationDatabaseError{}
}

func isOAuthProviderUserIDTaken(provider oauth.Provider, providerUserID string) (bool, error) {
	_, found, err := lookupOAuthProviderUser(provider, providerUserID)
	return found, err
}

func writeOAuthIdentityError(c *gin.Context, providerName string, err error) bool {
	if !errors.Is(err, model.ErrUserOAuthIdentityAlreadyBound) {
		return false
	}
	c.JSON(http.StatusConflict, gin.H{
		"success": false,
		"message": i18n.T(c, i18n.MsgOAuthAlreadyBound, providerParams(providerName)),
	})
	return true
}

func writeOAuthUserResolutionError(c *gin.Context, providerName string, err error) {
	if writeOAuthIdentityError(c, providerName, err) {
		return
	}
	switch err.(type) {
	case *OAuthUserDeletedError:
		common.ApiErrorI18n(c, i18n.MsgOAuthUserDeleted)
	case *OAuthRegistrationDisabledError:
		common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
	case *OAuthConsentRequiredError:
		common.ApiErrorMsg(c, oauthRegistrationConsentMessage)
	case *OAuthLegacyMigrationRequiredError:
		common.ApiErrorMsg(c, oauthLegacyMigrationMessage)
	case *OAuthIdentityLookupError, *OAuthRegistrationDatabaseError:
		writeOAuthInternalFailure(
			c,
			http.StatusInternalServerError,
			"OAuth user resolution failed",
			i18n.T(c, i18n.MsgDatabaseError),
			err,
		)
	default:
		writeOAuthInternalFailure(
			c,
			http.StatusInternalServerError,
			"OAuth user resolution failed",
			i18n.T(c, i18n.MsgDatabaseError),
			err,
		)
	}
}

func writeOAuthInternalFailure(c *gin.Context, status int, operation string, message string, err error) {
	common.SysError(fmt.Sprintf("%s (error_type=%T)", operation, err))
	c.JSON(status, gin.H{
		"success": false,
		"message": message,
	})
}

// Error types for OAuth
type OAuthUserDeletedError struct{}

func (e *OAuthUserDeletedError) Error() string {
	return "user has been deleted"
}

type OAuthRegistrationDisabledError struct{}

func (e *OAuthRegistrationDisabledError) Error() string {
	return "registration is disabled"
}

type OAuthConsentRequiredError struct{}

func (e *OAuthConsentRequiredError) Error() string {
	return oauthRegistrationConsentMessage
}

type OAuthLegacyMigrationRequiredError struct{}

func (e *OAuthLegacyMigrationRequiredError) Error() string {
	return oauthLegacyMigrationMessage
}

type OAuthIdentityLookupError struct{}

func (e *OAuthIdentityLookupError) Error() string {
	return "OAuth identity lookup failed"
}

type OAuthRegistrationDatabaseError struct{}

func (e *OAuthRegistrationDatabaseError) Error() string {
	return "OAuth registration failed"
}

// handleOAuthError handles OAuth errors and returns translated message
func handleOAuthError(c *gin.Context, providerName string, err error) {
	switch e := err.(type) {
	case *oauth.OAuthError:
		if e.Params != nil {
			common.ApiErrorI18n(c, e.MsgKey, e.Params)
		} else {
			common.ApiErrorI18n(c, e.MsgKey)
		}
	case *oauth.AccessDeniedError:
		common.ApiErrorMsg(c, e.Message)
	case *oauth.TrustLevelError:
		common.ApiErrorI18n(c, i18n.MsgOAuthTrustLevelLow)
	default:
		writeOAuthInternalFailure(
			c,
			http.StatusBadGateway,
			"OAuth provider request failed",
			i18n.T(c, i18n.MsgOAuthConnectFailed, providerParams(providerName)),
			err,
		)
	}
}
