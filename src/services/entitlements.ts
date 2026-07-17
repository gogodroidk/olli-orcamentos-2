/**
 * ENTITLEMENTS — "que plano libera o quê". Módulo PURO: zero import, zero rede,
 * zero AsyncStorage. É a fonte da verdade do que cada plano dá.
 *
 * Mora separado de `planos.ts` (que fala com Supabase e AsyncStorage) por dois
 * motivos práticos, não estéticos:
 *  1. dá para TESTAR de verdade (`npm run test:marca-olli`) — a tabela que decide
 *     dinheiro não pode depender de subir o app inteiro para ser conferida;
 *  2. é o começo do que o Plano-Mestre pede na P15: "entitlements por chave+limite,
 *     substituindo `Set`/`if(plano)` espalhados" — a UI e o worker perguntam
 *     "esta conta PODE X", nunca "esta conta É Empresa".
 *
 * `planos.ts` re-exporta tudo daqui, então nenhum call site precisou mudar.
 */

/** Os planos que existem. Fonte: PLANOS_BASE / Stripe live (R$ 0 / 39 / 99). */
export type PlanoId = 'gratis' | 'pro' | 'empresa';

export type Recurso =
  | 'ia_ilimitada'      // IA sem cota mensal (voz nuvem + chat + diagnóstico IA)
  | 'relatorios'        // relatórios de faturamento e conversão
  | 'metas'             // metas de vendas e acompanhamento
  | 'radar_clientes'    // radar de clientes sumidos (lista completa)
  | 'relatorio_dia'     // relatório do dia falado
  | 'modelos_pdf_premium' // modelos premium de PDF (Onda 5)
  | 'remove_olli_brand' // remove a marca discreta OLLI do PDF/documento (Onda 7)
  | 'equipe'            // vários técnicos e papéis
  | 'mapa_equipe'       // equipe ao vivo no mapa
  | 'dashboard_empresa'; // painel de gestão da empresa

/**
 * A chave do entitlement "sem marca OLLI no documento" (D-07).
 *
 * Exportada daqui, da FONTE, porque estava redeclarada em duas telas como
 * `'remove_olli_brand' as Recurso` — e o `as` é um cast: se alguém digitasse
 * `remove_oli_brand`, o TypeScript aceitaria calado e o cliente pagante voltaria a
 * ver a marca, sem erro nenhum. Constante tipada não deixa isso acontecer.
 */
export const RECURSO_REMOVE_MARCA: Recurso = 'remove_olli_brand';

/**
 * RECURSOS_POR_PLANO — o que cada plano libera.
 *
 * gratis: orçamentos/recibos/clientes/agenda ilimitados, diagnóstico offline e
 *   link do cliente são livres (não passam pelo mapa: nunca se gateiam). IA tem
 *   3 usos/mês (cota, não plano). Nenhum recurso Pro/Empresa.
 * pro: toda a IA sem cota, relatórios, metas, radar, relatório do dia falado,
 *   os modelos premium de PDF e a remoção da marca OLLI do documento (D-07).
 * empresa: tudo do Pro + equipe/papéis/mapa/dashboard da empresa.
 */
export const RECURSOS_POR_PLANO: Record<PlanoId, ReadonlySet<Recurso>> = {
  gratis: new Set<Recurso>(),
  pro: new Set<Recurso>([
    'ia_ilimitada',
    'relatorios',
    'metas',
    'radar_clientes',
    'relatorio_dia',
    'modelos_pdf_premium',
    'remove_olli_brand',
  ]),
  empresa: new Set<Recurso>([
    'ia_ilimitada',
    'relatorios',
    'metas',
    'radar_clientes',
    'relatorio_dia',
    'modelos_pdf_premium',
    'remove_olli_brand',
    'equipe',
    'mapa_equipe',
    'dashboard_empresa',
  ]),
};

/**
 * `true` se o `plano` dá acesso ao `recurso`. Recurso desconhecido → false
 * (nega por padrão: mais seguro do que liberar por engano). Empresa é
 * superconjunto do Pro pelo próprio mapa, então não precisa de cascata aqui.
 */
export function temAcessoRecurso(plano: PlanoId, recurso: Recurso): boolean {
  return RECURSOS_POR_PLANO[plano]?.has(recurso) ?? false;
}
