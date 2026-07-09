import { useCallback, useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { carregarMinhaOrganizacao, registrarAcesso, type Organizacao } from '../services/equipe';
import { sessaoAtiva } from '../services/supabase';

/**
 * useTipoConta — deriva o TIPO DE CONTA (pessoal vs empresa) a partir da
 * organização à qual o usuário pertence (Onda 2, frente "Convites + papéis").
 *
 * Contrato (consumido por usePermissao, EquipeScreen, ContaScreen, dashboards):
 *   { tipo: 'pessoal' | 'empresa', org?: {id,nome,papel}, carregando, recarregar }
 *
 * tipo é DERIVADO: 'empresa' se o usuário pertence a uma organização (é membro
 * ativo), senão 'pessoal'. Não há flag persistida — a fonte de verdade é a
 * tabela organizacao_membros sob RLS.
 *
 * Desenho: store leve em nível de módulo (mesmo padrão do usePlano — sem
 * Provider, para não mexer em App.tsx). Todos os componentes compartilham o
 * estado e revalidam juntos. Revalida no primeiro mount e quando o app volta ao
 * primeiro plano (cobre a volta do aceite de convite / criação de empresa).
 *
 * Registro de acesso: quando a primeira leitura confirma que o usuário É de uma
 * empresa, gravamos acessos_equipe('login') UMA vez por sessão do app (é o que
 * alimenta "ver todos os acessos" no dashboard). Best-effort, nunca bloqueia.
 */

export type TipoConta = 'pessoal' | 'empresa';

interface EstadoConta {
  tipo: TipoConta;
  org: Organizacao | null;
  carregando: boolean;
  /**
   * `true` quando o papel é CONHECIDO (por leitura bem-sucedida ou pelo cache do
   * último login). Enquanto for `false`, ninguém deve conceder permissão: `pessoal`
   * é o padrão do tipo, mas também é o papel mais permissivo, então um técnico
   * offline seria promovido a dono se tratássemos "não sei" como "pessoal".
   */
  resolvido: boolean;
  /** epoch ms da última revalidação (0 = nunca). */
  atualizadoEm: number;
}

let estado: EstadoConta = {
  tipo: 'pessoal',
  org: null,
  carregando: true,
  resolvido: false,
  atualizadoEm: 0,
};

// Cache do último papel CONHECIDO. Sem ele, o técnico que abre o app em campo (sem
// sinal) fica com papel indeterminado a sessão inteira — a leitura da organização é
// só rede, não tem fallback local.
//
// O cache guarda o `userId` DONO do papel e a hidratação só confia nele quando bate
// com a sessão atual. AsyncStorage sobrevive ao logout: sem esse vínculo, um
// aparelho compartilhado (técnico sai, dono entra) herdaria o papel do usuário
// anterior — restringindo o dono, ou pior, promovendo o técnico. Limpar no logout
// não bastaria: um crash entre o logout e a limpeza deixaria o cache órfão.
const CHAVE_CACHE = 'olli.tipoConta.v2';

interface CachePapel {
  userId: string;
  tipo: TipoConta;
  org: Organizacao | null;
}

async function persistir(userId: string, tipo: TipoConta, org: Organizacao | null): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_CACHE, JSON.stringify({ userId, tipo, org } satisfies CachePapel));
  } catch {
    // best-effort: sem cache o app só fica mais lento para resolver o papel.
  }
}

/**
 * Hidrata o papel do disco. Só aplica se ninguém já resolveu pela rede E se o cache
 * pertence ao usuário logado agora.
 *
 * Usa `sessaoAtiva()` (auth.getSession → AsyncStorage) e NÃO `getCurrentUser()`
 * (auth.getUser → chamada de REDE ao /auth/v1/user). Com getUser, a hidratação
 * falharia justamente offline — o único cenário em que este cache importa — e o
 * técnico em campo ficaria com o papel indeterminado a sessão inteira.
 */
async function hidratarDoCache(): Promise<void> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_CACHE);
    if (!bruto || estado.resolvido) return;
    const cache = JSON.parse(bruto) as CachePapel;
    if (cache.tipo !== 'pessoal' && cache.tipo !== 'empresa') return;

    const sessao = await sessaoAtiva();
    const userId = sessao?.user?.id;
    if (!userId || !cache.userId || cache.userId !== userId) return; // cache de outra conta

    definir({ tipo: cache.tipo, org: cache.org ?? null, resolvido: true });
  } catch {
    // cache corrompido: ignora e espera a rede.
  }
}

/** Esquece o papel em cache (chamado no logout e no wipe da conta). */
export async function limparCacheTipoConta(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CHAVE_CACHE);
  } catch {
    // best-effort — a checagem de `userId` na hidratação já protege o próximo login.
  }
}

