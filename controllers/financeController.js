const path = require('path');
const { ensureGroupForUser, linkUserToGroupByEmail } = require('../models/financeGroupModel');
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  ensureDefaultCategories,
} = require('../models/financeCategoryModel');
const { listBudgets, upsertBudget, updateBudget, deleteBudget } = require('../models/financeBudgetModel');
const {
  createTransaction,
  listRecentTransactions,
  listTransactions,
  countTransactions,
  getMonthlySummary,
  getYearSummary,
  getTotalSummary,
  getExpenseByCategory,
  updateTransaction,
  voidTransaction,
  deleteTransaction,
} = require('../models/financeTransactionModel');
const {
  listGoals,
  createGoal,
  getGoalById,
  addAllocation,
  listAllocations,
  getAllocationById,
  updateAllocation,
  deleteAllocation,
  getGoalAllocatedTotal,
  getTotalAllocated,
  getMonthlyAllocated,
  updateGoalStatus,
  updateGoal,
  deleteGoal,
} = require('../models/goalModel');
const { createDocument, getDocumentById, listDocumentsByTransaction, deleteDocumentsByTransaction } = require('../models/financeDocumentModel');
const {
  listProjects,
  createProject,
  listLists,
  createList,
  listWishlistItems,
  createWishlistItem,
  markWishlistPurchased,
  revertWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  getWishlistImageById,
  getWishlistItemById,
} = require('../models/wishlistModel');
const { createShare, listSharedItemsForUser } = require('../models/wishlistShareModel');
const {
  getSimUserByEmail,
  listSimUsers,
  createSimUser,
  updateSimUser,
  getSimUserByEmailExceptId,
} = require('../models/simulatorUserModel');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateDisplay(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function normalizeMonthInput(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 10);
  return null;
}

const IMOVIRTUAL_BUILD_ID = 'DgbmbX0jiylTfZDI15F3j';
let imovirtualBuildIdCache = {
  value: IMOVIRTUAL_BUILD_ID,
  expiresAt: 0,
};
const IMOVIRTUAL_BASE =
  'https://www.imovirtual.com/_next/data';
const SUPERCASA_BASE = 'https://supercasa.pt/comprar-casas';

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

function getCasayesHeadersFromEnv() {
  const headers = {};
  if (process.env.CASAYES_SESSIONID) headers.sessionid = process.env.CASAYES_SESSIONID;
  if (process.env.CASAYES_TENANTID) headers.tenantid = process.env.CASAYES_TENANTID;
  if (process.env.CASAYES_LANGUAGEID) headers.languageid = process.env.CASAYES_LANGUAGEID;
  if (process.env.CASAYES_DEVICE) headers.device = process.env.CASAYES_DEVICE;
  if (process.env.CASAYES_BEEDIGITAL) headers.beedigital = process.env.CASAYES_BEEDIGITAL;
  return headers;
}

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

function parseImovirtual(payload) {
  const items = (payload && payload.pageProps && payload.pageProps.data && payload.pageProps.data.searchAds && payload.pageProps.data.searchAds.items) || [];
  return items.map((item) => {
    const slug = typeof item.slug === 'string' ? item.slug : '';
    const url = slug
      ? `https://www.imovirtual.com/pt/anuncio/${slug}`
      : null;
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
    };
  });
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

    const priceMatch = block.match(/class=\"responsive-text-24[^"]*\">([\s\S]*?)<\/p>/);
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
    };
  });
}

function normalizeTitle(value) {
  return cleanText(String(value || ''))
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function mergeEstateItems(items, meta) {
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
  });

  return Array.from(map.values());
}

async function withGroup(req) {
  const groupId = await ensureGroupForUser(req.user);
  if (!req.session.simUser.finance_group_id) {
    req.session.simUser.finance_group_id = groupId;
    req.user.finance_group_id = groupId;
  }
  return groupId;
}

