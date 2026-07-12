/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

export function setStatusData(data) {
  localStorage.setItem('status', JSON.stringify(data));
  localStorage.setItem('system_name', data.system_name);
  localStorage.setItem('logo', data.logo);
  localStorage.setItem('footer_html', data.footer_html);
  localStorage.setItem('quota_per_unit', data.quota_per_unit);
  // 兼容：保留旧字段，同时写入新的额度展示类型
  localStorage.setItem('display_in_currency', data.display_in_currency);
  localStorage.setItem('quota_display_type', data.quota_display_type || 'CNY');
  localStorage.setItem('enable_drawing', data.enable_drawing);
  localStorage.setItem('enable_task', data.enable_task);
  localStorage.setItem('enable_data_export', data.enable_data_export);
  localStorage.setItem('chats', JSON.stringify(data.chats));
  localStorage.setItem(
    'data_export_default_time',
    data.data_export_default_time,
  );
  localStorage.setItem(
    'default_collapse_sidebar',
    data.default_collapse_sidebar,
  );
  localStorage.setItem('mj_notify_enabled', data.mj_notify_enabled);
  if (data.chat_link) {
    // localStorage.setItem('chat_link', data.chat_link);
  } else {
    localStorage.removeItem('chat_link');
  }
  if (data.chat_link2) {
    // localStorage.setItem('chat_link2', data.chat_link2);
  } else {
    localStorage.removeItem('chat_link2');
  }
  if (data.docs_link) {
    localStorage.setItem('docs_link', data.docs_link);
  } else {
    localStorage.removeItem('docs_link');
  }
}

export function setUserData(data) {
  localStorage.setItem('user', JSON.stringify(data));
}

const SAFE_PAYMENT_PROTOCOLS = new Set(['http:', 'https:']);
const SAFE_MEDIA_PROTOCOLS = new Set(['http:', 'https:']);
const SAFE_MEDIA_DATA_URL =
  /^data:(?:image\/(?:gif|jpeg|png|webp)|video\/(?:mp4|quicktime|webm|x-m4v)|audio\/(?:aac|mp4|mpeg|wav|x-wav));base64,/i;

export function getSafePaymentUrl(value, baseUrl = '') {
  const candidate = String(value || '').trim();
  if (!candidate) return '';

  try {
    const parsed = baseUrl ? new URL(candidate, baseUrl) : new URL(candidate);
    return SAFE_PAYMENT_PROTOCOLS.has(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

export function openPaymentPage(value, runtime = globalThis.window) {
  const safeUrl = getSafePaymentUrl(value, runtime?.location?.href || '');
  if (!safeUrl || typeof runtime?.open !== 'function') return false;

  const opened = runtime.open(safeUrl, '_blank', 'noopener,noreferrer');
  if (opened && typeof opened === 'object') opened.opener = null;
  return true;
}

export function getSafeMediaUrl(value, baseUrl = '') {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  if (SAFE_MEDIA_DATA_URL.test(candidate)) return candidate;

  try {
    const parsed = baseUrl ? new URL(candidate, baseUrl) : new URL(candidate);
    if (SAFE_MEDIA_PROTOCOLS.has(parsed.protocol)) return parsed.href;
    if (parsed.protocol !== 'blob:' || !baseUrl) return '';
    const base = new URL(baseUrl);
    return parsed.origin === base.origin ? parsed.href : '';
  } catch {
    return '';
  }
}

export function openMediaPage(value, runtime = globalThis.window) {
  const safeUrl = getSafeMediaUrl(value, runtime?.location?.href || '');
  if (!safeUrl || typeof runtime?.open !== 'function') return false;

  const opened = runtime.open(safeUrl, '_blank', 'noopener,noreferrer');
  if (opened && typeof opened === 'object') opened.opener = null;
  return true;
}

export function navigateToPaymentPage(value, runtime = globalThis.window) {
  const safeUrl = getSafePaymentUrl(value, runtime?.location?.href || '');
  if (!safeUrl || !runtime?.location) return false;

  if (typeof runtime.location.assign === 'function') {
    runtime.location.assign(safeUrl);
  } else {
    runtime.location.href = safeUrl;
  }
  return true;
}

export function submitPaymentForm(
  { url, params },
  runtime = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
  },
) {
  const browserWindow = runtime?.window;
  const documentValue = runtime?.document;
  const safeUrl = getSafePaymentUrl(url, browserWindow?.location?.href || '');
  if (!safeUrl || typeof documentValue?.createElement !== 'function')
    return false;

  const form = documentValue.createElement('form');
  form.action = safeUrl;
  form.method = 'POST';
  form.rel = 'noopener noreferrer';
  const userAgent = String(runtime?.navigator?.userAgent || '');
  const isSafari =
    userAgent.includes('Safari') && !userAgent.includes('Chrome');
  if (!isSafari) form.target = '_blank';

  Object.entries(params || {}).forEach(([key, value]) => {
    const input = documentValue.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = String(value ?? '');
    form.appendChild(input);
  });

  try {
    documentValue.body.appendChild(form);
    form.submit();
    return true;
  } finally {
    form.remove();
  }
}
