<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import ProgressSpinner from 'primevue/progressspinner';
import api from '@shared/api';
import { fmtEur, fmtEurCents, fmtDateShort } from '@shared/format';

const router = useRouter();
function goCategorize() { router.push({ path: '/movimentos', query: { uncat: '1' } }); }

const series = ref([]);
const detail = ref(null);
const loading = ref(true);
const loadingDetail = ref(false);
const selected = ref(0); // offset
const mode = ref('detalhe'); // 'detalhe' | 'comparar'

const DONUT = ['#10b981', '#2dd4bf', '#38bdf8', '#fbbf24', '#fb7185', '#a78bfa', '#a3e635', '#22d3ee', '#f97316', '#0ea5e9'];

function monthLabel(key, withYear = false) {
  if (!key) return '';
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('pt-PT', withYear ? { month: 'short', year: '2-digit' } : { month: 'short' }).replace('.', '');
}

async function loadSeries() {
  try { series.value = (await api.get('/stats/series', { params: { n: 12 } })).cycles || []; } catch (e) { /* */ }
}
async function loadDetail(offset) {
  selected.value = offset;
  loadingDetail.value = true;
  try { detail.value = await api.get('/stats/cycle', { params: { offset } }); } catch (e) { /* */ } finally { loadingDetail.value = false; }
}

// ── Comparador ──
const aOffset = ref(1);
const bOffset = ref(0);
const aDetail = ref(null);
const bDetail = ref(null);
const loadingCmp = ref(false);
const cycleOptions = computed(() => series.value.slice().reverse().map((c) => ({ offset: c.offset, label: monthLabel(c.label, true) })));

async function loadCompare() {
  loadingCmp.value = true;
  try {
    const [a, b] = await Promise.all([
      api.get('/stats/cycle', { params: { offset: aOffset.value } }),
      api.get('/stats/cycle', { params: { offset: bOffset.value } }),
    ]);
    aDetail.value = a; bDetail.value = b;
  } catch (e) { /* */ } finally { loadingCmp.value = false; }
}
function setMode(m) { mode.value = m; if (m === 'comparar' && !aDetail.value) loadCompare(); }

onMounted(async () => {
  await Promise.all([loadSeries(), loadDetail(0)]);
  if (series.value.length > 1) aOffset.value = 1;
  loading.value = false;
});

const maxAbs = computed(() => Math.max(1, ...series.value.map((c) => Math.abs(c.saved))));
const avgSaved = computed(() => series.value.length ? series.value.reduce((a, c) => a + c.saved, 0) / series.value.length : 0);

const cats = computed(() => {
  const list = detail.value?.byCategory || [];
  const total = list.reduce((a, c) => a + c.expense, 0) || 1;
  return list.map((c, i) => ({ ...c, pct: Math.round((c.expense / total) * 100), color: DONUT[i % DONUT.length] }));
});
const savedDelta = computed(() => detail.value ? detail.value.summary.saved - Number(detail.value.prev?.saved || 0) : 0);
const expenseDelta = computed(() => detail.value ? detail.value.summary.expense - Number(detail.value.prev?.expense || 0) : 0);
const canPrev = computed(() => selected.value < (series.value.length - 1));
const canNext = computed(() => selected.value > 0);

