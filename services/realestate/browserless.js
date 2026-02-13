const DEFAULT_TIMEOUT = 15000;

async function fetchHtmlWithBrowserless({ url, waitFor, headersCommon, token, preScript }) {
  if (!token) return { ok: false, error: 'browserless_token_missing', html: '' };
  try {
    const endpoint = `https://chrome.browserless.io/function?token=${token}`;
    const code = `export default async function ({ page }) {
  await page.setUserAgent(${JSON.stringify(headersCommon['user-agent'])});
  await page.setViewport({ width: 1366, height: 768 });
  await page.setExtraHTTPHeaders({
    'accept-language': ${JSON.stringify(headersCommon['accept-language'])},
  });
  ${preScript || ''}
  await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector(${JSON.stringify(waitFor)}, { timeout: ${DEFAULT_TIMEOUT} });
  } catch (err) {
    const title = await page.title();
    return { data: { error: 'selector_timeout', title }, type: 'application/json' };
  }
  const html = await page.content();
  return { data: html, type: 'text/html' };
}`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/javascript' },
      body: code,
    });
    if (!resp.ok) {
      const bodySnippet = await safeReadText(resp, 300);
      return { ok: false, error: `browserless_${resp.status}`, html: '', bodySnippet };
    }
    const bodyText = await resp.text();
    const contentType = resp.headers.get('content-type') || '';
    let html = '';
    if (contentType.includes('application/json')) {
      try {
        const payload = JSON.parse(bodyText);
        if (payload && payload.type === 'text/html' && typeof payload.data === 'string') {
          html = payload.data;
        } else {
          return { ok: false, error: 'browserless_empty', html: '', bodySnippet: JSON.stringify(payload).slice(0, 300) };
        }
      } catch {
        return { ok: false, error: 'browserless_parse_failed', html: '', bodySnippet: bodyText.slice(0, 300) };
      }
    } else {
      html = bodyText;
    }
    return { ok: true, html };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'browserless_failed', html: '' };
  }
}

async function safeReadText(response, limit) {
  try {
    const text = await response.text();
    if (!text) return '';
    return text.slice(0, limit);
  } catch {
    return '';
  }
}

module.exports = {
  fetchHtmlWithBrowserless,
  safeReadText,
};
