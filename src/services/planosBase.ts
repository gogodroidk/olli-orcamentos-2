/**
 * PLANOS_BASE — a TABELA DE PLANOS, fonte única da copy comercial.
 *
 * Módulo PURO (só importa `entitlements.ts`, que também é puro): o app
 * (PlanosScreen, GatePro, faixas e ajuda), o painel (`webapp/`, por import
 * relativo), a landing (`web/`, idem) e os e-mails do worker leem DAQUI. Antes
 * disto, a lista de benefícios morava dentro de `PlanosScreen.tsx` e era COPIADA
 * à mão para o painel e para a landing — e este projeto já publicou copy errada 5
 * vezes por alguém escrever de memória (memória "copy derivada da fonte").
 *
 * O QUE CADA PLANO LIBERA não se decide aqui: mora em `entitlements.ts`
 * (`RECURSOS_POR_PLANO`). Este arquivo é a LEITURA COMERCIAL daquilo — o rótulo de
 * cada recurso e o agrupamento dos bullets dos cartões. Duas guardas rodam no
 * import (falha alta e cedo, como em `precosPlanos.ts`):
 *  1. todo recurso pago tem rótulo (`Record<Recurso, …>` — não compila sem);
 *  2. todo recurso que o plano libera aparece em EXATAMENTE um bullet do cartão
 *     daquele plano — sem recurso escondido, sem bullet vendendo o que não libera.
 *
 * PREÇO não mora aqui: vem de `precosPlanos.ts` (app) e `web/src/data/planos.ts`.
 */
import {
  IA_USOS_GRATIS_MES,
  RECURSOS_EM_BREVE,
  RECURSOS_POR_PLANO,
  type PlanoId,
  type Recurso,
} from './entitlements.ts';
import { TEXTO_SELO_OLLI } from '../utils/marcaOlli.ts';

export { TEXTO_SELO_OLLI };

/** Nome de exibição de cada plano. */
export const NOME_PLANO: Record<PlanoId, string> = {
  gratis: 'Grátis',
  pro: 'Pro',
  empresa: 'Empresa',
};

/**
 * Como cada recurso pago é dito ao prestador.
 *  - `titulo`    → a linha do comparativo;
 *  - `beneficio` → 1 frase para o muro "Disponível no Pro";
 *  - `curto`     → trecho para frases corridas ("No Pro: sem o selo, …").
 */
export interface RotuloRecurso {
  titulo: string;
  beneficio: string;
  curto: string;
  /**
   * O `beneficio` para o app das LOJAS, quando o padrão cita meio de pagamento
   * (Pix). Num muro "Disponível no Pro" dentro do APK/iOS, qualquer menção a Pix é
   * risco de revisão (mesma decisão de `lembreteAssinaturaLoja.ts`). Ausente = o
   * `beneficio` já serve nas lojas.
   */
  beneficioLoja?: string;
}

