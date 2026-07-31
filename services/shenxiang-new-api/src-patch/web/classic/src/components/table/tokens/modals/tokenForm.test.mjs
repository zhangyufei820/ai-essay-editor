import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expiryFormValueToUnixSeconds,
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
