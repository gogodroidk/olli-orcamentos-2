import type { Orcamento, Empresa, ItemOrcamento, ContratoPadrao } from '../types';
import { formatCurrency, formatNumber } from './currency';
import { formatDateBR, formatDateTime, todayISO } from './date';
import { escapeHtml } from './html';
import {
  AVISO_APP,
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
 * contratoPdf.ts — CONTRATO DE PRESTAÇÃO DE SERVIÇOS.
 *
 * É o documento que faltava. O app já emitia orçamento e recibo — a proposta e o
 * comprovante —, mas nada que dissesse o que foi combinado, por quanto tempo, com
 * qual garantia e o que acontece se alguém não cumprir. É o papel que separa o
 * prestador amador do profissional aos olhos do cliente dele.
 *
 * DUAS REGRAS GOVERNAM ESTE ARQUIVO:
 *
 * 1) O PRESTADOR NÃO REDIGITA NADA. Tudo que o contrato precisa já está no
 *    orçamento aprovado (partes, itens, valor, sinal, prazo, garantia, formas de
 *    pagamento) ou no cadastro da empresa. `termosPadraoContrato()` é a função
 *    que faz essa colheita; o que sobra para o prestador é AJUSTAR, não escrever.
 *
 * 2) HONESTIDADE JURÍDICA. Nada aqui foi escrito por advogado. O documento
 *    imprime isso (ver `AVISO_JURIDICO` em documentoBase) e a cópia do app não
 *    promete validade jurídica garantida. As bases legais citadas nas cláusulas
 *    padrão são referências reais — Código Civil arts. 593 a 609 (da prestação
 *    de serviço), CDC arts. 24/26/50 (garantia), CDC art. 52 §1º (teto de 2% na
 *    multa de mora), CPC art. 784 III (duas testemunhas) — não um parecer.
 */

/* ─── Padrões do prestador ──────────────────────────────────────────────
 * `ContratoPadrao` mora em src/types (é campo de `Empresa`, persistido no blob
 * JSON do SQLite — sem migração). Reexportado aqui porque quem mexe em contrato
 * chega por este arquivo.
 */
export type { ContratoPadrao };

/** Termos JÁ RESOLVIDOS de um contrato — nada opcional, nada indefinido. */
export interface TermosContrato {
  objeto: string;
  local: string;
  prazo: string;
  pagamento: string;
  garantia: string;
  multaAtrasoPercent: number;
  jurosMesPercent: number;
  avisoPrevioDias: number;
  foro: string;
  obrigacoesContratada: string;
  obrigacoesContratante: string;
  clausulasExtras: string;
}

/* ─── Defaults ──────────────────────────────────────────────────────────
 * Razoáveis por construção, e razoáveis do lado do CLIENTE também: a multa de
 * mora nasce em 2%, que é o TETO do art. 52, §1º, do CDC — ficar no teto legal
 * é o mais alto que um contrato de consumo pode ir sem virar cláusula abusiva.
 * Garantia nasce em 90 dias, que é o prazo do art. 26, II, do CDC para serviço
 * durável: o padrão do app não pode ser MENOR que a garantia que a lei já dá.
 */
export const MULTA_ATRASO_PADRAO = 2;
export const JUROS_MES_PADRAO = 1;
export const AVISO_PREVIO_PADRAO = 5;
export const GARANTIA_PADRAO = '90 (noventa) dias, contados da conclusão do serviço, sobre a execução e sobre as peças aplicadas.';

export const OBRIGACOES_CONTRATADA_PADRAO = [
  'Executar o serviço com zelo técnico, nas condições e no prazo combinados.',
  'Fornecer mão de obra qualificada e as ferramentas necessárias à execução.',
  'Responder pelos danos que causar ao imóvel ou aos bens do CONTRATANTE durante a execução.',
  'Manter o local de trabalho limpo e retirar os resíduos gerados pelo serviço.',
  'Comunicar de imediato qualquer fato que impeça ou atrase a execução.',
].join('\n');

export const OBRIGACOES_CONTRATANTE_PADRAO = [
  'Efetuar os pagamentos nas datas e na forma ajustadas.',
  'Permitir o acesso da CONTRATADA ao local nos dias e horários combinados.',
  'Informar previamente as condições do local que possam afetar o serviço.',
  'Fornecer energia elétrica e água no local, quando o serviço exigir.',
  'Conferir e receber o serviço ao término da execução.',
].join('\n');

