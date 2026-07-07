import { MD3DarkTheme } from 'react-native-paper';
import { Fonts } from './fonts';

export { Fonts };

/**
 * Tema ESCURO "cockpit" — do design handoff OLLI.
 * O app é escuro; documentos (PDF) e o link do cliente são claros (à parte).
 */
export const Colors = {
  // Marca
  primary: '#0B6FCE',          // Azul OLLI
  primaryLight: '#3B8FE0',
  primaryDark: '#0A2547',      // Azul profundo (ink)
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
  background: '#07111F',       // fundo do app
  surface: '#102238',          // cards
  surfaceVariant: '#0D1A2C',   // barras (tab/header bg)
  surfaceElevated: '#16304D',
  surfaceGlass: 'rgba(22,48,77,0.72)',
  surfacePressed: 'rgba(52,198,217,0.10)',
  card: '#102238',

  // Texto
  onPrimary: '#FFFFFF',
  onBackground: '#FFFFFF',
  onSurface: '#FFFFFF',
  onSurfaceVariant: 'rgba(226,232,240,0.62)',
  onSurfaceMuted: 'rgba(226,232,240,0.40)',

  // Bordas (hairlines claras sobre escuro)
  outline: 'rgba(255,255,255,0.10)',
  outlineDark: 'rgba(255,255,255,0.18)',
  strokeGlow: 'rgba(127,233,245,0.24)',

  // Tabs
  tabInactive: 'rgba(226,232,240,0.45)',
  tabActive: '#34C6D9',

  // Acessórias da marca
  whatsapp: '#25D366',
  plan: '#7C3AED',
  voice: '#7C3AED',            // Roxo único para recursos de voz/IA (OLLI Voz, Diagnóstico IA, Chat)
  avatarLilac: '#A4B6F5',
  inkLight: '#16202E',

  // PDF / documento (tema CLARO — usado só no PDF/link, não no app)
  pdfSectionBg: '#0A2547',
  pdfColumnHeaderBg: '#13385F',
  pdfTotalBarBg: '#0A2547',
  pdfApproveGreen: '#15B66E',
  pdfRejectRed: '#F25555',
  pdfCardBg: '#F4F7FB',
  pdfBorderColor: '#E2E8F0',
};

// Gradientes da marca
export const Gradients = {
  primary: ['#0B6FCE', '#0A2547'] as const,
  primaryDiagonal: ['#0B6FCE', '#34C6D9'] as const,
  brand: ['#0B6FCE', '#34C6D9'] as const,
  frost: ['#34C6D9', '#7FE9F5'] as const,
  success: ['#2BD787', '#15B66E'] as const,
  progress: ['#0B6FCE', '#7FE9F5'] as const,
  liveCard: ['rgba(11,111,206,0.34)', 'rgba(52,198,217,0.07)'] as const,
  header: ['#12385D', '#07111F'] as const,
  card: ['#16304D', '#0D1A2C'] as const,
  dark: ['#102A47', '#07111F'] as const,
  cockpit: ['#0D1A2C', '#07111F'] as const,
  surface: ['#16304D', '#102238'] as const,
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
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  xxl: 36,
  full: 999,
};

export const Typography = {
  h1: { fontSize: 28, fontFamily: Fonts.extraBold, letterSpacing: 0 },
  h2: { fontSize: 22, fontFamily: Fonts.extraBold, letterSpacing: 0 },
  h3: { fontSize: 18, fontFamily: Fonts.extraBold },
  h4: { fontSize: 16, fontFamily: Fonts.semiBold },
  body: { fontSize: 14, fontFamily: Fonts.regular },
  bodySmall: { fontSize: 13, fontFamily: Fonts.regular },
  caption: { fontSize: 12, fontFamily: Fonts.regular },
  label: { fontSize: 11, fontFamily: Fonts.extraBold, letterSpacing: 0 },
  button: { fontSize: 15, fontFamily: Fonts.extraBold },
  // Valores em dinheiro / destaque (serifada Spectral)
  value: { fontFamily: Fonts.serifBold, fontSize: 24 },
  valueLarge: { fontFamily: Fonts.serifBold, fontSize: 30 },
  displaySerif: { fontFamily: Fonts.serifBold, fontSize: 26 },
};

// Sombras escuras (cockpit)
export const Shadow = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 16, elevation: 6 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.38, shadowRadius: 28, elevation: 10 },
  // Brilhos premium da marca
  glowCyan: { shadowColor: '#34C6D9', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 8 },
  glowBlue: { shadowColor: '#0B6FCE', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 8 },
  focusRing: { shadowColor: '#7FE9F5', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 },
};
