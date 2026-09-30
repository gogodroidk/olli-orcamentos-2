/**
 * "OLLI PREPARA A NOTA" — os dados da NFS-e prontos para o prestador copiar no
 * Emissor Nacional (www.nfse.gov.br/EmissorNacional).
 *
 * O OLLI NÃO EMITE A NOTA. Emitir exige entrar com a conta gov.br (ou certificado)
 * DO PRESTADOR no portal do governo, e não existe hoje integração paga que faça isso
 * por ele. O que esta regra faz: a partir de um recibo (o pagamento que entrou), monta
 * tomador, descrição, código de serviço sugerido pelo ofício, valor, município de
 * incidência do ISS e um checklist do que conferir. Nenhum texto aqui pode dizer que
 * a nota "foi emitida" — só o prestador informa isso, com o número que o portal deu.
 *
 * Quem é obrigado (conferido em 30/09/2026):
 *   • MEI: NFS-e nacional desde 01/09/2023 (Resolução CGSN nº 169/2022).
 *   • ME e EPP do Simples: a partir de 01/11/2026 (Resolução CGSN nº 191/2026, que
 *     revogou a 189/2026 e sua data de 01/09) — FONTE_OBRIGATORIEDADE_SIMPLES.
 *
 * Fontes das regras fiscais usadas abaixo (nada de memória):
 *   • Códigos de tributação nacional (cTribNac, 6 dígitos = item.subitem.desdobro da
 *     LC 116): tabela oficial do Portal da NFS-e — FONTE_CODIGOS_NACIONAIS.
 *   • Onde o ISS é devido: LC 116/2003, art. 3º (regra: estabelecimento do prestador;
 *     exceções nos incisos — 7.02 no III, 7.05 no V, 7.10 no VII, 7.11 no VIII).
 *   • Retenção pelo tomador pessoa jurídica: LC 116, art. 6º, §2º, II (3.05, 7.02,
 *     7.04, 7.05, 7.09, 7.10, 7.12, 7.16, 7.17, 7.19, 11.02, 17.05 e 17.10).
 *   • MEI não sofre retenção de ISS: LC 123/2006, art. 21, §4º, IV.
 *   • Descrição do serviço: até 2.000 caracteres no leiaute da DPS.
 *
 * TypeScript PURO (só `import type` e o catálogo de ofícios): o app (mobile e
 * desktop) e o painel chamam as MESMAS funções — a nota sai igual nos dois lados.
 */
import type { Cliente, Empresa, ItemOrcamento, Orcamento, Recibo } from '../types/index.ts';
import type { VerticalId } from '../services/verticais.ts';
import { verticalPorId } from '../services/verticais.ts';

export const URL_EMISSOR_NACIONAL = 'https://www.nfse.gov.br/EmissorNacional';
export const FONTE_CODIGOS_NACIONAIS =
  'https://www.gov.br/nfse/pt-br/mei-e-demais-empresas/codigos-de-tributacao-nacional-nbs';
export const FONTE_LC116 = 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm';
export const FONTE_OBRIGATORIEDADE_SIMPLES =
  'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026';

/** Teto do campo "Descrição do serviço" (xDescServ) na DPS. */
export const LIMITE_DESCRICAO = 2000;

/** Versão do formato gravado em `notas_preparadas.dados`. */
export const VERSAO_DADOS_NOTA = 1;

/** Frase de quem é obrigado — com as DUAS datas, nunca uma só (docs/ENXAME/ALERTA_NFSE_DATA.md). */
export const OBRIGATORIEDADE_NFSE =
  'MEI emite a NFS-e nacional desde 01/09/2023. ME e EPP do Simples Nacional passam a emitir por ela a partir de 01/11/2026 (Resolução CGSN nº 191/2026).';

export const AVISO_NAO_EMITE =
  'O OLLI não emite a nota. Ele deixa os dados prontos para você copiar no Emissor Nacional, onde a nota é emitida com a sua conta gov.br.';

// ─── Códigos de serviço ─────────────────────────────────────────────────────

/** Onde o ISS é devido (LC 116, art. 3º). */
export type Incidencia = 'prestador' | 'execucao';

export interface CodigoServicoNacional {
  /** cTribNac, 6 dígitos (ex.: "140101"). */
  codigo: string;
  /** Subitem da lista da LC 116 (ex.: "14.01"). */
  itemLc116: string;
  /** Descrição resumida da tabela oficial. */
  titulo: string;
  incidencia: Incidencia;
  /** Tomador pessoa jurídica responde pelo ISS (LC 116, art. 6º, §2º, II) — salvo MEI. */
  retencaoPorPessoaJuridica: boolean;
}

