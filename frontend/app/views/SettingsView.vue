<script setup>
import { ref, computed, onMounted } from 'vue';
import { useToast } from 'primevue/usetoast';
import api from '@shared/api';
import { useUser } from '../lib/useUser';
import { useTheme } from '@shared/useTheme';
import { pushSupported, isStandalone, isPushEnabled, enablePush, disablePush, testPush } from '@shared/push';

const toast = useToast();
const { user, load } = useUser();
const { resolved: theme, toggle: toggleTheme } = useTheme();

const LAST_BUSINESS = 99;
const LAST_CALENDAR = 100;

const mode = ref('fixed');         // 'fixed' | 'last_business' | 'last_calendar'
const fixedDay = ref(1);
const adjustWeekend = ref(false);
const busy = ref(false);

// Meta de poupança mensal
const savingsTarget = ref(0);
const savingBusy = ref(false);

// Notificações push
const pushOk = pushSupported();
const standalone = isStandalone();
const notifEnabled = ref(false);
const notifBusy = ref(false);
async function refreshNotif() { notifEnabled.value = await isPushEnabled(); }
async function toggleNotif() {
  notifBusy.value = true;
  try {
    if (notifEnabled.value) { await disablePush(); notifEnabled.value = false; toast.add({ severity: 'info', summary: 'Notificações desativadas', life: 2200 }); }
    else { await enablePush(); notifEnabled.value = true; toast.add({ severity: 'success', summary: 'Notificações ativadas', life: 2200 }); }
  } catch (e) {
    const msg = e.code === 'denied' ? 'Permissão recusada nas definições do telemóvel.' : e.code === 'unavailable' ? 'Push indisponível no servidor (falta npm install web-push).' : 'Não foi possível ativar.';
    toast.add({ severity: 'warn', summary: 'Notificações', detail: msg, life: 4000 });
  } finally { notifBusy.value = false; }
}
async function doTestNotif() {
  notifBusy.value = true;
  try { const r = await testPush(); toast.add({ severity: r.sent ? 'success' : 'warn', summary: r.sent ? 'Enviada 📨' : 'Sem dispositivos', life: 3000 }); }
  catch (e) { toast.add({ severity: 'warn', summary: 'Falhou', detail: 'Ativa as notificações primeiro.', life: 3000 }); }
  finally { notifBusy.value = false; }
}

function hydrate() {
  const d = Number(user.value?.cycle_day ?? 1);
  if (d === LAST_BUSINESS) { mode.value = 'last_business'; }
  else if (d === LAST_CALENDAR) { mode.value = 'last_calendar'; }
  else { mode.value = 'fixed'; fixedDay.value = Math.min(28, Math.max(1, d)); }
  adjustWeekend.value = !!(user.value?.cycle_next_business_day);
}

onMounted(async () => {
  await load();
  hydrate();
  try { savingsTarget.value = Number((await api.get('/savings-target')).target || 0); } catch (e) { /* */ }
  if (pushOk) refreshNotif();
});

async function saveSavings() {
  savingBusy.value = true;
  try {
    const res = await api.put('/savings-target', { target: Number(savingsTarget.value) || 0 });
    savingsTarget.value = Number(res.target || 0);
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'Meta de poupança atualizada.', life: 2500 });
    window.dispatchEvent(new CustomEvent('financeiro:tx-changed'));
  } catch (e) { /* */ } finally { savingBusy.value = false; }
}

const MODES = [
  { key: 'fixed', label: 'Dia fixo do mês', icon: 'pi pi-calendar', desc: 'Recebes sempre no mesmo dia (ex.: dia 8).' },
  { key: 'last_business', label: 'Último dia útil do mês', icon: 'pi pi-briefcase', desc: 'Ajusta para sexta se calhar ao fim-de-semana.' },
  { key: 'last_calendar', label: 'Último dia do mês', icon: 'pi pi-flag-fill', desc: 'Dia 30/31 (ou 28/29 em fevereiro).' },
];

// A friendly description of what the cycle will be.
const preview = computed(() => {
  if (mode.value === 'last_business') return 'O teu mês financeiro começa no último dia útil de cada mês.';
  if (mode.value === 'last_calendar') return 'O teu mês financeiro começa no último dia de cada mês.';
  const d = fixedDay.value;
  return `O teu mês financeiro começa no dia ${d}${adjustWeekend.value ? ' (ou no próximo dia útil, se calhar ao fim-de-semana)' : ''}.`;
});

async function save() {
  busy.value = true;
  let cycle_day;
  if (mode.value === 'last_business') cycle_day = LAST_BUSINESS;
  else if (mode.value === 'last_calendar') cycle_day = LAST_CALENDAR;
  else cycle_day = Math.min(28, Math.max(1, Number(fixedDay.value) || 1));
  try {
    const res = await api.put('/me/cycle', {
      cycle_day,
      cycle_next_business_day: mode.value === 'fixed' ? adjustWeekend.value : false,
    });
    if (user.value) {
      user.value.cycle_day = res.cycle_day;
      user.value.cycle_next_business_day = res.cycle_next_business_day;
    }
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'Dia de salário atualizado.', life: 2500 });
    // Make the dashboard recompute its cycle.
    window.dispatchEvent(new CustomEvent('financeiro:tx-changed'));
  } catch (e) { /* global toast */ } finally { busy.value = false; }
}
</script>

