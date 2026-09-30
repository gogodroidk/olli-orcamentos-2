/**
 * documentosOficio.ts — o CONTEÚDO MÍNIMO dos documentos dos ofícios recorrentes
 * (dedetização e caixa d'água), num lugar só.
 *
 * TypeScript PURO (sem React, sem banco): o app gera o PDF (utils/certificadoAnvisaPdf.ts
 * e utils/certificadoCaixaDaguaPdf.ts), o painel monta o rascunho na Central de
 * Documentos (alias `@documentos-oficio`) e os testes rodam em `node`
 * (scripts/teste-multi-setor.ts). Campo obrigatório que só existe numa tela é como o
 * documento sai incompleto na outra.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: não declara conformidade legal. Cada campo cita a norma
 * de onde veio; o que não tem norma por trás está marcado como "boa prática" e NÃO é
 * obrigatório. Os dois modelos precisam de revisão de um responsável técnico (e, antes
 * de virar argumento de venda, de um advogado) — ver `AVISO_REVISAO_TECNICA`.
 *
 * FONTES (lidas em 30/09/2026):
 *  • RDC ANVISA nº 622, de 09/03/2022 (vigente desde 01/04/2022; revogou a RDC 52/2009),
 *    art. 19 — conteúdo mínimo do comprovante de execução de serviço:
 *    https://anvisalegis.datalegis.net/action/ActionDatalegis.php?acao=abrirTextoAto&tipo=RDC&numeroAto=00000622&seqAto=000&valorAno=2022&orgao=RDC%2FDC%2FANVISA%2FMS&codTipo=&desItem=&desItemFim=&cod_menu=9434&cod_modulo=310&pesquisa=true
 *  • Lei municipal de São Paulo nº 10.770/1989 — limpeza de reservatórios a cada 360
 *    dias, certificado com lacre, exposto em lugar público e visível:
 *    http://legislacao.prefeitura.sp.gov.br/lei-10770-de-8-de-novembro-de-1989/consolidado
 *    Fora de SP a regra é do município (não verificada cidade a cidade).
 */
import type { VerticalId } from './verticais';

/** Um campo do documento e a norma que o exige (ou "boa prática", quando não há norma). */
export interface CampoDocumentoOficio {
  id: string;
  rotulo: string;
  base: string;
}

/** O que a interface mostra junto de qualquer documento de ofício, no app e no painel. */
export const AVISO_REVISAO_TECNICA =
  'Modelo em revisão: o OLLI organiza os campos que a norma pede, mas não declara conformidade. ' +
  'Confira com o responsável técnico da sua empresa antes de entregar ao cliente.';

// ─── Número por extenso (o art. 19, V pede o prazo "escrito por extenso") ───────

const UNIDADES = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n < 20) return UNIDADES[n];
  if (n < 100) {
    const u = n % 10;
    return u ? `${DEZENAS[Math.floor(n / 10)]} e ${UNIDADES[u]}` : DEZENAS[n / 10];
  }
  if (n === 100) return 'cem';
  const resto = n % 100;
  const c = CENTENAS[Math.floor(n / 100)];
  return resto ? `${c} e ${ate999(resto)}` : c;
}

/**
 * Inteiro de 0 a 9.999 por extenso, em pt-BR ("noventa", "cento e oitenta", "mil e
 * cem"). Fora da faixa ou não inteiro devolve `null`: quem chama não imprime um prazo
 * que não sabe escrever.
 */
export function porExtenso(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return null;
  if (n < 1000) return ate999(n);
  const milhar = Math.floor(n / 1000);
  const resto = n % 1000;
  const prefixo = milhar === 1 ? 'mil' : `${UNIDADES[milhar]} mil`;
  if (!resto) return prefixo;
  // "mil e cem", "mil e cinco", mas "mil duzentos e cinquenta".
  const liga = resto < 100 || resto % 100 === 0 ? ' e ' : ' ';
  return `${prefixo}${liga}${ate999(resto)}`;
}

/** "90 (noventa) dias" / "1 (um) dia". `null` quando o número não é um prazo válido (≥ 1). */
export function prazoPorExtenso(dias: number): string | null {
  if (!Number.isInteger(dias) || dias < 1) return null;
  const extenso = porExtenso(dias);
  if (!extenso) return null;
  return `${dias} (${extenso}) ${dias === 1 ? 'dia' : 'dias'}`;
}

