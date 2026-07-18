import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { Fonts } from './fonts';
import { criarGradientes, criarPaleta, criarSombras, COR_MARCA_PADRAO, type Cores, type ModoTema } from './cores';

export { Fonts };
export * from './cores';
export { TemaProvider, useTema, useCores, useGradientes, useEstilos } from './TemaProvider';

/**
 * `Colors` — paleta ESTÁTICA do modo CLARO (o padrão do app).
 *
 * COMPATIBILIDADE, NÃO FONTE DE VERDADE. Setenta arquivos ainda fazem
 * `StyleSheet.create` no escopo do módulo, e isso congela a cor no import: nem
 * remontar a árvore reexecuta aquela linha. Enquanto a migração para `useCores()`
 * não termina, este objeto mantém esses arquivos compilando e coerentes no modo
 * claro — e só nele.
 *
 * NÃO use em código novo. Use `useCores()`; para estilos, `useEstilos(criarEstilos)`.
 * O modo escuro só alcança um arquivo depois que ele migra.
 */
export const Colors: Cores = criarPaleta('claro', COR_MARCA_PADRAO);

/** Idem: gradientes estáticos do modo claro. Em código novo, `useGradientes()`. */
export const Gradients = criarGradientes('claro', COR_MARCA_PADRAO);

/** Paleta legada do handoff (cockpit escuro), preservada para referência de design. */
export const CoresCockpitLegado = {
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

// Gradientes do handoff escuro (referência; use `useGradientes()`).
const GradientesCockpitLegado = {
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

/**
 * Tema do react-native-paper derivado da nossa paleta. O PaperProvider precisa do
 * tema CERTO por modo: usar MD3DarkTheme com cores claras deixaria os componentes
 * internos do Paper (ripple, menu, snackbar) com o contraste invertido.
 */
export function criarAppTheme(modo: ModoTema, cores: Cores) {
  const base = modo === 'escuro' ? MD3DarkTheme : MD3LightTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: cores.primary,
      primaryContainer: cores.primaryContainer,
      secondary: cores.accent,
      secondaryContainer: cores.accentContainer,
      background: cores.background,
      surface: cores.surface,
      surfaceVariant: cores.surfaceVariant,
      error: cores.danger,
      onPrimary: cores.onPrimary,
      onBackground: cores.onBackground,
      onSurface: cores.onSurface,
      outline: cores.outline,
    },
  };
}

/** Legado: tema claro estático. Em código novo use `criarAppTheme(modo, cores)`. */
export const AppTheme = criarAppTheme('claro', Colors);

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

/**
 * RAIO — alinhado à escala de 6 degraus da landing
 * (`web/src/styles/global.css:63-68`: fio 4 · campo 12 · acao 16 · cartao 20 ·
 * caixa 28 · bloco 36 · pílula). Os NOMES daqui não mudam — 610 chamadas em 92
 * arquivos dependem deles, e renomear token é trabalho de outro cluster. O que
 * mudou foram os VALORES, cada um caindo num degrau que a landing já usa de
 * verdade (contado em `web/src/`: cartao 13× · acao 12× · campo 8× · caixa 4×
 * · bloco 4× · full 28×).
 *
 * A direção é DESCENDO, e isso é de propósito. A landing avisa no próprio
 * comentário que fonte redonda e raio alto SOMAM, e nesta mesma onda o app
 * acabou de trocar Plus Jakarta por Rubik — que já tem canto de haste
 * arredondado. Manter o raio antigo com a letra nova empilharia as duas coisas
 * e levaria o app pro "infantil" que um profissional não pode mostrar ao
 * cliente dele. Descer o raio é o que paga a letra mais redonda.
 *
 *   token   antes → agora   degrau da landing   usos
 *   sm       12  →  12      campo               45
 *   chip     14  →  16      acao                31
 *   md       18  →  16      acao               182
 *   lg       24  →  20      cartao             145
 *   xl       30  →  28      caixa               48
 *   xxl      36  →  36      bloco                0
 *   full    999  → 999      pílula             159
 *
 * DUAS COISAS QUE NÃO CONVERGIRAM, e o porquê:
 *
 * 1. `lg` para em 20, não em 16. A landing dá 16 (`acao`) ao botão e 20
 *    (`cartao`) ao cartão — dois valores. No app os dois LEEM O MESMO TOKEN
 *    (`OlliButton.tsx` e `OlliCard.tsx`, ambos `BorderRadius.lg`), então um
 *    número tem de servir aos dois. Escolhi o do cartão: são 145 usos, a maioria
 *    superfície, e um botão de 50px de altura com raio 16 (32%) começa a ler
 *    como caixa de formulário de desktop — o que num alvo tocado com luva e sol
 *    na tela custa afordância. Em 20 (40%) a silhueta continua obviamente
 *    tocável. Separar os dois exige editar OlliButton/OlliCard, que são de outro
 *    cluster; quando isso acontecer, o botão pode descer para `chip`/16 sozinho.
 *
 * 2. `chip` e `md` empatam em 16 — e isso não é descuido. A própria landing põe
 *    os dois no mesmo degrau: `--radius-acao` é literalmente "botão de ação
 *    (~44–52px), chip de ícone 44×44". Os nomes seguem separados para que uma
 *    onda futura possa afastá-los sem caçar 213 chamadas.
 *
 * NENHUM raio aqui encolhe área de toque: raio é forma, não caixa. Os alvos
 * continuam com a mesma altura e largura que tinham.
 */
export const BorderRadius = {
  /** Trilho/barra de 4–8px de altura (landing: `--radius-fio`). Sem consumidor
   *  ainda — existe para os 15 `borderRadius: 4` literais migrarem para cá. */
  fio: 4,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
  full: 999,
  // Chip de ícone: caixa ~36-48px com ícone dentro (avatares/badges pequenos)
  chip: 16,
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

// `criarSombras` vive em cores.ts (módulo folha) e é reexportada por `export * from './cores'`.
/** Legado: sombras do modo claro. Em código novo use `criarSombras(modo, cores)`. */
export const Shadow = criarSombras('claro', Colors);

// Sombras do handoff escuro (referência).
const SombrasCockpitLegado = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 16, elevation: 6 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.38, shadowRadius: 28, elevation: 10 },
  // Brilhos premium da marca
  glowCyan: { shadowColor: '#34C6D9', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 8 },
  glowBlue: { shadowColor: '#0B6FCE', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 8 },
  focusRing: { shadowColor: '#7FE9F5', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 },
};

// Referências de design; não são consumidas pelo app.
void CoresCockpitLegado; void GradientesCockpitLegado; void SombrasCockpitLegado;
