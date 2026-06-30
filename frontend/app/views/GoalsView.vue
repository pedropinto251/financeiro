<script setup>
import { ref, onMounted, computed } from 'vue';
import Dialog from 'primevue/dialog';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import ProgressSpinner from 'primevue/progressspinner';
import api from '@shared/api';
import { fmtEurCents, fmtDate, todayIso } from '@shared/format';

const confirm = useConfirm();
const toast = useToast();
const goals = ref([]);
const allocations = ref([]);
const available = ref(0);
const categories = ref([]);
const accounts = ref([]);
const loading = ref(true);
const busy = ref(false);

const goalDlg = ref(false);
const editingGoal = ref(null);
const goalForm = ref({ name: '', target_amount: null, target_date: '' });

const allocDlg = ref(false);
const allocForm = ref({ goal_id: '', amount: null, date: todayIso(), note: '' });

const allocEditDlg = ref(false);
const allocEditForm = ref({ id: null, goal_id: '', amount: null, date: todayIso(), note: '' });

const spendDlg = ref(false);
const spendForm = ref({ goal_id: '', goal_nome: '', reserved: 0, amount: null, date: todayIso(), category_id: '', account_id: '', description: '' });

const expenseCats = computed(() => categories.value.filter((c) => c.tipo === 'expense'));
const defaultAccountId = () => { const d = accounts.value.find((a) => a.is_default) || accounts.value[0]; return d ? d.id : ''; };

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    const [g, dash, cats, accs] = await Promise.all([
      api.get('/goals'),
      api.get('/dashboard'),
      api.get('/categories').then((r) => r.categories || r).catch(() => []),
      api.get('/accounts').then((r) => r.accounts || []).catch(() => []),
    ]);
    goals.value = g.goals || [];
    allocations.value = g.allocations || [];
    available.value = Number(dash.totals?.available || 0);
    categories.value = cats;
    accounts.value = accs;
  } catch (e) { /* */ } finally { loading.value = false; }
}
onMounted(load);

function openSpend(g) {
  spendForm.value = { goal_id: g.id, goal_nome: g.nome, reserved: g.allocated, amount: g.allocated, date: todayIso(), category_id: '', account_id: defaultAccountId(), description: g.nome };
  spendDlg.value = true;
}
function editAllocation(a) {
  allocEditForm.value = { id: a.id, goal_id: a.goal_id, amount: Number(a.valor), date: String(a.data_alocacao).slice(0, 10), note: a.nota || '' };
  allocEditDlg.value = true;
}
async function saveAllocEdit() {
  if (!allocEditForm.value.amount || !allocEditForm.value.date) { toast.add({ severity: 'warn', summary: 'Faltam dados', life: 2500 }); return; }
  busy.value = true;
  try {
    await api.put(`/goals/allocations/${allocEditForm.value.id}`, {
      goal_id: allocEditForm.value.goal_id,
      amount: allocEditForm.value.amount,
      date: allocEditForm.value.date,
      note: allocEditForm.value.note || null,
    });
    toast.add({ severity: 'success', summary: 'Alocação atualizada', life: 2200 });
    allocEditDlg.value = false; await load(true);
    window.dispatchEvent(new CustomEvent('financeiro:tx-changed'));
  } catch (e) { /* */ } finally { busy.value = false; }
}
function removeAllocation(a) {
  confirm.require({
    message: `Eliminar esta alocação de ${fmtEurCents(a.valor)} em "${a.goal_nome}"?`, header: 'Confirmar', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptClass: 'p-button-danger',
    accept: async () => {
      try { await api.delete(`/goals/allocations/${a.id}`); toast.add({ severity: 'success', summary: 'Eliminada', life: 2000 }); await load(true); window.dispatchEvent(new CustomEvent('financeiro:tx-changed')); }
      catch (e) { /* */ }
    },
  });
}

