/**
 * PÓS-VENDA — "Clientes para lembrar".
 *
 * O dinheiro mais barato que o prestador pode ganhar é o do cliente que ele JÁ
 * atendeu e que vai precisar do mesmo serviço de novo: a limpeza do ar a cada 6
 * meses, a caixa d'água, a reaplicação da dedetização. Esta regra acha quem está na
 * hora de ser lembrado e o app oferece a mensagem pronta — nada é enviado sem o
 * toque do prestador.
 *
 * QUANDO: o último SERVIÇO CONCLUÍDO do cliente + o intervalo do ofício
 * (`retorno.meses` em `services/verticais.ts`). "Serviço concluído" é um de:
 *   • recibo emitido (o dinheiro entrou — o serviço aconteceu);
 *   • agendamento marcado como concluído;
 *   • orçamento aprovado ou convertido (o cliente fechou o serviço).
 * Proposta só ENVIADA não conta: quem nunca fechou é lead frio, não manutenção.
 *
 * NÃO INSISTIR: lembrou → o cliente sai da lista por `DIAS_ENTRE_LEMBRETES`. Se não
 * respondeu nesse prazo, volta (um lembrete por mês, no máximo). Um serviço NOVO
 * depois do lembrete zera o ciclo naturalmente (a data-base passa a ser ele).
 *
 * TypeScript PURO: o app (`services/radarClientes.ts`, leitura do SQLite) e o painel
 * (`webapp/.../inicio/radares.ts`, leitura do Supabase) convertem os próprios dados em
 * `ServicoConcluido[]` e chamam ESTA função — a regra é uma só nos dois lados.
 */
import type { VerticalId } from '../services/verticais.ts';
import { VERTICAL_GERAL, verticalPorId } from '../services/verticais.ts';
import { montarMensagemLembreteManutencao } from './mensagensOrcamento.ts';

const MS_POR_DIA = 86_400_000;

/** Depois de lembrar, o cliente fica fora da lista por este tempo. */
export const DIAS_ENTRE_LEMBRETES = 30;

/** Um sinal de "serviço feito para este cliente em tal momento". */
export interface ServicoConcluido {
  clienteId: string | null | undefined;
  /** ms desde a época; `null` quando a data não é legível (o sinal é ignorado). */
  quando: number | null;
}

export interface ClienteBase {
  id?: string | null;
  nome?: string | null;
  telefone?: string | null;
}

export interface ClienteParaLembrar {
  id: string;
  nome: string;
  telefone: string;
  /** ISO do último serviço concluído — a data-base do lembrete. */
  ultimoServico: string;
  /** Meses (arredondados, piso 1) desde o último serviço — é o número da mensagem. */
  meses: number;
  dias: number;
  /** ISO do último lembrete enviado (qualquer ciclo), ou null. */
  lembradoEm: string | null;
}

export interface EntradaParaLembrar {
  clientes: readonly ClienteBase[];
  servicos: readonly ServicoConcluido[];
  /** Intervalo do ofício, em meses (ver `retornoDoOficio`). */
  mesesIntervalo: number;
  /** clienteId → ISO do último lembrete enviado. */
  lembrados?: Record<string, string>;
  /** clienteId → ISO até quando o prestador adiou (o "adiar 30 dias" do app). */
  adiados?: Record<string, string>;
  agora?: Date;
}

/** ms de uma data ISO, ou null (nunca vira "hoje" nem 1970). */
export function msDe(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Quando o dinheiro de um recibo entrou, em ms. `dataRecebimento` é 'DD/MM/AAAA' no
 * app: `new Date('10/07/2026')` lê MM/DD e joga 10 de julho para 7 de outubro — aqui
 * a data BR é convertida antes (meio-dia UTC, imune a fuso). Sem data BR legível, cai
 * para um ISO eventual e, por fim, para a criação do recibo.
 */
export function msDoRecibo(dataRecebimento: string | null | undefined, criadoEm: string | null | undefined): number | null {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((dataRecebimento ?? '').trim());
  if (br) {
    const t = Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
    const d = new Date(t);
    if (d.getUTCDate() === Number(br[1]) && d.getUTCMonth() === Number(br[2]) - 1) return t;
  }
  if (dataRecebimento && !dataRecebimento.includes('/')) {
    const t = msDe(dataRecebimento);
    if (t !== null) return t;
  }
  return msDe(criadoEm);
}

/** `base` + `meses` de calendário (31/08 + 6 meses = 28 ou 29/02, sem transbordar para março). */
export function somarMeses(baseMs: number, meses: number): number {
  const d = new Date(baseMs);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDia));
  return d.getTime();
}