// Comparator computeds
const aLabel = computed(() => monthLabel(aDetail.value?.period.label, true));
const bLabel = computed(() => monthLabel(bDetail.value?.period.label, true));
const cmpRows = computed(() => {
  if (!aDetail.value || !bDetail.value) return [];
  const A = aDetail.value.summary, B = bDetail.value.summary;
  return [
    { label: 'Recebido', a: A.income, b: B.income, fmt: 'eur', goodUp: true },
    { label: 'Gasto', a: A.expense, b: B.expense, fmt: 'eur', goodUp: false },
    { label: 'Poupado', a: A.saved, b: B.saved, fmt: 'eur', goodUp: true },
    { label: 'Taxa poupança', a: A.rate, b: B.rate, fmt: 'pct', goodUp: true },
  ];
});
const cmpCats = computed(() => {
  const am = new Map((aDetail.value?.byCategory || []).map((c) => [c.nome, c.expense]));
  const bm = new Map((bDetail.value?.byCategory || []).map((c) => [c.nome, c.expense]));
  const names = new Set([...am.keys(), ...bm.keys()]);
  return [...names].map((n) => ({ nome: n, a: am.get(n) || 0, b: bm.get(n) || 0 }))
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b)).slice(0, 12);
});
const cmpMoneyRows = computed(() => cmpRows.value.filter((r) => r.fmt === 'eur'));
const cmpChartMax = computed(() => {
  if (!aDetail.value || !bDetail.value) return 1;
  const A = aDetail.value.summary, B = bDetail.value.summary;
  return Math.max(1, A.income, A.expense, Math.abs(A.saved), B.income, B.expense, Math.abs(B.saved));
});
const catMax = computed(() => Math.max(1, ...cmpCats.value.flatMap((c) => [c.a, c.b])));
const barPct = (v, max) => Math.max(2, Math.round((Math.abs(v) / max) * 100));
const fmtVal = (v, fmt) => (fmt === 'pct' ? `${v}%` : fmt === 'num' ? String(v) : fmtEur(v));
// classe de cor para a coluna B vs A (verde = melhor)
function bClass(row) {
  if (row.goodUp === null || row.a === row.b) return '';
  const bBigger = row.b > row.a;
  const better = row.goodUp ? bBigger : !bBigger;
  return better ? 'pos' : 'neg';
}

// Métricas extra (só na tabela, não no gráfico de 3 barras).
const cmpExtraRows = computed(() => {
  if (!aDetail.value || !bDetail.value) return [];
  const A = aDetail.value.summary, B = bDetail.value.summary;
  return [
    { label: 'Nº de despesas', a: A.count || 0, b: B.count || 0, fmt: 'num', goodUp: null },
    { label: 'Gasto médio/dia', a: A.avgPerDay || 0, b: B.avgPerDay || 0, fmt: 'eur', goodUp: false },
    { label: 'Maior despesa', a: A.biggest || 0, b: B.biggest || 0, fmt: 'eur', goodUp: false },
  ];
});
const cmpTableRows = computed(() => [...cmpRows.value, ...cmpExtraRows.value]);

// Veredito (poupança B vs A).
const verdict = computed(() => {
  if (!aDetail.value || !bDetail.value) return null;
  const d = bDetail.value.summary.saved - aDetail.value.summary.saved;
  return { delta: d, positive: d >= 0 };
});

// Destaques por categoria.
const highlights = computed(() => {
  const list = cmpCats.value.map((c) => ({ ...c, delta: c.b - c.a }));
  if (!list.length) return null;
  const up = list.filter((c) => c.delta > 0).sort((x, y) => y.delta - x.delta)[0] || null;
  const down = list.filter((c) => c.delta < 0).sort((x, y) => x.delta - y.delta)[0] || null;
  const novas = list.filter((c) => c.a === 0 && c.b > 0).map((c) => c.nome);
  return { up, down, novas };
});
</script>