async function saveSpend() {
  if (!spendForm.value.amount || spendForm.value.amount <= 0) { toast.add({ severity: 'warn', summary: 'Indica o valor', life: 2500 }); return; }
  busy.value = true;
  try {
    const res = await api.post(`/goals/${spendForm.value.goal_id}/spend`, {
      amount: spendForm.value.amount,
      date: spendForm.value.date,
      category_id: spendForm.value.category_id || null,
      account_id: spendForm.value.account_id || null,
      description: spendForm.value.description || null,
    });
    toast.add({ severity: 'success', summary: 'Despesa criada', detail: res && res.archived ? 'Objetivo gasto e arquivado.' : 'Gasto do objetivo registado.', life: 2800 });
    spendDlg.value = false;
    await load(true);
    window.dispatchEvent(new CustomEvent('financeiro:tx-changed'));
  } catch (e) { /* */ } finally { busy.value = false; }
}

const view = computed(() => goals.value.map((g) => {
  const target = Number(g.valor_objetivo || 0);
  const allocated = Number(g.total_alocado || 0);
  return { ...g, target, allocated, percent: target > 0 ? Math.min(100, Math.round((allocated / target) * 100)) : 0 };
}));
const activeGoals = computed(() => view.value.filter((g) => g.estado !== 'archived'));
const archivedGoals = computed(() => view.value.filter((g) => g.estado === 'archived'));

async function unarchive(g) {
  try { await api.post(`/goals/${g.id}/unarchive`); toast.add({ severity: 'success', summary: 'Reativado', life: 2000 }); await load(true); } catch (e) { /* */ }
}

function addGoal() { editingGoal.value = null; goalForm.value = { name: '', target_amount: null, target_date: '' }; goalDlg.value = true; }
function editGoal(g) { editingGoal.value = g; goalForm.value = { name: g.nome, target_amount: Number(g.valor_objetivo), target_date: g.data_objetivo ? String(g.data_objetivo).slice(0, 10) : '' }; goalDlg.value = true; }

async function saveGoal() {
  if (!goalForm.value.name.trim() || !goalForm.value.target_amount) { toast.add({ severity: 'warn', summary: 'Faltam dados', life: 2500 }); return; }
  busy.value = true;
  const payload = { name: goalForm.value.name.trim(), target_amount: goalForm.value.target_amount, target_date: goalForm.value.target_date || null };
  try {
    if (editingGoal.value) await api.put(`/goals/${editingGoal.value.id}`, payload);
    else await api.post('/goals', payload);
    toast.add({ severity: 'success', summary: 'Guardado', life: 2000 });
    goalDlg.value = false; await load(true);
  } catch (e) { /* */ } finally { busy.value = false; }
}

function removeGoal(g) {
  confirm.require({
    message: `Eliminar o objetivo "${g.nome}"?`, header: 'Confirmar', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptClass: 'p-button-danger',
    accept: async () => { try { await api.delete(`/goals/${g.id}`); toast.add({ severity: 'success', summary: 'Eliminado', life: 2000 }); await load(true); } catch (e) { /* */ } },
  });
}

