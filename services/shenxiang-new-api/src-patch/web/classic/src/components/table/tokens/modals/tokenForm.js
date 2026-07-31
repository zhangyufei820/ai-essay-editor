export const normalizeTokenExpiryForForm = (expiredTime, formatTimestamp) => {
  const unixSeconds = Number(expiredTime);
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return null;
  }
  return formatTimestamp(unixSeconds);
};

export const expiryFormValueToUnixSeconds = (value) => {
  if (value === null || value === undefined || value === '' || value === -1) {
    return -1;
  }

  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return null;
  }
  return Math.ceil(time / 1000);
};

const EXCLUSIVE_TOKEN_GROUPS = new Set(['welfare', 'welfare-001']);

const TOKEN_GROUP_MODEL_FAMILIES = {
  default: 'ChatGPT',
  discount: 'ChatGPT',
  plus: 'ChatGPT',
  kiro: 'Claude',
  'kiro-stable': 'Claude',
};

export const getTokenGroupDisplayLabel = (group, description) => {
  const label = String(description || group || '').trim();
  const modelFamily = TOKEN_GROUP_MODEL_FAMILIES[group];

  if (!modelFamily || label.toLowerCase().includes(modelFamily.toLowerCase())) {
    return label;
  }
  return `${label} · ${modelFamily}`;
};

export const normalizeTokenGroupSelection = (value) => {
  const groups = (Array.isArray(value) ? value : [value])
    .map((group) => String(group || '').trim())
    .filter(Boolean)
    .filter((group, index, selectedGroups) => {
      return selectedGroups.indexOf(group) === index;
    })
    .slice(0, 3);
  const latestGroup = groups[groups.length - 1];

  if (EXCLUSIVE_TOKEN_GROUPS.has(latestGroup)) {
    return [latestGroup];
  }
  return groups.filter((group) => !EXCLUSIVE_TOKEN_GROUPS.has(group));
};

export const getTokenFormErrorMessage = (error) => {
  const responseMessage = error?.response?.data?.message;
  if (typeof responseMessage === 'string' && responseMessage.trim() !== '') {
    return responseMessage.trim();
  }
  return '令牌保存失败，请重试';
};
