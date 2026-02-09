import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { apiLogin } from '@/lib/api';
import { useAuth } from './_layout';
import { useTheme, radius, shadow } from '@/styles/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { setToken } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erro', 'Preenche email e password.');
      return;
    }
    try {
      setLoading(true);
      const result = await apiLogin(email.trim(), password);
      setToken(result.token);
      router.replace('/home');
    } catch (err: any) {
      Alert.alert('Erro', 'Credenciais inválidas ou servidor indisponível.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}> 
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
        <Text style={[styles.title, { color: colors.text }]}>Financeiro</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Entrar</Text>

        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, color: colors.text }]}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={handleLogin} disabled={loading}>
          <Text style={[styles.buttonText, { color: colors.bg }]}>{loading ? 'A entrar...' : 'Entrar'}</Text>
        </TouchableOpacity>
        <Text style={[styles.note, { color: colors.muted }]}>Dev: usa o IP do PC em `EXPO_PUBLIC_API_URL`.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderRadius: radius.lg,
    padding: 24,
    borderWidth: 1,
    ...shadow.card,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 16,
  },
  input: {
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  button: {
    padding: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonText: {
    fontWeight: '700',
  },
  note: {
    fontSize: 12,
    marginTop: 10,
  },
});
