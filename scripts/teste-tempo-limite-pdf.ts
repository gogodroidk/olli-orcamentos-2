/**
 * PDF TRAVADO SEM ERRO (QA, 20/11/2026) — "Compartilhar PDF" girou mais de 7 min e nunca mostrou erro.
 *
 *     node scripts/teste-tempo-limite-pdf.ts
 * Exit 0 = passou; 1 = falhou.
 *
 *  1. `comTempoLimite`: resolve, repassa a falha, estoura no teto com ErroTempoLimite, descarta resposta tardia
 *     e não deixa timer pendurado nem rejeição sem dono.
 *  2. `falhaPdfParaTela`: nenhum caminho devolve título ou mensagem vazios (erro nunca vira vazio).
 *  3. Fonte: o teto é de 20 s e envolve o `printToFileAsync`; o link público também tem teto; a tela mostra
 *     o motivo com "Tentar de novo" (e não um toast que some).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  comTempoLimite,
  ErroTempoLimite,
  falhaPdfParaTela,
  MENSAGEM_PDF_DEMOROU,
  TEMPO_LIMITE_LINK_MS,
  TEMPO_LIMITE_PDF_MS,
} from '../src/utils/tempoLimite.ts';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
const raiz = new URL('../', import.meta.url).pathname;
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n');
const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const semDono: unknown[] = [];
process.on('unhandledRejection', (e) => semDono.push(e));

async function principal() {
  // ── 1. comTempoLimite ─────────────────────────────────────────────────────
  ok('teto do PDF é 20 s (pedido da CPO)', TEMPO_LIMITE_PDF_MS === 20_000);
  ok('teto do link público é menor que o do PDF', TEMPO_LIMITE_LINK_MS > 0 && TEMPO_LIMITE_LINK_MS < TEMPO_LIMITE_PDF_MS);

  ok('trabalho rápido resolve com o valor', (await comTempoLimite(Promise.resolve(7), 200, 'x', 'm')) === 7);

  let repassou = false;
  try {
    await comTempoLimite(Promise.reject(new Error('boom')), 200, 'x', 'm');
  } catch (e) {
    repassou = e instanceof Error && e.message === 'boom' && !(e instanceof ErroTempoLimite);
  }
  ok('falha do trabalho é repassada (não vira "tempo esgotado")', repassou);

  const t0 = Date.now();
  let estourou: unknown = null;
  try {
    await comTempoLimite(new Promise<never>(() => {}), 60, 'gerar-pdf', 'demorou demais');
  } catch (e) {
    estourou = e;
  }
  const gasto = Date.now() - t0;
  ok('promessa que nunca resolve estoura no teto (ErroTempoLimite)', estourou instanceof ErroTempoLimite);
  ok('o teto vale de verdade (não espera para sempre)', gasto >= 50 && gasto < 1000);
  ok('o erro leva a mensagem e a operação', estourou instanceof ErroTempoLimite && estourou.message === 'demorou demais' && estourou.operacao === 'gerar-pdf' && estourou.ms === 60);

  // resposta tardia depois do teto: descartada, sem rejeição sem dono
  let resolverTardio: (v: number) => void = () => {};
  const tardia = new Promise<number>((r) => { resolverTardio = r; });
  const corrida = comTempoLimite(tardia, 30, 'x', 'm').catch((e) => e);
  const r1 = await corrida;
  resolverTardio(1);
  await espera(20);
  ok('resposta tardia é descartada', r1 instanceof ErroTempoLimite);

  let rejeitarTardio: (e: Error) => void = () => {};
  const tardiaRuim = new Promise<number>((_, rej) => { rejeitarTardio = rej; });
  await comTempoLimite(tardiaRuim, 30, 'x', 'm').catch(() => {});
  rejeitarTardio(new Error('depois do teto'));
  await espera(30);
  ok('falha tardia depois do teto não vira rejeição sem dono', semDono.length === 0);

  // ── 2. mensagem para a tela ───────────────────────────────────────────────
  const casos: unknown[] = [
    new ErroTempoLimite('gerar-pdf', 20_000, MENSAGEM_PDF_DEMOROU),
    new ErroTempoLimite('gerar-pdf', 20_000, ''),
    new Error('Compartilhamento não disponível neste dispositivo. O PDF foi salvo em: /x/y.pdf'),
    new Error(''),
    new Error('   '),
    '',
    undefined,
    null,
    42,
    { message: 'objeto solto' },
  ];
  const todasPreenchidas = casos.every((c) => {
    const f = falhaPdfParaTela(c);
    return f.titulo.trim().length > 0 && f.mensagem.trim().length > 0;
  });
  ok('nenhum erro vira título ou mensagem vazia', todasPreenchidas);
  ok('tempo esgotado é marcado e sugere o link', falhaPdfParaTela(casos[0]).tempoEsgotado && /link de aprovação/.test(MENSAGEM_PDF_DEMOROU));
  ok('"compartilhar indisponível" mantém o aviso de onde o PDF ficou salvo', /foi salvo em/.test(falhaPdfParaTela(casos[2]).mensagem));
  ok('mensagem de tempo esgotado fala em 20 segundos (igual ao teto)', /20 segundos/.test(MENSAGEM_PDF_DEMOROU));

  // ── 3. fonte ──────────────────────────────────────────────────────────────
  const exp = ler('src/utils/exportarDocumento.ts');
  ok('exportarDocumento: printToFileAsync está dentro do teto de 20 s',
    /comTempoLimite<[^>]*>\(\s*Print\.printToFileAsync\([^)]*\),\s*TEMPO_LIMITE_PDF_MS/.test(exp));
  const chamadas = (exp.match(/Print\.printToFileAsync\(/g) ?? []).length;
  const comTeto = (exp.match(/comTempoLimite<[^>]*>\(\s*Print\.printToFileAsync\(/g) ?? []).length;
  ok('exportarDocumento: toda chamada de printToFileAsync tem teto', chamadas >= 1 && chamadas === comTeto);
  // nenhum outro arquivo de src imprime direto (todo PDF passa por exportarHtmlComoPdf, que tem o teto)
  const soltos = ['src/utils/pdfGenerator.ts', 'src/utils/documentoBase.ts', 'src/utils/contratoPdf.ts', 'src/utils/termosPdf.ts', 'src/components/PdfPreviewModal.tsx']
    .filter((arq) => /printToFileAsync\(/.test(ler(arq)));
  ok('nenhum outro arquivo chama printToFileAsync direto, sem teto', soltos.length === 0);

  const pdf = ler('src/utils/pdfGenerator.ts');
  ok('pdfGenerator: o link público tem teto e continua sem lançar',
    /comTempoLimite\(\s*gerarLinkOrcamento\(o, empresa\),\s*TEMPO_LIMITE_LINK_MS/.test(pdf) && /async function obterLinkPublico[\s\S]*?catch \{\s*return undefined;/.test(pdf));

  const tela = ler('src/screens/VisualizarOrcamentoScreen.tsx');
  const handler = tela.slice(tela.indexOf('async function handleShareAgora'), tela.indexOf('async function handleWhatsAppAgora'));
  ok('tela: falha do PDF abre a folha com "Tentar de novo" (não toast que some)',
    /Tentar de novo/.test(tela) && /falhaPdfParaTela\(falha\.erro\)/.test(tela));
  ok('tela: handleShareAgora não engole o erro em toast', handler.length > 0 && !/toast\.erro/.test(handler) && /return \{ erro: e \}/.test(handler));
  ok('tela: o loading continua sendo fechado no finally', /finally \{[\s\S]*?setSharing\(false\);[\s\S]*?setOverlayInfo\(null\);/.test(handler));

  console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error('erro no teste:', e);
  process.exit(1);
});
