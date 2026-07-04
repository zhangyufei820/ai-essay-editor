package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
)

func TestNormalizeUserVisibleModelsAddsSeedancePrivateVideoForRootUser(t *testing.T) {
	models := normalizeUserVisibleModels(1, []string{"grok-video-super-720p", "seedance-2.0"})

	require.Contains(t, models, "seedance-nsfw")
	require.Equal(t, []string{"grok-video-super-720p", "seedance-2.0", "seedance-nsfw"}, models)
}

func TestNormalizeUserVisibleModelsRemovesSeedancePrivateVideoForOtherUsers(t *testing.T) {
	models := normalizeUserVisibleModels(2, []string{"seedance-nsfw", "seedance-2.0", "seedance-nsfw"})

	require.NotContains(t, models, "seedance-nsfw")
	require.Equal(t, []string{"seedance-2.0"}, models)
}

func TestNormalizeUserVisibleModelsHidesClaudeFastAndFullGroups(t *testing.T) {
	models := normalizeUserVisibleModels(2, []string{
		"claude-sonnet-4-5-20250929-fast",
		"claude-sonnet-4-5-20250929-full",
		"claude sonnet 4 5 20250929 fast",
		"claude_sonnet_4_5_20250929_full",
		"claude-sonnet-4-5-20250929",
		"seedance-2.0-dj-fast",
	})

	require.Equal(t, []string{"claude-sonnet-4-5-20250929", "seedance-2.0-dj-fast"}, models)
}

func TestFilterUserVisibleModelNamesHidesSeedancePrivateVideoForNonRootUsers(t *testing.T) {
	models := filterUserVisibleModelNames(2, []string{
		"seedance-nsfw",
		"seedance-2.0-dj-fast",
		"seedance-2.0-ld-17",
	})

	require.Equal(t, []string{"seedance-2.0-dj-fast", "seedance-2.0-ld-17"}, models)
}

func TestRegistrationBonusQuotaForCNYConvertsFiveYuan(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	oldExchangeRate := operation_setting.USDExchangeRate
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 7.3
	defer func() {
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.USDExchangeRate = oldExchangeRate
	}()

	require.Equal(t, 342466, registrationBonusQuotaForCNY(5))
}

func TestRegistrationBonusQuotaForCNYDoesNotGrantWhenExchangeRateInvalid(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	oldExchangeRate := operation_setting.USDExchangeRate
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 0
	defer func() {
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.USDExchangeRate = oldExchangeRate
	}()

	require.Equal(t, 0, registrationBonusQuotaForCNY(5))
}
