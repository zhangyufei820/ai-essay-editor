import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSafeMediaUrl,
  getSafePaymentUrl,
  openMediaPage,
  openPaymentPage,
  submitPaymentForm,
} from './data.js';

test('accepts only HTTP(S) payment destinations', () => {
  const baseUrl = 'https://console.example.com/wallet';

  assert.equal(
    getSafePaymentUrl('https://pay.example.com/checkout', baseUrl),
    'https://pay.example.com/checkout',
  );
  assert.equal(
    getSafePaymentUrl('http://pay.example.com/checkout', baseUrl),
    'http://pay.example.com/checkout',
  );
  assert.equal(
    getSafePaymentUrl('/payment/return', baseUrl),
    'https://console.example.com/payment/return',
  );
  assert.equal(getSafePaymentUrl('javascript:alert(1)', baseUrl), '');
  assert.equal(
    getSafePaymentUrl('data:text/html,<script>alert(1)</script>', baseUrl),
    '',
  );
  assert.equal(getSafePaymentUrl('file:///tmp/payment', baseUrl), '');
  assert.equal(getSafePaymentUrl('', baseUrl), '');
});

test('does not open an unsafe payment destination', () => {
  const calls = [];
  const runtime = {
    location: { href: 'https://console.example.com/wallet' },
    open: (...args) => calls.push(args),
  };

  assert.equal(openPaymentPage('javascript:alert(1)', runtime), false);
  assert.deepEqual(calls, []);

  assert.equal(
    openPaymentPage('https://pay.example.com/checkout', runtime),
    true,
  );
  assert.deepEqual(calls, [
    ['https://pay.example.com/checkout', '_blank', 'noopener,noreferrer'],
  ]);
});

test('accepts only inert media destinations', () => {
  const baseUrl = 'https://console.example.com/playground';

  assert.equal(
    getSafeMediaUrl('https://cdn.example.com/result.png', baseUrl),
    'https://cdn.example.com/result.png',
  );
  assert.equal(
    getSafeMediaUrl('/pg/media/files/u-1/result.mp4', baseUrl),
    'https://console.example.com/pg/media/files/u-1/result.mp4',
  );
  assert.equal(
    getSafeMediaUrl('data:image/png;base64,AAAA', baseUrl),
    'data:image/png;base64,AAAA',
  );
  assert.equal(
    getSafeMediaUrl('blob:https://console.example.com/result-id', baseUrl),
    'blob:https://console.example.com/result-id',
  );
  assert.equal(getSafeMediaUrl('javascript:alert(1)', baseUrl), '');
  assert.equal(
    getSafeMediaUrl('data:text/html,<script>alert(1)</script>', baseUrl),
    '',
  );
  assert.equal(
    getSafeMediaUrl('data:image/svg+xml,<svg onload=alert(1)>', baseUrl),
    '',
  );
  assert.equal(
    getSafeMediaUrl('blob:https://attacker.example/result-id', baseUrl),
    '',
  );
});

test('does not open an unsafe media destination', () => {
  const calls = [];
  const runtime = {
    location: { href: 'https://console.example.com/playground' },
    open: (...args) => calls.push(args),
  };

  assert.equal(openMediaPage('javascript:alert(1)', runtime), false);
  assert.deepEqual(calls, []);

  assert.equal(openMediaPage('/pg/media/files/u-1/result.png', runtime), true);
  assert.deepEqual(calls, [
    [
      'https://console.example.com/pg/media/files/u-1/result.png',
      '_blank',
      'noopener,noreferrer',
    ],
  ]);
});

test('always removes the temporary payment form on submission errors', () => {
  let removed = 0;
  const form = {
    appendChild: () => {},
    remove: () => {
      removed += 1;
    },
    submit: () => {
      throw new Error('blocked');
    },
  };
  const runtime = {
    window: { location: { href: 'https://console.example.com/wallet' } },
    navigator: { userAgent: 'Mozilla/5.0 Chrome/126' },
    document: {
      body: { appendChild: () => {} },
      createElement: (tag) => (tag === 'form' ? form : {}),
    },
  };

  assert.throws(
    () =>
      submitPaymentForm(
        { url: 'https://pay.example.com', params: {} },
        runtime,
      ),
    /blocked/,
  );
  assert.equal(removed, 1);
});
