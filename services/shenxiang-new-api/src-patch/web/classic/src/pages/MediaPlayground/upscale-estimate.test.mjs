import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startUpscaleEstimate } from './upscale-estimate.js';

function setup(t, request) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const results = [],
    errors = [];
  let settled = 0;
  const cancel = startUpscaleEstimate({
    request,
    onResult: (value) => results.push(value),
    onError: (error) => errors.push(error),
    onSettled: () => settled++,
  });
  return {
    cancel,
    results,
    errors,
    get settled() {
      return settled;
    },
  };
}

test('new creation during debounce clears loading without sending an estimate', (t) => {
  let calls = 0;
  const run = setup(t, () => calls++);
  run.cancel();
  t.mock.timers.tick(80000);
  assert.equal(run.settled, 1);
  assert.equal(calls, 0);
  assert.deepEqual(run.errors, []);
});

test('cancelled estimate cannot overwrite a newer image or restore loading', async (t) => {
  let resolve, signal;
  const run = setup(t, (s) => {
    signal = s;
    return new Promise((r) => (resolve = r));
  });
  t.mock.timers.tick(350);
  run.cancel();
  assert.equal(signal.aborted, true);
  resolve('stale price');
  await Promise.resolve();
  assert.deepEqual(run.results, []);
  assert.equal(run.settled, 1);
});

test('hung request exits loading at deadline even when abort is ignored', async (t) => {
  let resolve, signal;
  const run = setup(t, (s) => {
    signal = s;
    return new Promise((r) => (resolve = r));
  });
  t.mock.timers.tick(350);
  t.mock.timers.tick(75000);
  assert.equal(run.settled, 1);
  assert.equal(run.errors[0].code, 'UPSCALE_ESTIMATE_TIMEOUT');
  assert.equal(signal.aborted, true);
  resolve('late price');
  await Promise.resolve();
  assert.deepEqual(run.results, []);
  assert.equal(run.settled, 1);
});

test('successful estimate clears deadline and settles exactly once', async (t) => {
  const run = setup(t, async () => ({ amount_cny: 2.815 }));
  t.mock.timers.tick(350);
  await Promise.resolve();
  t.mock.timers.tick(80000);
  run.cancel();
  assert.deepEqual(run.results, [{ amount_cny: 2.815 }]);
  assert.deepEqual(run.errors, []);
  assert.equal(run.settled, 1);
});

test('estimate failure settles loading and allows a new attempt', async (t) => {
  const run = setup(t, async () => {
    throw new Error('unavailable');
  });
  t.mock.timers.tick(350);
  await Promise.resolve();
  assert.equal(run.errors[0].message, 'unavailable');
  assert.equal(run.settled, 1);
  assert.deepEqual(run.results, []);
});
