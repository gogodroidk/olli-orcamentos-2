/**
 * Faxina de velocidade do painel e da landing (30/09/2026) — o peso não volta calado.
 *
 *     node scripts/teste-painel-leve.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O build passa MESMO com o peso de volta: basta alguém reinstalar o ApexCharts
 * para um gráfico, recolocar o SDK do Sentry em toda página da landing ou soltar
 * um SVG de demonstração em `assets/icons` (que entra no boot pelo glob eager).
 * Nenhum desses erros aparece no `tsc` nem no `vite build`. Por isso:
 *
 * 1) A geometria do donut em SVG (webapp/src/pages/olli/inicio/donut.ts).
 * 2) O mapeamento dos Web Vitals para o Sentry, sem caminho completo na métrica.
 * 3) Contratos de fonte: dependências removidas, páginas mortas, ícones usados,
 *    `lang` BCP 47, `<main>` no login, web-vitals ligado depois do Sentry, e o
 *    Sentry da landing carregado só quando há erro.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DONUT_FOLGA, fatiasDonut } from '../webapp/src/pages/olli/inicio/donut.ts';
import { medidaParaSentry, secaoDaRota } from '../webapp/src/olli/webVitals.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

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
const quase = (x: number, y: number) => Math.abs(x - y) < 1e-9;

console.log('\n1) donut em SVG — fatias somam o anel, na ordem, sem inventar');
{
  const f = fatiasDonut([2, 1, 1]);
  checar('uma fatia por grupo', f.length, 3);
  checar('porcentagens inteiras', f.map((x) => x.pct), [50, 25, 25]);
  checar('1ª fatia começa no topo', f[0].deslocamento, -0);
  checar('2ª começa onde a 1ª termina', quase(f[1].deslocamento, -50), true);
  checar('3ª começa em 75%', quase(f[2].deslocamento, -75), true);
  checar('folga entre fatias quando há mais de uma', quase(f[0].traco, 50 - DONUT_FOLGA), true);
  const um = fatiasDonut([7]);
  checar('fatia única fecha o anel inteiro (sem folga)', um[0].traco, 100);
  checar('total zero = sem fatias (estado vazio, não anel fantasma)', fatiasDonut([0, 0]), []);
  checar('lista vazia = sem fatias', fatiasDonut([]), []);
  const sujo = fatiasDonut([3, Number.NaN, -2, 1]);
  checar('NaN e negativo viram zero, não quebram a conta', sujo.map((x) => x.pct), [75, 0, 0, 25]);
  checar('grupo zerado não desenha traço', sujo[1].traco, 0);
  const minusculo = fatiasDonut([1000, 1]);
  checar('fatia minúscula ainda aparece como fio', minusculo[1].traco > 0, true);
}

console.log('\n2) Web Vitals → Sentry Metrics, sem dado de cliente');
{
  checar('seção da rota', secaoDaRota('/orcamentos'), '/orcamentos');
  checar('só o 1º segmento, sem query', secaoDaRota('/clientes/abc?busca=maria'), '/clientes');
  checar('segmento com cara de id vira /:id', secaoDaRota('/123e4567-e89b/editar'), '/:id');
  checar('raiz', secaoDaRota('/'), '/');
  const lcp = medidaParaSentry({ name: 'LCP', value: 1234.56, rating: 'good', navigationType: 'navigate' }, '/inicio?x=1');
  checar('LCP em ms arredondado', [lcp?.nome, lcp?.valor, lcp?.unidade], ['web_vital.lcp', 1235, 'millisecond']);
  checar('atributos só com seção, faixa e navegação', lcp?.atributos, { rota: '/inicio', faixa: 'good', navegacao: 'navigate' });
  const cls = medidaParaSentry({ name: 'CLS', value: 0.051234, rating: 'needs-improvement' }, '/agenda');
  checar('CLS adimensional', [cls?.nome, cls?.valor, cls?.unidade], ['web_vital.cls', 0.0512, 'none']);
  checar('INP aceito', medidaParaSentry({ name: 'INP', value: 180, rating: 'good' }, '/quadro')?.nome, 'web_vital.inp');
  checar('métrica fora da lista é descartada', medidaParaSentry({ name: 'TTFB', value: 10, rating: 'good' }, '/'), null);
  checar('valor inválido é descartado', medidaParaSentry({ name: 'LCP', value: Number.NaN, rating: 'good' }, '/'), null);
  checar('faixa desconhecida não passa crua', medidaParaSentry({ name: 'LCP', value: 1, rating: '<script>' }, '/')?.atributos.faixa, 'desconhecida');
}

console.log('\n3) painel — o peso tirado não volta');
{
  const pkg = JSON.parse(ler('webapp/package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  checar('sem apexcharts', 'apexcharts' in deps, false);
  checar('sem react-apexcharts', 'react-apexcharts' in deps, false);
  checar('sem react-helmet-async (não funcionava no React 19)', 'react-helmet-async' in deps, false);
  checar('web-vitals presente', typeof deps['web-vitals'], 'string');
  checar('vite.config sem chunk de gráfico', ler('webapp/vite.config.ts').includes('vendor-charts'), false);
  const donut = ler('webapp/src/pages/olli/inicio/StatusDonutCard.tsx');
  checar('donut não importa biblioteca de gráfico', /apexcharts|components\/chart/.test(donut), false);
  checar('donut usa a geometria pura', donut.includes('fatiasDonut('), true);
  checar('donut sem animação em loop', /animate-spin|repeat:\s*Infinity/.test(donut), false);

  for (const morto of [
    'webapp/src/components/chart',
    'webapp/src/pages/sys/login/mobile-form.tsx',
    'webapp/src/pages/sys/login/qrcode-form.tsx',
    'webapp/src/pages/olli/list',
    'webapp/src/pages/olli/placeholder',
  ]) {
    checar(`morto continua fora: ${morto}`, existsSync(join(RAIZ, morto)), false);
  }

  // Todo SVG de assets/icons entra no JS do boot (glob eager). Só fica o que é usado.
  const pastaIcones = join(RAIZ, 'webapp/src/assets/icons');
  const fontes: string[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, nome.name);
      if (nome.isDirectory()) {
        if (nome.name !== '_mock' && nome.name !== 'assets') varrer(caminho);
      } else if (/\.(tsx?|css)$/.test(nome.name)) {
        fontes.push(readFileSync(caminho, 'utf8'));
      }
    }
  };
  varrer(join(RAIZ, 'webapp/src'));
  const tudo = fontes.join('\n');
  const semUso = readdirSync(pastaIcones)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.replace(/\.svg$/, ''))
    .filter((n) => !tudo.includes(`local:${n}"`) && !tudo.includes(`/${n}.svg`));
  checar('todo SVG de assets/icons é usado fora do _mock', semUso, []);

  const i18n = ler('webapp/src/locales/i18n.ts');
  checar('lang gravado em BCP 47 ("pt-BR")', i18n.includes('document.documentElement.lang = "pt-BR";'), true);
  checar('lang não recebe o "pt_BR" do i18next', /documentElement\.lang\s*=\s*LNG/.test(i18n), false);
  checar('index.html com lang pt-BR', ler('webapp/index.html').includes('<html lang="pt-BR">'), true);
  checar('login tem landmark <main>', ler('webapp/src/pages/sys/login/index.tsx').includes('<main className="flex flex-1'), true);
  checar('páginas de erro têm <main> e h1', (() => {
    const l = ler('webapp/src/pages/sys/error/components/ErrorLayout.tsx');
    return l.includes('<main') && l.includes('as="h1"');
  })(), true);
  checar('título da aba por tela no layout', ler('webapp/src/layouts/dashboard/main.tsx').includes('useTituloDaAba('), true);

  const main = ler('webapp/src/main.tsx');
  const iInit = main.indexOf('Sentry.init(');
  const iVitals = main.indexOf('ligarWebVitals(');
  checar('web-vitals ligado DEPOIS do Sentry.init (nada antes da 1ª tela)', iInit > 0 && iVitals > iInit, true);
  checar('web-vitals vai como métrica, não como evento de erro', main.includes('Sentry.metrics.distribution'), true);
  checar('web-vitals só por import() dinâmico', /^import .*web-vitals/m.test(ler('webapp/src/olli/webVitals.ts')), false);
}

console.log('\n4) landing — Sentry só quando há erro');
{
  const astro = ler('web/astro.config.mjs');
  checar('integração injeta o carregador, não o SDK', astro.includes("clientInitPath: './src/scripts/sentry-sob-demanda.ts'"), true);
  const carregador = ler('web/src/scripts/sentry-sob-demanda.ts');
  checar('carregador não importa o SDK estaticamente', /^import .*@sentry/m.test(carregador), false);
  checar('carregador busca o SDK por import()', carregador.includes("import('../../sentry.client.config.js')"), true);
  checar('carregador guarda o erro antes do SDK chegar', carregador.includes("addEventListener('error'") && carregador.includes("addEventListener('unhandledrejection'"), true);
  const config = ler('web/sentry.client.config.js');
  checar('config exporta só a captura (namespace inteiro mata o tree-shaking)', /^export\s*\{\s*Sentry\s*\}/m.test(config), false);
  checar('config exporta capturarExcecao', config.includes('export function capturarExcecao'), true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
