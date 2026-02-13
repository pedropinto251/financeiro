const IMOVIRTUAL_BUILD_ID = process.env.IMOVIRTUAL_BUILD_ID || 'DgbmbX0jiylTfZDI15F3j';
const IMOVIRTUAL_BASE = 'https://www.imovirtual.com/_next/data';
let imovirtualBuildIdCache = {
  value: IMOVIRTUAL_BUILD_ID,
  expiresAt: 0,
};

const ROOM_MAP = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
};

function parseImovirtual(payload) {
  const items = (payload && payload.pageProps && payload.pageProps.data && payload.pageProps.data.searchAds && payload.pageProps.data.searchAds.items) || [];
  return items.map((item) => {
    const slug = typeof item.slug === 'string' ? item.slug : '';
    const url = slug ? `https://www.imovirtual.com/pt/anuncio/${slug}` : null;
    const publishedAt =
      item?.createdAt ||
      item?.dateCreated ||
      item?.dateCreatedUtc ||
      item?.creationDate ||
      item?.publishedAt ||
      item?.publicationDate ||
      item?.modifiedAt ||
      item?.updatedAt ||
      null;
    const priceValue = item && item.totalPrice && item.totalPrice.value;
    const priceCurrency = item && item.totalPrice && item.totalPrice.currency;
    const price = priceValue ? `${priceValue} ${priceCurrency || 'EUR'}` : 'Preco sob consulta';
    const area = item && item.areaInSquareMeters ? `${item.areaInSquareMeters} m²` : null;
    const roomsNumber = item && item.roomsNumber;
    const rooms = roomsNumber ? `${ROOM_MAP[roomsNumber] || roomsNumber} quartos` : null;
    const image = item && item.images && item.images[0] ? (item.images[0].medium || item.images[0].large) : null;

    return {
      id: String(item.id),
      source: 'imovirtual',
      title: item.title || 'Imovel',
      price,
      area,
      rooms,
      image,
      url,
      publishedAt,
    };
  });
}

async function getImovirtualBuildId(district, council, headersCommon) {
  const now = Date.now();
  if (imovirtualBuildIdCache.value && imovirtualBuildIdCache.expiresAt > now) {
    return imovirtualBuildIdCache.value;
  }
  try {
    const url = `https://www.imovirtual.com/pt/resultados/comprar/apartamento/${district}/${council}`;
    const res = await fetch(url, {
      headers: {
        accept: 'text/html,*/*',
        ...headersCommon,
      },
    });
    if (!res.ok) return IMOVIRTUAL_BUILD_ID;
    const html = await res.text();
    const match = html.match(/\"buildId\":\"([^\"]+)\"/);
    if (match && match[1]) {
      imovirtualBuildIdCache = {
        value: match[1],
        expiresAt: now + 60 * 60 * 1000,
      };
      return match[1];
    }
  } catch {
    return IMOVIRTUAL_BUILD_ID;
  }
  return IMOVIRTUAL_BUILD_ID;
}

async function fetchImovirtual({ district, council, page, headersCommon }) {
  const warnings = [];
  let method = 'fetch';
  try {
    const buildId = await getImovirtualBuildId(district, council, headersCommon);
    const url = `${IMOVIRTUAL_BASE}/${buildId}/pt/resultados/comprar/apartamento/${district}/${council}.json?limit=36&ownerTypeSingleSelect=ALL&by=DEFAULT&direction=DESC&searchingCriteria=comprar&searchingCriteria=apartamento&searchingCriteria=${encodeURIComponent(
      district
    )}&searchingCriteria=${encodeURIComponent(council)}&page=${page}`;
    const res = await fetch(url, {
      headers: { accept: 'application/json', ...headersCommon },
    });
    if (!res.ok) {
      const bodySnippet = await res.text();
      warnings.push({
        source: 'imovirtual',
        error: 'imovirtual_unavailable',
        status: res.status,
        statusText: res.statusText,
        bodySnippet: bodySnippet.slice(0, 300),
      });
      return { items: [], warnings, method };
    }
    const json = await res.json();
    return { items: parseImovirtual(json), warnings, method };
  } catch (err) {
    warnings.push({
      source: 'imovirtual',
      error: 'imovirtual_failed',
      message: err instanceof Error ? err.message : 'unknown',
    });
    return { items: [], warnings, method };
  }
}

module.exports = {
  fetchImovirtual,
};
