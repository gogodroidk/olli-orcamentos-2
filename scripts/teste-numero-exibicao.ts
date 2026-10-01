/**
 * NÚMERO LEGÍVEL — `formatarNumeroExibicao` (item 2.16 da auditoria).
 *
 *     node scripts/teste-numero-exibicao.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O DEFEITO: o número de orçamento/recibo é gravado como `<seq com 3+ dígitos><aa>`
 * colados (`01126` = 11º de 2026) e aparecia assim para o cliente — no PDF, no
 * recibo, no WhatsApp e nas listas. Parece um código, não um número de documento.
 *
 * A REGRA: só a EXIBIÇÃO muda (`011/26`, `REC-011/26`). O ARMAZENADO NÃO MUDA: o
 * índice único por prestador em produção (`*_numero_por_tenant_uidx`) e o parser
 * de sequência (`extrairSequenciaDocumento`) dependem do formato colado. Quando o
 * texto não permite separar sequência e ano com segurança, ele aparece COMO ESTÁ.
 *
 *  1. Casos da função (formato atual, recibo, legado, lixo, idempotência).
 *  2. Ida e volta: o que a tela mostra bate com a sequência que o banco extrai.
 *  3. Armazenamento intacto: geradores e colisão continuam `<seq><aa>` sem barra.
 *  4. Mensagem de WhatsApp real (montada pela função de produção) sai legível.
 *  5. Os pontos de exibição usam a função; nomes de arquivo e txid NÃO (a `/`
 *     viraria pasta no nome do PDF).
 */
import { readFileSync } from 'node:fs';
import {
  extrairSequenciaDocumento,
  formatarNumeroExibicao,
  numeroDocumentoAposColisao,
} from '../src/utils/numeroDocumento.ts';
import {
  montarMensagemEnvioOrcamento,
  montarMensagemFollowUpOrcamento,
  montarMensagemLinkOrcamento,
} from '../src/utils/mensagensOrcamento.ts';
import type { Orcamento } from '../src/types/index.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  if (Object.is(real, esperado)) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${String(esperado)}\n        recebido: ${String(real)}`);
  }
}

const ler = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

console.log('\n1. Casos da função');
const casos: [string, unknown, string][] = [
  ['orçamento 11 de 2026 "01126"', '01126', '011/26'],
  ['orçamento 27 de 2026 "02726"', '02726', '027/26'],
  ['orçamento 1 de 2025 "00125"', '00125', '001/25'],
  ['sequência acima de 999 "123426"', '123426', '1234/26'],
  ['recibo "REC-00926"', 'REC-00926', 'REC-009/26'],
  ['recibo minúsculo "rec-00926" normaliza o prefixo', 'rec-00926', 'REC-009/26'],
  ['espaços em volta', '  01126 ', '011/26'],
  // Volta como está: não dá para separar sequência e ano com segurança.
  ['já formatado "011/26" (idempotente)', '011/26', '011/26'],
  ['recibo já formatado', 'REC-009/26', 'REC-009/26'],
  ['curto demais "0042" (sem 3+2 dígitos)', '0042', '0042'],
  ['legado com ano de 4 dígitos "2026-0012"', '2026-0012', '2026-0012'],
  ['OS "OS-0001" (outra numeração)', 'OS-0001', 'OS-0001'],
  ['sequência zero "00026"', '00026', '00026'],
  ['texto livre', 'abc', 'abc'],
  ['vazio', '', ''],
  ['null', null, ''],
  ['undefined', undefined, ''],
  ['número JS 12326', 12326, '123/26'],
];
for (const [nome, entrada, esperado] of casos) checar(nome, formatarNumeroExibicao(entrada), esperado);

console.log('\n2. Ida e volta com o parser do banco');
for (const armazenado of ['01126', '02726', '123426', 'REC-00926', 'REC-10026']) {
  const exibido = formatarNumeroExibicao(armazenado);
  const seqExibida = Number(exibido.replace(/^REC-/, '').split('/')[0]);
  checar(`"${armazenado}" → "${exibido}" mostra a sequência ${extrairSequenciaDocumento(armazenado)}`, seqExibida, extrairSequenciaDocumento(armazenado));
  checar(`"${armazenado}" → ano preservado`, exibido.endsWith(`/${armazenado.slice(-2)}`), true);
}

console.log('\n3. Armazenamento intacto');
const dataFixa = new Date(2026, 5, 1);
checar('colisão continua gerando "<seq><aa>" sem barra', numeroDocumentoAposColisao('orcamentos', ['00126'], 0, dataFixa).numero, '00226');
checar('colisão de recibo idem', numeroDocumentoAposColisao('recibos', ['REC-00926'], 0, dataFixa).numero, 'REC-01026');
const banco = ler('src/database/database.ts');
checar('gerador de orçamento inalterado', banco.includes("return `${String(seq).padStart(3, '0')}${year}`;"), true);
checar('gerador de recibo inalterado', banco.includes("return `REC-${String(seq).padStart(3, '0')}${year}`;"), true);
checar('o banco NÃO usa a função de exibição', banco.includes('formatarNumeroExibicao'), false);
const sync = ler('src/services/cloudSync.ts');
checar('a sincronização NÃO usa a função de exibição', sync.includes('formatarNumeroExibicao'), false);

