package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestGetFullRequestURLTrimsDuplicateOpenAIV1(t *testing.T) {
	require.Equal(
		t,
		"https://dragtokens.com/v1/responses",
		GetFullRequestURL("https://dragtokens.com/v1", "/v1/responses", constant.ChannelTypeOpenAI),
	)
	require.Equal(
		t,
		"https://dragtokens.com/v1/chat/completions",
		GetFullRequestURL("https://dragtokens.com/v1/", "/v1/chat/completions", constant.ChannelTypeOpenAI),
	)
}

func TestGetFullRequestURLKeepsOpenAIBaseWithoutV1(t *testing.T) {
	require.Equal(
		t,
		"https://dragtokens.com/v1/responses",
		GetFullRequestURL("https://dragtokens.com", "/v1/responses", constant.ChannelTypeOpenAI),
	)
}

func TestGetFullRequestURLKeepsCloudflareGatewaySpecialCase(t *testing.T) {
	require.Equal(
		t,
		"https://gateway.ai.cloudflare.com/v1/account/gateway/openai/responses",
		GetFullRequestURL(
			"https://gateway.ai.cloudflare.com/v1/account/gateway/openai",
			"/v1/responses",
			constant.ChannelTypeOpenAI,
		),
	)
	require.Equal(
		t,
		"https://gateway.ai.cloudflare.com/v1/account/gateway/azure/chat/completions",
		GetFullRequestURL(
			"https://gateway.ai.cloudflare.com/v1/account/gateway/azure",
			"/openai/deployments/chat/completions",
			constant.ChannelTypeAzure,
		),
	)
}
