/**
 * Teste do CONTRATO DE PRESTAÇÃO DE SERVIÇO e dos dois termos que fecham o
 * serviço (garantia e conclusão/aceite).
 *
 *     node scripts/teste-contrato-prestacao.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * POR QUE ESTE ARQUIVO EXISTE. O app sabia propor (orçamento) e dar quitação
 * (recibo) e não tinha NADA no meio: nenhum papel dizia o que foi combinado.
 * Construir esse papel abre quatro formas novas de mentir, e são as quatro que
 * este teste tranca:
 *
 *   (a) o documento sair PELA METADE — cliente sem CPF, cláusula de garantia em
 *       branco, "multa de 0%" porque um número veio corrompido. Num contrato,
 *       campo vazio não é cosmético: é a cláusula que não existe;
 *   (b) o app PROMETER validade jurídica que ele não entrega. Nada aqui passou
 *       por advogado, e a cópia não pode sugerir o contrário;
 *   (c) reabrir o buraco de XSS que o orçamento e o recibo já fecharam — são
 *       três documentos novos interpolando os MESMOS campos sincronizados;
 *   (d) a assinatura do contrato vazar para o PDF do orçamento (ou vice-versa),
 *       fazendo o app afirmar que o cliente assinou algo que ele não viu.
 *
 * A maior parte das asserções é EXECUÇÃO de verdade: os geradores são módulos
 * puros (só `import type` de RN), então o HTML é gerado aqui e conferido, não
 * descrito. O resto olha o FONTE — sempre sem comentários, porque a prosa deste
 * código cita nominalmente as regras que o teste procura.
 */
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * Resolvedor de import para o type-stripping do Node.
 *
 * O Node exige extensão explícita em ESM; o app (Metro/tsc) resolve sem ela e
 * PROÍBE escrever `.ts` no import (ver o `exclude` de scripts/ no tsconfig).
 * Em vez de deformar o código de produção para caber no teste, o teste aprende
 * a resolver como o app resolve. É isto que permite testar módulos reais em vez
 * de apenas módulos-folha.
 */
registerHooks({
  resolve(especificador: string, contexto: any, next: any) {
    if (especificador.startsWith('.') && !especificador.endsWith('.ts')) {
      const base = new URL(especificador, contexto.parentURL);
      for (const cand of [`${base.href}.ts`, `${base.href}/index.ts`]) {
        if (existsSync(fileURLToPath(cand))) return next(cand, contexto);
      }
    }
    return next(especificador, contexto);
  },
});

const {
  gerarHtmlContrato,
  termosPadraoContrato,
  MULTA_ATRASO_PADRAO,
  JUROS_MES_PADRAO,
  AVISO_PREVIO_PADRAO,
} = await import('../src/utils/contratoPdf.ts');
const {
  gerarHtmlTermoGarantia,
  gerarHtmlTermoConclusao,
  dadosGarantiaDeOrcamento,
  dadosConclusaoDeOrcamento,
  somarDiasBR,
} = await import('../src/utils/termosPdf.ts');
const { AVISO_JURIDICO, AVISO_APP } = await import('../src/utils/documentoBase.ts');

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

function ler(caminho: string): string {
  return readFileSync(new URL(caminho, import.meta.url), 'utf8');
}

/** Tira comentários: sem isto o teste atestaria a PROSA que descreve o código. */
function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Normaliza o HTML para busca de texto: `formatCurrency` usa Intl e emite
 * espaço NÃO-QUEBRÁVEL entre "R$" e o número. Procurar "R$ 930,00" com espaço
 * comum falharia por um caractere invisível.
 */
function texto(html: string): string {
  return html.replace(/ /g, ' ').replace(/\s+/g, ' ');
}

/* ─── Fixtures ─────────────────────────────────────────────────────────── */

const EMPRESA: any = {
  id: 'e1',
  nome: 'Frio Certo Climatização',
  especialidade: 'Refrigeração e Climatização',
  slogan: '',
  cnpj: '12.345.678/0001-90',
  cpf: '',
  endereco: 'Rua das Acácias, 45',
  cidade: 'Campinas',
  estado: 'SP',
  telefone: '(19) 99999-1234',
  whatsapp: '',
  site: '',
  email: 'contato@friocerto.com.br',
  chavePix: 'contato@friocerto.com.br',
  normas: '',
  nomePrestador: 'Marcos Pereira',
};