/**
 * O retorno que vale para a empresa: o do PRIMEIRO ofício escolhido (é o principal —
 * a ordem vem da dedução por CNAE, principal primeiro, ou da escolha do dono). Sem
 * ofício, o genérico. Um ofício só por empresa porque a mensagem precisa nomear UM
 * serviço — "a limpeza do ar ou a dedetização" não soa como gente.
 */
export function retornoDoOficio(verticais: readonly VerticalId[] | null | undefined): {
  vertical: VerticalId;
  meses: number;
  servico: string;
} {
  const id = verticais && verticais.length > 0 ? verticais[0] : VERTICAL_GERAL.id;
  const v = verticalPorId(id);
  return { vertical: v.id, meses: v.retorno.meses, servico: v.retorno.servico };
}

/**
 * Clientes na hora de ser lembrados, do mais atrasado para o menos. Nunca lança.
 */
export function listarClientesParaLembrar(entrada: EntradaParaLembrar): ClienteParaLembrar[] {
  const agora = (entrada.agora ?? new Date()).getTime();
  const meses = Math.max(1, Math.floor(entrada.mesesIntervalo || 0));
  const lembrados = entrada.lembrados ?? {};
  const adiados = entrada.adiados ?? {};

  const ultimo = new Map<string, number>();
  for (const s of entrada.servicos) {
    const id = (s.clienteId ?? '').trim();
    if (!id || s.quando === null || !Number.isFinite(s.quando)) continue;
    const atual = ultimo.get(id);
    if (atual === undefined || s.quando > atual) ultimo.set(id, s.quando);
  }

  const resultado: ClienteParaLembrar[] = [];
  for (const c of entrada.clientes) {
    const id = (c.id ?? '').trim();
    if (!id) continue;
    const base = ultimo.get(id);
    if (base === undefined) continue; // nunca teve serviço concluído → não é pós-venda
    if (base > agora) continue; // serviço "no futuro" (relógio/fuso): ainda não venceu
    if (somarMeses(base, meses) > agora) continue; // ainda não chegou a hora

    const ate = msDe(adiados[id]);
    if (ate !== null && ate > agora) continue; // adiado pelo prestador, ainda vigente

    const lembradoEm = msDe(lembrados[id]);
    // Lembrete DESTE ciclo (depois do último serviço) e recente → não insiste.
    if (lembradoEm !== null && lembradoEm >= base && agora - lembradoEm < DIAS_ENTRE_LEMBRETES * MS_POR_DIA) continue;

    const dias = Math.floor((agora - base) / MS_POR_DIA);
    resultado.push({
      id,
      nome: (c.nome ?? '').trim() || 'Cliente sem nome',
      telefone: (c.telefone ?? '').trim(),
      ultimoServico: new Date(base).toISOString(),
      meses: Math.max(1, Math.round(dias / 30)),
      dias,
      lembradoEm: lembradoEm !== null ? new Date(lembradoEm).toISOString() : null,
    });
  }
  return resultado.sort((a, b) => b.dias - a.dias);
}

/** A mensagem de lembrete do ofício da empresa, em nome do prestador. */
export function mensagemLembrete(
  item: Pick<ClienteParaLembrar, 'nome' | 'meses'>,
  verticais: readonly VerticalId[] | null | undefined,
  nomePrestador?: string | null,
): string {
  return montarMensagemLembreteManutencao(item.nome, item.meses, retornoDoOficio(verticais).servico, nomePrestador);
}