function codigo(
  cod: string,
  titulo: string,
  incidencia: Incidencia,
  retencaoPorPessoaJuridica: boolean,
): CodigoServicoNacional {
  return { codigo: cod, itemLc116: `${Number(cod.slice(0, 2))}.${cod.slice(2, 4)}`, titulo, incidencia, retencaoPorPessoaJuridica };
}

/**
 * Os códigos que o OLLI sabe sugerir, com o texto da tabela oficial
 * (FONTE_CODIGOS_NACIONAIS). Não é a lista inteira: é o recorte dos ofícios do app.
 */
export const CODIGOS_NACIONAIS: Readonly<Record<string, CodigoServicoNacional>> = {
  '070201': codigo('070201', 'Execução, por administração, de obras de construção civil, hidráulica ou elétrica e de outras obras semelhantes', 'execucao', true),
  '070202': codigo('070202', 'Execução, por empreitada ou subempreitada, de obras de construção civil, hidráulica ou elétrica e de outras obras semelhantes', 'execucao', true),
  '070501': codigo('070501', 'Reparação, conservação e reforma de edifícios e congêneres', 'execucao', true),
  '071002': codigo('071002', 'Limpeza, manutenção e conservação de imóveis, chaminés, piscinas e congêneres', 'execucao', true),
  '071101': codigo('071101', 'Decoração', 'execucao', false),
  '071102': codigo('071102', 'Jardinagem, inclusive corte e poda de árvores', 'execucao', false),
  '071301': codigo('071301', 'Dedetização, desinfecção, desinsetização, imunização, higienização, desratização, pulverização e congêneres', 'prestador', false),
  '140101': codigo('140101', 'Lubrificação, limpeza, lustração, revisão, carga e recarga, conserto, restauração, blindagem, manutenção e conservação de máquinas, veículos, aparelhos, equipamentos, motores, elevadores ou de qualquer objeto', 'prestador', false),
  '140201': codigo('140201', 'Assistência técnica', 'prestador', false),
  '140601': codigo('140601', 'Instalação e montagem de aparelhos, máquinas e equipamentos, prestados ao usuário final, exclusivamente com material por ele fornecido', 'prestador', false),
};

/** "140101" → "14.01.01" (como o Emissor Nacional mostra). */
export function formatarCodigoNacional(cod: string): string {
  return /^\d{6}$/.test(cod) ? `${cod.slice(0, 2)}.${cod.slice(2, 4)}.${cod.slice(4, 6)}` : cod;
}

/** Aceita "14.01.01", "140101" ou "14 01 01". `null` se não forem 6 dígitos. */
export function normalizarCodigoNacional(entrada: string | null | undefined): string | null {
  const d = String(entrada ?? '').replace(/\D/g, '');
  return d.length === 6 ? d : null;
}

interface RegraOficio {
  principal: string;
  alternativas: readonly string[];
  explicacao: string;
}

/**
 * Ofício → código sugerido. É SUGESTÃO: o código certo é o do serviço que foi feito,
 * não o do CNAE. Por isso toda regra vem com o porquê e com as alternativas comuns.
 * `Partial` de propósito: ofício novo sem regra cai em "escolha o código", nunca num
 * código errado por falta de revisão.
 */
const REGRAS_POR_OFICIO: Partial<Record<VerticalId, RegraOficio>> = {
  refrigeracao: {
    principal: '140101',
    alternativas: ['140601', '070202'],
    explicacao:
      'Limpeza, conserto e manutenção de ar-condicionado entram no subitem 14.01 da LC 116 (manutenção e conserto de aparelhos). Se o serviço foi só instalar um aparelho com material do cliente, o subitem é 14.06; instalação com obra (tubulação embutida, dreno na parede), 7.02.',
  },
  eletrica: {
    principal: '070202',
    alternativas: ['070501', '140101'],
    explicacao:
      'Instalação elétrica em imóvel é "obra elétrica" no subitem 7.02 (empreitada: preço fechado pelo serviço). Reparo ou reforma de instalação existente costuma ir no 7.05; conserto de aparelho elétrico, no 14.01.',
  },
  hidraulica: {
    principal: '070202',
    alternativas: ['070501', '071002'],
    explicacao:
      'Instalação hidráulica é "obra hidráulica" no subitem 7.02 (empreitada). Reparo em instalação existente costuma ir no 7.05; limpeza de caixa d’água, no 7.10 (limpeza e conservação de imóveis).',
  },
  pintura: {
    principal: '070501',
    alternativas: ['070202'],
    explicacao:
      'Pintura de imóvel pronto é conservação/reforma de edifício, subitem 7.05. Pintura que faz parte de uma obra (construção) vai no 7.02.',
  },
  dedetizacao: {
    principal: '071301',
    alternativas: [],
    explicacao:
      'Dedetização, desinsetização, desratização e higienização têm subitem próprio na LC 116: 7.13.',
  },
  jardinagem: {
    principal: '071102',
    alternativas: ['071101'],
    explicacao:
      'Jardinagem, inclusive corte e poda de árvores, é o subitem 7.11 (desdobramento 02 na tabela nacional). Decoração é o desdobramento 01.',
  },
};

