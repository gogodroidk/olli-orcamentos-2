import type { Orcamento, Empresa, ItemOrcamento } from '../types';
import { formatCurrency, formatNumber } from './currency';
import { formatDateBR, formatDateTime, todayISO } from './date';
import { escapeHtml } from './html';
import {
  blocoAssinaturas,
  cabecalhoDocumento,
  carregarImagensDocumento,
  corDoDocumento,
  documentoDaEmpresa,
  enderecoDaEmpresa,
  linhaInfo,
  paginaDocumento,
  rodapeDocumento,
} from './documentoBase';

/**
 * termosPdf.ts — os dois documentos CURTOS que fecham o serviço:
 *
 *  1) TERMO DE GARANTIA. O art. 50, parágrafo único, do CDC diz o que um termo
 *     de garantia precisa esclarecer: EM QUE CONSISTE a garantia, a FORMA, o
 *     PRAZO e o LUGAR em que pode ser exercitada, e os ÔNUS a cargo do
 *     consumidor. Não é opinião de layout — é a lista de campos deste documento,
 *     e é por isso que ele tem exatamente esses cinco blocos.
 *
 *  2) TERMO DE CONCLUSÃO E ACEITE. É o papel que marca o fim: o cliente declara
 *     que recebeu e conferiu o serviço. Ele destrava o pagamento final e dá a
 *     data a partir da qual a garantia corre. Não tem forma exigida em lei; tem
 *     função — e a função é acabar com o "achei que ainda faltava alguma coisa".
 *
 * Os dois se preenchem sozinhos a partir do orçamento (mesma regra do contrato)
 * e reusam o chassi de documentoBase — sem segundo motor de PDF.
 */

/* ─── Datas ────────────────────────────────────────────────────────────── */

function dataBR(d: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? formatDateBR(d) : d;
}

/**
 * Data (ISO ou BR) + N dias → DD/MM/YYYY. Devolve '' quando não consegue ler a
 * data: um "válido até " sem data é pior que não imprimir a linha.
 */