<template>
  <div class="page">
    <div class="page-head"><div><h1>Estatísticas</h1><p class="sub">Compara os teus ciclos</p></div></div>

    <div v-if="loading" class="loading"><ProgressSpinner style="width:40px;height:40px" strokeWidth="4" /></div>

    <template v-else>
      <!-- Toggle de modo -->
      <div class="modeseg">
        <button class="ms" :class="{ on: mode === 'detalhe' }" @click="setMode('detalhe')">Resumo</button>
        <button class="ms" :class="{ on: mode === 'comparar' }" @click="setMode('comparar')">Comparar</button>
      </div>

      <!-- ░░░ MODO RESUMO ░░░ -->
      <template v-if="mode === 'detalhe'">
        <section class="surface card">
          <div class="card-head"><h2>Poupança por ciclo</h2><span class="muted tiny">média {{ fmtEur(avgSaved) }}</span></div>
          <div class="chart-scroll">
            <div class="chart">
              <button v-for="c in series" :key="c.offset" class="col" :class="{ on: c.offset === selected }" @click="loadDetail(c.offset)">
                <span class="cval" :class="c.saved >= 0 ? 'pos' : 'neg'">{{ fmtEur(c.saved) }}</span>
                <div class="cbar-wrap"><div class="cbar" :class="[c.saved >= 0 ? 'up' : 'down', { sel: c.offset === selected }]" :style="{ height: Math.max(4, Math.round((Math.abs(c.saved) / maxAbs) * 100)) + '%' }" /></div>
                <span class="clbl" :class="{ on: c.offset === selected }">{{ monthLabel(c.label) }}</span>
              </button>
            </div>
          </div>
        </section>

        <section v-if="detail" class="surface card">
          <div class="detail-head">
            <button class="navb" :disabled="!canPrev" @click="loadDetail(selected + 1)"><i class="pi pi-chevron-left" /></button>
            <div class="dh-mid"><h2>{{ monthLabel(detail.period.label, true) }}<span v-if="selected === 0" class="chip" style="margin-left:0.5rem">atual</span></h2><span class="muted tiny">{{ fmtDateShort(detail.period.start) }} – {{ fmtDateShort(detail.period.end) }}</span></div>
            <button class="navb" :disabled="!canNext" @click="loadDetail(selected - 1)"><i class="pi pi-chevron-right" /></button>
          </div>
          <div v-if="loadingDetail" class="loading"><ProgressSpinner style="width:30px;height:30px" strokeWidth="4" /></div>
          <template v-else>
            <div class="kpis">
              <div class="k"><span class="k-l">Recebido</span><span class="k-v pos">{{ fmtEurCents(detail.summary.income) }}</span></div>
              <div class="k"><span class="k-l">Gasto</span><span class="k-v neg">{{ fmtEurCents(detail.summary.expense) }}</span></div>
              <div class="k"><span class="k-l">Poupado</span><span class="k-v" :class="detail.summary.saved >= 0 ? 'pos' : 'neg'">{{ fmtEurCents(detail.summary.saved) }}</span></div>
              <div class="k"><span class="k-l">Taxa</span><span class="k-v">{{ detail.summary.rate }}%</span></div>
            </div>
            <div class="vs">
              <span :class="savedDelta >= 0 ? 'pos' : 'neg'"><i :class="savedDelta >= 0 ? 'pi pi-arrow-up' : 'pi pi-arrow-down'" /> Poupança {{ savedDelta >= 0 ? '+' : '−' }}{{ fmtEur(Math.abs(savedDelta)) }}</span>
              <span :class="expenseDelta <= 0 ? 'pos' : 'neg'"><i :class="expenseDelta <= 0 ? 'pi pi-arrow-down' : 'pi pi-arrow-up'" /> Gastos {{ expenseDelta >= 0 ? '+' : '−' }}{{ fmtEur(Math.abs(expenseDelta)) }}</span>
              <span class="muted tiny">vs ciclo anterior</span>
            </div>
          </template>
        </section>

        <section v-if="detail && !loadingDetail" class="surface card">
          <div class="card-head"><h2>Onde gastaste</h2></div>
          <div v-if="!cats.length" class="empty"><i class="pi pi-chart-pie" />Sem despesas neste ciclo.</div>
          <div v-else class="cats">
            <div v-for="c in cats" :key="c.nome" class="cat">
              <div class="cat-top"><span class="cat-name"><span class="dot" :style="{ background: c.color }" />{{ c.nome }}</span><span class="cat-val">{{ fmtEurCents(c.expense) }} <span class="muted">· {{ c.pct }}%</span></span></div>
              <div class="bar-track"><span class="bar-fill" :style="{ width: c.pct + '%', background: c.color }" /></div>
            </div>
          </div>
        </section>

        <section v-if="detail && !loadingDetail && detail.topExpenses.length" class="surface card">
          <div class="card-head"><h2>Maiores despesas</h2></div>
          <div class="rows">
            <div v-for="(t, i) in detail.topExpenses" :key="i" class="row">
              <div class="row-main"><div class="row-title">{{ t.descricao || t.categoria || 'Despesa' }}</div><div class="row-sub">{{ t.categoria || '—' }} · {{ fmtDateShort(t.data) }}</div></div>
              <div class="row-amount neg">{{ fmtEurCents(t.valor) }}</div>
            </div>
          </div>
        </section>
      </template>

      <!-- ░░░ MODO COMPARAR ░░░ -->
      <template v-else>
        <section class="surface card">
          <div class="pickers">
            <select v-model.number="aOffset" @change="loadCompare"><option v-for="o in cycleOptions" :key="'a'+o.offset" :value="o.offset">{{ o.label }}</option></select>
            <span class="vs-pill">vs</span>
            <select v-model.number="bOffset" @change="loadCompare"><option v-for="o in cycleOptions" :key="'b'+o.offset" :value="o.offset">{{ o.label }}</option></select>
          </div>
        </section>

        <div v-if="loadingCmp" class="loading"><ProgressSpinner style="width:36px;height:36px" strokeWidth="4" /></div>

        <template v-else-if="aDetail && bDetail">
          <!-- Veredito -->
          <section v-if="verdict" class="surface card verdict" :class="verdict.positive ? 'good' : 'bad'">
            <i :class="verdict.positive ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-right'" />
            <span>Em <strong>{{ bLabel }}</strong> pouparaste <strong>{{ verdict.positive ? '+' : '−' }}{{ fmtEur(Math.abs(verdict.delta)) }}</strong> vs {{ aLabel }}{{ verdict.positive ? ' 🎉' : '' }}</span>
          </section>

          <!-- Legenda A/B -->
          <div class="cmp-legend">
            <span><span class="sw a" /> {{ aLabel }}</span>
            <span><span class="sw b" /> {{ bLabel }}</span>
          </div>

          <!-- Gráfico de barras agrupadas (Recebido/Gasto/Poupado) -->
          <section class="surface card">
            <div class="gchart">
              <div v-for="m in cmpMoneyRows" :key="m.label" class="ggroup">
                <div class="gbars">
                  <div class="gcol"><span class="gv">{{ fmtEur(m.a) }}</span><div class="gbar a" :style="{ height: barPct(m.a, cmpChartMax) + '%' }" /></div>
                  <div class="gcol"><span class="gv">{{ fmtEur(m.b) }}</span><div class="gbar b" :style="{ height: barPct(m.b, cmpChartMax) + '%' }" /></div>
                </div>
                <span class="glbl">{{ m.label }}</span>
              </div>
            </div>
          </section>

          <!-- Tabela-resumo -->
          <section class="surface card">
            <div class="cmp-grid head"><span></span><span class="cmp-h">{{ aLabel }}</span><span class="cmp-h">{{ bLabel }}</span></div>
            <div v-for="r in cmpTableRows" :key="r.label" class="cmp-grid">
              <span class="cmp-l">{{ r.label }}</span>
              <span class="cmp-a">{{ fmtVal(r.a, r.fmt) }}</span>
              <span class="cmp-b" :class="bClass(r)">{{ fmtVal(r.b, r.fmt) }}</span>
            </div>
          </section>

          <!-- Categorias: barras emparelhadas A vs B -->
          <section class="surface card">
            <div class="card-head"><h2>Gastos por categoria</h2></div>
            <div v-if="!cmpCats.length" class="empty"><i class="pi pi-chart-pie" />Sem despesas nestes ciclos.</div>
            <div v-else class="ccmps">
              <div v-for="c in cmpCats" :key="c.nome" class="ccmp" :class="{ uncat: c.nome === 'Sem categoria' }">
                <div class="ccmp-top">
                  <span class="ccmp-name"><i v-if="c.nome === 'Sem categoria'" class="pi pi-exclamation-circle" /> {{ c.nome }}<button v-if="c.nome === 'Sem categoria'" class="catz" @click="goCategorize">categorizar →</button></span>
                  <span class="ccmp-diff" :class="c.b > c.a ? 'neg' : (c.b < c.a ? 'pos' : 'muted')">{{ c.b === c.a ? '=' : (c.b > c.a ? '+' : '−') + fmtEur(Math.abs(c.b - c.a)) }}</span>
                </div>
                <div class="ccmp-row"><div class="pbar"><span class="pa" :style="{ width: barPct(c.a, catMax) + '%' }" /></div><span class="pv">{{ fmtEur(c.a) }}</span></div>
                <div class="ccmp-row"><div class="pbar"><span class="pb" :style="{ width: barPct(c.b, catMax) + '%' }" /></div><span class="pv">{{ fmtEur(c.b) }}</span></div>
              </div>
            </div>
          </section>

          <!-- Destaques -->
          <section v-if="highlights" class="surface card">
            <div class="card-head"><h2>Destaques</h2><span class="muted tiny">{{ bLabel }} vs {{ aLabel }}</span></div>
            <div class="hl">
              <div v-if="highlights.up" class="hl-row">
                <span class="hl-ic neg"><i class="pi pi-arrow-up" /></span>
                <span class="hl-txt">Maior subida: <strong>{{ highlights.up.nome }}</strong></span>
                <span class="hl-val neg">+{{ fmtEur(highlights.up.delta) }}</span>
              </div>
              <div v-if="highlights.down" class="hl-row">
                <span class="hl-ic pos"><i class="pi pi-arrow-down" /></span>
                <span class="hl-txt">Maior descida: <strong>{{ highlights.down.nome }}</strong></span>
                <span class="hl-val pos">−{{ fmtEur(Math.abs(highlights.down.delta)) }}</span>
              </div>
              <div v-if="highlights.novas.length" class="hl-row">
                <span class="hl-ic"><i class="pi pi-plus-circle" /></span>
                <span class="hl-txt">Categorias novas: <strong>{{ highlights.novas.join(', ') }}</strong></span>
              </div>
              <div v-if="!highlights.up && !highlights.down && !highlights.novas.length" class="muted tiny">Sem variações relevantes entre os dois ciclos.</div>
            </div>
          </section>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.modeseg { display: flex; gap: 0.4rem; background: var(--bg-2); border: 1px solid var(--line-2); border-radius: var(--radius-pill); padding: 0.25rem; }
