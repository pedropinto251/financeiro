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
  apiAllocateGoal,
  apiCreateGoal,
  apiDeleteGoal,
  apiDeleteGoalAllocation,
  apiGetGoals,
  apiUpdateGoal,
  apiUpdateGoalAllocation,
  Goal,
  GoalAllocation,
} from '@/lib/api';
import AppShell from '@/components/AppShell';
import { useTheme, radius, shadow } from '@/styles/theme';

export default function GoalsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [allocations, setAllocations] = useState<GoalAllocation[]>([]);

  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [allocOpen, setAllocOpen] = useState(false);
  const [goalActionOpen, setGoalActionOpen] = useState(false);
  const [allocActionOpen, setAllocActionOpen] = useState(false);

  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [actionGoal, setActionGoal] = useState<Goal | null>(null);
  const [actionAlloc, setActionAlloc] = useState<GoalAllocation | null>(null);

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const [allocGoal, setAllocGoal] = useState<Goal | null>(null);
  const [allocAmount, setAllocAmount] = useState('');
  const [allocDate, setAllocDate] = useState('');
  const [allocNote, setAllocNote] = useState('');
  const [editingAlloc, setEditingAlloc] = useState<GoalAllocation | null>(null);

  const [search, setSearch] = useState('');
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);
  const [picker, setPicker] = useState<{ visible: boolean; value: Date; context?: 'goal' | 'alloc' }>({
    visible: false,
    value: new Date(),
  });

  const formatDate = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const openDatePicker = (current: string, onChange: (value: string) => void, context: 'goal' | 'alloc') => {
    const now = current ? new Date(current) : new Date();
    if (Platform.OS === 'android') {
      const { DateTimePickerAndroid } = require('@react-native-community/datetimepicker');
      DateTimePickerAndroid.open({
        value: now,
        mode: 'date',
        is24Hour: true,
        onChange: (_: DateTimePickerEvent, selectedDate?: Date) => {
          if (!selectedDate) return;
          onChange(formatDate(selectedDate));
        },
      });
      return;
    }
    setPicker({ visible: true, value: now, context });
  };

  const load = async () => {
    if (!token) return;
    const res = await apiGetGoals(token);
    setGoals(res.goals || []);
    setAllocations(res.allocations || []);
  };

  useEffect(() => {
    const today = new Date();
    setTargetDate(formatDate(today));
    setAllocDate(formatDate(today));
    load();
  }, [token]);

  const resetGoalForm = () => {
    setEditingGoal(null);
    setName('');
    setTargetAmount('');
    setTargetDate(formatDate(new Date()));
  };

  const openGoalForm = (goal?: Goal) => {
    if (goal) {
      setEditingGoal(goal);
      setName(goal.nome);
      setTargetAmount(String(goal.valor_objetivo));
      setTargetDate(goal.data_objetivo ? goal.data_objetivo.slice(0, 10) : '');
    } else {
      resetGoalForm();
    }
    setGoalFormOpen(true);
  };

  const resetAllocForm = () => {
    setEditingAlloc(null);
    setAllocAmount('');
    setAllocNote('');
    setAllocDate(formatDate(new Date()));
  };

  const openAllocForm = (goal?: Goal, alloc?: GoalAllocation) => {
    if (alloc) {
      setEditingAlloc(alloc);
      setAllocAmount(String(alloc.valor));
      setAllocDate(alloc.data_alocacao.slice(0, 10));
      setAllocNote(alloc.nota || '');
      const g = goals.find((item) => item.id === alloc.goal_id) || null;
      setAllocGoal(g);
    } else {
      resetAllocForm();
      setAllocGoal(goal || null);
    }
    setAllocOpen(true);
  };

  const parseAmount = (value: string) => {
    const norm = value.replace(',', '.');
    const num = parseFloat(norm);
    return Number.isFinite(num) ? num : NaN;
  };

  const handleSaveGoal = async () => {
    if (!token || !name || !targetAmount) {
      Alert.alert('Erro', 'Preenche nome e valor.');
      return;
    }
    const parsed = parseAmount(targetAmount);
    if (!Number.isFinite(parsed)) {
      Alert.alert('Erro', 'Valor inválido.');
      return;
    }
    try {
      if (editingGoal) {
        await apiUpdateGoal(token, editingGoal.id, {
          name: name.trim(),
          target_amount: parsed,
          target_date: targetDate || null,
        });
      } else {
        await apiCreateGoal(token, {
          name: name.trim(),
          target_amount: parsed,
          target_date: targetDate || null,
        });
      }
      setGoalFormOpen(false);
      resetGoalForm();
      await load();
    } catch {
      Alert.alert('Erro', 'Nao foi possivel guardar.');
    }
  };

  const handleDeleteGoal = (g: Goal) => {
    if (!token) return;
    Alert.alert('Apagar', 'Queres apagar este objetivo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          await apiDeleteGoal(token, g.id);
          await load();
        },
      },
    ]);
  };

  const handleSaveAllocation = async () => {
    if (!token || !allocGoal || !allocAmount || !allocDate) {
      Alert.alert('Erro', 'Preenche objetivo, valor e data.');
      return;
    }
    const parsed = parseAmount(allocAmount);
    if (!Number.isFinite(parsed)) {
      Alert.alert('Erro', 'Valor inválido.');
      return;
    }
    try {
      if (editingAlloc) {
        await apiUpdateGoalAllocation(token, editingAlloc.id, {
          goal_id: allocGoal.id,
          amount: parsed,
          date: allocDate,
          note: allocNote || undefined,
        });
      } else {
        await apiAllocateGoal(token, allocGoal.id, {
          amount: parsed,
          date: allocDate,
          note: allocNote || undefined,
        });
      }
      setAllocOpen(false);
      resetAllocForm();
      await load();
    } catch {
      Alert.alert('Erro', 'Nao foi possivel guardar.');
    }
  };

  const handleDeleteAllocation = (alloc: GoalAllocation) => {
    if (!token) return;
    Alert.alert('Apagar', 'Queres apagar esta alocacao?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          await apiDeleteGoalAllocation(token, alloc.id);
          await load();
        },
      },
    ]);
  };

  const filteredGoals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return goals;
    return goals.filter((g) => g.nome.toLowerCase().includes(q));
  }, [goals, search]);

  return (
    <AppShell title="Objetivos">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: 120 }]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
        >
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Objetivos</Text>
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={() => openGoalForm()}>
              <Text style={[styles.buttonText, { color: colors.bg }]}>Novo objetivo</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Lista</Text>
            {goals.map((g) => {
              const target = Number(g.valor_objetivo || 0);
              const allocated = Number(g.total_alocado || 0);
              const percent = target > 0 ? Math.min(100, Math.round((allocated / target) * 100)) : 0;
              return (
                <View key={g.id} style={[styles.row, { borderBottomColor: colors.border }, percent >= 100 && { backgroundColor: colors.accentSoft }]}> 
                  <View style={styles.rowHeader}>
                    <Text style={[styles.rowText, { color: colors.text }]}>{g.nome}</Text>
                    <TouchableOpacity style={[styles.kebab, { borderColor: colors.border }]} onPress={() => { setActionGoal(g); setGoalActionOpen(true); }}>
                      <Text style={[styles.kebabText, { color: colors.text }]}>⋯</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.muted, { color: colors.muted }]}>{allocated.toFixed(2)} € / {target.toFixed(2)} €</Text>
                  <View style={styles.rowActions}>
                    <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => openAllocForm(g)}>
                      <Text style={[styles.secondaryText, { color: colors.text }]}>Alocar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <View style={styles.sectionHeader}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Alocacoes</Text>
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => openAllocForm()}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Nova alocacao</Text>
              </TouchableOpacity>
            </View>
            {allocations.map((a) => (
              <View key={a.id} style={[styles.row, { borderBottomColor: colors.border }]}> 
                <View style={styles.rowHeader}>
                  <Text style={[styles.rowText, { color: colors.text }]}>{a.goal_nome}</Text>
                  <TouchableOpacity style={[styles.kebab, { borderColor: colors.border }]} onPress={() => { setActionAlloc(a); setAllocActionOpen(true); }}>
                    <Text style={[styles.kebabText, { color: colors.text }]}>⋯</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.muted, { color: colors.muted }]}>{a.data_alocacao.slice(0, 10)} · {Number(a.valor).toFixed(2)} €</Text>
                {a.nota ? <Text style={[styles.note, { color: colors.muted }]}>{a.nota}</Text> : null}
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={goalFormOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>{editingGoal ? 'Editar objetivo' : 'Novo objetivo'}</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Nome" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Valor objetivo" placeholderTextColor={colors.muted} value={targetAmount} onChangeText={setTargetAmount} keyboardType="decimal-pad" />
            <View style={styles.dateRow}>
              <TextInput style={[styles.input, styles.dateInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Data" placeholderTextColor={colors.muted} value={targetDate} onChangeText={setTargetDate} />
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => openDatePicker(targetDate, setTargetDate, 'goal')}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Selecionar</Text>
              </TouchableOpacity>
            </View>
            {picker.visible && Platform.OS === 'ios' && picker.context === 'goal' ? (
              <View style={[styles.inlinePicker, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}> 
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
                      setTargetDate(formatDate(selectedDate));
                    }
                  }}
                />
                <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setPicker({ visible: false, value: picker.value })}>
                  <Text style={[styles.secondaryText, { color: colors.text }]}>Fechar</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={handleSaveGoal}>
              <Text style={[styles.buttonText, { color: colors.bg }]}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => { setGoalFormOpen(false); resetGoalForm(); }}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={allocOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>{editingAlloc ? 'Editar alocacao' : 'Alocar poupanca'}</Text>
            <TouchableOpacity style={[styles.select, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} onPress={() => { setGoalPickerOpen((s) => !s); setSearch(''); }}>
              <Text style={[styles.selectText, { color: colors.text }]}>{allocGoal ? allocGoal.nome : 'Escolher objetivo'}</Text>
            </TouchableOpacity>
            {goalPickerOpen ? (
              <View style={[styles.inlinePicker, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}> 
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]}
                  placeholder="Pesquisar objetivo"
                  placeholderTextColor={colors.muted}
                  value={search}
                  onChangeText={setSearch}
                />
                <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="always">
                  {filteredGoals.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={styles.modalItem}
                      onPress={() => {
                        setAllocGoal(g);
                        setGoalPickerOpen(false);
                      }}
                    >
                      <Text style={[styles.modalText, { color: colors.text }]}>{g.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Valor" placeholderTextColor={colors.muted} value={allocAmount} onChangeText={setAllocAmount} keyboardType="decimal-pad" />
            <View style={styles.dateRow}>
              <TextInput style={[styles.input, styles.dateInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Data" placeholderTextColor={colors.muted} value={allocDate} onChangeText={setAllocDate} />
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => openDatePicker(allocDate, setAllocDate, 'alloc')}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Selecionar</Text>
              </TouchableOpacity>
            </View>
            {picker.visible && Platform.OS === 'ios' && picker.context === 'alloc' ? (
              <View style={[styles.inlinePicker, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}> 
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
                      setAllocDate(formatDate(selectedDate));
                    }
                  }}
                />
                <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setPicker({ visible: false, value: picker.value })}>
                  <Text style={[styles.secondaryText, { color: colors.text }]}>Fechar</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Nota (opcional)" placeholderTextColor={colors.muted} value={allocNote} onChangeText={setAllocNote} />
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={handleSaveAllocation}>
              <Text style={[styles.buttonText, { color: colors.bg }]}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => { setAllocOpen(false); resetAllocForm(); }}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={goalActionOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                if (actionGoal) openGoalForm(actionGoal);
                setGoalActionOpen(false);
              }}
            >
              <Text style={[styles.actionText, { color: colors.text }]}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                if (actionGoal) openAllocForm(actionGoal);
                setGoalActionOpen(false);
              }}
            >
              <Text style={[styles.actionText, { color: colors.text }]}>Alocar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                if (actionGoal) handleDeleteGoal(actionGoal);
                setGoalActionOpen(false);
              }}
            >
              <Text style={[styles.actionText, { color: colors.text }]}>Apagar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setGoalActionOpen(false)}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={allocActionOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                if (actionAlloc) openAllocForm(undefined, actionAlloc);
                setAllocActionOpen(false);
              }}
            >
              <Text style={[styles.actionText, { color: colors.text }]}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                if (actionAlloc) handleDeleteAllocation(actionAlloc);
                setAllocActionOpen(false);
              }}
            >
              <Text style={[styles.actionText, { color: colors.text }]}>Apagar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setAllocActionOpen(false)}>
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
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInput: { flex: 1 },
  button: { padding: 14, borderRadius: radius.md, alignItems: 'center' },
  buttonText: { fontWeight: '700' },
  secondary: { padding: 10, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  secondaryText: { fontWeight: '600' },
  row: { paddingVertical: 10, borderBottomWidth: 1 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowText: { fontWeight: '600' },
  muted: { marginTop: 4 },
  note: { marginTop: 4, fontSize: 12 },
  rowActions: { marginTop: 8 },
  select: { borderRadius: radius.md, padding: 12, borderWidth: 1, marginBottom: 10 },
  selectText: { fontWeight: '600' },
  kebab: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kebabText: { fontSize: 18, lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: 16, borderWidth: 1, ...shadow.card },
  actionCard: { width: '100%', maxWidth: 320, borderRadius: radius.lg, padding: 12, borderWidth: 1, ...shadow.card },
  actionItem: { paddingVertical: 10 },
  actionText: { fontWeight: '600' },
  modalItem: { paddingVertical: 10 },
  modalText: { fontWeight: '600' },
  inlinePicker: { borderWidth: 1, borderRadius: radius.md, padding: 8, marginBottom: 8 },
});
