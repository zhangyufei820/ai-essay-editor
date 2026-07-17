package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestStableImage2PublicAliasRoundTrip(t *testing.T) {
	normalized, publicAlias, changed := NormalizeImageGenerationModelName(PublicStableImage2ModelName)

	require.True(t, changed)
	require.Equal(t, InternalStableImage2ModelName, normalized)
	require.Equal(t, PublicStableImage2ModelName, publicAlias)
	require.True(t, IsInternalImageModelAllowedByPublicAlias(normalized, publicAlias))
	require.Equal(t, PublicStableImage2ModelName, PublicImageModelDisplayName(normalized, ""))
	require.False(t, ShouldRecordModelMapping(normalized, "gpt-image-2", publicAlias))
}

func TestImage2PublicAliasesDoNotCrossAuthorize(t *testing.T) {
	require.False(t, IsInternalImageModelAllowedByPublicAlias(
		InternalStableImage2ModelName,
		PublicDiscountImage2ModelName,
	))
}
