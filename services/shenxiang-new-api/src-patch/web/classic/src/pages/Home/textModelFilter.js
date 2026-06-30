const MEDIA_MODEL_PATTERN =
  /(image|gpt-image|banana|midjourney|flux|seedance|sora|kling|veo|video|audio|tts|whisper|speech|voice|embedding|rerank|realtime)/i;

const FALLBACK_TEXT_MODELS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'claude-sonnet-4-5',
  'gemini-3-pro',
  'deepseek-v3.2',
  'qwen3-max',
  'kimi-k2',
];

export function isTextModelName(modelName) {
  const name = String(modelName || '').trim();
  if (!name) return false;
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
  return options[0]?.value || FALLBACK_TEXT_MODELS[0];
}

export { FALLBACK_TEXT_MODELS };