export interface SugestaoCodigo {
  oficio: VerticalId;
  oficioLabel: string;
  principal: CodigoServicoNacional;
  alternativas: CodigoServicoNacional[];
  explicacao: string;
  fonte: string;
}

/**
 * A sugestão para o ofício da empresa. Ofício principal primeiro; os principais dos
 * outros ofícios entram como alternativas. `null` quando nenhum ofício tem regra
 * (sem ofício, "Serviços em Geral" ou ofício novo) — a tela pede para escolher.
 */
export function sugerirCodigoServico(verticais: readonly VerticalId[] | undefined | null): SugestaoCodigo | null {
  const comRegra = (verticais ?? []).filter((v) => REGRAS_POR_OFICIO[v]);
  if (comRegra.length === 0) return null;
  const oficio = comRegra[0];
  const regra = REGRAS_POR_OFICIO[oficio] as RegraOficio;
  const outros = comRegra.slice(1).map((v) => (REGRAS_POR_OFICIO[v] as RegraOficio).principal);
  const alternativas = [...regra.alternativas, ...outros]
    .filter((c, i, lista) => c !== regra.principal && lista.indexOf(c) === i)
    .map((c) => CODIGOS_NACIONAIS[c])
    .filter((c): c is CodigoServicoNacional => !!c);
  return {
    oficio,
    oficioLabel: verticalPorId(oficio).label,
    principal: CODIGOS_NACIONAIS[regra.principal],
    alternativas,
    explicacao: regra.explicacao,
    fonte: FONTE_CODIGOS_NACIONAIS,
  };
}

// ─── CPF / CNPJ do tomador ──────────────────────────────────────────────────

export type TipoDocumento = 'cpf' | 'cnpj';

export type SituacaoDocumento =
  | { tipo: 'vazio' }
  | { tipo: 'invalido'; motivo: string }
  | { tipo: 'valido'; documento: TipoDocumento; normalizado: string; formatado: string };

/** Valor de um caractere no cálculo do dígito (CNPJ alfanumérico: código ASCII − 48). */
function valorCaractere(c: string): number {
  return c.charCodeAt(0) - 48;
}

