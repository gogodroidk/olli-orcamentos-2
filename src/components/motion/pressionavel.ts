import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { vibrar } from '../../utils/haptico';

/** Retorno tátil do toque. `false` = sem vibração. */
export type HapticKind = 'light' | 'medium' | 'selection' | false;

/**
 * Dispara o háptico pedido pelo helper único (src/utils/haptico.ts) — o mesmo
 * vocabulário que as telas usam para sucesso/erro/seleção. Nunca lança.
 */
export function dispararHaptico(kind: HapticKind): void {
  if (kind === false) return;
  vibrar(kind === 'light' ? 'leve' : kind === 'medium' ? 'medio' : 'selecao');
}

// Chaves que afetam o LAYOUT no container pai — precisam morar no Pressable
// externo (flex:1 numa row nao expande nada se ficar na view interna). O resto
// (fundo, padding, borda) fica na view animada para escalar junto no press.
const LAYOUT_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'display',
  'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'position', 'top', 'bottom', 'left', 'right', 'zIndex',
]);

/** Separa o estilo em parte de layout (nó externo) e parte visual (nó que escala). */
export function dividirStyle(style: StyleProp<ViewStyle>): { layoutStyle: ViewStyle; visualStyle: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const layoutStyle: Record<string, unknown> = {};
  const visualStyle: Record<string, unknown> = {};
  for (const k of Object.keys(flat)) {
    (LAYOUT_KEYS.has(k) ? layoutStyle : visualStyle)[k] = flat[k];
  }
  // altura/largura definem o tamanho do no externo; a view interna preenche.
  if ('height' in layoutStyle || 'minHeight' in layoutStyle) visualStyle['flex'] = 1;
  return { layoutStyle: layoutStyle as ViewStyle, visualStyle: visualStyle as ViewStyle };
}
