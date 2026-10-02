/**
 * garantiaServico.ts — "Garantia que se cuida sozinha" (Onda I3, jogada 12).
 *
 * Regras PURAS (sem banco, sem React Native): testadas em
 * `scripts/teste-vespera-garantia.ts`. Quem lê o SQLite e agenda notificação é
 * `services/garantias.ts`.
 *
 * DE ONDE VEM A GARANTIA (nunca inventada):
 *  1. o texto escrito NA OS (`OrdemServico.garantia`, editável);
 *  2. senão, o texto do ORÇAMENTO de origem (`Orcamento.garantia`);
 *  3. senão, a OS não tem garantia declarada e não entra em lista nenhuma.
 * O último dia só existe quando o texto traz prazo legível ("90 dias", "6 meses",
 * "1 ano") e a OS está CONCLUÍDA (a garantia conta do fim do serviço).
 *
 * O QUE O PRESTADOR RECEBE:
 *  - "Pergunte se está tudo certo": D+15 depois do serviço na dedetização, D+30
 *    nos outros ofícios (o plano: "D+15 dedetização, D+30 ar e elétrica"). Só
 *    enquanto a garantia ainda vale.
 *  - "A garantia vence em N dias": a partir de 7 dias antes do último dia.
 * Cada item some quando o prestador marca "Feito" (por OS e por motivo).
 */
import { diaDe, fimDaGarantia, prazoGarantia } from './historicoEquipamento.ts';
import type { OrdemServico } from '../types/index.ts';
import type { VerticalId } from '../services/verticais.ts';

/** A partir de quantos dias antes do fim o aviso "vence em N dias" aparece. */
export const DIAS_AVISO_VENCIMENTO = 7;

/** Dias depois do serviço para perguntar "está tudo certo?", por ofício. */
const DIAS_CHECKIN: Partial<Record<VerticalId, number>> = {
  dedetizacao: 15,
};
const DIAS_CHECKIN_PADRAO = 30;

export function diasDoCheckin(verticais?: readonly VerticalId[] | null): number {
  const v = verticais?.[0];
  return (v && DIAS_CHECKIN[v]) || DIAS_CHECKIN_PADRAO;
}

export interface GarantiaDaOS {
  osId: string;
  numero: string;
  clienteId?: string;
  clienteNome: string;
  titulo: string;
  equipamentoId?: string;
  /** Como o prestador escreveu ("90 dias"). */
  texto: string;
  origem: 'os' | 'orcamento';
  /** Dia (YYYY-MM-DD) em que o serviço terminou. */
  desde: string;
  /** Último dia da garantia; ausente = texto sem prazo legível. */
  ate?: string;
}

/** Texto de garantia da OS (OS > orçamento). null = a OS não declara garantia. */
export function textoGarantiaDaOS(
  os: Pick<OrdemServico, 'garantia'>,
  garantiaOrcamento?: string | null,
): { texto: string; origem: 'os' | 'orcamento' } | null {
  const daOS = os.garantia?.trim();
  if (daOS) return { texto: daOS.slice(0, 200), origem: 'os' };
  const doOrc = garantiaOrcamento?.trim();
  if (doOrc) return { texto: doOrc.slice(0, 200), origem: 'orcamento' };
  return null;
}

/**
 * Último dia da garantia de uma OS CONCLUÍDA (o que vai para a nuvem em
 * `garantia_ate`). undefined: OS não concluída, sem texto, ou prazo ilegível.
 */
export function garantiaAteDaOS(
  os: Pick<OrdemServico, 'status' | 'concluidoEm' | 'garantia'>,
  garantiaOrcamento?: string | null,
): string | undefined {
  if (os.status !== 'concluida' || !os.concluidoEm) return undefined;
  const t = textoGarantiaDaOS(os, garantiaOrcamento);
  if (!t) return undefined;
  const desde = diaDe(os.concluidoEm);
  return desde ? fimDaGarantia(t.texto, desde) : undefined;
}

/** A garantia de uma OS concluída, ou null (não concluída / sem garantia). */
export function garantiaDaOS(os: OrdemServico, garantiaOrcamento?: string | null): GarantiaDaOS | null {
  if (os.status !== 'concluida' || os.excluidoEm) return null;
  const t = textoGarantiaDaOS(os, garantiaOrcamento);
  if (!t) return null;
  const desde = diaDe(os.concluidoEm || os.atualizadoEm);
  if (!desde) return null;
  return {
    osId: os.id,
    numero: os.numero,
    clienteId: os.clienteId,
    clienteNome: os.clienteNome,
    titulo: os.titulo,
    equipamentoId: os.equipamentoId,
    texto: t.texto,
    origem: t.origem,
    desde,
    ate: fimDaGarantia(t.texto, desde),
  };
}

/** Diferença em dias entre dois 'YYYY-MM-DD' (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

function somarDiasDia(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export type MotivoCuidado = 'checkin' | 'vence';

export interface ItemGarantia {
  garantia: GarantiaDaOS;
  motivo: MotivoCuidado;
  /** Dia a partir do qual o item vale. */
  desdeDia: string;
  /** Só no 'vence': quantos dias faltam (0 = vence hoje). */
  diasParaVencer?: number;
  /** Chave estável do "Feito" (por OS + motivo). */
  chave: string;
}

export function chaveCuidado(osId: string, motivo: MotivoCuidado): string {
  return `${osId}:${motivo}`;
}

