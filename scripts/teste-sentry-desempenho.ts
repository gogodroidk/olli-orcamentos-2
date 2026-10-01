/**
 * Sentry OLLI — medição de slow/frozen frames por tela (item 2.17).
 *
 *     node scripts/teste-sentry-desempenho.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O gate de `docs/MOTION_PERFORMANCE.md` (0 frozen e <5% slow em Home, Agenda,
 * Orçar e Detalhe) só é cobrável se a instrumentação estiver LIGADA. Leitura do
 * `App.tsx` (o react-native não carrega no node): a integração de navegação, os
 * trackings de frames/stall, o registro do container — e que nada disso mexeu no
 * que já protegia (DSN, PII, redatores, amostragem).
 */
import { readFileSync } from 'node:fs';

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
const app = ler('App.tsx');
const inicioInit = app.indexOf('Sentry.init({');
const fimInit = app.indexOf('\n});', inicioInit);
const init = app.slice(inicioInit, fimInit);

console.log('\n1. Instrumentação ligada');
checar('Sentry.init encontrado', inicioInit > 0 && fimInit > inicioInit, true);
checar('reactNavigationIntegration criada', /const navegacaoSentry = Sentry\.reactNavigationIntegration\(\{/.test(app), true);
checar('routeChangeTimeoutMs definido', /routeChangeTimeoutMs:\s*1_000/.test(app), true);
checar('integração criada ANTES do init', app.indexOf('const navegacaoSentry') < inicioInit, true);
checar('integração entra no init', /integrations:\s*\[navegacaoSentry\]/.test(init), true);
checar('frames tracking ligado', /enableNativeFramesTracking:\s*true/.test(init), true);
checar('stall tracking ligado', /enableStallTracking:\s*true/.test(init), true);
checar('app start tracking ligado', /enableAppStartTracking:\s*true/.test(init), true);
const onReady = app.indexOf('onReady={() => {');
const registro = app.indexOf('navegacaoSentry.registerNavigationContainer(navigationRef);');
checar('container registrado no onReady', onReady > 0 && registro > onReady && registro - onReady < 300, true);

console.log('\n2. Nada que já protegia mudou');
checar('DSN de produção inalterada', init.includes("dsn: 'https://5c5495085721aace9d32dbd79121c084@o4511745793327104.ingest.us.sentry.io/4511745839661061'"), true);
checar('sem PII', /sendDefaultPii:\s*false/.test(init), true);
checar('redator de evento', init.includes('beforeSend: (event) => limparEventoSentry('), true);
checar('redator de transação (as novas transações por tela passam nele)', init.includes('beforeSendTransaction: (event) => limparEventoSentry('), true);
checar('redator de breadcrumb', init.includes('beforeBreadcrumb: (breadcrumb) => limparBreadcrumbSentry('), true);
checar('trace amostrado em 10%', /tracesSampleRate:\s*0\.1,/.test(init), true);
checar('erro NÃO amostrado (sem sampleRate)', /\bsampleRate:/.test(init), false);
checar('nome de rota, não path completo', /useFullPathsForNavigationRoutes:\s*true/.test(app), false);

console.log('\n3. Gate documentado');
const doc = ler('docs/MOTION_PERFORMANCE.md');
for (const trecho of ['SM-G780F', 'Home', 'Agenda', 'NovoOrcamento', 'VisualizarOrcamento', '< 5%', 'TalkBack', 'Remover animações', 'dumpsys gfxinfo', 'frames_frozen']) {
  checar(`doc cita "${trecho}"`, doc.includes(trecho), true);
}

console.log(`\n${falhas ? 'FALHOU' : 'PASSOU'}: ${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