function openAllocate(g) {
  allocForm.value = { goal_id: g.id, amount: null, date: todayIso(), note: '' };
  allocDlg.value = true;
}
async function saveAllocation() {
  if (!allocForm.value.amount || !allocForm.value.date) { toast.add({ severity: 'warn', summary: 'Faltam dados', life: 2500 }); return; }
  busy.value = true;
  try {
    await api.post(`/goals/${allocForm.value.goal_id}/allocate`, { amount: allocForm.value.amount, date: allocForm.value.date, note: allocForm.value.note || null });
    toast.add({ severity: 'success', summary: 'Alocado', life: 2000 });
    allocDlg.value = false; await load(true);
  } catch (e) { /* */ } finally { busy.value = false; }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Objetivos</h1><p class="sub">Disponível para alocar: <strong>{{ fmtEurCents(available) }}</strong></p></div>
      <button class="btn btn-primary btn-sm" @click="addGoal"><i class="pi pi-plus" /> Novo</button>
    </div>

    <div v-if="loading" class="loading"><ProgressSpinner style="width:40px;height:40px" strokeWidth="4" /></div>
    <div v-else-if="!activeGoals.length && !archivedGoals.length" class="surface card empty"><i class="pi pi-flag" />Ainda não tens objetivos.</div>
    <div v-else-if="activeGoals.length" class="goals-grid">
      <section v-for="g in activeGoals" :key="g.id" class="surface card goal" :class="{ done: g.percent >= 100 }">
        <div class="goal-head">
          <div><h2>{{ g.nome }}</h2><span v-if="g.data_objetivo" class="muted tiny">até {{ fmtDate(g.data_objetivo) }}</span></div>
          <div class="goal-acts">
            <button class="icon-btn" @click="editGoal(g)"><i class="pi pi-pencil" /></button>
            <button class="icon-btn danger" @click="removeGoal(g)"><i class="pi pi-trash" /></button>
          </div>
        </div>
        <div class="goal-amount">{{ fmtEurCents(g.allocated) }} <span class="muted">/ {{ fmtEurCents(g.target) }}</span></div>
        <div class="bar-track"><span class="bar-fill" :class="{ success: g.percent >= 100 }" :style="{ width: g.percent + '%' }" /></div>
        <div class="goal-foot">
          <span class="chip" :class="g.percent >= 100 ? 'success' : ''">{{ g.percent }}%</span>
          <div class="goal-btns">
            <button class="btn btn-sm" :disabled="available <= 0 || g.percent >= 100" @click="openAllocate(g)"><i class="pi pi-wallet" /> Alocar</button>
            <button v-if="g.allocated > 0" class="btn btn-sm btn-primary" @click="openSpend(g)"><i class="pi pi-shopping-cart" /> Gastar</button>
          </div>
        </div>
      </section>
    </div>

    <section v-if="archivedGoals.length" class="surface card">
      <div class="card-head"><h2>Arquivados</h2><span class="muted tiny">objetivos já gastos</span></div>
      <div class="rows">
        <div v-for="g in archivedGoals" :key="g.id" class="row">
          <div class="row-main"><div class="row-title">{{ g.nome }}</div><div class="row-sub">objetivo de {{ fmtEurCents(g.target) }} · cumprido e gasto</div></div>
          <button class="btn btn-sm" @click="unarchive(g)"><i class="pi pi-replay" /> Reativar</button>
          <button class="icon-btn danger" @click="removeGoal(g)" aria-label="Eliminar"><i class="pi pi-trash" /></button>
        </div>
      </div>
    </section>

    <section v-if="allocations.length" class="surface card">
      <div class="card-head"><h2>Alocações recentes</h2></div>
      <div class="rows">
        <div v-for="a in allocations" :key="a.id" class="row">
          <div class="row-main"><div class="row-title">{{ a.goal_nome }}</div><div class="row-sub">{{ fmtDate(a.data_alocacao) }}<span v-if="a.nota"> · {{ a.nota }}</span></div></div>
          <div class="row-amount" :class="Number(a.valor) < 0 ? 'neg' : 'pos'">{{ Number(a.valor) < 0 ? '−' : '+' }}{{ fmtEurCents(Math.abs(Number(a.valor))) }}</div>
          <button class="icon-btn" @click="editAllocation(a)" aria-label="Editar"><i class="pi pi-pencil" /></button>
          <button class="icon-btn danger" @click="removeAllocation(a)" aria-label="Eliminar"><i class="pi pi-trash" /></button>
        </div>
      </div>
    </section>

    <button class="fab" @click="addGoal"><i class="pi pi-plus" /></button>

    <Dialog v-model:visible="goalDlg" modal :header="editingGoal ? 'Editar objetivo' : 'Novo objetivo'" :style="{ width: '420px', maxWidth: '94vw' }" dismissableMask>
      <form class="stack" @submit.prevent="saveGoal">
        <label class="field"><span>Nome</span><input v-model="goalForm.name" type="text" required /></label>
        <label class="field"><span>Valor objetivo (€)</span><input v-model.number="goalForm.target_amount" type="number" step="0.01" min="0" inputmode="decimal" required /></label>
        <label class="field"><span>Data alvo (opcional)</span><input v-model="goalForm.target_date" type="date" /></label>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="goalDlg = false">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="busy"><i v-if="busy" class="pi pi-spin pi-spinner" /> Guardar</button>
        </div>
      </form>
    </Dialog>

    <Dialog v-model:visible="allocEditDlg" modal header="Editar alocação" :style="{ width: '420px', maxWidth: '94vw' }" dismissableMask>
      <form class="stack" @submit.prevent="saveAllocEdit">
        <label class="field"><span>Valor (€)</span><input v-model.number="allocEditForm.amount" type="number" step="0.01" inputmode="decimal" required /></label>
        <label class="field"><span>Data</span><input v-model="allocEditForm.date" type="date" required /></label>
        <label class="field"><span>Nota (opcional)</span><input v-model="allocEditForm.note" type="text" /></label>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="allocEditDlg = false">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="busy"><i v-if="busy" class="pi pi-spin pi-spinner" /> Guardar</button>
        </div>
      </form>
    </Dialog>

    <Dialog v-model:visible="spendDlg" modal :header="`Gastar de: ${spendForm.goal_nome}`" :style="{ width: '440px', maxWidth: '94vw' }" dismissableMask>
      <form class="stack" @submit.prevent="saveSpend">
        <label class="field"><span>Valor a gastar (€)</span>
          <input v-model.number="spendForm.amount" type="number" step="0.01" min="0.01" inputmode="decimal" required />
          <small class="muted">Reservado neste objetivo: {{ fmtEurCents(spendForm.reserved) }}</small>
        </label>
        <label class="field"><span>Data</span><input v-model="spendForm.date" type="date" required /></label>
        <label class="field"><span>Descrição</span><input v-model="spendForm.description" type="text" /></label>
        <label class="field"><span>Categoria</span>
          <select v-model="spendForm.category_id"><option value="">Sem categoria</option><option v-for="c in expenseCats" :key="c.id" :value="c.id">{{ c.nome }}</option></select>
        </label>
        <label v-if="accounts.length" class="field"><span>Conta / carteira</span>
          <select v-model="spendForm.account_id"><option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.nome }}</option></select>
        </label>
        <p class="muted tiny" style="margin:0"><i class="pi pi-info-circle" style="color:var(--brand)" /> Cria uma despesa real e liberta a reserva deste objetivo (não desconta duas vezes).</p>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="spendDlg = false">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="busy"><i v-if="busy" class="pi pi-spin pi-spinner" /> Gastar</button>
        </div>
      </form>
    </Dialog>

    <Dialog v-model:visible="allocDlg" modal header="Alocar poupança" :style="{ width: '420px', maxWidth: '94vw' }" dismissableMask>
      <form class="stack" @submit.prevent="saveAllocation">
        <label class="field"><span>Valor a alocar (€)</span>
          <input v-model.number="allocForm.amount" type="number" step="0.01" min="0.01" :max="available" inputmode="decimal" required />
          <small class="muted">Disponível: {{ fmtEurCents(available) }}</small>
        </label>
        <label class="field"><span>Data</span><input v-model="allocForm.date" type="date" required /></label>
        <label class="field"><span>Nota (opcional)</span><input v-model="allocForm.note" type="text" /></label>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="allocDlg = false">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="busy"><i v-if="busy" class="pi pi-spin pi-spinner" /> Alocar</button>
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.goals-grid { display: grid; gap: 1.15rem; grid-template-columns: 1fr; }
@media (min-width: 720px) { .goals-grid { grid-template-columns: 1fr 1fr; } }
.goal.done { border-color: var(--success); }
.goal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.7rem; }
.goal-acts { display: flex; gap: 0.1rem; }
.goal-amount { font-family: var(--font-display); font-weight: 700; font-size: 1.25rem; margin-bottom: 0.6rem; }
.goal-amount .muted { font-weight: 500; font-size: 0.9rem; }
.goal-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 0.8rem; gap: 0.5rem; flex-wrap: wrap; }
.goal-btns { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end; flex: 1; }
.goal-btns .btn { flex: 1 1 auto; }
.actions { display: flex; gap: 0.6rem; justify-content: flex-end; }
</style>
