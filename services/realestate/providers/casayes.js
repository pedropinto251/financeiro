const { cleanText } = require('../utils');

function getCasayesHeadersFromEnv() {
  const headers = {};
  if (process.env.CASAYES_SESSIONID) headers.sessionid = process.env.CASAYES_SESSIONID;
  if (process.env.CASAYES_TENANTID) headers.tenantid = process.env.CASAYES_TENANTID;
  if (process.env.CASAYES_LANGUAGEID) headers.languageid = process.env.CASAYES_LANGUAGEID;
  if (process.env.CASAYES_DEVICE) headers.device = process.env.CASAYES_DEVICE;
  if (process.env.CASAYES_BEEDIGITAL) headers.beedigital = process.env.CASAYES_BEEDIGITAL;
  return headers;
}

function parseCasayes(payload) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  return items.map((item) => {
    const publicId = item.publicId ? String(item.publicId) : '0';
    const titleParts = [
      item.listingTypeLabel ? cleanText(item.listingTypeLabel) : null,
      item.regionName2 ? cleanText(item.regionName2) : null,
      item.regionName3 ? cleanText(item.regionName3) : null,
    ].filter(Boolean);
    const title = titleParts.length ? titleParts.join(' - ') : 'Imovel';
    const price = item.listingPrice ? `${item.listingPrice} EUR` : 'Preco sob consulta';
    const area = item.totalArea ? `${item.totalArea} m²` : null;
    const rooms = item.numberOfBedrooms ? `${item.numberOfBedrooms} quartos` : null;
    const imagePath = item.defaultPictureUrl || (Array.isArray(item.listingPictures) ? item.listingPictures[0] : null);
    let image = null;
    if (imagePath) {
      const raw = String(imagePath).replace(/^\//, '');
      if (/^https?:\/\//i.test(raw)) {
        image = raw;
      } else if (raw.startsWith('l-view/')) {
        image = `https://i.casayes.pt/${raw}`;
      } else if (raw.startsWith('listings/')) {
        image = `https://i.casayes.pt/l-view/${raw}`;
      } else {
        image = `https://i.casayes.pt/${raw}`;
      }
    }
    const url = publicId !== '0' ? `https://casayes.pt/pt/imovel/${publicId}` : null;
    const extras = [];
    if (item.numberOfBathrooms) extras.push(`${item.numberOfBathrooms} WC`);
    if (item.officePublicName) extras.push(cleanText(item.officePublicName));
    const publishedAt = item.publishingDate || item.publishingDateUtc || item.publishDate || null;

    return {
      id: publicId,
      source: 'casayes',
      title,
      price,
      area,
      rooms,
      image,
      url,
      extras,
      publishedAt,
    };
  });
}

async function fetchCasayes({ districtRaw, councilRaw, page, headersCommon }) {
  const warnings = [];
  let method = 'fetch';
  const url = 'https://casayes.pt/api/frontend/frontendlisting/SearchWithPagination';
  const queryValue = councilRaw || districtRaw || '';
  const payload = {
    filters: [
      {
        field: 'autocompletePublicId,autocompleteExternalPublicId,regionName1,regionName2,regionName3,addressZipCode',
        operationType: 'multipleField',
        operator: 'Contains',
        value: String(queryValue),
      },
      { field: 'businessTypeId', operationType: 'int', operator: '=', value: '1' },
      { field: 'listingTypeId', operationType: 'multiple', operator: '=', value: '1,2,10' },
    ],
    pageNumber: page,
    pageSize: 20,
    sort: ['-Relevance', '-PublishingDateDay'],
  };
  const headers = {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    origin: 'https://casayes.pt',
    referer: 'https://casayes.pt/pt/comprar/casaseapartamentos',
    beedigital: 'casayes',
    device: 'web',
    languageid: '9',
    tenantid: '7',
    ...headersCommon,
    ...getCasayesHeadersFromEnv(),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const json = await res.json();
      const items = parseCasayes(json);
      if (!items.length) {
        warnings.push({
          source: 'casayes',
          error: 'casayes_empty',
          payload,
          bodySnippet: JSON.stringify(json).slice(0, 300),
        });
      }
      return { items, warnings, method };
    }
    const bodySnippet = await res.text();
    warnings.push({
      source: 'casayes',
      error: 'casayes_unavailable',
      status: res.status,
      statusText: res.statusText,
      bodySnippet: bodySnippet.slice(0, 300),
      payload,
    });
    return { items: [], warnings, method };
  } catch (err) {
    warnings.push({
      source: 'casayes',
      error: 'casayes_failed',
      message: err instanceof Error ? err.message : 'unknown',
      payload,
    });
    return { items: [], warnings, method };
  }
}

module.exports = {
  fetchCasayes,
};