/** Zera o estado em memória (logout). Sem isto o papel do usuário anterior persiste na sessão do app. */
export function resetarTipoConta(): void {
  acessoRegistradoParaOrg = null;
  definir({ tipo: 'pessoal', org: null, carregando: true, resolvido: false, atualizadoEm: 0 });
}

const ouvintes = new Set<(e: EstadoConta) => void>();

function emitir(): void {
  for (const l of ouvintes) l(estado);
}

function definir(parcial: Partial<EstadoConta>): void {
  estado = { ...estado, ...parcial };
  emitir();
}

// Evita revalidações concorrentes: reutiliza a Promise em voo.
let leituraEmAndamento: Promise<void> | null = null;

// Garante que o acesso 'login' seja registrado só uma vez por sessão do app,
// e só para a org efetivamente detectada (troca de org zera o controle).
let acessoRegistradoParaOrg: string | null = null;

async function revalidar(): Promise<void> {
  if (leituraEmAndamento) return leituraEmAndamento;

  leituraEmAndamento = (async () => {
    definir({ carregando: true });
    try {
      const r = await carregarMinhaOrganizacao();

      if (r.status === 'erro') {
        // Indeterminado (offline/servidor fora). NÃO degrada para 'pessoal' — isso
        // PROMOVERIA um técnico a dono. Mantém o último papel conhecido (cache ou
        // leitura anterior); se nunca resolvemos, `resolvido` segue false e quem
        // decide permissão nega. Ver usePermissao.
        definir({ carregando: false });
        return;
      }

      const org = r.org;
      const tipo: TipoConta = org ? 'empresa' : 'pessoal';
      definir({ tipo, org, carregando: false, resolvido: true, atualizadoEm: Date.now() });

      // Só persiste amarrado ao dono do papel (ver CHAVE_CACHE).
      void sessaoAtiva()
        .then((s) => (s?.user?.id ? persistir(s.user.id, tipo, org) : undefined))
        .catch(() => {});

      // Registro de acesso: 1x por sessão, ao confirmar que é empresa.
      if (org && acessoRegistradoParaOrg !== org.id) {
        acessoRegistradoParaOrg = org.id;
        void registrarAcesso(org.id, 'login');
      }
      if (!org) acessoRegistradoParaOrg = null;
    } catch {
      // Defensivo: carregarMinhaOrganizacao já é à prova de falha. Encerra o
      // carregando mantendo o último estado bom — nunca inventa um papel.
      definir({ carregando: false });
    } finally {
      leituraEmAndamento = null;
    }
  })();

  return leituraEmAndamento;
}

let appStateInscrito = false;
function garantirAppStateListener(): void {
  if (appStateInscrito) return;
  appStateInscrito = true;
  AppState.addEventListener('change', (s: AppStateStatus) => {
    if (s === 'active') void revalidar();
  });
}

export interface UseTipoConta {
  /** 'empresa' se o usuário pertence a uma organização; senão 'pessoal'. */
  tipo: TipoConta;
  /** A organização do usuário (com o seu papel) quando tipo==='empresa'. */
  org: Organizacao | null;
  /** `true` enquanto a primeira leitura real não chegou. */
  carregando: boolean;
  /** `true` quando o papel é conhecido (rede ou cache). Enquanto false, negue. */
  resolvido: boolean;
  /** Força uma releitura (ex.: após criar empresa / aceitar convite). */
  recarregar: () => Promise<void>;
}

export function useTipoConta(): UseTipoConta {
  const [snap, setSnap] = useState<EstadoConta>(estado);

  useEffect(() => {
    const ouvinte = (e: EstadoConta) => setSnap(e);
    ouvintes.add(ouvinte);
    garantirAppStateListener();

    setSnap(estado);
    if (estado.atualizadoEm === 0) {
      // Hidrata do cache ANTES da rede: no cold start offline do técnico, é a única
      // fonte do papel. A rede, quando responder, sobrescreve com a verdade.
      void hidratarDoCache().finally(() => revalidar());
    }

    return () => {
      ouvintes.delete(ouvinte);
    };
  }, []);

  const recarregar = useCallback(() => revalidar(), []);

  return {
    tipo: snap.tipo,
    org: snap.org,
    carregando: snap.carregando,
    resolvido: snap.resolvido,
    recarregar,
  };
}

/**
 * Força a revalidação do tipo de conta fora de um componente (ex.: logo após
 * criar a empresa ou aceitar um convite, para a UI refletir na hora). Reutiliza
 * a mesma leitura compartilhada do store.
 */
export function recarregarTipoConta(): Promise<void> {
  return revalidar();
}
