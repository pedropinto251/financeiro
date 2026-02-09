import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import AppShell from '@/components/AppShell';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from './_layout';
import {
  apiCreateTransaction,
  apiDeleteTransaction,
  apiGetCategories,
  apiGetTransactions,
  apiOpenDocument,
  apiUpdateTransaction,
  apiUploadTransactionDocument,
  apiVoidTransaction,
  Category,
  Transaction,
} from '@/lib/api';
import { useTheme, radius, shadow } from '@/styles/theme';

export default function MovementsScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [filterCategory, setFilterCategory] = useState<Category | null>(null);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [createCategory, setCreateCategory] = useState<Category | null>(null);
  const [editCategory, setEditCategory] = useState<Category | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionTx, setActionTx] = useState<Transaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [search, setSearch] = useState('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryPickerMode, setCategoryPickerMode] = useState<'create' | 'edit' | 'filter'>('create');
  const [createFile, setCreateFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [editFile, setEditFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const [picker, setPicker] = useState<{ visible: boolean; value: Date; onSelect?: (val: string) => void; context?: 'filter' | 'create' | 'edit' }>({
    visible: false,
    value: new Date(),
  });

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.nome.toLowerCase().includes(q));
  }, [search, categories]);

  const load = async (nextPage = 1) => {
    if (!token) return;
    const res = await apiGetTransactions(token, {
      page: nextPage,
      per_page: 20,
      category_id: filterCategory?.id || undefined,
      from: filterFrom || undefined,
      to: filterTo || undefined,
    });
    setItems(res.items);
    setPage(res.page);
    setTotalPages(res.total_pages);
  };

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        setLoading(true);
        const cats = await apiGetCategories(token);
        setCategories(cats);
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setDate(`${yyyy}-${mm}-${dd}`);
        await load(1);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const parseAmount = (value: string) => {
    const norm = value.replace(',', '.');
    const num = parseFloat(norm);
    return Number.isFinite(num) ? num : NaN;
  };

  const handleCreate = async () => {
    if (!token) return;
    const parsed = parseAmount(amount);
    if (!Number.isFinite(parsed) || !date) {
      Alert.alert('Erro', 'Preenche valor e data.');
      return;
    }
    try {
      const created = await apiCreateTransaction(token, {
        type,
        amount: parsed,
        date,
        description: description || undefined,
        category_id: createCategory?.id || null,
      });
      if (createFile) {
        await apiUploadTransactionDocument(token, created.id, {
          uri: createFile.uri,
          name: createFile.name || `document-${created.id}`,
          mimeType: createFile.mimeType,
        });
        setCreateFile(null);
      }
      setAmount('');
      setDescription('');
      await load(1);
    } catch {
      Alert.alert('Erro', 'Nao foi possivel guardar.');
    }
  };

  const handleEdit = (tx: Transaction) => {
    setEditTx(tx);
    setType(tx.tipo);
    setAmount(String(tx.valor));
    setDate(tx.data_ocorrencia.slice(0, 10));
    setDescription(tx.descricao || '');
    const cat = categories.find((c) => c.id === (tx.categoria_id || 0)) || null;
    setEditCategory(cat);
    setEditOpen(true);
  };

  const openActions = (tx: Transaction) => {
    setActionTx(tx);
    setActionOpen(true);
  };

  const handleUpdate = async () => {
    if (!token || !editTx) return;
    const parsed = parseAmount(amount);
    if (!Number.isFinite(parsed) || !date) {
      Alert.alert('Erro', 'Preenche valor e data.');
      return;
    }
    try {
      await apiUpdateTransaction(token, editTx.id, {
        type,
        amount: parsed,
        date,
        description: description || undefined,
        category_id: editCategory?.id || null,
      });
      if (editFile) {
        await apiUploadTransactionDocument(token, editTx.id, {
          uri: editFile.uri,
          name: editFile.name || `document-${editTx.id}`,
          mimeType: editFile.mimeType,
        });
        setEditFile(null);
      }
      setEditOpen(false);
      await load(page);
    } catch {
      Alert.alert('Erro', 'Nao foi possivel atualizar.');
    }
  };

  const handleVoid = async (tx: Transaction) => {
    if (!token) return;
    Alert.alert('Anular', 'Queres anular este movimento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Anular',
        style: 'destructive',
        onPress: async () => {
          await apiVoidTransaction(token, tx.id);
          await load(page);
        },
      },
    ]);
  };

  const handleDelete = async (tx: Transaction) => {
    if (!token) return;
    Alert.alert('Apagar', 'Queres apagar este movimento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          await apiDeleteTransaction(token, tx.id);
          await load(page);
        },
      },
    ]);
  };

  const formatDate = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const openDatePicker = (current: string, onChange: (value: string) => void, context: 'filter' | 'create' | 'edit') => {
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
    setPicker({ visible: true, value: now, onSelect: onChange, context });
  };

  const renderCategoryPicker = (onPick: (c: Category | null) => void) => (
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
            onPick(null);
            setCategoryPickerOpen(false);
          }}
        >
          <Text style={[styles.modalText, { color: colors.text }]}>Sem categoria / Todas</Text>
        </TouchableOpacity>
        {filteredCategories.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={styles.modalItem}
            onPress={() => {
              onPick(c);
              setCategoryPickerOpen(false);
            }}
          >
            <Text style={[styles.modalText, { color: colors.text }]}>{c.nome}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  if (loading) {
    return (
      <AppShell title="Movimentos">
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell title="Movimentos">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: 120 }]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
        >
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Movimentos</Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.accent }]}
              onPress={() => {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                setType('expense');
                setAmount('');
                setDescription('');
                setDate(`${yyyy}-${mm}-${dd}`);
                setCreateCategory(null);
                setCreateOpen(true);
              }}
            >
              <Text style={[styles.buttonText, { color: colors.bg }]}>Adicionar movimento</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Filtros</Text>
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.select, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                onPress={() => {
                  setCategoryPickerMode('filter');
                  setCategoryPickerOpen((s) => !s);
                  setSearch('');
                }}
              >
                <Text style={[styles.selectText, { color: colors.text }]}>{filterCategory ? filterCategory.nome : 'Todas categorias'}</Text>
              </TouchableOpacity>
              {categoryPickerOpen && categoryPickerMode === 'filter'
                ? renderCategoryPicker((c) => setFilterCategory(c))
                : null}
              <View style={styles.dateRow}>
                <TextInput style={[styles.input, styles.dateInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="De (YYYY-MM-DD)" placeholderTextColor={colors.muted} value={filterFrom} onChangeText={setFilterFrom} />
                <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => openDatePicker(filterFrom, setFilterFrom, 'filter')}>
                  <Text style={[styles.secondaryText, { color: colors.text }]}>Selecionar</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.dateRow}>
                <TextInput style={[styles.input, styles.dateInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Ate (YYYY-MM-DD)" placeholderTextColor={colors.muted} value={filterTo} onChangeText={setFilterTo} />
                <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => openDatePicker(filterTo, setFilterTo, 'filter')}>
                  <Text style={[styles.secondaryText, { color: colors.text }]}>Selecionar</Text>
                </TouchableOpacity>
              </View>
              {picker.visible && Platform.OS === 'ios' && picker.context === 'filter' ? (
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
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => load(1)}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Aplicar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => { setFilterCategory(null); setFilterFrom(''); setFilterTo(''); load(1); }}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Limpar</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Lista</Text>
            {items.map((tx) => (
              <View key={tx.id} style={[styles.txRow, { borderBottomColor: colors.border }]}> 
                <Text style={[styles.txTitle, { color: colors.text }]}>
                  {tx.categoria_nome || 'Sem categoria'} • {tx.data_ocorrencia.slice(0, 10)}
                </Text>
                {tx.descricao ? <Text style={[styles.muted, { color: colors.muted }]}>{tx.descricao}</Text> : null}
                <Text style={[styles.amount, { color: tx.tipo === 'income' ? colors.success : colors.danger }]}>
                  {tx.tipo === 'income' ? '+' : '-'}
                  {Number(tx.valor).toFixed(2)} €
                </Text>
                <View style={styles.txActions}>
                  {tx.document_id ? (
                    <TouchableOpacity
                      style={[styles.docBtn, { borderColor: colors.border }]}
                      onPress={async () => {
                        if (!token) return;
                        await apiOpenDocument(token, tx.document_id as number, {
                          name: tx.document_name || undefined,
                          mime: tx.document_mime || undefined,
                        });
                      }}
                    >
                      <Text style={[styles.docText, { color: colors.text }]}>Documento</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={[styles.kebab, { borderColor: colors.border }]} onPress={() => openActions(tx)}>
                    <Text style={[styles.kebabText, { color: colors.text }]}>⋯</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <View style={styles.pagination}>
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => load(Math.max(1, page - 1))} disabled={page <= 1}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Anterior</Text>
              </TouchableOpacity>
              <Text style={[styles.muted, { color: colors.muted }]}>Pagina {page} / {totalPages}</Text>
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => load(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Seguinte</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={createOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Novo movimento</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, { borderColor: colors.border }, type === 'expense' && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
                onPress={() => setType('expense')}
              >
                <Text style={[styles.typeText, { color: colors.text }]}>Despesa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, { borderColor: colors.border }, type === 'income' && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
                onPress={() => setType('income')}
              >
                <Text style={[styles.typeText, { color: colors.text }]}>Receita</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Valor" placeholderTextColor={colors.muted} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <View style={styles.dateRow}>
              <TextInput style={[styles.input, styles.dateInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Data (YYYY-MM-DD)" placeholderTextColor={colors.muted} value={date} onChangeText={setDate} />
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => openDatePicker(date, setDate, 'create')}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Selecionar</Text>
              </TouchableOpacity>
            </View>
            {picker.visible && Platform.OS === 'ios' && picker.context === 'create' ? (
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
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Descricao" placeholderTextColor={colors.muted} value={description} onChangeText={setDescription} />
            <TouchableOpacity
              style={[styles.select, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              onPress={() => {
                setCategoryPickerMode('create');
                setCategoryPickerOpen((s) => !s);
                setSearch('');
              }}
            >
              <Text style={[styles.selectText, { color: colors.text }]}>{createCategory ? createCategory.nome : 'Categoria (opcional)'}</Text>
            </TouchableOpacity>
            {categoryPickerOpen && categoryPickerMode === 'create'
              ? renderCategoryPicker((c) => setCreateCategory(c))
              : null}
            <TouchableOpacity
              style={[styles.secondary, { borderColor: colors.border }]}
              onPress={async () => {
                const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
                if (!result.canceled && result.assets[0]) {
                  setCreateFile(result.assets[0]);
                }
              }}
            >
              <Text style={[styles.secondaryText, { color: colors.text }]}>{createFile ? createFile.name : 'Escolher documento'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={() => { handleCreate(); setCreateOpen(false); }}>
              <Text style={[styles.buttonText, { color: colors.bg }]}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setCreateOpen(false)}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={actionOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <TouchableOpacity style={styles.actionItem} onPress={() => { if (actionTx) handleEdit(actionTx); setActionOpen(false); }}>
              <Text style={[styles.actionText, { color: colors.text }]}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={() => { if (actionTx) handleVoid(actionTx); setActionOpen(false); }}>
              <Text style={[styles.actionText, { color: colors.text }]}>Anular</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={() => { if (actionTx) handleDelete(actionTx); setActionOpen(false); }}>
              <Text style={[styles.actionText, { color: colors.text }]}>Apagar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setActionOpen(false)}>
              <Text style={[styles.secondaryText, { color: colors.text }]}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={editOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Editar movimento</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, { borderColor: colors.border }, type === 'expense' && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
                onPress={() => setType('expense')}
              >
                <Text style={[styles.typeText, { color: colors.text }]}>Despesa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, { borderColor: colors.border }, type === 'income' && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
                onPress={() => setType('income')}
              >
                <Text style={[styles.typeText, { color: colors.text }]}>Receita</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Valor" placeholderTextColor={colors.muted} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <View style={styles.dateRow}>
              <TextInput style={[styles.input, styles.dateInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Data (YYYY-MM-DD)" placeholderTextColor={colors.muted} value={date} onChangeText={setDate} />
              <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => openDatePicker(date, setDate, 'edit')}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>Selecionar</Text>
              </TouchableOpacity>
            </View>
            {picker.visible && Platform.OS === 'ios' && picker.context === 'edit' ? (
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
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]} placeholder="Descricao" placeholderTextColor={colors.muted} value={description} onChangeText={setDescription} />
            <TouchableOpacity
              style={[styles.select, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              onPress={() => {
                setCategoryPickerMode('edit');
                setCategoryPickerOpen((s) => !s);
                setSearch('');
              }}
            >
              <Text style={[styles.selectText, { color: colors.text }]}>{editCategory ? editCategory.nome : 'Categoria (opcional)'}</Text>
            </TouchableOpacity>
            {categoryPickerOpen && categoryPickerMode === 'edit'
              ? renderCategoryPicker((c) => setEditCategory(c))
              : null}
            <TouchableOpacity
              style={[styles.secondary, { borderColor: colors.border }]}
              onPress={async () => {
                const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
                if (!result.canceled && result.assets[0]) {
                  setEditFile(result.assets[0]);
                }
              }}
            >
              <Text style={[styles.secondaryText, { color: colors.text }]}>{editFile ? editFile.name : 'Atualizar documento'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={handleUpdate}>
              <Text style={[styles.buttonText, { color: colors.bg }]}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.border }]} onPress={() => setEditOpen(false)}>
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
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryText: { fontWeight: '600' },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeBtn: {
    flex: 1,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeText: { fontWeight: '600' },
  filterRow: { gap: 6 },
  txRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  txTitle: { fontWeight: '600' },
  muted: { marginTop: 4 },
  amount: { marginTop: 6, fontWeight: '700' },
  txActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  docBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  docText: { fontWeight: '600', fontSize: 12 },
  kebab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kebabText: { fontSize: 18, lineHeight: 18 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
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
  inlinePicker: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 8,
    marginBottom: 8,
  },
  modalItem: { paddingVertical: 10 },
  modalText: { fontWeight: '600' },
});