export const ROTULO_RECURSO: Record<Recurso, RotuloRecurso> = {
  remove_olli_brand: {
    titulo: `Sem o selo "${TEXTO_SELO_OLLI}" no PDF, no recibo e no link`,
    beneficio: 'Orçamento, recibo e link 100% com a sua marca, sem o selo do OLLI.',
    curto: `sem o selo "${TEXTO_SELO_OLLI}"`,
  },
  followup_automatico: {
    titulo: 'Follow-up automático do orçamento sem resposta',
    beneficio: 'O OLLI lembra você de cobrar a resposta do cliente em 2 e em 5 dias.',
    curto: 'follow-up automático',
  },
  link_pagamento: {
    // Sem "Pix" no título/curto de propósito: estes textos também aparecem no app das
    // LOJAS (ajuda, faixas), onde menção a Pix em texto de plano é risco de revisão.
    // O Pix aqui é o do PRESTADOR (o cliente dele paga o serviço) — o benefício diz.
    titulo: 'Link do orçamento com pagamento na hora',
    beneficio: 'O cliente aprova e já paga pelo Pix, direto na sua conta, no próprio link.',
    beneficioLoja: 'O cliente aprova e já paga no próprio link do orçamento.',
    curto: 'link com pagamento na hora',
  },
  clima_visita: {
    titulo: 'Aviso de chuva na hora da visita',
    beneficio: 'Saiba antes se vai chover na hora da visita e remarque com 1 toque.',
    curto: 'aviso de chuva na visita',
  },
  hora_de_sair: {
    titulo: 'Hora de sair e rota do dia (estimativa)',
    beneficio: 'O OLLI estima a que horas sair e ordena as visitas do dia pelo caminho mais curto (sem trânsito ao vivo).',
    curto: 'hora de sair e rota do dia',
  },
  termometro_orcamento: {
    titulo: 'Termômetro do orçamento (quente, morno ou frio)',
    beneficio: 'Veja quais orçamentos estão quentes pelo que o cliente fez no link.',
    curto: 'termômetro do orçamento',
  },
  vespera_garantia: {
    titulo: 'Confirmação de véspera e garantia que se cuida sozinha',
    beneficio: 'O cliente confirma a visita com 1 toque e o OLLI avisa antes de a garantia vencer.',
    curto: 'confirmação de véspera e garantia',
  },
  ia_ilimitada: {
    titulo: 'IA incluída com uso justo diário (voz, chat e diagnóstico)',
    beneficio: 'IA incluída: voz, chat e diagnóstico com uso justo diário.',
    curto: 'IA com uso justo diário',
  },
  relatorios: {
    titulo: 'Relatórios de faturamento e conversão',
    beneficio: 'Veja quanto você faturou e sua taxa de aprovação.',
    curto: 'relatórios',
  },
  metas: {
    titulo: 'Metas de vendas e acompanhamento',
    beneficio: 'Defina metas de venda e acompanhe seu progresso.',
    curto: 'metas',
  },
  radar_clientes: {
    titulo: 'Clientes para lembrar da manutenção (lista completa)',
    beneficio: 'Veja quem está na hora da manutenção e lembre com 1 toque.',
    curto: 'radar de clientes',
  },
  relatorio_dia: {
    titulo: 'Relatório do dia falado',
    beneficio: 'Ouça o resumo do seu dia em um toque.',
    curto: 'relatório do dia',
  },
  modelos_pdf_premium: {
    titulo: 'Modelos premium de PDF',
    beneficio: 'Modelos de orçamento premium que vendem por você.',
    curto: 'modelos premium de PDF',
  },
  equipe: {
    titulo: 'Vários técnicos e permissões por papel',
    beneficio: 'Vários técnicos, papéis e permissões.',
    curto: 'equipe',
  },
  mapa_equipe: {
    titulo: 'Equipe ao vivo no mapa',
    beneficio: 'Veja a equipe ao vivo no mapa.',
    curto: 'mapa ao vivo',
  },
  pmoc_contratos: {
    titulo: 'PMOC e contratos de manutenção',
    beneficio: 'Planos PMOC e contratos de manutenção recorrente num lugar só.',
    curto: 'PMOC e contratos',
  },
  dashboard_empresa: {
    titulo: 'Painel de gestão da empresa',
    beneficio: 'Painel de gestão com a operação inteira.',
    curto: 'painel da empresa',
  },
};

/**
 * A frase de benefício para os muros, com "(em breve)" quando o produto ainda não
 * entrega o recurso — um muro que vende "veja a equipe ao vivo" sem o GPS existir é
 * promessa cobrada em dinheiro.
 */
export function beneficioRecurso(recurso: Recurso): string {
  const b = ROTULO_RECURSO[recurso].beneficio;
  return RECURSOS_EM_BREVE.has(recurso) ? `${b.replace(/\.$/, '')} (em breve).` : b;
}

/**
 * `beneficioRecurso` para o app das LOJAS: usa `beneficioLoja` quando existe (sem
 * Pix), com o mesmo "(em breve)" da versão padrão.
 */
export function beneficioRecursoLoja(recurso: Recurso): string {
  const b = ROTULO_RECURSO[recurso].beneficioLoja ?? ROTULO_RECURSO[recurso].beneficio;
  return RECURSOS_EM_BREVE.has(recurso) ? `${b.replace(/\.$/, '')} (em breve).` : b;
}

