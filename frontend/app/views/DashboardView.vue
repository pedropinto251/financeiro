<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import api from '@shared/api';
import { fmtEurCents } from '@shared/format';
import TransactionDialog from '../components/TransactionDialog.vue';

const data = ref(null);
const loading = ref(true);
const categories = ref([]);
const dlg = ref(false);
const dlgType = ref('expense');

const DONUT = ['#5b8cff', '#8b5cf6', '#34d399', '#fbbf24', '#38bdf8', '#fb7185', '#a78bfa', '#22d3ee'];

async function refresh() {
  const [d, c] = await Promise.all([
    api.get('/dashboard'),
    api.get('/categories').then((r) => r.categories || r).catch(() => []),
  ]);
  data.value = d;
  categories.value = c;
}

const onExternalChange = () => { refresh().catch(() => {}); };
onMounted(async () => {
  try { await refresh(); } catch (e) { /* toast */ } finally { loading.value = false; }
  window.addEventListener('financeiro:tx-changed', onExternalChange);
});
onUnmounted(() => window.removeEventListener('financeiro:tx-changed', onExternalChange));

const summary = computed(() => data.value?.summary || { income: 0, expense: 0, allocated: 0 });
const year = computed(() => data.value?.yearSummary || { income: 0, expense: 0 });
const totals = computed(() => data.value?.totals || { balance: 0, allocated: 0, available: 0 });

const monthBalance = computed(() => summary.value.income - summary.value.expense - summary.value.allocated);
const yearBalance = computed(() => year.value.income - year.value.expense);

// Category breakdown → donut shares.
const cats = computed(() => {
  const rows = (data.value?.byCategory || []).map((r) => ({ nome: r.nome, total: Number(r.total || 0) }));
  const sum = rows.reduce((a, r) => a + r.total, 0) || 1;
  let acc = 0;
  return rows.map((r, i) => {
    const share = (r.total / sum) * 100;
    const seg = { ...r, share, color: DONUT[i % DONUT.length], from: acc, to: acc + share };
    acc += share;
    return seg;
  });
});
const donutBg = computed(() => {
  if (!cats.value.length) return 'conic-gradient(var(--line) 0 100%)';
  const stops = cats.value.map((c) => `${c.color} ${c.from}% ${c.to}%`).join(', ');
  return `conic-gradient(${stops})`;
});
const expenseTotal = computed(() => cats.value.reduce((a, c) => a + c.total, 0));

const goals = computed(() => (data.value?.goals || []).map((g) => {
  const target = Number(g.valor_objetivo || 0);
  const allocated = Number(g.total_alocado || 0);
  return { ...g, target, allocated, percent: target > 0 ? Math.min(100, Math.round((allocated / target) * 100)) : 0 };
}));

