import { useCallback } from 'react';
import { useTipoConta } from './useTipoConta';
import type { Papel } from '../services/equipe';

/**
 * usePermissao — o que o usuário PODE fazer, dado o papel dele na organização
 * (Onda 2, frente "Convites + papéis"). Conta pessoal (sem org) = dono de si
 * mesmo: pode tudo do próprio negócio (o gate de PLANO é outra dimensão, ver
 * usePlano — permissão ≠ plano).
 *
 * CONTRATO DE PERMISSÕES (do roadmap):
 *   owner   = tudo
 *   admin   = tudo, menos faturamento (billing) e excluir a organização
 *   gestor  = relatórios, metas, agenda de TODOS; NÃO configura equipe
 *   tecnico = só a própria agenda + criar orçamentos + clientes
 *             (sem relatórios, sem valores agregados, sem Planos)
 *
 * Uso: const { papel, pode } = usePermissao(); if (pode('gerenciar_equipe')) …
 */

/** Ações gateáveis por papel. String union → autocomplete + typo em compile. */
export type Acao =
  | 'criar_orcamento'      // criar/editar orçamentos
  | 'ver_clientes'         // acessar a base de clientes
  | 'ver_agenda_propria'   // a própria agenda
  | 'ver_agenda_equipe'    // a agenda de todos os técnicos
  | 'ver_relatorios'       // relatórios de faturamento/conversão
  | 'ver_valores_agregados'// KPIs/totais da empresa (dashboard)
  | 'ver_metas'            // metas de vendas
  | 'gerenciar_equipe'     // convidar/ativar/desativar membros, mudar papéis
  | 'ver_equipe'           // ver a lista da equipe (sem necessariamente gerenciar)
  | 'ver_acessos'          // ver o histórico de acessos dos membros
  | 'gerenciar_faturamento'// assinar/gerenciar plano da empresa (billing)
  | 'excluir_organizacao'; // apagar a org

/**
 * Matriz de permissões por papel. Conjunto do que CADA papel libera. Mantida
 * explícita (sem herança implícita) para ser auditável de relance — owner e
 * admin listam tudo que podem; gestor/tecnico o subconjunto exato do contrato.
 */
const PERMISSOES: Record<Papel, ReadonlySet<Acao>> = {
  owner: new Set<Acao>([
    'criar_orcamento',
    'ver_clientes',
    'ver_agenda_propria',
    'ver_agenda_equipe',
    'ver_relatorios',
    'ver_valores_agregados',
    'ver_metas',
    'gerenciar_equipe',
    'ver_equipe',
    'ver_acessos',
    'gerenciar_faturamento',
    'excluir_organizacao',
  ]),
  admin: new Set<Acao>([
    'criar_orcamento',
    'ver_clientes',
    'ver_agenda_propria',
    'ver_agenda_equipe',
    'ver_relatorios',
    'ver_valores_agregados',
    'ver_metas',
    'gerenciar_equipe',
    'ver_equipe',
    'ver_acessos',
    // admin NÃO tem: gerenciar_faturamento, excluir_organizacao
  ]),
  gestor: new Set<Acao>([
    'criar_orcamento',
    'ver_clientes',
    'ver_agenda_propria',
    'ver_agenda_equipe',
    'ver_relatorios',
    'ver_valores_agregados',
    'ver_metas',
    'ver_equipe', // vê a equipe, mas não gerencia
    // gestor NÃO tem: gerenciar_equipe, ver_acessos, faturamento, excluir
  ]),
  tecnico: new Set<Acao>([
    'criar_orcamento',
    'ver_clientes',
    'ver_agenda_propria',
    // tecnico NÃO tem: agenda da equipe, relatórios, valores agregados, metas,
    // nada de equipe/acessos, nada de faturamento.
  ]),
};

/**
 * Conta PESSOAL (sem organização): o usuário é dono do próprio negócio. Pode
 * tudo que faz sentido para um solo — criar orçamento, clientes, agenda,
 * relatórios, metas, faturamento (assinar o próprio plano). Não há "equipe" nem
 * "acessos" (não há outros membros), e não há organização para excluir.
 */
const PERMISSOES_PESSOAL: ReadonlySet<Acao> = new Set<Acao>([
  'criar_orcamento',
  'ver_clientes',
  'ver_agenda_propria',
  'ver_agenda_equipe',
  'ver_relatorios',
  'ver_valores_agregados',
  'ver_metas',
  'gerenciar_faturamento',
]);

export interface UsePermissao {
  /** Papel do usuário na org, ou null quando conta pessoal. `null` também enquanto indeterminado — cheque `carregando`. */
  papel: Papel | null;
  /**
   * `true` enquanto NÃO SABEMOS o papel (primeira leitura em voo, ou leitura que
   * falhou e não há cache). A UI deve mostrar "carregando", nunca o conteúdo
   * protegido e nunca "acesso negado" — é ignorância, não negação.
   */
  carregando: boolean;
  /** `true` se a conta é empresa (pertence a uma organização). */
  ehEmpresa: boolean;
  /** `true` se o usuário pode executar a `acao`. Nega por padrão o desconhecido. */
  pode: (acao: Acao) => boolean;
}

export function usePermissao(): UsePermissao {
  const { tipo, org, carregando, resolvido } = useTipoConta();
  const papel = tipo === 'empresa' && org ? org.papel : null;

  const pode = useCallback(
    (acao: Acao): boolean => {
      // Papel INDETERMINADO nega tudo. Sem isto, `papel === null` cairia na matriz
      // PESSOAL — que é a MAIS permissiva (relatórios, valores agregados,
      // faturamento) — e um técnico com a leitura da org ainda em voo, ou offline,
      // seria promovido a dono. "Não sei" nunca pode valer mais que "sou técnico".
      if (!resolvido) return false;
      // Conta pessoal: usa a matriz do solo (dono de si).
      if (!papel) return PERMISSOES_PESSOAL.has(acao);
      return PERMISSOES[papel]?.has(acao) ?? false;
    },
    [papel, resolvido],
  );

  return {
    papel,
    // Enquanto o papel não é conhecido, a tela está "carregando" — mesmo que a
    // requisição já tenha terminado (em erro). É o que evita mostrar um "acesso
    // negado" falso para o dono autônomo que abriu o app sem sinal.
    carregando: carregando || !resolvido,
    ehEmpresa: tipo === 'empresa',
    pode,
  };
}
