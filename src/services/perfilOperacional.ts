import type { Empresa } from '../types';
import { SEGMENTOS } from '../types/index.ts';
import { verticaisEfetivos } from './verticalSegmento.ts';

export type CampoPerfilMinimo =
  | 'tipoNegocio'
  | 'nome'
  | 'nomePrestador'
  | 'telefone'
  | 'especialidade'
  | 'verticais'
  | 'cidade'
  | 'estado'
  | 'cnpj';

export const ROTULO_CAMPO_PERFIL: Readonly<Record<CampoPerfilMinimo, string>> = {
  tipoNegocio: 'forma de atuação',
  nome: 'nome do negócio',
  nomePrestador: 'nome do responsável',
  telefone: 'telefone',
  especialidade: 'especialidade',
  verticais: 'tipo de serviço',
  cidade: 'cidade',
  estado: 'UF',
  cnpj: 'CNPJ',
};

interface LinhaEmpresa {
  dados?: Empresa | null;
}

/** Aceita tanto a linha `empresa.dados` da web quanto o objeto local do app. */
export function dadosDaEmpresa(linha: unknown): Empresa | null {
  if (!linha || typeof linha !== 'object') return null;
  const possivel = linha as LinhaEmpresa & Partial<Empresa>;
  const dados = possivel.dados;
  if (dados && typeof dados === 'object') return dados;
  return typeof possivel.nome === 'string' ? (possivel as Empresa) : null;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Completa o que dá para DEDUZIR do que a pessoa já informou, sem inventar dado.
 * Contas antigas têm o segmento (chip "Ar-condicionado") mas não têm `verticais`
 * nem `tipoNegocio` — 8 das 25 empresas de produção em 02/10/2026 ficavam presas
 * só por isso. Regras:
 *  - tipo de serviço (`verticais`) ← segmento (mesma ponte do gate de ferramentas);
 *  - especialidade ← rótulo do segmento, quando vazia;
 *  - forma de atuação ← "autônomo" sem CNPJ; "empresa" com CNPJ de 14 dígitos;
 *  - nome do negócio do autônomo ← nome do responsável (o Onboarding faz igual) —
 *    SÓ com `comNome` (padrão), isto é, para PRÉ-PREENCHER o formulário que a
 *    pessoa grava. Os PDFs imprimem `empresa.nome` CRU: para decidir se o cadastro
 *    está completo (`camposPendentesPerfil`), o nome deduzido não vale — nome vazio
 *    continua pendente até ser gravado.
 * Telefone, cidade e UF nunca são deduzidos: saem no documento e só a pessoa sabe.
 * Devolve o MESMO objeto quando não há o que deduzir.
 */
export function completarPerfilDeduzido(empresa: Empresa, { comNome = true }: { comNome?: boolean } = {}): Empresa {
  const extra: Partial<Empresa> = {};
  if (!empresa.verticais?.length) {
    const verticais = verticaisEfetivos(empresa);
    if (verticais?.length) extra.verticais = verticais;
  }
  if (!texto(empresa.especialidade) && empresa.segmento && empresa.segmento !== 'outro') {
    const rotulo = SEGMENTOS.find(s => s.id === empresa.segmento)?.label;
    if (rotulo) extra.especialidade = rotulo;
  }
  let tipo = empresa.tipoNegocio;
  if (tipo !== 'autonomo' && tipo !== 'empresa') {
    tipo = texto(empresa.cnpj).replace(/\D/g, '').length === 14 ? 'empresa' : 'autonomo';
    extra.tipoNegocio = tipo;
  }
  if (comNome && tipo === 'autonomo' && !texto(empresa.nome) && texto(empresa.nomePrestador)) {
    extra.nome = texto(empresa.nomePrestador);
  }
  return Object.keys(extra).length ? { ...empresa, ...extra } : empresa;
}

export function camposPendentesPerfil(linha: unknown): CampoPerfilMinimo[] {
  const bruta = dadosDaEmpresa(linha);
  if (!bruta) {
    return ['tipoNegocio', 'nome', 'nomePrestador', 'telefone', 'especialidade', 'verticais', 'cidade', 'estado'];
  }
  // Sem o nome deduzido: o documento sai com `empresa.nome` cru (ver acima).
  const empresa = completarPerfilDeduzido(bruta, { comNome: false });

  const pendentes: CampoPerfilMinimo[] = [];
  if (empresa.tipoNegocio !== 'autonomo' && empresa.tipoNegocio !== 'empresa') pendentes.push('tipoNegocio');
  if (!empresa.nome?.trim()) pendentes.push('nome');
  if (!empresa.nomePrestador?.trim()) pendentes.push('nomePrestador');
  const telefone = (empresa.telefone || empresa.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (telefone.length < 10 || telefone.length > 11) pendentes.push('telefone');
  if (!empresa.especialidade?.trim()) pendentes.push('especialidade');
  if (!empresa.verticais?.length) pendentes.push('verticais');
  if (!empresa.cidade?.trim()) pendentes.push('cidade');
  if (!/^[A-Z]{2}$/i.test(empresa.estado?.trim() ?? '')) pendentes.push('estado');
  if (empresa.tipoNegocio === 'empresa' && (empresa.cnpj ?? '').replace(/\D/g, '').length !== 14) pendentes.push('cnpj');
  return pendentes;
}

export function perfilOperacionalCompleto(linha: unknown): boolean {
  return camposPendentesPerfil(linha).length === 0;
}

/**
 * A linha existe mas não tem NADA que identifique o negócio (nem nome, nem
 * responsável, nem contato, nem documento, nem endereço)? É o caso de contas
 * cujo aparelho criou a linha vazia antes do cadastro (a conta de revisão da Play
 * tinha só o segmento). Segmento e especialidade sozinhos não contam: vêm de
 * padrão, não da pessoa. Logo, assinatura, site, slogan e cor da marca CONTAM:
 * foram postos pela pessoa, e o Onboarding sobrescreveria o `dados` inteiro
 * (perdendo o logo). Linha ilegível NÃO é "sem cadastro" (é "não sei").
 */
export function empresaSemCadastro(linha: unknown): boolean {
  const empresa = dadosDaEmpresa(linha);
  if (!empresa) return false;
  const campos: unknown[] = [
    empresa.nome, empresa.nomePrestador, empresa.telefone, empresa.whatsapp, empresa.cnpj,
    empresa.cpf, empresa.cidade, empresa.estado, empresa.endereco, empresa.email, empresa.chavePix,
    empresa.logoUri, empresa.assinaturaUri, empresa.site, empresa.slogan, empresa.corMarca,
  ];
  return campos.every(campo => !texto(campo));
}

// ─── Cadastro do negócio: banner no Início e porta do envio ──────────────────

/**
 * Estado do cadastro do negócio, em 3 estados + carregando. "Erro" é estado
 * próprio: nunca vira "completo" (liberar o envio sem saber) nem "incompleto"
 * (mandar preencher o que talvez já esteja preenchido).
 */
export type EstadoCadastroNegocio =
  | { tipo: 'carregando' }
  | { tipo: 'erro' }
  | { tipo: 'completo' }
  | { tipo: 'incompleto'; pendentes: CampoPerfilMinimo[] };

export type LeituraEmpresa = { ok: true; empresa: unknown } | { ok: false };

/**
 * Traduz uma leitura da empresa no estado do cadastro. Sem empresa nenhuma =
 * incompleto (todos os campos): não há o que sair no orçamento. Uma leitura que
 * FALHOU mantém o último estado conhecido (a revalidação silenciosa não pisca o
 * banner); sem estado anterior conhecido, é "erro".
 */
export function estadoCadastroDaLeitura(
  leitura: LeituraEmpresa,
  anterior: EstadoCadastroNegocio = { tipo: 'carregando' },
): EstadoCadastroNegocio {
  if (!leitura.ok) {
    return anterior.tipo === 'completo' || anterior.tipo === 'incompleto' ? anterior : { tipo: 'erro' };
  }
  const pendentes = camposPendentesPerfil(leitura.empresa);
  return pendentes.length ? { tipo: 'incompleto', pendentes } : { tipo: 'completo' };
}

/**
 * Pode gerar/enviar orçamento, PDF ou recibo? Só com o cadastro COMPLETO. O
 * resto (carregando, erro, incompleto) segura o envio com o motivo certo.
 */
export type DecisaoEnvioDocumento =
  | { libera: true }
  | { libera: false; motivo: 'incompleto'; pendentes: string[] }
  | { libera: false; motivo: 'nao_sei' };

export function decidirEnvioComCadastro(estado: EstadoCadastroNegocio): DecisaoEnvioDocumento {
  if (estado.tipo === 'completo') return { libera: true };
  if (estado.tipo === 'incompleto') {
    return { libera: false, motivo: 'incompleto', pendentes: estado.pendentes.map(campo => ROTULO_CAMPO_PERFIL[campo]) };
  }
  return { libera: false, motivo: 'nao_sei' };
}

/** "a, b e c" — lista para a frase do aviso. */
export function juntarPendentes(rotulos: readonly string[]): string {
  if (rotulos.length <= 1) return rotulos[0] ?? '';
  return `${rotulos.slice(0, -1).join(', ')} e ${rotulos[rotulos.length - 1]}`;
}
