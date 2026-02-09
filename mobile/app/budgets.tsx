import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuth } from './_layout';
import {
  apiCreateBudget,
  apiDeleteBudget,
  apiGetBudgets,
  apiGetCategories,
  apiUpdateBudget,
  Budget,
  Category,
} from '@/lib/api';
import AppShell from '@/components/AppShell';
import { useTheme, radius, shadow } from '@/styles/theme';

export default function BudgetsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [month, setMonth] = useState('');
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState<Budget | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionBudget, setActionBudget] = useState<Budget | null>(null);
  const [picker, setPicker] = useState<{ visible: boolean; value: Date }>({ visible: false, value: new Date() });
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.nome.toLowerCase().includes(q));
  }, [search, categories]);

  const load = async () => {
    if (!token) return;
    const [b, c] = await Promise.all([apiGetBudgets(token), apiGetCategories(token)]);
    setBudgets(b);
    setCategories(c);
    if (!categoryId && c[0]) setCategoryId(c[0].id);
  };

  useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    setMonth(`${yyyy}-${mm}`);
    load();
  }, [token]);

  const formatMonth = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  };

  const openMonthPicker = (current: string) => {
    const now = current ? new Date(`${current}-01`) : new Date();
    if (Platform.OS === 'android') {
      const { DateTimePickerAndroid } = require('@react-native-community/datetimepicker');
      DateTimePickerAndroid.open({
        value: now,
        mode: 'date',
        onChange: (_: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          setMonth(formatMonth(selectedDate));
        },
      });
      return;
    }
    setPicker({ visible: true, value: now });
  };

  const catName = useMemo(
    () => categories.find((c) => c.id === categoryId)?.nome || 'Categoria',
    [categories, categoryId]
  );

  const parseAmount = (value: string) => {
    const norm = value.replace(',', '.');
    const num = parseFloat(norm);
    return Number.isFinite(num) ? num : NaN;
  };

  const handleSave = async () => {
    if (!token || !categoryId || !month || !amount) {
      Alert.alert('Erro', 'Preenche todos os campos.');
      return;
    }
    const parsed = parseAmount(amount);
    if (!Number.isFinite(parsed)) {
      Alert.alert('Erro', 'Valor inválido.');
      return;
    }
    try {
      if (editing) {
        await apiUpdateBudget(token, editing.id, {
          category_id: categoryId,
          month,
          amount: parsed,
        });
      } else {
        await apiCreateBudget(token, {
          category_id: categoryId,
          month,
          amount: parsed,
        });
      }
      setEditing(null);
      setAmount('');
      await load();
    } catch {
      Alert.alert('Erro', 'Nao foi possivel guardar.');
    }
  };

  const handleEdit = (b: Budget) => {
    setEditing(b);
    setCategoryId(b.categoria_id);
    setMonth(b.mes.slice(0, 7));
    setAmount(String(b.valor));
    setFormOpen(true);
  };

  const handleDelete = (b: Budget) => {
    if (!token) return;
    Alert.alert('Apagar', 'Queres apagar este budget?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          await apiDeleteBudget(token, b.id);
          await load();
        },
      },
    ]);
  };

  return (
    <AppShell title="Budgets">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: 120 }]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
        >
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Budgets</Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.accent }]}
              onPress={() => {
                setEditing(null);
                setAmount('');
                setFormOpen(true);
              }}
            >
              <Text style={[styles.buttonText, { color: colors.bg }]}>Adicionar budget</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Budgets atuais</Text>
            {budgets.map((b) => (
              <View key={b.id} style={[styles.row, { borderBottomColor: colors.border }]}> 
                <Text style={[styles.rowText, { color: colors.text }]}>{b.mes.slice(0, 7)} · {b.categoria_nome}</Text>
                <Text style={[styles.muted, { color: colors.muted }]}>{Number(b.valor).toFixed(2)} €</Text>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={[styles.kebab, { borderColor: colors.border }]} onPress={() => { setActionBudget(b); setActionOpen(true); }}>
                    <Text style={[styles.kebabText, { color: colors.text }]}>⋯</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={formOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>{editing ? 'Editar budget' : 'Novo budget'}</Text>
            <TouchableOpacity
              style={[styles.select, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              onPress={() => {
                setCategoryPickerOpen((s) => !s);
                setSearch('');
              }}
            >
              <Text style={[styles.selectText, { color: colors.text }]}>{catName}</Text>
            </TouchableOpacity>
            {categoryPickerOpen ? (
              <View style={styles.inlinePicker}>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]}
                  placeholder="Pesquisar categoria"
                  placeholderTextColor={colors.muted}
                  value={search}
                  onChangeText={setSearch}
                />
                <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="always">
                  {filteredCategories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.modalItem}
                      onPress={() => {
                        setCategoryId(c.id);
                        setCategoryPickerOpen(false);
                      }}
                    >
                      <Text style={[styles.modalText, { color: colors.text }]}>{c.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <View style={styles.monthRow}>
              <TextInput
                style={[styles.input, styles.monthInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]}
                placeholder="Mes (YYYY-MM)"
                placeholderTextColor={colors.muted}
                value={month}
                onChangeText={setMonth}
              />
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => openMonthPicker(month)}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Selecionar</Text>
              </TouchableOpacity>
            </View>
            {picker.visible && Platform.OS === 'ios' ? (
              <View style={styles.inlinePicker}>
                <DateTimePicker
                  value={picker.value}
                  mode="date"
                  display="spinner"
                  onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                    if (event.type === 'dismissed') {
                      setPicker({ visible: false, value: picker.value });
                      return;
                    }
                    if (selectedDate) {
                      setMonth(formatMonth(selectedDate));
                    }
                  }}
                />
                <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setPicker({ visible: false, value: picker.value })}>
                  <Text style={[styles.secondaryText, { color: colors.text }]}>Fechar</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]}
              placeholder="Valor"
              placeholderTextColor={colors.muted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={async () => { await handleSave(); setFormOpen(false); }}>
              <Text style={[styles.buttonText, { color: colors.bg }]}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setFormOpen(false)}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={actionOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <TouchableOpacity style={styles.actionItem} onPress={() => { if (actionBudget) handleEdit(actionBudget); setActionOpen(false); }}>
              <Text style={[styles.actionText, { color: colors.text }]}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={() => { if (actionBudget) handleDelete(actionBudget); setActionOpen(false); }}>
              <Text style={[styles.actionText, { color: colors.text }]}>Apagar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setActionOpen(false)}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: 20, gap: 16, flexGrow: 1 },
  card: {
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    ...shadow.card,
  },
  cardTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
  input: {
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthInput: { flex: 1 },
  select: {
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  selectText: { fontWeight: '600' },
  button: { padding: 14, borderRadius: radius.md, alignItems: 'center' },
  buttonText: { fontWeight: '700' },
  secondary: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 6,
  },
  secondaryText: { fontWeight: '600' },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowText: { fontWeight: '600' },
  muted: { marginTop: 4 },
  rowActions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  kebab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kebabText: { fontSize: 18, lineHeight: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    ...shadow.card,
  },
  actionCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: 1,
    ...shadow.card,
  },
  actionItem: { paddingVertical: 10 },
  actionText: { fontWeight: '600' },
  modalItem: { paddingVertical: 10 },
  modalText: { fontWeight: '600' },
  inlinePicker: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 8,
    backgroundColor: '#0b1220',
    marginBottom: 8,
  },
});
