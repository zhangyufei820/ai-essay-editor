import assert from 'node:assert/strict';
import {
  allowedUpscaleFactors,
  upscaleTaskStatus,
  upscaleTaskToResult,
  formatUpscalePrice,
} from './upscale-utils.js';

assert.deepEqual(allowedUpscaleFactors(628, 628), [2, 4, 8, 16]);
assert.deepEqual(allowedUpscaleFactors(629, 629), [2, 4, 8]);
assert.deepEqual(allowedUpscaleFactors(1000, 1000), [2, 4, 8]);
assert.deepEqual(allowedUpscaleFactors(1000, 1000, 'photo'), [2]);
assert.deepEqual(allowedUpscaleFactors(1000, 1000, 'photo_denoiser'), [2]);
assert.deepEqual(allowedUpscaleFactors(10000, 50), [2, 4, 8]);
assert.deepEqual(allowedUpscaleFactors(15, 1000), []);
assert.deepEqual(allowedUpscaleFactors(10001, 1000), []);
assert.equal(upscaleTaskStatus({ status: 'UNKNOWN' }), 'UNKNOWN');
assert.equal(
  upscaleTaskToResult({
    status: 'FAILED',
    task_id: 'a',
    url: 'https://example.com/failure.png',
  }),
  null,
);
assert.equal(
  upscaleTaskToResult({
    status: 'UNKNOWN',
    task_id: 'a',
    url: 'https://example.com/pending.png',
  }),
  null,
);
const result = upscaleTaskToResult({
  status: 'COMPLETED',
  task_id: 'a',
  model: '创意放大',
  url: '/pg/media/files/test.png',
  scale_factor: 4,
  output: { width: 4000, height: 4000 },
  created_at: 1700000000,
});
assert.equal(result.workflow, 'upscale');
assert.equal(result.actualSize, '4000×4000');
assert.equal(result.createdAt, 1700000000000);
assert.equal(result.downloadUrl, '/pg/upscale/tasks/a/download');
assert.equal(formatUpscalePrice('0.613'), '¥0.613');
assert.equal(formatUpscalePrice('bad'), '待计算');
console.log('upscale dimension, status and result contracts passed');
