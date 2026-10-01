import type { Papel } from '../services/equipe';

/**
 * Matriz de permissões por papel, SEM React — para o hook `usePermissao` e para
 * serviços que rodam fora de componente (escopo da agenda, ritual diário). Um
 * lugar só decide "quem pode o quê"; o hook só adiciona o estado do store.
 */

/** Ações gateáveis por papel. String union → autocomplete + typo em compile. */
export type Acao =
  | 'criar_orcamento'      // criar/editar orçamentos
  | 'ver_clientes'         // acessar a base de clientes
  | 'gerenciar_clientes'   // editar/excluir cadastros de clientes
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
    'gerenciar_clientes',
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
    'gerenciar_clientes',
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
    'gerenciar_clientes',
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
  'gerenciar_clientes',
  'ver_agenda_propria',
  'ver_agenda_equipe',
  'ver_relatorios',
  'ver_valores_agregados',
  'ver_metas',
  'gerenciar_faturamento',
]);

/**
 * A mesma decisão do `pode` do hook, sem React: para serviços que rodam fora de
 * componente (ex.: `services/escopoAgendaAtual.ts`, usado pelo ritual diário).
 * Papel INDETERMINADO nega tudo (ver o comentário dentro de `usePermissao`).
 */
export function podeComPapel(
  acao: Acao,
  conta: { tipo: 'pessoal' | 'empresa'; org: { papel: Papel } | null; resolvido: boolean },
): boolean {
  if (!conta.resolvido) return false;
  const papel = conta.tipo === 'empresa' && conta.org ? conta.org.papel : null;
  if (!papel) return PERMISSOES_PESSOAL.has(acao);
  return PERMISSOES[papel]?.has(acao) ?? false;
}