/** `titulo` + "(em breve)" quando o produto ainda não entrega o recurso. */
export function tituloRecurso(recurso: Recurso): string {
  const t = ROTULO_RECURSO[recurso].titulo;
  return RECURSOS_EM_BREVE.has(recurso) ? `${t} (em breve)` : t;
}

/**
 * LIMITE DO GRÁTIS EM CONTA NOVA (P0-09) — a ÚNICA constante de copy do corte.
 * `null` = corte DESLIGADO: o Grátis é ilimitado e o texto diz isso (verdade hoje).
 * Data ISO `AAAA-MM-DD` = dia em que o servidor passou a limitar contas criadas desde então
 * (`limite_gratis_config.corte`); a copy vira "até 5 por mês em contas novas". Ligar = trocar
 * esta constante NO MESMO PR/dia do `update ... set corte = now()`, com ordem do Igor.
 * `scripts/teste-copy-corte-gratis.ts` trava a copy 'ilimitado' escrita à mão quando a data existe.
 */
export const CORTE_GRATIS_DATA: string | null = null;
export const LIMITE_ENVIOS_GRATIS_MES = 5;
/**
 * Dia (ISO) em que o texto novo dos Termos entra no ar; obrigatório quando `CORTE_GRATIS_DATA`
 * existe (o teste trava). Só serve para o "atualizado em" dos Termos.
 */
export const CORTE_GRATIS_PUBLICADO_EM: string | null = null;

const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** `AAAA-MM-DD` → "26 de outubro de 2026", sem passar por `Date`. */
export function diaExtenso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`data inválida: ${iso}`);
  return `${Number(m[3])} de ${MESES_EXTENSO[Number(m[2]) - 1]} de ${m[1]}`;
}

/** Parágrafo do limite para os Termos §4 (parecer LEGAL R0012). `null` = corte desligado. */
export const PARAGRAFO_LIMITE_TERMOS: string | null =
  CORTE_GRATIS_DATA === null
    ? null
    : `O plano gratuito permite enviar até ${LIMITE_ENVIOS_GRATIS_MES} (cinco) orçamentos por mês nas contas criadas a partir das 00h00 (horário de Brasília) de ${diaExtenso(CORTE_GRATIS_DATA)}. As contas criadas antes dessa data não têm esse limite. Se um dia o limite passar a valer também para contas anteriores, avisaremos com pelo menos 30 (trinta) dias de antecedência, no aplicativo e por e-mail. O limite conta orçamentos diferentes enviados no mês; reenviar o mesmo orçamento não conta de novo. Ao atingir o limite, você continua podendo criar e salvar orçamentos, recibos, clientes e ordens de serviço e consultar todo o seu histórico; para enviar mais orçamentos naquele mês, você pode contratar um plano pago. Nenhum dado é apagado por causa do limite.`;

/** `AAAA-MM-DD` → `dd/mm/aaaa`, sem passar por `Date` (fuso não muda o dia). */
function dataCorteBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`CORTE_GRATIS_DATA inválida: ${iso}`);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Frase de orçamentos do Grátis, na versão certa para o estado do corte. */
function fraseOrcamentosGratis(): string {
  if (CORTE_GRATIS_DATA === null) return 'orçamentos ilimitados (PDF, link e WhatsApp, sem cota mensal)';
  const d = dataCorteBR(CORTE_GRATIS_DATA);
  return `orçamentos em PDF, link e WhatsApp (contas criadas a partir de ${d} enviam até ${LIMITE_ENVIOS_GRATIS_MES} por mês; contas anteriores seguem sem limite)`;
}

/** Orçamentos do Grátis em meia frase ("Grátis — {isto} e tudo do essencial"). */
export const FRASE_GRATIS_CURTA: string =
  CORTE_GRATIS_DATA === null
    ? 'orçamentos ilimitados'
    : `até ${LIMITE_ENVIOS_GRATIS_MES} orçamentos enviados por mês em contas novas (contas anteriores seguem sem limite)`;

