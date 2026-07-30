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
const list = ref([]);
const categories = ref([]);
const accounts = ref([]);
const today = ref(todayIso());
const loading = ref(true);
const running = ref(false);
const dlg = ref(false);
const editing = ref(null);
const busy = ref(false);

const defaultAccountId = () => { const d = accounts.value.find((a) => a.is_default) || accounts.value[0]; return d ? d.id : ''; };
const blank = () => ({ tipo: 'expense', amount: null, description: '', category_id: '', frequencia: 'mensal', intervalo: 15, dia: 1, start_date: todayIso(), ativo: true, account_id: defaultAccountId() });
const form = ref(blank());

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    const [r, c, a] = await Promise.all([
      api.get('/recurring'),
      api.get('/categories').then((x) => x.categories || x),
      api.get('/accounts').then((x) => x.accounts || []),
    ]);
    list.value = r.items || [];
    today.value = r.today || todayIso();
    categories.value = c;
    accounts.value = a;
  } catch (e) { /* */ } finally { loading.value = false; }
}
onMounted(load);

const pending = computed(() => list.value.filter((r) => r.ativo && String(r.proxima_data).slice(0, 10) <= today.value).length);
const filteredCats = computed(() => categories.value.filter((c) => (c.tipo) === form.value.tipo));

function freqLabel(r) {
  if (r.frequencia === 'dias') return `a cada ${r.intervalo} dias`;
  if (Number(r.dia) === 100) return 'último dia do mês';
  if (Number(r.dia) === 99) return 'último dia útil';
  return `todo dia ${r.dia}`;
}
function isDue(r) { return r.ativo && String(r.proxima_data).slice(0, 10) <= today.value; }

async function launchNow(r) {
  confirm.require({
    message: `Lançar já "${r.descricao || r.categoria_nome || 'esta fixa'}" (${r.tipo === 'income' ? '+' : '−'}${fmtEurCents(r.valor)}) com data de hoje?`,
    header: 'Lançar agora', icon: 'pi pi-bolt', acceptLabel: 'Lançar', rejectLabel: 'Cancelar',
    accept: async () => {
      try {
        await api.post(`/recurring/${r.id}/launch`);
        toast.add({ severity: 'success', summary: 'Lançado', detail: 'Movimento criado com data de hoje.', life: 3000 });
        await load(true);
        window.dispatchEvent(new CustomEvent('financeiro:tx-changed'));
      } catch (e) { /* */ }
    },
  });
}

function add() { editing.value = null; form.value = blank(); dlg.value = true; }
function edit(r) {
  editing.value = r;
  form.value = {
    tipo: r.tipo, amount: Number(r.valor), description: r.descricao || '', category_id: r.categoria_id || '',
    frequencia: r.frequencia, intervalo: r.intervalo, dia: r.dia,
    start_date: String(r.proxima_data).slice(0, 10), ativo: !!r.ativo,
    account_id: r.account_id || defaultAccountId(),
  };
  dlg.value = true;
}

async function save() {
  if (!form.value.amount) { toast.add({ severity: 'warn', summary: 'Indica o valor', life: 2500 }); return; }
  busy.value = true;
  const payload = {
    tipo: form.value.tipo, amount: form.value.amount, description: form.value.description || null,
    category_id: form.value.category_id || null, frequencia: form.value.frequencia,
    intervalo: form.value.intervalo, dia: form.value.dia, start_date: form.value.start_date, ativo: form.value.ativo,
    account_id: form.value.account_id || null,
  };
  try {
    if (editing.value) await api.put(`/recurring/${editing.value.id}`, payload);
    else await api.post('/recurring', payload);
    toast.add({ severity: 'success', summary: 'Guardado', life: 2000 });
    dlg.value = false; await load(true);
  } catch (e) { /* */ } finally { busy.value = false; }
}

