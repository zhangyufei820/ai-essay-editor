package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestGetFullRequestURLDeduplicatesOpenAIBaseV1(t *testing.T) {
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
