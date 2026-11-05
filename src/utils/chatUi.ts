/**
 * Peças puras da conversa com a OLLI: markdown seguro, revelação da resposta
 * e histórico local. Não chama rede, não escolhe modelo e não guarda segredo.
 * A tela só desenha o que estas funções devolvem.
 */
import { CICLO, DURACAO } from '../theme/motionTokens.ts';

export type ParteChat = { id: string } & (
  | { tipo: 'texto'; texto: string }
  | { tipo: 'negrito'; texto: string }
  | { tipo: 'italico'; texto: string }
  | { tipo: 'codigo'; texto: string }
  | { tipo: 'link'; texto: string; href: string }
);

export type ItemListaChat = { id: string; partes: ParteChat[] };

export type BlocoChat =
  | { id: string; tipo: 'paragrafo'; partes: ParteChat[] }
  | { id: string; tipo: 'titulo'; nivel: 1 | 2 | 3; partes: ParteChat[] }
  | { id: string; tipo: 'lista'; ordenada: boolean; itens: ItemListaChat[] }
  | { id: string; tipo: 'codigo'; linguagem: string; texto: string };

export type MensagemGuardada = {
  id: string;
  role: 'user' | 'assistant';
  texto: string;
  falhou?: boolean;
  local?: boolean;
};

export type ConversaGuardada = {
  id: string;
  titulo: string;
  atualizadoEm: number;
  mensagens: MensagemGuardada[];
};

export type EstadoChatGuardado = {
  ativaId: string;
  conversas: ConversaGuardada[];
};

export const LIMITE_CONVERSAS = 20;
export const LIMITE_MENSAGENS = 60;

const RE_INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]{1,120}\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\))/g;

function hrefSeguro(url: string): string | null {
  const limpo = url.trim();
  if (/^mailto:[^\s]+$/i.test(limpo) && !/^mailto:\s*javascript:/i.test(limpo)) return limpo;
  try {
    const alvo = new URL(limpo);
    if (alvo.protocol === 'https:' || alvo.protocol === 'http:') return alvo.href;
  } catch {
    return null;
  }
  return null;
}

function inline(texto: string, id: () => string): ParteChat[] {
  const partes: ParteChat[] = [];
  const re = new RegExp(RE_INLINE.source, 'g');
  let ultimo = 0;
  let achado = re.exec(texto);
  while (achado) {
    if (achado.index > ultimo) partes.push({ id: id(), tipo: 'texto', texto: texto.slice(ultimo, achado.index) });
    if (achado[1]) partes.push({ id: id(), tipo: 'codigo', texto: achado[1].slice(1, -1) });
    else if (achado[2]) partes.push({ id: id(), tipo: 'negrito', texto: achado[2].slice(2, -2) });
    else if (achado[3]) partes.push({ id: id(), tipo: 'italico', texto: achado[3].slice(1, -1) });
    else if (achado[4]) {
      const link = achado[4].match(/^\[([^\]]+)\]\((.+)\)$/);
      const href = link ? hrefSeguro(link[2]) : null;
      if (link && href) partes.push({ id: id(), tipo: 'link', texto: link[1], href });
      else partes.push({ id: id(), tipo: 'texto', texto: achado[4] });
    }
    ultimo = achado.index + achado[0].length;
    achado = re.exec(texto);
  }
  if (ultimo < texto.length) partes.push({ id: id(), tipo: 'texto', texto: texto.slice(ultimo) });
  return partes.length ? partes : [{ id: id(), tipo: 'texto', texto: '' }];
}

function ehEspecial(linha: string): boolean {
  return linha.startsWith('```')
    || /^(#{1,3})\s+\S/.test(linha)
    || /^\s*[-*]\s+\S/.test(linha)
    || /^\s*\d{1,3}[.)]\s+\S/.test(linha);
}

/** Markdown curto de chat. HTML cru vira texto. Link só http(s) ou mailto. */
export function interpretarMarkdown(fonte: string): BlocoChat[] {
  const linhas = fonte.replace(/\r\n/g, '\n').split('\n');
  const blocos: BlocoChat[] = [];
  let seq = 0;
  const id = () => `c${seq++}`;
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i] ?? '';
    if (linha.startsWith('```')) {
      const linguagem = (linha.slice(3).trim().match(/^[\w-]{0,24}/)?.[0] ?? '').slice(0, 24);
      const corpo: string[] = [];
      i += 1;
      while (i < linhas.length && !(linhas[i] ?? '').startsWith('```')) {
        corpo.push(linhas[i] ?? '');
        i += 1;
      }
      if (i < linhas.length) i += 1;
      blocos.push({ id: id(), tipo: 'codigo', linguagem, texto: corpo.join('\n') });
      continue;
    }
    if (!linha.trim()) {
      i += 1;
      continue;
    }
    const titulo = linha.match(/^(#{1,3})\s+(.+)$/);
    if (titulo) {
      const nivel = titulo[1].length as 1 | 2 | 3;
      blocos.push({ id: id(), tipo: 'titulo', nivel, partes: inline(titulo[2], id) });
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+\S/.test(linha)) {
      const itens: ItemListaChat[] = [];
      while (i < linhas.length && /^\s*[-*]\s+\S/.test(linhas[i] ?? '')) {
        itens.push({ id: id(), partes: inline((linhas[i] ?? '').replace(/^\s*[-*]\s+/, ''), id) });
        i += 1;
      }
      blocos.push({ id: id(), tipo: 'lista', ordenada: false, itens });
      continue;
    }
    if (/^\s*\d{1,3}[.)]\s+\S/.test(linha)) {
      const itens: ItemListaChat[] = [];
      while (i < linhas.length && /^\s*\d{1,3}[.)]\s+\S/.test(linhas[i] ?? '')) {
        itens.push({ id: id(), partes: inline((linhas[i] ?? '').replace(/^\s*\d{1,3}[.)]\s+/, ''), id) });
        i += 1;
      }
      blocos.push({ id: id(), tipo: 'lista', ordenada: true, itens });
      continue;
    }
    const paragrafo: string[] = [linha];
    i += 1;
    while (i < linhas.length && (linhas[i] ?? '').trim() && !ehEspecial(linhas[i] ?? '')) {
      paragrafo.push(linhas[i] ?? '');
      i += 1;
    }
    blocos.push({ id: id(), tipo: 'paragrafo', partes: inline(paragrafo.join('\n'), id) });
  }
  return blocos.length ? blocos : [{ id: id(), tipo: 'paragrafo', partes: [{ id: id(), tipo: 'texto', texto: '' }] }];
}