function remove(r) {
  confirm.require({
    message: `Eliminar a fixa "${r.descricao || r.categoria_nome || 'sem nome'}"?`, header: 'Confirmar', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptClass: 'p-button-danger',
    accept: async () => { try { await api.delete(`/recurring/${r.id}`); toast.add({ severity: 'success', summary: 'Eliminado', life: 2000 }); await load(true); } catch (e) { /* */ } },
  });
}

async function run() {
  running.value = true;
  try {
    const res = await api.post('/recurring/run');
    const n = res.created || 0;
    toast.add({ severity: 'success', summary: n ? `${n} lançamento(s) criados` : 'Nada pendente', life: 3000 });
    await load(true);
    window.dispatchEvent(new CustomEvent('financeiro:tx-changed'));
  } catch (e) { /* */ } finally { running.value = false; }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Fixas</h1><p class="sub">Movimentos recorrentes (renda, salário, ginásio…)</p></div>
      <button class="btn btn-primary btn-sm" @click="add"><i class="pi pi-plus" /> Nova</button>
    </div>

    <section v-if="pending > 0" class="surface card prompt">
      <span class="prompt-ic"><i class="pi pi-clock" /></span>
      <span class="prompt-txt"><strong>{{ pending }} fixa(s) por lançar</strong><span class="muted tiny">Cria os movimentos em atraso até hoje</span></span>
      <button class="btn btn-primary btn-sm" :disabled="running" @click="run"><i v-if="running" class="pi pi-spin pi-spinner" /> Lançar</button>
    </section>

    <div v-if="loading" class="loading"><ProgressSpinner style="width:40px;height:40px" strokeWidth="4" /></div>
    <div v-else-if="!list.length" class="surface card empty"><i class="pi pi-sync" />Sem fixas. Cria a renda, salário ou o ginásio de 15 em 15 dias.</div>

    <section v-else class="surface card">
      <div class="rows">
        <div v-for="r in list" :key="r.id" class="rrow" :class="{ off: !r.ativo }">
          <div class="r-icon" :class="r.tipo"><i :class="r.tipo === 'income' ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-right'" /></div>
          <div class="r-main">
            <div class="r-title">{{ r.descricao || r.categoria_nome || (r.tipo === 'income' ? 'Receita' : 'Despesa') }}</div>
            <div class="r-sub">
              {{ freqLabel(r) }} · próx. {{ fmtDate(r.proxima_data) }}
              <span v-if="isDue(r)" class="chip danger due">pendente</span>
              <span v-if="!r.ativo" class="chip neutral">inativa</span>
            </div>
          </div>
          <div class="r-amount" :class="r.tipo === 'income' ? 'pos' : 'neg'">{{ r.tipo === 'income' ? '+' : '−' }}{{ fmtEurCents(r.valor) }}</div>
          <button class="icon-btn launch" :disabled="!r.ativo" @click="launchNow(r)" aria-label="Lançar agora" title="Lançar agora"><i class="pi pi-bolt" /></button>
          <button class="icon-btn" @click="edit(r)" aria-label="Editar"><i class="pi pi-pencil" /></button>
          <button class="icon-btn danger" @click="remove(r)" aria-label="Eliminar"><i class="pi pi-trash" /></button>
        </div>
      </div>
    </section>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Editar fixa' : 'Nova fixa'" :style="{ width: '440px', maxWidth: '94vw' }" dismissableMask>
      <form class="stack" @submit.prevent="save">
        <div class="seg">
          <button type="button" class="seg-btn" :class="{ on: form.tipo === 'expense', expense: form.tipo === 'expense' }" @click="form.tipo = 'expense'; form.category_id = ''">Despesa</button>
          <button type="button" class="seg-btn" :class="{ on: form.tipo === 'income', income: form.tipo === 'income' }" @click="form.tipo = 'income'; form.category_id = ''">Receita</button>
        </div>
        <label class="field"><span>Valor (€)</span><input v-model.number="form.amount" type="number" step="0.01" min="0" inputmode="decimal" required /></label>
        <label class="field"><span>Descrição</span><input v-model="form.description" type="text" placeholder="ex.: Ginásio" /></label>
        <label class="field"><span>Categoria</span>
          <select v-model="form.category_id"><option value="">Sem categoria</option><option v-for="c in filteredCats" :key="c.id" :value="c.id">{{ c.nome }}</option></select>
        </label>
        <label v-if="accounts.length" class="field"><span>Conta / carteira</span>
          <select v-model="form.account_id"><option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.nome }}</option></select>
        </label>
        <label class="field"><span>Frequência</span>
          <div class="seg">
            <button type="button" class="seg-btn" :class="{ on: form.frequencia === 'mensal' }" @click="form.frequencia = 'mensal'">Mensal</button>
            <button type="button" class="seg-btn" :class="{ on: form.frequencia === 'dias' }" @click="form.frequencia = 'dias'">A cada N dias</button>
          </div>
        </label>
        <label v-if="form.frequencia === 'mensal'" class="field"><span>Dia do mês</span>
          <select v-model.number="form.dia">
            <option v-for="d in 31" :key="d" :value="d">Dia {{ d }}</option>
            <option :value="100">Último dia do mês</option>
            <option :value="99">Último dia útil (evita fim de semana)</option>
          </select>
          <small v-if="form.dia === 99 || form.dia === 100" class="hint-sm">Ideal para o salário — cai sempre no fim do mês, mesmo em meses curtos.</small>
        </label>
        <template v-else>
          <label class="field"><span>A cada quantos dias</span><input v-model.number="form.intervalo" type="number" min="1" max="365" inputmode="numeric" /></label>
          <label class="field"><span>Primeiro lançamento</span><input v-model="form.start_date" type="date" /></label>
        </template>
        <label class="check"><input type="checkbox" v-model="form.ativo" /><span>Ativa</span></label>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="dlg = false">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="busy"><i v-if="busy" class="pi pi-spin pi-spinner" /> Guardar</button>
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.prompt { display: flex; align-items: center; gap: 0.85rem; padding: 0.9rem 1.1rem; }
.prompt-ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex: none; background: var(--warning-soft); color: var(--warning); font-size: 1.05rem; }
.prompt-txt { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.rrow { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0.2rem; border-bottom: 1px solid var(--line); }
.rrow:last-child { border-bottom: none; }
.rrow.off { opacity: 0.55; }
.r-icon { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; flex: none; font-size: 0.85rem; }
.r-icon.income { background: var(--success-soft); color: var(--success); }
.r-icon.expense { background: var(--danger-soft); color: var(--danger); }
.r-main { flex: 1; min-width: 0; }
.r-title { font-weight: 600; font-size: 0.94rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-sub { font-size: 0.78rem; color: var(--ink-3); margin-top: 0.15rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.r-amount { font-family: var(--font-display); font-weight: 700; font-size: 1rem; white-space: nowrap; }
.pos { color: var(--success); } .neg { color: var(--danger); }
.due { padding: 0.05rem 0.45rem; }
.seg { display: flex; gap: 0.5rem; }
.seg-btn { flex: 1; padding: 0.6rem; border-radius: 11px; border: 1px solid var(--line-2); background: var(--bg-2); color: var(--ink-2); font-weight: 600; font-family: inherit; cursor: pointer; min-height: 42px; font-size: 0.86rem; }
.seg-btn.on { background: var(--brand-soft); border-color: var(--brand); color: var(--brand); }
.seg-btn.on.expense { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
.seg-btn.on.income { background: var(--success-soft); border-color: var(--success); color: var(--success); }
.icon-btn.launch { color: var(--brand); }
.icon-btn.launch:disabled { opacity: 0.35; cursor: default; }
.hint-sm { color: var(--ink-3); font-size: 0.76rem; margin-top: 0.25rem; }
.check { display: flex; align-items: center; gap: 0.6rem; font-size: 0.9rem; color: var(--ink-2); cursor: pointer; }
.check input { width: auto; min-height: 0; }
.actions { display: flex; gap: 0.6rem; justify-content: flex-end; }
</style>