function buildMessages(query) {
  const noticeMap = {
    category: 'Categoria criada com sucesso.',
    budget: 'Budget guardado.',
    transaction: 'Movimento guardado.',
    shared: 'Financas partilhadas com sucesso.',
    wishlist: 'Item guardado no planeamento.',
    purchased: 'Item marcado como comprado.',
    share: 'Partilha criada com sucesso.',
    goal: 'Objetivo criado com sucesso.',
    allocated: 'Poupanca alocada ao objetivo.',
    user: 'Utilizador criado com sucesso.',
    updated: 'Alteracoes guardadas.',
    deleted: 'Registo apagado.',
    reverted: 'Item voltou a planeado.',
  };
  const errorMap = {
    'missing-category': 'Preenche o nome da categoria.',
    'missing-budget': 'Preenche todos os campos do budget.',
    'missing-transaction': 'Preenche tipo, valor e data.',
    'missing-share': 'Indica o email para partilhar.',
    'share-missing': 'O utilizador nao existe.',
    'share-self': 'Nao podes partilhar contigo proprio.',
    'missing-wishlist': 'Preenche o nome do item.',
    'missing-price': 'Indica o preco para registar a compra.',
    'missing-purchase': 'Indica a data de compra.',
    'missing-project': 'Escolhe um projeto e uma lista.',
    'missing-permission': 'Escolhe uma permissao.',
    'share-owner': 'Nao podes partilhar com o mesmo grupo.',
    'missing-edit': 'Preenche os campos obrigatorios.',
    'missing-goal': 'Preenche o nome e o valor do objetivo.',
    'missing-allocation': 'Indica objetivo, valor e data.',
    'insufficient-funds': 'Saldo insuficiente para alocar.',
    'missing-user': 'Preenche nome, email e password.',
    'user-exists': 'Este email ja esta registado.',
    'missing-user-edit': 'Preenche nome e email.',
    'missing-category-edit': 'Preenche nome e tipo da categoria.',
    'missing-budget-edit': 'Preenche todos os campos do budget.',
  };
  return {
    notice: query.notice ? (noticeMap[query.notice] || query.notice) : null,
    error: query.error ? (errorMap[query.error] || query.error) : null,
  };
}

