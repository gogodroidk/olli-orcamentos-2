import { DIAGNOSTICO_URL } from '../config';
import { getServicos } from '../database/database';
import { track, Eventos } from './analytics';

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
const SOBRECARGA =
  'A OLLI está muito requisitada agora. Tente de novo em alguns segundos.';

/**
 * Traduz o erro técnico do Worker/IA em mensagem amigável. Nunca mostra JSON
 * cru, código HTTP ou nome do provedor para o usuário.
 */
function mensagemErroIA(erro: unknown, fallback: string): string {
  const s = typeof erro === 'string' ? erro : '';
  if (/503|overload|high demand|unavailable|sobrecarreg|exhausted|quota|rate|429/i.test(s)) {
    return SOBRECARGA;
  }
  if (!s || /[{}]|gemini|anthropic|http|json|token|api/i.test(s)) return fallback;
  return s;
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
 */
export async function interpretarVoz(transcript: string): Promise<VozResultado> {
  const texto = (transcript ?? '').trim();
  if (!texto) return { ok: false, erro: 'Não entendi o que você falou. Tente de novo, com calma.' };
  if (!DIAGNOSTICO_URL) return { ok: false, erro: SEM_IA };

  let catalogo: { nome: string; preco?: number }[] | undefined;
  try {
    const servicos = await getServicos();
    if (servicos.length > 0) catalogo = catalogoLeve(servicos);
  } catch {
    // sem catálogo não tem problema — a IA segue só com o texto
  }

  try {
    const r = await fetch(`${DIAGNOSTICO_URL}/voz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(catalogo ? { transcript: texto, catalogo } : { transcript: texto }),
    });
    if (!r.ok) return { ok: false, erro: FALHOU };
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
  } catch {
    return { ok: false, erro: FALHOU };
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

/**
 * Envia o histórico da conversa para a OLLI e devolve a resposta dela.
 * `mensagens` deve conter a conversa inteira (a do usuário já incluída no fim).
 * Nunca lança: em erro devolve `{ ok:false, resposta }` com texto amigável.
 */
export async function enviarChat(mensagens: ChatMensagem[]): Promise<ChatResultado> {
  if (!DIAGNOSTICO_URL) return { ok: false, resposta: CHAT_SEM_IA };
  try {
    const r = await fetch(`${DIAGNOSTICO_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagens }),
    });
    if (!r.ok) return { ok: false, resposta: CHAT_FALHOU };
    const data: any = await r.json();
    if (data?.ok && typeof data.resposta === 'string') {
      track(Eventos.aiUsed, { fonte: 'chat' });
      return { ok: true, resposta: data.resposta };
    }
    return { ok: false, resposta: mensagemErroIA(data?.erro, CHAT_SEM_IA) };
  } catch {
    return { ok: false, resposta: CHAT_FALHOU };
  }
}
