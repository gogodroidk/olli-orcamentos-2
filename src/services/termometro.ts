/**
 * termometro.ts — leitura dos SINAIS do link do cliente (`orcamento_eventos`) para
 * o TERMÔMETRO DO ORÇAMENTO (quente / morno / frio + próxima ação).
 *
 * A REGRA mora em `termometroRegra.ts` (pura, testada). Aqui só tem:
 *  - a leitura no Supabase (RLS: só o dono vê os eventos dos links dele), com um
 *    cache curto em memória para lista, detalhe, Hoje e follow-up não repetirem a
 *    mesma consulta no mesmo minuto;
 *  - um "barramento" mínimo: quando o Realtime avisa que o cliente fez algo no
 *    link (ver `avisoAberturaCliente.ts`), as telas abertas releem.
 *
 * ERRO NUNCA VIRA VAZIO: `lerInteracoesDoDono` LANÇA quando não consegue ler (rede,
 * RLS, tabela ainda não criada). Quem chama mostra "não consegui ler o termômetro"
 * — nunca "o cliente não abriu". Sem nuvem ou sem login não há link nenhum, e aí
 * a resposta vazia é a verdade (todo orçamento fica `sem_link`).
 *
 * PLANO: o termômetro é do Pro (`termometro_orcamento`). Esta camada não decide
 * plano: as telas usam `useRecursoPlano`, e o follow-up usa `termometrosSeLiberado`.
 */
import { supabase, getCurrentUser } from './supabase';
import { acessoRecursoAgora } from './planos';
import type { Orcamento } from '../types';
import { validaAteYmd } from './radarFollowUpRegra';
import {
  DIAS_JANELA_LEITURA,
  avaliarTermometro,
  normalizarInteracao,
  type EstadoTermometro,
  type Interacao,
} from './termometroRegra';

export interface LeituraInteracoes {
  /** orcamentoId → interações (mais recentes primeiro). */
  porOrcamento: Map<string, Interacao[]>;
  /** Orçamentos com link público publicado. */
  comLink: Set<string>;
}

/** Falha de leitura — diferente de "não há sinal". */
export class FalhaTermometro extends Error {
  constructor(mensagem = 'Não consegui ler o termômetro agora.') {
    super(mensagem);
    this.name = 'FalhaTermometro';
  }
}

const VALIDADE_CACHE_MS = 45_000;
const LIMITE_LINHAS = 5000;

let cache: { userId: string; em: number; leitura: LeituraInteracoes } | null = null;
let emVoo: { userId: string; promessa: Promise<LeituraInteracoes> } | null = null;

/** Descarta o cache (o Realtime avisou que chegou sinal novo, ou a conta trocou). */
export function invalidarTermometro(): void {
  cache = null;
}

async function lerDoServidor(userId: string): Promise<LeituraInteracoes> {
  const cliente = supabase;
  if (!cliente) return { porOrcamento: new Map(), comLink: new Set() };
  const desde = new Date(Date.now() - DIAS_JANELA_LEITURA * 86_400_000).toISOString();
  const [links, eventos] = await Promise.all([
    cliente.from('orcamentos_publicos').select('orcamento_id').eq('user_id', userId),
    cliente
      .from('orcamento_eventos')
      .select('orcamento_id, tipo, sessao, segundos, criado_em')
      .eq('user_id', userId)
      .gte('criado_em', desde)
      .order('criado_em', { ascending: false })
      .limit(LIMITE_LINHAS),
  ]);
  if (links.error || !Array.isArray(links.data)) throw new FalhaTermometro();
  if (eventos.error || !Array.isArray(eventos.data)) throw new FalhaTermometro();
  const comLink = new Set<string>();
  for (const l of links.data as { orcamento_id?: unknown }[]) {
    if (typeof l?.orcamento_id === 'string') comLink.add(l.orcamento_id);
  }
  const porOrcamento = new Map<string, Interacao[]>();
  for (const linha of eventos.data) {
    const i = normalizarInteracao(linha);
    if (!i) continue;
    const { orcamentoId, ...interacao } = i;
    const lista = porOrcamento.get(orcamentoId) ?? [];
    lista.push(interacao);
    porOrcamento.set(orcamentoId, lista);
  }
  return { porOrcamento, comLink };
}

