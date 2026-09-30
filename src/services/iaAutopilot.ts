import { DIAGNOSTICO_URL } from '../config';
import { supabase } from './supabase';

export const IA_AUTOPILOT_MAX_BYTES = 4 * 1024 * 1024;
export const IA_AUTOPILOT_MAX_TEXTO = 20_000;

export type IntencaoAutopilot = 'cadastro' | 'orcamento' | 'documento' | 'conversa';

export type AutopilotCandidato = {
  tipo: 'cliente' | 'produto' | 'servico' | 'item' | 'documento';
  nome: string;
  telefone?: string;
  titulo?: string;
  texto?: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  precoSugerido: number;
  confianca: number;
  evidencia: string;
};

export type AutopilotPrevia = {
  id: string;
  estado: 'aguardando_confirmacao';
  intencao: IntencaoAutopilot;
  fonte: { nome: string; mime: string; bytes: number; hash: string; parser: string };
  candidatos: {
    clientes: AutopilotCandidato[];
    produtos: AutopilotCandidato[];
    servicos: AutopilotCandidato[];
    orcamento: { clienteNome: string; itens: AutopilotCandidato[]; observacoes: string };
    documentos: AutopilotCandidato[];
    avisos: string[];
  };
  requiresReview: true;
  persistida: false;
};

export type ResultadoAutopilot =
  | { ok: true; previa: AutopilotPrevia }
  | { ok: false; erro: string };

function texto(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim().slice(0, max)
    : '';
}

function numero(value: unknown, max = 100_000_000): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : 0;
}

function confianca(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 1000) / 1000 : 0;
}

function objeto(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function item(value: unknown, tipo: AutopilotCandidato['tipo']): AutopilotCandidato | null {
  const raw = objeto(value);
  if (!raw) return null;
  const nome = tipo === 'documento' ? texto(raw.titulo, 180) : texto(raw.nome, 160);
  return nome ? {
    tipo, nome, descricao: texto(raw.descricao, 500), unidade: texto(raw.unidade, 30) || 'un',
    quantidade: numero(raw.quantidade, 10_000) || 1, precoSugerido: numero(raw.precoSugerido),
    confianca: confianca(raw.confianca), evidencia: texto(raw.evidencia, 280),
    ...(tipo === 'cliente' ? { telefone: texto(raw.telefone, 40) } : {}),
    ...(tipo === 'documento' ? { titulo: texto(raw.titulo, 180), texto: texto(raw.texto, 2_000) } : {}),
  } : null;
}

function lista(value: unknown, tipo: AutopilotCandidato['tipo'], max = 50): AutopilotCandidato[] {
  return Array.isArray(value) ? value.map((raw) => item(raw, tipo)).filter((v): v is AutopilotCandidato => v !== null).slice(0, max) : [];
}

function normalizarPrevia(value: unknown): AutopilotPrevia | null {
  const raw = objeto(value);
  const fonte = objeto(raw?.fonte);
  const candidatos = objeto(raw?.candidatos);
  const orcamento = objeto(candidatos?.orcamento);
  if (!raw || !fonte || !candidatos || !orcamento || raw.estado !== 'aguardando_confirmacao' || raw.requiresReview !== true || raw.persistida !== false) return null;
  const id = texto(raw.id, 160);
  const intencao = raw.intencao;
  if (!id || !['cadastro', 'orcamento', 'documento', 'conversa'].includes(String(intencao))) return null;
  const nomeFonte = texto(fonte.nome, 180);
  const mime = texto(fonte.mime, 120);
  const hash = texto(fonte.hash, 64);
  const parser = texto(fonte.parser, 80);
  const bytes = numero(fonte.bytes, IA_AUTOPILOT_MAX_BYTES);
  if (!nomeFonte || !mime || !hash || !parser || !bytes) return null;
  const resultado = {
    clientes: lista(candidatos.clientes, 'cliente'),
    produtos: lista(candidatos.produtos, 'produto'),
    servicos: lista(candidatos.servicos, 'servico'),
    orcamento: {
      clienteNome: texto(orcamento.clienteNome, 160),
      itens: lista(orcamento.itens, 'item'),
      observacoes: texto(orcamento.observacoes, 2_000),
    },
    documentos: lista(candidatos.documentos, 'documento', 10),
    avisos: Array.isArray(candidatos.avisos) ? candidatos.avisos.map((v) => texto(v, 320)).filter(Boolean).slice(0, 12) : [],
  };
  if (!resultado.clientes.length && !resultado.produtos.length && !resultado.servicos.length && !resultado.orcamento.itens.length && !resultado.documentos.length) return null;
  return {
    id, estado: 'aguardando_confirmacao', intencao: intencao as IntencaoAutopilot,
    fonte: { nome: nomeFonte, mime, bytes, hash, parser }, candidatos: resultado, requiresReview: true, persistida: false,
  };
}

async function tokenAtual(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}

/**
 * Envia uma fonte pequena para a prévia multimodal. O arquivo continua no
 * cache local até o request terminar; o Worker não recebe tenant forjado nem
 * grava o conteúdo. Para uploads grandes use a futura fila de quarentena.
 */
export async function prepararPreviaAutopilot(input: {
  uri?: string;
  nomeArquivo?: string;
  mimeType?: string;
  tamanhoBytes?: number;
  texto?: string;
  intencao?: IntencaoAutopilot;
  pedidoOriginal?: string;
}): Promise<ResultadoAutopilot> {
  if (!DIAGNOSTICO_URL) return { ok: false, erro: 'ia_nao_configurada' };
  const token = await tokenAtual();
  if (!token) return { ok: false, erro: 'nao_autorizado' };
  const body: Record<string, unknown> = {
    intencao: input.intencao ?? 'cadastro',
    pedidoOriginal: texto(input.pedidoOriginal, 2_000),
  };
  if (input.uri) {
    const tamanho = Number(input.tamanhoBytes);
    if (Number.isFinite(tamanho) && (tamanho <= 0 || tamanho > IA_AUTOPILOT_MAX_BYTES)) return { ok: false, erro: 'arquivo_grande_demais' };
    // O require preguiçoso mantém FileSystem fora do caminho de boot e segue o
    // mesmo contrato já usado pelo gravador de voz do app.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const base64 = await FileSystem.readAsStringAsync(input.uri, { encoding: FileSystem.EncodingType.Base64 });
    if (!base64 || base64.length > Math.ceil(IA_AUTOPILOT_MAX_BYTES / 3) * 4 + 8) return { ok: false, erro: 'arquivo_grande_demais' };
    body.arquivo = { nome: texto(input.nomeArquivo, 180) || 'fonte-olli', mimeType: texto(input.mimeType, 120), conteudoBase64: base64 };
  } else {
    const colado = texto(input.texto, IA_AUTOPILOT_MAX_TEXTO);
    if (!colado) return { ok: false, erro: 'fonte_obrigatoria' };
    body.texto = colado;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${DIAGNOSTICO_URL}/ia/autopilot/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body), signal: controller.signal,
    });
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    const previa = normalizarPrevia(data?.previa);
    if (response.ok && previa) return { ok: true, previa };
    return { ok: false, erro: texto(data?.erro, 80) || (response.status === 401 ? 'nao_autorizado' : 'falha_ia') };
  } catch (error) {
    return { ok: false, erro: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'offline' };
  } finally { clearTimeout(timer); }
}