console.log('\n4. Mensagens de WhatsApp reais');
const orc = {
  id: 'o1',
  numero: '01126',
  clienteNome: 'Maria Souza',
  itens: [{ nome: 'Instalação split' }],
  valorTotal: 350,
} as unknown as Orcamento;
const envio = montarMensagemEnvioOrcamento(orc, null);
checar('envio mostra "nº 011/26"', envio.includes('orçamento nº 011/26'), true);
checar('envio não mostra o número colado', envio.includes('01126'), false);
checar('link mostra "nº 011/26"', montarMensagemLinkOrcamento(orc, null, 'https://x').includes('nº 011/26'), true);
checar('follow-up mostra "nº 011/26"', montarMensagemFollowUpOrcamento(orc, null).includes('nº 011/26'), true);
const revisao = montarMensagemEnvioOrcamento({ ...orc, numero: '01326', revisaoDeNumero: '01126' } as Orcamento, null);
checar('revisão mostra os dois números legíveis', revisao.includes('nº 013/26') && revisao.includes('revisão do nº 011/26'), true);

console.log('\n5. Pontos de exibição usam a função; arquivo e txid não');
const exibicao: [string, RegExp][] = [
  ['src/utils/pdfGenerator.ts', /Nº \$\{escapeHtml\(formatarNumeroExibicao\(o\.numero\)\)\}/],
  ['src/utils/reciboPdf.ts', /escapeHtml\(formatarNumeroExibicao\(r\.numero\)\)/],
  ['src/utils/reciboPdf.ts', /escapeHtml\(formatarNumeroExibicao\(r\.orcamentoNumero\)\)/],
  ['src/utils/mensagensOrcamento.ts', /nº \$\{formatarNumeroExibicao\(orc\.numero\)\}/],
  ['src/services/radarFollowUpRegra.ts', /nº \$\{formatarNumeroExibicao\(item\.orcamento\.numero\)\}/],
  ['src/screens/HomeScreen.tsx', /Nº \{formatarNumeroExibicao\(o\.numero\)\}/],
  ['src/screens/OrcamentosScreen.tsx', /Nº \{formatarNumeroExibicao\(o\.numero\)\}/],
  ['src/screens/VisualizarOrcamentoScreen.tsx', /Orçamento nº \{formatarNumeroExibicao\(orc\.numero\)\}/],
  ['src/screens/EmitirReciboScreen.tsx', /Recibo Nº \{formatarNumeroExibicao\(item\.numero\)\}/],
  ['src/screens/desktop/OrcamentosDesktopScreen.tsx', /Nº \{formatarNumeroExibicao\(o\.numero\)\}/],
  ['src/screens/desktop/RecibosDesktopScreen.tsx', /\{formatarNumeroExibicao\(r\.numero\)\}/],
];
for (const [arq, re] of exibicao) checar(`${arq} exibe legível`, re.test(ler(arq)), true);

// Nome de arquivo: `/` viraria separador de pasta. Tem de continuar com o armazenado.
const pdf = ler('src/utils/pdfGenerator.ts');
checar('nome do PDF do orçamento usa o número armazenado', pdf.includes('const fileName = `Orcamento-${safeFileName(o.clienteNome)}-${o.numero}`;'), true);
for (const arq of ['src/screens/EmitirReciboScreen.tsx', 'src/screens/desktop/RecibosDesktopScreen.tsx']) {
  checar(`${arq}: nome do PDF do recibo usa o armazenado`, ler(arq).includes('`Recibo-${r.numero}`'), true);
}
for (const arq of [
  'src/utils/pdfGenerator.ts',
  'src/screens/EmitirReciboScreen.tsx',
  'src/screens/desktop/RecibosDesktopScreen.tsx',
  'src/components/PdfPreviewModal.tsx',
  'src/components/documentos/GerarDocumentoModal.tsx',
]) {
  const fonte = ler(arq);
  const nomesDeArquivo = [
    ...(fonte.match(/`(?:Orcamento|Recibo)-[^`]*`/g) ?? []),
    ...(fonte.match(/(?:fileName|nomeArquivo)\s*[=:]\s*[^;\n]*/g) ?? []),
  ];
  checar(`${arq}: achou o(s) nome(s) de arquivo`, nomesDeArquivo.length > 0, true);
  checar(`${arq}: nenhum nome de arquivo com o número de exibição`, nomesDeArquivo.some((l) => l.includes('formatarNumeroExibicao')), false);
}
checar('txid do Pix continua com o armazenado', ler('src/utils/cobrancaCliente.ts').includes('txid: orcamento.numero,'), true);

console.log(`\n${falhas ? 'FALHOU' : 'PASSOU'}: ${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
