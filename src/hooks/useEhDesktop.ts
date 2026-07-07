import { Platform, useWindowDimensions } from 'react-native';

/**
 * Largura mínima (em px CSS) para o app entrar no modo desktop (plataforma web).
 * Abaixo disso, na web, permanece EXATAMENTE o layout mobile atual (o mesmo
 * código do APK, com o frame de 430px centrado). Decisão firme da PLANTA v4.
 */
export const DESKTOP_BREAKPOINT = 1024;

/**
 * `true` somente quando estamos na WEB e a janela tem largura ≥ 1024px.
 *
 * Regra de ouro da v4: no nativo (Android/iOS) isto é SEMPRE `false` — o
 * `Platform.OS === 'web'` blinda o build do APK contra qualquer código desktop.
 * Reage ao redimensionamento da janela via `useWindowDimensions` (o layout troca
 * na hora ao cruzar 1024px); o mapa de URL do linking, porém, é resolvido uma
 * única vez no boot — limitação aceita e documentada (F5 resolve com refresh).
 */
export function useEhDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}
