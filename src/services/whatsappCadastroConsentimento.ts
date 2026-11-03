/**
 * D1438-G24 — regra de consentimento para estudar uma conversa e sugerir
 * cadastro. Função pura: não abre sessão, não lê rede, não grava cliente
 * e não manda mensagem.
 *
 * A única origem que passa é um arquivo que a própria pessoa exportou.
 * Sessão, webhook, ollizap, a caixa de suporte e qualquer outra origem
 * param antes de olhar o texto. Spec:
 * docs/ENXAME/WHATSAPP_CADASTRO_AUTOMATICO.md
 */

import { cnpjValido, cpfValido } from '../utils/pixBrCode.ts';
import { numeroWhatsAppBR } from '../utils/telefoneWhatsapp.ts';

// CPF e CNPJ usam a conta que o Pix já testa. O telefone usa a regra única do wa.me.
// Este módulo não gera cobrança e não abre conversa.

export const VERSAO_TEXTO_WHATSAPP_CADASTRO = 1;

export const TEXTO_CONSENTIMENTO_WHATSAPP_CADASTRO =
  'O OLLI ainda não liga no seu WhatsApp. Nesta versão nada é lido sozinho. ' +
  'Se você entregar um arquivo de conversa que você mesmo exportou, o OLLI só pode usar esse arquivo para sugerir, na sua conta, clientes, serviços e preços. ' +
  'Você confirma antes de qualquer cadastro. O OLLI não manda mensagem para essas pessoas, não usa o texto em anúncio e não usa o texto para treinar modelo. ' +
  'CPF, CNPJ, cartão, senha e dado de saúde são descartados. ' +
  'Você pode recusar e continuar cadastrando na mão. ' +
  'Revogar apaga o rascunho que você ainda não confirmou. O que você já confirmou fica como cadastro normal.';

export const CAIXA_PARTICIPA =
  'Eu participo dessas conversas e autorizo o OLLI a ler só o arquivo que eu mesmo entregar, para sugerir clientes, serviços e preços na minha conta.';

export const CAIXA_LIMITES =
  'Entendi que o OLLI não usa isso para anúncio, para treinar modelo nem para falar com essas pessoas.';

/** Nesta versão a conexão ao vivo não existe. A função de baixo trava isso. */
export const CONEXAO_AO_VIVO = false;

/** O texto bruto da conversa não é guardado. */
export const RETENCAO_TEXTO_BRUTO_DIAS = 0;

/** Rascunho ainda não confirmado, quando um dia houver onde guardar. */
export const RETENCAO_RASCUNHO_DIAS = 7;

export const TEXTO_MAX = 20_000;
export const TETO_CLIENTES = 50;
export const TETO_PRECOS = 50;

/** Acima disto o número não vira preço sugerido. */
const PRECO_MAX = 1_000_000;

export const ORIGEM_ARQUIVO = 'arquivo_exportado_pela_pessoa';

const ORDEM_DESCARTE = ['cpf', 'cnpj', 'cartao', 'pix', 'dado_sensivel', 'excesso'] as const;

export type CategoriaDescarte = (typeof ORDEM_DESCARTE)[number];

const SENSIVEL =
  /\b(saúde|saude|doença|doenca|doente|alergia|remédio|remedio|religião|religiao|igreja|senha|cvv|agência|agencia|conta corrente|poupança|poupanca)\b/i;

const MENOR = /\b(criança|crianca|menino|menina|menor de idade)\b/i;
const SEXUAL = /\b(sexo|sexual|pornô|porno|porn|pelada|pelado)\b/i;

const RE_COLCHETE =
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4})(?:,)?\s+\d{1,2}:\d{2}(?::\d{2})?\]\s+([^:\n]{1,80}):\s*(.*)$/;
const RE_TRACO =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+\d{1,2}:\d{2}(?::\d{2})?\s+-\s+([^:\n]{1,80}):\s*(.*)$/;

const RE_PRECO =
  /\br\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?|\b(\d+)\s*mil\s*reais\b|\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?\s*reais\b/gi;

const RE_EMAIL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const RE_CPF_FMT = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const RE_CNPJ_FMT = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const RE_TOKEN = /(?:\+?\d[\d.\-\s()]{8,}\d)/g;

