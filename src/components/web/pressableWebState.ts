import { PressableStateCallbackType } from 'react-native';

/**
 * `react-native-web` injeta `hovered` no callback de `style` do `Pressable`
 * (ver node_modules/react-native-web/.../Pressable — prop `hovered` no state),
 * mas os tipos oficiais do react-native (`PressableStateCallbackType`) não o
 * declaram porque hover não existe no nativo. Helper de tipo só para o kit
 * desktop (web-only): usar `(state: PressableWebState) => ...` no lugar de
 * `PressableStateCallbackType` quando o style-function precisar de `hovered`.
 */
export type PressableWebState = PressableStateCallbackType & { hovered?: boolean };
