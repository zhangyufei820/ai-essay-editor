import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expiryFormValueToUnixSeconds,
  getTokenFormErrorMessage,
  normalizeTokenGroupSelection,
  normalizeTokenExpiryForForm,
} from './tokenForm.js';

test('never-expiring tokens do not become a 1970 DatePicker value', () => {
  let formatCalled = false;
  const value = normalizeTokenExpiryForForm(-1, () => {
    formatCalled = true;
    return 'unexpected';
  });

  assert.equal(value, null);
  assert.equal(formatCalled, false);
});

test('future expirations keep their formatted DatePicker value', () => {
  assert.equal(
    normalizeTokenExpiryForForm(1893553445, (seconds) => `unix:${seconds}`),
    'unix:1893553445',
  );
});

test('empty DatePicker values serialize back to the never-expiring sentinel', () => {
  assert.equal(expiryFormValueToUnixSeconds(null), -1);
  assert.equal(expiryFormValueToUnixSeconds(''), -1);
});

test('valid DatePicker values serialize to Unix seconds', () => {
  assert.equal(
    expiryFormValueToUnixSeconds('2030-01-02T03:04:05.000Z'),
    1893553445,
  );
});

test('invalid DatePicker values are rejected', () => {
  assert.equal(expiryFormValueToUnixSeconds('not-a-date'), null);
});

test('regular token groups keep their fallback order', () => {
  assert.deepEqual(normalizeTokenGroupSelection(['default', 'plus']), [
    'default',
    'plus',
  ]);
});

test('selecting a regular group replaces an existing welfare group', () => {
  assert.deepEqual(normalizeTokenGroupSelection(['welfare-001', 'default']), [
    'default',
  ]);
});

test('selecting a welfare group replaces an existing fallback chain', () => {
  assert.deepEqual(normalizeTokenGroupSelection(['default', 'welfare']), [
    'welfare',
  ]);
});

test('token API errors preserve the safe backend message', () => {
  assert.equal(
    getTokenFormErrorMessage({
      response: { data: { message: '令牌分组或专用令牌配置无效' } },
    }),
    '令牌分组或专用令牌配置无效',
  );
});

test('token API errors fall back to a stable public message', () => {
  assert.equal(
    getTokenFormErrorMessage(new Error('network details')),
    '令牌保存失败，请重试',
  );
});
