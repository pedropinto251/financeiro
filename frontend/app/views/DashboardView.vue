<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import { useToast } from 'primevue/usetoast';
import api from '@shared/api';
import { fmtEurCents, fmtEur, fmtDateShort } from '@shared/format';
import TransactionDialog from '../components/TransactionDialog.vue';

const toast = useToast();
const data = ref(null);
const loading = ref(true);
const categories = ref([]);
const budgets = ref([]);
const running = ref(false);
const dlg = ref(false);
const dlgType = ref('expense');

const DONUT = ['#10b981', '#2dd4bf', '#38bdf8', '#fbbf24', '#fb7185', '#a78bfa', '#a3e635', '#22d3ee'];

async function refresh() {
  const [d, c, b] = await Promise.all([
    api.get('/dashboard'),
    api.get('/categories').then((r) => r.categories || r).catch(() => []),
    api.get('/budgets').then((r) => r.budgets || []).catch(() => []),
  ]);
  data.value = d;
  categories.value = c;
  budgets.value = b;
}

async function runRecurring() {
  running.value = true;
  try {
    const res = await api.post('/recurring/run');
    toast.add({ severity: 'success', summary: res.created ? `${res.created} fixa(s) lançadas` : 'Nada pendente', life: 3000 });
    await refresh();
  } catch (e) { /* */ } finally { running.value = false; }
}

const advancing = ref(false);
async function advanceCycle() {
  advancing.value = true;
  try {
    await api.post('/cycle/advance');
    toast.add({ severity: 'success', summary: 'Novo ciclo iniciado', detail: 'A partir de hoje conta para o novo ciclo.', life: 3500 });
    await refresh();
    window.dispatchEvent(new CustomEvent('financeiro:tx-changed'));
  } catch (e) { /* */ } finally { advancing.value = false; }
}
async function resetCycle() {
  advancing.value = true;
  try {
    await api.post('/cycle/reset');
    toast.add({ severity: 'success', summary: 'Ciclo reposto', detail: 'Voltou ao dia configurado.', life: 3000 });
    await refresh();
    window.dispatchEvent(new CustomEvent('financeiro:tx-changed'));
  } catch (e) { /* */ } finally { advancing.value = false; }
}

const onExternalChange = () => { refresh().catch(() => {}); };
onMounted(async () => {
  try { await refresh(); } catch (e) { /* toast */ } finally { loading.value = false; }
  window.addEventListener('financeiro:tx-changed', onExternalChange);
});
onUnmounted(() => window.removeEventListener('financeiro:tx-changed', onExternalChange));

const summary = computed(() => data.value?.summary || { income: 0, expense: 0, allocated: 0 });
const totals = computed(() => data.value?.totals || { balance: 0, allocated: 0, available: 0 });
const cycle = computed(() => data.value?.cycle || null);

const saved = computed(() => summary.value.income - summary.value.expense);
const savingsRate = computed(() => (summary.value.income > 0 ? Math.round((saved.value / summary.value.income) * 100) : 0));

// Dias até ao próximo salário (início do próximo ciclo = fim + 1 dia).
const daysToSalary = computed(() => {
  if (!cycle.value?.end) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const next = new Date(cycle.value.end); next.setDate(next.getDate() + 1); next.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((next - today) / 86400000));
});

// Tendência de poupança (6 meses).
const trend = computed(() => {
  const rows = data.value?.trend || [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.saved)));
  return rows.map((r, i) => {
    const [y, m] = r.month.split('-');
    const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '');
    return { ...r, label, height: Math.round((Math.abs(r.saved) / max) * 100), current: i === rows.length - 1 };
  });
});
const avgSaved = computed(() => {
  const rows = data.value?.trend || [];
  if (!rows.length) return 0;
  return rows.reduce((a, r) => a + r.saved, 0) / rows.length;
});

// Categorias → donut.
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
  return `conic-gradient(${cats.value.map((c) => `${c.color} ${c.from}% ${c.to}%`).join(', ')})`;
});
const expenseTotal = computed(() => cats.value.reduce((a, c) => a + c.total, 0));

