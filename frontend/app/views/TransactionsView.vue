<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import ProgressSpinner from 'primevue/progressspinner';
import api from '@shared/api';
import { fmtEurCents, fmtDate } from '@shared/format';
import TransactionDialog from '../components/TransactionDialog.vue';

const confirm = useConfirm();
const toast = useToast();

const items = ref([]);
const categories = ref([]);
const loading = ref(true);
const loadingMore = ref(false);
const page = ref(1);
const totalPages = ref(1);
const total = ref(0);
const filterCat = ref('');
const dlg = ref(false);
const editing = ref(null);

async function loadCats() {
  try { categories.value = await api.get('/categories').then((r) => r.categories || r); } catch (e) { /* */ }
}

async function load(reset = true, silent = false) {
  if (reset) { page.value = 1; if (!silent) loading.value = true; }
  else { loadingMore.value = true; }
  try {
    const params = { page: page.value, per_page: 20 };
    if (filterCat.value) params.category_id = filterCat.value;
    const res = await api.get('/transactions', { params });
    items.value = reset ? res.items : [...items.value, ...res.items];
    totalPages.value = res.total_pages;
    total.value = res.total;
  } catch (e) { /* */ } finally { loading.value = false; loadingMore.value = false; }
}

function more() { if (page.value < totalPages.value) { page.value++; load(false); } }

const onExternalChange = () => { load(true, true).catch(() => {}); };
onMounted(async () => {
  await Promise.all([loadCats(), load()]);
  window.addEventListener('financeiro:tx-changed', onExternalChange);
});
onUnmounted(() => window.removeEventListener('financeiro:tx-changed', onExternalChange));

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

// Group by day for a clean timeline feel.
const groups = computed(() => {
  const map = new Map();
  for (const t of items.value) {
    const key = String(t.data_ocorrencia).slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  return [...map.entries()].map(([date, rows]) => ({ date, rows }));
});
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Movimentos</h1><p class="sub">{{ total }} registos</p></div>
      <button class="btn btn-primary btn-sm" @click="add"><i class="pi pi-plus" /> Novo</button>
    </div>

    <div class="filters surface card">
      <label class="field">
        <span>Filtrar por categoria</span>
        <select v-model="filterCat" @change="load()">
          <option value="">Todas as categorias</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.nome }} ({{ c.tipo === 'income' ? 'Receita' : 'Despesa' }})</option>
        </select>
      </label>
    </div>

    <div v-if="loading" class="loading"><ProgressSpinner style="width:40px;height:40px" strokeWidth="4" /></div>
    <div v-else-if="!items.length" class="surface card empty"><i class="pi pi-inbox" />Ainda não há movimentos.</div>

    <template v-else>
      <section v-for="g in groups" :key="g.date" class="surface card group">
        <div class="group-date">{{ fmtDate(g.date) }}</div>
        <div class="rows">
          <div v-for="t in g.rows" :key="t.id" class="row">
            <div class="tx-icon" :class="t.tipo">
              <i :class="t.tipo === 'income' ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-right'" />
            </div>
            <div class="row-main">
              <div class="row-title">{{ t.descricao || t.categoria_nome || (t.tipo === 'income' ? 'Receita' : 'Despesa') }}</div>
              <div class="row-sub">
                <span v-if="t.categoria_nome" class="chip neutral" style="padding:0.1rem 0.5rem">{{ t.categoria_nome }}</span>
                <a v-if="t.document_id" :href="`/api/documents/${t.document_id}`" target="_blank" class="doc-link"><i class="pi pi-paperclip" /> doc</a>
              </div>
            </div>
            <div class="row-amount" :class="t.tipo === 'income' ? 'pos' : 'neg'">
              {{ t.tipo === 'income' ? '+' : '−' }}{{ fmtEurCents(t.valor) }}
            </div>
            <div class="row-acts">
              <button class="icon-btn" @click="edit(t)" aria-label="Editar"><i class="pi pi-pencil" /></button>
              <button class="icon-btn danger" @click="remove(t)" aria-label="Eliminar"><i class="pi pi-trash" /></button>
            </div>
          </div>
        </div>
      </section>

      <button v-if="page < totalPages" class="btn btn-block" @click="more" :disabled="loadingMore">
        <i v-if="loadingMore" class="pi pi-spin pi-spinner" /> Carregar mais
      </button>
    </template>

    <TransactionDialog v-model:visible="dlg" :categories="categories" :transaction="editing" @saved="onSaved" />
  </div>
</template>

<style scoped>
.filters { padding: 0.9rem 1rem; }
.group { padding: 0.5rem 1rem 0.4rem; }
.group-date { font-size: 0.74rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-4); padding: 0.55rem 0.2rem 0.2rem; }
.tx-icon { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; flex: none; font-size: 0.9rem; }
.tx-icon.income { background: var(--success-soft); color: var(--success); }
.tx-icon.expense { background: var(--danger-soft); color: var(--danger); }
.row-sub { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.2rem; }
.doc-link { font-size: 0.76rem; color: var(--ink-3); }
.row-acts { display: flex; gap: 0.1rem; }
@media (max-width: 520px) { .row-acts { flex-direction: column; } }
</style>