/**
 * Cortes cumulativos para revelar a resposta já recebida. O provedor continua
 * devolvendo o texto inteiro; a tela só mostra em fatias curtas. Com reduzir
 * movimento, um único corte (o texto todo).
 */
export function planoDeRevelacao(texto: string, reduzirMovimento: boolean): { cortes: number[]; intervaloMs: number } {
  if (reduzirMovimento || texto.length <= 48) return { cortes: [texto.length], intervaloMs: 0 };
  const intervaloMs = DURACAO.instant;
  const passos = Math.max(4, Math.round(CICLO.contagem / intervaloMs));
  const tamanho = Math.ceil(texto.length / passos);
  const cortes: number[] = [];
  for (let i = tamanho; i < texto.length; i += tamanho) cortes.push(i);
  cortes.push(texto.length);
  return { cortes, intervaloMs };
}

export function tituloDaConversa(mensagens: Array<{ role: string; texto: string }>): string {
  const primeira = mensagens.find((m) => m.role === 'user' && m.texto.trim());
  const base = (primeira?.texto ?? '').replace(/\s+/g, ' ').trim();
  if (!base) return 'Nova conversa';
  return base.length > 72 ? `${base.slice(0, 71)}…` : base;
}

function mensagemValida(valor: unknown): valor is MensagemGuardada {
  if (!valor || typeof valor !== 'object') return false;
  const item = valor as MensagemGuardada;
  return (item.role === 'user' || item.role === 'assistant')
    && typeof item.id === 'string'
    && item.id.length > 0
    && item.id.length <= 80
    && typeof item.texto === 'string';
}

function conversaValida(valor: unknown): valor is ConversaGuardada {
  if (!valor || typeof valor !== 'object') return false;
  const item = valor as ConversaGuardada;
  return typeof item.id === 'string'
    && item.id.length > 0
    && item.id.length <= 80
    && typeof item.titulo === 'string'
    && Number.isFinite(item.atualizadoEm)
    && Array.isArray(item.mensagens)
    && item.mensagens.every(mensagemValida);
}

function sanitizarMensagem(item: MensagemGuardada): MensagemGuardada {
  const mensagem: MensagemGuardada = {
    id: item.id,
    role: item.role,
    texto: item.texto.slice(0, 8000),
  };
  if (item.falhou === true) mensagem.falhou = true;
  if (item.local === true) mensagem.local = true;
  return mensagem;
}

/** Lê o formato novo `{ ativaId, conversas }` ou o array antigo de uma conversa só. */
export function lerEstadoChat(raw: string | null, agora = Date.now()): EstadoChatGuardado {
  const vazio: EstadoChatGuardado = { ativaId: '', conversas: [] };
  if (!raw) return vazio;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const mensagens = parsed.filter(mensagemValida).slice(-LIMITE_MENSAGENS).map(sanitizarMensagem);
      if (!mensagens.some((m) => m.role === 'user')) return vazio;
      return {
        ativaId: 'legado',
        conversas: [{ id: 'legado', titulo: tituloDaConversa(mensagens), atualizadoEm: agora, mensagens }],
      };
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as EstadoChatGuardado).conversas)) return vazio;
    const estado = parsed as EstadoChatGuardado;
    const conversas = estado.conversas.filter(conversaValida).slice(0, LIMITE_CONVERSAS).map((c) => ({
      id: c.id,
      titulo: (c.titulo.trim() || tituloDaConversa(c.mensagens)).slice(0, 80),
      atualizadoEm: c.atualizadoEm,
      mensagens: c.mensagens.slice(-LIMITE_MENSAGENS).map(sanitizarMensagem),
    }));
    const ativaId = typeof estado.ativaId === 'string' && conversas.some((c) => c.id === estado.ativaId)
      ? estado.ativaId
      : '';
    return { ativaId, conversas };
  } catch {
    return vazio;
  }
}

export function atualizarConversa(estado: EstadoChatGuardado, conversa: ConversaGuardada): EstadoChatGuardado {
  const mensagens = conversa.mensagens.slice(-LIMITE_MENSAGENS).map(sanitizarMensagem);
  const demais = estado.conversas.filter((c) => c.id !== conversa.id);
  if (!mensagens.some((m) => m.role === 'user' && m.texto.trim())) {
    return { ativaId: conversa.id, conversas: demais.slice(0, LIMITE_CONVERSAS) };
  }
  const pronta: ConversaGuardada = {
    id: conversa.id,
    titulo: tituloDaConversa(mensagens),
    atualizadoEm: conversa.atualizadoEm,
    mensagens,
  };
  return { ativaId: conversa.id, conversas: [pronta, ...demais].slice(0, LIMITE_CONVERSAS) };
}

export function apagarConversa(estado: EstadoChatGuardado, id: string): EstadoChatGuardado {
  const conversas = estado.conversas.filter((c) => c.id !== id);
  return { ativaId: estado.ativaId === id ? '' : estado.ativaId, conversas };
}
