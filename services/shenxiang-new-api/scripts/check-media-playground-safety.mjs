#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function sourceRootFromArgs() {
  const index = process.argv.indexOf('--source-root');
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return 'services/shenxiang-new-api/src-patch';
}

function missingMarkers(label, text, markers) {
  return markers
    .filter((marker) => !text.includes(marker))
    .map((marker) => `${label}: missing ${marker}`);
}

function main() {
  const sourceRoot = path.resolve(sourceRootFromArgs());
  const root = fs.existsSync(path.join(sourceRoot, 'web'))
    ? path.join(sourceRoot, 'web')
    : sourceRoot;
  const pagePath = path.join(
    root,
    'classic/src/pages/MediaPlayground/index.jsx',
  );
  const uploadPath = path.join(
    root,
    'classic/src/components/media-workbench/MediaUploadPanel.jsx',
  );
  const errors = [];

  for (const file of [pagePath, uploadPath]) {
    if (!fs.existsSync(file)) errors.push(`missing required file: ${file}`);
  }
  if (errors.length) return fail(errors);

  const page = fs.readFileSync(pagePath, 'utf8');
  const upload = fs.readFileSync(uploadPath, 'utf8');

  errors.push(
    ...missingMarkers('synchronous submit lock', page, [
      'const submitInFlightRef = useRef(false)',
      "if (submitInFlightRef.current || (mode === 'video' && videoPolling)) return",
      'submitInFlightRef.current = true',
      'submitInFlightRef.current = false',
      "submitting || (mode === 'video' && videoPolling) || !modelAllowed",
    ]),
  );
  errors.push(
    ...missingMarkers('polling cancellation', page, [
      'const pollingAbortControllerRef = useRef(null)',
      'pollingAbortControllerRef.current = new AbortController()',
      'pollingAbortControllerRef.current?.abort()',
      'signal: pollingAbortSignal()',
      'await waitForPollingDelay(',
    ]),
  );
  errors.push(
    ...missingMarkers('failed video ordering', page, [
      "if (status === 'failed') {",
      'const url = extractVideoURL(res.data)',
    ]),
  );
  const failedStatusIndex = page.indexOf(
    "if (status === 'failed') {",
    page.indexOf('async function pollVideo'),
  );
  const videoUrlIndex = page.indexOf(
    'const url = extractVideoURL(res.data)',
    page.indexOf('async function pollVideo'),
  );
  if (
    failedStatusIndex === -1 ||
    videoUrlIndex === -1 ||
    failedStatusIndex > videoUrlIndex
  ) {
    errors.push(
      'failed video ordering: terminal status must be checked before result URL',
    );
  }
  const directKeysStart = page.indexOf(
    'const directKeys = [',
    page.indexOf('function pickVideoURL'),
  );
  const directKeysEnd = page.indexOf('];', directKeysStart);
  const directKeys = page.slice(directKeysStart, directKeysEnd);
  if (
    directKeys.includes("'fail_reason'") ||
    directKeys.includes("'failReason'")
  ) {
    errors.push(
      'failed video ordering: failure fields are still treated as media URLs',
    );
  }
  if (page.includes('window.setTimeout(async () =>')) {
    errors.push('polling cancellation: untracked async timeout remains');
  }
  if (
    page.includes('dataURLToBlobURL(') ||
    page.includes('URL.createObjectURL(new Blob')
  ) {
    errors.push(
      'object URL cleanup: generated result still creates an untracked blob URL',
    );
  }
  errors.push(
    ...missingMarkers('upload preview cleanup', upload, [
      'URL.revokeObjectURL(previewUrl)',
    ]),
  );
  errors.push(
    ...missingMarkers('media URL safety', page, [
      'getSafeMediaUrl(',
      'openMediaPage(openUrl)',
      "credentials: 'same-origin'",
    ]),
  );
  if (page.includes("window.open(url, '_blank'")) {
    errors.push('media URL safety: unvalidated window.open remains');
  }

  if (errors.length) return fail(errors);
  console.log('media playground safety check passed');
}

function fail(errors) {
  console.error('media playground safety check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}

main();