export function whatsappCadastroLigado(valor: unknown): boolean {
  return valor === '1';
}

export function conexaoAoVivoPermitida(): false {
  return CONEXAO_AO_VIVO;
}

export interface RegistroConsentimento {
  versaoTexto: number;
  participa: boolean;
  limites: boolean;
  aceitoEm: string | null;
  revogadoEm: string | null;
}

export type ClasseConsentimento =
  | 'vigente'
  | 'sem_resposta'
  | 'recusado'
  | 'texto_velho'
  | 'revogado'
  | 'incompleto';

export function registrarConsentimento(
  participa: boolean,
  limites: boolean,
  quando: Date,
): RegistroConsentimento {
  const asDuas = participa === true && limites === true;
  return {
    versaoTexto: VERSAO_TEXTO_WHATSAPP_CADASTRO,
    participa: participa === true,
    limites: limites === true,
    aceitoEm: asDuas ? quando.toISOString() : null,
    revogadoEm: null,
  };
}

export function revogarConsentimento(
  registro: RegistroConsentimento,
  quando: Date,
): RegistroConsentimento {
  return { ...registro, revogadoEm: quando.toISOString() };
}

function isoValido(valor: string | null): boolean {
  if (typeof valor !== 'string' || valor.trim() === '') return false;
  return Number.isFinite(Date.parse(valor));
}

export function classificarConsentimento(
  registro: RegistroConsentimento | null | undefined,
): ClasseConsentimento {
  if (registro == null) return 'sem_resposta';
  if (typeof registro.revogadoEm === 'string' && registro.revogadoEm.trim() !== '') return 'revogado';
  if (registro.versaoTexto !== VERSAO_TEXTO_WHATSAPP_CADASTRO) return 'texto_velho';
  if (registro.participa !== true || registro.limites !== true) return 'recusado';
  if (!isoValido(registro.aceitoEm)) return 'incompleto';
  return 'vigente';
}

export interface ClienteSugerido {
  nome: string;
  telefone: string | null;
}

export interface PrecoSugerido {
  descricao: string;
  /** null não é usado: sem valor explícito o item não entra. Zero só quando a pessoa falou cortesia ou de graça. */
  valor: number;
  moeda: 'BRL';
}

export interface RascunhoWhatsappCadastro {
  grava: false;
  enviaMensagem: false;
  origem: typeof ORIGEM_ARQUIVO;
  clientes: ClienteSugerido[];
  precos: PrecoSugerido[];
  descartado: CategoriaDescarte[];
}

export type MotivoRecusa =
  | 'desligado'
  | 'origem_proibida'
  | 'pede_envio'
  | 'pede_gravar'
  | ClasseConsentimento
  | 'conteudo_proibido'
  | 'excesso'
  | 'vazio';

export type ResultadoEstudo =
  | { ok: true; rascunho: RascunhoWhatsappCadastro }
  | { ok: false; motivo: Exclude<MotivoRecusa, 'vigente'> };

export interface PedidoEstudo {
  flag: unknown;
  consentimento: RegistroConsentimento | null | undefined;
  origem: string;
  texto: string;
  nomeDaConta: string;
  querEnviar?: boolean;
  querGravar?: boolean;
}

interface Mensagem {
  autor: string | null;
  corpo: string;
}

interface CorpoAnalisado {
  sensivel: boolean;
  descricao: string;
  categorias: CategoriaDescarte[];
  telefones: string[];
  precos: number[];
}

