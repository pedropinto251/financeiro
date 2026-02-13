const { mergeEstateItems, slugify } = require('./utils');
const { fetchImovirtual } = require('./providers/imovirtual');
const { fetchSupercasa } = require('./providers/supercasa');
const { fetchCasacerta } = require('./providers/casacerta');
const { fetchCasayes } = require('./providers/casayes');
const { fetchGreenacres } = require('./providers/greenacres');

const buildHeaders = () => ({
  'accept-language': 'pt-PT,pt;q=0.9,en;q=0.8',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
});

async function fetchRealEstateData({ districtRaw = 'aveiro', councilRaw = 'espinho', page = 1 }) {
  const normalizeSlug = (value) => slugify(value);
  const district = normalizeSlug(districtRaw) || 'aveiro';
  const council = normalizeSlug(councilRaw) || 'espinho';
  const headersCommon = buildHeaders();

  const [imovirtualRes, supercasaRes, greenacresRes] = await Promise.all([
    fetchImovirtual({ district, council, page, headersCommon }),
    fetchSupercasa({ district, council, page, headersCommon }),
    fetchGreenacres({ council, page, headersCommon }),
  ]);

  const [casacertaRes, casayesRes] = await Promise.all([
    fetchCasacerta({ districtRaw, councilRaw, district, council, page, headersCommon }),
    fetchCasayes({ districtRaw, councilRaw, page, headersCommon }),
  ]);

  const warnings = [
    ...imovirtualRes.warnings,
    ...supercasaRes.warnings,
    ...casacertaRes.warnings,
    ...casayesRes.warnings,
    ...greenacresRes.warnings,
  ];

  const methods = {
    imovirtual: imovirtualRes.method,
    supercasa: supercasaRes.method,
    casacerta: casacertaRes.method,
    casayes: casayesRes.method,
    greenacres: greenacresRes.method,
  };

  const combined = mergeEstateItems(
    [
      ...imovirtualRes.items,
      ...supercasaRes.items,
      ...casacertaRes.items,
      ...casayesRes.items,
      ...greenacresRes.items,
    ],
    { district, council }
  );

  return {
    imovirtual: imovirtualRes.items,
    supercasa: supercasaRes.items,
    casacerta: casacertaRes.items,
    casayes: casayesRes.items,
    greenacres: greenacresRes.items,
    combined,
    warnings,
    methods,
    page,
    district,
    council,
  };
}

module.exports = {
  fetchRealEstateData,
};
