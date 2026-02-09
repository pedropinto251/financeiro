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
import { useAuth } from './_layout';
import { apiCreateCategory, apiDeleteCategory, apiGetCategories, apiUpdateCategory, Category } from '@/lib/api';
import AppShell from '@/components/AppShell';
import { useTheme, radius, shadow } from '@/styles/theme';

export default function CategoriesScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [editing, setEditing] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionCat, setActionCat] = useState<Category | null>(null);

  const load = async () => {
    if (!token) return;
    const data = await apiGetCategories(token);
    setCategories(data);
  };

  useEffect(() => {
    load();
  }, [token]);

  const grouped = useMemo(() => {
    const expenses = categories.filter((c) => c.tipo === 'expense');
    const incomes = categories.filter((c) => c.tipo === 'income');
    return { expenses, incomes };
  }, [categories]);

  const handleSave = async () => {
    if (!token) return;
    if (!name.trim()) {
      Alert.alert('Erro', 'Preenche o nome.');
      return;
    }
    try {
      if (editing) {
        await apiUpdateCategory(token, editing.id, { name: name.trim(), type });
      } else {
        await apiCreateCategory(token, { name: name.trim(), type });
      }
      setName('');
      setType('expense');
      setEditing(null);
      await load();
    } catch {
      Alert.alert('Erro', 'Nao foi possivel guardar.');
    }
  };

  const handleEdit = (c: Category) => {
    setEditing(c);
    setName(c.nome);
    setType(c.tipo);
    setFormOpen(true);
  };

  const handleDelete = (c: Category) => {
    if (!token) return;
    Alert.alert('Apagar', 'Queres apagar esta categoria?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          await apiDeleteCategory(token, c.id);
          await load();
        },
      },
    ]);
  };

  return (
    <AppShell title="Categorias">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: 120 }]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
        >
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Categorias</Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.accent }]}
              onPress={() => {
                setEditing(null);
                setName('');
                setType('expense');
                setFormOpen(true);
              }}
            >
              <Text style={[styles.buttonText, { color: colors.bg }]}>Adicionar categoria</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Despesas</Text>
            {grouped.expenses.map((c) => (
              <View key={c.id} style={[styles.row, { borderBottomColor: colors.border }]}> 
                <Text style={[styles.rowText, { color: colors.text }]}>{c.nome}</Text>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={[styles.kebab, { borderColor: colors.border }]} onPress={() => { setActionCat(c); setActionOpen(true); }}>
                    <Text style={[styles.kebabText, { color: colors.text }]}>⋯</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Receitas</Text>
            {grouped.incomes.map((c) => (
              <View key={c.id} style={[styles.row, { borderBottomColor: colors.border }]}> 
                <Text style={[styles.rowText, { color: colors.text }]}>{c.nome}</Text>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={[styles.kebab, { borderColor: colors.border }]} onPress={() => { setActionCat(c); setActionOpen(true); }}>
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
            <Text style={[styles.cardTitle, { color: colors.text }]}>{editing ? 'Editar categoria' : 'Nova categoria'}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]}
              placeholder="Nome"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
            />
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
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.accent }]}
              onPress={async () => {
                await handleSave();
                setFormOpen(false);
              }}
            >
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
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                if (actionCat) handleEdit(actionCat);
                setActionOpen(false);
              }}
            >
              <Text style={[styles.actionText, { color: colors.text }]}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                if (actionCat) handleDelete(actionCat);
                setActionOpen(false);
              }}
            >
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
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeBtn: {
    flex: 1,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeText: { fontWeight: '600' },
  button: { padding: 14, borderRadius: radius.md, alignItems: 'center' },
  buttonText: { fontWeight: '700' },
  secondary: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryText: { fontWeight: '600' },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowText: { fontWeight: '600' },
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
});
