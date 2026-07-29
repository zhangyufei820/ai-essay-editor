const MEDIA_MODEL_PATTERN =
  /(image|gpt-image|banana|midjourney|flux|seedance|sora|kling|veo|video|audio|tts|whisper|speech|voice|embedding|rerank|realtime)/i;

const DEFAULT_TEXT_MODEL = 'gpt-5.4-mini';
const CLAUDE_STABLE_GROUP = 'kiro-stable';
const HIDDEN_TEXT_MODELS = new Set(['gpt-5.3-spark']);
const GROK_TEXT_MODELS = new Set(['grok-4.5']);
const SPECIAL_TEXT_MODELS = new Set([
  'gpt-5.4-mini',
  'gpt-5.5',
  'gpt-5.6',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
]);
const DISCOUNT_TEXT_MODELS = new Set([
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
  'gpt-5.5-openai-compact',
  'gpt-5.6-luna',
  'gpt-5.6',
  'gpt-5.6-terra',
  'gpt-5.6-sol',
  'codex-auto-review',
]);

const PLUS_TEXT_MODELS = new Set([
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-terra',
  'gpt-5.6-sol',
  'codex-auto-review',
]);

const FALLBACK_TEXT_MODELS = [
  DEFAULT_TEXT_MODEL,
  'gpt-5.5',
  'gpt-5.4',
  'claude-sonnet-4-5',
  'gemini-3-pro',
  'deepseek-v3.2',
  'qwen3-max',
  'kimi-k2',
];

const GPT_55_REASONING_EFFORT_OPTIONS = [
  { label: '无', value: 'none' },
  { label: '低', value: 'low' },
  { label: '标准', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '极高', value: 'xhigh' },
];

const REASONING_EFFORT_OPTIONS_BY_MODEL = new Map([
  ['gpt-5.5', GPT_55_REASONING_EFFORT_OPTIONS],
  ['gpt-5.5-openai-compact', GPT_55_REASONING_EFFORT_OPTIONS],
  ['gpt-5.6', GPT_55_REASONING_EFFORT_OPTIONS],
  ['gpt-5.6-sol', GPT_55_REASONING_EFFORT_OPTIONS],
  ['gpt-5.6-terra', GPT_55_REASONING_EFFORT_OPTIONS],
  ['gpt-5.6-luna', GPT_55_REASONING_EFFORT_OPTIONS],
]);

function isHiddenTextModel(modelName) {
  const name = String(modelName || '').trim().toLowerCase();
  return HIDDEN_TEXT_MODELS.has(name);
}

export function isTextModelName(modelName) {
  const name = String(modelName || '').trim();
  if (!name) return false;
  if (isHiddenTextModel(name)) return false;
  if (MEDIA_MODEL_PATTERN.test(name)) return false;
  return true;
}

export function toTextModelOptions(models = []) {
  const source = Array.isArray(models) && models.length > 0 ? models : FALLBACK_TEXT_MODELS;
  return Array.from(new Set(source.map((item) => String(item || '').trim()).filter(Boolean)))
    .filter(isTextModelName)
    .map((model) => ({
      label: model,
      value: model,
    }));
}

export function getDefaultTextModel(models = []) {
  const options = toTextModelOptions(models);
  return options.find((option) => option.value === DEFAULT_TEXT_MODEL)?.value || options[0]?.value || DEFAULT_TEXT_MODEL;
}

export function isTextPricingModel(modelName) {
  const name = String(modelName || '').trim().toLowerCase();
  return DISCOUNT_TEXT_MODELS.has(name);
}

export function getTextModelGroupForPreference(modelName, pricingGroup) {
  const name = String(modelName || '').trim().toLowerCase();
  if (GROK_TEXT_MODELS.has(name)) return 'grok45';
  if (name.startsWith('claude-')) return CLAUDE_STABLE_GROUP;
  const normalizedGroup = String(pricingGroup || '').trim().toLowerCase();
  if (SPECIAL_TEXT_MODELS.has(name) && normalizedGroup === 'special') {
    return normalizedGroup;
  }
  if (
    DISCOUNT_TEXT_MODELS.has(name) &&
    (normalizedGroup === 'discount' || normalizedGroup === 'default')
  ) {
    return normalizedGroup;
  }
  if (PLUS_TEXT_MODELS.has(name) && normalizedGroup === 'plus') {
    return normalizedGroup;
  }
  return '';
}

export function getReasoningEffortOptions(modelName) {
  return REASONING_EFFORT_OPTIONS_BY_MODEL.get(
    String(modelName || '').trim().toLowerCase(),
  ) || [];
}

export function getDefaultReasoningEffort(modelName) {
  return getReasoningEffortOptions(modelName).find(
    (option) => option.value === 'medium',
  )?.value || '';
}

export { DEFAULT_TEXT_MODEL, FALLBACK_TEXT_MODELS };
