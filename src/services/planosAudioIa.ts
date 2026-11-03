/**
 * D1438-G20 — na tela de Planos, o prestador fala e a tela monta um rascunho
 * de orçamento ou de cadastro. Função pura: não grava, não chama rede, não
 * guarda CPF/CNPJ e não transforma preço omitido em zero.
 *
 * A escuta (microfone) fica na tela. Quem monta o rascunho é esta função, de
 * propósito sem a IA paga que já existe em `worker/src/voz.js`. O contrato do
 * orçamento (título, cliente, itens) segue aquele JSON. Spec:
 * docs/ENXAME/PLANOS_AUDIO_IA.md
 */

export const FALA_MAX = 2_000;

export function planosAudioIaLigada(valor: string | null | undefined): boolean {
  return valor === '1';
}

export interface ItemAudioIa {
  descricao: string;
  quantidade: number;
  /** null = a pessoa não falou o preço. Nunca vira 0 calado. */
  valorUnitario: number | null;
  tipo: 'servico' | 'peca';
}

export type TipoAudioIa = 'orcamento' | 'cadastro_cliente' | 'cadastro_item' | 'incerto';

export interface RascunhoAudioIa {
  tipo: TipoAudioIa;
  titulo: string | null;
  clienteNome: string | null;
  telefone: string | null;
  email: string | null;
  /** true quando a fala citou CPF ou CNPJ. O número não entra no rascunho. */
  documentoFalado: boolean;
  itens: ItemAudioIa[];
  itemNome: string | null;
  itemTipo: 'servico' | 'peca' | null;
  faltando: string[];
  aviso: string;
  /** O protótipo nunca grava. O tipo literal impede um "salva agora" na fala. */
  grava: false;
  cortado: boolean;
}

export type SaidaAudioIa =
  | { ok: true; rascunho: RascunhoAudioIa; textoUsado: string }
  | { ok: false; erro: 'sem_fala' };

const COMANDO = /\b(ignore as regras|apague|apagar|exclua|excluir|delete|coloque o preço|coloque o preco|salva agora|salvar agora|grava agora|gravar agora)\b/i;
const CPF_PONTUADO = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
const CNPJ_PONTUADO = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;