/**
 * Número finito dentro de uma faixa, ou o padrão.
 *
 * Regra da casa aplicada a número: um valor corrompido (campo sincronizado,
 * `NaN` vindo de um input, string vazia) NÃO pode virar "0%" impresso no
 * contrato — "não sei" viraria "não tem multa". Ele cai no padrão conhecido.
 *
 * `null`, `undefined`, `''` e `[]` saem ANTES da conversão de propósito:
 * `Number(null)` e `Number('')` são **0**, um número perfeitamente finito. Sem
 * essa guarda, um campo ausente virava a cláusula "multa de 0% por atraso" — a
 * forma mais silenciosa possível de o vazio virar afirmação, e exatamente o
 * caso que o teste pegou.
 */
function numeroOuPadrao(v: unknown, padrao: number, min: number, max: number): number {
  if (v === null || v === undefined || v === '') return padrao;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

/** Texto não-vazio, ou o padrão. Espaço em branco não conta como preenchido. */
function textoOuPadrao(v: string | undefined, padrao: string): string {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : padrao;
}

/** Data ISO (YYYY-MM-DD…) → DD/MM/YYYY; qualquer outro formato passa direto. */
function dataBR(d: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? formatDateBR(d) : d;
}

/**
 * OBJETO do contrato, montado a partir dos itens do orçamento. É o coração do
 * "não redigitar": o prestador já descreveu o serviço uma vez, no wizard.
 */
function objetoDosItens(o: Orcamento): string {
  const nomes = o.itens
    .filter(i => (i.nome ?? '').trim())
    .map(i => {
      const qtd = i.quantidade > 1 ? `${formatNumber(i.quantidade, i.quantidade % 1 === 0 ? 0 : 1)}x ` : '';
      return `${qtd}${i.nome.trim()}`;
    });
  if (nomes.length === 0) return 'Prestação de serviço conforme especificado neste instrumento.';
  const base = `Prestação dos seguintes serviços e fornecimentos: ${nomes.join('; ')}.`;
  const laudo = (o.laudoTecnico ?? '').trim();
  return laudo ? `${base}\n\nDiagnóstico técnico que motivou a contratação: ${laudo}` : base;
}

/**
 * FORMA DE PAGAMENTO em prosa de contrato. Espelha o que o orçamento já sabe
 * (sinal em R$ ou %, condições em texto livre, formas marcadas) — o mesmo
 * conjunto de campos que o PDF do orçamento lê em `pagamentoTexto`, aqui
 * redigido como cláusula em vez de linha de tabela.
 */
function pagamentoDoOrcamento(o: Orcamento): string {
  const partes: string[] = [];

  const temSinal = !!(o.sinalValor && o.sinalValor > 0);
  if (temSinal) {
    // Clampa ao total: um sinal stale maior que o serviço viraria uma cláusula
    // que cobra mais na entrada do que o contrato inteiro vale.
    const sinal = Math.min(o.sinalValor as number, o.valorTotal);
    const quando = o.sinalData ? ` até ${dataBR(o.sinalData)}` : ' na assinatura deste contrato';
    const saldo = o.valorTotal - sinal;
    partes.push(`Entrada de ${formatCurrency(sinal)}${quando}`);
    if (saldo > 0) partes.push(`saldo de ${formatCurrency(saldo)} na conclusão do serviço`);
  } else if (o.sinalPercentual && o.sinalPercentual > 0) {
    partes.push(`Sinal de ${formatNumber(o.sinalPercentual, 0)}% na assinatura deste contrato`);
    partes.push('saldo na conclusão do serviço');
  }

  const livre = (o.condicoesPagamento ?? '').trim();
  if (livre) {
    partes.push(livre);
  } else {
    const formas: string[] = [];
    if (o.formasPagamento?.pix) formas.push('Pix');
    if (o.formasPagamento?.credito) formas.push('cartão de crédito');
    if (o.formasPagamento?.debito) formas.push('cartão de débito');
    if (o.formasPagamento?.dinheiro) formas.push('dinheiro');
    if (formas.length) partes.push(`Meios aceitos: ${formas.join(', ')}`);
  }

  if (partes.length === 0) {
    // Art. 597 do Código Civil: sem convenção, a retribuição se paga depois de
    // prestado o serviço. O padrão do contrato é a regra supletiva da lei — e
    // não um espaço em branco que ninguém preencheu.
    return 'Pagamento integral após a conclusão do serviço, na forma do art. 597 do Código Civil.';
  }
  return partes.join('; ') + '.';
}

/** PRAZO a partir do agendamento/data de execução já preenchidos no orçamento. */
function prazoDoOrcamento(o: Orcamento): string {
  const agendado = (o.agendamentoServico || o.dataPrestacaoServico || '').trim();
  if (agendado) {
    return `Execução prevista para ${dataBR(agendado)}, podendo ser remanejada de comum acordo entre as partes.`;
  }
  return 'Execução em data a ser combinada entre as partes após a assinatura deste contrato.';
}

/** FORO da comarca da empresa; sem cidade cadastrada, o do domicílio do cliente. */
function foroPadrao(empresa: Empresa): string {
  const cidade = (empresa.cidade ?? '').trim();
  const uf = (empresa.estado ?? '').trim();
  if (cidade) return uf ? `${cidade}/${uf}` : cidade;
  return 'domicílio do CONTRATANTE';
}

/**
 * COLHEITA. Converte o que o sistema já sabe (orçamento aprovado + cadastro da
 * empresa + padrões salvos pelo prestador) em termos prontos. Chamada pela UI
 * antes de abrir o editor: o prestador vê tudo preenchido e só ajusta.
 *
 * Precedência: padrão salvo do prestador > dado do orçamento > default do app.
 * (Garantia é a exceção: o que foi combinado NESTE orçamento vence o padrão
 * geral — é o que o cliente leu na proposta que assinou.)
 */
export function termosPadraoContrato(
  o: Orcamento,
  empresa: Empresa,
  padrao?: ContratoPadrao,
): TermosContrato {
  return {
    objeto: objetoDosItens(o),
    local: textoOuPadrao(o.clienteEndereco, 'Endereço informado pelo CONTRATANTE.'),
    prazo: prazoDoOrcamento(o),
    pagamento: pagamentoDoOrcamento(o),
    garantia: textoOuPadrao(o.garantia, textoOuPadrao(padrao?.garantia, textoOuPadrao(empresa.garantiaPadrao, GARANTIA_PADRAO))),
    multaAtrasoPercent: numeroOuPadrao(padrao?.multaAtrasoPercent, MULTA_ATRASO_PADRAO, 0, 2),
    jurosMesPercent: numeroOuPadrao(padrao?.jurosMesPercent, JUROS_MES_PADRAO, 0, 10),
    avisoPrevioDias: Math.round(numeroOuPadrao(padrao?.avisoPrevioDias, AVISO_PREVIO_PADRAO, 0, 90)),
    foro: textoOuPadrao(padrao?.foro, foroPadrao(empresa)),
    obrigacoesContratada: textoOuPadrao(padrao?.obrigacoesContratada, OBRIGACOES_CONTRATADA_PADRAO),
    obrigacoesContratante: textoOuPadrao(padrao?.obrigacoesContratante, OBRIGACOES_CONTRATANTE_PADRAO),
    clausulasExtras: (padrao?.clausulasExtras ?? '').trim(),
  };
}

/* ─── Renderização ─────────────────────────────────────────────────────── */

/** Tabela de itens (a mesma informação da proposta, dentro do contrato). */
function tabelaItens(itens: ItemOrcamento[]): string {
  const linhas = itens
    .filter(i => (i.nome ?? '').trim())
    .map(i => `<tr>
      <td>${escapeHtml(i.nome)}${i.descricao ? `<br/><span style="color:#8A93A2;font-size:11px;">${escapeHtml(i.descricao)}</span>` : ''}</td>
      <td class="num">${escapeHtml(formatNumber(i.quantidade, i.quantidade % 1 === 0 ? 0 : 1))}</td>
      <td class="num">${escapeHtml(formatCurrency(i.preco))}</td>
      <td class="num">${escapeHtml(formatCurrency(i.subtotal))}</td>
    </tr>`)
    .join('');
  if (!linhas) return '';
  return `<table>
    <thead><tr><th>Descrição</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>`;
}

/** Texto multilinha → lista `<li>` quando tem mais de uma linha; senão parágrafo. */
function textoOuLista(texto: string): string {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  if (linhas.length <= 1) {
    return `<div class="clausula-txt">${escapeHtml(texto)}</div>`;
  }
  return `<ul class="clausula-lista">${linhas.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`;
}

/** Numerador de cláusulas: remover uma opcional não pode abrir buraco na conta. */
function criarNumerador(): (titulo: string, corpo: string) => string {
  let n = 0;
  return (titulo, corpo) => {
    n += 1;
    return `<div class="clausula">
      <div class="clausula-tit">Cláusula ${n}ª — ${escapeHtml(titulo)}</div>
      ${corpo}
    </div>`;
  };
}

export interface OpcoesContrato {
  /** true (Pro/Empresa) remove o selo OLLI — mesmo entitlement do orçamento. */
  removerMarca?: boolean;
  /** Data URI da assinatura do cliente colhida no aparelho. */
  assinaturaClienteUri?: string;
  /** ISO do aceite do cliente — vira carimbo impresso sob a assinatura. */
  dataAssinaturaCliente?: string;
  /** Data URI da assinatura do prestador (default: a do cadastro da empresa). */
  assinaturaPrestador?: string;
  corMarca?: string;
}

/**
 * HTML do contrato. Função PURA: recebe tudo já resolvido (inclusive as imagens
 * em data URI) e devolve a string do documento — o mesmo contrato de
 * `gerarHtmlOrcamento`, para poder ser testada sem React Native e sem I/O.
 */
export function gerarHtmlContrato(
  o: Orcamento,
  empresa: Empresa,
  termos: TermosContrato,
  imagens: { logo: string; assinaturaPrestador: string },
  opts?: OpcoesContrato,
): string {
  const cor = corDoDocumento(opts?.corMarca ?? o.corMarca, empresa);
  const clausula = criarNumerador();

  const emitidoEm = dataBR(o.dataEmissao || todayISO());
  const docEmpresa = documentoDaEmpresa(empresa);
  const docCliente = (o.clienteCpfCnpj ?? '').trim();

  const cidadeUf = [empresa.cidade, empresa.estado].filter(Boolean).join('/');
  const localEData = `${cidadeUf ? `${cidadeUf}, ` : ''}${emitidoEm}`;

  // Valor: o desconto vira uma linha própria só quando existe de fato — imprimir
  // "Desconto: R$ 0,00" num contrato é ruído que gera pergunta do cliente.
  const descontoValor = o.subtotal - o.valorTotal;

  const corpo = `
${cabecalhoDocumento(empresa, imagens.logo, ['Contrato de', 'Prestação de Serviços'], `Nº ${o.numero} · ${emitidoEm}`)}

<h2>Das partes</h2>
<div class="bloco">
  ${linhaInfo('CONTRATADA', empresa.nome)}
  ${linhaInfo(docEmpresa.startsWith('CPF') ? 'CPF' : 'CNPJ', docEmpresa.replace(/^(CPF|CNPJ)\s/, ''))}
  ${linhaInfo('Endereço', enderecoDaEmpresa(empresa))}
  ${linhaInfo('Contato', [empresa.telefone, empresa.email].filter(Boolean).join(' · '))}
  ${linhaInfo('Responsável', empresa.nomePrestador)}
</div>
<div class="bloco" style="margin-top:8px;">
  ${linhaInfo('CONTRATANTE', o.clienteNome)}
  ${linhaInfo('CPF/CNPJ', docCliente)}
  ${linhaInfo('Endereço', o.clienteEndereco)}
  ${linhaInfo('Telefone', o.clienteTelefone)}
</div>

<div class="clausula-txt" style="margin-top:14px;">As partes acima qualificadas têm entre si justo e contratado o presente instrumento de prestação de serviços, regido pelos arts. 593 a 609 do Código Civil e, quando o CONTRATANTE for destinatário final, pela Lei 8.078/1990 (Código de Defesa do Consumidor), mediante as cláusulas a seguir.</div>

${clausula('Do objeto', `
  ${textoOuLista(termos.objeto)}
  ${tabelaItens(o.itens)}
  <div class="clausula-txt" style="margin-top:6px;">Local da execução: ${escapeHtml(termos.local)}</div>
`)}

${clausula('Do preço e da forma de pagamento', `
  <div class="destaque">
    <span class="lbl">Valor total do contrato</span>
    <span class="val">${escapeHtml(formatCurrency(o.valorTotal))}</span>
  </div>
  ${descontoValor > 0 ? `<div class="clausula-txt" style="margin-top:6px;">Valor bruto de ${escapeHtml(formatCurrency(o.subtotal))}, com desconto concedido de ${escapeHtml(formatCurrency(descontoValor))}.</div>` : ''}
  ${textoOuLista(termos.pagamento)}
`)}

${clausula('Do prazo de execução', textoOuLista(termos.prazo))}

${clausula('Das obrigações da CONTRATADA', textoOuLista(termos.obrigacoesContratada))}

${clausula('Das obrigações do CONTRATANTE', textoOuLista(termos.obrigacoesContratante))}

${clausula('Da garantia', `
  ${textoOuLista(termos.garantia)}
  <div class="clausula-txt" style="margin-top:6px;">Esta garantia é CONTRATUAL e complementar à garantia legal (art. 50 do CDC). A garantia legal — 30 dias para serviço não durável e 90 dias para serviço durável, na forma do art. 26 do CDC — independe de previsão neste contrato e não pode ser reduzida nem afastada por ele (arts. 24 e 25 do CDC). A garantia não cobre defeito decorrente de mau uso, intervenção de terceiro não autorizado, caso fortuito ou força maior.</div>
`)}

${clausula('Do atraso no pagamento', `
  <div class="clausula-txt">O atraso no pagamento sujeita o CONTRATANTE a multa de ${escapeHtml(formatNumber(termos.multaAtrasoPercent, termos.multaAtrasoPercent % 1 === 0 ? 0 : 2))}% sobre o valor em atraso — observado o teto do art. 52, §1º, do CDC — e a juros de mora de ${escapeHtml(formatNumber(termos.jurosMesPercent, termos.jurosMesPercent % 1 === 0 ? 0 : 2))}% ao mês, calculados pro rata die, sem prejuízo da correção monetária.</div>
`)}

${clausula('Da rescisão', `
  <div class="clausula-txt">Qualquer das partes pode rescindir este contrato mediante aviso prévio de ${escapeHtml(String(termos.avisoPrevioDias))} dias. Rescindido o contrato, são devidos à CONTRATADA os valores dos serviços já executados e das peças e materiais já aplicados ou adquiridos para a obra. A rescisão sem justa causa observa, no que couber, os arts. 602 e 603 do Código Civil.</div>
`)}

${clausula('Das disposições gerais', `
  <div class="clausula-txt">Este contrato não gera vínculo empregatício entre as partes nem entre o CONTRATANTE e os auxiliares da CONTRATADA. Alterações de escopo, prazo ou valor só valem se registradas por escrito e aceitas pelas duas partes. A tolerância quanto ao descumprimento de qualquer cláusula não implica novação nem renúncia. O contrato extingue-se com a conclusão do serviço (art. 607 do Código Civil).</div>
`)}

${clausula('Do foro', `
  <div class="clausula-txt">Fica eleito o foro da comarca de ${escapeHtml(termos.foro)} para dirimir as questões deste contrato. Sendo o CONTRATANTE consumidor, fica ressalvado o seu direito de propor a ação no foro do próprio domicílio (art. 101, I, do CDC).</div>
`)}

${termos.clausulasExtras ? clausula('Das disposições complementares', textoOuLista(termos.clausulasExtras)) : ''}

${blocoAssinaturas({
    prestadorNome: empresa.nomePrestador || empresa.nome,
    prestadorSub: `CONTRATADA · ${empresa.nome}${docEmpresa ? ` · ${docEmpresa}` : ''}`,
    clienteNome: o.clienteNome,
    clienteSub: `CONTRATANTE${docCliente ? ` · CPF/CNPJ ${docCliente}` : ''}`,
    assinaturaPrestador: imagens.assinaturaPrestador,
    assinaturaCliente: opts?.assinaturaClienteUri,
    dataAssinaturaCliente: opts?.dataAssinaturaCliente ? formatDateTime(opts.dataAssinaturaCliente) : undefined,
    localEData,
    comTestemunhas: true,
  })}

${rodapeDocumento(opts?.removerMarca)}
`;

  return paginaDocumento(cor, `Contrato ${o.numero} - ${o.clienteNome}`, corpo);
}

/** Monta o HTML já com logo e assinatura convertidas para data URI. */
export async function montarHtmlContratoCompleto(
  o: Orcamento,
  empresa: Empresa,
  termos: TermosContrato,
  opts?: OpcoesContrato,
): Promise<string> {
  const imagens = await carregarImagensDocumento(empresa, opts?.assinaturaPrestador ?? o.assinaturaPrestadorUri);
  return gerarHtmlContrato(o, empresa, termos, imagens, opts);
}

/**
 * Gera e entrega o PDF do contrato (web imprime; nativo compartilha).
 *
 * `exportarDocumento` entra por `import` dinâmico: ele importa `react-native` no
 * topo, e é só nesta função — a única que fala com a plataforma — que isso é
 * necessário. Mantém `gerarHtmlContrato` executável fora do app.
 */
export async function compartilharPdfContrato(
  o: Orcamento,
  empresa: Empresa,
  termos: TermosContrato,
  opts?: OpcoesContrato,
): Promise<void> {
  const html = await montarHtmlContratoCompleto(o, empresa, termos, opts);
  const { exportarHtmlComoPdf, safeFileName } = await import('./exportarDocumento');
  await exportarHtmlComoPdf(html, `Contrato-${safeFileName(o.clienteNome)}-${o.numero}`, {
    dialogTitle: `Contrato ${o.numero} - ${o.clienteNome}`,
  });
}

export { AVISO_APP };
