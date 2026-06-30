<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Dialog from 'primevue/dialog';
import ProgressSpinner from 'primevue/progressspinner';
import api from '@shared/api';
import { fmtEurCents, fmtEur, fmtDate } from '@shared/format';
import TransactionDialog from '../components/TransactionDialog.vue';

const confirm = useConfirm();
const toast = useToast();

const items = ref([]);
const categories = ref([]);
const accounts = ref([]);
const loading = ref(true);
const loadingMore = ref(false);
const page = ref(1);
const totalPages = ref(1);
const total = ref(0);
const sums = ref({ income: 0, expense: 0 });

const q = ref('');
const type = ref('');       // '' | 'income' | 'expense'
const filterCat = ref('');
const dlg = ref(false);
const editing = ref(null);
let searchTimer = null;

async function loadCats() {
  try { categories.value = await api.get('/categories').then((r) => r.categories || r); } catch (e) { /* */ }
  try { accounts.value = await api.get('/accounts').then((r) => r.accounts || []); } catch (e) { /* */ }
}

async function load(reset = true, silent = false) {
  if (reset) { page.value = 1; if (!silent) loading.value = true; }
  else { loadingMore.value = true; }
  try {
    const params = { page: page.value, per_page: 20 };
    if (filterCat.value) params.category_id = filterCat.value;
    if (type.value) params.type = type.value;
    if (q.value.trim()) params.q = q.value.trim();
    const res = await api.get('/transactions', { params });
    items.value = reset ? res.items : [...items.value, ...res.items];
    totalPages.value = res.total_pages;
    total.value = res.total;
    sums.value = res.summary || { income: 0, expense: 0 };
  } catch (e) { /* */ } finally { loading.value = false; loadingMore.value = false; }
}

function applyFilters() { load(true); }
function onSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(() => load(true), 300); }
function setType(t) { type.value = t; load(true); }
function more() { if (page.value < totalPages.value) { page.value++; load(false); } }

const onExternalChange = () => { load(true, true).catch(() => {}); };
onMounted(async () => {
  await Promise.all([loadCats(), load()]);
  window.addEventListener('financeiro:tx-changed', onExternalChange);
});
onUnmounted(() => { window.removeEventListener('financeiro:tx-changed', onExternalChange); clearTimeout(searchTimer); });

function add() { editing.value = null; dlg.value = true; }
function edit(t) { editing.value = t; dlg.value = true; }
async function onSaved() { await load(true, true); }

function remove(t) {
  confirm.require({
    message: `Eliminar este movimento de ${fmtEurCents(t.valor)}?`,
    header: 'Confirmar', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptClass: 'p-button-danger',
    accept: async () => {
      try { await api.delete(`/transactions/${t.id}`); toast.add({ severity: 'success', summary: 'Eliminado', life: 2000 }); await load(true, true); }
      catch (e) { /* */ }
    },
  });
}

// Export
const exportDlg = ref(false);
const _now = new Date();
const exportPeriod = ref('month');
const exportMonth = ref(`${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`);
const exportYear = ref(_now.getFullYear());
function doExport() {
  const url = exportPeriod.value === 'year'
    ? `/reports/export?period=year&year=${exportYear.value}`
    : `/reports/export?period=month&month=${exportMonth.value}`;
  window.open(url, '_blank');
  exportDlg.value = false;
}

const net = computed(() => sums.value.income - sums.value.expense);
const hasFilters = computed(() => !!(q.value.trim() || type.value || filterCat.value));
function clearFilters() { q.value = ''; type.value = ''; filterCat.value = ''; load(true); }

