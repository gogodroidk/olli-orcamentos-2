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
  | 'remove_olli_brand' // tira o selo "Feito com OLLI" do PDF, do recibo e do link /o/
  | 'followup_automatico' // lembretes automáticos D+2/D+5 do orçamento sem resposta
  | 'link_pagamento'    // link do orçamento com o Pix do prestador (cliente paga no link)
  | 'clima_visita'      // inteligência: chuva na visita e remarcar por chuva
  | 'hora_de_sair'      // inteligência: hora de sair estimada + ordenar a rota do dia (grátis, no aparelho)
  | 'termometro_orcamento' // inteligência: termômetro do orçamento (quente/morno/frio)
  | 'vespera_garantia'  // inteligência: confirmação de véspera (/v/<token>) + garantia que se cuida sozinha
  | 'relatorios'        // relatórios de faturamento e conversão
  | 'metas'             // metas de vendas e acompanhamento
  | 'radar_clientes'    // radar de clientes sumidos (lista completa)
  | 'relatorio_dia'     // relatório do dia falado
  | 'modelos_pdf_premium' // modelos premium de PDF (Onda 5)
  | 'equipe'            // vários técnicos e papéis
  | 'mapa_equipe'       // equipe ao vivo no mapa
  | 'pmoc_contratos'    // PMOC e contratos de manutenção recorrentes
  | 'dashboard_empresa' // painel de gestão da empresa
  // D-2267 (Igor, 18/11): "no free só o básico; o resto pago e com cadeado".
  | 'recibos'           // emitir recibo (o que o Grátis já emitiu continua visível)
  | 'agenda'            // agenda de visitas (criar/editar; o que já existe continua visível)
  | 'ordem_servico'     // ordem de serviço com checklist, fotos e assinatura
  | 'importar_lote'     // importar clientes em lote (contatos, planilha, vCard). Puxar 1 telefone no orçamento segue Grátis
  | 'nota_fiscal';      // nota fiscal — ainda não existe: sempre "(em breve)"

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
 * RECURSOS_POR_PLANO — o que cada plano libera (decisão do dono, 01/10/2026).
 *
 * gratis (D-2267, 18/11): SÓ o básico — criar e enviar orçamento (5 envios/mês), rascunhos,
 *   clientes, catálogo, link para aprovar, diagnóstico por código de erro e IA com 3 usos/mês
 *   (cota, não plano). Recibos, agenda, OS e importação em lote passaram para o Pro, com
 *   carência até `TRANCA_GRATIS_D2267` para quem já era Grátis.
 * pro (R$ 39): sem o selo + follow-up automático + link com pagamento +
 *   inteligência de campo (clima na visita, hora de sair, termômetro do
 *   orçamento) + IA sem cota, relatórios, metas, radar e modelos premium.
 * empresa (R$ 99): tudo do Pro + equipe, mapa ao vivo, PMOC/contratos e painel.
 *
 * A ORDEM das listas é a ordem de exibição nos cartões de plano (landing, painel
 * e app derivam os bullets daqui): o que mais vende vem primeiro.
 */
const RECURSOS_PRO: readonly Recurso[] = [
  'remove_olli_brand',
  'followup_automatico',
  'link_pagamento',
  // D-2267: depois dos 3 que abrem a frase "No Pro: …" (frasePro), que seguem os que mais vendem.
  'recibos',
  'agenda',
  'ordem_servico',
  'clima_visita',
  'hora_de_sair',
  'termometro_orcamento',
  'vespera_garantia',
  'ia_ilimitada',
  'relatorios',
  'metas',
  'radar_clientes',
  'relatorio_dia',
  'modelos_pdf_premium',
  'importar_lote',
  'nota_fiscal',
];

const RECURSOS_SO_EMPRESA: readonly Recurso[] = [
  'equipe',
  'mapa_equipe',
  'pmoc_contratos',
  'dashboard_empresa',
];

export const RECURSOS_POR_PLANO: Record<PlanoId, ReadonlySet<Recurso>> = {
  gratis: new Set<Recurso>(),
  pro: new Set<Recurso>(RECURSOS_PRO),
  empresa: new Set<Recurso>([...RECURSOS_PRO, ...RECURSOS_SO_EMPRESA]),
};

/** Todos os recursos pagos, na ordem de exibição (Pro primeiro, depois só-Empresa). */
export const RECURSOS_EM_ORDEM: readonly Recurso[] = [...RECURSOS_PRO, ...RECURSOS_SO_EMPRESA];