/** Linha de anúncio/landing de página de oficio: "Grátis ..." sem cartão. */
export const GRATIS_LINHA_ANUNCIO: string =
  CORTE_GRATIS_DATA === null
    ? 'Grátis com orçamentos ilimitados.'
    : `Grátis: até ${LIMITE_ENVIOS_GRATIS_MES} orçamentos enviados por mês.`;

/** Célula "Orçamentos" do Grátis na tabela comparativa (Pro e Empresa seguem 'Ilimitados'). */
export const CELULA_ORCAMENTOS_GRATIS: string =
  CORTE_GRATIS_DATA === null ? 'Ilimitados' : `Até ${LIMITE_ENVIOS_GRATIS_MES} enviados/mês (contas novas)`;

/** Pré-visualização do e-mail de última chamada de ativação (neutra para as duas coortes). */
export const PREVIEW_EMAIL_GRATIS: string =
  CORTE_GRATIS_DATA === null
    ? 'No plano Grátis os orçamentos são ilimitados, sem cartão.'
    : 'O plano Grátis continua sem cartão e sem prazo.';

/** O que TODO plano tem — a alma do Grátis. Nada aqui passa por entitlement. */
export const RECURSOS_GRATIS: readonly string[] = [
  CORTE_GRATIS_DATA === null
    ? 'Orçamentos ilimitados: PDF, link e WhatsApp, sem cota mensal'
    : `Orçamentos: PDF, link e WhatsApp. Contas criadas a partir de ${dataCorteBR(CORTE_GRATIS_DATA)} enviam até ${LIMITE_ENVIOS_GRATIS_MES} por mês; contas anteriores seguem sem limite`,
  'Rascunhos, recibos, clientes e histórico sem limite',
  'Catálogo de serviços e produtos',
  'Clientes e agenda',
  'Diagnóstico por código de erro (offline)',
  'Ordem de serviço com checklist, fotos e assinatura na tela',
  'Link do orçamento para o cliente aprovar',
  `IA de diagnóstico e voz: ${IA_USOS_GRATIS_MES} usos por mês`,
];

/** O preço do Grátis, dito com honestidade: o que ele leva no documento. */
export const NOTA_SELO_GRATIS = `O PDF, o recibo e o link do Grátis levam um selo discreto "${TEXTO_SELO_OLLI}".`;

/** Frase curta do Grátis para FAQ, SEO e ajuda. */
export const FRASE_GRATIS =
  `${fraseOrcamentosGratis()}, com o selo discreto "${TEXTO_SELO_OLLI}"`;

/** Um bullet de cartão de plano: um texto, os recursos que ele vende e se já existe. */
export interface BulletPlano {
  texto: string;
  /** Recursos de `entitlements` que este bullet representa (vazio = não é recurso gateado). */
  recursos: readonly Recurso[];
  /** `true` quando TODOS os recursos do bullet ainda não foram entregues. */
  emBreve: boolean;
}

function bullet(texto: string, recursos: readonly Recurso[]): BulletPlano {
  return {
    texto,
    recursos,
    emBreve: recursos.length > 0 && recursos.every((r) => RECURSOS_EM_BREVE.has(r)),
  };
}

/** Agrupamento dos recursos do Pro nos bullets do cartão, na ordem de venda. */
const BULLETS_PRO: readonly BulletPlano[] = [
  bullet('Tudo do plano Grátis', []),
  bullet(ROTULO_RECURSO.remove_olli_brand.titulo, ['remove_olli_brand']),
  bullet(ROTULO_RECURSO.followup_automatico.titulo, ['followup_automatico']),
  bullet(ROTULO_RECURSO.link_pagamento.titulo, ['link_pagamento']),
  bullet('Inteligência de campo: aviso de chuva na visita, hora de sair estimada e rota do dia ordenada', ['clima_visita', 'hora_de_sair']),
  bullet(ROTULO_RECURSO.termometro_orcamento.titulo, ['termometro_orcamento']),
  bullet(ROTULO_RECURSO.vespera_garantia.titulo, ['vespera_garantia']),
  bullet(
    'IA com uso justo diário, relatórios, metas, radar de clientes, relatório do dia e modelos premium de PDF',
    ['ia_ilimitada', 'relatorios', 'metas', 'radar_clientes', 'relatorio_dia', 'modelos_pdf_premium'],
  ),
  bullet('Suporte prioritário por WhatsApp', []),
];

