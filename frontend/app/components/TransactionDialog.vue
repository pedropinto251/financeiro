<script setup>
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import { useToast } from 'primevue/usetoast';
import api from '@shared/api';
import { todayIso } from '@shared/format';

const props = defineProps({
  visible: Boolean,
  categories: { type: Array, default: () => [] },
  accounts: { type: Array, default: () => [] },
  transaction: { type: Object, default: null }, // present → edit mode
  initialType: { type: String, default: 'expense' },
});
const emit = defineEmits(['update:visible', 'saved']);
const toast = useToast();

const defaultAccountId = () => {
  const d = props.accounts.find((a) => a.is_default) || props.accounts[0];
  return d ? d.id : '';
};
const form = ref({ type: 'expense', amount: null, date: todayIso(), description: '', category_id: '', account_id: '' });
const file = ref(null);
const busy = ref(false);
const isEdit = computed(() => !!props.transaction?.id);

watch(() => props.visible, (open) => {
  if (!open) return;
  file.value = null;
  if (props.transaction) {
    const t = props.transaction;
    form.value = {
      type: t.tipo || t.type || 'expense',
      amount: Number(t.valor ?? t.amount ?? 0),
      date: String(t.data_ocorrencia || t.date || todayIso()).slice(0, 10),
      description: t.descricao || t.description || '',
      category_id: t.categoria_id || t.category_id || '',
      account_id: t.account_id || defaultAccountId(),
    };
  } else {
    form.value = { type: props.initialType, amount: null, date: todayIso(), description: '', category_id: '', account_id: defaultAccountId() };
  }
});

const filteredCats = computed(() =>
  props.categories.filter((c) => (c.tipo || c.type) === form.value.type)
);

function close() { emit('update:visible', false); }

async function save() {
  if (!form.value.amount || !form.value.date) {
    toast.add({ severity: 'warn', summary: 'Faltam dados', detail: 'Indica valor e data.', life: 3000 });
    return;
  }
  busy.value = true;
  try {
    const payload = {
      type: form.value.type,
      amount: form.value.amount,
      date: form.value.date,
      description: form.value.description || null,
      category_id: form.value.category_id || null,
      account_id: form.value.account_id || null,
    };
    let id;
    if (isEdit.value) {
      await api.put(`/transactions/${props.transaction.id}`, payload);
      id = props.transaction.id;
    } else {
      // client_uid: chave de idempotência — evita duplicar se a sync reenviar.
      payload.client_uid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      // offlineQueue: se não houver rede, fica guardado e sincroniza depois.
      const res = await api.post('/transactions', payload, { offlineQueue: true });
      if (res && res.queued) {
        toast.add({ severity: 'info', summary: 'Guardado offline', detail: 'Sincroniza assim que houver rede.', life: 3800 });
        emit('saved');
        close();
        busy.value = false;
        return;
      }
      id = res.id;
    }
    if (file.value && id) {
      const fd = new FormData();
      fd.append('documento', file.value);
      // Let axios/browser set Content-Type with the multipart boundary.
      await api.post(`/transactions/${id}/document`, fd);
    }
    toast.add({ severity: 'success', summary: isEdit.value ? 'Atualizado' : 'Registado', life: 2500 });
    emit('saved');
    close();
  } catch (e) { /* global toast */ } finally { busy.value = false; }
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="emit('update:visible', $event)" modal
          :header="isEdit ? 'Editar movimento' : 'Novo movimento'" :style="{ width: '440px', maxWidth: '94vw' }" dismissableMask>
    <form class="stack" @submit.prevent="save">
      <div class="seg">
        <button type="button" class="seg-btn" :class="{ on: form.type === 'expense', expense: form.type === 'expense' }" @click="form.type = 'expense'">
          <i class="pi pi-arrow-down-right" /> Despesa
        </button>
        <button type="button" class="seg-btn" :class="{ on: form.type === 'income', income: form.type === 'income' }" @click="form.type = 'income'">
          <i class="pi pi-arrow-up-right" /> Receita
        </button>
      </div>
      <label class="field"><span>Valor (€)</span>
        <input v-model.number="form.amount" type="number" step="0.01" min="0" inputmode="decimal" required />
      </label>
      <label class="field"><span>Data</span>
        <input v-model="form.date" type="date" required />
      </label>
      <label class="field"><span>Descrição</span>
        <input v-model="form.description" type="text" placeholder="Opcional" />
      </label>
      <label class="field"><span>Categoria</span>
        <select v-model="form.category_id">
          <option value="">Sem categoria</option>
          <option v-for="c in filteredCats" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
      </label>
      <label v-if="accounts.length" class="field"><span>Conta / carteira</span>
        <select v-model="form.account_id">
          <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.nome }}</option>
        </select>
      </label>
      <label class="field"><span>Documento</span>
        <input type="file" @change="file = $event.target.files[0]" />
      </label>
      <div class="actions">
        <button type="button" class="btn btn-ghost" @click="close">Cancelar</button>
        <button type="submit" class="btn btn-primary" :disabled="busy">
          <i v-if="busy" class="pi pi-spin pi-spinner" /> Guardar
        </button>
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
.seg { display: flex; gap: 0.5rem; }
.seg-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;
  padding: 0.7rem; border-radius: 12px; border: 1px solid var(--line-2); background: var(--bg-2);
  color: var(--ink-2); font-weight: 600; font-family: inherit; cursor: pointer; min-height: 46px;
  transition: all var(--t-base) var(--ease);
}
.seg-btn.on.expense { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
.seg-btn.on.income { background: var(--success-soft); border-color: var(--success); color: var(--success); }
.actions { display: flex; gap: 0.6rem; justify-content: flex-end; margin-top: 0.4rem; }
</style>
