import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const classicSource = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    if (!/\.jsx?$/.test(entry.name) || entry.name.endsWith('.test.js'))
      return [];
    return [target];
  });
}

test('sanitizes every dangerouslySetInnerHTML payload', () => {
  const unsafe = [];
  for (const file of sourceFiles(classicSource)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /dangerouslySetInnerHTML=\{\{([\s\S]*?)\}\}/g,
    )) {
      if (!match[1].includes('DOMPurify.sanitize(')) {
        unsafe.push(path.relative(classicSource, file));
      }
    }
  }

  assert.deepEqual(unsafe, []);
});

test('routes every wallet payment destination through the allowlist helpers', () => {
  const files = [
    path.join(classicSource, 'components/topup/index.jsx'),
    path.join(classicSource, 'components/topup/SubscriptionPlansCard.jsx'),
  ];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /window\.open\s*\(/);
    assert.doesNotMatch(source, /window\.location\.href\s*=/);
    assert.doesNotMatch(source, /form\.action\s*=/);
    assert.match(
      source,
      /openPaymentPage|submitPaymentForm|navigateToPaymentPage/,
    );
  }
});

test('sends iframe preferences only after load and to the configured origin', () => {
  const source = fs.readFileSync(
    path.join(classicSource, 'pages/Home/index.jsx'),
    'utf8',
  );

  assert.match(source, /loadedIframeUrl !== homePageContent/);
  assert.match(source, /new URL\(homePageContent\)\.origin/);
  assert.match(
    source,
    /onLoad=\{\(\) => setLoadedIframeUrl\(homePageContent\)\}/,
  );
  assert.doesNotMatch(source, /postMessage\([^\n]+, '\*'\)/);
});

test('releases every created object URL and keeps Mermaid in strict mode', () => {
  const leaks = [];
  for (const file of sourceFiles(classicSource)) {
    const source = fs.readFileSync(file, 'utf8');
    const created = (source.match(/URL\.createObjectURL\s*\(/g) || []).length;
    const revoked = (source.match(/URL\.revokeObjectURL\s*\(/g) || []).length;
    if (created > revoked) leaks.push(path.relative(classicSource, file));
  }

  assert.deepEqual(leaks, []);
  const markdown = fs.readFileSync(
    path.join(classicSource, 'components/common/markdown/MarkdownRenderer.jsx'),
    'utf8',
  );
  assert.match(markdown, /securityLevel: 'strict'/);
  assert.doesNotMatch(markdown, /securityLevel: 'loose'/);
});

test('all OAuth entry screens honor the server-side 2FA challenge', () => {
  const loginSource = fs.readFileSync(
    path.join(classicSource, 'components/auth/LoginForm.jsx'),
    'utf8',
  );
  const registerSource = fs.readFileSync(
    path.join(classicSource, 'components/auth/RegisterForm.jsx'),
    'utf8',
  );

  assert.ok((loginSource.match(/require_2fa/g) || []).length >= 3);
  assert.ok((registerSource.match(/require_2fa/g) || []).length >= 2);
  for (const source of [loginSource, registerSource]) {
    assert.match(source, /TwoFAVerification/);
    assert.match(source, /setShowTwoFA\(true\)/);
  }
});