const BULLETS_EMPRESA: readonly BulletPlano[] = [
  bullet('Tudo do plano Pro', []),
  bullet(ROTULO_RECURSO.equipe.titulo, ['equipe']),
  bullet(ROTULO_RECURSO.pmoc_contratos.titulo, ['pmoc_contratos']),
  bullet(ROTULO_RECURSO.mapa_equipe.titulo, ['mapa_equipe']),
  bullet(ROTULO_RECURSO.dashboard_empresa.titulo, ['dashboard_empresa']),
  bullet('Suporte prioritário', []),
];

export interface PlanoBase {
  id: PlanoId;
  nome: string;
  tagline: string;
  destaque?: boolean;
  bullets: readonly BulletPlano[];
  /** Os bullets em texto puro, com "(em breve)" quando é o caso. */
  beneficios: readonly string[];
}

function plano(id: PlanoId, tagline: string, bullets: readonly BulletPlano[], destaque = false): PlanoBase {
  return {
    id,
    nome: NOME_PLANO[id],
    tagline,
    destaque: destaque || undefined,
    bullets,
    beneficios: bullets.map((b) => (b.emBreve ? `${b.texto} (em breve)` : b.texto)),
  };
}

export const PLANOS_BASE: readonly PlanoBase[] = [
  plano(
    'gratis',
    'Tudo que você precisa pra começar a fechar negócio.',
    [...RECURSOS_GRATIS.map((t) => bullet(t, [])), bullet(NOTA_SELO_GRATIS, [])],
  ),
  plano('pro', 'Para o autônomo que quer vender mais e ganhar tempo.', BULLETS_PRO, true),
  plano('empresa', 'Para equipes que atendem em campo todos os dias.', BULLETS_EMPRESA),
];

export function planoBase(id: PlanoId): PlanoBase {
  const p = PLANOS_BASE.find((x) => x.id === id);
  if (!p) throw new Error(`[planosBase] plano desconhecido: ${id}`);
  return p;
}

/**
 * "sem o selo …, follow-up automático e link com pagamento na hora" — os três
 * primeiros recursos do Pro, na ordem de venda. Usado nas faixas de lembrete e nos
 * avisos, para nenhum deles reescrever de memória o que o Pro dá.
 */
export function frasePro(): string {
  const doPro = (BULLETS_PRO.flatMap((b) => b.recursos)).filter((r) => !RECURSOS_EM_BREVE.has(r)).slice(0, 3);
  const partes = doPro.map((r) => ROTULO_RECURSO[r].curto);
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

// ─── GUARDA DE COERÊNCIA — roda no import ─────────────────────────────────────
// O bullet do cartão e o entitlement têm de dizer a MESMA coisa. Se alguém der um
// recurso ao Pro em `entitlements.ts` e esquecer o cartão (ou o contrário), o
// cartão venderia menos — ou mais — do que o plano libera, e cada lado estaria
// "certo" sozinho. Quebrar no import é melhor que uma promessa silenciosa.
function conferir(planoId: 'pro' | 'empresa', bullets: readonly BulletPlano[], base: PlanoId): void {
  const vendidos = bullets.flatMap((b) => b.recursos);
  const esperados = [...RECURSOS_POR_PLANO[planoId]].filter((r) => !RECURSOS_POR_PLANO[base].has(r));
  const repetidos = vendidos.filter((r, i) => vendidos.indexOf(r) !== i);
  const faltando = esperados.filter((r) => !vendidos.includes(r));
  const sobrando = vendidos.filter((r) => !esperados.includes(r));
  if (repetidos.length || faltando.length || sobrando.length) {
    throw new Error(
      `[planosBase] cartão do ${planoId} descolou de entitlements.ts — ` +
        `faltando: [${faltando.join(', ')}], sobrando: [${sobrando.join(', ')}], repetidos: [${repetidos.join(', ')}].`,
    );
  }
}
conferir('pro', BULLETS_PRO, 'gratis');
conferir('empresa', BULLETS_EMPRESA, 'pro');
