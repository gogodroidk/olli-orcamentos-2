import { useCallback, useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  getPlanoAtual,
  getUsosIaRestantes,
  consumirUsoIa as consumirUsoIaStorage,
  temAcessoRecurso,
  estadoAcessoRecurso,
  planoConfirmado,
  getPlanoCacheado,
  IA_USOS_GRATIS_MES,
  type EstadoAcessoRecurso,
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
  /** Plano da empresa (membro de equipe) — só para `RECURSOS_DO_TENANT`. */
  planoTenant?: PlanoId;
  usosIaRestantes: number;
  carregando: boolean;
  /**
   * `true` quando o plano veio do servidor ou do cache da MESMA conta (ou não há
   * sessão — deslogado é Grátis de verdade). `false` = a leitura falhou: o plano
   * em memória é o piso "gratis", não um fato. É o que separa "não tem" de "não sei".
   */
  confirmado: boolean;
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
  confirmado: false,
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
let revisaoSessao = 0;

function estadoInicial(): EstadoPlano {
  return {
    plano: 'gratis',
    usosIaRestantes: IA_USOS_GRATIS_MES,
    carregando: true,
    confirmado: false,
    atualizadoEm: 0,
  };
}

/**
 * Invalida todo estado em memória na troca de sessão. A revisão impede que uma
 * leitura iniciada pela conta anterior termine depois do logout e republique o
 * plano antigo para a conta nova.
 */
export function resetarPlano(): void {
  revisaoSessao += 1;
  leituraEmAndamento = null;
  estado = estadoInicial();
  emitir();
}

/**
 * Relê plano + cota de IA da fonte de verdade e propaga a todos os ouvintes.
 * Nunca lança, e NUNCA invalida o cache local: getPlanoAtual() já prioriza a
 * rede e só cai no cache em falha (é a janela de graça de 7 dias) — invalidar
 * aqui rebaixaria um assinante offline a "grátis" sem necessidade.
 */
async function revalidar(): Promise<void> {
  if (leituraEmAndamento) return leituraEmAndamento;

  const minhaRevisao = revisaoSessao;
  const execucao = (async () => {
    // Cold start: semeia com o plano do cache local ANTES da leitura de rede,
    // para não piscar o muro Pro (nem "3 de 3 usos") para quem paga.
    if (estado.atualizadoEm === 0) {
      const cacheado = await getPlanoCacheado();
      if (minhaRevisao !== revisaoSessao) return;
      if (cacheado && cacheado !== estado.plano) definir({ plano: cacheado });
    }
    if (minhaRevisao !== revisaoSessao) return;
    definir({ carregando: true });
    try {
      const { plano, fonte, planoTenant } = await getPlanoAtual();
      const usos = await getUsosIaRestantes(plano);
      if (minhaRevisao !== revisaoSessao) return;
      const confirmado = planoConfirmado(fonte);
      definir({ plano, planoTenant, usosIaRestantes: usos, carregando: false, confirmado, atualizadoEm: Date.now() });
    } catch {
      // getPlanoAtual/getUsosIaRestantes já são à prova de falha; se algo
      // escapar, apenas encerramos o carregando mantendo o último estado bom.
      if (minhaRevisao === revisaoSessao) definir({ carregando: false, confirmado: false });
    }
  })();
  leituraEmAndamento = execucao;

  try {
    await execucao;
  } finally {
    if (leituraEmAndamento === execucao) leituraEmAndamento = null;
  }
}

/** Revalidação global usada pelo listener central depois de um novo login. */
export function recarregarPlanoGlobal(): Promise<void> {
  return revalidar();
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
  /** `false` = a última leitura do plano falhou (o "gratis" em memória é piso, não fato). */
  confirmado: boolean;
  /**
   * Estado do recurso para a TELA, com os 3 estados de verdade (carregando /
   * indeterminado / bloqueado, além de liberado e em breve). Use isto — e não
   * `temAcesso` — para decidir entre mostrar o recurso, o "Disponível no Pro" ou
   * o "não consegui confirmar seu plano". Regra pura em `entitlements.ts`.
   */
  estadoRecurso: (recurso: PlanoRecurso) => EstadoAcessoRecurso;
  /** Usos de IA restantes no mês. `Infinity` em planos com IA ilimitada. */
  usosIaRestantes: number;
  /** Atualiza a cota otimista e a reconcilia com o servidor. No-op no ilimitado. */
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

  // "Carregando" só conta na PRIMEIRA leitura: a revalidação de quando o app volta
  // ao primeiro plano não pode piscar o muro em skeleton a cada foco — o último
  // estado confirmado continua valendo até a nova leitura chegar.
  const primeiraLeitura = snap.carregando && snap.atualizadoEm === 0;
  const estadoRecurso = useCallback(
    (recurso: PlanoRecurso) =>
      estadoAcessoRecurso(
        { plano: snap.plano, planoTenant: snap.planoTenant, carregando: primeiraLeitura, confirmado: snap.confirmado },
        recurso,
      ),
    [snap.plano, snap.planoTenant, primeiraLeitura, snap.confirmado],
  );

  const consumirUsoIa = useCallback(async () => {
    // Plano com IA ilimitada não tem cota para consumir.
    if (temAcessoRecurso(estado.plano, 'ia_ilimitada')) return;
    const usosLocais = await consumirUsoIaStorage();
    // Atualização otimista: evita mostrar o mesmo número enquanto a linha que o
    // Worker acabou de gravar chega à leitura. Em seguida a autoridade remota
    // corrige qualquer divergência (outro aparelho, retry idempotente, crédito).
    definir({ usosIaRestantes: Math.max(0, IA_USOS_GRATIS_MES - usosLocais) });
    await revalidar();
  }, []);

  const recarregar = useCallback(() => revalidar(), []);

  return {
    plano: snap.plano,
    carregando: snap.carregando,
    ehPro: snap.plano !== 'gratis',
    temAcesso,
    confirmado: snap.confirmado,
    estadoRecurso,
    usosIaRestantes: snap.usosIaRestantes,
    consumirUsoIa,
    recarregar,
  };
}
