const { cleanText, slugify } = require('../utils');
const { fetchHtmlWithBrowserless, safeReadText } = require('../browserless');

const GREENACRES_BASE = 'https://www.green-acres.pt/casa-%C3%A0-venda';

function parseGreenAcres(html) {
  const matches = [...String(html).matchAll(/<div[^>]*class=\"[^\"]*announce-card[^\"]*\"[^>]*data-advertid=\"([^\"]+)\"[\s\S]*?>/g)];
  if (!matches.length) return [];
  const blocks = matches.map((match, idx) => {
    const start = match.index || 0;
    const nextIdx = idx + 1 < matches.length ? (matches[idx + 1].index || html.length) : html.length;
    return html.slice(start, nextIdx);
  });

  return blocks.map((block) => {
    const idMatch = block.match(/data-advertid=\"([^\"]+)\"/);
    const id = idMatch ? idMatch[1] : '0';

    const titleMatch = block.match(/title=\"([^\"]+)\"/);
    const title = titleMatch ? cleanText(titleMatch[1]) : 'Imovel';

    const encodedUrl = block.match(/data-o=\"([^\"]+)\"/);
    let url = null;
    if (encodedUrl && encodedUrl[1]) {
      try {
        const decoded = Buffer.from(encodedUrl[1], 'base64').toString('utf8');
        if (decoded.startsWith('http')) url = decoded;
      } catch {
        url = null;
      }
    }

    const priceMatch =
      block.match(/class=\"info-price\">([\s\S]*?)<\/strong>/) ||
      block.match(/class=\"info-price\">([\s\S]*?)<\/span>/) ||
      block.match(/data-price=\"([^\"]+)\"/);
    const price = priceMatch ? cleanText(priceMatch[1]) : null;

    const imgMatch =
      block.match(/class=\"announce-card-img\"[^>]*src=\"([^\"]+)\"/) ||
      block.match(/class=\"announce-card-img\"[^>]*data-lazy-src=\"([^\"]+)\"/) ||
      block.match(/data-thumb-src=\"([^\"]+)\"/);
    const image = imgMatch ? imgMatch[1] : null;

    const locationMatch = block.match(/class=\"announce-localisation\">([\s\S]*?)<\/div>/);
    const location = locationMatch ? cleanText(locationMatch[1]) : null;

    const tagMatches = [...block.matchAll(/class=\"info-tag[^\"]*\"[^>]*title=\"([^\"]*)\"[^>]*>([\s\S]*?)<\/div>/g)];
    const tags = tagMatches.map((m) => ({
      title: cleanText(m[1]),
      text: cleanText(m[2]),
    }));
    const infoTags = [...block.matchAll(/class=\"info-tag[^\"]*\">([\s\S]*?)<\/div>/g)].map((m) => cleanText(m[1]));
    const areaTag =
      tags.find((t) => /área/i.test(t.title)) ||
      tags.find((t) => /m²/i.test(t.text)) ||
      infoTags.find((text) => /m²/i.test(text)) ||
      null;
    const area = areaTag ? (areaTag.text || areaTag) : null;

    const roomsTag =
      tags.find((t) => /quarto/i.test(t.title)) ||
      tags.find((t) => /quarto/i.test(t.text)) ||
      infoTags.find((text) => /quarto/i.test(text)) ||
      null;
    const rooms = roomsTag ? (roomsTag.text || roomsTag) : null;

    const descriptionMatch = block.match(/class=\"description-details\">([\s\S]*?)<\/div>/);
    const description = descriptionMatch ? cleanText(descriptionMatch[1]) : null;

    const extras = [];
    if (location) extras.push(location);

    return {
      id,
      source: 'greenacres',
      title,
      price,
      area,
      rooms,
      image,
      url,
      description,
      extras,
    };
  });
}

async function fetchGreenacres({ council, page, headersCommon }) {
  const warnings = [];
  let method = 'fetch';
  const query = `cn-pt-lg-pt-city_id-dp_${slugify(council)}-hab_house-on-hab_appartement-on-hab_castle-on`;
  const url = `${GREENACRES_BASE}?searchQuery=${encodeURIComponent(query)}&p_n=${page}`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: '*/*',
        ...headersCommon,
        referer: 'https://www.green-acres.pt/',
      },
    });

    if (!res.ok) {
      const bodySnippet = await safeReadText(res, 300);
      const bl = await fetchHtmlWithBrowserless({
        url,
        waitFor: '.announce-card[data-advertid]',
        headersCommon,
        token: process.env.BROWSERLESS_TOKEN,
      });
      if (bl.ok) {
        method = 'browserless';
        return { items: parseGreenAcres(bl.html), warnings, method };
      }
      warnings.push({
        source: 'greenacres',
        error: 'greenacres_unavailable',
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
    if (/announce-card/i.test(html)) {
      return { items: parseGreenAcres(html), warnings, method };
    }

    const bl = await fetchHtmlWithBrowserless({
      url,
      waitFor: '.announce-card[data-advertid]',
      headersCommon,
      token: process.env.BROWSERLESS_TOKEN,
    });
    if (bl.ok) {
      method = 'browserless';
      return { items: parseGreenAcres(bl.html), warnings, method };
    }
    warnings.push({
      source: 'greenacres',
      error: bl.error || 'greenacres_blocked',
      bodySnippet: bl.bodySnippet || html.slice(0, 300),
    });
    method = bl.error === 'browserless_empty' ? 'browserless_empty' : 'blocked';
    return { items: [], warnings, method };
  } catch (err) {
    warnings.push({
      source: 'greenacres',
      error: 'greenacres_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
    return { items: [], warnings, method };
  }
}

module.exports = {
  fetchGreenacres,
};