// Agrupar por dia, com total do dia.
const groups = computed(() => {
  const map = new Map();
  for (const t of items.value) {
    const key = String(t.data_ocorrencia).slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  return [...map.entries()].map(([date, rows]) => {
    const dayNet = rows.reduce((a, r) => a + (r.tipo === 'income' ? Number(r.valor) : -Number(r.valor)), 0);
    return { date, rows, dayNet };
  });
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Movimentos</h1><p class="sub">{{ total }} {{ total === 1 ? 'registo' : 'registos' }}{{ hasFilters ? ' (filtrado)' : '' }}</p></div>
      <div class="head-actions">
        <button class="btn btn-sm" @click="exportDlg = true"><i class="pi pi-download" /> Exportar</button>
        <button class="btn btn-primary btn-sm" @click="add"><i class="pi pi-plus" /> Novo</button>
      </div>
    </div>

    <!-- Totais do filtro -->
    <section class="surface card totals">
      <div class="t"><span class="t-l">Entrou</span><span class="t-v pos">{{ fmtEurCents(sums.income) }}</span></div>
      <div class="t"><span class="t-l">Saiu</span><span class="t-v neg">{{ fmtEurCents(sums.expense) }}</span></div>
      <div class="t"><span class="t-l">Saldo</span><span class="t-v" :class="net >= 0 ? 'pos' : 'neg'">{{ fmtEurCents(net) }}</span></div>
    </section>

    <!-- Filtros -->
    <section class="filters">
      <div class="search">
        <i class="pi pi-search" />
        <input v-model="q" @input="onSearch" type="search" placeholder="Pesquisar descrição…" />
        <button v-if="q" class="clear-x" @click="q=''; load(true)" aria-label="Limpar"><i class="pi pi-times" /></button>
      </div>
      <div class="chips">
        <button class="fchip" :class="{ on: type === '' }" @click="setType('')">Todos</button>
        <button class="fchip" :class="{ on: type === 'income' }" @click="setType('income')">Receitas</button>
        <button class="fchip" :class="{ on: type === 'expense' }" @click="setType('expense')">Despesas</button>
        <select class="fcat" v-model="filterCat" @change="applyFilters">
          <option value="">Todas as categorias</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
      </div>
    </section>

    <div v-if="loading" class="loading"><ProgressSpinner style="width:40px;height:40px" strokeWidth="4" /></div>
    <div v-else-if="!items.length" class="surface card empty">
      <i class="pi pi-inbox" />
      {{ hasFilters ? 'Nada corresponde aos filtros.' : 'Ainda não há movimentos.' }}
      <div v-if="hasFilters" style="margin-top:0.8rem"><button class="btn btn-sm" @click="clearFilters">Limpar filtros</button></div>
    </div>

    <template v-else>
      <section v-for="g in groups" :key="g.date" class="surface card group">
        <div class="group-head">
          <span class="group-date">{{ fmtDate(g.date) }}</span>
          <span class="group-net" :class="g.dayNet >= 0 ? 'pos' : 'neg'">{{ g.dayNet >= 0 ? '+' : '−' }}{{ fmtEur(Math.abs(g.dayNet)) }}</span>
        </div>
        <div class="rows">
          <div v-for="t in g.rows" :key="t.id" class="row">
            <div class="tx-icon" :class="t.tipo"><i :class="t.tipo === 'income' ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-right'" /></div>
            <div class="row-main" @click="edit(t)">
              <div class="row-title">{{ t.descricao || t.categoria_nome || (t.tipo === 'income' ? 'Receita' : 'Despesa') }}</div>
              <div class="row-sub">
                <span v-if="t.categoria_nome" class="cat-tag">{{ t.categoria_nome }}</span>
                <span v-if="accounts.length > 1 && t.account_nome" class="acct-tag"><span class="acct-dot" :style="{ background: t.account_cor || '#5b8cff' }" />{{ t.account_nome }}</span>
                <a v-if="t.document_id" :href="`/api/documents/${t.document_id}`" target="_blank" class="doc-link" @click.stop><i class="pi pi-paperclip" /></a>
              </div>
            </div>
            <div class="row-amount" :class="t.tipo === 'income' ? 'pos' : 'neg'">{{ t.tipo === 'income' ? '+' : '−' }}{{ fmtEurCents(t.valor) }}</div>
            <button class="icon-btn danger" @click="remove(t)" aria-label="Eliminar"><i class="pi pi-trash" /></button>
          </div>
        </div>
      </section>

      <button v-if="page < totalPages" class="btn btn-block" @click="more" :disabled="loadingMore">
        <i v-if="loadingMore" class="pi pi-spin pi-spinner" /> Carregar mais
      </button>
    </template>

    <TransactionDialog v-model:visible="dlg" :categories="categories" :accounts="accounts" :transaction="editing" @saved="onSaved" />

    <Dialog v-model:visible="exportDlg" modal header="Exportar relatório" :style="{ width: '400px', maxWidth: '94vw' }" dismissableMask>
      <div class="stack">
        <div class="chips">
          <button type="button" class="fchip" :class="{ on: exportPeriod === 'month' }" @click="exportPeriod = 'month'">Mês</button>
          <button type="button" class="fchip" :class="{ on: exportPeriod === 'year' }" @click="exportPeriod = 'year'">Ano</button>
        </div>
        <label v-if="exportPeriod === 'month'" class="field"><span>Mês (ciclo)</span><input v-model="exportMonth" type="month" /></label>
        <label v-else class="field"><span>Ano (civil)</span><input v-model.number="exportYear" type="number" min="2000" max="2100" /></label>
        <button class="btn btn-primary btn-block" @click="doExport"><i class="pi pi-download" /> Exportar Excel</button>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.head-actions { display: flex; gap: 0.5rem; }
.totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; padding: 0.9rem 1rem; }
.t { display: flex; flex-direction: column; gap: 0.2rem; align-items: center; }
.t-l { font-size: 0.72rem; color: var(--ink-3); font-weight: 600; }
.t-v { font-family: var(--font-display); font-weight: 700; font-size: 1.02rem; }
.pos { color: var(--success); } .neg { color: var(--danger); }

.filters { display: flex; flex-direction: column; gap: 0.6rem; }
.search { position: relative; display: flex; align-items: center; }
.search > i { position: absolute; left: 0.85rem; color: var(--ink-4); font-size: 0.9rem; }
.search input { padding-left: 2.4rem; }
.clear-x { position: absolute; right: 0.5rem; width: 30px; height: 30px; border: none; background: transparent; color: var(--ink-4); cursor: pointer; border-radius: 8px; }
.chips { display: flex; gap: 0.45rem; flex-wrap: wrap; align-items: center; }
.fchip {
  padding: 0.5rem 0.9rem; border-radius: var(--radius-pill); border: 1px solid var(--line-2);
  background: var(--glass-2); color: var(--ink-2); font-weight: 600; font-size: 0.84rem; cursor: pointer; font-family: inherit; min-height: 40px;
}
.fchip.on { background: var(--brand-soft); border-color: var(--brand); color: var(--brand); }
.fcat { width: auto; flex: 1; min-width: 150px; min-height: 40px; padding: 0.45rem 0.7rem; }

.group { padding: 0.4rem 1rem 0.5rem; }
.group-head { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.2rem 0.3rem; }
.group-date { font-size: 0.74rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-4); }
.group-net { font-size: 0.78rem; font-weight: 700; }
.tx-icon { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex: none; font-size: 0.9rem; }
.tx-icon.income { background: var(--success-soft); color: var(--success); }
.tx-icon.expense { background: var(--danger-soft); color: var(--danger); }
.row-main { cursor: pointer; }
.row-sub { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem; }
.cat-tag { font-size: 0.74rem; color: var(--ink-3); background: var(--line); padding: 0.12rem 0.5rem; border-radius: var(--radius-pill); }
.acct-tag { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.74rem; color: var(--ink-3); }
.acct-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.doc-link { font-size: 0.78rem; color: var(--ink-3); display: inline-flex; }
</style>