const ORCAMENTO: any = {
  id: 'o1',
  numero: '0042',
  clienteId: 'c1',
  clienteNome: 'Joana Ribeiro',
  clienteTelefone: '(19) 98888-7777',
  clienteCpfCnpj: '123.456.789-00',
  clienteEndereco: 'Av. Brasil, 900 — Campinas/SP',
  itens: [
    { id: 'i1', tipo: 'servico', catalogoId: '', nome: 'Instalação de split 12.000 BTUs', descricao: 'Vácuo e teste de estanqueidade.', preco: 480, quantidade: 1, unidade: 'un', subtotal: 480 },
    { id: 'i2', tipo: 'produto', catalogoId: '', nome: 'Suporte de parede reforçado', preco: 90, quantidade: 2, unidade: 'un', subtotal: 180 },
  ],
  subtotalServicos: 480,
  subtotalProdutos: 180,
  subtotal: 660,
  desconto: 0,
  descontoTipo: 'valor',
  valorTotal: 660,
  status: 'aprovado',
  dataEmissao: '2026-07-10',
  agendamentoServico: '2026-07-20',
  garantia: '1 (um) ano sobre a instalação.',
  formasPagamento: { credito: true, debito: false, dinheiro: false, pix: true },
  sinalValor: 200,
  sinalData: '2026-07-15',
  exibirAssinatura: true,
  solicitarAssinaturaCliente: false,
  exibirAprovacao: true,
  exibirRecusa: true,
  criadoEm: '2026-07-10T10:00:00.000Z',
  atualizadoEm: '2026-07-10T10:00:00.000Z',
};

const SEM_IMAGENS = { logo: '', assinaturaPrestador: '' };

function contrato(o: any = ORCAMENTO, e: any = EMPRESA, padrao?: any, opts?: any): string {
  return gerarHtmlContrato(o, e, termosPadraoContrato(o, e, padrao), SEM_IMAGENS, opts);
}

/* ══════════════════════════════════════════════════════════════════════ */

console.log('\n1) o contrato SE PREENCHE do orçamento (o prestador não redigita nada)');
const html = contrato();
const t = texto(html);

checar('qualifica a CONTRATADA pelo nome da empresa', t.includes('Frio Certo Climatização'), true);
checar('traz o CNPJ do prestador', t.includes('12.345.678/0001-90'), true);
checar('traz o responsável pela empresa', t.includes('Marcos Pereira'), true);
checar('qualifica o CONTRATANTE', t.includes('Joana Ribeiro'), true);
// CPF do cliente num contrato não é enfeite: é o que identifica quem se obriga.
checar('traz o CPF/CNPJ do cliente', t.includes('123.456.789-00'), true);
checar('traz o endereço de execução', t.includes('Av. Brasil, 900'), true);
// Os itens vêm do wizard — foram digitados UMA vez.
checar('lista o serviço contratado no objeto', t.includes('Instalação de split 12.000 BTUs'), true);
checar('lista também a peça fornecida', t.includes('Suporte de parede reforçado'), true);
checar('a quantidade > 1 aparece no objeto', t.includes('2x Suporte de parede reforçado'), true);
checar('imprime o valor total do contrato', t.includes('R$ 660,00'), true);
checar('imprime a entrada combinada', t.includes('R$ 200,00'), true);
checar('e o saldo calculado (total - entrada)', t.includes('R$ 460,00'), true);
checar('imprime a data da entrada em BR', t.includes('15/07/2026'), true);
checar('imprime o prazo de execução agendado', t.includes('20/07/2026'), true);
checar('usa a garantia combinada NESTE orçamento', t.includes('1 (um) ano sobre a instalação.'), true);
checar('lista os meios de pagamento marcados', t.includes('Pix') && t.includes('cartão de crédito'), true);
checar('e NÃO inventa meio não marcado (débito)', t.includes('cartão de débito'), false);
checar('elege o foro da cidade da empresa', t.includes('Campinas/SP'), true);
checar('numera o contrato pelo número do orçamento', t.includes('Nº 0042'), true);

/**
 * Marcação NUNCA pode chegar ao papel como texto.
 *
 * O cabeçalho quebrava o título em duas linhas mandando `'Contrato de<br/>...'`
 * para uma função que escapa — e o `<br/>` saía IMPRESSO no topo de todo
 * contrato, na cara do cliente. Passou por typecheck, por 180 asserções e só
 * apareceu quando o HTML gerado foi lido como texto. Esta asserção é o guarda
 * permanente: qualquer tag escapada virando conteúdo visível reprova.
 */
