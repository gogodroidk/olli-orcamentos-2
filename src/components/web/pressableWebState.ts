import { PressableStateCallbackType } from 'react-native';

/**
 * `react-native-web` injeta `hovered` E `focused` no callback de `style` do
 * `Pressable` (ver node_modules/react-native-web/.../Pressable/index.js —
 * `interactionState = { hovered, focused, pressed }`), mas os tipos oficiais
 * do react-native (`PressableStateCallbackType`) só declaram `pressed`,
 * porque hover/focus-visível não existem da mesma forma no nativo. Helper de
 * tipo só para o kit desktop (web-only): usar `(state: PressableWebState) =>
 * ...` no lugar de `PressableStateCallbackType` quando o style-function
 * precisar de `hovered` e/ou `focused` (navegação por teclado — Tab).
 */
export type PressableWebState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };
