function decodeHtml(input) {
  if (!input) return '';
  return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code) => {
    if (code.startsWith('#x')) {
      const num = parseInt(code.slice(2), 16);
      return Number.isFinite(num) ? String.fromCharCode(num) : match;
    }
    if (code.startsWith('#')) {
      const num = parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCharCode(num) : match;
    }
    const map = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' ',
    };
    return map[code] || match;
  });
}

function cleanText(input) {
  return decodeHtml(input).replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parsePriceNumber(value) {
  if (!value) return null;
  const num = String(value).replace(/[^\d]/g, '');
  if (!num) return null;
  return Number(num);
}

function parseAreaNumber(value) {
  if (!value) return null;
  const num = String(value).replace(/[^\d.,]/g, '').replace(',', '.');
  const parsed = parseFloat(num);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTitle(value) {
  return cleanText(String(value || ''))
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeEstateItems(items, meta) {
  const toTime = (value) => {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const bucketPrice = (price) => {
    if (!price) return 'p0';
    return `p${Math.round(price / 5000) * 5000}`;
  };
  const bucketArea = (area) => {
    if (!area) return 'a0';
    return `a${Math.round(area / 5) * 5}`;
  };

  const map = new Map();
  items.forEach((item) => {
    const titleKey = normalizeTitle(item.title);
    const priceNum = parsePriceNumber(item.price);
    const areaNum = parseAreaNumber(item.area);
    const key = `${titleKey}|${bucketPrice(priceNum)}|${bucketArea(areaNum)}|${meta.district}|${meta.council}`;

    if (!map.has(key)) {
      const base = { ...item };
      base.source = 'aggregated';
      base.sources = item.source ? [item.source] : [];
      base.urls = item.url ? [item.url] : [];
      map.set(key, base);
      return;
    }

    const current = map.get(key);
    if (item.source && !current.sources.includes(item.source)) {
      current.sources.push(item.source);
    }
    if (item.url && !current.urls.includes(item.url)) {
      current.urls.push(item.url);
    }
    if (!current.image && item.image) current.image = item.image;
    if ((!current.price || current.price === 'Preco sob consulta') && item.price && item.price !== 'Preco sob consulta') {
      current.price = item.price;
    }
    if (!current.area && item.area) current.area = item.area;
    if (!current.rooms && item.rooms) current.rooms = item.rooms;
    if (!current.title && item.title) current.title = item.title;
    if (item.publishedAt) {
      const currentTime = toTime(current.publishedAt);
      const nextTime = toTime(item.publishedAt);
      if (!currentTime || (nextTime && nextTime > currentTime)) {
        current.publishedAt = item.publishedAt;
      }
    }
  });

  return Array.from(map.values());
}

module.exports = {
  decodeHtml,
  cleanText,
  slugify,
  parsePriceNumber,
  parseAreaNumber,
  mergeEstateItems,
};