function normalizarNome(valor: string): string {
  return valor
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function limparNome(valor: string): string {
  return valor
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function cabecalho(linha: string): { autor: string; corpo: string } | null {
  const m = RE_COLCHETE.exec(linha) ?? RE_TRACO.exec(linha);
  if (!m) return null;
  return { autor: m[2] ?? '', corpo: m[3] ?? '' };
}

function partir(texto: string): Mensagem[] {
  const msgs: Mensagem[] = [];
  let atual: Mensagem | null = null;
  for (const linha of texto.split(/\r?\n/)) {
    const cab = cabecalho(linha);
    if (cab) {
      if (atual) msgs.push(atual);
      atual = { autor: cab.autor.trim(), corpo: cab.corpo };
    } else if (atual) {
      atual.corpo += `\n${linha}`;
    } else if (linha.trim()) {
      atual = { autor: null, corpo: linha };
    }
  }
  if (atual) msgs.push(atual);
  return msgs;
}

function temConteudoProibido(texto: string): boolean {
  for (const msg of partir(texto)) {
    const junto = `${msg.autor ?? ''}\n${msg.corpo}`;
    if (MENOR.test(junto) && SEXUAL.test(junto)) return true;
  }
  return false;
}

function numeroBr(inteiro: string, centavos: string | undefined): number | null {
  const n = Number(inteiro.replace(/\./g, ''));
  if (!Number.isInteger(n) || n < 0 || n > PRECO_MAX) return null;
  const c = centavos ? Number(centavos) / 100 : 0;
  if (!Number.isFinite(c)) return null;
  const valor = Math.round((n + c) * 100) / 100;
  if (valor > PRECO_MAX) return null;
  return valor;
}

function extrairPrecos(texto: string): number[] {
  const valores: number[] = [];
  const re = new RegExp(RE_PRECO.source, 'gi');
  let m = re.exec(texto);
  while (m) {
    let valor: number | null = null;
    if (m[3]) valor = numeroBr(m[3], undefined) === null ? null : Number(m[3]) * 1000;
    else if (m[1]) valor = numeroBr(m[1], m[2]);
    else if (m[4]) valor = numeroBr(m[4], m[5]);
    if (valor !== null && valor <= PRECO_MAX) valores.push(valor);
    m = re.exec(texto);
  }
  if (valores.length === 0 && /\b(cortesia|de graça|de graca|grátis|gratis)\b/i.test(texto)) {
    valores.push(0);
  }
  return valores;
}

function luhn(num: string): boolean {
  let soma = 0;
  let alternar = false;
  for (let i = num.length - 1; i >= 0; i -= 1) {
    let n = Number(num[i]);
    if (alternar) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
    alternar = !alternar;
  }
  return soma % 10 === 0 && num.length > 0;
}

function guardar(lista: CategoriaDescarte[], categoria: CategoriaDescarte): void {
  if (!lista.includes(categoria)) lista.push(categoria);
}

function analisarCorpo(corpo: string): CorpoAnalisado {
  if (SENSIVEL.test(corpo)) {
    return { sensivel: true, descricao: '', categorias: ['dado_sensivel'], telefones: [], precos: [] };
  }

  const categorias: CategoriaDescarte[] = [];
  let texto = corpo;

  const temPix = /\bpix\b/i.test(texto);
  RE_UUID.lastIndex = 0;
  if (temPix && RE_UUID.test(texto)) {
    guardar(categorias, 'pix');
    texto = texto.replace(new RegExp(RE_UUID.source, 'gi'), ' ');
  }
  RE_UUID.lastIndex = 0;
  RE_EMAIL.lastIndex = 0;
  if (temPix && RE_EMAIL.test(texto)) {
    guardar(categorias, 'pix');
    texto = texto.replace(new RegExp(RE_EMAIL.source, 'gi'), ' ');
  }
  RE_EMAIL.lastIndex = 0;

  texto = texto.replace(RE_CPF_FMT, (token) => {
    const digitos = token.replace(/\D/g, '');
    if (!cpfValido(digitos)) return token;
    guardar(categorias, 'cpf');
    return ' ';
  });
  texto = texto.replace(RE_CNPJ_FMT, (token) => {
    const digitos = token.replace(/\D/g, '');
    if (!cnpjValido(digitos)) return token;
    guardar(categorias, 'cnpj');
    return ' ';
  });

  const telefones: string[] = [];
  texto = texto.replace(RE_TOKEN, (token) => {
    const digitos = token.replace(/\D/g, '');
    if (digitos.length === 11 && cpfValido(digitos)) {
      guardar(categorias, 'cpf');
      return ' ';
    }
    if (digitos.length === 14 && cnpjValido(digitos)) {
      guardar(categorias, 'cnpj');
      return ' ';
    }
    const fone = numeroWhatsAppBR(digitos);
    if (fone && digitos.length <= 13) {
      if (!telefones.includes(fone)) telefones.push(fone);
      return ' ';
    }
    if (digitos.length >= 13 && digitos.length <= 19 && luhn(digitos)) {
      guardar(categorias, 'cartao');
      return ' ';
    }
    return token;
  });

  const precos = extrairPrecos(texto);
  const descricao = texto
    .replace(/\br\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?/gi, ' ')
    .replace(/\b\d+\s*mil\s*reais\b/gi, ' ')
    .replace(/\b\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*reais\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  return { sensivel: false, descricao, categorias, telefones, precos };
}

function ordenar(categorias: Set<CategoriaDescarte>): CategoriaDescarte[] {
  return ORDEM_DESCARTE.filter((c) => categorias.has(c));
}

function montarRascunho(texto: string, nomeDaConta: string): RascunhoWhatsappCadastro {
  const conta = normalizarNome(nomeDaConta);
  const clientes = new Map<string, ClienteSugerido>();
  const precos: PrecoSugerido[] = [];
  const cats = new Set<CategoriaDescarte>();
  const telefonesDoTitular: string[] = [];

  for (const msg of partir(texto)) {
    const analise = analisarCorpo(msg.corpo);
    for (const c of analise.categorias) cats.add(c);

    const autorLimpo = msg.autor ? limparNome(msg.autor) : '';
    const autorNorm = autorLimpo ? normalizarNome(autorLimpo) : '';
    const ehOutro = conta !== '' && autorNorm !== '' && autorNorm !== conta && /\p{L}/u.test(autorLimpo);

    if (ehOutro) {
      if (!clientes.has(autorNorm)) {
        if (clientes.size >= TETO_CLIENTES) cats.add('excesso');
        else clientes.set(autorNorm, { nome: autorLimpo, telefone: null });
      }
      const cli = clientes.get(autorNorm);
      if (cli && cli.telefone == null && !analise.sensivel && analise.telefones[0]) {
        cli.telefone = analise.telefones[0];
      }
    } else if (!analise.sensivel) {
      for (const fone of analise.telefones) telefonesDoTitular.push(fone);
    }

    if (analise.sensivel) continue;
    for (const valor of analise.precos) {
      if (precos.length >= TETO_PRECOS) {
        cats.add('excesso');
        break;
      }
      const descricao = analise.descricao.length >= 3 ? analise.descricao : 'preço citado na conversa';
      precos.push({ descricao, valor, moeda: 'BRL' });
    }
  }

  if (clientes.size === 1) {
    const unico = [...clientes.values()][0];
    if (unico && unico.telefone == null && telefonesDoTitular[0]) unico.telefone = telefonesDoTitular[0];
  }

  return {
    grava: false,
    enviaMensagem: false,
    origem: ORIGEM_ARQUIVO,
    clientes: [...clientes.values()],
    precos,
    descartado: ordenar(cats),
  };
}

export function estudarConversa(pedido: PedidoEstudo): ResultadoEstudo {
  if (!whatsappCadastroLigado(pedido.flag)) return { ok: false, motivo: 'desligado' };
  if (pedido.origem !== ORIGEM_ARQUIVO) return { ok: false, motivo: 'origem_proibida' };
  if (pedido.querEnviar === true) return { ok: false, motivo: 'pede_envio' };
  if (pedido.querGravar === true) return { ok: false, motivo: 'pede_gravar' };

  const classe = classificarConsentimento(pedido.consentimento);
  if (classe !== 'vigente') return { ok: false, motivo: classe };

  const texto = typeof pedido.texto === 'string' ? pedido.texto : '';
  if (texto.length > TEXTO_MAX) return { ok: false, motivo: 'excesso' };
  if (texto.trim() === '') return { ok: false, motivo: 'vazio' };
  if (temConteudoProibido(texto)) return { ok: false, motivo: 'conteudo_proibido' };

  const rascunho = montarRascunho(texto, pedido.nomeDaConta);
  if (rascunho.clientes.length === 0 && rascunho.precos.length === 0 && rascunho.descartado.length === 0) {
    return { ok: false, motivo: 'vazio' };
  }
  return { ok: true, rascunho };
}
