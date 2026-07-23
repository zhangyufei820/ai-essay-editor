package service

import (
	"context"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
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
		"grok-video-1.5-1080p",
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
	require.NotContains(t, imageModels, InternalDiscountImage2ModelName)
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
	require.Contains(t, codexModels, "gpt-5.6-luna")
	require.Contains(t, codexModels, "gpt-5.6-terra")
	require.Contains(t, codexModels, "gpt-5.6-sol")
	require.Contains(t, codexModels, "gpt-5.5-openai-compact")
	require.Contains(t, codexModels, "codex-auto-review")
	require.NotContains(t, codexModels, "特价 image-2")
	require.NotContains(t, codexModels, "官转image 2稳定")
	require.Contains(t, codexModels, "image 2电商商品图快速通道(1.5K)")
	require.NotContains(t, codexModels, "gpt-image-2-4K")
	require.NotContains(t, codexModels, "geek2api-image-2")
}

func TestSystemTokenProfilesClaudeModelsMatchExternalChannel(t *testing.T) {
	var claudeModels []string
	var claudeGroup string
	for _, profile := range SystemTokenProfiles() {
		if profile.Mode == "claude" {
			claudeModels = profile.Models
			claudeGroup = profile.Group
			break
		}
	}

	require.Equal(t, []string{
		"claude-fable-5",
		"claude-haiku-4-5-20251001",
		"claude-opus-4-6",
		"claude-opus-4-7",
		"claude-opus-4-8",
		"claude-sonnet-4-6",
		"claude-sonnet-5",
	}, claudeModels)
	require.Equal(t, ClaudeExternalPricingGroupName, claudeGroup)
	require.NotContains(t, claudeModels, "claude-opus-4-5-20251101")
	require.NotContains(t, claudeModels, "claude-sonnet-4-5-20250929")
}

func TestMergeModelLimitsCanonicalizesRawGPTImage2(t *testing.T) {
	limits := mergeModelLimits("gpt-5.5,gpt-image-2,gpt-image-2-4K", []string{"gpt-image-2-4K"})

	require.Equal(t, "gpt-5.5,gpt-image-2-4K", limits)
}

func TestEnsureSystemTokensForCommonUserCreatesPublicProfilesOnly(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	userID := AdminSystemTokenUserID + 200
	require.NoError(t, model.DB.Create(&model.User{
		Id:       userID,
		Username: "system-token-common-user",
		AffCode:  "system-token-common-user-aff",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}).Error)

	result, err := EnsureSystemTokensForUserID(context.Background(), userID)

	require.NoError(t, err)
	require.Equal(t, userID, result.UserID)
	require.Equal(t, 4, result.Created)
	require.Zero(t, result.Updated)
	require.Zero(t, result.Skipped)
	var tokens []model.Token
	require.NoError(t, model.DB.Where("user_id = ?", userID).Order("name").Find(&tokens).Error)
	require.Len(t, tokens, 4)
	for _, token := range tokens {
		require.NotEqual(t, Grok45AdminTokenName, token.Name)
		require.Equal(t, common.TokenStatusEnabled, token.Status)
		require.True(t, token.ModelLimitsEnabled)
	}
}

func TestEnsureSystemTokensPreservesPublicClaudeGroupAndRepairsModelLimits(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	userID := AdminSystemTokenUserID + 201
	require.NoError(t, model.DB.Create(&model.User{
		Id:       userID,
		Username: "system-token-claude-group-user",
		AffCode:  "system-token-claude-group-user-aff",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}).Error)

	_, err := EnsureSystemTokensForUserID(context.Background(), userID)
	require.NoError(t, err)

	var token model.Token
	require.NoError(t, model.DB.Where("user_id = ? AND name = ?", userID, SystemClaudeTokenName).First(&token).Error)
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", token.Id).Updates(map[string]interface{}{
		"group":             ClaudeKiroPricingGroupName,
		"model_limits":      "claude-haiku-4-5-20251001",
		"cross_group_retry": true,
	}).Error)

	result, err := EnsureSystemTokensForUserID(context.Background(), userID)

	require.NoError(t, err)
	require.Equal(t, 1, result.Updated)
	require.NoError(t, model.DB.First(&token, token.Id).Error)
	models, ok := PublicClaudeTokenModels(ClaudeKiroPricingGroupName)
	require.True(t, ok)
	require.Equal(t, ClaudeKiroPricingGroupName, token.Group)
	require.Equal(t, strings.Join(models, ","), token.ModelLimits)
	require.False(t, token.CrossGroupRetry)
}

