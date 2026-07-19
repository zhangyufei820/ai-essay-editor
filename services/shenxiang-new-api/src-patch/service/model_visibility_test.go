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

func TestDiscountImage2PublicAliasRoundTrip(t *testing.T) {
	normalized, publicAlias, changed := NormalizeImageGenerationModelName(PublicDiscountImage2ModelName)

	require.True(t, changed)
	require.Equal(t, InternalDiscountImage2ModelName, normalized)
	require.Equal(t, PublicDiscountImage2ModelName, publicAlias)
	require.True(t, IsInternalImageModelAllowedByPublicAlias(normalized, publicAlias))
	require.Equal(t, PublicDiscountImage2ModelName, PublicImageModelDisplayName(normalized, ""))
	require.False(t, ShouldRecordModelMapping(normalized, "gpt-image-2", publicAlias))
}

func TestImage2PublicAliasesDoNotCrossAuthorize(t *testing.T) {
	require.False(t, IsInternalImageModelAllowedByPublicAlias(
		InternalStableImage2ModelName,
		PublicDiscountImage2ModelName,
	))
	require.False(t, IsInternalImageModelAllowedByPublicAlias(
		InternalDiscountImage2ModelName,
		PublicStableImage2ModelName,
	))
}

func TestOnlyLegacyDiscountImage2NameIsRetired(t *testing.T) {
	require.False(t, IsRetiredImageModelName(PublicDiscountImage2ModelName))
	require.False(t, IsRetiredImageModelName(InternalDiscountImage2ModelName))
	require.True(t, IsRetiredImageModelName(RetiredDiscountImage2ModelName))
	require.False(t, IsRetiredImageModelName(PublicStableImage2ModelName))
}