export function somarDiasBR(data: string, dias: number): string {
  const base = /^\d{4}-\d{2}-\d{2}/.test(data)
    ? new Date(`${data.slice(0, 10)}T12:00:00Z`)
    : new Date(`${data.split('/').reverse().join('-')}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return '';
  const n = Number(dias);
  if (!Number.isFinite(n)) return '';
  base.setUTCDate(base.getUTCDate() + Math.round(n));
  return formatDateBR(base.toISOString().slice(0, 10));
}

function textoOuPadrao(v: string | undefined, padrao: string): string {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : padrao;
}

/** Serviço em uma frase, a partir dos itens já descritos no orçamento. */
function resumoDosItens(itens: ItemOrcamento[]): string {
  const nomes = itens.filter(i => (i.nome ?? '').trim()).map(i => i.nome.trim());
  return nomes.length ? nomes.join('; ') : 'Serviço prestado conforme contratado.';
}

/** Lista `<li>` a partir de texto multilinha; parágrafo quando é uma linha só. */
function textoOuLista(texto: string): string {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  if (linhas.length <= 1) return `<div class="clausula-txt">${escapeHtml(texto)}</div>`;
  return `<ul class="clausula-lista">${linhas.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`;
}

/** Tabela do que foi executado — a mesma informação da proposta, já conferida. */
function tabelaExecutado(itens: ItemOrcamento[]): string {
  const linhas = itens
    .filter(i => (i.nome ?? '').trim())
    .map(i => `<tr>
      <td>${escapeHtml(i.nome)}</td>
      <td class="num">${escapeHtml(formatNumber(i.quantidade, i.quantidade % 1 === 0 ? 0 : 1))}</td>
      <td class="num">${escapeHtml(formatCurrency(i.subtotal))}</td>
    </tr>`)
    .join('');
  if (!linhas) return '';
  return `<table>
    <thead><tr><th>Serviço / peça executada</th><th class="num">Qtd</th><th class="num">Valor</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>`;
}

/* ══════════════════════════════════════════════════════════════════════
 * 1) TERMO DE GARANTIA
 * ══════════════════════════════════════════════════════════════════════ */

export const GARANTIA_PRAZO_DIAS_PADRAO = 90;

export const GARANTIA_EXCLUSOES_PADRAO = [
  'Defeito causado por mau uso, uso fora das especificações do fabricante ou negligência na conservação.',
  'Intervenção, reparo ou modificação feita por terceiro não autorizado pela CONTRATADA.',
  'Danos por descarga elétrica, sobretensão da rede, infiltração, enchente ou outro caso fortuito ou de força maior.',
  'Falta da manutenção preventiva recomendada, quando aplicável ao equipamento.',
  'Peças e materiais fornecidos pelo próprio cliente.',
].join('\n');

export const GARANTIA_ONUS_PADRAO = [
  'Comunicar o defeito à CONTRATADA assim que constatado, dentro do prazo de garantia.',
  'Apresentar este termo ou informar o número do serviço ao acionar a garantia.',
  'Permitir o acesso da CONTRATADA ao local para verificação do defeito reclamado.',
].join('\n');

export interface TermoGarantiaDados {
  numero: string;
  /**
   * Cor de marca DAQUELE orçamento. O contrato já a honrava
   * (`corDoDocumento(opts?.corMarca ?? o.corMarca, empresa)`) e os termos não —
   * então contrato e termo do MESMO serviço, no mesmo dia, para o mesmo
   * cliente, saíam em cores diferentes. Colhida em `dadosGarantiaDeOrcamento`.
   */
  corMarca?: string;
  clienteNome: string;
  clienteCpfCnpj?: string;
  clienteTelefone?: string;
  /** Onde o serviço foi executado — é também o "lugar" do art. 50 do CDC. */
  local: string;
  /** O que foi feito (em que consiste o serviço garantido). */
  servico: string;
  itens: ItemOrcamento[];
  /** Data de conclusão — é dela que o prazo conta. ISO ou já em BR. */
  dataConclusao: string;
  prazoDias: number;
  /** Em que consiste a garantia (o que ela cobre). */
  cobertura: string;
  exclusoes: string;
  /** Forma de exercer: como e onde acionar. */
  comoAcionar: string;
  /** Ônus a cargo do consumidor (art. 50, parágrafo único, do CDC). */
  onusCliente: string;
}

/** Colhe do orçamento tudo que o termo de garantia precisa. Nada redigitado. */
export function dadosGarantiaDeOrcamento(
  o: Orcamento,
  empresa: Empresa,
  ajustes?: Partial<TermoGarantiaDados>,
): TermoGarantiaDados {
  const contato = [empresa.telefone || empresa.whatsapp, empresa.email].filter(Boolean).join(' ou ');
  const base: TermoGarantiaDados = {
    numero: o.numero,
    corMarca: o.corMarca,
    clienteNome: o.clienteNome,
    clienteCpfCnpj: o.clienteCpfCnpj,
    clienteTelefone: o.clienteTelefone,
    local: textoOuPadrao(o.clienteEndereco, 'Endereço informado pelo cliente.'),
    servico: resumoDosItens(o.itens),
    itens: o.itens,
    dataConclusao: o.agendamentoServico || o.dataPrestacaoServico || o.dataEmissao || todayISO(),
    prazoDias: GARANTIA_PRAZO_DIAS_PADRAO,
    // A garantia combinada NESTE serviço vence o texto genérico: é o que o
    // cliente leu no orçamento que aprovou.
    cobertura: textoOuPadrao(
      o.garantia,
      textoOuPadrao(empresa.garantiaPadrao, 'Execução do serviço e peças aplicadas pela CONTRATADA, contra defeito de instalação ou de funcionamento.'),
    ),
    exclusoes: GARANTIA_EXCLUSOES_PADRAO,
    comoAcionar: contato
      ? `Entre em contato com ${empresa.nome} por ${contato}. O atendimento em garantia é sem custo para o cliente e ocorre no local da execução do serviço.`
      : `Entre em contato com ${empresa.nome}. O atendimento em garantia é sem custo para o cliente e ocorre no local da execução do serviço.`,
    onusCliente: GARANTIA_ONUS_PADRAO,
  };
  return { ...base, ...ajustes };
}

export interface OpcoesTermo {
  removerMarca?: boolean;
  corMarca?: string;
  assinaturaClienteUri?: string;
  dataAssinaturaCliente?: string;
  assinaturaPrestador?: string;
}

/** HTML do termo de garantia. Pura: imagens entram já convertidas. */
export function gerarHtmlTermoGarantia(
  d: TermoGarantiaDados,
  empresa: Empresa,
  imagens: { logo: string; assinaturaPrestador: string },
  opts?: OpcoesTermo,
): string {
  // Mesma precedência do contrato: opção explícita > cor do orçamento > empresa.
  const cor = corDoDocumento(opts?.corMarca ?? d.corMarca, empresa);
  const conclusaoBR = dataBR(d.dataConclusao);
  const validoAte = somarDiasBR(d.dataConclusao, d.prazoDias);
  const docEmpresa = documentoDaEmpresa(empresa);
  const prazoTxt = Number.isFinite(d.prazoDias) ? `${Math.round(d.prazoDias)} dias` : '';

  const corpo = `
${cabecalhoDocumento(empresa, imagens.logo, 'Termo de Garantia', `Nº ${d.numero} · ${conclusaoBR}`)}

<h2>Prestador (garantidor)</h2>
<div class="bloco">
  ${linhaInfo('Empresa', empresa.nome)}
  ${linhaInfo(docEmpresa.startsWith('CPF') ? 'CPF' : 'CNPJ', docEmpresa.replace(/^(CPF|CNPJ)\s/, ''))}
  ${linhaInfo('Endereço', enderecoDaEmpresa(empresa))}
  ${linhaInfo('Contato', [empresa.telefone, empresa.email].filter(Boolean).join(' · '))}
</div>

<h2>Cliente e serviço garantido</h2>
<div class="bloco">
  ${linhaInfo('Cliente', d.clienteNome)}
  ${linhaInfo('CPF/CNPJ', d.clienteCpfCnpj)}
  ${linhaInfo('Telefone', d.clienteTelefone)}
  ${linhaInfo('Local do serviço', d.local)}
  ${linhaInfo('Concluído em', conclusaoBR)}
</div>
${tabelaExecutado(d.itens)}

${prazoTxt ? `<div class="destaque">
  <span class="lbl">Prazo da garantia</span>
  <span class="val">${escapeHtml(prazoTxt)}${validoAte ? ` · até ${escapeHtml(validoAte)}` : ''}</span>
</div>` : ''}

<div class="clausula">
  <div class="clausula-tit">Em que consiste a garantia</div>
  ${textoOuLista(d.cobertura)}
</div>

<div class="clausula">
  <div class="clausula-tit">O que a garantia não cobre</div>
  ${textoOuLista(d.exclusoes)}
</div>

<div class="clausula">
  <div class="clausula-tit">Como e onde acionar</div>
  ${textoOuLista(d.comoAcionar)}
</div>

<div class="clausula">
  <div class="clausula-tit">O que cabe ao cliente</div>
  ${textoOuLista(d.onusCliente)}
</div>

<div class="clausula">
  <div class="clausula-tit">Garantia legal</div>
  <div class="clausula-txt">Esta é uma garantia CONTRATUAL, complementar à garantia legal e concedida por escrito na forma do art. 50 da Lei 8.078/1990 (CDC). A garantia legal — 30 dias para serviço não durável e 90 dias para serviço durável (art. 26 do CDC) — independe deste termo, corre da conclusão do serviço ou do aparecimento do vício oculto, e não pode ser reduzida nem afastada por ele (arts. 24 e 25 do CDC).</div>
</div>

${blocoAssinaturas({
    prestadorNome: empresa.nomePrestador || empresa.nome,
    prestadorSub: `${empresa.nome}${docEmpresa ? ` · ${docEmpresa}` : ''}`,
    clienteNome: d.clienteNome,
    clienteSub: 'Cliente · recebi este termo',
    assinaturaPrestador: imagens.assinaturaPrestador,
    assinaturaCliente: opts?.assinaturaClienteUri,
    dataAssinaturaCliente: opts?.dataAssinaturaCliente ? formatDateTime(opts.dataAssinaturaCliente) : undefined,
  })}

${rodapeDocumento(opts?.removerMarca)}
`;

  return paginaDocumento(cor, `Termo de garantia ${d.numero} - ${d.clienteNome}`, corpo);
}

export async function montarHtmlTermoGarantia(
  d: TermoGarantiaDados,
  empresa: Empresa,
  opts?: OpcoesTermo,
): Promise<string> {
  const imagens = await carregarImagensDocumento(empresa, opts?.assinaturaPrestador);
  return gerarHtmlTermoGarantia(d, empresa, imagens, opts);
}

/** `exportarDocumento` por import dinâmico — ver a nota em contratoPdf.ts. */
export async function compartilharPdfTermoGarantia(
  d: TermoGarantiaDados,
  empresa: Empresa,
  opts?: OpcoesTermo,
): Promise<void> {
  const html = await montarHtmlTermoGarantia(d, empresa, opts);
  const { exportarHtmlComoPdf, safeFileName } = await import('./exportarDocumento');
  await exportarHtmlComoPdf(html, `Garantia-${safeFileName(d.clienteNome)}-${d.numero}`, {
    dialogTitle: `Termo de garantia ${d.numero} - ${d.clienteNome}`,
  });
}

/* ══════════════════════════════════════════════════════════════════════
 * 2) TERMO DE CONCLUSÃO E ACEITE DO SERVIÇO
 * ══════════════════════════════════════════════════════════════════════ */

export interface TermoConclusaoDados {
  numero: string;
  /** Cor de marca daquele orçamento — ver a nota em `TermoGarantiaDados`. */
  corMarca?: string;
  clienteNome: string;
  clienteCpfCnpj?: string;
  clienteTelefone?: string;
  local: string;
  servico: string;
  itens: ItemOrcamento[];
  dataConclusao: string;
  valorTotal: number;
  /** Resumo da garantia dada — o aceite é o marco de início dela. */
  garantiaResumo: string;
  /** Pendências acordadas. Vazio = nenhuma; nunca inventar "tudo certo". */
  pendencias: string;
}

export function dadosConclusaoDeOrcamento(
  o: Orcamento,
  empresa: Empresa,
  ajustes?: Partial<TermoConclusaoDados>,
): TermoConclusaoDados {
  const base: TermoConclusaoDados = {
    numero: o.numero,
    corMarca: o.corMarca,
    clienteNome: o.clienteNome,
    clienteCpfCnpj: o.clienteCpfCnpj,
    clienteTelefone: o.clienteTelefone,
    local: textoOuPadrao(o.clienteEndereco, 'Endereço informado pelo cliente.'),
    servico: resumoDosItens(o.itens),
    itens: o.itens,
    dataConclusao: o.agendamentoServico || o.dataPrestacaoServico || todayISO(),
    valorTotal: o.valorTotal,
    garantiaResumo: textoOuPadrao(
      o.garantia,
      textoOuPadrao(empresa.garantiaPadrao, `${GARANTIA_PRAZO_DIAS_PADRAO} dias sobre o serviço executado.`),
    ),
    pendencias: '',
  };
  return { ...base, ...ajustes };
}

export function gerarHtmlTermoConclusao(
  d: TermoConclusaoDados,
  empresa: Empresa,
  imagens: { logo: string; assinaturaPrestador: string },
  opts?: OpcoesTermo,
): string {
  const cor = corDoDocumento(opts?.corMarca ?? d.corMarca, empresa);
  const conclusaoBR = dataBR(d.dataConclusao);
  const docEmpresa = documentoDaEmpresa(empresa);
  const pendencias = (d.pendencias ?? '').trim();

  const corpo = `
${cabecalhoDocumento(empresa, imagens.logo, ['Termo de Conclusão', 'e Aceite de Serviço'], `Nº ${d.numero} · ${conclusaoBR}`)}

<h2>Partes</h2>
<div class="bloco">
  ${linhaInfo('Prestador', empresa.nome)}
  ${linhaInfo(docEmpresa.startsWith('CPF') ? 'CPF' : 'CNPJ', docEmpresa.replace(/^(CPF|CNPJ)\s/, ''))}
  ${linhaInfo('Cliente', d.clienteNome)}
  ${linhaInfo('CPF/CNPJ', d.clienteCpfCnpj)}
  ${linhaInfo('Local do serviço', d.local)}
</div>

<h2>Serviço executado</h2>
${tabelaExecutado(d.itens) || `<div class="bloco">${escapeHtml(d.servico)}</div>`}

<div class="destaque">
  <span class="lbl">Valor do serviço</span>
  <span class="val">${escapeHtml(formatCurrency(d.valorTotal))}</span>
</div>

<div class="clausula">
  <div class="clausula-tit">Declaração de conclusão e aceite</div>
  <div class="clausula-txt">O cliente ${escapeHtml(d.clienteNome)} declara que o serviço descrito acima foi CONCLUÍDO em ${escapeHtml(conclusaoBR)}, que conferiu a execução no local e que o recebe nesta data. A partir desta data começa a correr o prazo de garantia.</div>
</div>

<div class="clausula">
  <div class="clausula-tit">Pendências registradas</div>
  ${/* Sem pendência anotada, o documento diz que NÃO FOI ANOTADA NENHUMA — não
       que "está tudo perfeito". As duas frases parecem iguais e não são: a
       segunda seria o app afirmando, em nome do cliente, algo que ninguém
       verificou. É a mesma regra do "erro nunca vira vazio", aplicada a papel. */''}
  ${pendencias
      ? textoOuLista(pendencias)
      : '<div class="clausula-txt">Nenhuma pendência foi registrada por qualquer das partes no momento da entrega.</div>'}
</div>

<div class="clausula">
  <div class="clausula-tit">Garantia</div>
  <div class="clausula-txt">${escapeHtml(d.garantiaResumo)}</div>
  <div class="clausula-txt" style="margin-top:6px;">O aceite acima não afasta a garantia legal do CDC nem impede a reclamação de vício oculto que só se manifeste depois desta data (arts. 26, §3º, e 24 da Lei 8.078/1990).</div>
</div>

${blocoAssinaturas({
    prestadorNome: empresa.nomePrestador || empresa.nome,
    prestadorSub: `Prestador · ${empresa.nome}`,
    clienteNome: d.clienteNome,
    clienteSub: 'Cliente · recebi e aceito o serviço',
    assinaturaPrestador: imagens.assinaturaPrestador,
    assinaturaCliente: opts?.assinaturaClienteUri,
    dataAssinaturaCliente: opts?.dataAssinaturaCliente ? formatDateTime(opts.dataAssinaturaCliente) : undefined,
  })}

${rodapeDocumento(opts?.removerMarca)}
`;

  return paginaDocumento(cor, `Termo de conclusão ${d.numero} - ${d.clienteNome}`, corpo);
}

export async function montarHtmlTermoConclusao(
  d: TermoConclusaoDados,
  empresa: Empresa,
  opts?: OpcoesTermo,
): Promise<string> {
  const imagens = await carregarImagensDocumento(empresa, opts?.assinaturaPrestador);
  return gerarHtmlTermoConclusao(d, empresa, imagens, opts);
}

export async function compartilharPdfTermoConclusao(
  d: TermoConclusaoDados,
  empresa: Empresa,
  opts?: OpcoesTermo,
): Promise<void> {
  const html = await montarHtmlTermoConclusao(d, empresa, opts);
  const { exportarHtmlComoPdf, safeFileName } = await import('./exportarDocumento');
  await exportarHtmlComoPdf(html, `Conclusao-${safeFileName(d.clienteNome)}-${d.numero}`, {
    dialogTitle: `Termo de conclusão ${d.numero} - ${d.clienteNome}`,
  });
}