function digitoMod11(base: string, pesos: readonly number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += valorCaractere(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const PESOS_CPF_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CPF_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Confere o CPF ou CNPJ do cliente (tomador). Aceita máscara e o CNPJ ALFANUMÉRICO
 * (12 primeiros caracteres com letras, dígitos verificadores numéricos — vale para
 * CNPJs novos a partir de julho de 2026, mesmo cálculo com letra = ASCII − 48).
 * Três respostas, nunca duas: vazio (não informado) ≠ inválido (informado errado).
 */
export function validarDocumentoTomador(entrada: string | null | undefined): SituacaoDocumento {
  const limpo = String(entrada ?? '').toUpperCase().replace(/[\s.\-/]/g, '');
  if (!limpo) return { tipo: 'vazio' };
  if (/^\d{11}$/.test(limpo)) {
    if (/^(\d)\1{10}$/.test(limpo)) return { tipo: 'invalido', motivo: 'CPF com todos os números iguais.' };
    const ok = digitoMod11(limpo, PESOS_CPF_1) === Number(limpo[9]) && digitoMod11(limpo, PESOS_CPF_2) === Number(limpo[10]);
    if (!ok) return { tipo: 'invalido', motivo: 'Os dígitos do CPF não conferem.' };
    return {
      tipo: 'valido',
      documento: 'cpf',
      normalizado: limpo,
      formatado: `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9)}`,
    };
  }
  if (/^[0-9A-Z]{12}\d{2}$/.test(limpo)) {
    if (/^(\d)\1{13}$/.test(limpo)) return { tipo: 'invalido', motivo: 'CNPJ com todos os números iguais.' };
    const ok =
      digitoMod11(limpo, PESOS_CNPJ_1) === Number(limpo[12]) && digitoMod11(limpo, PESOS_CNPJ_2) === Number(limpo[13]);
    if (!ok) return { tipo: 'invalido', motivo: 'Os dígitos do CNPJ não conferem.' };
    return {
      tipo: 'valido',
      documento: 'cnpj',
      normalizado: limpo,
      formatado: `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12)}`,
    };
  }
  return { tipo: 'invalido', motivo: 'Não é um CPF (11 números) nem um CNPJ (14 caracteres).' };
}

// ─── Descrição do serviço ───────────────────────────────────────────────────

function limparTexto(s: string | null | undefined): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function linhaItem(item: ItemOrcamento): string | null {
  const nome = limparTexto(item.nome);
  if (!nome) return null;
  const qtd = Number(item.quantidade);
  const unidade = limparTexto(item.unidade);
  const sufixo = Number.isFinite(qtd) && qtd > 0 && (qtd !== 1 || (unidade && unidade !== 'un'))
    ? ` (${NUM.format(qtd)}${unidade ? ` ${unidade}` : ''})`
    : '';
  return `- ${nome}${sufixo}`;
}

export interface EntradaDescricao {
  itens: readonly ItemOrcamento[];
  reciboNumero: string;
  orcamentoNumero?: string;
}

/**
 * Descrição da NFS-e: serviços, depois peças/materiais, depois a referência ao
 * orçamento/recibo. Passou de 2.000 caracteres? Corta ITENS inteiros do fim e diz
 * quantos ficaram de fora ("e mais N itens") — nunca uma palavra pela metade.
 */
export function montarDescricaoServico(e: EntradaDescricao): { texto: string; cortada: boolean } {
  const servicos = e.itens.filter((i) => i.tipo !== 'produto').map(linhaItem).filter((l): l is string => !!l);
  const materiais = e.itens.filter((i) => i.tipo === 'produto').map(linhaItem).filter((l): l is string => !!l);
  const referencia = limparTexto(
    e.orcamentoNumero
      ? `Referente ao orçamento nº ${e.orcamentoNumero} e ao recibo nº ${e.reciboNumero}.`
      : `Referente ao recibo nº ${e.reciboNumero}.`,
  );

  const montar = (s: string[], m: string[], omitidos: number): string => {
    const partes: string[] = [];
    if (s.length) partes.push(['Serviços prestados:', ...s].join('\n'));
    else partes.push('Prestação de serviço.');
    if (m.length) partes.push(['Peças e materiais empregados:', ...m].join('\n'));
    if (omitidos > 0) partes.push(`- e mais ${omitidos} ${omitidos === 1 ? 'item' : 'itens'}, conforme o recibo.`);
    partes.push(referencia);
    return partes.join('\n');
  };

  const s = [...servicos];
  const m = [...materiais];
  let omitidos = 0;
  let texto = montar(s, m, omitidos);
  while (texto.length > LIMITE_DESCRICAO && (m.length > 0 || s.length > 1)) {
    if (m.length > 0) m.pop();
    else s.pop();
    omitidos += 1;
    texto = montar(s, m, omitidos);
  }
  if (texto.length > LIMITE_DESCRICAO) {
    // Um único item gigante: último recurso, corte seco com reticências.
    return { texto: `${texto.slice(0, LIMITE_DESCRICAO - 1)}…`, cortada: true };
  }
  return { texto, cortada: omitidos > 0 };
}

// ─── A nota preparada ───────────────────────────────────────────────────────

export interface LocalNota {
  cidade: string;
  uf: string;
}

export interface DadosNota {
  versao: typeof VERSAO_DADOS_NOTA;
  reciboId: string;
  reciboNumero: string;
  orcamentoNumero?: string;
  prestador: { nome: string; documento: string; local: LocalNota };
  tomador: {
    nome: string;
    /** O que está no cadastro, como veio (para mostrar o que corrigir). */
    documentoInformado: string;
    /** Só quando confere: CPF (11) ou CNPJ (14). */
    documento: string | null;
    tipoDocumento: TipoDocumento | null;
    telefone: string;
    endereco: string;
    cep: string;
    local: LocalNota;
  };
  servico: {
    /** cTribNac escolhido (ou sugerido). `null` = ninguém escolheu ainda. */
    codigo: string | null;
    descricao: string;
    descricaoCortada: boolean;
    /** DD/MM/AAAA — dia da prestação, quando o orçamento tem; senão, do recebimento. */
    competencia: string;
  };
  valores: {
    /** Valor do recibo (o que entrou). */
    servico: number;
    /** Soma dos itens do tipo "produto" do recibo. */
    materiais: number;
    /** Soma de todos os itens do recibo (para avisar pagamento parcial/desconto). */
    itens: number;
  };
}

export interface EntradaNota {
  recibo: Recibo;
  orcamento?: Orcamento | null;
  cliente?: Cliente | null;
  empresa: Empresa | null;
}

export interface EscolhasNota {
  /** cTribNac escolhido pelo prestador. Ausente = sugestão do ofício. */
  codigo?: string | null;
  /** Descrição editada. Ausente = a montada dos itens. */
  descricao?: string | null;
}

function centavos(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Monta os dados da nota a partir do recibo (+ orçamento, cliente e empresa). */
export function prepararDadosNota(entrada: EntradaNota, escolhas: EscolhasNota = {}): DadosNota {
  const { recibo, orcamento, cliente, empresa } = entrada;
  const docInformado = limparTexto(cliente?.cnpj || cliente?.cpf || orcamento?.clienteCpfCnpj || '');
  const doc = validarDocumentoTomador(docInformado);

  const sugestao = sugerirCodigoServico(empresa?.verticais);
  const codigoEscolhido = normalizarCodigoNacional(escolhas.codigo ?? null);
  const codigo = codigoEscolhido ?? sugestao?.principal.codigo ?? null;

  const itens = Array.isArray(recibo.itens) ? recibo.itens : [];
  const descricaoAuto = montarDescricaoServico({
    itens,
    reciboNumero: recibo.numero,
    orcamentoNumero: recibo.orcamentoNumero || orcamento?.numero || undefined,
  });
  const descricaoEditada = typeof escolhas.descricao === 'string' ? escolhas.descricao.trim() : '';
  const descricao = descricaoEditada ? descricaoEditada.slice(0, LIMITE_DESCRICAO) : descricaoAuto.texto;

  const endereco = limparTexto(
    cliente?.endereco
      ? [cliente.endereco, cliente.complemento].filter(Boolean).join(', ')
      : orcamento?.clienteEndereco || '',
  );

  const dados: DadosNota = {
    versao: VERSAO_DADOS_NOTA,
    reciboId: recibo.id,
    reciboNumero: recibo.numero,
    prestador: {
      nome: limparTexto(empresa?.nome),
      documento: limparTexto(empresa?.cnpj || empresa?.cpf).replace(/[\s.\-/]/g, '').toUpperCase(),
      local: { cidade: limparTexto(empresa?.cidade), uf: limparTexto(empresa?.estado).toUpperCase() },
    },
    tomador: {
      nome: limparTexto(cliente?.nome || recibo.clienteNome),
      documentoInformado: docInformado,
      documento: doc.tipo === 'valido' ? doc.normalizado : null,
      tipoDocumento: doc.tipo === 'valido' ? doc.documento : null,
      telefone: limparTexto(cliente?.telefone || recibo.clienteTelefone),
      endereco,
      cep: String(cliente?.cep ?? '').replace(/\D/g, ''),
      local: { cidade: limparTexto(cliente?.cidade), uf: limparTexto(cliente?.estado).toUpperCase() },
    },
    servico: {
      codigo,
      descricao,
      descricaoCortada: descricaoEditada ? false : descricaoAuto.cortada,
      competencia: limparTexto(orcamento?.dataPrestacaoServico) || limparTexto(recibo.dataRecebimento),
    },
    valores: {
      servico: centavos(recibo.valorRecebido),
      materiais: centavos(itens.filter((i) => i.tipo === 'produto').reduce((s, i) => s + (Number(i.subtotal) || 0), 0)),
      itens: centavos(itens.reduce((s, i) => s + (Number(i.subtotal) || 0), 0)),
    },
  };
  const orcNumero = recibo.orcamentoNumero || orcamento?.numero;
  if (orcNumero) dados.orcamentoNumero = orcNumero;
  return dados;
}

export interface IncidenciaNota {
  regra: Incidencia | null;
  /** Município onde o ISS é devido — vazio quando não sabemos. */
  local: LocalNota | null;
  explicacao: string;
}

function localTexto(l: LocalNota): string {
  return [l.cidade, l.uf].filter(Boolean).join('/');
}

/** Onde o ISS é devido, pela regra do código (LC 116, art. 3º). */
export function incidenciaDaNota(d: DadosNota): IncidenciaNota {
  const cod = d.servico.codigo ? CODIGOS_NACIONAIS[d.servico.codigo] : undefined;
  if (!cod) {
    return {
      regra: null,
      local: null,
      explicacao:
        'Escolha o código do serviço para saber onde o ISS é devido: em regra no município do seu estabelecimento; em obras, reformas, limpeza de imóveis e jardinagem, no município onde o serviço foi feito (LC 116, art. 3º).',
    };
  }
  if (cod.incidencia === 'prestador') {
    const local = d.prestador.local.cidade ? d.prestador.local : null;
    return {
      regra: 'prestador',
      local,
      explicacao: `Para o subitem ${cod.itemLc116}, o ISS é devido no município do seu estabelecimento (LC 116, art. 3º, regra geral).${local ? '' : ' Cadastre a cidade da sua empresa em Meu Negócio.'}`,
    };
  }
  const local = d.tomador.local.cidade ? d.tomador.local : null;
  return {
    regra: 'execucao',
    local,
    explicacao: `Para o subitem ${cod.itemLc116}, o ISS é devido no município onde o serviço foi feito (LC 116, art. 3º).${local ? '' : ' O cadastro do cliente está sem cidade: informe no emissor o município do endereço do serviço.'}`,
  };
}

// ─── Copiar campo a campo ───────────────────────────────────────────────────

export type EtapaEmissor = 'Pessoas' | 'Serviço' | 'Valores';

export interface CampoCopiavel {
  id: string;
  etapa: EtapaEmissor;
  rotulo: string;
  /** O que vai para a área de transferência. Vazio = falta o dado. */
  valor: string;
  /** Como mostrar (ex.: CPF com máscara, R$). */
  exibicao: string;
  dica?: string;
}

/** "1234.5" → "1234,50" (o campo de valor do emissor usa vírgula e não quer "R$"). */
export function valorParaEmissor(v: number): string {
  return centavos(v).toFixed(2).replace('.', ',');
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function reaisNota(v: number): string {
  return BRL.format(centavos(v));
}

/**
 * Os campos na ORDEM das telas do Emissor Nacional (Pessoas → Serviço → Valores).
 * Campo sem dado continua na lista, vazio: esconder faria o prestador achar que o
 * emissor não pede aquilo.
 */
export function camposParaCopiar(d: DadosNota): CampoCopiavel[] {
  const cod = d.servico.codigo ? CODIGOS_NACIONAIS[d.servico.codigo] : undefined;
  const incid = incidenciaDaNota(d);
  const doc = d.tomador.documento ? validarDocumentoTomador(d.tomador.documento) : null;
  const campos: CampoCopiavel[] = [
    {
      id: 'tomador_documento',
      etapa: 'Pessoas',
      rotulo: d.tomador.tipoDocumento === 'cnpj' ? 'CNPJ do cliente (tomador)' : 'CPF/CNPJ do cliente (tomador)',
      valor: d.tomador.documento ?? '',
      exibicao: doc && doc.tipo === 'valido' ? doc.formatado : d.tomador.documentoInformado,
      dica: d.tomador.documento
        ? 'Cole só os números; o emissor completa nome e endereço quando o documento já existe na base dele.'
        : d.tomador.documentoInformado
          ? 'O documento do cadastro não confere. Corrija no cadastro do cliente antes de emitir.'
          : 'O cliente está sem CPF/CNPJ no cadastro.',
    },
    { id: 'tomador_nome', etapa: 'Pessoas', rotulo: 'Nome / razão social do cliente', valor: d.tomador.nome, exibicao: d.tomador.nome },
    { id: 'tomador_telefone', etapa: 'Pessoas', rotulo: 'Telefone do cliente', valor: d.tomador.telefone.replace(/\D/g, ''), exibicao: d.tomador.telefone },
    { id: 'tomador_cep', etapa: 'Pessoas', rotulo: 'CEP do cliente', valor: d.tomador.cep, exibicao: d.tomador.cep ? `${d.tomador.cep.slice(0, 5)}-${d.tomador.cep.slice(5)}` : '' },
    { id: 'tomador_endereco', etapa: 'Pessoas', rotulo: 'Endereço do cliente', valor: d.tomador.endereco, exibicao: d.tomador.endereco },
    {
      id: 'local_prestacao',
      etapa: 'Serviço',
      rotulo: 'Município de incidência do ISS',
      valor: incid.local ? localTexto(incid.local) : '',
      exibicao: incid.local ? localTexto(incid.local) : '',
      dica: incid.explicacao,
    },
    {
      id: 'codigo_tributacao',
      etapa: 'Serviço',
      rotulo: 'Código de tributação nacional',
      valor: cod ? formatarCodigoNacional(cod.codigo) : d.servico.codigo ? formatarCodigoNacional(d.servico.codigo) : '',
      exibicao: cod ? `${formatarCodigoNacional(cod.codigo)} · ${cod.titulo}` : d.servico.codigo ? formatarCodigoNacional(d.servico.codigo) : '',
      dica: 'No emissor, digite o código na busca e confira se a descrição bate com o serviço.',
    },
    { id: 'descricao', etapa: 'Serviço', rotulo: 'Descrição do serviço', valor: d.servico.descricao, exibicao: d.servico.descricao },
    { id: 'competencia', etapa: 'Serviço', rotulo: 'Data de competência', valor: d.servico.competencia, exibicao: d.servico.competencia, dica: 'É o dia em que o serviço foi prestado.' },
    { id: 'valor_servico', etapa: 'Valores', rotulo: 'Valor do serviço', valor: valorParaEmissor(d.valores.servico), exibicao: reaisNota(d.valores.servico) },
  ];
  return campos;
}

// ─── Checklist ──────────────────────────────────────────────────────────────

export interface ItemChecklist {
  id: string;
  texto: string;
  /** Precisa de ação antes de emitir (não é só lembrete). */
  alerta: boolean;
}

/** O que conferir antes de emitir. Os alertas vêm primeiro. */
export function checklistNota(d: DadosNota): ItemChecklist[] {
  const itens: ItemChecklist[] = [];
  const cod = d.servico.codigo ? CODIGOS_NACIONAIS[d.servico.codigo] : undefined;
  const incid = incidenciaDaNota(d);

  if (!d.tomador.documento) {
    itens.push({
      id: 'tomador_documento',
      alerta: true,
      texto: d.tomador.documentoInformado
        ? `O CPF/CNPJ do cliente (${d.tomador.documentoInformado}) não confere. Corrija no cadastro do cliente.`
        : 'O cliente está sem CPF/CNPJ. Peça o documento antes de emitir; empresa quase sempre exige a nota no CNPJ dela.',
    });
  }
  if (!d.servico.codigo) {
    itens.push({ id: 'codigo', alerta: true, texto: 'Escolha o código de tributação nacional do serviço que você fez.' });
  } else if (!cod) {
    itens.push({
      id: 'codigo',
      alerta: false,
      texto: `Confira no emissor a descrição do código ${formatarCodigoNacional(d.servico.codigo)}: o OLLI não tem esse código no catálogo dele para explicar.`,
    });
  } else {
    itens.push({
      id: 'codigo',
      alerta: false,
      texto: `Confira se o código ${formatarCodigoNacional(cod.codigo)} descreve o que você fez. A sugestão vem do seu ofício; o código certo é o do serviço prestado.`,
    });
  }
  if (incid.regra && !incid.local) {
    itens.push({ id: 'municipio', alerta: true, texto: incid.explicacao });
  }
  if (d.valores.servico <= 0) {
    itens.push({ id: 'valor', alerta: true, texto: 'O recibo está sem valor. Confira o valor do serviço antes de emitir.' });
  }

  itens.push({ id: 'acesso', alerta: false, texto: 'Entre no Emissor Nacional com a sua conta gov.br (ou certificado digital) — é você quem emite.' });
  itens.push({ id: 'nbs', alerta: false, texto: 'Escolha o código NBS que o emissor oferece para o código de tributação escolhido.' });
  if (incid.regra) itens.push({ id: 'incidencia', alerta: false, texto: incid.explicacao });

  if (cod?.retencaoPorPessoaJuridica && d.tomador.tipoDocumento === 'cnpj') {
    itens.push({
      id: 'retencao',
      alerta: false,
      texto: `Cliente é empresa e o serviço é do subitem ${cod.itemLc116}: se você é ME ou EPP, o ISS pode ser retido pelo cliente (LC 116, art. 6º). Se você é MEI, não há retenção de ISS (LC 123, art. 21, §4º).`,
    });
  } else {
    itens.push({
      id: 'retencao',
      alerta: false,
      texto: 'Em regra, sem retenção de ISS nesta nota. Confira se a lei do seu município prevê alguma retenção para este serviço.',
    });
  }
  if (d.valores.materiais > 0) {
    itens.push({
      id: 'materiais',
      alerta: false,
      texto: `O recibo tem ${reaisNota(d.valores.materiais)} em peças/materiais. A NFS-e é do serviço; venda de mercadoria segue outra regra (ICMS). Confira com seu contador como declarar.`,
    });
  }
  if (d.valores.itens > 0 && Math.abs(d.valores.itens - d.valores.servico) >= 0.01) {
    itens.push({
      id: 'valor_parcial',
      alerta: false,
      texto: `O recibo é de ${reaisNota(d.valores.servico)} e os itens somam ${reaisNota(d.valores.itens)} (pagamento em parte ou desconto). Emita pelo valor combinado com o cliente.`,
    });
  }
  if (d.servico.descricaoCortada) {
    itens.push({ id: 'descricao', alerta: false, texto: `A descrição passou de ${LIMITE_DESCRICAO} caracteres e alguns itens foram resumidos.` });
  }
  itens.push({ id: 'competencia', alerta: false, texto: `Data de competência: ${d.servico.competencia || 'informe o dia em que o serviço foi prestado'}.` });
  itens.push({ id: 'numero', alerta: false, texto: 'Depois de emitir, volte aqui e anote o número da NFS-e.' });

  return [...itens.filter((i) => i.alerta), ...itens.filter((i) => !i.alerta)];
}

// ─── Status guardado ────────────────────────────────────────────────────────

export type StatusNota = 'preparada' | 'emitida';

/** Número da NFS-e (até 13 dígitos) ou a chave de acesso (50 dígitos). */
export function validarNumeroNota(entrada: string | null | undefined): string | null {
  const d = String(entrada ?? '').replace(/\D/g, '');
  return /^(\d{1,13}|\d{50})$/.test(d) ? d : null;
}

export interface NotaSalva {
  id: string;
  status: StatusNota;
  numero: string | null;
  emitidaEm: string | null;
  atualizadoEm: string;
  dados: DadosNota;
}

/** Linha de `notas_preparadas` → domínio. `null` = formato inesperado (a tela mostra erro, não "não guardada"). */
export function interpretarNotaSalva(linha: unknown): NotaSalva | null {
  if (!linha || typeof linha !== 'object' || Array.isArray(linha)) return null;
  const l = linha as Record<string, unknown>;
  if (typeof l.id !== 'string' || (l.status !== 'preparada' && l.status !== 'emitida')) return null;
  const dados = l.dados as DadosNota | null;
  if (!dados || typeof dados !== 'object' || dados.versao !== VERSAO_DADOS_NOTA || typeof dados.reciboId !== 'string') return null;
  if (l.status === 'emitida' && typeof l.numero_nota !== 'string') return null;
  return {
    id: l.id,
    status: l.status,
    numero: typeof l.numero_nota === 'string' ? l.numero_nota : null,
    emitidaEm: typeof l.emitida_em === 'string' ? l.emitida_em : null,
    atualizadoEm: typeof l.atualizado_em === 'string' ? l.atualizado_em : '',
    dados,
  };
}

/**
 * O erro do Supabase diz que a tabela/função não existe (migration não aplicada)?
 * Aí o recurso está DESLIGADO — a tela diz isso, não "erro, tente de novo".
 */
export function erroRecursoDesligado(erro: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!erro) return false;
  const code = String(erro.code ?? '');
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || /does not exist|could not find the table/i.test(String(erro.message ?? ''));
}

// ─── Interesse na nota automática (pré-venda, sem preço) ────────────────────

export const ROTULO_INTERESSE_NOTA_AUTOMATICA = 'Quero a nota automática';
export const TEXTO_INTERESSE_NOTA_AUTOMATICA =
  'Hoje você emite no portal do governo com os dados que o OLLI preparou. Se você quer que o OLLI emita a nota sozinho, registre o interesse: não cobra nada e não assina nada.';
export const TEXTO_INTERESSE_REGISTRADO = 'Seu interesse na nota automática está registrado. Obrigado!';

export type OrigemInteresseNota = 'app' | 'painel';