.ms { flex: 1; padding: 0.55rem; border-radius: var(--radius-pill); border: none; background: transparent; color: var(--ink-2); font-weight: 600; font-family: inherit; cursor: pointer; min-height: 40px; }
.ms.on { background: var(--brand-grad); color: #fff; box-shadow: var(--brand-glow); }

.chart-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.chart { display: flex; align-items: flex-end; gap: 0.5rem; height: 160px; min-width: 100%; }
.col { flex: 1; min-width: 42px; display: flex; flex-direction: column; align-items: center; gap: 0.3rem; height: 100%; justify-content: flex-end; border: none; background: transparent; cursor: pointer; font-family: inherit; padding: 0; border-radius: 10px; }
.col.on { background: var(--brand-tint); }
.cval { font-size: 0.62rem; font-weight: 700; }
.cbar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.cbar { width: 64%; max-width: 26px; border-radius: 7px 7px 4px 4px; }
.cbar.up { background: linear-gradient(180deg, var(--success), color-mix(in srgb, var(--success) 55%, transparent)); }
.cbar.down { background: linear-gradient(180deg, var(--danger), color-mix(in srgb, var(--danger) 55%, transparent)); }
.cbar.sel { outline: 2px solid var(--brand); outline-offset: 1px; }
.clbl { font-size: 0.66rem; color: var(--ink-4); text-transform: capitalize; padding-bottom: 0.2rem; }
.clbl.on { color: var(--brand); font-weight: 700; }
.pos { color: var(--success); } .neg { color: var(--danger); }

.detail-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.9rem; }
.dh-mid { text-align: center; }
.dh-mid h2 { text-transform: capitalize; }
.navb { width: 40px; height: 40px; border-radius: 11px; border: 1px solid var(--line-2); background: var(--glass-2); color: var(--ink); cursor: pointer; flex: none; }
.navb:disabled { opacity: 0.35; cursor: default; }

.kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; }
@media (min-width: 560px) { .kpis { grid-template-columns: repeat(4, 1fr); } }
.k { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.6rem 0.7rem; border-radius: 12px; background: var(--bg-2); }
.k-l { font-size: 0.72rem; color: var(--ink-3); font-weight: 600; }
.k-v { font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; }
.vs { display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; margin-top: 0.9rem; font-size: 0.85rem; font-weight: 600; }
.vs i { font-size: 0.7rem; }

.cats { display: flex; flex-direction: column; gap: 0.85rem; }
.cat-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; margin-bottom: 0.4rem; }
.cat-name { font-size: 0.9rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.45rem; }
.dot { width: 10px; height: 10px; border-radius: 3px; }
.cat-val { font-size: 0.88rem; font-weight: 700; white-space: nowrap; }

/* Comparador */
.pickers { display: flex; align-items: center; gap: 0.6rem; }
.pickers select { flex: 1; min-height: 46px; text-transform: capitalize; }
.vs-pill { font-size: 0.78rem; font-weight: 700; color: var(--ink-3); background: var(--bg-2); border-radius: var(--radius-pill); padding: 0.3rem 0.6rem; flex: none; }
.cmp-grid { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 0.6rem; padding: 0.55rem 0; border-bottom: 1px solid var(--line); }
.cmp-grid:last-child { border-bottom: none; }
.cmp-grid.head { border-bottom: 1px solid var(--line-2); padding-bottom: 0.5rem; }
.cmp-h { text-transform: capitalize; font-size: 0.74rem; font-weight: 700; color: var(--ink-3); min-width: 70px; text-align: right; }
.cmp-l { font-size: 0.88rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-a, .cmp-b { font-family: var(--font-display); font-weight: 700; font-size: 0.95rem; min-width: 70px; text-align: right; }
.cmp-a { color: var(--ink-2); }

/* A vs B color scheme */
.cmp-legend { display: flex; gap: 1.2rem; justify-content: center; font-size: 0.82rem; font-weight: 600; color: var(--ink-2); }
.sw { display: inline-block; width: 12px; height: 12px; border-radius: 4px; vertical-align: middle; margin-right: 0.3rem; }
.sw.a { background: #94a3b8; }
.sw.b { background: var(--brand); }

/* Grouped bar chart */
.gchart { display: flex; align-items: flex-end; justify-content: space-around; gap: 0.6rem; height: 180px; }
.ggroup { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; height: 100%; justify-content: flex-end; }
.gbars { flex: 1; display: flex; align-items: flex-end; justify-content: center; gap: 0.4rem; width: 100%; }
.gcol { flex: 1; max-width: 38px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 0.25rem; }
.gv { font-size: 0.6rem; font-weight: 700; color: var(--ink-3); white-space: nowrap; }
.gbar { width: 100%; border-radius: 7px 7px 3px 3px; min-height: 3px; }
.gbar.a { background: #94a3b8; }
.gbar.b { background: var(--brand-grad); }
.glbl { font-size: 0.74rem; font-weight: 600; color: var(--ink-3); }

/* Paired category bars */
.ccmps { display: flex; flex-direction: column; gap: 1rem; }
.ccmp.uncat { background: var(--warning-soft); border-radius: 12px; padding: 0.6rem 0.7rem; margin: -0.1rem 0; }
.ccmp-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; margin-bottom: 0.45rem; }
.ccmp-name { font-size: 0.9rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem; }
.ccmp.uncat .ccmp-name { color: var(--warning); }
.catz { margin-left: 0.5rem; border: none; background: var(--warning-soft); color: var(--warning); font-weight: 700; font-size: 0.7rem; padding: 0.12rem 0.5rem; border-radius: var(--radius-pill); cursor: pointer; font-family: inherit; }
.ccmp-diff { font-size: 0.8rem; font-weight: 700; white-space: nowrap; }
.ccmp-diff.muted { color: var(--ink-4); }
.ccmp-row { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.3rem; }
.pbar { flex: 1; height: 10px; border-radius: var(--radius-pill); background: var(--line); overflow: hidden; }
.pa { display: block; height: 100%; border-radius: inherit; background: #94a3b8; }
.pb { display: block; height: 100%; border-radius: inherit; background: var(--brand-grad); }
.pv { font-family: var(--font-display); font-weight: 700; font-size: 0.82rem; min-width: 62px; text-align: right; }

/* Veredito */
.verdict { display: flex; align-items: center; gap: 0.65rem; padding: 0.85rem 1.1rem; font-size: 0.92rem; }
.verdict.good { background: var(--success-soft); border-color: color-mix(in srgb, var(--success) 40%, transparent); }
.verdict.bad { background: var(--danger-soft); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
.verdict i { font-size: 1.15rem; flex: none; }
.verdict.good i { color: var(--success); }
.verdict.bad i { color: var(--danger); }

/* Destaques */
.hl { display: flex; flex-direction: column; gap: 0.75rem; }
.hl-row { display: flex; align-items: center; gap: 0.7rem; }
.hl-ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--line); color: var(--ink-3); font-size: 0.8rem; }
.hl-ic.pos { background: var(--success-soft); color: var(--success); }
.hl-ic.neg { background: var(--danger-soft); color: var(--danger); }
.hl-txt { flex: 1; font-size: 0.88rem; }
.hl-val { font-family: var(--font-display); font-weight: 700; font-size: 0.9rem; white-space: nowrap; }
</style>
