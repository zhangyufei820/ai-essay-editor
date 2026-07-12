package controller

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func signTelegramTestParams(params url.Values, token string) {
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
	params.Set("hash", hex.EncodeToString(mac.Sum(nil)))
}

func TestCheckTelegramAuthorizationRejectsStaleOrMalformedPayloads(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	token := "telegram-test-token"
	base := func(authDate string) url.Values {
		params := url.Values{
			"id":         {"12345"},
			"first_name": {"Test"},
			"auth_date":  {authDate},
			"state":      {"browser-bound-state"},
		}
		signTelegramTestParams(params, token)
		return params
	}

	tests := []struct {
		name   string
		params url.Values
		want   bool
	}{
		{name: "fresh", params: base("1800000000"), want: true},
		{name: "within clock skew", params: base("1800000030"), want: true},
		{name: "expired", params: base("1799999399"), want: false},
		{name: "far future", params: base("1800000061"), want: false},
		{name: "missing auth date", params: base(""), want: false},
		{name: "invalid auth date", params: base("not-a-time"), want: false},
		{name: "missing id", params: base("1800000000"), want: false},
		{name: "missing hash", params: base("1800000000"), want: false},
	}
	tests[6].params.Del("id")
	tests[7].params.Del("hash")

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			require.Equal(t, test.want, checkTelegramAuthorizationAt(test.params, token, now))
		})
	}
}

func TestCheckTelegramAuthorizationRejectsDuplicateValues(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	params := url.Values{
		"id":        {"12345"},
		"auth_date": {"1800000000"},
	}
	signTelegramTestParams(params, "telegram-test-token")
	params["id"] = append(params["id"], "67890")

	require.False(t, checkTelegramAuthorizationAt(params, "telegram-test-token", now))
}