/** Data ISO (AAAA-MM-DD) ou BR (DD/MM/AAAA) + N dias → DD/MM/AAAA. `null` se ilegível. */
export function somarDiasData(data: string, dias: number): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(data.trim());
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data.trim());
  const partes = iso ? [iso[1], iso[2], iso[3]] : br ? [br[3], br[2], br[1]] : null;
  if (!partes || !Number.isInteger(dias)) return null;
  const [a, m, d] = partes.map(Number);
  const t = Date.UTC(a, m - 1, d, 12);
  const base = new Date(t);
  if (base.getUTCFullYear() !== a || base.getUTCMonth() !== m - 1 || base.getUTCDate() !== d) return null;
  const alvo = new Date(t + dias * 86_400_000);
  const dd = String(alvo.getUTCDate()).padStart(2, '0');
  const mm = String(alvo.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${alvo.getUTCFullYear()}`;
}

function preenchido(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

// ─── 1. Comprovante de execução de serviço de controle de vetores e pragas urbanas ──

export const TITULO_COMPROVANTE_PRAGAS = 'Comprovante de execução de serviço de controle de vetores e pragas urbanas';
export const BASE_LEGAL_COMPROVANTE_PRAGAS = 'RDC ANVISA nº 622/2022, art. 19';

/** Um produto aplicado. Art. 19, VI (grupo químico) e VII (nome e concentração). */
export interface ProdutoAplicado {
  nome: string;
  concentracao: string;
  grupoQuimico: string;
  /** Opcionais: não constam do art. 19, mas o cliente e a vigilância costumam pedir. */
  principioAtivo?: string;
  registroAnvisa?: string;
}

/** Uma praga-alvo e o prazo de assistência técnica dela, em dias (art. 19, III e V). */
export interface PragaComPrazo {
  praga: string;
  prazoDias: number;
}

export interface DadosComprovantePragas {
  clienteNome: string;
  enderecoImovel: string;
  pragas: PragaComPrazo[];
  /** ISO AAAA-MM-DD ou DD/MM/AAAA. */
  dataExecucao: string;
  produtos: ProdutoAplicado[];
  orientacoes: string;
  responsavelTecnico: string;
  registroResponsavelTecnico: string;
  telefoneCit: string;
  empresaRazaoSocial: string;
  empresaEndereco: string;
  empresaTelefone: string;
  licencaSanitaria: string;
  licencaSanitariaValidade: string;
  licencaAmbiental: string;
  licencaAmbientalValidade: string;
}

/**
 * Os onze incisos do art. 19, na ordem da norma. É a lista que a tela confere antes de
 * gerar o PDF e que o painel usa para montar o rascunho.
 */
export const CAMPOS_COMPROVANTE_PRAGAS: readonly CampoDocumentoOficio[] = [
  { id: 'clienteNome', rotulo: 'Nome do cliente', base: 'art. 19, I' },
  { id: 'enderecoImovel', rotulo: 'Endereço do imóvel', base: 'art. 19, II' },
  { id: 'pragas', rotulo: 'Praga(s)-alvo', base: 'art. 19, III' },
  { id: 'dataExecucao', rotulo: 'Data de execução dos serviços', base: 'art. 19, IV' },
  { id: 'prazoAssistencia', rotulo: 'Prazo de assistência técnica, por extenso, por praga-alvo', base: 'art. 19, V' },
  { id: 'gruposQuimicos', rotulo: 'Grupo(s) químico(s) do(s) produto(s)', base: 'art. 19, VI' },
  { id: 'produtos', rotulo: 'Nome e concentração do(s) produto(s)', base: 'art. 19, VII' },
  { id: 'orientacoes', rotulo: 'Orientações pertinentes ao serviço', base: 'art. 19, VIII' },
  { id: 'responsavelTecnico', rotulo: 'Responsável técnico e registro profissional', base: 'art. 19, IX' },
  { id: 'telefoneCit', rotulo: 'Telefone do Centro de Informação Toxicológica', base: 'art. 19, X' },
  { id: 'empresa', rotulo: 'Razão social, endereço e telefone da empresa', base: 'art. 19, XI' },
  { id: 'licencas', rotulo: 'Nº das licenças sanitária e ambiental, com validade', base: 'art. 19, XI' },
];

/** Produtos com algum dado (linhas totalmente vazias do formulário não contam). */
export function produtosInformados(produtos: readonly ProdutoAplicado[]): ProdutoAplicado[] {
  return produtos.filter((p) => preenchido(p.nome) || preenchido(p.concentracao) || preenchido(p.grupoQuimico));
}

/** Pragas com nome (linhas vazias não contam). */
export function pragasInformadas(pragas: readonly PragaComPrazo[]): PragaComPrazo[] {
  return pragas.filter((p) => preenchido(p.praga));
}

/**
 * Campos do art. 19 que ainda faltam. Lista vazia = o documento tem o conteúdo
 * mínimo da norma (o que NÃO significa que está conforme: quem responde é o RT).
 * Um produto informado pela metade (sem concentração ou sem grupo químico) conta
 * como pendência, porque a norma pede os dois.
 */
export function pendenciasComprovantePragas(d: DadosComprovantePragas): CampoDocumentoOficio[] {
  const falta = new Set<string>();
  if (!preenchido(d.clienteNome)) falta.add('clienteNome');
  if (!preenchido(d.enderecoImovel)) falta.add('enderecoImovel');
  const pragas = pragasInformadas(d.pragas ?? []);
  if (pragas.length === 0) falta.add('pragas');
  if (pragas.length === 0 || pragas.some((p) => prazoPorExtenso(p.prazoDias) === null)) falta.add('prazoAssistencia');
  if (somarDiasData(d.dataExecucao ?? '', 0) === null) falta.add('dataExecucao');
  const produtos = produtosInformados(d.produtos ?? []);
  if (produtos.length === 0 || produtos.some((p) => !preenchido(p.nome) || !preenchido(p.concentracao))) falta.add('produtos');
  if (produtos.length === 0 || produtos.some((p) => !preenchido(p.grupoQuimico))) falta.add('gruposQuimicos');
  if (!preenchido(d.orientacoes)) falta.add('orientacoes');
  if (!preenchido(d.responsavelTecnico) || !preenchido(d.registroResponsavelTecnico)) falta.add('responsavelTecnico');
  if (!preenchido(d.telefoneCit)) falta.add('telefoneCit');
  if (!preenchido(d.empresaRazaoSocial) || !preenchido(d.empresaEndereco) || !preenchido(d.empresaTelefone)) falta.add('empresa');
  if (
    !preenchido(d.licencaSanitaria) || !preenchido(d.licencaSanitariaValidade) ||
    !preenchido(d.licencaAmbiental) || !preenchido(d.licencaAmbientalValidade)
  ) falta.add('licencas');
  return CAMPOS_COMPROVANTE_PRAGAS.filter((c) => falta.has(c.id));
}

/**
 * "Baratas, formigas; ratos" + 90 → uma praga por item, todas com o mesmo prazo. A tela
 * pede as pragas num campo só (é como o dedetizador fala) e o documento imprime o prazo
 * por praga, como a norma pede.
 */
export function pragasDoTexto(texto: string, prazoDias: number): PragaComPrazo[] {
  return texto
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((praga) => ({ praga, prazoDias }));
}

// ─── 2. Certificado de limpeza e desinfecção de caixa d'água ────────────────────

export const TITULO_CERTIFICADO_CAIXA_DAGUA = "Certificado de limpeza e desinfecção de reservatório de água";

/** A declaração que a Lei SP 10.770/1989 pede no certificado (condições higiênicas). */
export const DECLARACAO_CAIXA_DAGUA =
  'Declaramos que o(s) reservatório(s) descrito(s) neste certificado foi(foram) limpo(s) e desinfetado(s) ' +
  'na data indicada e, ao final do serviço, encontrava(m)-se em condições higiênicas favoráveis para o ' +
  'recebimento de água potável.';

export interface Reservatorio {
  descricao: string;
  capacidadeLitros: number;
}

export interface DadosCertificadoCaixaDagua {
  clienteNome: string;
  enderecoImovel: string;
  /** ISO AAAA-MM-DD ou DD/MM/AAAA. */
  dataExecucao: string;
  reservatorios: Reservatorio[];
  /** Produto usado na desinfecção (ex.: hipoclorito de sódio) e a concentração usada. */
  produtoDesinfeccao: string;
  concentracaoDesinfeccao: string;
  numeroLacre: string;
  /** Em quantos dias vence (a próxima limpeza). Em SP, até 360. */
  validadeDias: number;
  responsavel: string;
  empresaRazaoSocial: string;
  empresaDocumento: string;
  empresaTelefone: string;
  orientacoes?: string;
}

/**
 * Campos do certificado e a origem de cada um. Só a Lei SP 10.770/1989 foi lida no
 * texto; o que vem dela está citado. O resto é boa prática de registro (o mínimo para o
 * certificado ser verificável) e é obrigatório AQUI, no OLLI, não "por lei".
 */
export const CAMPOS_CERTIFICADO_CAIXA_DAGUA: readonly CampoDocumentoOficio[] = [
  { id: 'clienteNome', rotulo: 'Cliente (estabelecimento ou condomínio)', base: 'boa prática' },
  { id: 'enderecoImovel', rotulo: 'Endereço do imóvel', base: 'boa prática' },
  { id: 'dataExecucao', rotulo: 'Data da limpeza', base: 'Lei SP 10.770/1989 (limpeza a cada 360 dias)' },
  { id: 'reservatorios', rotulo: 'Reservatório(s) e capacidade', base: 'boa prática' },
  { id: 'desinfeccao', rotulo: 'Produto e concentração usados na desinfecção', base: 'boa prática' },
  { id: 'numeroLacre', rotulo: 'Número do lacre', base: 'Lei SP 10.770/1989 (lacre)' },
  { id: 'validade', rotulo: 'Próxima limpeza (validade)', base: 'Lei SP 10.770/1989 (360 dias)' },
  { id: 'responsavel', rotulo: 'Responsável pela execução', base: 'boa prática' },
  { id: 'empresa', rotulo: 'Empresa executora (nome, CNPJ ou CPF e telefone)', base: 'Lei SP 10.770/1989 (empresa executora)' },
];

/** Prazo máximo que a lei de SP dá entre duas limpezas (a tela avisa quando passa disso). */
export const VALIDADE_MAXIMA_SP_DIAS = 360;

/** Reservatórios com descrição e capacidade positiva. */
export function reservatoriosInformados(rs: readonly Reservatorio[]): Reservatorio[] {
  return rs.filter((r) => preenchido(r.descricao) && Number.isFinite(r.capacidadeLitros) && r.capacidadeLitros > 0);
}

/** Campos do certificado que ainda faltam (lista vazia = pode gerar). */
export function pendenciasCertificadoCaixaDagua(d: DadosCertificadoCaixaDagua): CampoDocumentoOficio[] {
  const falta = new Set<string>();
  if (!preenchido(d.clienteNome)) falta.add('clienteNome');
  if (!preenchido(d.enderecoImovel)) falta.add('enderecoImovel');
  if (somarDiasData(d.dataExecucao ?? '', 0) === null) falta.add('dataExecucao');
  if (reservatoriosInformados(d.reservatorios ?? []).length === 0) falta.add('reservatorios');
  if (!preenchido(d.produtoDesinfeccao) || !preenchido(d.concentracaoDesinfeccao)) falta.add('desinfeccao');
  if (!preenchido(d.numeroLacre)) falta.add('numeroLacre');
  if (!Number.isInteger(d.validadeDias) || d.validadeDias < 1) falta.add('validade');
  if (!preenchido(d.responsavel)) falta.add('responsavel');
  if (!preenchido(d.empresaRazaoSocial) || !preenchido(d.empresaDocumento) || !preenchido(d.empresaTelefone)) falta.add('empresa');
  return CAMPOS_CERTIFICADO_CAIXA_DAGUA.filter((c) => falta.has(c.id));
}

/** A data da próxima limpeza (DD/MM/AAAA), ou `null` quando a data ou o prazo não são válidos. */
export function proximaLimpeza(d: Pick<DadosCertificadoCaixaDagua, 'dataExecucao' | 'validadeDias'>): string | null {
  if (!Number.isInteger(d.validadeDias) || d.validadeDias < 1) return null;
  return somarDiasData(d.dataExecucao ?? '', d.validadeDias);
}

// ─── 3. Rascunho de texto para a Central de Documentos do painel ────────────────

export type ModeloDocumentoOficio = 'comprovante_pragas' | 'certificado_caixa_dagua';

export interface EmpresaParaModelo {
  nome?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  licencaSanitaria?: string | null;
  licencaSanitariaValidade?: string | null;
  licencaAmbiental?: string | null;
  licencaAmbientalValidade?: string | null;
  responsavelTecnico?: string | null;
  responsavelTecnicoRegistro?: string | null;
  telefoneCit?: string | null;
}

/** Os modelos e o ofício de cada um (o painel só oferece o do ofício da empresa). */
export const MODELOS_DOCUMENTO_OFICIO: readonly { id: ModeloDocumentoOficio; titulo: string; vertical: VerticalId }[] = [
  { id: 'comprovante_pragas', titulo: 'Comprovante de controle de pragas (RDC 622/2022)', vertical: 'dedetizacao' },
  { id: 'certificado_caixa_dagua', titulo: "Certificado de limpeza de caixa d'água", vertical: 'caixa_dagua' },
];

function valorOuLacuna(v: string | null | undefined): string {
  return preenchido(v) ? String(v).trim() : '________________';
}

/**
 * "número · validade DD/MM/AAAA" com lacuna no que faltar. O inciso XI pede os DOIS:
 * imprimir só o número faria a linha parecer completa sem estar.
 */
function licencaComValidade(numero: string | null | undefined, validade: string | null | undefined): string {
  return `${valorOuLacuna(numero)} · validade ${valorOuLacuna(validade)}`;
}

function enderecoEmpresa(e: EmpresaParaModelo | null | undefined): string {
  const cidade = [e?.cidade, e?.estado].filter(preenchido).join('/');
  return [e?.endereco, cidade].filter(preenchido).join(' · ');
}

/**
 * O texto inicial do rascunho no painel: um bloco por campo exigido, já com o que o
 * cadastro da empresa tem e lacunas "____" no resto. O prestador completa no editor
 * de blocos e imprime; nada aqui finge estar preenchido.
 */
export function textoModeloDocumentoOficio(
  modelo: ModeloDocumentoOficio,
  empresa?: EmpresaParaModelo | null,
  clienteNome?: string | null,
): { titulo: string; texto: string } {
  const telefone = empresa?.telefone || empresa?.whatsapp;
  if (modelo === 'comprovante_pragas') {
    const linhas = [
      `${TITULO_COMPROVANTE_PRAGAS.toUpperCase()}`,
      `Conteúdo mínimo: ${BASE_LEGAL_COMPROVANTE_PRAGAS}.`,
      '',
      `Nome do cliente (I): ${valorOuLacuna(clienteNome)}`,
      `Endereço do imóvel (II): ${valorOuLacuna(null)}`,
      `Praga(s)-alvo (III): ${valorOuLacuna(null)}`,
      `Data de execução dos serviços (IV): ${valorOuLacuna(null)}`,
      `Prazo de assistência técnica por praga-alvo, por extenso (V): ${valorOuLacuna(null)}`,
      `Grupo(s) químico(s) (VI): ${valorOuLacuna(null)}`,
      `Nome e concentração do(s) produto(s) (VII): ${valorOuLacuna(null)}`,
      `Orientações pertinentes (VIII): ${valorOuLacuna(null)}`,
      `Responsável técnico e registro profissional (IX): ${valorOuLacuna(empresa?.responsavelTecnico)} · registro ${valorOuLacuna(empresa?.responsavelTecnicoRegistro)}`,
      `Telefone do Centro de Informação Toxicológica (X): ${valorOuLacuna(empresa?.telefoneCit)}`,
      `Empresa — razão social (XI): ${valorOuLacuna(empresa?.nome)}`,
      `Empresa — endereço (XI): ${valorOuLacuna(enderecoEmpresa(empresa) || null)}`,
      `Empresa — telefone (XI): ${valorOuLacuna(telefone)}`,
      `Licença sanitária — número e validade (XI): ${licencaComValidade(empresa?.licencaSanitaria, empresa?.licencaSanitariaValidade)}`,
      `Licença ambiental — número e validade (XI): ${licencaComValidade(empresa?.licencaAmbiental, empresa?.licencaAmbientalValidade)}`,
      '',
      AVISO_REVISAO_TECNICA,
    ];
    return { titulo: 'Comprovante de controle de pragas', texto: linhas.join('\n') };
  }
  const linhas = [
    TITULO_CERTIFICADO_CAIXA_DAGUA.toUpperCase(),
    '',
    `Cliente: ${valorOuLacuna(clienteNome)}`,
    `Endereço do imóvel: ${valorOuLacuna(null)}`,
    `Data da limpeza: ${valorOuLacuna(null)}`,
    `Reservatório(s) e capacidade em litros: ${valorOuLacuna(null)}`,
    `Produto e concentração da desinfecção: ${valorOuLacuna(null)}`,
    `Número do lacre: ${valorOuLacuna(null)}`,
    `Próxima limpeza (validade): ${valorOuLacuna(null)}`,
    `Responsável pela execução: ${valorOuLacuna(empresa?.responsavelTecnico)}`,
    `Empresa executora: ${valorOuLacuna(empresa?.nome)} · ${valorOuLacuna(empresa?.cnpj || empresa?.cpf)} · ${valorOuLacuna(telefone)}`,
    '',
    DECLARACAO_CAIXA_DAGUA,
    '',
    'Em São Paulo (Lei 10.770/1989), nos estabelecimentos e edifícios que a lei lista, a limpeza é exigida a cada 360 dias e o certificado deve ficar exposto em lugar público e visível. Em outras cidades, confira a regra do município.',
    '',
    AVISO_REVISAO_TECNICA,
  ];
  return { titulo: "Certificado de limpeza de caixa d'água", texto: linhas.join('\n') };
}