function openAdd(type) { dlgType.value = type; dlg.value = true; }
async function onSaved() { try { await refresh(); } catch (e) { /* */ } }
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Dashboard</h1><p class="sub">Visão geral do teu ciclo atual</p></div>
      <div class="head-actions">
        <button class="btn btn-sm" @click="openAdd('income')"><i class="pi pi-arrow-up-right" style="color:var(--success)" /> Receita</button>
        <button class="btn btn-sm btn-primary" @click="openAdd('expense')"><i class="pi pi-plus" /> Despesa</button>
      </div>
    </div>

    <div v-if="loading" class="loading"><ProgressSpinner style="width:40px;height:40px" strokeWidth="4" /></div>

    <template v-else-if="data">
      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="surface kpi">
          <span class="kpi-label">Saldo do mês</span>
          <span class="kpi-value" :class="monthBalance >= 0 ? 'pos' : 'neg'">{{ fmtEurCents(monthBalance) }}</span>
          <span class="kpi-sub">{{ fmtEurCents(summary.income) }} entrou · {{ fmtEurCents(summary.expense) }} saiu</span>
        </div>
        <div class="surface kpi">
          <span class="kpi-label">Poupança anual</span>
          <span class="kpi-value" :class="yearBalance >= 0 ? 'pos' : 'neg'">{{ fmtEurCents(yearBalance) }}</span>
          <span class="kpi-sub">no ano civil</span>
        </div>
        <div class="surface kpi">
          <span class="kpi-label">Saldo disponível</span>
          <span class="kpi-value">{{ fmtEurCents(totals.available) }}</span>
          <span class="kpi-sub">após objetivos</span>
        </div>
        <div class="surface kpi">
          <span class="kpi-label">Alocado a objetivos</span>
          <span class="kpi-value">{{ fmtEurCents(totals.allocated) }}</span>
          <span class="kpi-sub">poupanças guardadas</span>
        </div>
      </div>

      <div class="grid-2">
        <!-- Donut: gasto por categoria -->
        <section class="surface card">
          <div class="card-head"><h2>Gastos por categoria</h2><span class="muted tiny">este ciclo</span></div>
          <div v-if="!cats.length" class="empty"><i class="pi pi-chart-pie" />Sem despesas neste ciclo.</div>
          <div v-else class="donut-wrap">
            <div class="donut-stack">
              <div class="donut" :style="{ background: donutBg }" />
              <div class="donut-hole">
                <span class="donut-total">{{ fmtEurCents(expenseTotal) }}</span>
                <span class="muted tiny">total</span>
              </div>
            </div>
            <ul class="legend">
              <li v-for="c in cats" :key="c.nome">
                <span class="dot" :style="{ background: c.color }" />
                <span class="lg-name">{{ c.nome }}</span>
                <span class="lg-val">{{ fmtEurCents(c.total) }}</span>
                <span class="lg-pct muted">{{ Math.round(c.share) }}%</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- Objetivos -->
        <section class="surface card">
          <div class="card-head"><h2>Objetivos</h2><RouterLink class="link" to="/objetivos">ver todos</RouterLink></div>
          <div v-if="!goals.length" class="empty"><i class="pi pi-flag" />Ainda não tens objetivos.</div>
          <div v-else class="goals">
            <div v-for="g in goals" :key="g.id" class="goal">
              <div class="goal-top">
                <span class="goal-name">{{ g.nome }}</span>
                <span class="muted tiny">{{ fmtEurCents(g.allocated) }} / {{ fmtEurCents(g.target) }}</span>
              </div>
              <div class="bar-track"><span class="bar-fill" :class="{ success: g.percent >= 100 }" :style="{ width: g.percent + '%' }" /></div>
              <span v-if="g.percent >= 100" class="chip success" style="margin-top:0.4rem">Objetivo cumprido 🎉</span>
            </div>
          </div>
        </section>
      </div>
    </template>

    <TransactionDialog v-model:visible="dlg" :categories="categories" :initial-type="dlgType" @saved="onSaved" />
  </div>
</template>

<style scoped>
.head-actions { display: flex; gap: 0.5rem; }
.donut-wrap { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }
.donut-stack { position: relative; width: 150px; height: 150px; flex: none; }
.donut {
  width: 150px; height: 150px; border-radius: 50%;
  -webkit-mask: radial-gradient(circle 45px at center, transparent 98%, #000 100%);
          mask: radial-gradient(circle 45px at center, transparent 98%, #000 100%);
}
.donut-hole { position: absolute; inset: 0; display: grid; place-content: center; place-items: center; text-align: center; pointer-events: none; }
.donut-total { font-family: var(--font-display); font-weight: 700; font-size: 0.95rem; }
.legend { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 0.5rem; }
.legend li { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
.dot { width: 10px; height: 10px; border-radius: 3px; }
.lg-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-val { font-weight: 600; }
.lg-pct { font-size: 0.78rem; min-width: 34px; text-align: right; }
.goals { display: flex; flex-direction: column; gap: 1rem; }
.goal-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; margin-bottom: 0.45rem; }
.goal-name { font-weight: 600; font-size: 0.9rem; }
</style>