/**
 * Recursos já previstos no entitlement comercial, mas ainda não entregues no
 * produto atual. Entitlement e disponibilidade são estados diferentes: esta
 * lista impede que a tela venda como pronto algo que o runtime ainda não faz.
 */
export const RECURSOS_EM_BREVE: ReadonlySet<Recurso> = new Set<Recurso>([
  // 'termometro_orcamento' saiu daqui com a frente I2 (eventos do link /o/<token>,
  // migration 20261003102000_orcamento_eventos.sql, cartão no detalhe e chip na lista).
  'mapa_equipe',
  'dashboard_empresa',
  'nota_fiscal', // D-2267: sem produto ainda — nunca vendido como pronto
]);

/**
 * O plano MAIS BARATO que libera o recurso — decide o "Disponível no Pro" ou
 * "Disponível no Empresa" dos muros. Derivado do mapa, nunca escrito por tela.
 */
export function planoMinimoDoRecurso(recurso: Recurso): 'pro' | 'empresa' {
  return RECURSOS_POR_PLANO.pro.has(recurso) ? 'pro' : 'empresa';
}

/**
 * O estado de um recurso pago na TELA. Nunca dois estados (regra da casa "erro
 * nunca vira vazio"):
 *  - `carregando`    → o plano ainda não foi lido: nem libera, nem vende;
 *  - `indeterminado` → a leitura FALHOU: a tela diz que não confirmou e oferece
 *                      tentar de novo. Nunca vira `liberado` (daria de graça o que
 *                      é pago) nem `bloqueado` (rebaixaria quem paga por erro nosso);
 *  - `bloqueado`     → plano confirmado e não inclui o recurso: "Disponível no Pro";
 *  - `em_breve`      → o plano inclui, o produto ainda não entrega;
 *  - `liberado`      → o plano inclui e o produto entrega.
 */
export type EstadoAcessoRecurso = 'carregando' | 'indeterminado' | 'bloqueado' | 'em_breve' | 'liberado';

/**
 * Recursos que o TÉCNICO usa em nome da empresa: valem pelo plano do TENANT
 * (`planoTenant`), não só pela assinatura da própria conta. Membro de equipe não
 * tem linha em `assinaturas` — a assinatura é do dono —, e sem isto o técnico de
 * uma empresa no Empresa veria "Disponível no Pro" na hora de sair, no clima e no
 * PMOC que a empresa paga. Os demais recursos (relatórios, metas, selo do PDF…)
 * seguem pela conta: é o comportamento que já existia, e mexer nele é outra
 * decisão (ver `webapp/src/olli/marcaRegra.ts`, motivo "membro").
 */
export const RECURSOS_DO_TENANT: ReadonlySet<Recurso> = new Set<Recurso>([
  'clima_visita',
  'hora_de_sair',
  'termometro_orcamento',
  'vespera_garantia',
  'followup_automatico',
  'pmoc_contratos',
  // D-2267: o técnico de uma empresa Pro emite recibo, usa a agenda e a OS pela empresa.
  'recibos',
  'agenda',
  'ordem_servico',
]);

/**
 * CARÊNCIA do D-2267: recibos, agenda, OS e importação em lote eram do Grátis. Quem é
 * Grátis continua usando até esta data (aviso no app e por e-mail antes — CDC: mudança
 * que tira o que a pessoa usa vem avisada). Depois dela, cadeado. O que a conta já criou
 * continua VISÍVEL e legível sempre (isso é das telas, não daqui).
 * Meia-noite de Brasília de 26/11/2026 = 7 dias depois da publicação prevista (19/11).
 */
export const TRANCA_GRATIS_D2267 = '2026-11-26T03:00:00.000Z';
export const RECURSOS_COM_CARENCIA_GRATIS: ReadonlySet<Recurso> = new Set<Recurso>(['recibos', 'agenda', 'ordem_servico', 'importar_lote']);

/** `true` enquanto a carência do Grátis vale para este recurso. */
export function emCarenciaGratis(recurso: Recurso, agora: number = Date.now()): boolean {
  return RECURSOS_COM_CARENCIA_GRATIS.has(recurso) && agora < Date.parse(TRANCA_GRATIS_D2267);
}

const PESO_PLANO: Record<PlanoId, number> = { gratis: 0, pro: 1, empresa: 2 };

/** O plano que decide ESTE recurso: o da conta, ou o maior entre conta e tenant. */
export function planoParaRecurso(plano: PlanoId, planoTenant: PlanoId | undefined, recurso: Recurso): PlanoId {
  if (!planoTenant || !RECURSOS_DO_TENANT.has(recurso)) return plano;
  return (PESO_PLANO[planoTenant] ?? 0) > (PESO_PLANO[plano] ?? 0) ? planoTenant : plano;
}