/**
 * O que cuidar HOJE: check-in vencido (e garantia ainda valendo) e garantia
 * entrando nos últimos 7 dias. Retornos de garantia (a própria OS de retorno)
 * também contam — o retorno tem garantia própria se o prestador escrever.
 * Ordem: vence primeiro (mais urgente), depois check-in mais antigo.
 */
export function garantiasParaCuidar(entrada: {
  garantias: GarantiaDaOS[];
  hoje: string;
  verticais?: readonly VerticalId[] | null;
  feitos?: ReadonlySet<string> | readonly string[];
}): ItemGarantia[] {
  const feitos = entrada.feitos instanceof Set ? entrada.feitos : new Set(entrada.feitos ?? []);
  const diasCheckin = diasDoCheckin(entrada.verticais);
  const itens: ItemGarantia[] = [];
  for (const g of entrada.garantias) {
    // Só cuida de garantia com fim conhecido e que ainda não acabou.
    if (!g.ate || g.ate < entrada.hoje) continue;
    const faltam = diasEntre(entrada.hoje, g.ate);
    if (faltam <= DIAS_AVISO_VENCIMENTO) {
      const chave = chaveCuidado(g.osId, 'vence');
      if (!feitos.has(chave)) {
        itens.push({ garantia: g, motivo: 'vence', desdeDia: somarDiasDia(g.ate, -DIAS_AVISO_VENCIMENTO), diasParaVencer: faltam, chave });
      }
      continue; // perto do fim, o "vence" já cobre a conversa
    }
    const checkin = somarDiasDia(g.desde, diasCheckin);
    if (checkin <= entrada.hoje) {
      const chave = chaveCuidado(g.osId, 'checkin');
      if (!feitos.has(chave)) itens.push({ garantia: g, motivo: 'checkin', desdeDia: checkin, chave });
    }
  }
  return itens.sort((a, b) => {
    if (a.motivo !== b.motivo) return a.motivo === 'vence' ? -1 : 1;
    if (a.motivo === 'vence') return (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0);
    return a.desdeDia.localeCompare(b.desdeDia);
  });
}

/**
 * Próximos avisos a AGENDAR (notificação local): o dia em que cada garantia entra
 * nos últimos 7 dias, ainda no futuro, sem "Feito". Mais cedo primeiro, com teto.
 */
export function avisosFuturosDeGarantia(entrada: {
  garantias: GarantiaDaOS[];
  hoje: string;
  feitos?: ReadonlySet<string> | readonly string[];
  limite?: number;
}): Array<{ dia: string; garantia: GarantiaDaOS }> {
  const feitos = entrada.feitos instanceof Set ? entrada.feitos : new Set(entrada.feitos ?? []);
  const out: Array<{ dia: string; garantia: GarantiaDaOS }> = [];
  for (const g of entrada.garantias) {
    if (!g.ate) continue;
    const dia = somarDiasDia(g.ate, -DIAS_AVISO_VENCIMENTO);
    if (dia <= entrada.hoje) continue; // já está na lista de hoje
    if (feitos.has(chaveCuidado(g.osId, 'vence'))) continue;
    out.push({ dia, garantia: g });
  }
  return out.sort((a, b) => a.dia.localeCompare(b.dia)).slice(0, entrada.limite ?? 5);
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || '';
}

function diaCurto(dia: string): string {
  const [a, m, d] = dia.split('-');
  return a && m && d ? `${d}/${m}` : '';
}

/**
 * Mensagem pronta para o WhatsApp (o prestador revisa antes de enviar). Pergunta
 * honesta, sem prometer nada além do que está escrito na garantia.
 */
export function mensagemCuidadoGarantia(item: ItemGarantia, nomePrestador?: string | null): string {
  const nome = primeiroNome(item.garantia.clienteNome);
  const oi = `Olá${nome ? `, ${nome}` : ''}!`;
  const quem = nomePrestador?.trim() ? ` Aqui é ${nomePrestador.trim()}.` : '';
  const servico = item.garantia.titulo.trim() ? ` do serviço "${item.garantia.titulo.trim()}"` : '';
  if (item.motivo === 'vence' && item.garantia.ate) {
    return `${oi}${quem} A garantia${servico} vale até ${diaCurto(item.garantia.ate)}. Está tudo funcionando bem? Se algo voltou a dar problema, me avise antes dessa data que eu resolvo pela garantia.`;
  }
  return `${oi}${quem} Passando para saber se está tudo funcionando bem depois${servico}. Qualquer coisa, é só me chamar por aqui.`;
}

/** Linha curta para a lista: "Vence em 3 dias (até 12/10)" / "Perguntar se está tudo certo". */
export function rotuloItemGarantia(item: ItemGarantia): string {
  if (item.motivo === 'vence') {
    const n = item.diasParaVencer ?? 0;
    const quando = n === 0 ? 'Vence hoje' : n === 1 ? 'Vence amanhã' : `Vence em ${n} dias`;
    return item.garantia.ate ? `${quando} (até ${diaCurto(item.garantia.ate)})` : quando;
  }
  return 'Hora de perguntar se está tudo certo';
}

/** Prazo legível? (para a OS dizer "vale até" ou "sem prazo legível"). */
export function prazoLegivel(texto?: string | null): boolean {
  return prazoGarantia(texto ?? undefined) !== null;
}

/** Sugestões de prazo na OS (o prestador pode escrever outro). */
export const PRAZOS_SUGERIDOS: readonly string[] = ['30 dias', '90 dias', '6 meses', '1 ano'];