function marcacaoVazada(h: string): string[] {
  return [...h.matchAll(/&lt;\/?(br|div|span|img|p|b|strong|table|tr|td|ul|li)\b[^&]{0,20}&gt;/gi)].map(m => m[0]);
}
console.log('\n1b) nenhuma marcação vaza como TEXTO no documento');
checar('o contrato não imprime tag escapada', marcacaoVazada(html), []);
checar('o termo de garantia também não', marcacaoVazada(gerarHtmlTermoGarantia(dadosGarantiaDeOrcamento(ORCAMENTO, EMPRESA), EMPRESA, SEM_IMAGENS)), []);
checar('o termo de conclusão também não', marcacaoVazada(gerarHtmlTermoConclusao(dadosConclusaoDeOrcamento(ORCAMENTO, EMPRESA), EMPRESA, SEM_IMAGENS)), []);
// E o detector precisa detectar: uma tag escapada de verdade tem que ser vista.
checar('o detector enxerga uma tag escapada', marcacaoVazada('Contrato de&lt;br/&gt;Prestação').length, 1);
// O título em duas linhas continua quebrando (a quebra é marcação NOSSA).
checar('o título do contrato quebra em duas linhas', html.includes('Contrato de<br/>Prestação de Serviços'), true);

console.log('\n2) as cláusulas existem e são numeradas em sequência (sem buraco)');
const numeros = [...html.matchAll(/Cláusula (\d+)ª/g)].map(m => Number(m[1]));
checar('há pelo menos 10 cláusulas', numeros.length >= 10, true);
checar('a numeração é 1..N sem pular', numeros, numeros.map((_, i) => i + 1));
// Sem cláusulas extras cadastradas, a última cláusula não pode existir vazia.
checar('sem texto extra, não sai cláusula complementar vazia', t.includes('DISPOSIÇÕES COMPLEMENTARES'), false);
const comExtra = texto(contrato(ORCAMENTO, EMPRESA, { clausulasExtras: 'Acesso ao imóvel das 8h às 18h.' }));
checar('com texto extra, a cláusula complementar aparece', comExtra.includes('Acesso ao imóvel das 8h às 18h.'), true);
checar('e ela entra na sequência sem repetir número', [...comExtra.matchAll(/Cláusula (\d+)ª/g)].map(m => Number(m[1])).length, numeros.length + 1);

console.log('\n3) HONESTIDADE JURÍDICA — o documento diz o que é, e o app não promete o que não entrega');
checar('o contrato imprime o aviso jurídico', texto(html).includes(texto(AVISO_JURIDICO)), true);
checar('o aviso diz que não passou por advogado', AVISO_JURIDICO.includes('não foi redigido nem revisado por advogado'), true);
checar('o aviso informa a garantia legal do CDC', AVISO_JURIDICO.includes('não pode ser afastada por contrato'), true);
// O aviso NÃO é um selo de marca: nenhum plano pago pode removê-lo.
const pago = texto(contrato(ORCAMENTO, EMPRESA, undefined, { removerMarca: true }));
checar('plano pago remove o selo OLLI', pago.includes('Gerado com OLLI Orçamentos'), false);
checar('mas o aviso jurídico PERMANECE', pago.includes(texto(AVISO_JURIDICO)), true);
checar('no grátis o selo OLLI aparece', t.includes('Gerado com OLLI Orçamentos'), true);
// Nenhuma superfície — papel, módulos ou telas — pode prometer blindagem legal.
const FONTES_COPY: Array<[string, string]> = [
  ['o contrato gerado', html],
  ['o chassi', ler('../src/utils/documentoBase.ts')],
  ['o gerador de contrato', ler('../src/utils/contratoPdf.ts')],
  ['os termos', ler('../src/utils/termosPdf.ts')],
  ['a tela de modelos', ler('../src/screens/ModelosDocumentoScreen.tsx')],
  ['o modal de geração', ler('../src/components/documentos/GerarDocumentoModal.tsx')],
  ['o editor de cláusulas', ler('../src/components/documentos/EditorClausulasContrato.tsx')],
];
/**
 * Uma promessa só é promessa quando AFIRMADA. Este código fala das mesmas
 * expressões o tempo todo para NEGÁ-LAS ("não foi revisado por advogado",
 * "não garante validade jurídica") — uma busca por substring reprovaria
 * justamente o texto honesto e ensinaria a apagá-lo.
 *
 * Então: procura a expressão e exige uma negação nos ~46 caracteres anteriores.
 * Continua pegando a regressão de verdade ("Contrato com validade jurídica
 * garantida"), que é o que importa.
 */
