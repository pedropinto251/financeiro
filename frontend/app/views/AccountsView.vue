<script setup>
import { ref, onMounted, computed } from 'vue';
import Dialog from 'primevue/dialog';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import ProgressSpinner from 'primevue/progressspinner';
import api from '@shared/api';
import { fmtEurCents } from '@shared/format';

const confirm = useConfirm();
const toast = useToast();
const list = ref([]);
const loading = ref(true);
const dlg = ref(false);
const editing = ref(null);
const busy = ref(false);
const COLORS = ['#10b981', '#5b8cff', '#f59e0b', '#fb7185', '#a78bfa', '#22d3ee', '#34d399', '#f97316'];
const form = ref({ nome: '', cor: COLORS[0], include_in_total: true });

async function load(silent = false) {
  if (!silent) loading.value = true;
  try { list.value = (await api.get('/accounts')).accounts || []; }
  catch (e) { /* */ } finally { loading.value = false; }
}
onMounted(load);

const total = computed(() => list.value.reduce((a, x) => a + Number(x.saldo || 0), 0));

function add() { editing.value = null; form.value = { nome: '', cor: COLORS[0], include_in_total: true }; dlg.value = true; }
function edit(a) { editing.value = a; form.value = { nome: a.nome, cor: a.cor || COLORS[0], include_in_total: a.include_in_total !== 0 }; dlg.value = true; }

async function save() {
  if (!form.value.nome.trim()) return;
  busy.value = true;
  const payload = { nome: form.value.nome.trim(), cor: form.value.cor, icone: 'wallet', include_in_total: form.value.include_in_total };
  try {
    if (editing.value) await api.put(`/accounts/${editing.value.id}`, payload);
    else await api.post('/accounts', payload);
    toast.add({ severity: 'success', summary: 'Guardado', life: 2000 });
    dlg.value = false; await load(true);
  } catch (e) { /* */ } finally { busy.value = false; }
}

function remove(a) {
  if (a.is_default) { toast.add({ severity: 'warn', summary: 'Conta principal não pode ser eliminada', life: 3000 }); return; }
  confirm.require({
    message: `Eliminar "${a.nome}"? Os movimentos passam para a conta principal.`, header: 'Confirmar', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptClass: 'p-button-danger',
    accept: async () => { try { await api.delete(`/accounts/${a.id}`); toast.add({ severity: 'success', summary: 'Eliminado', life: 2000 }); await load(true); } catch (e) { /* */ } },
  });
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Contas</h1><p class="sub">Carteiras e saldos (ex.: cartão de alimentação)</p></div>
      <button class="btn btn-primary btn-sm" @click="add"><i class="pi pi-plus" /> Nova</button>
    </div>

    <div v-if="loading" class="loading"><ProgressSpinner style="width:40px;height:40px" strokeWidth="4" /></div>
    <template v-else>
      <section class="surface card total">
        <span class="t-l">Saldo total (todas as contas)</span>
        <span class="t-v" :class="total < 0 ? 'neg' : ''">{{ fmtEurCents(total) }}</span>
      </section>

      <section class="surface card">
        <div class="rows">
          <div v-for="a in list" :key="a.id" class="arow">
            <span class="a-ic" :style="{ background: (a.cor || '#5b8cff') + '22', color: a.cor || '#5b8cff' }"><i class="pi pi-wallet" /></span>
            <div class="a-main">
              <div class="a-name">{{ a.nome }} <span v-if="a.is_default" class="chip neutral def">principal</span><span v-if="a.include_in_total === 0" class="chip neutral def">separada</span></div>
              <div class="a-sub" :class="Number(a.saldo) < 0 ? 'neg' : 'pos'">{{ fmtEurCents(a.saldo) }}</div>
            </div>
            <button class="icon-btn" @click="edit(a)"><i class="pi pi-pencil" /></button>
            <button class="icon-btn danger" :disabled="a.is_default" @click="remove(a)"><i class="pi pi-trash" /></button>
          </div>
        </div>
      </section>

      <p class="muted tiny hint"><i class="pi pi-info-circle" /> Dica: regista o carregamento do cartão como uma <strong>receita</strong> nessa conta (ou cria uma <strong>fixa</strong>). As despesas pagas com o cartão descontam só desse saldo.</p>
    </template>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Editar conta' : 'Nova conta'" :style="{ width: '400px', maxWidth: '94vw' }" dismissableMask>
      <form class="stack" @submit.prevent="save">
        <label class="field"><span>Nome</span><input v-model="form.nome" type="text" placeholder="ex.: Cartão alimentação" required /></label>
        <div class="field"><span>Cor</span>
          <div class="colors">
            <button v-for="c in COLORS" :key="c" type="button" class="swatch" :class="{ on: form.cor === c }" :style="{ background: c }" @click="form.cor = c" />
          </div>
        </div>
        <label v-if="editing" class="check"><input type="checkbox" v-model="form.include_in_total" /><span>Somar ao saldo total (desliga para cartão refeição / contas restritas)</span></label>
        <p v-else class="muted tiny" style="margin:0">Cartões de alimentação/refeição ficam fora do saldo total automaticamente.</p>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="dlg = false">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="busy"><i v-if="busy" class="pi pi-spin pi-spinner" /> Guardar</button>
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.total { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.1rem; }
.t-l { font-size: 0.8rem; color: var(--ink-3); font-weight: 600; }
.t-v { font-family: var(--font-display); font-weight: 700; font-size: 1.3rem; }
.t-v.neg { color: var(--danger); }
.arow { display: flex; align-items: center; gap: 0.8rem; padding: 0.7rem 0.2rem; border-bottom: 1px solid var(--line); }
.arow:last-child { border-bottom: none; }
.a-ic { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; flex: none; font-size: 1rem; }
.a-main { flex: 1; min-width: 0; }
.a-name { font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 0.4rem; }
.def { padding: 0.05rem 0.45rem; font-size: 0.66rem; }
.a-sub { font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; margin-top: 0.15rem; }
.pos { color: var(--success); } .neg { color: var(--danger); }
.colors { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.swatch { width: 34px; height: 34px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.swatch.on { border-color: var(--ink); box-shadow: 0 0 0 2px var(--bg); }
.check { display: flex; align-items: center; gap: 0.6rem; font-size: 0.88rem; color: var(--ink-2); cursor: pointer; line-height: 1.4; }
.check input { width: auto; min-height: 0; flex: none; }
.actions { display: flex; gap: 0.6rem; justify-content: flex-end; }
.hint { display: flex; align-items: flex-start; gap: 0.4rem; line-height: 1.5; padding: 0 0.2rem; }
.hint i { margin-top: 2px; color: var(--brand); }
</style>