/**
 * Interações dos links do dono logado nos últimos 60 dias. LANÇA `FalhaTermometro`
 * quando não consegue ler. `forcar` ignora o cache (puxar para atualizar).
 */
export async function lerInteracoesDoDono(opts: { forcar?: boolean } = {}): Promise<LeituraInteracoes> {
  if (!supabase) return { porOrcamento: new Map(), comLink: new Set() };
  const user = await getCurrentUser();
  if (!user) return { porOrcamento: new Map(), comLink: new Set() };
  const agora = Date.now();
  if (!opts.forcar && cache && cache.userId === user.id && agora - cache.em < VALIDADE_CACHE_MS) {
    return cache.leitura;
  }
  if (emVoo && emVoo.userId === user.id) return emVoo.promessa;
  const promessa = (async () => {
    try {
      const leitura = await lerDoServidor(user.id);
      cache = { userId: user.id, em: Date.now(), leitura };
      return leitura;
    } catch (e) {
      throw e instanceof FalhaTermometro ? e : new FalhaTermometro();
    }
  })();
  emVoo = { userId: user.id, promessa };
  try {
    return await promessa;
  } finally {
    if (emVoo?.promessa === promessa) emVoo = null;
  }
}

/** O termômetro de um orçamento a partir de uma leitura já feita. */
export function termometroDe(
  orc: Pick<Orcamento, 'id' | 'status' | 'atualizadoEm' | 'criadoEm' | 'validadeOrcamento' | 'dataEmissao'>,
  leitura: LeituraInteracoes,
  agora: Date = new Date(),
): EstadoTermometro {
  return avaliarTermometro(
    {
      status: orc.status,
      temLink: leitura.comLink.has(orc.id),
      enviadoEm: orc.atualizadoEm || orc.criadoEm || null,
      validaAte: validaAteYmd(orc),
      abriuAntes: orc.status === 'visualizado',
      interacoes: leitura.porOrcamento.get(orc.id) ?? [],
    },
    agora,
  );
}

function comTeto<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new FalhaTermometro()), ms);
    promessa.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Para o follow-up e o radar: o termômetro de cada orçamento SÓ quando o plano
 * libera (`liberado`) e a leitura funcionou. Qualquer outra coisa = `null` — e
 * quem chama usa o texto de sempre (que não afirma nada sobre o cliente ter aberto
 * ou não). Teto de 5 s: o follow-up nunca espera a rede por mais que isso. NUNCA lança.
 */
export async function termometrosSeLiberado(
  orcamentos: readonly Orcamento[],
  agora: Date = new Date(),
): Promise<Map<string, EstadoTermometro> | null> {
  try {
    if ((await acessoRecursoAgora('termometro_orcamento')) !== 'liberado') return null;
    const leitura = await comTeto(lerInteracoesDoDono(), 5000);
    const mapa = new Map<string, EstadoTermometro>();
    for (const o of orcamentos) mapa.set(o.id, termometroDe(o, leitura, agora));
    return mapa;
  } catch {
    return null;
  }
}

// ─── Barramento: "o cliente fez algo no link" ──────────────────────────────────

type Ouvinte = (orcamentoId: string) => void;
const ouvintes = new Set<Ouvinte>();

/** Escuta sinais novos (vindos do Realtime). Devolve o cancelamento. */
export function aoSinalDoCliente(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Chamado pelo `avisoAberturaCliente.ts` a cada evento novo do link. */
export function emitirSinalDoCliente(orcamentoId: string): void {
  invalidarTermometro();
  for (const o of [...ouvintes]) {
    try { o(orcamentoId); } catch { /* um ouvinte com problema não derruba os outros */ }
  }
}