function prometeAfirmando(src: string, promessa: string): boolean {
  const n = src.toLowerCase().replace(/\s+/g, ' ');
  const NEGACOES = ['não ', 'nao ', 'nem ', 'sem ', 'jamais ', 'nunca '];
  let i = n.indexOf(promessa);
  while (i >= 0) {
    const antes = n.slice(Math.max(0, i - 46), i);
    if (!NEGACOES.some(neg => antes.includes(neg))) return true;
    i = n.indexOf(promessa, i + 1);
  }
  return false;
}
for (const [nome, src] of FONTES_COPY) {
  for (const promessa of [
    'validade jurídica garantida',
    'juridicamente válido',
    'juridicamente blindado',
    'com validade legal',
    'aprovado por advogado',
    'revisado por advogado',
    'blindagem legal',
    'blindagem jurídica',
    'garantia jurídica',
    'vale como assinatura digital',
  ]) {
    checar(`${nome} não promete "${promessa}"`, prometeAfirmando(src, promessa), false);
  }
}
// A guarda acima não pode virar um "sempre false" que aprova qualquer coisa:
// uma frase afirmativa de verdade TEM que ser reprovada.
checar('a guarda pega uma promessa afirmada', prometeAfirmando('Contrato com validade jurídica garantida.', 'validade jurídica garantida'), true);
checar('e absolve a mesma frase negada', prometeAfirmando('Não garante validade jurídica garantida.', 'validade jurídica garantida'), false);
checar('a cópia do app diz que não é parecer de advogado', AVISO_APP.includes('Não é parecer de advogado'), true);
checar('e que não garante validade jurídica', AVISO_APP.includes('nem garante validade jurídica'), true);

