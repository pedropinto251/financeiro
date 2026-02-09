import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AppShell from '@/components/AppShell';
import { useAuth } from './_layout';
import { apiShareFinance } from '@/lib/api';
import { useTheme, radius, shadow } from '@/styles/theme';

export default function ShareScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleShare = async () => {
    if (!token) return;
    if (!email.trim()) {
      Alert.alert('Erro', 'Indica um email.');
      return;
    }
    try {
      setLoading(true);
      await apiShareFinance(token, email.trim().toLowerCase());
      setEmail('');
      Alert.alert('Sucesso', 'Partilha criada.');
    } catch (err: any) {
      const code = String(err?.message || 'erro');
      const message = code === 'missing_email'
        ? 'Indica um email.'
        : code === 'self'
        ? 'Nao podes partilhar contigo proprio.'
        : code === 'user_missing'
        ? 'Utilizador nao encontrado.'
        : code === 'owner'
        ? 'Esse utilizador ja pertence ao grupo.'
        : 'Nao foi possivel partilhar.';
      Alert.alert('Erro', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title="Partilhar">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={[styles.scroll, { paddingBottom: 120 }]} keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag">
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.cardTitle, { color: colors.text }]}>Partilhar finanças</Text>
            <Text style={[styles.muted, { color: colors.muted }]}>Convida um utilizador existente pelo email.</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={handleShare} disabled={loading}>
              <Text style={[styles.buttonText, { color: colors.bg }]}>{loading ? 'A partilhar...' : 'Partilhar'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  cardTitle: { fontWeight: '700', fontSize: 16, marginBottom: 8 },
  muted: { marginBottom: 12 },
  input: {
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  button: { padding: 14, borderRadius: radius.md, alignItems: 'center' },
  buttonText: { fontWeight: '700' },
});
