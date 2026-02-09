import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useAuth } from './_layout';
import { apiAllocateGoal, apiCreateTransaction, apiGetCategories, apiGetDashboard, apiGetGoals, Category, DashboardResponse, Goal } from '@/lib/api';
import AppShell from '@/components/AppShell';
import { useTheme, radius, shadow } from '@/styles/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { token, setToken } = useAuth();
  const { colors } = useTheme();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickType, setQuickType] = useState<'expense' | 'income'>('expense');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickDate, setQuickDate] = useState('');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickCategory, setQuickCategory] = useState<Category | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const [allocOpen, setAllocOpen] = useState(false);
  const [allocGoal, setAllocGoal] = useState<Goal | null>(null);
  const [allocAmount, setAllocAmount] = useState('');
  const [allocDate, setAllocDate] = useState('');
  const [allocGoalPicker, setAllocGoalPicker] = useState(false);
  const [goalSearch, setGoalSearch] = useState('');

  const [picker, setPicker] = useState<{ visible: boolean; value: Date; onSelect?: (val: string) => void }>({
    visible: false,
    value: new Date(),
  });

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.nome.toLowerCase().includes(q));
  }, [search, categories]);

  const filteredGoals = useMemo(() => {
    const q = goalSearch.trim().toLowerCase();
    if (!q) return goals;
    return goals.filter((g) => g.nome.toLowerCase().includes(q));
  }, [goalSearch, goals]);

  const formatDate = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const openDatePicker = (current: string, onChange: (value: string) => void) => {
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
    setPicker({ visible: true, value: now, onSelect: onChange });
  };

  const load = async () => {
    if (!token) return;
    const [res, cats, goalsRes] = await Promise.all([
      apiGetDashboard(token),
      apiGetCategories(token),
      apiGetGoals(token),
    ]);
    setData(res);
    setCategories(cats);
    setGoals(goalsRes.goals || []);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const today = new Date();
        const d = formatDate(today);
        setQuickDate(d);
        setAllocDate(d);
        await load();
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleLogout = () => {
    setToken(null);
    router.replace('/');
  };

  const parseAmount = (value: string) => {
    const norm = value.replace(',', '.');
    const num = parseFloat(norm);
    return Number.isFinite(num) ? num : NaN;
  };

  const handleQuickSave = async () => {
    if (!token) return;
    const parsed = parseAmount(quickAmount);
    if (!Number.isFinite(parsed) || !quickDate) return;
    await apiCreateTransaction(token, {
      type: quickType,
      amount: parsed,
      date: quickDate,
      description: quickDesc || undefined,
      category_id: quickCategory?.id || null,
    });
    setQuickAmount('');
    setQuickDesc('');
    setQuickOpen(false);
    await load();
  };

  const handleAlloc = async () => {
    if (!token || !allocGoal) return;
    const parsed = parseAmount(allocAmount);
    if (!Number.isFinite(parsed) || !allocDate) return;
    await apiAllocateGoal(token, allocGoal.id, { amount: parsed, date: allocDate });
    setAllocAmount('');
    setAllocOpen(false);
    await load();
  };

  if (loading) {
    return (
      <AppShell>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingBottom: 140 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              try {
                setRefreshing(true);
                await load();
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]}>Resumo</Text>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={[styles.link, { color: colors.accent }]}>Sair</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity style={[styles.quickBtn, { backgroundColor: colors.accent }]} onPress={() => { setQuickType('expense'); setQuickOpen(true); }}>
            <Text style={[styles.quickText, { color: colors.bg }]}>Adicionar despesa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.quickBtn, { backgroundColor: colors.accent }]} onPress={() => { setQuickType('income'); setQuickOpen(true); }}>
            <Text style={[styles.quickText, { color: colors.bg }]}>Adicionar receita</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.quickBtn, { borderColor: colors.border }]} onPress={() => setAllocOpen(true)}>
          <Text style={[styles.quickText, { color: colors.text }]}>Alocar dinheiro</Text>
        </TouchableOpacity>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Text style={[styles.cardTitle, { color: colors.text }]}>Saldo mensal</Text>
          <Text style={[styles.value, { color: colors.text }]}> 
            {((data?.summary.income || 0) - (data?.summary.expense || 0) - (data?.summary.allocated || 0)).toFixed(2)} €
          </Text>
          <Text style={[styles.muted, { color: colors.muted }]}>Receitas: {(data?.summary.income || 0).toFixed(2)} €</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>Despesas: {(data?.summary.expense || 0).toFixed(2)} €</Text>
          {data?.summary.allocated ? (
            <Text style={[styles.muted, { color: colors.muted }]}>Alocado: {data.summary.allocated.toFixed(2)} €</Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Text style={[styles.cardTitle, { color: colors.text }]}>Atalhos</Text>
          <View style={styles.quickRow}>
            <TouchableOpacity style={[styles.quickBtn, { borderColor: colors.border }]} onPress={() => router.push('/movements')}>
              <Text style={[styles.quickText, { color: colors.text }]}>Movimentos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickBtn, { borderColor: colors.border }]} onPress={() => router.push('/categories')}>
              <Text style={[styles.quickText, { color: colors.text }]}>Categorias</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.quickRow}>
            <TouchableOpacity style={[styles.quickBtn, { borderColor: colors.border }]} onPress={() => router.push('/budgets')}>
              <Text style={[styles.quickText, { color: colors.text }]}>Budgets</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickBtn, { borderColor: colors.border }]} onPress={() => router.push('/goals')}>
              <Text style={[styles.quickText, { color: colors.text }]}>Objetivos</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Text style={[styles.cardTitle, { color: colors.text }]}>Poupança anual</Text>
          <Text style={[styles.value, { color: colors.text }]}> 
            {((data?.yearSummary.income || 0) - (data?.yearSummary.expense || 0)).toFixed(2)} €
          </Text>
          <Text style={[styles.muted, { color: colors.muted }]}>Receitas: {(data?.yearSummary.income || 0).toFixed(2)} €</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>Despesas: {(data?.yearSummary.expense || 0).toFixed(2)} €</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Text style={[styles.cardTitle, { color: colors.text }]}>Objetivos</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>Saldo corrente: {(data?.totals.available || 0).toFixed(2)} €</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>Poupanças alocadas: {(data?.totals.allocated || 0).toFixed(2)} €</Text>
          {(data?.goals || []).map((g) => {
            const target = Number(g.valor_objetivo || 0);
            const allocated = Number(g.total_alocado || 0);
            const percent = target > 0 ? Math.min(100, Math.round((allocated / target) * 100)) : 0;
            return (
              <View key={g.id} style={[styles.goalRow, percent >= 100 && { backgroundColor: colors.accentSoft }]}> 
                <Text style={[styles.goalName, { color: colors.text }]}>{g.nome}</Text>
                <Text style={[styles.muted, { color: colors.muted }]}>{allocated.toFixed(2)} € / {target.toFixed(2)} €</Text>
                <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.barFill, { width: `${percent}%`, backgroundColor: colors.accent }]} />
                </View>
                {percent >= 100 ? <Text style={[styles.goalBadge, { color: colors.success }]}>Objetivo cumprido</Text> : null}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={quickOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>{quickType === 'expense' ? 'Nova despesa' : 'Nova receita'}</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Valor" placeholderTextColor={colors.muted} value={quickAmount} onChangeText={setQuickAmount} keyboardType="decimal-pad" />
            <View style={styles.dateRow}>
              <TextInput style={[styles.input, styles.dateInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Data" placeholderTextColor={colors.muted} value={quickDate} onChangeText={setQuickDate} />
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => openDatePicker(quickDate, setQuickDate)}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Selecionar</Text>
              </TouchableOpacity>
            </View>
            {picker.visible && Platform.OS === 'ios' ? (
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
                    if (selectedDate && picker.onSelect) {
                      picker.onSelect(formatDate(selectedDate));
                    }
                  }}
                />
                <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setPicker({ visible: false, value: picker.value })}>
                  <Text style={[styles.secondaryText, { color: colors.text }]}>Fechar</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Descricao" placeholderTextColor={colors.muted} value={quickDesc} onChangeText={setQuickDesc} />
            <TouchableOpacity
              style={[styles.select, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              onPress={() => { setCategoryPickerOpen((s) => !s); setSearch(''); }}
            >
              <Text style={[styles.selectText, { color: colors.text }]}>{quickCategory ? quickCategory.nome : 'Categoria (opcional)'}</Text>
            </TouchableOpacity>
            {categoryPickerOpen ? (
              <View style={[styles.inlinePicker, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}> 
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]}
                  placeholder="Pesquisar categoria"
                  placeholderTextColor={colors.muted}
                  value={search}
                  onChangeText={setSearch}
                />
                <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="always">
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setQuickCategory(null);
                      setCategoryPickerOpen(false);
                    }}
                  >
                    <Text style={[styles.modalText, { color: colors.text }]}>Sem categoria</Text>
                  </TouchableOpacity>
                  {filteredCategories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.modalItem}
                      onPress={() => {
                        setQuickCategory(c);
                        setCategoryPickerOpen(false);
                      }}
                    >
                      <Text style={[styles.modalText, { color: colors.text }]}>{c.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={handleQuickSave}>
              <Text style={[styles.buttonText, { color: colors.bg }]}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setQuickOpen(false)}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={allocOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Alocar dinheiro</Text>
            <TouchableOpacity style={[styles.select, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} onPress={() => { setAllocGoalPicker((s) => !s); setGoalSearch(''); }}>
              <Text style={[styles.selectText, { color: colors.text }]}>{allocGoal ? allocGoal.nome : 'Escolher objetivo'}</Text>
            </TouchableOpacity>
            {allocGoalPicker ? (
              <View style={[styles.inlinePicker, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}> 
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]}
                  placeholder="Pesquisar objetivo"
                  placeholderTextColor={colors.muted}
                  value={goalSearch}
                  onChangeText={setGoalSearch}
                />
                <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="always">
                  {filteredGoals.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={styles.modalItem}
                      onPress={() => {
                        setAllocGoal(g);
                        setAllocGoalPicker(false);
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
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => openDatePicker(allocDate, setAllocDate)}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Selecionar</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={handleAlloc}>
              <Text style={[styles.buttonText, { color: colors.bg }]}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setAllocOpen(false)}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>Cancelar</Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700' },
  link: { fontWeight: '600' },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickBtn: { flex: 1, padding: 12, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  quickText: { fontWeight: '700', fontSize: 12 },
  card: { borderRadius: radius.lg, padding: 16, borderWidth: 1, ...shadow.card },
  cardTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
  value: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  muted: { marginTop: 4 },
  goalRow: { paddingVertical: 10, borderRadius: radius.md, marginTop: 8, paddingHorizontal: 10 },
  goalName: { fontWeight: '700' },
  barTrack: { height: 8, borderRadius: 6, marginTop: 8 },
  barFill: { height: 8, borderRadius: 6 },
  goalBadge: { marginTop: 8, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: 16, borderWidth: 1, ...shadow.card },
  input: { borderRadius: radius.md, padding: 12, marginBottom: 10, borderWidth: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInput: { flex: 1 },
  select: { borderRadius: radius.md, padding: 12, borderWidth: 1, marginBottom: 10 },
  selectText: { fontWeight: '600' },
  button: { padding: 14, borderRadius: radius.md, alignItems: 'center' },
  buttonText: { fontWeight: '700' },
  secondary: { padding: 10, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  secondaryText: { fontWeight: '600' },
  inlinePicker: { borderWidth: 1, borderRadius: radius.md, padding: 8, marginBottom: 8 },
  modalItem: { paddingVertical: 10 },
  modalText: { fontWeight: '600' },
});