const savings = computed(() => {
  const s = data.value?.savings || { target: 0, saved: 0 };
  const target = Number(s.target || 0);
  const sv = Number(s.saved || 0);
  const percent = target > 0 ? Math.min(100, Math.round((sv / target) * 100)) : 0;
  return { target, saved: sv, percent, remaining: Math.max(0, target - sv) };
});

const goals = computed(() => (data.value?.goals || []).map((g) => {
  const target = Number(g.valor_objetivo || 0);
  const allocated = Number(g.total_alocado || 0);
  return { ...g, target, allocated, percent: target > 0 ? Math.min(100, Math.round((allocated / target) * 100)) : 0 };
}).slice(0, 4));

const recurringPending = computed(() => Number(data.value?.recurring?.pending || 0));
const accountsList = computed(() => (data.value?.accounts || []).map((a) => ({ ...a, saldo: Number(a.saldo || 0) })));
const hasAccounts = computed(() => accountsList.value.length > 0);
// Saldo "livre" = contas marcadas para somar (exclui ex.: cartão refeição).
const includedTotal = computed(() => accountsList.value.filter((a) => a.include_in_total !== 0).reduce((s, a) => s + a.saldo, 0));
const excludedTotal = computed(() => accountsList.value.filter((a) => a.include_in_total === 0).reduce((s, a) => s + a.saldo, 0));
const excludedAccounts = computed(() => accountsList.value.filter((a) => a.include_in_total === 0));
const heroTotal = computed(() => (hasAccounts.value ? includedTotal.value : Number(totals.value.balance || 0)));
const heroAvailable = computed(() => heroTotal.value - Number(totals.value.allocated || 0));

// Alertas de budget: categorias a ≥80% do limite do ciclo.
const budgetAlerts = computed(() => budgets.value
  .map((b) => {
    const limit = Number(b.valor || 0);
    const spent = Number(b.spent || 0);
    const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    return { nome: b.categoria_nome, percent, spent, limit };
  })
  .filter((b) => b.percent >= 80)
  .sort((a, z) => z.percent - a.percent));

// Insights vs ciclo anterior.
const insights = computed(() => {
  const i = data.value?.insights;
  if (!i) return null;
  const savedDelta = saved.value - Number(i.prev?.saved || 0);
  return { movers: i.movers || [], pace: i.pace || null, prev: i.prev || {}, savedDelta };
});


