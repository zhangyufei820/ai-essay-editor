package controller

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestRetiredTextModelsAreHiddenFromPublicCatalogs(t *testing.T) {
	for _, model := range []string{"gpt-5.5", "gpt-5.6", " GPT-5.6 "} {
		require.True(t, isHiddenUserVisibleModel(model))
	}
	for _, model := range []string{"gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.5-openai-compact", "gpt-6.1-sol"} {
		require.False(t, isHiddenUserVisibleModel(model))
	}
}
