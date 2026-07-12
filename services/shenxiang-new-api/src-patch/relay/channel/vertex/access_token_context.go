package vertex

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
)

const vertexOAuthTokenEndpoint = "https://www.googleapis.com/oauth2/v4/token"

func AcquireAccessTokenWithContext(ctx context.Context, credentials Credentials, proxy string) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	signedJWT, err := createSignedJWT(credentials.ClientEmail, credentials.PrivateKey)
	if err != nil {
		return "", fmt.Errorf("failed to create signed JWT: %w", err)
	}

	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", signedJWT)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, vertexOAuthTokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return "", fmt.Errorf("new proxy http client failed: %w", err)
	}
	response, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	body, err := common.ReadAllCapped(response.Body)
	if err != nil {
		return "", err
	}
	payload := struct {
		AccessToken string `json:"access_token"`
	}{}
	if err := common.Unmarshal(body, &payload); err != nil {
		return "", err
	}
	if strings.TrimSpace(payload.AccessToken) == "" {
		return "", fmt.Errorf("failed to get access token: status %d", response.StatusCode)
	}
	return payload.AccessToken, nil
}
