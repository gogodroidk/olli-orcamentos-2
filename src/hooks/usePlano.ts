import { useCallback, useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  getPlanoAtual,
  getUsosIaRestantes,
  consumirUsoIa as consumirUsoIaStorage,
  temAcessoRecurso,
  getPlanoCacheado,
  IA_USOS_GRATIS_MES,
  type PlanoId,
  type Recurso,
} from '../services/planos';

/**
 * usePlano — fonte única de verdade do plano na UI (Onda 1).
 *
 * Contrato consumido pela frente 3 (aplicar gates nas telas):
 *   { plano, carregando, temAcesso, usosIaRestantes, consumirUsoIa }
 *
 * Desenho: um store leve em nível de módulo (sem Provider, para não precisar
 * mexer em App.tsx) guarda o último plano/cota conhecidos e uma lista de
 * ouvintes. Todos os componentes que usam o hook compartilham esse estado e
 * revalidam juntos — evita N leituras concorrentes do Supabase e mantém o
 * contador de IA coerente entre telas (voz, chat, diagnóstico).
 *
 * Revalidação: no primeiro mount (quando ainda não há dado) e sempre que o app
 * volta ao primeiro plano (AppState 'active') — cobre a volta do checkout
 * Stripe. Telas que queiram forçar (ex.: PlanosScreen) podem chamar recarregar().
 */

type PlanoRecurso = Recurso;

interface EstadoPlano {
  plano: PlanoId;
  usosIaRestantes: number;
  carregando: boolean;
  /** epoch ms da última revalidação bem-sucedida (0 = nunca). */
  atualizadoEm: number;
}

// Estado inicial: assume Grátis com a cota cheia até a primeira leitura real.
// `carregando: true` sinaliza para a UI mostrar skeleton/placeholder no primeiro
// carregamento, sem piscar "Grátis" para quem paga.
let estado: EstadoPlano = {
  plano: 'gratis',
  usosIaRestantes: IA_USOS_GRATIS_MES,
  carregando: true,
  atualizadoEm: 0,
};

const ouvintes = new Set<(e: EstadoPlano) => void>();

function emitir(): void {
  for (const l of ouvintes) l(estado);
}

function definir(parcial: Partial<EstadoPlano>): void {
  estado = { ...estado, ...parcial };
  emitir();
}

// Evita revalidações concorrentes: se já há uma leitura em andamento,
// reutiliza a mesma Promise em vez de disparar outra.
let leituraEmAndamento: Promise<void> | null = null;

/**
 * Relê plano + cota de IA da fonte de verdade e propaga a todos os ouvintes.
 * Nunca lança, e NUNCA invalida o cache local: getPlanoAtual() já prioriza a
 * rede e só cai no cache em falha (é a janela de graça de 7 dias) — invalidar
 * aqui rebaixaria um assinante offline a "grátis" sem necessidade.
 */
async function revalidar(): Promise<void> {
  if (leituraEmAndamento) return leituraEmAndamento;

  leituraEmAndamento = (async () => {
    // Cold start: semeia com o plano do cache local ANTES da leitura de rede,
    // para não piscar o muro Pro (nem "3 de 3 usos") para quem paga.
    if (estado.atualizadoEm === 0) {
      const cacheado = await getPlanoCacheado();
      if (cacheado && cacheado !== estado.plano) definir({ plano: cacheado });
    }
    definir({ carregando: true });
    try {
      const { plano } = await getPlanoAtual();
      const usos = await getUsosIaRestantes(plano);
      definir({ plano, usosIaRestantes: usos, carregando: false, atualizadoEm: Date.now() });
    } catch {
      // getPlanoAtual/getUsosIaRestantes já são à prova de falha; se algo
      // escapar, apenas encerramos o carregando mantendo o último estado bom.
      definir({ carregando: false });
    } finally {
      leituraEmAndamento = null;
    }
  })();

  return leituraEmAndamento;
}

// Revalida quando o app volta do background (ex.: retorno do checkout no
// navegador). Um único listener por processo, compartilhado por todos os hooks.
let appStateInscrito = false;
function garantirAppStateListener(): void {
  if (appStateInscrito) return;
  appStateInscrito = true;
  AppState.addEventListener('change', (s: AppStateStatus) => {
    if (s === 'active') void revalidar();
  });
}

export interface UsePlano {
  /** Plano efetivo do usuário. */
  plano: PlanoId;
  /** `true` enquanto a primeira leitura real ainda não chegou. */
  carregando: boolean;
  /**
   * Atalho de conveniência: `true` quando o usuário tem QUALQUER plano pago
   * (pro OU empresa) — ou seja, desbloqueia os recursos do Pro. Empresa é
   * superconjunto do Pro, então também conta. Para checar um recurso específico
   * prefira `temAcesso(recurso)`; este booleano existe para os gates simples de
   * "é pago?" das telas (Home, Relatórios).
   */
  ehPro: boolean;
  /** `true` se o plano atual libera o `recurso` (ver RECURSOS_POR_PLANO). */
  temAcesso: (recurso: PlanoRecurso) => boolean;
  /** Usos de IA restantes no mês. `Infinity` em planos com IA ilimitada. */
  usosIaRestantes: number;
  /** Registra 1 uso de IA e atualiza a cota exibida. No-op em plano ilimitado. */
  consumirUsoIa: () => Promise<void>;
  /** Força uma releitura de plano + cota (invalida cache). Útil ao voltar do checkout. */
  recarregar: () => Promise<void>;
}

export function usePlano(): UsePlano {
  const [snap, setSnap] = useState<EstadoPlano>(estado);

  useEffect(() => {
    const ouvinte = (e: EstadoPlano) => setSnap(e);
    ouvintes.add(ouvinte);
    garantirAppStateListener();

    // Sincroniza com o estado atual do store (pode ter mudado entre o
    // useState inicial e este efeito) e dispara a primeira leitura real.
    setSnap(estado);
    if (estado.atualizadoEm === 0) void revalidar();

    return () => {
      ouvintes.delete(ouvinte);
    };
  }, []);

  const temAcesso = useCallback(
    (recurso: PlanoRecurso) => temAcessoRecurso(snap.plano, recurso),
    [snap.plano],
  );

  const consumirUsoIa = useCallback(async () => {
    // Plano com IA ilimitada não tem cota para consumir.
    if (temAcessoRecurso(estado.plano, 'ia_ilimitada')) return;
    await consumirUsoIaStorage();
    const usos = await getUsosIaRestantes(estado.plano);
    definir({ usosIaRestantes: usos });
  }, []);

  const recarregar = useCallback(() => revalidar(), []);

  return {
    plano: snap.plano,
    carregando: snap.carregando,
    ehPro: snap.plano !== 'gratis',
    temAcesso,
    usosIaRestantes: snap.usosIaRestantes,
    consumirUsoIa,
    recarregar,
  };
}
