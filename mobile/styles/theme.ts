import { useColorScheme } from '@/hooks/use-color-scheme';

const palette = {
  dark: {
    bg: '#0b0f14',
    surface: '#111827',
    surfaceAlt: '#0f172a',
    border: '#1f2937',
    text: '#f8fafc',
    muted: '#94a3b8',
    accent: '#38bdf8',
    accentSoft: '#0b1220',
    success: '#22c55e',
    danger: '#f87171',
  },
  light: {
    bg: '#f5f7fb',
    surface: '#ffffff',
    surfaceAlt: '#f0f4f8',
    border: '#e2e8f0',
    text: '#0f172a',
    muted: '#64748b',
    accent: '#0284c7',
    accentSoft: '#e0f2fe',
    success: '#16a34a',
    danger: '#dc2626',
  },
};

export function useTheme() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? palette.dark : palette.light;
  return { colors, scheme };
}

export const radius = {
  sm: 10,
  md: 12,
  lg: 18,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
};
