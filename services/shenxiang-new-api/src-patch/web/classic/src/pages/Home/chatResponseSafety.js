export const HOME_CHAT_RESPONSE_HEADER_TIMEOUT_MS = 85_000;
export const HOME_CHAT_TIMEOUT_MESSAGE = '模型服务响应超时，请稍后重试。';
export const HOME_CHAT_GENERIC_FAILURE_MESSAGE =
  '模型服务暂时不可用，请稍后重试。';

const HOME_CHAT_BUSY_MESSAGE = '当前请求较多，请稍后重试。';
const HOME_CHAT_AUTH_MESSAGE = '登录状态或模型权限已失效，请刷新页面后重试。';
const HOME_CHAT_INVALID_RESPONSE_MESSAGE = '模型服务返回了不可识别的响应。';
const MAX_PUBLIC_ERROR_LENGTH = 240;
const HTML_CONTENT_PATTERN =
  /<!doctype\s+html|<(?:html|head|body|script|style|meta|title|div|span|p|a|ul|ol|li|button)\b|\bcf-error\b/i;
const EDGE_TIMEOUT_PATTERN =
  /cloudflare|cf-ray|ray id|error\s*(?:code\s*)?52[24]\b|connection timed out|upstream request timeout|response timeout/i;
const PUBLIC_ERROR_FIELD_PATTERN = /^[a-z0-9._:-]{1,80}$/i;

function getPublicErrorField(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = typeof value === 'string' ? value.trim() : '';
  return PUBLIC_ERROR_FIELD_PATTERN.test(normalized) ? normalized : undefined;
}

export function isJsonChatContentType(contentType = '') {
  const normalized = String(contentType).toLowerCase();
  return (
    normalized.includes('application/json') || normalized.includes('+json')
  );
}

export function isEventStreamChatContentType(contentType = '') {
  return String(contentType).toLowerCase().includes('text/event-stream');
}

export function isSupportedChatSuccessContentType(contentType = '') {
  const normalized = String(contentType).trim();
  return (
    !normalized ||
    isJsonChatContentType(normalized) ||
    isEventStreamChatContentType(normalized)
  );
}

export function isHtmlLikeChatResponse(contentType = '', text = '') {
  return (
    String(contentType).toLowerCase().includes('text/html') ||
    HTML_CONTENT_PATTERN.test(String(text))
  );
}

export function getPublicChatStatusMessage(status = 0, text = '') {
  const numericStatus = Number(status) || 0;
  if (
    numericStatus === 408 ||
    numericStatus === 504 ||
    numericStatus === 524 ||
    EDGE_TIMEOUT_PATTERN.test(String(text))
  ) {
    return HOME_CHAT_TIMEOUT_MESSAGE;
  }
  if (numericStatus === 429) return HOME_CHAT_BUSY_MESSAGE;
  if (numericStatus === 401 || numericStatus === 403)
    return HOME_CHAT_AUTH_MESSAGE;
  if (numericStatus >= 500) return HOME_CHAT_GENERIC_FAILURE_MESSAGE;
  return HOME_CHAT_INVALID_RESPONSE_MESSAGE;
}

export function sanitizePublicChatMessage(value, status = 0) {
  const raw = String(value || '').trim();
  if (!raw) return getPublicChatStatusMessage(status);
  if (EDGE_TIMEOUT_PATTERN.test(raw)) return HOME_CHAT_TIMEOUT_MESSAGE;
  if (HTML_CONTENT_PATTERN.test(raw))
    return getPublicChatStatusMessage(status, raw);

  const cleaned = raw
    .replace(/https?:\/\/[^\s<>"')\]]+/gi, '模型服务')
    .replace(/上游|供应商|接口地址/g, '模型服务')
    .replace(/\b(?:upstream|supplier|provider)\b/gi, '模型服务')
    .replace(/\bapi\b/gi, '服务')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length > MAX_PUBLIC_ERROR_LENGTH) {
    return getPublicChatStatusMessage(status);
  }
  return cleaned;
}

export function resolveChatErrorBody({
  status = 0,
  contentType = '',
  text = '',
} = {}) {
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  const rawMessage = payload?.error?.message || payload?.message || '';
  const message = isHtmlLikeChatResponse(contentType, text)
    ? getPublicChatStatusMessage(status, text)
    : rawMessage
      ? sanitizePublicChatMessage(rawMessage, status)
      : getPublicChatStatusMessage(status, text);

  if (!payload || typeof payload !== 'object')
    return { message, data: { message } };

  const data = { message };
  const code = getPublicErrorField(payload.code);
  const type = getPublicErrorField(payload.type);
  if (code !== undefined) data.code = code;
  if (type !== undefined) data.type = type;
  if (payload.error && typeof payload.error === 'object') {
    data.error = { message };
    const errorCode = getPublicErrorField(payload.error.code);
    const errorType = getPublicErrorField(payload.error.type);
    if (errorCode !== undefined) data.error.code = errorCode;
    if (errorType !== undefined) data.error.type = errorType;
  }
  return { message, data };
}
