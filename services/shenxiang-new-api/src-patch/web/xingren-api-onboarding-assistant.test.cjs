const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = {};

const { validateCodexTokenPayload } = require('./xingren-api-onboarding-assistant.js');

const validPayload = {
  success: true,
  key: 'sk-test-key-abcdefghijklmnopqrstuvwxyz',
  masked_key: 'sk-t**********wxyz',
  token_id: 717,
  token_type: 'monthly_card',
  token_owner_id: 107,
  account_id: 107,
  billing_mode: 'subscription_only',
};

test('accepts a complete payload owned by the current account', () => {
  assert.equal(validateCodexTokenPayload(validPayload, '107'), validPayload);
});

test('rejects failure or cross-account payloads before configuration', () => {
  const invalidPayloads = [
    {},
    { ...validPayload, success: false },
    { ...validPayload, token_owner_id: 15 },
    { ...validPayload, account_id: 15 },
    { ...validPayload, token_id: 0 },
    { ...validPayload, billing_mode: 'account_preference' },
    { ...validPayload, masked_key: '' },
  ];

  for (const payload of invalidPayloads) {
    assert.throws(() => validateCodexTokenPayload(payload, '107'));
  }
});

test('initializes in a browser even when a CommonJS global exists', () => {
  const documentEvents = [];
  const windowEvents = [];
  const context = {
    module: { exports: {} },
    document: {
      readyState: 'loading',
      addEventListener: (name) => documentEvents.push(name),
    },
    window: {
      addEventListener: (name) => windowEvents.push(name),
    },
  };

  vm.runInNewContext(fs.readFileSync(__filename.replace(/\.test\.cjs$/, '.js'), 'utf8'), context);

  assert.equal(typeof context.module.exports.validateCodexTokenPayload, 'function');
  assert.ok(documentEvents.includes('keydown'));
  assert.ok(documentEvents.includes('DOMContentLoaded'));
  assert.ok(windowEvents.includes('resize'));
  assert.ok(windowEvents.includes('aiphui:open-api-teacher'));
});
