package service

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestGpt62CacheWriteBreakdownPreservesLegacyExpressions(t *testing.T) {
	var usage dto.Usage
	require.NoError(t, json.Unmarshal([]byte(`{"prompt_tokens":272001,"completion_tokens":10,"input_tokens_details":{"cache_write_tokens_details":{"ttl_30m_tokens":30000,"ttl_12h_tokens":20000}}}`), &usage))
	usage.NormalizeCacheWriteTokens()
	require.Equal(t, 50000, usage.PromptTokensDetails.CacheCreationTokensTotal())
	split := BuildTieredTokenParams(&usage, false, map[string]bool{"cc": true, "cc12h": true})
	require.Equal(t, 30000.0, split.CC)
	require.Equal(t, 20000.0, split.CC12h)
	require.Equal(t, 222001.0, split.P)
	require.Equal(t, 272001.0, split.Len)
	legacy := BuildTieredTokenParams(&usage, false, map[string]bool{"cc": true})
	require.Equal(t, 50000.0, legacy.CC)
	require.Zero(t, legacy.CC12h)
	require.Equal(t, split.P, legacy.P)
	// Explicit 12h counts are not inferred from the request's TTL hint.
	ordinary := dto.Usage{PromptTokens: 100, PromptTokensDetails: dto.InputTokenDetails{CacheWriteTokens: 50}}
	require.Zero(t, BuildTieredTokenParams(&ordinary, false, map[string]bool{"cc": true, "cc12h": true}).CC12h)
}
