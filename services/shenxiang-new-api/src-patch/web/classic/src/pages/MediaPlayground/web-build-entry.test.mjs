import assert from 'node:assert/strict';
import { webBuildEntryFromHtml } from './web-build-entry.js';

assert.equal(
  webBuildEntryFromHtml('<script defer src="/static/js/index.fd9e5f4a3a.js"></script>'),
  '/static/js/index.fd9e5f4a3a.js',
);
assert.equal(
  webBuildEntryFromHtml('<script src="/static/js/lib-react.123.js"></script><script src="/static/js/index.abcdef.js?v=1"></script>'),
  '/static/js/index.abcdef.js',
);
assert.equal(webBuildEntryFromHtml('<html><body>no entry</body></html>'), '');
