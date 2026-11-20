import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSeedreamRequest, defaultSeedreamForm, seedreamQuote,
  validateSeedream, validateSeedreamImage, SEEDREAM_MODEL, seedreamLayers, seedreamLayerText,
} from './seedream.js';

const text = { ...defaultSeedreamForm(), prompt: '蓝色的鱼' };
const edit = { ...text, mode: 'edit' };
const split = defaultSeedreamForm('split');
const image = { width: 512, height: 512, type: 'image/png', size: 5820 };

test('normal image generates one output, zero to ten references depending on mode', () => {
  assert.equal(buildSeedreamRequest(text).image, undefined);
  assert.equal(buildSeedreamRequest(edit, ['a']).image, 'a');
  assert.deepEqual(buildSeedreamRequest(edit, ['a', 'b']).image, ['a', 'b']);
  assert.ok(!validateSeedream(edit, 10));
  for (const [form, count] of [[text, 1], [edit, 0], [edit, 11], [split, 0], [split, 2]]) {
    assert.ok(validateSeedream(form, count));
  }
  assert.throws(() => buildSeedreamRequest(edit, []));
  assert.ok(validateSeedream({ ...text, prompt: '  ' }, 0));
});

test('split allows a blank prompt, excludes ordinary fields and includes the base in the cap', () => {
  const request = buildSeedreamRequest({ ...split, background: 'transparent', ocr: true }, ['A']);
  assert.equal(request.image, 'A');
  assert.equal(request.prompt, undefined);
  assert.equal(request.background, undefined);
  assert.equal(request.layer_decomposition, true);
  assert.deepEqual(request.layer_decomposition_options, { max_images: 5, text_recognition: true });
  assert.equal(buildSeedreamRequest({ ...text, maxImages: 100, ocr: true }).layer_decomposition_options, undefined);
  assert.ok(validateSeedream({ ...split, maxImages: 1 }, 1));
  assert.ok(validateSeedream({ ...split, maxImages: 101 }, 1));
  assert.ok(!validateSeedream({ ...split, maxImages: '100' }, 1));
  assert.ok(validateSeedream({ ...split, maxImages: '2.5' }, 1));
});

test('transparent PNG, mode-specific auto and custom resolution', () => {
  assert.ok(validateSeedream({ ...edit, background: 'transparent', format: 'jpeg' }, 1));
  assert.ok(!validateSeedream({ ...edit, background: 'transparent', format: 'png' }, 1));
  assert.ok(!validateSeedream({ ...split, format: 'jpeg', background: 'transparent' }, 1));
  assert.ok(validateSeedream({ ...text, size: 'auto' }, 0));
  assert.ok(!validateSeedream({ ...split, size: 'auto' }, 1));
  assert.ok(validateSeedream({ ...split, size: 'custom', width: 1024, height: 1024 }, 1));
  const custom = { ...text, size: 'custom', width: '1280', height: '720' };
  assert.equal(buildSeedreamRequest(custom).size, '1280x720');
  for (const [width, height] of [[512, 512], [5000, 1000], [8000, 120], ['123.3', 8000], ['', '']]) {
    assert.ok(validateSeedream({ ...custom, width, height }, 0));
  }
});

test('price in integer ten-thousandths: retail rates, cutoff inclusive', () => {
  assert.equal(seedreamQuote(defaultSeedreamForm(), 0).totalUnits, 1092);
  assert.equal(seedreamQuote(edit, 2).totalUnits, 1932);
  assert.equal(seedreamQuote({ ...edit, size: '2K' }, 2).totalUnits, 2772);
  for (const [width, height, total] of [[1800, 1450, 1092], [1800, 1451, 1932]]) {
    assert.equal(seedreamQuote({ ...text, size: 'custom', width, height }, 0).totalUnits, total);
  }
});

test('split reserves the cap, settles actual outputs at the request tier and refunds all on failure', () => {
  const form = { ...split, size: 'auto', maxImages: 5 };
  assert.equal(seedreamQuote(form, 1).totalUnits, 10080);
  assert.equal(seedreamQuote(form, 1, 2).totalUnits, 4284);
  const failed = seedreamQuote(form, 1, 0);
  assert.deepEqual([failed.inputUnits, failed.outputUnits, failed.totalUnits], [0, 0, 0]);
  assert.equal(seedreamQuote(form, 1, 6), null);
  assert.equal(seedreamQuote(form, 1, -1), null);
  assert.equal(seedreamQuote(form, 0), null);
  assert.equal(seedreamQuote(form, 1, 'missing'), null);
});

test('validates decoded reference metadata, distinct pixel minimums and file ceiling', () => {
  assert.equal(validateSeedreamImage('split', image), '');
  assert.ok(validateSeedreamImage('split', { ...image, width: 511 }));
  assert.ok(!validateSeedreamImage('edit', { ...image, width: 15, height: 15 }));
  assert.ok(validateSeedreamImage('edit', { ...image, width: 14, height: 15 }));
  assert.ok(!validateSeedreamImage('edit', { ...image, width: 12000, height: 3000 }));
  assert.ok(validateSeedreamImage('edit', { ...image, width: 12000, height: 3001 }));
  assert.ok(validateSeedreamImage('edit', { ...image, width: 512, height: 8400 }));
  assert.ok(validateSeedreamImage('edit', { ...image, type: 'image/webp' }));
  assert.ok(validateSeedreamImage('split', { ...image, size: 30 * 1024 * 1024 + 1 }));
  assert.ok(!validateSeedreamImage('split', { ...image, size: 30 * 1024 * 1024 }));
});

test('layer history keeps the base, duplicate URLs, OCR runs and geometry', () => {
  const common = { url: '/pg/media/files/example.png' };
  const recognition = { lines: [{ runs: [{ text: '第一行' }] }, { text: '第二行' }] };
  const items = [
    { ...common, metadata: { layer: { z_index: 0 } } },
    { ...common, metadata: { layer: { z_index: 1, name: '标题', text_recognition: recognition, bounding_box: { absolute: [1, 2, 3, 4] } } } },
  ];
  const layers = seedreamLayers({ model: SEEDREAM_MODEL, data: { items } });
  assert.deepEqual(layers.map((layer) => layer.label), ['底图', '标题']);
  assert.equal(layers[1].url, layers[0].url);
  assert.notEqual(layers[1].index, layers[0].index);
  assert.deepEqual(layers[1].bounding_box.absolute, [1, 2, 3, 4]);
  assert.equal(seedreamLayerText(layers[1].text_recognition), '第一行\n第二行');
  assert.deepEqual(seedreamLayers({ model: 'another-model', items }), []);
});
