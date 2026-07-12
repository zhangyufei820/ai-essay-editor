package oauth

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGenericOAuthLogsExcludeSecretsAndIdentityData(t *testing.T) {
	const (
		providerSlug      = "safe-provider-slug"
		providerName      = "private-provider-name"
		authorizationCode = "private-authorization-code"
		clientID          = "private-client-id"
		clientSecret      = "private-client-secret"
		endpointSecret    = "private-endpoint-query"
		accessToken       = "private-access-token"
		refreshToken      = "private-refresh-token"
		idToken           = "private-id-token"
		tokenScope        = "private-token-scope"
		providerUserID    = "private-provider-user-id"
		providerUsername  = "private-provider-username"
		providerDisplay   = "private-provider-display-name"
		providerEmail     = "private-provider-email@example.invalid"
		policyExpected    = "private-policy-expected"
		policyCurrent     = "private-policy-current"
	)

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/token":
			_, _ = fmt.Fprintf(
				writer,
				`{"access_token":%q,"token_type":"Bearer","refresh_token":%q,"scope":%q,"id_token":%q}`,
				accessToken,
				refreshToken,
				tokenScope,
				idToken,
			)
		case "/userinfo":
			_, _ = fmt.Fprintf(
				writer,
				`{"id":%q,"username":%q,"name":%q,"email":%q,"department":%q}`,
				providerUserID,
				providerUsername,
				providerDisplay,
				providerEmail,
				policyCurrent,
			)
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)

	previousDebugEnabled := common.DebugEnabled
	common.DebugEnabled = true
	t.Cleanup(func() {
		common.DebugEnabled = previousDebugEnabled
	})

	var logs bytes.Buffer
	common.LogWriterMu.Lock()
	previousErrorWriter := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &logs
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter = previousErrorWriter
		common.LogWriterMu.Unlock()
	})

	provider := NewGenericOAuthProvider(&model.CustomOAuthProvider{
		Name:             providerName,
		Slug:             providerSlug,
		ClientId:         clientID,
		ClientSecret:     clientSecret,
		TokenEndpoint:    server.URL + "/token?secret=" + endpointSecret,
		UserInfoEndpoint: server.URL + "/userinfo?secret=" + endpointSecret,
		AuthStyle:        AuthStyleInParams,
		UserIdField:      "id",
		UsernameField:    "username",
		DisplayNameField: "name",
		EmailField:       "email",
		AccessPolicy: fmt.Sprintf(
			`{"logic":"and","conditions":[{"field":"department","op":"eq","value":%q}]}`,
			policyExpected,
		),
		AccessDeniedMessage: "denied: required={{required}} current={{current}}",
	})

	oauthToken, err := provider.ExchangeToken(context.Background(), authorizationCode, nil)
	require.NoError(t, err)
	require.Equal(t, accessToken, oauthToken.AccessToken)
	_, err = provider.GetUserInfo(context.Background(), oauthToken)
	var accessDeniedError *AccessDeniedError
	require.ErrorAs(t, err, &accessDeniedError)

	logOutput := logs.String()
	require.Contains(t, logOutput, providerSlug)
	require.Contains(t, logOutput, "ExchangeToken response status: 200")
	require.Contains(t, logOutput, "GetUserInfo response status: 200")
	require.Contains(t, logOutput, "field=department op=eq")
	for _, sensitiveValue := range []string{
		providerName,
		authorizationCode,
		clientID,
		clientSecret,
		endpointSecret,
		accessToken,
		refreshToken,
		idToken,
		tokenScope,
		providerUserID,
		providerUsername,
		providerDisplay,
		providerEmail,
		policyExpected,
		policyCurrent,
	} {
		require.NotContains(t, logOutput, sensitiveValue)
	}
}
