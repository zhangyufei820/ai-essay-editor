package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSystemTokenProfilesIncludesCallablePublicVideoModels(t *testing.T) {
	var videoModels []string
	for _, profile := range SystemTokenProfiles() {
		if profile.Mode == "video" {
			videoModels = profile.Models
			break
		}
	}

	require.Equal(t, []string{
		"grok-video-super-720p",
		"seedance-2.0-ld-17",
		"seedance-sd2-fast-720p",
		"grok-video-1.5",
	}, videoModels)
	require.NotContains(t, videoModels, "seedance-2.0")
	require.NotContains(t, videoModels, "seedance-nsfw")
	require.NotContains(t, videoModels, "seedance-2.0-kz-fast")
	require.NotContains(t, videoModels, "seedance-2.0-cl-fast")
	require.NotContains(t, videoModels, "seedance-2.0-cl")
}

func TestSystemTokenProfilesImageModelsDoNotExposeSupplierModel(t *testing.T) {
	var imageModels []string
	for _, profile := range SystemTokenProfiles() {
		if profile.Mode == "image" {
			imageModels = profile.Models
			break
		}
	}

	require.Contains(t, imageModels, "gpt-image-2-4K")
	require.Contains(t, imageModels, "特价 image-2")
	require.Contains(t, imageModels, "官转image 2稳定")
	require.Contains(t, imageModels, "image 2电商商品图快速通道(1.5K)")
	require.NotContains(t, imageModels, "geek2api-image-2")
}

func TestSystemTokenProfilesCodexTextIncludesPublicImageModels(t *testing.T) {
	var codexModels []string
	for _, profile := range SystemTokenProfiles() {
		if profile.Mode == "codex" {
			codexModels = profile.Models
			break
		}
	}

	require.Contains(t, codexModels, "gpt-5.5")
	require.Contains(t, codexModels, "特价 image-2")
	require.Contains(t, codexModels, "官转image 2稳定")
	require.Contains(t, codexModels, "image 2电商商品图快速通道(1.5K)")
	require.NotContains(t, codexModels, "gpt-image-2-4K")
	require.NotContains(t, codexModels, "geek2api-image-2")
}

func TestMergeModelLimitsCanonicalizesRawGPTImage2(t *testing.T) {
	limits := mergeModelLimits("gpt-5.5,gpt-image-2,gpt-image-2-4K", []string{"gpt-image-2-4K"})

	require.Equal(t, "gpt-5.5,gpt-image-2-4K", limits)
}

func TestEnsureSystemTokensRejectsNonAdminUser(t *testing.T) {
	result, err := EnsureSystemTokensForUserID(context.Background(), AdminSystemTokenUserID+1)

	require.Error(t, err)
	require.Contains(t, err.Error(), "restricted to admin user 1")
	require.Equal(t, AdminSystemTokenUserID+1, result.UserID)
	require.Zero(t, result.Created)
	require.Zero(t, result.Updated)
	require.Zero(t, result.Skipped)
}

func TestSystemTokenProfilesIncludesIsolatedGrok45Token(t *testing.T) {
	var grokProfile *SystemTokenProfile
	for _, profile := range SystemTokenProfiles() {
		if profile.Mode == "grok" {
			profileCopy := profile
			grokProfile = &profileCopy
			break
		}
	}

	require.NotNil(t, grokProfile)
	require.Equal(t, "星人 Grok 4.5 测试令牌", grokProfile.Name)
	require.Equal(t, []string{Grok45ModelName}, grokProfile.Models)
	require.Equal(t, Grok45PricingGroupName, grokProfile.Group)
}

func TestGrok45SystemTokenLimitsAreReconciledExactly(t *testing.T) {
	profile := SystemTokenProfile{
		Mode:   "grok",
		Models: []string{Grok45ModelName},
		Group:  Grok45PricingGroupName,
	}

	require.Equal(t, Grok45ModelName, systemTokenModelLimits("gpt-5.5,"+Grok45ModelName, profile))
}
