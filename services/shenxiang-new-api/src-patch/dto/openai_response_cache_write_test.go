package dto

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestInputTokenDetailsUsesOpenAICacheWriteTokens(t *testing.T) {
	var usage Usage
	require.NoError(t, json.Unmarshal([]byte(`{
		"input_tokens_details": {
			"cached_tokens": 90,
			"cached_creation_tokens": 8,
			"cache_write_tokens": 12
		}
	}`), &usage))
	require.NotNil(t, usage.InputTokensDetails)
	require.Equal(t, 12, usage.InputTokensDetails.GetCacheWriteTokens())
	require.Equal(t, 12, usage.InputTokensDetails.CacheCreationTokensTotal())
}

func TestInputTokenDetailsKeepsLegacyCacheCreationTokens(t *testing.T) {
	details := InputTokenDetails{CachedCreationTokens: 8}
	require.Equal(t, 8, details.GetCacheWriteTokens())
	require.Equal(t, 8, details.CacheCreationTokensTotal())
}

func TestInputTokenDetailsCacheCreationTokensTotalClampsNegativeValues(t *testing.T) {
	details := InputTokenDetails{CachedCreationTokens: -1, CacheWriteTokens: -2}

	require.Equal(t, 0, details.CacheCreationTokensTotal())
}

func TestInputTokenDetails12hSplitDoesNotLoseAggregateWrites(t *testing.T) {
	usage := Usage{InputTokensDetails: &InputTokenDetails{CacheWriteTokens: 100, CacheWriteTokensDetails: &CacheWriteTokenDetails{TTL30mTokens: 30, TTL12hTokens: 20}}}
	usage.NormalizeCacheWriteTokens()
	require.Equal(t, 100, usage.PromptTokensDetails.CacheCreationTokensTotal())
	require.Equal(t, 20, usage.PromptTokensDetails.CacheWrite12hTokens())
	legacy := InputTokenDetails{CachedCreationTokens: 100, CacheWriteTokens: 50}
	require.Equal(t, 100, legacy.CacheCreationTokensTotal())
	usage.NormalizeCacheWriteTokens()
	require.Equal(t, 100, usage.PromptTokensDetails.CacheCreationTokensTotal())
}