func TestEnsureSystemTokensPreservesPublicClaudeGroupChainAndMergesModels(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	userID := AdminSystemTokenUserID + 203
	require.NoError(t, model.DB.Create(&model.User{
		Id:       userID,
		Username: "system-token-claude-chain-user",
		AffCode:  "system-token-claude-chain-user-aff",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}).Error)

	_, err := EnsureSystemTokensForUserID(context.Background(), userID)
	require.NoError(t, err)

	var token model.Token
	require.NoError(t, model.DB.Where("user_id = ? AND name = ?", userID, SystemClaudeTokenName).First(&token).Error)
	groupChain := ClaudeKiroPricingGroupName + "," + ClaudeExternalPricingGroupName
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", token.Id).Updates(map[string]interface{}{
		"group":        groupChain,
		"model_limits": "claude-sonnet-5",
	}).Error)

	result, err := EnsureSystemTokensForUserID(context.Background(), userID)

	require.NoError(t, err)
	require.Equal(t, 1, result.Updated)
	require.NoError(t, model.DB.First(&token, token.Id).Error)
	models, ok := PublicClaudeTokenModelsForGroupChain(groupChain)
	require.True(t, ok)
	require.Equal(t, groupChain, token.Group)
	require.Equal(t, strings.Join(models, ","), token.ModelLimits)
}

func TestEnsureSystemTokensPreservesManagedCodexGroupChain(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	userID := AdminSystemTokenUserID + 204
	require.NoError(t, model.DB.Create(&model.User{
		Id:       userID,
		Username: "system-token-codex-chain-user",
		AffCode:  "system-token-codex-chain-user-aff",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}).Error)

	_, err := EnsureSystemTokensForUserID(context.Background(), userID)
	require.NoError(t, err)
	var token model.Token
	require.NoError(t, model.DB.Where("user_id = ? AND name = ?", userID, "星人 Codex 文本令牌").First(&token).Error)
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", token.Id).Update("group", "default,discount,plus").Error)

	result, err := EnsureSystemTokensForUserID(context.Background(), userID)

	require.NoError(t, err)
	require.NoError(t, model.DB.First(&token, token.Id).Error)
	require.Equal(t, "default,discount,plus", token.Group)
	require.Zero(t, result.Updated)
}

func TestEnsureSystemTokensRepairsInvalidClaudeGroupToDefault(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	userID := AdminSystemTokenUserID + 202
	require.NoError(t, model.DB.Create(&model.User{
		Id:       userID,
		Username: "system-token-invalid-claude-group-user",
		AffCode:  "system-token-invalid-claude-group-user-aff",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}).Error)

	_, err := EnsureSystemTokensForUserID(context.Background(), userID)
	require.NoError(t, err)

	var token model.Token
	require.NoError(t, model.DB.Where("user_id = ? AND name = ?", userID, SystemClaudeTokenName).First(&token).Error)
	require.NoError(t, model.DB.Model(&model.Token{}).Where("id = ?", token.Id).Update("group", "internal").Error)

	result, err := EnsureSystemTokensForUserID(context.Background(), userID)

	require.NoError(t, err)
	require.Equal(t, 1, result.Updated)
	require.NoError(t, model.DB.First(&token, token.Id).Error)
	require.Equal(t, ClaudeExternalPricingGroupName, token.Group)
}

