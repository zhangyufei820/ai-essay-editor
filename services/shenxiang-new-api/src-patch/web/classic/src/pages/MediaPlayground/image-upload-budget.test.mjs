import assert from 'node:assert/strict';
import { planImageUploadTargets } from './image-upload-budget.js';

const mb = 1024 * 1024;

const geminiPolicy = {
  max_image_bytes: 18 * mb,
  max_total_bytes: 18 * mb,
  global_total_bytes: 60 * mb,
};

assert.deepEqual(planImageUploadTargets([11 * mb], geminiPolicy), [11 * mb]);
assert.deepEqual(planImageUploadTargets([11 * mb, 1 * mb], geminiPolicy), [11 * mb, 1 * mb]);
assert.deepEqual(planImageUploadTargets([11 * mb, 7 * mb], geminiPolicy), [11 * mb, 7 * mb]);
assert.deepEqual(
  planImageUploadTargets([11 * mb, 1 * mb], geminiPolicy, 1),
  [11 * mb, 1 * mb],
);

const overTotal = planImageUploadTargets([11 * mb, 10 * mb], geminiPolicy);
assert.ok(overTotal[0] < 11 * mb);
assert.equal(overTotal[1], 10 * mb);
assert.ok(overTotal.reduce((sum, bytes) => sum + bytes, 0) < 18 * mb);

const withMask = planImageUploadTargets([9 * mb, 10 * mb], geminiPolicy, 1);
assert.ok(withMask[0] < 9 * mb);
assert.equal(withMask[1], 10 * mb);

const gptPolicy = {
  max_image_bytes: 49 * mb,
  max_total_bytes: 60 * mb,
  global_total_bytes: 60 * mb,
};
assert.deepEqual(planImageUploadTargets([11 * mb, 1 * mb], gptPolicy), [11 * mb, 1 * mb]);
const overSingle = planImageUploadTargets([50 * mb], gptPolicy);
assert.ok(overSingle[0] < 49 * mb);
assert.deepEqual(planImageUploadTargets([49 * mb], gptPolicy), [49 * mb]);
const mixed = planImageUploadTargets([50 * mb, 10 * mb], gptPolicy);
assert.ok(mixed[0] < 49 * mb);
assert.equal(mixed[1], 10 * mb);
assert.deepEqual(planImageUploadTargets([], gptPolicy), []);