<template>
  <div class="page">
    <div class="page-head"><div><h1>Definições</h1><p class="sub">Personaliza o teu mês financeiro</p></div></div>

    <section class="surface card">
      <div class="card-head"><h2><i class="pi pi-wallet" /> Dia de salário</h2></div>
      <p class="muted intro">Define quando recebes — o teu “mês” financeiro (saldos e relatórios) passa a começar nesse dia.</p>

      <div class="modes">
        <button v-for="m in MODES" :key="m.key" type="button" class="mode" :class="{ on: mode === m.key }" @click="mode = m.key">
          <div class="mode-ic"><i :class="m.icon" /></div>
          <div class="mode-txt"><span class="mode-l">{{ m.label }}</span><span class="mode-d">{{ m.desc }}</span></div>
          <i class="pi pi-check tick" v-if="mode === m.key" />
        </button>
      </div>

      <div v-if="mode === 'fixed'" class="fixed-opts">
        <label class="field">
          <span>Dia do mês</span>
          <select v-model.number="fixedDay">
            <option v-for="d in 28" :key="d" :value="d">Dia {{ d }}</option>
          </select>
        </label>
        <label class="check">
          <input type="checkbox" v-model="adjustWeekend" />
          <span>Se calhar ao fim-de-semana, usar o próximo dia útil</span>
        </label>
      </div>

      <p class="preview"><i class="pi pi-info-circle" /> {{ preview }}</p>

      <button class="btn btn-primary btn-block" :disabled="busy" @click="save">
        <i v-if="busy" class="pi pi-spin pi-spinner" /> Guardar
      </button>
    </section>

    <section class="surface card">
      <div class="card-head"><h2><i class="pi pi-piggy-bank" /> Meta de poupança mensal</h2></div>
      <p class="muted intro">Define quanto queres poupar por mês. Preenche-se sozinha ao longo do ciclo com <strong>receitas − despesas</strong> — não precisas de alocar dinheiro manualmente.</p>
      <label class="field">
        <span>Valor a poupar por mês (€)</span>
        <input v-model.number="savingsTarget" type="number" step="0.01" min="0" inputmode="decimal" placeholder="ex.: 300" />
      </label>
      <p class="muted tiny" style="margin:0.6rem 0 1rem">Define 0 para desativar a meta.</p>
      <button class="btn btn-primary btn-block" :disabled="savingBusy" @click="saveSavings">
        <i v-if="savingBusy" class="pi pi-spin pi-spinner" /> Guardar meta
      </button>
    </section>

    <section class="surface card">
      <div class="card-head"><h2><i class="pi pi-bell" /> Notificações push</h2></div>
      <p class="muted intro">Recebe avisos no telemóvel: dia de salário, fixas por lançar e budgets excedidos.</p>
      <p v-if="!pushOk" class="muted tiny">Este dispositivo/navegador não suporta notificações push.</p>
      <template v-else>
        <div class="notif-row">
          <div><div class="notif-title">{{ notifEnabled ? 'Ativadas' : 'Desativadas' }}</div><div class="muted tiny">{{ notifEnabled ? 'Recebes avisos neste dispositivo' : 'Toca para ativar neste dispositivo' }}</div></div>
          <button class="btn btn-sm" :class="notifEnabled ? '' : 'btn-primary'" :disabled="notifBusy" @click="toggleNotif"><i v-if="notifBusy" class="pi pi-spin pi-spinner" /> {{ notifEnabled ? 'Desativar' : 'Ativar' }}</button>
        </div>
        <button v-if="notifEnabled" class="btn btn-sm btn-block" style="margin-top:0.8rem" :disabled="notifBusy" @click="doTestNotif"><i class="pi pi-send" /> Enviar teste</button>
        <p v-if="!standalone" class="muted tiny ios-hint"><i class="pi pi-info-circle" /> No iPhone, adiciona primeiro a app ao ecrã principal (Partilhar → "Adicionar ao ecrã principal") — só aí o push funciona.</p>
      </template>
    </section>

    <section class="surface card">
      <div class="card-head"><h2><i class="pi pi-palette" /> Aparência</h2></div>
      <div class="row" style="border:none">
        <div class="row-main"><div class="row-title">Tema</div><div class="row-sub">{{ theme === 'dark' ? 'Escuro' : 'Claro' }}</div></div>
        <button class="btn btn-sm" @click="toggleTheme"><i :class="theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'" /> Mudar</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.intro { margin-bottom: 1rem; line-height: 1.5; }
.modes { display: flex; flex-direction: column; gap: 0.6rem; }
.mode {
  display: flex; align-items: center; gap: 0.85rem; text-align: left; cursor: pointer;
  padding: 0.85rem; border-radius: 14px; border: 1px solid var(--line-2); background: var(--bg-2);
  font-family: inherit; transition: border-color var(--t-base) var(--ease), background var(--t-base) var(--ease);
}
.mode.on { border-color: var(--brand); background: var(--brand-soft); }
.mode-ic { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; flex: none; background: var(--brand-soft); color: var(--brand); font-size: 1rem; }
.mode.on .mode-ic { background: var(--brand-grad); color: #fff; }
.mode-txt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.mode-l { font-weight: 600; font-size: 0.95rem; }
.mode-d { font-size: 0.8rem; color: var(--ink-3); }
.tick { color: var(--brand); font-weight: 700; }
.fixed-opts { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.9rem; }
.check { display: flex; align-items: center; gap: 0.6rem; font-size: 0.9rem; color: var(--ink-2); cursor: pointer; }
.check input { width: auto; min-height: 0; }
.preview { display: flex; align-items: flex-start; gap: 0.5rem; margin: 1.1rem 0; padding: 0.75rem 0.9rem; border-radius: 12px; background: var(--brand-tint); color: var(--ink-2); font-size: 0.85rem; line-height: 1.45; }
.preview i { color: var(--brand); margin-top: 1px; }
.notif-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.notif-title { font-weight: 600; font-size: 0.95rem; }
.ios-hint { display: flex; align-items: flex-start; gap: 0.4rem; margin-top: 0.9rem; line-height: 1.45; }
.ios-hint i { color: var(--brand); margin-top: 1px; }
</style>
