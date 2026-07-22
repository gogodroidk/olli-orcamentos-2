/**
 * Os ouvintes de verdade do religamento de sync. A REGRA de quando disparar
 * mora em `religarSync.ts` (puro, testado); aqui só ficam os eventos da
 * plataforma, que precisam de `react-native` e por isso não podem morar junto
 * — o `node` do gate não parseia a sintaxe Flow do RN.
 */
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { criarReligador } from './religarSync';

/**
 * Liga os gatilhos. Chamado uma vez no boot (App.tsx).
 * Devolve o cancelamento, no formato que o `useEffect` espera.
 */
export function iniciarReligarSync(sincronizar: () => Promise<void>): () => void {
  const religador = criarReligador({ sincronizar, agora: () => Date.now() });

  const assinaturaAppState = AppState.addEventListener('change', (estado: AppStateStatus) => {
    if (estado === 'active') religador.aoReligar();
  });

  // No web, `AppState` existe mas 'active'/'background' seguem a visibilidade da
  // aba, o que já ajuda; o evento 'online' é o sinal DIRETO de rede voltando e
  // não tem equivalente no nativo sem dependência nova.
  let removerOnline: (() => void) | undefined;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const aoVoltarARede = () => religador.aoReligar();
    window.addEventListener('online', aoVoltarARede);
    removerOnline = () => window.removeEventListener('online', aoVoltarARede);
  }

  return () => {
    assinaturaAppState.remove();
    removerOnline?.();
  };
}