export interface LeituraPlano {
  plano: PlanoId;
  /** Plano da empresa (tenant) — ver `RECURSOS_DO_TENANT`. Ausente = só a conta. */
  planoTenant?: PlanoId;
  /** `true` enquanto a primeira leitura real ainda não terminou. */
  carregando: boolean;
  /** `true` = plano lido do servidor (ou do cache da MESMA conta). `false` = não sei. */
  confirmado: boolean;
}

/** De onde veio o plano lido (`getPlanoAtual().fonte`). */
export type FontePlano = 'servidor' | 'cache_mesmo_usuario' | 'sessao_ausente' | 'indisponivel';

/**
 * `true` quando o plano lido é um FATO: veio do servidor, do cache da mesma conta,
 * ou não há sessão (deslogado é Grátis de verdade). `indisponivel` = não sei.
 */
export function planoConfirmado(fonte: FontePlano): boolean {
  return fonte === 'servidor' || fonte === 'cache_mesmo_usuario' || fonte === 'sessao_ausente';
}

/**
 * A mesma regra de 3 estados, para SERVIÇOS em segundo plano (agendar lembrete,
 * chamar API paga): `liberado` faz, `bloqueado` não faz, `indeterminado` NÃO MEXE
 * em nada (não cancela o que existe, não cria o que não sabe se pode).
 */
export type AcessoServico = 'liberado' | 'bloqueado' | 'indeterminado';

export function acessoDeServico(
  plano: PlanoId,
  fonte: FontePlano,
  recurso: Recurso,
  planoTenant?: PlanoId,
): AcessoServico {
  if (temAcessoRecurso(planoParaRecurso(plano, planoTenant, recurso), recurso)) return 'liberado';
  return planoConfirmado(fonte) ? 'bloqueado' : 'indeterminado';
}

export function estadoAcessoRecurso(leitura: LeituraPlano, recurso: Recurso): EstadoAcessoRecurso {
  // O plano em memória só é pago se veio do servidor ou do cache da MESMA conta
  // (ver usePlano/getPlanoAtual) — então quem paga é liberado já no cold start,
  // sem piscar o muro enquanto a revalidação corre.
  if (temAcessoRecurso(planoParaRecurso(leitura.plano, leitura.planoTenant, recurso), recurso)) {
    return RECURSOS_EM_BREVE.has(recurso) ? 'em_breve' : 'liberado';
  }
  if (leitura.carregando) return 'carregando';
  if (!leitura.confirmado) return 'indeterminado';
  return 'bloqueado';
}

export type DisponibilidadeRecurso = 'nao_incluido' | 'em_breve' | 'disponivel';

export function disponibilidadeRecurso(plano: PlanoId, recurso: Recurso): DisponibilidadeRecurso {
  if (!temAcessoRecurso(plano, recurso)) return 'nao_incluido';
  return RECURSOS_EM_BREVE.has(recurso) ? 'em_breve' : 'disponivel';
}

/**
 * `true` se o `plano` dá acesso ao `recurso`. Recurso desconhecido → false
 * (nega por padrão: mais seguro do que liberar por engano). Empresa é
 * superconjunto do Pro pelo próprio mapa, então não precisa de cascata aqui.
 */
export function temAcessoRecurso(plano: PlanoId, recurso: Recurso, agora: number = Date.now()): boolean {
  if (RECURSOS_POR_PLANO[plano]?.has(recurso)) return true;
  // Carência do D-2267: só o Grátis, só os recursos que ERAM dele, só até a data.
  return plano === 'gratis' && emCarenciaGratis(recurso, agora);
}

/**
 * Cota mensal de usos de IA no plano Grátis.
 *
 * Mora AQUI, junto do resto do "que plano libera o quê", e não em `planos.ts`
 * (que importa AsyncStorage e Supabase), porque é um LIMITE DE PLANO: a tela de
 * planos precisa exibi-lo — "3 usos de IA por mês" é a linha que faz o Pro valer
 * a pena — e a tela não pode depender de um módulo com rede para escrever um
 * número. `planos.ts` re-exporta daqui, então nenhum call site mudou.
 *
 * A IA no grátis é gate por COTA, não por plano: por isso `ia_ilimitada` (o
 * recurso) e este número (o limite de quem não o tem) são a mesma verdade vista
 * de dois lados — quem tem o recurso não consulta o contador (ver
 * `getUsosIaRestantes`).
 */
export const IA_USOS_GRATIS_MES = 3;

export { TRIAL_PRO_DIAS } from './limitesComerciais.ts';
