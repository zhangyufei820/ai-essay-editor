export type FreeTrialFlagKey =
  | "campaignEnabled"
  | "batchGrantEnabled"
  | "consumptionEnabled"

export type FreeTrialFlags = Record<FreeTrialFlagKey, boolean>

function readBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") return defaultValue
  return value.trim().toLowerCase() !== "false"
}

export function getFreeTrialFlags(): FreeTrialFlags {
  return {
    campaignEnabled: readBooleanFlag(process.env.NEXT_PUBLIC_FREE_TRIAL_CAMPAIGN_ENABLED, true),
    batchGrantEnabled: readBooleanFlag(process.env.FREE_TRIAL_BATCH_GRANT_ENABLED, true),
    consumptionEnabled: readBooleanFlag(process.env.FREE_TRIAL_CONSUMPTION_ENABLED, true),
  }
}

export function isFreeTrialCampaignEnabled(): boolean {
  return getFreeTrialFlags().campaignEnabled
}

export function isFreeTrialBatchGrantEnabled(): boolean {
  return getFreeTrialFlags().batchGrantEnabled
}

export function isFreeTrialConsumptionEnabled(): boolean {
  return getFreeTrialFlags().consumptionEnabled
}
