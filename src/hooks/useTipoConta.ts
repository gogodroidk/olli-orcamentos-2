import { useCallback, useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getMinhaOrganizacao, registrarAcesso, type Organizacao } from '../services/equipe';

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
  /** epoch ms da última revalidação (0 = nunca). */
  atualizadoEm: number;
}

let estado: EstadoConta = {
  tipo: 'pessoal',
  org: null,
  carregando: true,
  atualizadoEm: 0,
};

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
      const org = await getMinhaOrganizacao();
      definir({
        tipo: org ? 'empresa' : 'pessoal',
        org,
        carregando: false,
        atualizadoEm: Date.now(),
      });

      // Registro de acesso: 1x por sessão, ao confirmar que é empresa.
      if (org && acessoRegistradoParaOrg !== org.id) {
        acessoRegistradoParaOrg = org.id;
        void registrarAcesso(org.id, 'login');
      }
      if (!org) acessoRegistradoParaOrg = null;
    } catch {
      // getMinhaOrganizacao já é à prova de falha; se algo escapar, encerra o
      // carregando mantendo o último estado bom (degrada como conta pessoal).
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
    if (estado.atualizadoEm === 0) void revalidar();

    return () => {
      ouvintes.delete(ouvinte);
    };
  }, []);

  const recarregar = useCallback(() => revalidar(), []);

  return {
    tipo: snap.tipo,
    org: snap.org,
    carregando: snap.carregando,
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
