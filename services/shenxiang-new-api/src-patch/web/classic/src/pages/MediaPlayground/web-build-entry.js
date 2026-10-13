// The entry asset name changes whenever the deployed frontend changes.
export function webBuildEntryFromHtml(html) {
  const scripts = String(html || '').matchAll(
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
  );
  for (const match of scripts) {
    const src = match[1].split('?')[0];
    if (/^\/static\/js\/index\.[a-f0-9]+\.js$/i.test(src)) return src;
  }
  return '';
}
