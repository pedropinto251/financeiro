const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'data', 'portugal-locations.json');

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const REQUEST_TIMEOUT_MS = 15000;

async function fetchJson(url, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    console.log(`→ Fetch ${url} (tentativa ${i + 1}/${attempts})`);
    let res;
    try {
      res = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'financeiro/1.0 (build-portugal-locations)',
        },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      console.warn(`   Falhou (tentativa ${i + 1}): ${err.message || err}`);
      await sleep(1000 * (i + 1));
      continue;
    }
    clearTimeout(timeout);
    if (res.ok) return res.json();
    const retryAfter = res.headers.get('retry-after');
    if (res.status === 429) {
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 1000 * (i + 1);
      if (waitMs > 60000) {
        console.warn(`   429 rate limit. Retry-After demasiado alto (${Math.ceil(waitMs / 1000)}s). A saltar URL...`);
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        break;
      }
      console.warn(`   429 rate limit. Aguardar ${Math.ceil(waitMs / 1000)}s...`);
      await sleep(waitMs);
      lastErr = new Error(`HTTP ${res.status} for ${url}`);
      continue;
    }
    lastErr = new Error(`HTTP ${res.status} for ${url}`);
    break;
  }
  throw lastErr || new Error(`HTTP error for ${url}`);
}

async function main() {
  const urls = [
    'https://json.geoapi.pt/distritos/municipios',
    'https://geoapi.pt/distritos/municipios?json=1',
  ];
  let payload = null;
  let lastErr = null;

  for (const url of urls) {
    try {
      payload = await fetchJson(url);
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!payload) {
    throw lastErr || new Error('failed to fetch districts');
  }

  const districts = [];
  const byDistrict = {};

  payload.forEach((entry) => {
    const name = entry.distrito || entry.Distrito || entry.nome || entry.name;
    const municipios = entry.municipios || entry.concelhos || entry.municipios || [];
    if (!name || !Array.isArray(municipios)) return;
    const district = { name: String(name), slug: slugify(name) };
    districts.push(district);
    byDistrict[district.slug] = municipios
      .map((m) => {
        if (typeof m === 'string') return m;
        if (m && typeof m === 'object') {
          return m.nome || m.name || m.municipio || m.Municipio || m.concelho || m.Concelho || '';
        }
        return '';
      })
      .filter(Boolean)
      .map((m) => ({
        name: String(m),
        slug: slugify(m),
      }));
  });

  const output = {
    districts: districts.sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    byDistrict,
    source: 'geoapi.pt',
    updatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`Saved ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