function openAdd(type) { dlgType.value = type; dlg.value = true; }
async function onSaved() { try { await refresh(); } catch (e) { /* */ } }
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Olá 👋</h1><p class="sub" v-if="cycle">Ciclo {{ fmtDateShort(cycle.start) }} – {{ fmtDateShort(cycle.end) }}</p></div>
      <div class="head-actions">
        <button class="btn btn-sm" @click="openAdd('income')"><i class="pi pi-arrow-up-right" style="color:var(--success)" /> Receita</button>
        <button class="btn btn-sm btn-primary" @click="openAdd('expense')"><i class="pi pi-plus" /> Despesa</button>
      </div>
    </div>

    <div v-if="loading" class="loading"><ProgressSpinner style="width:40px;height:40px" strokeWidth="4" /></div>

    <template v-else-if="data">
      <!-- HERO: saldo real -->
      <section class="hero">
        <div class="hero-main">
          <div class="hero-balances">
            <div class="hero-primary">
              <span class="hero-label">Saldo disponível</span>
              <span class="hero-value">{{ fmtEurCents(heroAvailable) }}</span>
            </div>
            <div v-for="a in excludedAccounts" :key="a.id" class="hero-acct">
              <span class="ha-name"><i class="pi pi-credit-card" /> {{ a.nome }}</span>
              <span class="ha-val">{{ fmtEurCents(a.saldo) }}</span>
            </div>
          </div>
          <span class="hero-sub">
            {{ fmtEurCents(heroTotal) }} nas contas<template v-if="totals.allocated > 0"> · <i class="pi pi-flag" style="font-size:0.72rem" /> {{ fmtEurCents(totals.allocated) }} reservado em objetivos</template>
          </span>
        </div>
        <div class="hero-foot" v-if="daysToSalary !== null">
          <i class="pi pi-calendar-clock" />
          <span v-if="cycle?.overridden">Ciclo avançado manualmente</span>
          <span v-else-if="daysToSalary === 0">Recebes salário hoje 🎉</span>
          <span v-else>Próximo salário em <strong>{{ daysToSalary }}</strong> {{ daysToSalary === 1 ? 'dia' : 'dias' }}</span>
          <button v-if="cycle?.overridden" class="cyc-btn" :disabled="advancing" @click="resetCycle">Desfazer</button>
          <button v-else-if="daysToSalary !== null && daysToSalary <= 5" class="cyc-btn" :disabled="advancing" @click="advanceCycle">
            <i v-if="advancing" class="pi pi-spin pi-spinner" /> Já recebi — avançar ciclo
          </button>
        </div>
      </section>

      <!-- SALDOS POR CONTA -->
      <section v-if="accountsList.length > 1" class="surface card">
        <div class="card-head"><h2>Saldos por conta</h2><RouterLink class="link" to="/contas">gerir</RouterLink></div>
        <div class="acct-list">
          <div v-for="a in accountsList" :key="a.id" class="acct">
            <span class="acct-ic" :style="{ background: (a.cor || '#5b8cff') + '22', color: a.cor || '#5b8cff' }"><i class="pi pi-wallet" /></span>
            <span class="acct-name">{{ a.nome }}<span v-if="a.include_in_total === 0" class="sep-tag">não somado</span></span>
            <span class="acct-saldo" :class="a.saldo < 0 ? 'neg' : ''">{{ fmtEurCents(a.saldo) }}</span>
          </div>
        </div>
      </section>

      <!-- FIXAS PENDENTES -->
      <section v-if="recurringPending > 0" class="surface card prompt">
        <span class="prompt-ic"><i class="pi pi-clock" /></span>
        <span class="prompt-txt"><strong>{{ recurringPending }} fixa(s) por lançar</strong><span class="muted tiny">Renda, ginásio, salário…</span></span>
        <button class="btn btn-primary btn-sm" :disabled="running" @click="runRecurring"><i v-if="running" class="pi pi-spin pi-spinner" /> Lançar</button>
      </section>

      <!-- ALERTAS DE BUDGET -->
      <section v-if="budgetAlerts.length" class="surface card">
        <div class="card-head"><h2><i class="pi pi-exclamation-triangle" style="color:var(--warning)" /> Atenção aos budgets</h2><RouterLink class="link" to="/budgets">ver</RouterLink></div>
        <div class="alert-rows">
          <div v-for="a in budgetAlerts" :key="a.nome" class="alert-row">
            <span class="a-name">{{ a.nome }}</span>
            <div class="bar-track mini"><span class="bar-fill" :class="a.percent >= 100 ? 'danger' : 'warn'" :style="{ width: Math.min(100, a.percent) + '%' }" /></div>
            <span class="a-pct" :class="a.percent >= 100 ? 'neg' : 'warnc'">{{ a.percent }}%</span>
          </div>
        </div>
      </section>

      <!-- ESTE CICLO -->
      <section class="surface card">
        <div class="card-head"><h2>Este ciclo</h2>
          <span class="chip" :class="saved >= 0 ? 'success' : 'danger'">{{ savingsRate }}% poupado</span>
        </div>
        <div class="cycle-stats">
          <div class="cs"><span class="cs-l">Receitas</span><span class="cs-v pos">{{ fmtEurCents(summary.income) }}</span></div>
          <div class="cs"><span class="cs-l">Despesas</span><span class="cs-v neg">{{ fmtEurCents(summary.expense) }}</span></div>
          <div class="cs"><span class="cs-l">Poupado</span><span class="cs-v" :class="saved >= 0 ? 'pos' : 'neg'">{{ fmtEurCents(saved) }}</span></div>
        </div>
      </section>

      <!-- INSIGHTS -->
      <section v-if="insights" class="surface card">
        <div class="card-head"><h2>Insights</h2><span class="muted tiny">vs ciclo anterior</span></div>
        <div class="insight-line">
          <i :class="insights.savedDelta >= 0 ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-right'" :style="{ color: insights.savedDelta >= 0 ? 'var(--success)' : 'var(--danger)' }" />
          <span>Poupaste <strong>{{ fmtEurCents(Math.abs(insights.savedDelta)) }}</strong> {{ insights.savedDelta >= 0 ? 'a mais' : 'a menos' }} que no ciclo anterior</span>
        </div>
        <div v-if="insights.pace" class="insight-line">
          <i class="pi pi-gauge" style="color:var(--brand)" />
          <span>A este ritmo, fechas o ciclo com ~<strong>{{ fmtEur(insights.pace.projectedExpense) }}</strong> de despesa</span>
        </div>
        <div v-if="insights.movers.length" class="movers">
          <div class="movers-h">Maiores variações</div>
          <div v-for="m in insights.movers" :key="m.nome" class="mover">
            <span class="m-name">{{ m.nome }}</span>
            <span class="m-delta" :class="m.delta >= 0 ? 'neg' : 'pos'">{{ m.delta >= 0 ? '+' : '−' }}{{ fmtEur(Math.abs(m.delta)) }}</span>
          </div>
        </div>
      </section>

      <!-- TENDÊNCIA -->
      <section class="surface card">
        <div class="card-head"><h2>Poupança · 6 meses</h2><span class="muted tiny">média {{ fmtEur(avgSaved) }}/mês</span></div>
        <div class="trend">
          <div v-for="t in trend" :key="t.month" class="tcol">
            <span class="tval" :class="t.saved >= 0 ? 'pos' : 'neg'">{{ fmtEur(t.saved) }}</span>
            <div class="tbar-wrap">
              <div class="tbar" :class="[t.saved >= 0 ? 'up' : 'down', { current: t.current }]" :style="{ height: Math.max(4, t.height) + '%' }" />
            </div>
            <span class="tlbl" :class="{ current: t.current }">{{ t.label }}</span>
          </div>
        </div>
      </section>

      <!-- META DE POUPANÇA -->
      <section v-if="savings.target > 0" class="surface card">
        <div class="card-head"><h2><i class="pi pi-piggy-bank" /> Meta de poupança do mês</h2><RouterLink class="link" to="/definicoes">ajustar</RouterLink></div>
        <div class="big-amount" :class="{ pos: savings.percent >= 100 }">{{ fmtEurCents(savings.saved) }} <span class="muted">/ {{ fmtEurCents(savings.target) }}</span></div>
        <div class="bar-track"><span class="bar-fill" :class="{ success: savings.percent >= 100 }" :style="{ width: savings.percent + '%' }" /></div>
        <div class="row-foot">
          <span class="chip" :class="savings.percent >= 100 ? 'success' : ''">{{ savings.percent }}%</span>
          <span class="muted tiny">{{ savings.percent >= 100 ? 'Meta atingida 🎉' : `Faltam ${fmtEurCents(savings.remaining)}` }}</span>
        </div>
      </section>
      <RouterLink v-else to="/definicoes" class="surface card cta">
        <span class="cta-ic"><i class="pi pi-piggy-bank" /></span>
        <span class="cta-txt"><strong>Define uma meta de poupança mensal</strong><span class="muted tiny">Preenche-se sozinha com o que poupas este ciclo</span></span>
        <i class="pi pi-chevron-right cta-arrow" />
      </RouterLink>

      <div class="grid-2">
        <!-- GASTOS POR CATEGORIA -->
        <section class="surface card">
          <div class="card-head"><h2>Gastos por categoria</h2><span class="muted tiny">este ciclo</span></div>
          <div v-if="!cats.length" class="empty"><i class="pi pi-chart-pie" />Sem despesas neste ciclo.</div>
          <div v-else class="donut-wrap">
            <div class="donut-stack">
              <div class="donut" :style="{ background: donutBg }" />
              <div class="donut-hole"><span class="donut-total">{{ fmtEur(expenseTotal) }}</span><span class="muted tiny">total</span></div>
            </div>
            <ul class="legend">
              <li v-for="c in cats.slice(0, 6)" :key="c.nome">
                <span class="dot" :style="{ background: c.color }" />
                <span class="lg-name">{{ c.nome }}</span>
                <span class="lg-val">{{ fmtEurCents(c.total) }}</span>
              </li>
            </ul>
          </div>
        </section>

        <!-- OBJETIVOS -->
        <section class="surface card">
          <div class="card-head"><h2>Objetivos</h2><RouterLink class="link" to="/objetivos">ver todos</RouterLink></div>
          <div v-if="!goals.length" class="empty"><i class="pi pi-flag" />Ainda não tens objetivos.</div>
          <div v-else class="goals">
            <div v-for="g in goals" :key="g.id" class="goal">
              <div class="goal-top"><span class="goal-name">{{ g.nome }}</span><span class="muted tiny">{{ g.percent }}%</span></div>
              <div class="bar-track"><span class="bar-fill" :class="{ success: g.percent >= 100 }" :style="{ width: g.percent + '%' }" /></div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <TransactionDialog v-model:visible="dlg" :categories="categories" :accounts="accountsList" :initial-type="dlgType" @saved="onSaved" />
  </div>
