const MEDIA_MODEL_PATTERN =
  /(image|gpt-image|banana|midjourney|flux|seedance|sora|kling|veo|video|audio|tts|whisper|speech|voice|embedding|rerank|realtime)/i;

const DEFAULT_TEXT_MODEL = 'gpt-5.4-mini';
const HIDDEN_TEXT_MODELS = new Set(['gpt-5.3-spark']);

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

export { DEFAULT_TEXT_MODEL, FALLBACK_TEXT_MODELS };
