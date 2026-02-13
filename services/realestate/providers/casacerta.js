const { cleanText } = require('../utils');
const { fetchHtmlWithBrowserless, safeReadText } = require('../browserless');

const CASACERTA_LOCATION_CACHE = {
  'aveiro|espinho': 2239,
};

function parseCasacerta(html) {
  const blocks = [...String(html).matchAll(/property-ad-in-list-really[\s\S]*?>/g)];
  if (!blocks.length) return [];
  const blockSlices = blocks.map((match, idx) => {
    const start = match.index || 0;
    const nextIdx = idx + 1 < blocks.length ? (blocks[idx + 1].index || html.length) : html.length;
    return html.slice(start, nextIdx);
  });

  return blockSlices.map((block) => {
    const linkMatch = block.match(/href=\"(https:\/\/casacerta\.pt\/imovel\/[^\"]+)\"/);
    const url = linkMatch ? linkMatch[1] : null;

    const idMatch = block.match(/imovel\/(\d+)\//);
    const id = idMatch ? idMatch[1] : '0';

    const titleMatch = block.match(/<h5[^>]*>([\s\S]*?)<\/h5>/);
    const title = titleMatch ? cleanText(titleMatch[1]) : 'Imovel';

    const priceMatch = block.match(/class=\"responsive-text-24[^\"]*\">([\s\S]*?)<\/p>/);
    const price = priceMatch ? cleanText(priceMatch[1]) : null;

    const imgMatch = block.match(/<img[^>]*class=\"d-block\"[^>]*src=\"([^\"]+)\"/);
    const image = imgMatch ? imgMatch[1] : null;

    const roomsMatch = block.match(/([\d]+)\s*Quartos/i);
    const rooms = roomsMatch ? `${roomsMatch[1]} quartos` : null;

    const areaMatch = block.match(/Área bruta\s*:\s*([\d.,]+)\s*m²/i);
    const area = areaMatch ? `${areaMatch[1]} m²` : null;

    return {
      id,
      source: 'casacerta',
      title,
      price,
      area,
      rooms,
      image,
      url,
    };
  });
}

const selectCasacertaLocation = (entries, districtRaw, councilRaw, district, council) => {
  if (!Array.isArray(entries) || !entries.length) return null;
  const districtName = (districtRaw || district || '').toLowerCase();
  const councilName = (councilRaw || council || '').toLowerCase();
  const normalized = entries.map((entry) => ({
    entry,
    distrito: String(entry.Distrito || '').toLowerCase(),
    concelho: String(entry.Concelho || '').toLowerCase(),
    label: String(entry.Label || '').toLowerCase(),
  }));
  const exactConcelho = normalized.find(
    (item) => item.label === 'concelho' && item.distrito === districtName && item.concelho === councilName
  );
  if (exactConcelho) return exactConcelho.entry;
  const exactMatch = normalized.find(
    (item) => item.distrito === districtName && item.concelho === councilName
  );
  if (exactMatch) return exactMatch.entry;
  const anyConcelho = normalized.find((item) => item.label === 'concelho' && item.concelho === councilName);
  return anyConcelho ? anyConcelho.entry : normalized[0].entry;
};

async function fetchCasacertaPlacesWithBrowserless({ locaisValue, headersCommon }) {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) return { ok: false, error: 'browserless_token_missing', data: null };
  try {
    const endpoint = `https://chrome.browserless.io/function?token=${token}`;
    const url = `https://casacerta.pt/api/placesvue?locais=${encodeURIComponent(locaisValue)}&format=json`;
    const code = `export default async function ({ page }) {
  await page.setUserAgent(${JSON.stringify(headersCommon['user-agent'])});
  await page.setViewport({ width: 1366, height: 768 });
  await page.setExtraHTTPHeaders({
    'accept-language': ${JSON.stringify(headersCommon['accept-language'])},
  });
  await page.goto('https://casacerta.pt/', { waitUntil: 'domcontentloaded' });
  const resp = await page.evaluate(async (target) => {
    const r = await fetch(target, { credentials: 'include' });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text };
  }, ${JSON.stringify(url)});
  return { data: resp, type: 'application/json' };
}`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/javascript' },
      body: code,
    });
    if (!resp.ok) {
      const bodySnippet = await safeReadText(resp, 300);
      return { ok: false, error: `browserless_${resp.status}`, data: null, bodySnippet };
    }
    const payload = await resp.json();
    if (!payload || !payload.data) {
      return { ok: false, error: 'browserless_empty', data: null, bodySnippet: JSON.stringify(payload).slice(0, 300) };
    }
    const parsed = payload.data;
    if (!parsed.ok) {
      return { ok: false, error: 'browserless_places_failed', data: null, bodySnippet: String(parsed.text || '').slice(0, 300) };
    }
    try {
      const data = JSON.parse(parsed.text);
      return { ok: true, data };
    } catch {
      return { ok: false, error: 'browserless_parse_failed', data: null, bodySnippet: String(parsed.text || '').slice(0, 300) };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'browserless_failed', data: null };
  }
}

async function fetchCasacerta({ districtRaw, councilRaw, district, council, page, headersCommon }) {
  const warnings = [];
  let method = 'fetch';

  const resolveListing = async (apiId) => {
    const casacertaUrl = `https://casacerta.pt/imoveis?finalidade=Venda&proptype=1%2C2%2C7&county=${encodeURIComponent(
      apiId
    )}&useRef=useRef&pageNo=${page}`;
    const res = await fetch(casacertaUrl, {
      headers: {
        accept: '*/*',
        ...headersCommon,
        referer: 'https://casacerta.pt/',
      },
    });
    if (res.ok) {
      const html = await res.text();
      if (/Just a moment/i.test(html)) {
        const blHtml = await fetchHtmlWithBrowserless({
          url: casacertaUrl,
          waitFor: '.property-ad-in-list-really',
          headersCommon,
          token: process.env.BROWSERLESS_TOKEN,
        });
        if (blHtml.ok) {
          method = 'browserless';
          return parseCasacerta(blHtml.html);
        }
        warnings.push({
          source: 'casacerta',
          error: blHtml.error || 'casacerta_browserless_failed',
          browserlessError: blHtml.error || undefined,
          browserlessBody: blHtml.bodySnippet || undefined,
        });
        method = blHtml.error === 'browserless_empty' ? 'browserless_empty' : 'blocked';
        return [];
      }
      return parseCasacerta(html);
    }

    const listSnippet = await safeReadText(res, 300);
    const blHtml = await fetchHtmlWithBrowserless({
      url: casacertaUrl,
      waitFor: '.property-ad-in-list-really',
      headersCommon,
      token: process.env.BROWSERLESS_TOKEN,
    });
    if (blHtml.ok) {
      method = 'browserless';
      return parseCasacerta(blHtml.html);
    }
    warnings.push({
      source: 'casacerta',
      error: 'casacerta_unavailable',
      status: res.status,
      statusText: res.statusText,
      bodySnippet: listSnippet,
      browserlessError: blHtml.error || undefined,
      browserlessBody: blHtml.bodySnippet || undefined,
    });
    method = blHtml.error === 'browserless_empty' ? 'browserless_empty' : 'blocked';
    return [];
  };

  try {
    const locaisValue = councilRaw || council;
    const placesUrl = `https://casacerta.pt/api/placesvue?locais=${encodeURIComponent(locaisValue)}&format=json`;
    const placesRes = await fetch(placesUrl, {
      headers: { accept: 'application/json', ...headersCommon },
    });

    if (placesRes.ok) {
      const places = await placesRes.json();
      const selected = selectCasacertaLocation(places, districtRaw, councilRaw, district, council);
      if (selected && selected.api_id) {
        CASACERTA_LOCATION_CACHE[`${district}|${council}`] = selected.api_id;
        return { items: await resolveListing(selected.api_id), warnings, method };
      }
      warnings.push({
        source: 'casacerta',
        error: 'casacerta_location_not_found',
      });
    } else {
      const cached = CASACERTA_LOCATION_CACHE[`${district}|${council}`];
      if (cached) {
        return { items: await resolveListing(cached), warnings, method };
      }
      const blPlaces = await fetchCasacertaPlacesWithBrowserless({ locaisValue, headersCommon });
      if (blPlaces.ok) {
        const selected = selectCasacertaLocation(blPlaces.data, districtRaw, councilRaw, district, council);
        if (selected && selected.api_id) {
          CASACERTA_LOCATION_CACHE[`${district}|${council}`] = selected.api_id;
          method = 'browserless';
          return { items: await resolveListing(selected.api_id), warnings, method };
        }
        warnings.push({
          source: 'casacerta',
          error: 'casacerta_location_not_found',
        });
      } else {
        warnings.push({
          source: 'casacerta',
          error: 'casacerta_places_unavailable',
          status: placesRes.status,
          statusText: placesRes.statusText,
          bodySnippet: await safeReadText(placesRes, 300),
          browserlessError: blPlaces.error || undefined,
          browserlessBody: blPlaces.bodySnippet || undefined,
        });
      }
    }

    return { items: [], warnings, method };
  } catch (err) {
    warnings.push({
      source: 'casacerta',
      error: 'casacerta_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
    return { items: [], warnings, method };
  }
}

module.exports = {
  fetchCasacerta,
};