</template>

<style scoped>
.head-actions { display: flex; gap: 0.5rem; }

/* Saldos por conta */
.acct-list { display: flex; flex-direction: column; gap: 0.2rem; }
.acct { display: flex; align-items: center; gap: 0.7rem; padding: 0.55rem 0; border-bottom: 1px solid var(--line); }
.acct:last-child { border-bottom: none; }
.acct-ic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: none; font-size: 0.9rem; }
.acct-name { flex: 1; font-weight: 600; font-size: 0.92rem; }
.acct-saldo { font-family: var(--font-display); font-weight: 700; font-size: 1rem; }
.acct-saldo.neg { color: var(--danger); }

/* Prompt (fixas pendentes) */
.prompt { display: flex; align-items: center; gap: 0.85rem; padding: 0.9rem 1.1rem; }
.prompt-ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex: none; background: var(--warning-soft); color: var(--warning); font-size: 1.05rem; }
.prompt-txt { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }

/* Alertas de budget */
.alert-rows { display: flex; flex-direction: column; gap: 0.7rem; }
.alert-row { display: grid; grid-template-columns: 1fr 90px auto; align-items: center; gap: 0.6rem; }
.a-name { font-size: 0.88rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.a-pct { font-size: 0.8rem; font-weight: 700; min-width: 38px; text-align: right; }
.a-pct.warnc { color: var(--warning); }
.bar-track.mini { height: 7px; }
.bar-fill.warn { background: linear-gradient(120deg, #fbbf24, #f59e0b); }

/* Insights */
.insight-line { display: flex; align-items: flex-start; gap: 0.55rem; font-size: 0.9rem; color: var(--ink-2); padding: 0.3rem 0; line-height: 1.4; }
.insight-line i { margin-top: 2px; }
.movers { margin-top: 0.7rem; padding-top: 0.7rem; border-top: 1px solid var(--line); }
.movers-h { font-size: 0.74rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-4); margin-bottom: 0.5rem; }
.mover { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.3rem 0; }
.m-name { font-size: 0.88rem; }
.m-delta { font-family: var(--font-display); font-weight: 700; font-size: 0.9rem; }

/* Hero */
.hero {
  border-radius: var(--radius-3); padding: 1.4rem 1.4rem 1.1rem; color: #fff; position: relative; overflow: hidden;
  background: var(--brand-grad); box-shadow: var(--brand-glow), var(--shadow-2);
}
.hero::after { content: ''; position: absolute; inset: 0; background: radial-gradient(420px 220px at 110% -20%, rgba(255,255,255,0.28), transparent 60%); pointer-events: none; }
.hero-main { display: flex; flex-direction: column; gap: 0.2rem; position: relative; }
.hero-balances { display: flex; align-items: flex-end; gap: 0.9rem; flex-wrap: wrap; }
.hero-primary { display: flex; flex-direction: column; gap: 0.2rem; }
.hero-label { font-size: 0.78rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.85; }
.hero-value { font-family: var(--font-display); font-size: 2.3rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
.hero-acct { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.5rem 0.8rem; border-radius: 14px; background: rgba(255,255,255,0.14); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); margin-bottom: 0.1rem; }
.ha-name { font-size: 0.72rem; font-weight: 600; opacity: 0.92; display: inline-flex; align-items: center; gap: 0.35rem; white-space: nowrap; }
.ha-val { font-family: var(--font-display); font-weight: 700; font-size: 1.35rem; line-height: 1; }
.hero-sub { font-size: 0.82rem; opacity: 0.9; margin-top: 0.15rem; }
.sep-tag { margin-left: 0.45rem; font-size: 0.64rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-4); background: var(--line); border-radius: var(--radius-pill); padding: 0.08rem 0.45rem; }
.hero-foot { display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem; padding-top: 0.85rem; border-top: 1px solid rgba(255,255,255,0.22); font-size: 0.88rem; position: relative; flex-wrap: wrap; }
.cyc-btn { margin-left: auto; background: rgba(255,255,255,0.18); color: #fff; border: 1px solid rgba(255,255,255,0.35); border-radius: var(--radius-pill); padding: 0.32rem 0.7rem; font-size: 0.78rem; font-weight: 600; font-family: inherit; cursor: pointer; white-space: nowrap; }
.cyc-btn:active { background: rgba(255,255,255,0.28); }
.cyc-btn:disabled { opacity: 0.6; }

/* Este ciclo */
.cycle-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
.cs { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.4rem 0; }
.cs-l { font-size: 0.74rem; color: var(--ink-3); font-weight: 600; }
.cs-v { font-family: var(--font-display); font-weight: 700; font-size: 1.15rem; }
.pos { color: var(--success); } .neg { color: var(--danger); }

/* Tendência */
.trend { display: flex; align-items: flex-end; gap: 0.4rem; height: 150px; }
.tcol { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.35rem; height: 100%; justify-content: flex-end; }
.tval { font-size: 0.66rem; font-weight: 700; }
.tbar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.tbar { width: 70%; max-width: 30px; border-radius: 7px 7px 4px 4px; }
.tbar.up { background: linear-gradient(180deg, var(--success), color-mix(in srgb, var(--success) 60%, transparent)); }
.tbar.down { background: linear-gradient(180deg, var(--danger), color-mix(in srgb, var(--danger) 60%, transparent)); }
.tbar.current { outline: 2px solid var(--brand); outline-offset: 1px; }
.tlbl { font-size: 0.7rem; color: var(--ink-4); text-transform: capitalize; }
.tlbl.current { color: var(--brand); font-weight: 700; }

/* Amounts / footers shared */
.big-amount { font-family: var(--font-display); font-weight: 700; font-size: 1.3rem; margin-bottom: 0.6rem; }
.big-amount .muted { font-weight: 500; font-size: 0.92rem; }
.row-foot { display: flex; align-items: center; gap: 0.7rem; margin-top: 0.7rem; }

/* CTA */
.cta { display: flex; align-items: center; gap: 0.85rem; padding: 1rem 1.1rem; color: var(--ink); }
.cta-ic { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; flex: none; background: var(--brand-soft); color: var(--brand); font-size: 1.1rem; }
.cta-txt { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.cta-arrow { color: var(--ink-4); }

/* Donut */
.donut-wrap { display: flex; align-items: center; gap: 1.1rem; flex-wrap: wrap; }
.donut-stack { position: relative; width: 132px; height: 132px; flex: none; }
.donut { width: 132px; height: 132px; border-radius: 50%; -webkit-mask: radial-gradient(circle 40px at center, transparent 98%, #000 100%); mask: radial-gradient(circle 40px at center, transparent 98%, #000 100%); }
.donut-hole { position: absolute; inset: 0; display: grid; place-content: center; place-items: center; text-align: center; pointer-events: none; }
.donut-total { font-family: var(--font-display); font-weight: 700; font-size: 0.9rem; }
.legend { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 0.5rem; }
.legend li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
.dot { width: 10px; height: 10px; border-radius: 3px; }
.lg-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lg-val { font-weight: 600; }

/* Objetivos */
.goals { display: flex; flex-direction: column; gap: 0.9rem; }
.goal-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; margin-bottom: 0.4rem; }
.goal-name { font-weight: 600; font-size: 0.9rem; }
</style>
