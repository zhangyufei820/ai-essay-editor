package controller

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

const (
	telegramAuthMaxAge     = 10 * time.Minute
	telegramAuthFutureSkew = time.Minute
	telegramAuthMaxFields  = 16
	telegramAuthMaxValue   = 4096
)

var telegramAuthFields = map[string]struct{}{
	"id": {}, "first_name": {}, "last_name": {}, "username": {},
	"photo_url": {}, "auth_date": {}, "hash": {}, "lang": {}, "state": {},
}

func TelegramBind(c *gin.Context) {
	if !common.TelegramOAuthEnabled {
		c.JSON(http.StatusOK, gin.H{
			"message": "管理员未开启通过 Telegram 登录以及注册",
			"success": false,
		})
		return
	}
	params, err := telegramAuthParamsFromRequest(c)
	if err != nil || !checkTelegramAuthorization(params, common.TelegramBotToken) {
		writeInvalidTelegramAuth(c)
		return
	}
	if _, err := consumeOAuthState(sessions.Default(c), params.Get("state")); err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"message": i18n.T(c, i18n.MsgOAuthStateInvalid),
			"success": false,
		})
		return
	}

	userID := c.GetInt("id")
	if userID <= 0 {
		writeOAuthBindAuthenticationError(c, errOAuthBindSessionInvalid)
		return
	}
	user, err := model.GetUserById(userID, false)
	if err != nil {
		writeOAuthBindAuthenticationError(c, err)
		return
	}
	if user.Status != common.UserStatusEnabled {
		writeOAuthBindAuthenticationError(c, errOAuthBindUserDisabled)
		return
	}

	telegramID := params.Get("id")
	identityTaken, err := model.IsUserOAuthIdentityTaken(model.UserOAuthProviderTelegram, telegramID)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	if identityTaken {
		writeOAuthIdentityError(c, "Telegram", model.ErrUserOAuthIdentityAlreadyBound)
		return
	}
	if err := user.SetOAuthIdentity(model.UserOAuthProviderTelegram, telegramID); err != nil {
		if writeOAuthIdentityError(c, "Telegram", err) {
			return
		}
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func TelegramLogin(c *gin.Context) {
	if !common.TelegramOAuthEnabled {
		c.JSON(http.StatusOK, gin.H{
			"message": "管理员未开启通过 Telegram 登录以及注册",
			"success": false,
		})
		return
	}
	params, err := telegramAuthParamsFromRequest(c)
	if err != nil || !checkTelegramAuthorization(params, common.TelegramBotToken) {
		writeInvalidTelegramAuth(c)
		return
	}
	if _, err := consumeOAuthState(sessions.Default(c), params.Get("state")); err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"message": i18n.T(c, i18n.MsgOAuthStateInvalid),
			"success": false,
		})
		return
	}

	user, found, err := model.LookupUserByOAuthIdentity(model.UserOAuthProviderTelegram, params.Get("id"))
	if err != nil {
		common.SysLog("telegram login user lookup failed")
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	if !found {
		common.ApiErrorI18n(c, i18n.MsgUserTelegramNotBound)
		return
	}
	if user.DeletedAt.Valid {
		common.ApiErrorI18n(c, i18n.MsgUserDisabled)
		return
	}
	if user.Status != common.UserStatusEnabled {
		common.ApiErrorI18n(c, i18n.MsgUserDisabled)
		return
	}
	completeLogin(user, c)
}

func telegramAuthParamsFromRequest(c *gin.Context) (url.Values, error) {
	payload := map[string]string{}
	if err := common.DecodeJson(c.Request.Body, &payload); err != nil {
		return nil, err
	}
	if len(payload) == 0 || len(payload) > telegramAuthMaxFields {
		return nil, errors.New("invalid telegram payload")
	}
	params := make(url.Values, len(payload))
	for key, value := range payload {
		if _, ok := telegramAuthFields[key]; !ok || len(value) > telegramAuthMaxValue {
			return nil, errors.New("invalid telegram payload")
		}
		params.Set(key, value)
	}
	return params, nil
}

func writeInvalidTelegramAuth(c *gin.Context) {
	c.JSON(http.StatusForbidden, gin.H{
		"message": "无效的请求",
		"success": false,
	})
}

func checkTelegramAuthorization(params url.Values, token string) bool {
	return checkTelegramAuthorizationAt(params, token, time.Now())
}

func checkTelegramAuthorizationAt(params url.Values, token string, now time.Time) bool {
	if strings.TrimSpace(token) == "" || params.Get("id") == "" {
		return false
	}
	for key, values := range params {
		if _, ok := telegramAuthFields[key]; !ok || len(values) != 1 || len(values[0]) > telegramAuthMaxValue {
			return false
		}
	}
	authTimestamp, err := strconv.ParseInt(params.Get("auth_date"), 10, 64)
	if err != nil {
		return false
	}
	authTime := time.Unix(authTimestamp, 0)
	if authTime.Before(now.Add(-telegramAuthMaxAge)) || authTime.After(now.Add(telegramAuthFutureSkew)) {
		return false
	}
	providedHash, err := hex.DecodeString(params.Get("hash"))
	if err != nil || len(providedHash) != sha256.Size {
		return false
	}

	keys := make([]string, 0, len(params))
	for key := range params {
		if key != "hash" && key != "state" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+params.Get(key))
	}
	secret := sha256.Sum256([]byte(token))
	mac := hmac.New(sha256.New, secret[:])
	_, _ = mac.Write([]byte(strings.Join(parts, "\n")))
	return hmac.Equal(providedHash, mac.Sum(nil))
}
