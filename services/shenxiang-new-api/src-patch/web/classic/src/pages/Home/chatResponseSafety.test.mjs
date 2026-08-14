import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOME_CHAT_GENERIC_FAILURE_MESSAGE,
  HOME_CHAT_RESPONSE_HEADER_TIMEOUT_MS,
  HOME_CHAT_TIMEOUT_MESSAGE,
  isSupportedChatSuccessContentType,
  resolveChatErrorBody,
  sanitizePublicChatMessage,
} from './chatResponseSafety.js';

test('Cloudflare HTML timeout becomes a short public timeout message', () => {
  const html = `<!doctype html><html><body><div class="cf-error-footer">Cloudflare Ray ID</div></body></html>`;
  const result = resolveChatErrorBody({
    status: 524,
    contentType: 'text/html; charset=UTF-8',
    text: html,
  });

  assert.equal(result.message, HOME_CHAT_TIMEOUT_MESSAGE);
  assert.deepEqual(result.data, { message: HOME_CHAT_TIMEOUT_MESSAGE });
  assert.doesNotMatch(
    JSON.stringify(result.data),
    /<html|Cloudflare|cf-error/i,
  );
});

test('unknown non-JSON error bodies are never shown verbatim', () => {
  const raw =
    'request failed at https://private.example.test/v1 with provider details';
  const result = resolveChatErrorBody({
    status: 500,
    contentType: 'text/plain',
    text: raw,
  });

  assert.equal(result.message, HOME_CHAT_GENERIC_FAILURE_MESSAGE);
  assert.doesNotMatch(
    JSON.stringify(result.data),
    /private\.example|provider details/i,
  );
});

test('safe structured JSON errors remain useful', () => {
  const result = resolveChatErrorBody({
    status: 400,
    contentType: 'application/json; charset=utf-8',
    text: JSON.stringify({
      error: { message: '账户额度不足', code: 'quota_exceeded' },
    }),
  });

  assert.equal(result.message, '账户额度不足');
  assert.equal(result.data.error.message, '账户额度不足');
  assert.equal(result.data.error.code, 'quota_exceeded');
});

test('structured errors redact service URLs and internal provider terms', () => {
  const message = sanitizePublicChatMessage(
    'upstream provider https://private.example.test/v1 failed',
    502,
  );

  assert.doesNotMatch(message, /upstream|provider|https?:\/\//i);
  assert.match(message, /模型服务/);
});

test('HTML hidden inside JSON is rejected', () => {
  const result = resolveChatErrorBody({
    status: 502,
    contentType: 'application/json',
    text: JSON.stringify({ error: { message: '<div>gateway failure</div>' } }),
  });

  assert.equal(result.message, HOME_CHAT_GENERIC_FAILURE_MESSAGE);
});

test('structured error details keep only public fields', () => {
  const result = resolveChatErrorBody({
    status: 502,
    contentType: 'application/json',
    text: JSON.stringify({
      error: {
        message: '暂时不可用',
        code: 'service_unavailable',
        type: 'service_error',
        internal_url: 'https://private.example.test/v1',
      },
      internal_trace: '<trace>',
    }),
  });

  assert.deepEqual(result.data, {
    message: '暂时不可用',
    error: {
      message: '暂时不可用',
      code: 'service_unavailable',
      type: 'service_error',
    },
  });
});

test('structured error code and type reject URLs and markup', () => {
  const result = resolveChatErrorBody({
    status: 502,
    contentType: 'application/json',
    text: JSON.stringify({
      code: 'https://private.example.test/error',
      type: '<script>alert(1)</script>',
      error: {
        message: '暂时不可用',
        code: 'service_unavailable',
        type: 'service_error',
      },
    }),
  });

  assert.equal(result.data.code, undefined);
  assert.equal(result.data.type, undefined);
  assert.equal(result.data.error.code, 'service_unavailable');
  assert.equal(result.data.error.type, 'service_error');
});

test('overlong structured errors fall back to a bounded message', () => {
  const result = resolveChatErrorBody({
    status: 500,
    contentType: 'application/json',
    text: JSON.stringify({ message: 'x'.repeat(241) }),
  });

  assert.equal(result.message, HOME_CHAT_GENERIC_FAILURE_MESSAGE);
});

test('only JSON, SSE, and legacy empty content types are accepted for success', () => {
  assert.equal(isSupportedChatSuccessContentType('application/json'), true);
  assert.equal(
    isSupportedChatSuccessContentType('text/event-stream; charset=utf-8'),
    true,
  );
  assert.equal(isSupportedChatSuccessContentType(''), true);
  assert.equal(isSupportedChatSuccessContentType('text/html'), false);
  assert.equal(isSupportedChatSuccessContentType('text/plain'), false);
});

test('response header deadline stays below the edge timeout window', () => {
  assert.ok(HOME_CHAT_RESPONSE_HEADER_TIMEOUT_MS > 0);
  assert.ok(HOME_CHAT_RESPONSE_HEADER_TIMEOUT_MS < 100_000);
});
