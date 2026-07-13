import { DIAGNOSTICO_URL } from '../config';
import { getServicos } from '../database/database';
import { track, Eventos } from './analytics';
import { supabase } from './supabase';
import { verticalParaIA } from '../hooks/useVerticais';

/** Token de acesso da sessão atual (ou null se deslogado/sem backend). Nunca lança. */
async function accessTokenAtual(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Fase 3 — a OLLI conversacional (voz + chat). Os dois endpoints vivem no MESMO
 * Worker do diagnóstico (`DIAGNOSTICO_URL`): `/voz` (transcrição → itens de
 * orçamento) e `/chat` (assistente em texto). A chave da IA é SECRET do Worker.
 *
 * Tudo aqui é defensivo: se a IA não estiver ligada ou o Worker cair, devolvemos
 * `{ ok:false, erro }` com mensagem amigável — a UI tem sempre o caminho manual.
 */

// ─── /voz ────────────────────────────────────────────────
export interface VozItem {
  descricao: string;
  quantidade: number;
  valorUnitario: number | null;
  tipo: 'servico' | 'peca';
}

export interface VozResultadoOk {
  ok: true;
  titulo?: string;
  clienteNome?: string;
  itens: VozItem[];
  observacao?: string;
}

export interface VozResultadoErro {
  ok: false;
  erro: string;
}

export type VozResultado = VozResultadoOk | VozResultadoErro;

const SEM_IA =
  'A OLLI por voz ainda não está ligada aqui. Você pode escrever os itens normalmente que eu monto o orçamento pra você.';
const FALHOU =
  'Não consegui falar com a OLLI agora. Confira a internet e tente de novo — ou crie o orçamento na mão.';
const TIMEOUT_VOZ =
  'A OLLI demorou demais para responder (conexão lenta). Tente de novo ou crie o orçamento na mão.';
const OFFLINE =
  'Sem conexão com a internet agora. Confira o Wi-Fi/dados e tente de novo.';
const SOBRECARGA =
  'A OLLI está muito requisitada agora. Tente de novo em alguns segundos.';
/** Erro de servidor (5xx que não seja sobrecarga) — mesma mensagem para voz e chat. */
const ERRO_SERVIDOR =
  'A OLLI teve um problema para responder agora. Tente de novo em instantes.';
const PRECISA_LOGIN =
  'Sua sessão expirou. Toque em Conta e entre de novo para usar a OLLI.';
const MUITAS_REQUISICOES =
  'Você usou a OLLI demais agora, aguarde um minutinho.';
const CANCELADO_VOZ =
  'Envio cancelado. Você pode tentar de novo quando quiser.';

/** Timeouts das chamadas de IA: voz demora mais (transcrição + montagem de itens). */
const TIMEOUT_VOZ_MS = 60_000;
const TIMEOUT_CHAT_MS = 30_000;

/**
 * Traduz o erro técnico do Worker/IA em mensagem amigável. Nunca mostra JSON
 * cru, código HTTP ou nome do provedor para o usuário.
 */
function mensagemErroIA(erro: unknown, fallback: string): string {
  const s = typeof erro === 'string' ? erro : '';
  if (/nao_autorizado|n[ãa]o_autorizado|401/i.test(s)) return PRECISA_LOGIN;
  if (/muitas_requisicoes|429/i.test(s)) return MUITAS_REQUISICOES;
  if (/503|overload|high demand|unavailable|sobrecarreg|exhausted|quota|rate/i.test(s)) {
    return SOBRECARGA;
  }
  if (!s || /[{}]|gemini|anthropic|http|json|token|api/i.test(s)) return fallback;
  return s;
}

/** Mapeia o status HTTP da resposta do Worker para uma mensagem amigável (alinhado com o que o worker de fato retorna: 429/503 = sobrecarga, 5xx = erro do servidor). */
function mensagemPorStatus(status: number, fallback: string): string {
  if (status === 401) return PRECISA_LOGIN;
  if (status === 429) return MUITAS_REQUISICOES;
  if (status === 503) return SOBRECARGA;
  if (status >= 500) return ERRO_SERVIDOR;
  return fallback;
}

function catalogoLeve(servicos: { nome: string; preco: number }[]): { nome: string; preco?: number }[] {
  // Mantém o payload enxuto: só os nomes (e preço quando houver), no máx. 60 itens.
  return servicos
    .slice(0, 60)
    .map(s => (s.preco > 0 ? { nome: s.nome, preco: s.preco } : { nome: s.nome }));
}

/**
 * Envia a transcrição (ou texto digitado) para a OLLI montar uma lista de itens.
 * Anexa o catálogo de serviços do banco quando disponível (ajuda a IA a casar
 * descrições com preços já cadastrados). Nunca lança: devolve `{ ok:false }`.
 *
 * `sinalCancelamento` (opcional) permite que a UI cancele a chamada manualmente
 * (botão "Cancelar" durante o loading).
 */
export async function interpretarVoz(transcript: string, sinalCancelamento?: AbortSignal): Promise<VozResultado> {
  const texto = (transcript ?? '').trim();
  if (!texto) return { ok: false, erro: 'Não entendi o que você falou. Tente de novo, com calma.' };
  if (!DIAGNOSTICO_URL) return { ok: false, erro: SEM_IA };

  // O Worker exige login (JWT do Supabase). Sem sessão → mensagem amigável.
  const token = await accessTokenAtual();
  if (!token) return { ok: false, erro: PRECISA_LOGIN };

  let catalogo: { nome: string; preco?: number }[] | undefined;
  try {
    const servicos = await getServicos();
    if (servicos.length > 0) catalogo = catalogoLeve(servicos);
  } catch {
    // sem catálogo não tem problema — a IA segue só com o texto
  }

  // Ofício da empresa → a IA monta o orçamento na língua do segmento (pintura,
  // elétrica…). undefined = sem ofício → worker usa o default (ar-condicionado).
  const vertical = await verticalParaIA();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_VOZ_MS);
  const onCancelar = () => controller.abort();
  sinalCancelamento?.addEventListener('abort', onCancelar);
  try {
    const corpo: Record<string, unknown> = { transcript: texto };
    if (catalogo) corpo.catalogo = catalogo;
    if (vertical) corpo.vertical = vertical;
    const r = await fetch(`${DIAGNOSTICO_URL}/voz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo),
      signal: controller.signal,
    });
    if (!r.ok) return { ok: false, erro: mensagemPorStatus(r.status, FALHOU) };
    const data: any = await r.json();
    if (data?.ok && Array.isArray(data.itens)) {
      track(Eventos.aiUsed, { fonte: 'voz' });
      return {
        ok: true,
        titulo: typeof data.titulo === 'string' ? data.titulo : undefined,
        clienteNome: typeof data.clienteNome === 'string' ? data.clienteNome : undefined,
        itens: data.itens.map(normalizarItem).filter((i: VozItem | null): i is VozItem => i !== null),
        observacao: typeof data.observacao === 'string' ? data.observacao : undefined,
      };
    }
    return { ok: false, erro: mensagemErroIA(data?.erro, SEM_IA) };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { ok: false, erro: sinalCancelamento?.aborted ? CANCELADO_VOZ : TIMEOUT_VOZ };
    }
    return { ok: false, erro: OFFLINE };
  } finally {
    clearTimeout(timer);
    sinalCancelamento?.removeEventListener('abort', onCancelar);
  }
}

function normalizarItem(raw: any): VozItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const descricao = typeof raw.descricao === 'string' ? raw.descricao.trim() : '';
  if (!descricao) return null;
  const qtd = Number(raw.quantidade);
  const valor = raw.valorUnitario;
  return {
    descricao,
    quantidade: Number.isFinite(qtd) && qtd > 0 ? qtd : 1,
    valorUnitario: typeof valor === 'number' && Number.isFinite(valor) ? valor : null,
    tipo: raw.tipo === 'peca' ? 'peca' : 'servico',
  };
}

// ─── /chat ───────────────────────────────────────────────
export interface ChatMensagem {
  role: 'user' | 'assistant';
  texto: string;
}

export interface ChatResultado {
  ok: boolean;
  resposta: string;
}

const CHAT_SEM_IA =
  'O chat da OLLI ainda não está ligado aqui. Mas dá uma olhada no Diagnóstico por código de erro — ele funciona offline.';
const CHAT_FALHOU =
  'Não consegui responder agora — parece que estou sem conexão. Tenta de novo daqui a pouco?';
const CHAT_TIMEOUT =
  'A OLLI demorou demais para responder (conexão lenta). Tenta de novo?';
const CHAT_CANCELADO =
  'Envio cancelado. Você pode perguntar de novo quando quiser.';

/**
 * Envia o histórico da conversa para a OLLI e devolve a resposta dela.
 * `mensagens` deve conter a conversa inteira (a do usuário já incluída no fim).
 * Nunca lança: em erro devolve `{ ok:false, resposta }` com texto amigável.
 *
 * `sinalCancelamento` (opcional) permite que a UI cancele a chamada manualmente
 * (botão "Cancelar" durante o loading).
 */
export async function enviarChat(mensagens: ChatMensagem[], sinalCancelamento?: AbortSignal): Promise<ChatResultado> {
  if (!DIAGNOSTICO_URL) return { ok: false, resposta: CHAT_SEM_IA };

  // O Worker exige login (JWT do Supabase). Sem sessão → mensagem amigável.
  const token = await accessTokenAtual();
  if (!token) return { ok: false, resposta: PRECISA_LOGIN };

  const vertical = await verticalParaIA();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_CHAT_MS);
  const onCancelar = () => controller.abort();
  sinalCancelamento?.addEventListener('abort', onCancelar);
  try {
    const corpo: Record<string, unknown> = { mensagens };
    if (vertical) corpo.vertical = vertical;
    const r = await fetch(`${DIAGNOSTICO_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo),
      signal: controller.signal,
    });
    if (!r.ok) return { ok: false, resposta: mensagemPorStatus(r.status, CHAT_FALHOU) };
    const data: any = await r.json();
    if (data?.ok && typeof data.resposta === 'string') {
      track(Eventos.aiUsed, { fonte: 'chat' });
      return { ok: true, resposta: data.resposta };
    }
    return { ok: false, resposta: mensagemErroIA(data?.erro, CHAT_SEM_IA) };
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { ok: false, resposta: sinalCancelamento?.aborted ? CHAT_CANCELADO : CHAT_TIMEOUT };
    }
    return { ok: false, resposta: OFFLINE };
  } finally {
    clearTimeout(timer);
    sinalCancelamento?.removeEventListener('abort', onCancelar);
  }
}
