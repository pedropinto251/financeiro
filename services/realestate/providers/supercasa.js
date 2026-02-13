const { cleanText } = require('../utils');
const { fetchHtmlWithBrowserless, safeReadText } = require('../browserless');

const SUPERCASA_BASE = 'https://supercasa.pt/comprar-casas';

function getExtraHeadersFromEnv() {
  const raw = process.env.SUPERCASA_HEADERS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

function parseSupercasa(html) {
  const matches = [...String(html).matchAll(/id=\"property_(\d+)\"/g)];
  if (!matches.length) return [];
  const blocks = matches.map((match, idx) => {
    const start = match.index || 0;
    const end = idx + 1 < matches.length ? (matches[idx + 1].index || html.length) : html.length;
    return html.slice(start, end);
  });

  return blocks.map((block) => {
    const idMatch = block.match(/id=\"property_(\d+)\"/);
    const id = idMatch ? idMatch[1] : '0';

    const titleMatch = block.match(/<h2 class=\"property-list-title\">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    const title = titleMatch ? cleanText(titleMatch[1]) : 'Imovel';

    const urlMatch = block.match(/<h2 class=\"property-list-title\">[\s\S]*?<a href=\"([^\"]+)\"/);
    const url = urlMatch ? `https://supercasa.pt${urlMatch[1]}` : null;

    const priceMatch = block.match(/<div class=\"property-price\">[\s\S]*?<span>([\s\S]*?)<\/span>/);
    const price = priceMatch ? cleanText(priceMatch[1]) : null;

    const imgMatch = block.match(/background-image:\s*url\(([^)]+)\)/);
    const image = imgMatch ? imgMatch[1].replace(/['"]/g, '') : null;

    const featuresMatch = block.match(/<div class=\"property-features\">([\s\S]*?)<\/div>/);
    const featureText = featuresMatch
      ? [...featuresMatch[1].matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => cleanText(m[1]))
      : [];
    const rooms = featureText.find((text) => text.toLowerCase().includes('quarto')) || null;
    const area = featureText.find((text) => text.toLowerCase().includes('m²')) || null;

    return {
      id,
      source: 'supercasa',
      title,
      price,
      area,
      rooms,
      image,
      url,
    };
  });
}

async function fetchSupercasa({ district, council, page, headersCommon }) {
  const warnings = [];
  let method = 'fetch';
  const url = `${SUPERCASA_BASE}/${district}/${council}/pagina-${page}`;
  const extraHeaders = getExtraHeadersFromEnv();
  try {
    const res = await fetch(url, {
      headers: {
        accept: '*/*',
        'cache-control': 'no-cache',
        ...headersCommon,
        referer: 'https://supercasa.pt/',
        ...extraHeaders,
      },
    });
    if (!res.ok) {
      const bodySnippet = await safeReadText(res, 300);
      const bl = await fetchHtmlWithBrowserless({
        url,
        waitFor: '.list-properties',
        headersCommon,
        token: process.env.BROWSERLESS_TOKEN,
      });
      if (bl.ok) {
        method = 'browserless';
        return { items: parseSupercasa(bl.html), warnings, method };
      }
      warnings.push({
        source: 'supercasa',
        error: 'supercasa_unavailable',
        status: res.status,
        statusText: res.statusText,
        bodySnippet,
        browserlessError: bl.error || undefined,
        browserlessBody: bl.bodySnippet || undefined,
      });
      method = bl.error === 'browserless_empty' ? 'browserless_empty' : 'blocked';
      return { items: [], warnings, method };
    }
    const html = await res.text();
    if (/Just a moment/i.test(html)) {
      const bl = await fetchHtmlWithBrowserless({
        url,
        waitFor: '.list-properties',
        headersCommon,
        token: process.env.BROWSERLESS_TOKEN,
      });
      if (bl.ok) {
        method = 'browserless';
        return { items: parseSupercasa(bl.html), warnings, method };
      }
      warnings.push({
        source: 'supercasa',
        error: bl.error || 'supercasa_cloudflare',
        browserlessError: bl.error || undefined,
        browserlessBody: bl.bodySnippet || undefined,
      });
      method = bl.error === 'browserless_empty' ? 'browserless_empty' : 'blocked';
      return { items: [], warnings, method };
    }
    return { items: parseSupercasa(html), warnings, method };
  } catch (err) {
    warnings.push({
      source: 'supercasa',
      error: 'supercasa_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
    return { items: [], warnings, method };
  }
}

module.exports = {
  fetchSupercasa,
};