console.log('\n4) XSS — o conserto do orçamento/recibo NÃO pode ser reaberto por documento novo');
const VENENO = '<script>alert(1)</script>';
const oMau: any = {
  ...ORCAMENTO,
  clienteNome: `Joana ${VENENO}`,
  clienteEndereco: `Rua " onload="alert(2)`,
  garantia: `<img src=x onerror=alert(3)>`,
};
const eMau: any = { ...EMPRESA, nome: `Frio ${VENENO}`, cidade: '"><b>x' };
const mau = gerarHtmlContrato(oMau, eMau, termosPadraoContrato(oMau, eMau), SEM_IMAGENS);
checar('nome de cliente com <script> sai escapado', mau.includes(VENENO), false);
checar('e aparece como entidade', mau.includes('&lt;script&gt;'), true);
checar('nome de EMPRESA com <script> sai escapado', mau.split('Frio &lt;script&gt;').length > 1, true);
checar('aspas em campo livre não fecham atributo', mau.includes('onload="alert(2)"'), false);
checar('garantia com <img onerror> sai escapada', mau.includes('<img src=x onerror'), false);
// A cor entra dentro de <style>: só hex validado pode passar.
const corMa = gerarHtmlContrato(ORCAMENTO, EMPRESA, termosPadraoContrato(ORCAMENTO, EMPRESA), SEM_IMAGENS, { corMarca: 'red;}body{display:none' } as any);
checar('cor de marca inválida não entra no <style>', corMa.includes('display:none'), false);
checar('e cai no azul padrão validado', /#[0-9a-fA-F]{6}/.test(corMa), true);
// Data URI forjado indo para src="...": mesmo vetor que img() do pdfGenerator fechou.
const logoMau = gerarHtmlContrato(ORCAMENTO, EMPRESA, termosPadraoContrato(ORCAMENTO, EMPRESA), {
  logo: 'data:image/png;base64,AAA" onerror="alert(4)',
  assinaturaPrestador: '',
});
checar('data URI adulterado não fecha o src', logoMau.includes('onerror="alert(4)"'), false);
// URI que não é data: (ex.: file://, http://) não vira imagem: no expo-print do
// Android ela não renderiza e no PDF vira ícone quebrado.
const logoFile = gerarHtmlContrato(ORCAMENTO, EMPRESA, termosPadraoContrato(ORCAMENTO, EMPRESA), {
  logo: 'file:///tmp/logo.png',
  assinaturaPrestador: '',
});
checar('URI que não é data: é descartada', logoFile.includes('file:///tmp/logo.png'), false);

console.log('\n5) "ERRO NUNCA VIRA VAZIO" aplicado a NÚMERO — 0% de multa é uma cláusula, não um vazio');
const padraoLimpo = termosPadraoContrato(ORCAMENTO, EMPRESA, {} as any);
checar('sem padrão salvo, a multa é a do app', padraoLimpo.multaAtrasoPercent, MULTA_ATRASO_PADRAO);
checar('sem padrão salvo, os juros são os do app', padraoLimpo.jurosMesPercent, JUROS_MES_PADRAO);
checar('sem padrão salvo, o aviso de rescisão é o do app', padraoLimpo.avisoPrevioDias, AVISO_PREVIO_PADRAO);
// NaN/undefined/lixo NÃO podem imprimir "0%" nem "NaN%".
for (const lixo of [NaN, undefined, 'abc', null, Infinity]) {
  const r = termosPadraoContrato(ORCAMENTO, EMPRESA, { multaAtrasoPercent: lixo } as any);
  checar(`multa corrompida (${String(lixo)}) cai no padrão, não em 0`, r.multaAtrasoPercent, MULTA_ATRASO_PADRAO);
}
checar('nenhum NaN chega ao papel', texto(contrato(ORCAMENTO, EMPRESA, { multaAtrasoPercent: NaN, jurosMesPercent: NaN } as any)).includes('NaN'), false);
// Teto do art. 52, §1º, do CDC: o app não ajuda a escrever cláusula abusiva.
checar('multa acima de 2% é clampada ao teto do CDC', termosPadraoContrato(ORCAMENTO, EMPRESA, { multaAtrasoPercent: 50 } as any).multaAtrasoPercent, 2);
checar('multa negativa é clampada a zero', termosPadraoContrato(ORCAMENTO, EMPRESA, { multaAtrasoPercent: -5 } as any).multaAtrasoPercent, 0);
checar('o papel cita o teto legal', t.includes('art. 52, §1º, do CDC'), true);
// Texto: nenhuma cláusula pode sair em branco.
const oVazio: any = { ...ORCAMENTO, garantia: '   ', clienteEndereco: '', agendamentoServico: '', dataPrestacaoServico: '', condicoesPagamento: '', sinalValor: 0, sinalPercentual: 0, formasPagamento: { credito: false, debito: false, dinheiro: false, pix: false } };
const vazio = termosPadraoContrato(oVazio, EMPRESA);
checar('garantia só com espaços cai no padrão', vazio.garantia.length > 20, true);
checar('sem data agendada, o prazo tem texto', vazio.prazo.length > 20, true);
checar('sem forma de pagamento, cita a regra supletiva do CC', vazio.pagamento.includes('art. 597 do Código Civil'), true);
checar('sem endereço, o local tem texto', vazio.local.length > 10, true);
const htmlVazio = texto(gerarHtmlContrato(oVazio, EMPRESA, vazio, SEM_IMAGENS));
checar('nenhuma cláusula sai com corpo vazio', /clausula-txt"><\/div>/.test(htmlVazio), false);
checar('e nenhum "undefined" chega ao papel', htmlVazio.includes('undefined'), false);
// Sinal maior que o total não pode virar cláusula que cobra mais que o contrato.
const oSinalDoido: any = { ...ORCAMENTO, sinalValor: 999999 };
checar('sinal maior que o total é clampado ao total', texto(gerarHtmlContrato(oSinalDoido, EMPRESA, termosPadraoContrato(oSinalDoido, EMPRESA), SEM_IMAGENS)).includes('R$ 999.999,00'), false);

console.log('\n6) ASSINATURA no contrato — campo próprio, imagem só quando existe, e duas testemunhas');
checar('sem assinatura, não sai <img> de assinatura', html.includes('class="ass-img"'), false);
checar('a linha para assinar no papel continua lá', (html.match(/class="ass-linha"/g) ?? []).length >= 2, true);
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const assinado = gerarHtmlContrato(ORCAMENTO, EMPRESA, termosPadraoContrato(ORCAMENTO, EMPRESA), SEM_IMAGENS, {
  assinaturaClienteUri: PNG,
  dataAssinaturaCliente: '2026-07-18T14:30:00.000Z',
});
checar('com assinatura, a imagem entra', assinado.includes(`<img src="${PNG}" class="ass-img"/>`), true);
// Colher data/hora e não imprimir deixaria o aceite só na tela de quem colheu.
checar('o carimbo de data/hora é impresso', texto(assinado).includes('Assinado no aparelho em'), true);
checar('e traz a data do aceite', texto(assinado).includes('18/07/2026'), true);
// CPC art. 784, III e CC art. 595: por isso as duas linhas existem no contrato.
checar('o contrato tem bloco de testemunhas', t.includes('Testemunhas'), true);
checar('com DUAS linhas de testemunha', (html.match(/class="test-col"/g) ?? []).length, 2);
// Os termos curtos não precisam de testemunha — e não devem fingir que precisam.
const garantiaHtml = gerarHtmlTermoGarantia(dadosGarantiaDeOrcamento(ORCAMENTO, EMPRESA), EMPRESA, SEM_IMAGENS);
checar('o termo de garantia NÃO tem testemunhas', garantiaHtml.includes('class="test-col"'), false);

console.log('\n7) o campo da assinatura do contrato é SEPARADO do aceite da proposta');
const tipos = semComentarios(ler('../src/types/index.ts'));
checar('`assinaturaContratoUri` é campo do tipo Orcamento', tipos.includes('assinaturaContratoUri?: string;'), true);
checar('`dataAssinaturaContrato` é campo do tipo Orcamento', tipos.includes('dataAssinaturaContrato?: string;'), true);
checar('`assinaturaClienteUri` (proposta) continua existindo', tipos.includes('assinaturaClienteUri?: string;'), true);
const modal = semComentarios(ler('../src/components/documentos/GerarDocumentoModal.tsx'));
/** Corpo de `gravarAssinatura` — o único trecho que ESCREVE no orçamento. */
const gravar = (() => {
  const i = modal.indexOf('const gravarAssinatura = useCallback(');
  if (i < 0) return '';
  const f = modal.indexOf('const construirHtml', i);
  return f < 0 ? modal.slice(i) : modal.slice(i, f);
})();
checar('o corpo de `gravarAssinatura` foi localizado', gravar.length > 0, true);
checar('grava no campo do CONTRATO', gravar.includes('assinaturaContratoUri: dataUri'), true);
checar('e no carimbo do CONTRATO', gravar.includes('dataAssinaturaContrato: assinadoEmISO'), true);
// Se gravasse no campo da proposta, a assinatura do contrato apareceria no PDF
// do orçamento — o app diria que o cliente assinou algo que não viu. A busca é
// no corpo da GRAVAÇÃO, não no arquivo: `assinaturaClienteUri` também é o nome
// da OPÇÃO do gerador de documento (`opts.assinaturaClienteUri`), e casar com
// ela reprovaria o código correto.
checar('a gravação NÃO toca o campo da proposta', gravar.includes('assinaturaClienteUri'), false);
checar('persiste de verdade (saveOrcamento)', gravar.includes('await saveOrcamento(atualizado)'), true);
// E o que é ENTREGUE ao gerador vem do campo do contrato.
checar('o documento é montado com a assinatura do contrato', modal.includes('assinaturaClienteUri: escolhido.assinaturaContratoUri'), true);
// A falha do save tem que SUBIR: é a rejeição que segura o pad aberto.
checar('a falha do save é relançada', /catch \(e\) \{\s*setAssinaturaFalhou\(true\);\s*throw e;\s*\}/.test(modal), true);
checar('nenhum catch vazio engole a falha', /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(modal), false);
// O PDF do orçamento não pode ter aprendido a ler o campo do contrato.
const pdfOrc = semComentarios(ler('../src/utils/pdfGenerator.ts'));
checar('o PDF do orçamento ignora a assinatura do contrato', pdfOrc.includes('assinaturaContratoUri'), false);

console.log('\n8) TERMO DE GARANTIA — os cinco pontos que o art. 50, § único, do CDC exige');
const g = texto(garantiaHtml);
checar('diz EM QUE CONSISTE a garantia', g.includes('Em que consiste a garantia'), true);
checar('declara o PRAZO', g.includes('Prazo da garantia'), true);
checar('e a data-limite calculada', g.includes('90 dias'), true);
checar('diz a FORMA de acionar', g.includes('Como e onde acionar'), true);
checar('diz o LUGAR (contato do prestador)', g.includes('(19) 99999-1234'), true);
checar('lista os ÔNUS do cliente', g.includes('O que cabe ao cliente'), true);
checar('lista o que NÃO cobre', g.includes('O que a garantia não cobre'), true);
checar('cita a base legal (art. 50 do CDC)', g.includes('art. 50 da Lei 8.078/1990'), true);
checar('e diz que a garantia legal não pode ser reduzida', g.includes('não pode ser reduzida nem afastada'), true);
checar('usa a garantia combinada no orçamento', g.includes('1 (um) ano sobre a instalação.'), true);
// A data-limite é calculada, não escrita à mão.
checar('a validade é a conclusão + prazo', somarDiasBR('2026-07-20', 90), '18/10/2026');
checar('data ilegível não vira validade inventada', somarDiasBR('não é data', 90), '');
checar('prazo corrompido não vira validade inventada', somarDiasBR('2026-07-20', NaN), '');
checar('e o papel não imprime "até " sem data', g.includes('· até <'), false);

console.log('\n9) TERMO DE CONCLUSÃO — "nenhuma pendência anotada" ≠ "está tudo perfeito"');
const c = texto(gerarHtmlTermoConclusao(dadosConclusaoDeOrcamento(ORCAMENTO, EMPRESA), EMPRESA, SEM_IMAGENS));
checar('declara a conclusão com data', c.includes('foi CONCLUÍDO em 20/07/2026'), true);
checar('nomeia quem está declarando', c.includes('O cliente Joana Ribeiro declara'), true);
checar('lista o que foi executado', c.includes('Instalação de split 12.000 BTUs'), true);
checar('imprime o valor do serviço', c.includes('R$ 660,00'), true);
// A frase honesta: o app não afirma, em nome do cliente, algo que ninguém viu.
checar('sem pendência, diz que NENHUMA FOI REGISTRADA', c.includes('Nenhuma pendência foi registrada'), true);
checar('e NÃO afirma que está tudo certo', /tudo (certo|ok|perfeito|em ordem)/i.test(c), false);
const comPend = texto(gerarHtmlTermoConclusao(dadosConclusaoDeOrcamento(ORCAMENTO, EMPRESA, { pendencias: 'Falta o acabamento do dreno.' }), EMPRESA, SEM_IMAGENS));
checar('com pendência, ela é impressa', comPend.includes('Falta o acabamento do dreno.'), true);
// O aceite não pode virar quitação de vício oculto.
checar('o aceite ressalva o vício oculto', c.includes('vício oculto'), true);
checar('marca o início da garantia', c.includes('começa a correr o prazo de garantia'), true);

console.log('\n10) FONTE — reusa o motor existente, não faz rede, e a UI está de fato ligada');
const chassi = semComentarios(ler('../src/utils/documentoBase.ts'));
const contratoSrc = semComentarios(ler('../src/utils/contratoPdf.ts'));
const termosSrc = semComentarios(ler('../src/utils/termosPdf.ts'));
for (const [nome, src] of [['o chassi', chassi], ['o contrato', contratoSrc], ['os termos', termosSrc]] as const) {
  // O prestador está na casa do cliente, sem rede. Documento é offline.
  checar(`${nome} não faz rede (sem fetch)`, /\bfetch\s*\(/.test(src), false);
  checar(`${nome} não fala com o supabase`, src.includes('supabase'), false);
  // Módulo puro no topo é o que torna este teste possível.
  checar(`${nome} não importa react-native no topo`, /^import[^\n]*from '(react-native)'/m.test(src), false);
}
// Um segundo motor de PDF era o risco explícito desta frente.
checar('o chassi reusa o selo OLLI existente', chassi.includes("from './marcaOlli'"), true);
checar('o chassi reusa o escape de HTML existente', chassi.includes("from './html'"), true);
checar('o chassi reusa o ajuste de contraste do tema', chassi.includes("from '../theme/cores'"), true);
checar('a saída em PDF é a mesma do orçamento', contratoSrc.includes("await import('./exportarDocumento')"), true);
checar('os termos usam a mesma saída', termosSrc.includes("await import('./exportarDocumento')"), true);
// pdfGenerator continua exportando o que reciboPdf/certificadoAnvisa importam.
checar('pdfGenerator ainda exporta o selo e o accent', pdfOrc.includes("export { DEFAULT_ACCENT, monogramSvg, footerSeloOlliHtml } from './marcaOlli';"), true);
// XSS: o conserto do orçamento tem que continuar intacto após esta frente.
checar('img() do orçamento continua escapando', pdfOrc.includes("return escapeHtml(IMG_CACHE[uri] || (uri.startsWith('data:') ? uri : ''));"), true);
// O certificado ANVISA tinha o MESMO buraco aberto; foi fechado aqui.
const anvisa = semComentarios(ler('../src/utils/certificadoAnvisaPdf.ts'));
checar('o certificado ANVISA escapa a logo', anvisa.includes('<img src="${escapeHtml(logoData)}"/>'), true);
checar('e escapa a assinatura', anvisa.includes('<img src="${escapeHtml(assinaturaData)}"/>'), true);

// A tela: sem entrada visível, o documento nasce escondido — que era o problema.
const tela = semComentarios(ler('../src/screens/ModelosDocumentoScreen.tsx'));
checar('a tela monta o modal de geração', tela.includes('<GerarDocumentoModal'), true);
checar('a tela monta o editor de cláusulas', tela.includes('<EditorClausulasContrato'), true);
checar('há gesto que abre a geração', tela.includes('setGerarDoc(d.id)'), true);
checar('há gesto que abre o editor', tela.includes('setEditorAberto(true)'), true);
checar('há prévia de exemplo dos documentos', tela.includes('setExemploDoc(d.id)'), true);
checar('a tela mostra o aviso honesto', tela.includes('{AVISO_APP}'), true);
// Três estados no modal: carregando ≠ erro ≠ lista vazia.
checar('o modal tem estado de carregando', modal.includes("estado === 'carregando'"), true);
checar('o modal tem estado de erro', modal.includes("estado === 'erro'"), true);
checar('o erro tem texto próprio', modal.includes('Não consegui ler seus orçamentos'), true);
checar('e o vazio de verdade tem outro texto', modal.includes('Nenhum orçamento salvo ainda'), true);
checar('a falha de leitura oferece tentar de novo', modal.includes('label="Tentar de novo"'), true);
/**
 * O CATCH da leitura, isolado.
 *
 * Ter a tela de erro escrita no JSX não prova nada: basta o `catch` cair em
 * `setOrcamentos([])` + `setEstado('pronto')` para o ramo virar código morto e o
 * app dizer "você não tem nenhum orçamento" a quem tem cinquenta. Foi assim que
 * uma mutação passou por este teste na primeira rodada — a asserção olhava o
 * JSX, não o caminho. Agora olha o caminho.
 */
const catchLeitura = (() => {
  const i = modal.indexOf('const todos = await getOrcamentos();');
  if (i < 0) return '';
  const c = modal.indexOf('} catch {', i);
  if (c < 0) return '';
  return modal.slice(c, modal.indexOf('}', modal.indexOf('setEstado', c)) + 1);
})();
checar('o catch da leitura foi localizado', catchLeitura.length > 0, true);
checar('a falha de leitura vira estado de ERRO', catchLeitura.includes("setEstado('erro')"), true);
checar('e NUNCA vira "pronto"', catchLeitura.includes("setEstado('pronto')"), false);
checar('nem esvazia a lista para fingir que não há nada', /setOrcamentos\(\s*\[\s*\]\s*\)/.test(catchLeitura), false);
// A prévia tem que reconstruir depois de assinar, senão o prestador vê o
// documento antigo e conclui que a assinatura não entrou.
checar('a chave da prévia inclui o carimbo da assinatura', modal.includes('escolhido?.dataAssinaturaContrato ?? \'\''), true);
// O editor não pode "salvar" o que não gravou.
const editor = semComentarios(ler('../src/components/documentos/EditorClausulasContrato.tsx'));
checar('o editor só fecha depois de gravar', editor.indexOf('await saveEmpresa(atualizada)') < editor.indexOf('aoSalvar(atualizada)'), true);
checar('e a falha de gravação mantém o editor aberto', /catch \{[\s\S]{0,200}setErro\(true\);\s*setSalvando\(false\);\s*return;/.test(editor), true);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
