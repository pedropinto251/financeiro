import React, { ReactNode, useMemo, useState } from 'react';
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme, radius, shadow } from '@/styles/theme';

const MAIN_ITEMS = [
  { label: 'Dashboard', href: '/home', icon: 'home' },
  { label: 'Movimentos', href: '/movements', icon: 'exchange' },
  { label: 'Categorias', href: '/categories', icon: 'tags' },
  { label: 'Budgets', href: '/budgets', icon: 'bullseye' },
  { label: 'Objetivos', href: '/goals', icon: 'flag' },
  { label: 'Menu', href: '/menu', icon: 'bars', isMenu: true },
];

const MENU_ITEMS = [
  { label: 'Dashboard', href: '/home', icon: 'home' },
  { label: 'Movimentos', href: '/movements', icon: 'exchange' },
  { label: 'Categorias', href: '/categories', icon: 'tags' },
  { label: 'Budgets', href: '/budgets', icon: 'bullseye' },
  { label: 'Objetivos', href: '/goals', icon: 'flag' },
  { label: 'Partilhar', href: '/share', icon: 'share-alt' },
];

export default function AppShell({ children }: { title?: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const activeHref = useMemo(() => {
    const item = MAIN_ITEMS.find((i) => i.href === pathname);
    if (item) return item.href;
    const m = MENU_ITEMS.find((i) => i.href === pathname);
    return m?.href || '/home';
  }, [pathname]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.content}>{children}</View>

      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
        {MAIN_ITEMS.map((item) => {
          const active = activeHref === item.href && !item.isMenu;
          return (
            <TouchableOpacity
              key={item.label}
              style={[styles.tabItem, active && { backgroundColor: colors.accentSoft }]}
              onPress={() => {
                if (item.isMenu) {
                  setMenuOpen(true);
                } else {
                  router.push(item.href);
                }
              }}
            >
              <FontAwesome name={item.icon as any} size={16} color={active ? colors.text : colors.muted} />
              <Text style={[styles.tabText, { color: active ? colors.text : colors.muted }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent>
        <View style={styles.menuBackdrop}>
          <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Text style={[styles.menuTitle, { color: colors.text }]}>Menu</Text>
            <ScrollView style={styles.menuList}>
              {MENU_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.href}
                  style={[styles.menuItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setMenuOpen(false);
                    router.push(item.href);
                  }}
                >
                  <View style={styles.menuRow}>
                    <FontAwesome name={item.icon as any} size={16} color={colors.text} />
                    <Text style={[styles.menuText, { color: colors.text }]}>{item.label}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.menuClose, { borderColor: colors.border }]} onPress={() => setMenuOpen(false)}>
              <Text style={[styles.menuCloseText, { color: colors.text }]}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingBottom: 90 },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 6,
    flexDirection: 'row',
    borderWidth: 1,
    ...shadow.card,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: 4,
  },
  tabText: { fontSize: 10, fontWeight: '600' },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  menuCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    ...shadow.card,
  },
  menuTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
  menuList: { maxHeight: 360 },
  menuItem: { paddingVertical: 12, borderBottomWidth: 1 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuText: { fontWeight: '600' },
  menuClose: { marginTop: 12, padding: 10, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  menuCloseText: { fontWeight: '600' },
});
