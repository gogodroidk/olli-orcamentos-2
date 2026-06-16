import { MD3DarkTheme } from 'react-native-paper';
import { Fonts } from './fonts';

/**
 * Tema ESCURO "cockpit" — do design handoff OLLI.
 * O app é escuro; documentos (PDF) e o link do cliente são claros (à parte).
 */
export const Colors = {
  // Marca
  primary: '#0B6FCE',          // Azul OLLI
  primaryLight: '#3B8FE0',
  primaryDark: '#0A2540',      // Azul profundo (ink)
  primaryContainer: 'rgba(11,111,206,0.16)',
  primaryContainerText: '#9FD1F5',
  accent: '#34C6D9',           // Ciano frost (ações, IA, destaques)
  accentLight: '#7FE9F5',
  accentContainer: 'rgba(52,198,217,0.15)',
  secondary: '#34C6D9',
  secondaryContainer: 'rgba(52,198,217,0.15)',

  // Status
  success: '#2BD787',
  successLight: 'rgba(43,215,135,0.16)',
  danger: '#FF6B6B',
  dangerLight: 'rgba(255,107,107,0.16)',
  warning: '#F7B23B',
  warningLight: 'rgba(247,178,59,0.16)',

  // Superfícies (cockpit escuro)
  background: '#0A1626',       // fundo do app
  surface: '#101F33',          // cards (≈ branco 5% sobre o bg)
  surfaceVariant: '#0C1B2E',   // barras (tab/header bg)
  surfaceElevated: '#13243C',
  card: '#101F33',

  // Texto
  onPrimary: '#FFFFFF',
  onBackground: '#FFFFFF',
  onSurface: '#FFFFFF',
  onSurfaceVariant: 'rgba(226,232,240,0.62)',
  onSurfaceMuted: 'rgba(226,232,240,0.40)',

  // Bordas (hairlines claras sobre escuro)
  outline: 'rgba(255,255,255,0.08)',
  outlineDark: 'rgba(255,255,255,0.14)',

  // Tabs
  tabInactive: 'rgba(226,232,240,0.45)',
  tabActive: '#34C6D9',

  // PDF / documento (tema CLARO — usado só no PDF/link, não no app)
  pdfSectionBg: '#0A2540',
  pdfColumnHeaderBg: '#13385F',
  pdfTotalBarBg: '#0A2540',
  pdfApproveGreen: '#15B66E',
  pdfRejectRed: '#F25555',
  pdfCardBg: '#F4F7FB',
  pdfBorderColor: '#E2E8F0',
};

// Gradientes da marca
export const Gradients = {
  primary: ['#1486E6', '#0B6FCE', '#0A2540'] as const,
  primaryDiagonal: ['#0B6FCE', '#34C6D9'] as const,
  brand: ['#0B6FCE', '#34C6D9'] as const,
  frost: ['#34C6D9', '#7FE9F5'] as const,
  success: ['#2BD787', '#15B66E'] as const,
  header: ['#0E2742', '#0A1626'] as const,
  card: ['#13243C', '#0C1B2E'] as const,
  dark: ['#0E2742', '#0A1626'] as const,
  cockpit: ['#0C1B2E', '#0A1626'] as const,
  surface: ['#13243C', '#101F33'] as const,
};

export const AppTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: Colors.primary,
    primaryContainer: Colors.primaryContainer,
    secondary: Colors.accent,
    secondaryContainer: Colors.accentContainer,
    background: Colors.background,
    surface: Colors.surface,
    surfaceVariant: Colors.surfaceVariant,
    error: Colors.danger,
    onPrimary: Colors.onPrimary,
    onBackground: Colors.onBackground,
    onSurface: Colors.onSurface,
    outline: Colors.outline,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const BorderRadius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  full: 999,
};

export const Typography = {
  h1: { fontSize: 28, fontFamily: Fonts.extraBold, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontFamily: Fonts.bold, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontFamily: Fonts.semiBold },
  h4: { fontSize: 16, fontFamily: Fonts.semiBold },
  body: { fontSize: 14, fontFamily: Fonts.regular },
  bodySmall: { fontSize: 13, fontFamily: Fonts.regular },
  caption: { fontSize: 12, fontFamily: Fonts.regular },
  label: { fontSize: 11, fontFamily: Fonts.extraBold, letterSpacing: 1.2 },
  button: { fontSize: 15, fontFamily: Fonts.bold },
};

// Sombras escuras (cockpit)
export const Shadow = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 16, elevation: 6 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.38, shadowRadius: 28, elevation: 10 },
};