async function renderDashboard(req, res, next) {
  try {
    const groupId = await withGroup(req);
    await ensureDefaultCategories(groupId);
    const now = new Date();
    const start = monthStart(now);
    const end = monthEnd(now);

    const yearStartDate = new Date(now.getFullYear(), 0, 1);
    const yearEndDate = new Date(now.getFullYear(), 11, 31);

    const [summary, byCategory, yearSummary, goals, totalSummary, totalAllocated, monthlyAllocated, categories] = await Promise.all([
      getMonthlySummary(groupId, formatDate(start), formatDate(end)),
      getExpenseByCategory(groupId, formatDate(start), formatDate(end)),
      getYearSummary(groupId, formatDate(yearStartDate), formatDate(yearEndDate)),
      listGoals(groupId),
      getTotalSummary(groupId),
      getTotalAllocated(groupId),
      getMonthlyAllocated(groupId, formatDate(start), formatDate(end)),
      listCategories(groupId),
    ]);

    const incomeTotal = Number(totalSummary.total_income || 0);
    const expenseTotal = Number(totalSummary.total_expense || 0);
    const balanceTotal = incomeTotal - expenseTotal;
    const allocatedTotal = Number(totalAllocated || 0);
    const availableTotal = balanceTotal - allocatedTotal;

    const maxCategory = byCategory.reduce((max, row) => Math.max(max, Number(row.total || 0)), 0) || 0;
    const byCategoryWithPerc = byCategory.map(row => ({
      ...row,
      percent: maxCategory ? Math.round((Number(row.total || 0) / maxCategory) * 100) : 0,
    }));

    res.render('dashboard', {
      title: 'Dashboard',
      user: req.user,
      active: 'dashboard',
      summary: {
        income: Number(summary.total_income || 0),
        expense: Number(summary.total_expense || 0),
        allocated: Number(monthlyAllocated || 0),
      },
      yearSummary: {
        income: Number(yearSummary.total_income || 0),
        expense: Number(yearSummary.total_expense || 0),
      },
      byCategory: byCategoryWithPerc,
      categories,
      goals,
      availableTotal,
      allocatedTotal,
      balanceTotal,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderTransactions(req, res, next) {
  try {
    const groupId = await withGroup(req);
    await ensureDefaultCategories(groupId);
    const page = Math.max(1, Number(req.query.page || 1));
    const perPage = 20;
    const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
    const offset = (page - 1) * perPage;

    const [categories, recent, total] = await Promise.all([
      listCategories(groupId),
      listTransactions({ groupId, categoryId, limit: perPage, offset }),
      countTransactions({ groupId, categoryId }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    res.render('transactions', {
      title: 'Movimentos',
      user: req.user,
      active: 'transactions',
      categories,
      recent,
      page,
      totalPages,
      categoryId,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderCategories(req, res, next) {
  try {
    const groupId = await withGroup(req);
    await ensureDefaultCategories(groupId);
    const categories = await listCategories(groupId);
    res.render('categories', {
      title: 'Categorias',
      user: req.user,
      active: 'categories',
      categories,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderBudgets(req, res, next) {
  try {
    const groupId = await withGroup(req);
    await ensureDefaultCategories(groupId);
    const [categories, budgets] = await Promise.all([
      listCategories(groupId),
      listBudgets(groupId),
    ]);
    res.render('budgets', {
      title: 'Budgets',
      user: req.user,
      active: 'budgets',
      categories,
      budgets,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderShare(req, res, next) {
  try {
    await withGroup(req);
    res.render('share', {
      title: 'Partilhar',
      user: req.user,
      active: 'share',
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderWishlist(req, res, next) {
  try {
    const groupId = await withGroup(req);
    await ensureDefaultCategories(groupId);
    const [projects, items, categories, sharedItems] = await Promise.all([
      listProjects(groupId),
      listWishlistItems(groupId),
      listCategories(groupId),
      listSharedItemsForUser(req.user.id),
    ]);
    const listsByProject = new Map();
    for (const project of projects) {
      const lists = await listLists(groupId, project.id);
      listsByProject.set(project.id, lists);
    }
    const expenseCategories = categories.filter(c => c.tipo === 'expense');
    res.render('wishlist', {
      title: 'Planeamento',
      user: req.user,
      active: 'wishlist',
      projects,
      listsByProject,
      items,
      sharedItems,
      expenseCategories,
      dateDisplay: formatDateDisplay,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderGoals(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const [goals, allocations, totalSummary, totalAllocated] = await Promise.all([
      listGoals(groupId),
      listAllocations(groupId, 50),
      getTotalSummary(groupId),
      getTotalAllocated(groupId),
    ]);

    const income = Number(totalSummary.total_income || 0);
    const expense = Number(totalSummary.total_expense || 0);
    const balance = income - expense;
    const available = balance - Number(totalAllocated || 0);

    res.render('goals', {
      title: 'Objetivos',
      user: req.user,
      active: 'goals',
      goals,
      allocations,
      summary: {
        income,
        expense,
        balance,
        allocated: Number(totalAllocated || 0),
        available,
      },
      dateDisplay: formatDateDisplay,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function renderRealEstate(req, res, next) {
  try {
    res.render('realestate', {
      title: 'Imoveis',
      user: req.user,
      active: 'realestate',
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function handleRealEstateData(req, res) {
  try {
    const districtRaw = (req.query.district || 'aveiro').toString();
    const councilRaw = (req.query.council || 'espinho').toString();
    const pageRaw = Number(req.query.page || 1);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

    const normalizeSlug = (value) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const district = normalizeSlug(districtRaw) || 'aveiro';
    const council = normalizeSlug(councilRaw) || 'espinho';

    const headersCommon = {
      'accept-language': 'pt-PT,pt;q=0.9,en;q=0.8',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };
    const imovirtualBuildId = await getImovirtualBuildId(district, council, headersCommon);
    const imovirtualUrl = `${IMOVIRTUAL_BASE}/${imovirtualBuildId}/pt/resultados/comprar/apartamento/${district}/${council}.json?limit=36&ownerTypeSingleSelect=ALL&by=DEFAULT&direction=DESC&searchingCriteria=comprar&searchingCriteria=apartamento&searchingCriteria=${encodeURIComponent(
      district
    )}&searchingCriteria=${encodeURIComponent(council)}&page=${page}`;

    const supercasaUrl = `${SUPERCASA_BASE}/${district}/${council}/pagina-${page}`;
    const casacertaPlacesUrl = `https://casacerta.pt/api/placesvue?locais=${encodeURIComponent(councilRaw || council)}&format=json`;
    const casayesUrl = 'https://casayes.pt/api/frontend/frontendlisting/SearchWithPagination';
    const safeReadText = async (response, limit) => {
      try {
        const text = await response.text();
        if (!text) return '';
        return text.slice(0, limit);
      } catch {
        return '';
      }
    };
    const fetchSupercasaWithBrowserless = async (targetUrl) => {
      const token = process.env.BROWSERLESS_TOKEN;
      if (!token) return { ok: false, error: 'browserless_token_missing', html: '' };
      try {
        const endpoint = `https://chrome.browserless.io/function?token=${token}`;
        const code = `export default async function ({ page }) {
  await page.setUserAgent(${JSON.stringify(headersCommon['user-agent'])});
  await page.setViewport({ width: 1366, height: 768 });
  await page.setExtraHTTPHeaders({
    'accept-language': ${JSON.stringify(headersCommon['accept-language'])},
  });
  await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector('.list-properties', { timeout: 15000 });
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
          return {
            ok: false,
            error: `browserless_${resp.status}`,
            html: '',
            bodySnippet,
          };
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
              return {
                ok: false,
                error: 'browserless_empty',
                html: '',
                bodySnippet: JSON.stringify(payload).slice(0, 300),
              };
            }
          } catch {
            return {
              ok: false,
              error: 'browserless_parse_failed',
              html: '',
              bodySnippet: bodyText.slice(0, 300),
            };
          }
        } else {
          html = bodyText;
        }
        if (/Just a moment/i.test(html)) {
          return {
            ok: false,
            error: 'browserless_blocked',
            html,
            bodySnippet: html.slice(0, 300),
          };
        }
        if (!/list-properties/i.test(html)) {
          return {
            ok: false,
            error: 'browserless_empty',
            html,
            bodySnippet: html.slice(0, 300),
          };
        }
        return { ok: true, html };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'browserless_failed', html: '' };
      }
    };
    const extraSupercasaHeaders = getExtraHeadersFromEnv();
    const [imovirtualRes, supercasaRes] = await Promise.all([
      fetch(imovirtualUrl, {
        headers: { accept: 'application/json', ...headersCommon },
      }),
      fetch(supercasaUrl, {
        headers: {
          accept: '*/*',
          'cache-control': 'no-cache',
          ...headersCommon,
          referer: 'https://supercasa.pt/',
          ...extraSupercasaHeaders,
        },
      }),
    ]);

    let imovirtual = [];
    let supercasa = [];
    let casacerta = [];
    let casayes = [];
    const methods = {
      imovirtual: 'fetch',
      supercasa: 'fetch',
      casacerta: 'fetch',
      casayes: 'fetch',
    };
    const warnings = [];

    if (imovirtualRes.ok) {
      const imovirtualJson = await imovirtualRes.json();
      imovirtual = parseImovirtual(imovirtualJson);
    } else {
      const bodySnippet = await safeReadText(imovirtualRes, 300);
      warnings.push({
        source: 'imovirtual',
        error: 'imovirtual_unavailable',
        status: imovirtualRes.status,
        statusText: imovirtualRes.statusText,
        bodySnippet,
      });
    }

    if (supercasaRes.ok) {
      const supercasaHtml = await supercasaRes.text();
      if (/Just a moment/i.test(supercasaHtml)) {
        const bl = await fetchSupercasaWithBrowserless(supercasaUrl);
        if (bl.ok) {
          supercasa = parseSupercasa(bl.html);
          methods.supercasa = 'browserless';
        } else {
          warnings.push({
            source: 'supercasa',
            error: bl.error || 'supercasa_cloudflare',
            browserlessError: bl.error || undefined,
            browserlessBody: bl.bodySnippet || undefined,
          });
          methods.supercasa = bl.error === 'browserless_empty' ? 'browserless_empty' : 'blocked';
        }
      } else {
        supercasa = parseSupercasa(supercasaHtml);
        methods.supercasa = 'fetch';
      }
    } else {
      const bodySnippet = await safeReadText(supercasaRes, 300);
      const bl = await fetchSupercasaWithBrowserless(supercasaUrl);
      if (bl.ok) {
        supercasa = parseSupercasa(bl.html);
        methods.supercasa = 'browserless';
      } else {
        warnings.push({
          source: 'supercasa',
          error: 'supercasa_unavailable',
          status: supercasaRes.status,
          statusText: supercasaRes.statusText,
          bodySnippet,
          browserlessError: bl.error || undefined,
          browserlessBody: bl.bodySnippet || undefined,
        });
        methods.supercasa = bl.error === 'browserless_empty' ? 'browserless_empty' : 'blocked';
      }
    }

    const selectCasacertaLocation = (entries) => {
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

    try {
      const placesRes = await fetch(casacertaPlacesUrl, {
        headers: { accept: 'application/json', ...headersCommon },
      });
      if (placesRes.ok) {
        const places = await placesRes.json();
        const selected = selectCasacertaLocation(places);
        if (selected && selected.api_id) {
          const casacertaUrl = `https://casacerta.pt/imoveis?finalidade=Venda&proptype=1%2C2%2C7&county=${encodeURIComponent(
            selected.api_id
          )}&useRef=useRef&pageNo=${page}`;
          const casacertaRes = await fetch(casacertaUrl, {
            headers: {
              accept: '*/*',
              ...headersCommon,
              referer: 'https://casacerta.pt/',
            },
          });
          if (casacertaRes.ok) {
            const casacertaHtml = await casacertaRes.text();
            casacerta = parseCasacerta(casacertaHtml);
          } else {
            const bodySnippet = await safeReadText(casacertaRes, 300);
            warnings.push({
              source: 'casacerta',
              error: 'casacerta_unavailable',
              status: casacertaRes.status,
              statusText: casacertaRes.statusText,
              bodySnippet,
            });
          }
        } else {
          warnings.push({
            source: 'casacerta',
            error: 'casacerta_location_not_found',
          });
        }
      } else {
        const bodySnippet = await safeReadText(placesRes, 300);
        warnings.push({
          source: 'casacerta',
          error: 'casacerta_places_unavailable',
          status: placesRes.status,
          statusText: placesRes.statusText,
          bodySnippet,
        });
      }
    } catch (err) {
      warnings.push({
        source: 'casacerta',
        error: 'casacerta_failed',
        message: err instanceof Error ? err.message : 'unknown',
      });
    }

    try {
      const casayesPayload = {
        filters: [
          {
            field: 'autocompletePublicId,autocompleteExternalPublicId,regionName1,regionName2,regionName3,addressZipCode',
            operationType: 'multipleField',
            operator: 'Contains',
            value: councilRaw || council,
          },
          {
            field: 'businessTypeId',
            operationType: 'int',
            operator: '=',
            value: '1',
          },
          {
            field: 'listingTypeId',
            operationType: 'multiple',
            operator: '=',
            value: '1,2,10',
          },
        ],
        pageNumber: page,
        pageSize: 20,
        sort: ['-Relevance', '-PublishingDateDay'],
      };
      const casayesHeaders = {
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
      const casayesRes = await fetch(casayesUrl, {
        method: 'POST',
        headers: casayesHeaders,
        body: JSON.stringify(casayesPayload),
      });
      if (casayesRes.ok) {
        const casayesJson = await casayesRes.json();
        casayes = parseCasayes(casayesJson);
        if (!casayes.length) {
          const fallbackPayload = {
            filters: [
              {
                field: 'regionName2',
                operationType: 'string',
                operator: 'Contains',
                value: councilRaw || council,
              },
              {
                field: 'businessTypeId',
                operationType: 'int',
                operator: '=',
                value: '1',
              },
              {
                field: 'listingTypeId',
                operationType: 'multiple',
                operator: '=',
                value: '1,2,10',
              },
            ],
            pageNumber: page,
            pageSize: 20,
            sort: ['-Relevance', '-PublishingDateDay'],
          };
          const fallbackRes = await fetch(casayesUrl, {
            method: 'POST',
            headers: casayesHeaders,
            body: JSON.stringify(fallbackPayload),
          });
          if (fallbackRes.ok) {
            const fallbackJson = await fallbackRes.json();
            casayes = parseCasayes(fallbackJson);
            if (!casayes.length) {
              warnings.push({
                source: 'casayes',
                error: 'casayes_empty',
                payload: fallbackPayload,
                bodySnippet: JSON.stringify(fallbackJson).slice(0, 300),
              });
            }
          } else {
            const bodySnippet = await safeReadText(fallbackRes, 300);
            warnings.push({
              source: 'casayes',
              error: 'casayes_unavailable',
              status: fallbackRes.status,
              statusText: fallbackRes.statusText,
              bodySnippet,
            });
          }
        }
      } else {
        const bodySnippet = await safeReadText(casayesRes, 300);
        warnings.push({
          source: 'casayes',
          error: 'casayes_unavailable',
          status: casayesRes.status,
          statusText: casayesRes.statusText,
          bodySnippet,
        });
      }
    } catch (err) {
      warnings.push({
        source: 'casayes',
        error: 'casayes_failed',
        message: err instanceof Error ? err.message : 'unknown',
      });
    }

    const combined = mergeEstateItems(
      [...imovirtual, ...supercasa, ...casacerta, ...casayes],
      { district, council }
    );
    return res.json({ imovirtual, supercasa, casacerta, casayes, combined, warnings, methods, page, district, council });
  } catch (err) {
    console.error('realestate:data failed', err);
    return res.status(500).json({
      error: 'server',
      message: err instanceof Error ? err.message : 'unknown',
      cause: err && typeof err === 'object' && err.cause ? String(err.cause) : undefined,
    });
  }
}

async function renderAdminUsers(req, res, next) {
  try {
    const users = await listSimUsers();
    res.render('admin-users', {
      title: 'Utilizadores',
      user: req.user,
      active: 'admin-users',
      users,
      ...buildMessages(req.query),
    });
  } catch (err) {
    return next(err);
  }
}

async function handleCreateCategory(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { name, type } = req.body;
    if (!name) return res.redirect('/categories?error=missing-category');
    const safeType = type === 'income' ? 'income' : 'expense';
    await createCategory({ groupId, name: name.trim(), type: safeType });
    return res.redirect('/categories?notice=category');
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateCategory(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id, name, type } = req.body;
    if (!id || !name || !type) return res.redirect('/categories?error=missing-category-edit');
    const safeType = type === 'income' ? 'income' : 'expense';
    await updateCategory({
      groupId,
      id: Number(id),
      name: name.trim(),
      type: safeType,
    });
    return res.redirect('/categories?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteCategory(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id } = req.body;
    if (!id) return res.redirect('/categories');
    await deleteCategory(groupId, Number(id));
    return res.redirect('/categories?notice=deleted');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateBudget(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { category_id, month, amount } = req.body;
    const normalizedMonth = normalizeMonthInput(month);
    if (!category_id || !normalizedMonth || !amount) {
      return res.redirect('/budgets?error=missing-budget');
    }
    await upsertBudget({
      groupId,
      categoryId: Number(category_id),
      month: normalizedMonth,
      amount: Number(amount),
    });
    return res.redirect('/budgets?notice=budget');
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateBudget(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id, category_id, month, amount } = req.body;
    const normalizedMonth = normalizeMonthInput(month);
    if (!id || !category_id || !normalizedMonth || !amount) {
      return res.redirect('/budgets?error=missing-budget-edit');
    }
    await updateBudget({
      groupId,
      id: Number(id),
      categoryId: Number(category_id),
      month: normalizedMonth,
      amount: Number(amount),
    });
    return res.redirect('/budgets?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteBudget(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id } = req.body;
    if (!id) return res.redirect('/budgets');
    await deleteBudget(groupId, Number(id));
    return res.redirect('/budgets?notice=deleted');
  } catch (err) {
    return next(err);
  }
}
async function handleCreateTransaction(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { type, amount, date, description, source, category_id } = req.body;
    if (!type || !amount || !date) {
      return res.redirect('/transactions?error=missing-transaction');
    }
    const safeType = type === 'income' ? 'income' : 'expense';
    const transactionId = await createTransaction({
      groupId,
      userId: req.user.id,
      type: safeType,
      categoryId: category_id ? Number(category_id) : null,
      amount: Number(amount),
      occurredOn: date,
      description: description ? description.trim() : null,
      source: source ? source.trim() : null,
    });

    if (req.file) {
      await createDocument({
        groupId,
        transactionId,
        userId: req.user.id,
        originalName: req.file.originalname,
        filePath: req.file.filename,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      });
    }

    return res.redirect('/transactions?notice=transaction');
  } catch (err) {
    return next(err);
  }
}

async function handleShare(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.redirect('/share?error=missing-share');
    const result = await linkUserToGroupByEmail({
      ownerUserId: req.user.id,
      ownerGroupId: groupId,
      email,
    });
    if (!result.ok) {
      return res.redirect(`/share?error=share-${result.reason}`);
    }
    return res.redirect('/share?notice=shared');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateWishlist(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { name, description, link_url, price, target_date, purchased_date, category_id, project_id, list_id } = req.body;
    if (!name) return res.redirect('/wishlist?error=missing-wishlist');
    if (!project_id || !list_id) return res.redirect('/wishlist?error=missing-project');
    const wantsPurchased = Boolean(purchased_date);
    if (wantsPurchased && (!price || Number(price) <= 0)) {
      return res.redirect('/wishlist?error=missing-price');
    }

    let transactionId = null;
    if (wantsPurchased) {
      transactionId = await createTransaction({
        groupId,
        userId: req.user.id,
        type: 'expense',
        categoryId: category_id ? Number(category_id) : null,
        amount: Number(price),
        occurredOn: purchased_date,
        description: `Compra: ${String(name).trim()}`,
        source: null,
      });
    }

    await createWishlistItem({
      groupId,
      projectId: Number(project_id),
      listId: Number(list_id),
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      imagePath: req.file ? req.file.filename : null,
      linkUrl: link_url ? String(link_url).trim() : null,
      price: price ? Number(price) : null,
      targetDate: target_date || null,
      status: wantsPurchased ? 'purchased' : 'planned',
      purchasedDate: wantsPurchased ? purchased_date : null,
      transactionId,
    });

    return res.redirect('/wishlist?notice=wishlist');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateWishlistProject(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { name, note } = req.body;
    if (!name) return res.redirect('/wishlist?error=missing-project');
    await createProject({ groupId, name: String(name).trim(), note: note ? String(note).trim() : null });
    return res.redirect('/wishlist?notice=project');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateWishlistList(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { project_id, name } = req.body;
    if (!project_id || !name) return res.redirect('/wishlist?error=missing-list');
    await createList({ groupId, projectId: Number(project_id), name: String(name).trim() });
    return res.redirect('/wishlist?notice=list');
  } catch (err) {
    return next(err);
  }
}

async function handleMarkWishlistPurchased(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { item_id, purchased_date, price, category_id } = req.body;
    if (!item_id || !purchased_date) {
      return res.redirect('/wishlist?error=missing-purchase');
    }
    let transactionId = null;
    if (price && Number(price) > 0) {
      transactionId = await createTransaction({
        groupId,
        userId: req.user.id,
        type: 'expense',
        categoryId: category_id ? Number(category_id) : null,
        amount: Number(price),
        occurredOn: purchased_date,
        description: 'Compra (planeamento)',
        source: null,
      });
    }

    await markWishlistPurchased({
      groupId,
      itemId: Number(item_id),
      purchasedDate: purchased_date,
      price: price ? Number(price) : null,
      transactionId,
    });

    return res.redirect('/wishlist?notice=purchased');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateWishlistShare(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { email, permission, project_id, list_id } = req.body;
    if (!email) return res.redirect('/wishlist?error=missing-share');
    if (!permission) return res.redirect('/wishlist?error=missing-permission');
    if (!project_id) return res.redirect('/wishlist?error=missing-project');

    const user = await getSimUserByEmail(email.trim().toLowerCase());
    if (!user) return res.redirect('/wishlist?error=share-missing');
    if (Number(user.id) === Number(req.user.id)) return res.redirect('/wishlist?error=share-self');
    if (user.finance_group_id && Number(user.finance_group_id) === Number(groupId)) {
      return res.redirect('/wishlist?error=share-owner');
    }

    await createShare({
      ownerGroupId: groupId,
      projectId: Number(project_id),
      listId: list_id ? Number(list_id) : null,
      sharedWithUserId: user.id,
      permission,
    });

    return res.redirect('/wishlist?notice=share');
  } catch (err) {
    return next(err);
  }
}

async function handleCreateGoal(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { name, target_amount, target_date } = req.body;
    if (!name || !target_amount) return res.redirect('/goals?error=missing-goal');
    await createGoal({
      groupId,
      name: name.trim(),
      targetAmount: Number(target_amount),
      targetDate: target_date || null,
    });
    return res.redirect('/goals?notice=goal');
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateGoal(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { goal_id, name, target_amount, target_date } = req.body;
    if (!goal_id || !name || !target_amount) return res.redirect('/goals?error=missing-goal');
    await updateGoal({
      groupId,
      id: Number(goal_id),
      name: name.trim(),
      targetAmount: Number(target_amount),
      targetDate: target_date || null,
    });

    const goalAllocated = await getGoalAllocatedTotal(groupId, Number(goal_id));
    const status = goalAllocated >= Number(target_amount) ? 'completed' : 'active';
    await updateGoalStatus(groupId, Number(goal_id), status);

    return res.redirect('/goals?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteGoal(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { goal_id } = req.body;
    if (!goal_id) return res.redirect('/goals?error=missing-goal');
    await deleteGoal(groupId, Number(goal_id));
    return res.redirect('/goals?notice=deleted');
  } catch (err) {
    return next(err);
  }
}

async function handleAddAllocation(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { goal_id, amount, date, note } = req.body;
    const backTo = req.body.back_to || '/goals';
    if (!goal_id || !amount || !date) return res.redirect(`${backTo}?error=missing-allocation`);
    const goal = await getGoalById(groupId, Number(goal_id));
    if (!goal) return res.redirect(`${backTo}?error=missing-goal`);

    const totalSummary = await getTotalSummary(groupId);
    const totalAllocated = await getTotalAllocated(groupId);
    const balance = Number(totalSummary.total_income || 0) - Number(totalSummary.total_expense || 0);
    const available = balance - Number(totalAllocated || 0);
    if (Number(amount) > available) {
      return res.redirect(`${backTo}?error=insufficient-funds`);
    }

    await addAllocation({
      groupId,
      goalId: Number(goal_id),
      userId: req.user.id,
      amount: Number(amount),
      date,
      note: note ? String(note).trim() : null,
    });

    const goalAllocated = await getGoalAllocatedTotal(groupId, Number(goal_id));
    if (goal.valor_objetivo && Number(goalAllocated) >= Number(goal.valor_objetivo)) {
      await updateGoalStatus(groupId, Number(goal_id), 'completed');
    }

    return res.redirect(`${backTo}?notice=allocated`);
  } catch (err) {
    return next(err);
  }
}

async function handleCreateUser(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.redirect('/admin/users?error=missing-user');
    const existing = await getSimUserByEmail(email.trim().toLowerCase());
    if (existing) return res.redirect('/admin/users?error=user-exists');

    await createSimUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: String(password),
      role: role === 'admin' ? 'admin' : 'user',
    });
    return res.redirect('/admin/users?notice=user');
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateUser(req, res, next) {
  try {
    const { user_id, name, email, role, active } = req.body;
    if (!user_id || !name || !email) return res.redirect('/admin/users?error=missing-user-edit');
    const existing = await getSimUserByEmailExceptId(email.trim().toLowerCase(), Number(user_id));
    if (existing) return res.redirect('/admin/users?error=user-exists');

    await updateSimUser({
      id: Number(user_id),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role === 'admin' ? 'admin' : 'user',
      active: active === '1' || active === 'on',
    });
    return res.redirect('/admin/users?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateAllocation(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { allocation_id, goal_id, amount, date, note } = req.body;
    const backTo = req.body.back_to || '/goals';
    if (!allocation_id || !goal_id || !amount || !date) {
      return res.redirect(`${backTo}?error=missing-allocation`);
    }
    const allocation = await getAllocationById(groupId, Number(allocation_id));
    if (!allocation) return res.redirect(`${backTo}?error=missing-allocation`);

    const totalSummary = await getTotalSummary(groupId);
    const totalAllocated = await getTotalAllocated(groupId);
    const balance = Number(totalSummary.total_income || 0) - Number(totalSummary.total_expense || 0);
    const available = balance - Number(totalAllocated || 0);
    const delta = Number(amount) - Number(allocation.valor || 0);
    if (delta > available) {
      return res.redirect(`${backTo}?error=insufficient-funds`);
    }

    await updateAllocation({
      groupId,
      id: Number(allocation_id),
      goalId: Number(goal_id),
      amount: Number(amount),
      date,
      note: note ? String(note).trim() : null,
    });

    const goal = await getGoalById(groupId, Number(goal_id));
    const goalAllocated = await getGoalAllocatedTotal(groupId, Number(goal_id));
    if (goal && goal.valor_objetivo && Number(goalAllocated) >= Number(goal.valor_objetivo)) {
      await updateGoalStatus(groupId, Number(goal_id), 'completed');
    }

    return res.redirect(`${backTo}?notice=updated`);
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteAllocation(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { allocation_id } = req.body;
    const backTo = req.body.back_to || '/goals';
    if (!allocation_id) return res.redirect(`${backTo}?error=missing-allocation`);
    await deleteAllocation(groupId, Number(allocation_id));
    return res.redirect(`${backTo}?notice=deleted`);
  } catch (err) {
    return next(err);
  }
}

async function handleWishlistImage(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const itemId = Number(req.params.id);
    if (!itemId) return res.redirect('/wishlist');
    const row = await getWishlistImageById(groupId, itemId);
    if (!row || !row.imagem_path) return res.redirect('/wishlist');
    const filePath = path.join(__dirname, '..', 'private_uploads', 'wishlist', row.imagem_path);
    return res.sendFile(filePath);
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateTransaction(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id, type, amount, date, description, category_id } = req.body;
    if (!id || !type || !amount || !date) {
      return res.redirect('/transactions?error=missing-edit');
    }
    await updateTransaction({
      groupId,
      id: Number(id),
      type: type === 'income' ? 'income' : 'expense',
      categoryId: category_id ? Number(category_id) : null,
      amount: Number(amount),
      occurredOn: date,
      description: description ? description.trim() : null,
    });
    return res.redirect('/transactions?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleVoidTransaction(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id } = req.body;
    if (!id) return res.redirect('/transactions');
    await voidTransaction(groupId, Number(id));
    return res.redirect('/transactions?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteTransaction(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { id } = req.body;
    if (!id) return res.redirect('/transactions');
    const docs = await listDocumentsByTransaction(groupId, Number(id));
    for (const doc of docs) {
      const filePath = path.join(__dirname, '..', 'private_uploads', doc.file_path);
      require('fs').promises.unlink(filePath).catch(() => {});
    }
    await deleteDocumentsByTransaction(groupId, Number(id));
    await deleteTransaction(groupId, Number(id));
    return res.redirect('/transactions?notice=deleted');
  } catch (err) {
    return next(err);
  }
}

async function handleUpdateWishlistItem(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { item_id, name, description, price, target_date, link_url, list_id } = req.body;
    if (!item_id || !name || !list_id) return res.redirect('/wishlist?error=missing-edit');
    await updateWishlistItem({
      groupId,
      itemId: Number(item_id),
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      price: price ? Number(price) : null,
      targetDate: target_date || null,
      linkUrl: link_url ? String(link_url).trim() : null,
      listId: Number(list_id),
    });
    return res.redirect('/wishlist?notice=updated');
  } catch (err) {
    return next(err);
  }
}

async function handleDeleteWishlistItem(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { item_id } = req.body;
    if (!item_id) return res.redirect('/wishlist');
    await deleteWishlistItem(groupId, Number(item_id));
    return res.redirect('/wishlist?notice=deleted');
  } catch (err) {
    return next(err);
  }
}

async function handleRevertWishlistItem(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const { item_id } = req.body;
    if (!item_id) return res.redirect('/wishlist');
    const item = await getWishlistItemById(groupId, Number(item_id));
    if (item && item.transaction_id) {
      await voidTransaction(groupId, Number(item.transaction_id));
    }
    await revertWishlistItem(groupId, Number(item_id));
    return res.redirect('/wishlist?notice=reverted');
  } catch (err) {
    return next(err);
  }
}

async function handleDownloadDocument(req, res, next) {
  try {
    const groupId = await withGroup(req);
    const docId = Number(req.params.id);
    if (!docId) return res.redirect('/dashboard');
    const doc = await getDocumentById(docId);
    if (!doc || Number(doc.finance_group_id) !== Number(groupId)) {
      return res.redirect('/login');
    }
    const filePath = path.join(__dirname, '..', 'private_uploads', doc.file_path);
    return res.sendFile(filePath);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  renderDashboard,
  renderTransactions,
  renderCategories,
  renderBudgets,
  renderShare,
  renderWishlist,
  renderGoals,
  renderRealEstate,
  renderAdminUsers,
  handleCreateCategory,
  handleUpdateCategory,
  handleDeleteCategory,
  handleCreateBudget,
  handleUpdateBudget,
  handleDeleteBudget,
  handleCreateTransaction,
  handleShare,
  handleDownloadDocument,
  handleCreateWishlist,
  handleCreateWishlistProject,
  handleCreateWishlistList,
  handleMarkWishlistPurchased,
  handleWishlistImage,
  handleCreateWishlistShare,
  handleUpdateTransaction,
  handleVoidTransaction,
  handleDeleteTransaction,
  handleUpdateWishlistItem,
  handleDeleteWishlistItem,
  handleRevertWishlistItem,
  handleCreateGoal,
  handleUpdateGoal,
  handleDeleteGoal,
  handleAddAllocation,
  handleUpdateAllocation,
  handleDeleteAllocation,
  handleCreateUser,
  handleUpdateUser,
  handleRealEstateData,
};
