<script setup>
import { ref, onMounted, computed } from 'vue';
import Dialog from 'primevue/dialog';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import ProgressSpinner from 'primevue/progressspinner';
import api from '@shared/api';
import { fmtEurCents, fmtDateShort } from '@shared/format';

const confirm = useConfirm();
const toast = useToast();
const list = ref([]);
const categories = ref([]);
const cycle = ref(null);
const loading = ref(true);
const dlg = ref(false);
const editing = ref(null);
const busy = ref(false);
const form = ref({ category_id: '', amount: null });

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    const [b, c] = await Promise.all([
      api.get('/budgets'),
      api.get('/categories').then((r) => r.categories || r),
    ]);
    list.value = (b.budgets || b).map((x) => {
      const limit = Number(x.valor || 0);
      const spent = Number(x.spent || 0);
      const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      return { ...x, limit, spent, percent, remaining: limit - spent };
    }).sort((a, z) => z.percent - a.percent);
    cycle.value = b.cycle || null;
    categories.value = c;
  } catch (e) { /* */ } finally { loading.value = false; }
}
onMounted(load);

// Categorias de despesa ainda sem budget (em edição, inclui a atual).
const availableCats = computed(() => {
  const used = new Set(list.value.map((b) => Number(b.categoria_id)));
  return categories.value.filter((c) => c.tipo === 'expense' && (!used.has(Number(c.id)) || (editing.value && Number(editing.value.categoria_id) === Number(c.id))));
});

const totalLimit = computed(() => list.value.reduce((a, b) => a + b.limit, 0));
const totalSpent = computed(() => list.value.reduce((a, b) => a + b.spent, 0));

function barClass(p) { return p >= 100 ? 'danger' : p >= 80 ? 'warn' : ''; }

function add() { editing.value = null; form.value = { category_id: '', amount: null }; dlg.value = true; }
function edit(b) { editing.value = b; form.value = { category_id: b.categoria_id, amount: b.limit }; dlg.value = true; }

async function save() {
  if (!form.value.category_id || !form.value.amount) { toast.add({ severity: 'warn', summary: 'Faltam dados', life: 2500 }); return; }
  busy.value = true;
  const payload = { category_id: form.value.category_id, amount: form.value.amount };
  try {
    if (editing.value) await api.put(`/budgets/${editing.value.id}`, payload);
    else await api.post('/budgets', payload);
    toast.add({ severity: 'success', summary: 'Guardado', life: 2000 });
    dlg.value = false; await load(true);
  } catch (e) { /* */ } finally { busy.value = false; }
}

function remove(b) {
  confirm.require({
    message: `Eliminar o budget de "${b.categoria_nome}"?`, header: 'Confirmar', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptClass: 'p-button-danger',
    accept: async () => { try { await api.delete(`/budgets/${b.id}`); toast.add({ severity: 'success', summary: 'Eliminado', life: 2000 }); await load(true); } catch (e) { /* */ } },
  });
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Budgets</h1><p class="sub">Limite mensal por categoria{{ cycle ? ` · ciclo ${fmtDateShort(cycle.start)}–${fmtDateShort(cycle.end)}` : '' }}</p></div>
      <button class="btn btn-primary btn-sm" @click="add"><i class="pi pi-plus" /> Novo</button>
    </div>

    <div v-if="loading" class="loading"><ProgressSpinner style="width:40px;height:40px" strokeWidth="4" /></div>
    <div v-else-if="!list.length" class="surface card empty">
      <i class="pi pi-bullseye" />Ainda não tens budgets. Define um limite mensal por categoria que se renova todos os ciclos.
    </div>

    <template v-else>
      <section class="surface card totals">
        <div class="t"><span class="t-l">Gasto este ciclo</span><span class="t-v">{{ fmtEurCents(totalSpent) }}</span></div>
        <div class="t"><span class="t-l">Limite total</span><span class="t-v">{{ fmtEurCents(totalLimit) }}</span></div>
        <div class="t"><span class="t-l">Disponível</span><span class="t-v" :class="(totalLimit - totalSpent) >= 0 ? 'pos' : 'neg'">{{ fmtEurCents(totalLimit - totalSpent) }}</span></div>
      </section>

      <section class="surface card">
        <div class="rows">
          <div v-for="b in list" :key="b.id" class="brow">
            <div class="brow-head">
              <span class="bname">{{ b.categoria_nome }}</span>
              <div class="bacts">
                <button class="icon-btn" @click="edit(b)"><i class="pi pi-pencil" /></button>
                <button class="icon-btn danger" @click="remove(b)"><i class="pi pi-trash" /></button>
              </div>
            </div>
            <div class="bamount">
              <span :class="b.percent >= 100 ? 'neg' : ''">{{ fmtEurCents(b.spent) }}</span>
              <span class="muted"> / {{ fmtEurCents(b.limit) }}</span>
            </div>
            <div class="bar-track"><span class="bar-fill" :class="barClass(b.percent)" :style="{ width: Math.min(100, b.percent) + '%' }" /></div>
            <div class="brow-foot">
              <span class="chip" :class="b.percent >= 100 ? 'danger' : b.percent >= 80 ? '' : 'neutral'">{{ b.percent }}%</span>
              <span class="muted tiny" :class="{ neg: b.remaining < 0 }">
                {{ b.remaining >= 0 ? `Disponível ${fmtEurCents(b.remaining)}` : `Excedido em ${fmtEurCents(-b.remaining)}` }}
              </span>
            </div>
          </div>
        </div>
      </section>
    </template>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Editar budget' : 'Novo budget'" :style="{ width: '420px', maxWidth: '94vw' }" dismissableMask>
      <form class="stack" @submit.prevent="save">
        <label class="field"><span>Categoria</span>
          <select v-model="form.category_id" required>
            <option value="">Escolhe uma categoria</option>
            <option v-for="c in availableCats" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>
        <label class="field"><span>Limite mensal (€)</span>
          <input v-model.number="form.amount" type="number" step="0.01" min="0" inputmode="decimal" required />
          <small class="muted">Este valor fica disponível em cada ciclo, automaticamente.</small>
        </label>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="dlg = false">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="busy"><i v-if="busy" class="pi pi-spin pi-spinner" /> Guardar</button>
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; padding: 0.9rem 1rem; }
.t { display: flex; flex-direction: column; gap: 0.2rem; align-items: center; text-align: center; }
.t-l { font-size: 0.72rem; color: var(--ink-3); font-weight: 600; }
.t-v { font-family: var(--font-display); font-weight: 700; font-size: 1rem; }
.pos { color: var(--success); } .neg { color: var(--danger); }
.brow { padding: 0.85rem 0.2rem; border-bottom: 1px solid var(--line); }
.brow:last-child { border-bottom: none; }
.brow-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.4rem; }
.bname { font-weight: 600; font-size: 0.95rem; }
.bacts { display: flex; gap: 0.1rem; }
.bamount { font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; margin-bottom: 0.45rem; }
.bamount .muted { font-weight: 500; font-size: 0.85rem; }
.bar-fill.warn { background: linear-gradient(120deg, #fbbf24, #f59e0b); }
.brow-foot { display: flex; align-items: center; gap: 0.7rem; margin-top: 0.5rem; }
.actions { display: flex; gap: 0.6rem; justify-content: flex-end; }
</style>