function semAcento(valor: string): string {
  return valor.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function temDocumento(texto: string): boolean {
  return /\b(cpf|cnpj)\b/i.test(texto) || CPF_PONTUADO.test(texto) || CNPJ_PONTUADO.test(texto);
}

function removerDocumento(texto: string): string {
  return texto
    .replace(new RegExp(CPF_PONTUADO.source, 'g'), ' ')
    .replace(new RegExp(CNPJ_PONTUADO.source, 'g'), ' ')
    .replace(/\b(cpf|cnpj)\b[:\s-]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function semComandos(texto: string): string {
  const frases = texto.split(/(?<=[.?!])\s+/);
  const limpas = frases.map((frase) => {
    const corte = frase.search(COMANDO);
    return corte < 0 ? frase : frase.slice(0, corte);
  });
  return limpas.join(' ').replace(/\s+/g, ' ').trim();
}

function numeroBr(bruto: string): number | null {
  const s = bruto.trim();
  if (!s) return null;
  let normal: string;
  if (s.includes(',')) normal = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normal = s.replace(/\./g, '');
  else normal = s;
  const n = Number(normal);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return null;
  return n;
}

function precoDoTrecho(s: string): { valor: number | null; resto: string } {
  const padroes = [
    /r\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)/i,
    /(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)\s*reais\b/i,
    /\b(?:por|de)\s+(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)\s*$/i,
  ];
  if (/\b(de gra[cç]a|cortesia|sem custo)\b/i.test(s)) {
    return {
      valor: 0,
      resto: s.replace(/\b(de gra[cç]a|cortesia|sem custo)\b/gi, ' '),
    };
  }
  for (const padrao of padroes) {
    const m = padrao.exec(s);
    if (!m || m.index === undefined) continue;
    const valor = numeroBr(m[1] ?? '');
    if (valor === null) continue;
    const resto = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`;
    return { valor, resto };
  }
  return { valor: null, resto: s };
}

function quantidadeExplicita(s: string): number | null {
  const m = s.match(/\bquantidade\s+(\d+(?:[.,]\d+)?)/i)
    ?? s.match(/\b(\d+(?:[.,]\d+)?)\s*(unidades|unidade|visitas|visita|horas|hora)\b/i);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 999) return null;
  return n;
}

function limparDescricao(s: string): string {
  return s
    .replace(/\bquantidade\s+\d+(?:[.,]\d+)?\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:unidades|unidade|visitas|visita|horas|hora)\b/gi, ' ')
    .replace(/^(?:e|mais|uma|um|o|a)\s+/i, '')
    .replace(/\b(?:por|de|a)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .trim();
}

function tipoDoTrecho(s: string): 'servico' | 'peca' {
  return /\b(pecas|peca|produto)\b/.test(semAcento(s)) ? 'peca' : 'servico';
}

function ehSoQuantidade(s: string): boolean {
  return /^quantidade\s+\d+(?:[.,]\d+)?$/i.test(s.trim());
}

function montarItens(corpo: string): ItemAudioIa[] {
  // Vírgula de centavo (1.250,50) não separa item. A de lista, sim.
  const marcaCentavo = '\u0000';
  const protegido = corpo.replace(/(\d),(\d{2})(?!\d)/g, `$1${marcaCentavo}$2`);
  const pedacos = protegido
    .split(/\s*(?:,|;|\se\s+|\smais\s+)\s*/i)
    .map((s) => s.replaceAll(marcaCentavo, ',').trim())
    .map((s) => s.trim())
    .filter(Boolean);
  const itens: ItemAudioIa[] = [];
  let pendente: { descricao: string; quantidade: number; tipo: 'servico' | 'peca' } | null = null;
  let qtdSolta: number | null = null;

  const empurrar = (descricao: string, quantidade: number, valor: number | null, tipo: 'servico' | 'peca') => {
    const nome = descricao.slice(0, 300);
    if (nome.length < 3) return;
    itens.push({ descricao: nome, quantidade, valorUnitario: valor, tipo });
  };

  for (const pedaco of pedacos) {
    if (ehSoQuantidade(pedaco)) {
      qtdSolta = quantidadeExplicita(pedaco);
      continue;
    }
    const qtd = quantidadeExplicita(pedaco) ?? qtdSolta ?? 1;
    const { valor, resto } = precoDoTrecho(pedaco);
    const descricao = limparDescricao(resto);
    if (valor !== null && descricao.length >= 3) {
      empurrar(descricao, qtd, valor, tipoDoTrecho(pedaco));
      pendente = null;
      qtdSolta = null;
      continue;
    }
    if (valor !== null && pendente) {
      empurrar(pendente.descricao, qtdSolta ?? quantidadeExplicita(pedaco) ?? pendente.quantidade, valor, pendente.tipo);
      pendente = null;
      qtdSolta = null;
      continue;
    }
    if (descricao.length >= 3) {
      if (pendente) empurrar(pendente.descricao, pendente.quantidade, null, pendente.tipo);
      pendente = { descricao, quantidade: qtd, tipo: tipoDoTrecho(pedaco) };
      qtdSolta = null;
    }
  }
  if (pendente) empurrar(pendente.descricao, pendente.quantidade, null, pendente.tipo);

  if (!itens.length) {
    const { valor, resto } = precoDoTrecho(corpo);
    const descricao = limparDescricao(resto);
    if (descricao.length >= 3) {
      empurrar(descricao, quantidadeExplicita(corpo) ?? 1, valor, tipoDoTrecho(corpo));
    }
  }
  return itens.slice(0, 20);
}

function nomeFalado(texto: string, inicio: RegExp): string | null {
  const m = inicio.exec(texto);
  if (!m || m.index === undefined) return null;
  const depois = texto.slice(m.index + m[0].length);
  const corte = depois.split(/[:.]|\b(?:telefone|whatsapp|e-mail|email|cpf|cnpj|instal\w*|servi[cç]\w*|quantidade)\b/i)[0] ?? '';
  const nome = corte
    .replace(/^(?:o|a|um|uma)\s+/i, '')
    .replace(/[,;\s]+$/g, '')
    .trim();
  if (nome.length < 2 || nome.length > 80) return null;
  if (!/\p{L}/u.test(nome)) return null;
  if (/^(orcamento|orçamento|cadastra|cadastrar|cliente)$/i.test(nome)) return null;
  return nome;
}

function classificar(chave: string): TipoAudioIa {
  if (/\bcadastr\w*\s+(o |a |um |uma )?cliente\b/.test(chave) || /\bnovo cliente\b/.test(chave) || /\bcadastro d[eo] cliente\b/.test(chave)) {
    return 'cadastro_cliente';
  }
  if (/\bcadastr\w*\s+(o |a |um |uma )?(servico|produto|peca|item)\b/.test(chave)) {
    return 'cadastro_item';
  }
  if (/\b(orcamento|orcar)\b/.test(chave)) return 'orcamento';
  if (/\b(reais|real)\b/.test(chave) || chave.includes('r$')) {
    if (/\b(cliente|telefone|whatsapp)\b/.test(chave) && !/\b(servico|instal|limpez|manutenc|peca|produto|split|visita)\b/.test(chave)) {
      return 'cadastro_cliente';
    }
    return 'orcamento';
  }
  if (/\bcliente\b/.test(chave) && /\b(telefone|whatsapp|email)\b/.test(chave)) return 'cadastro_cliente';
  return 'incerto';
}

function extrairTelefone(texto: string): string | null {
  const semDinheiro = texto
    .replace(/r\$\s*[\d.,]+/gi, ' ')
    .replace(/\d+(?:[.,]\d+)?\s*reais/gi, ' ');
  const matches = semDinheiro.match(/(?:\+?55\s*)?\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/g) ?? [];
  for (const trecho of matches) {
    let digitos = trecho.replace(/\D/g, '');
    if (digitos.startsWith('55') && digitos.length > 11) digitos = digitos.slice(2);
    if (digitos.length === 10 || digitos.length === 11) return digitos;
  }
  return null;
}

function extrairEmail(texto: string): string | null {
  const m = texto.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

function corpoDepoisDoNome(texto: string, tipo: TipoAudioIa, nome: string | null): string {
  if (tipo === 'cadastro_cliente') return '';
  let corpo = texto;
  if (tipo === 'orcamento') {
    corpo = corpo.replace(/^(?:orçamento|orcamento)\s+(?:para|pro|pra)\s+(?:o\s+|a\s+)?/i, '');
    if (nome && corpo.toLowerCase().startsWith(nome.toLowerCase())) corpo = corpo.slice(nome.length);
    else if (nome && corpo.toLowerCase().startsWith(`o ${nome.toLowerCase()}`)) corpo = corpo.slice(nome.length + 2);
    else if (nome && corpo.toLowerCase().startsWith(`a ${nome.toLowerCase()}`)) corpo = corpo.slice(nome.length + 2);
  }
  if (tipo === 'cadastro_item') {
    corpo = corpo.replace(/^cadastr\w*\s+(?:o\s+|a\s+|um\s+|uma\s+)?(?:serviço|servico|produto|peça|peca|item)\s+/i, '');
  }
  return corpo.replace(/^[\s,:.-]+/, '').trim();
}

function rascunhoBase(parcial: Omit<RascunhoAudioIa, 'grava' | 'faltando' | 'aviso'> & { faltando?: string[]; aviso?: string }): RascunhoAudioIa {
  return {
    ...parcial,
    faltando: parcial.faltando ?? [],
    aviso: parcial.aviso ?? '',
    grava: false,
  };
}

export function interpretarFalaPlanos(bruto: string): SaidaAudioIa {
  const original = (bruto ?? '').replace(/\s+/g, ' ').trim();
  if (!original) return { ok: false, erro: 'sem_fala' };

  const cortado = original.length > FALA_MAX;
  const limitado = cortado ? original.slice(0, FALA_MAX) : original;
  const documentoFalado = temDocumento(limitado);
  const textoUsado = documentoFalado ? removerDocumento(limitado) : limitado;
  const teveComando = COMANDO.test(semAcento(textoUsado));
  const limpo = semComandos(textoUsado);
  const chave = semAcento(limpo);

  const avisos = ['Rascunho só nesta tela. Nada foi gravado no orçamento nem no cadastro.'];
  if (cortado) avisos.push('A fala passou do limite e eu usei só o começo.');
  if (documentoFalado) avisos.push('Você falou um CPF ou CNPJ. Eu não guardei o número.');
  if (teveComando) avisos.push('Ignorei pedido de apagar, enviar ou mudar regra.');
  if (/\b(salva|salvar|grava|gravar agora|confirma e salva)\b/i.test(limpo)) {
    avisos.push('Pedido de salvar foi ignorado. Nada sai desta tela sem um passo seu, e esse passo ainda não existe.');
  }

  if (!limpo) {
    return {
      ok: true,
      textoUsado,
      rascunho: rascunhoBase({
        tipo: 'incerto',
        titulo: null,
        clienteNome: null,
        telefone: null,
        email: null,
        documentoFalado,
        itens: [],
        itemNome: null,
        itemTipo: null,
        faltando: ['dizer se é orçamento ou cadastro'],
        aviso: avisos.join(' '),
        cortado,
      }),
    };
  }

  const tipo = classificar(chave);
  const clienteNome = tipo === 'cadastro_cliente'
    ? nomeFalado(limpo, /cadastr\w*\s+(?:o\s+|a\s+)?cliente\s+/i) ?? nomeFalado(limpo, /\bcliente\s+/i)
    : tipo === 'orcamento'
      ? nomeFalado(limpo, /(?:orçamento|orcamento)\s+(?:para|pro|pra)\s+/i) ?? nomeFalado(limpo, /\b(?:para|pro|pra)\s+/i)
      : null;
  const telefone = extrairTelefone(limpo);
  const email = extrairEmail(limpo);
  const corpo = corpoDepoisDoNome(limpo, tipo, clienteNome);
  const itens = tipo === 'orcamento' || tipo === 'cadastro_item' ? montarItens(corpo) : [];
  const itemTipo = tipo === 'cadastro_item'
    ? (/\bcadastr\w*\s+(?:o |a |um |uma )?(produto|peca)\b/.test(chave) ? 'peca' : 'servico')
    : null;
  const itemNome = tipo === 'cadastro_item' ? (itens[0]?.descricao ?? null) : null;
  const titulo = tipo === 'orcamento' ? (itens[0]?.descricao.slice(0, 80) ?? null) : null;

  const faltando: string[] = [];
  if (tipo === 'incerto') faltando.push('dizer se é orçamento ou cadastro');
  if (tipo === 'orcamento' && !clienteNome) faltando.push('nome do cliente');
  if (tipo === 'orcamento' && itens.length === 0) faltando.push('o que entra no orçamento');
  for (const item of itens) {
    if (item.valorUnitario === null) faltando.push(`preço de ${item.descricao}`);
  }
  if (tipo === 'cadastro_cliente' && !clienteNome) faltando.push('nome do cliente');
  if (tipo === 'cadastro_item' && !itemNome) faltando.push('nome do serviço ou do produto');
  if (tipo === 'cadastro_item' && itemNome && itens[0]?.valorUnitario === null) faltando.push('preço');

  if (tipo === 'incerto') avisos.push('Não deu para saber se é orçamento ou cadastro. Fale de um jeito direto, por exemplo: orçamento para o João, instalação, 180 reais.');
  else if (faltando.length) avisos.push('Faltou algum dado. O rascunho mostra o buraco em vez de inventar.');

  return {
    ok: true,
    textoUsado,
    rascunho: rascunhoBase({
      tipo,
      titulo,
      clienteNome,
      telefone,
      email,
      documentoFalado,
      itens: tipo === 'cadastro_item' ? itens.slice(0, 1) : itens,
      itemNome,
      itemTipo,
      faltando,
      aviso: avisos.join(' '),
      cortado,
    }),
  };
}

export function rotuloTipoAudioIa(tipo: TipoAudioIa): string {
  switch (tipo) {
    case 'orcamento': return 'Orçamento';
    case 'cadastro_cliente': return 'Cadastro de cliente';
    case 'cadastro_item': return 'Cadastro de serviço ou produto';
    default: return 'Não entendi o bastante';
  }
}

export function formatarReaisAudio(valor: number): string {
  const negativo = valor < 0;
  const [inteiro, frac = '00'] = Math.abs(valor).toFixed(2).split('.');
  const comPonto = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}R$ ${comPonto},${frac}`;
}

export function formatarTelefoneAudio(digitos: string): string {
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return digitos;
}