func TestReconcileUserSystemTokensForEnabledUsersBackfillsAndIsIdempotent(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	require.NoError(t, model.DB.Create(&[]model.User{
		{
			Id:       301,
			Username: "enabled-system-token-user",
			AffCode:  "enabled-system-token-user-aff",
			Role:     common.RoleCommonUser,
			Status:   common.UserStatusEnabled,
			Group:    "default",
		},
		{
			Id:       302,
			Username: "disabled-system-token-user",
			AffCode:  "disabled-system-token-user-aff",
			Role:     common.RoleCommonUser,
			Status:   common.UserStatusDisabled,
			Group:    "default",
		},
	}).Error)

	result, err := ReconcileUserSystemTokensForEnabledUsers(context.Background())

	require.NoError(t, err)
	require.Equal(t, 1, result.UsersScanned)
	require.Equal(t, 4, result.Created)
	require.Zero(t, result.Updated)
	require.Zero(t, result.Failed)
	var enabledTokenCount int64
	require.NoError(t, model.DB.Model(&model.Token{}).Where("user_id = ?", 301).Count(&enabledTokenCount).Error)
	require.EqualValues(t, 4, enabledTokenCount)
	var disabledTokenCount int64
	require.NoError(t, model.DB.Model(&model.Token{}).Where("user_id = ?", 302).Count(&disabledTokenCount).Error)
	require.Zero(t, disabledTokenCount)

	secondResult, err := ReconcileUserSystemTokensForEnabledUsers(context.Background())
	require.NoError(t, err)
	require.Equal(t, 1, secondResult.UsersScanned)
	require.Zero(t, secondResult.Created)
	require.Zero(t, secondResult.Updated)
	require.Equal(t, 4, secondResult.Skipped)
	require.Zero(t, secondResult.Failed)
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

	require.Equal(t, Grok45ModelName, systemTokenModelLimits("gpt-5.5,"+Grok45ModelName, profile, profile.Models))
}

func TestSystemTokenProfilesReconcilePreservesExternallyManagedModelLimitsExceptClaude(t *testing.T) {
	setupGrok45EntitlementTestDB(t)
	require.NoError(t, model.DB.Create(&model.User{
		Id:       AdminSystemTokenUserID,
		Username: "system-token-admin",
		AffCode:  "system-token-admin-aff",
		Role:     common.RoleRootUser,
		Status:   common.UserStatusEnabled,
		Group:    "internal",
	}).Error)

	for _, profile := range SystemTokenProfiles() {
		group := "internal"
		limits := "externally-managed-" + profile.Mode
		if profile.Mode == "grok" {
			group = Grok45PricingGroupName
			limits = Grok45ModelName
		} else if profile.Mode == "claude" {
			group = ClaudeExternalPricingGroupName
		}
		require.NoError(t, model.DB.Create(&model.Token{
			UserId:             AdminSystemTokenUserID,
			Key:                "system-token-" + profile.Mode,
			Status:             common.TokenStatusEnabled,
			Name:               profile.Name,
			ExpiredTime:        -1,
			UnlimitedQuota:     true,
			ModelLimitsEnabled: true,
			ModelLimits:        limits,
			Group:              group,
			CrossGroupRetry:    profile.Mode != "codex" && profile.Mode != "grok" && profile.Mode != "claude",
		}).Error)
	}

	result, err := EnsureSystemTokensForUserID(context.Background(), AdminSystemTokenUserID)
	require.NoError(t, err)
	require.Zero(t, result.Created)
	require.Equal(t, 1, result.Updated)
	require.Equal(t, len(SystemTokenProfiles())-1, result.Skipped)

	for _, profile := range SystemTokenProfiles() {
		if profile.Mode == "grok" {
			continue
		}
		var token model.Token
		require.NoError(t, model.DB.Where("user_id = ? AND name = ?", AdminSystemTokenUserID, profile.Name).First(&token).Error)
		if profile.Mode == "claude" {
			require.Equal(t, strings.Join(profile.Models, ","), token.ModelLimits)
			continue
		}
		require.Equal(t, "externally-managed-"+profile.Mode, token.ModelLimits)
	}
}
