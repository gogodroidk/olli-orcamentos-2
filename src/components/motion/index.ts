/**
 * Fundação de motion (Reanimated 4, UI thread). Tokens em src/theme/motionTokens.ts.
 * Regras: só `transform`/`opacity`; todo componente respeita "Reduzir movimento";
 * nenhum loop infinito além do brilho do Skeleton (o PulsoAgora repete N vezes e para).
 */
export { PressableAnimado } from './PressableAnimado';
export { Aparecer } from './Aparecer';
export { ContadorAnimado } from './ContadorAnimado';
export { Skeleton } from './Skeleton';
export { PulsoAgora } from './PulsoAgora';
export { curvas } from './curvas';
export type { HapticKind } from './pressionavel';
