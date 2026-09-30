/**
 * MOVIMENTO DO PAINEL — nenhuma animação sem "Reduzir movimento", nenhum número solto.
 *
 *     node scripts/teste-motion-painel.ts
 *
 * Checagem ESTÁTICA (o painel não roda no node): lê os tokens, o CSS e cada
 * componente de webapp/src e falha se uma animação:
 *   • usar duração/curva/mola fora de `components/animate/tokens.ts`;
 *   • não tiver caminho sem movimento (CSS: token que zera em `prefers-reduced-motion`;
 *     Motion: `useMovimento`/`useReducedMotion` no arquivo);
 *   • animar outra coisa além de `transform`/`opacity`;
 *   • usar `motion.*` (quebra o LazyMotion strict: erro em dev, bundle gordo em prod);
 *   • rodar em loop infinito pelo Motion ou pulsar sem `motion-reduce`.
 * E confere que `tokens.css` é o espelho exato de `tokens.ts` — inclusive as curvas
 * `linear()` das molas, recalculadas aqui pela mesma função que as gerou.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXTENSAO_OLLI,
  TOKENS_MOTION,
  avaliarCurva,
  linearDeMola,
} from '../webapp/src/components/animate/tokens.ts';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(raiz, 'webapp', 'src');
const animate = join(src, 'components', 'animate');
let passou = 0;

function ok(condicao: unknown, mensagem: string): void {
  assert.ok(condicao, mensagem);
  passou += 1;
  console.log(`  ok   ${mensagem}`);
}

console.log('\nMovimento do painel — tokens, "Reduzir movimento" e só transform/opacity');

// ── 1) tokens.css é o espelho de tokens.ts ──────────────────────────────────
const css = readFileSync(join(animate, 'tokens.css'), 'utf8');
const inicioReduzir = css.indexOf('@media (prefers-reduced-motion: reduce)');
ok(inicioReduzir > 0, 'tokens.css tem o bloco prefers-reduced-motion');
const blocoRaiz = css.slice(css.indexOf(':root {'), inicioReduzir);
const fimReduzir = css.indexOf('@keyframes', inicioReduzir);
const blocoReduzir = css.slice(inicioReduzir, fimReduzir);

function vars(bloco: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of bloco.matchAll(/(--motion-[\w-]+)\s*:\s*([^;]+);/g)) mapa.set(m[1], m[2].trim());
  return mapa;
}
const cssRaiz = vars(blocoRaiz);
const cssReduzir = vars(blocoReduzir);

for (const [nome, ms] of Object.entries(TOKENS_MOTION.duracao)) {
  const chave = `--motion-duration-${nome}`;
  ok(cssRaiz.get(chave) === `${ms}ms`, `${chave} = ${ms}ms nos dois lados`);
}
for (const [nome, px] of Object.entries(TOKENS_MOTION.distancia)) {
  const chave = `--motion-distance-${nome}`;
  ok(cssRaiz.get(chave) === `${px}px`, `${chave} = ${px}px nos dois lados`);
}
for (const [nome, valor] of Object.entries(TOKENS_MOTION.escala)) {
  const chave = `--motion-scale-${nome}`;
  ok(cssRaiz.get(chave) === String(valor), `${chave} = ${valor} nos dois lados`);
}
ok(cssRaiz.get('--motion-scale-ring') === String(EXTENSAO_OLLI.escala.anel), 'extensão: anel do aprovado igual nos dois lados');
ok(
  cssRaiz.get('--motion-scale-settle-from') === String(EXTENSAO_OLLI.escala.assentarDe),
  'extensão: escala de partida do "assentar" igual nos dois lados',
);
for (const [nome, curva] of Object.entries(TOKENS_MOTION.curva)) {
  const chave = `--motion-ease-${nome}`;
  const texto = cssRaiz.get(chave) ?? '';
  const numeros = (texto.match(/cubic-bezier\(([^)]+)\)/)?.[1] ?? '').split(',').map(Number);
  ok(numeros.length === 4 && numeros.every((n, i) => n === curva[i]), `${chave} = cubic-bezier(${curva.join(', ')})`);
}
for (const nome of ['drawer', 'snappy'] as const) {
  const { duracaoMs, linear } = linearDeMola(TOKENS_MOTION.mola[nome]);
  ok(
    cssRaiz.get(`--motion-ease-spring-${nome}`) === linear && cssRaiz.get(`--motion-duration-spring-${nome}`) === `${duracaoMs}ms`,
    `mola "${nome}" em CSS = linearDeMola(tokens) (${duracaoMs}ms) — se falhar, regenere com a função`,
  );
  const pontos = linear.slice(7, -1).split(',').map(Number);
  ok(pontos[0] === 0 && pontos[pontos.length - 1] === 1, `mola "${nome}" começa em 0 e assenta em 1`);
}
ok(Math.abs(avaliarCurva(TOKENS_MOTION.curva.standard, 0.5) - 0.8) < 0.1 && avaliarCurva(TOKENS_MOTION.curva.enter, 1) === 1, 'avaliarCurva segue a curva do CSS e termina em 1');
ok(TOKENS_MOTION.duracao.celebration <= 900, 'celebração ≤ 900 ms (regra do plano)');

// ── 2) "Reduzir movimento" zera TODA duração, distância e escala ────────────
for (const [chave, valor] of cssRaiz) {
  if (chave.startsWith('--motion-duration-') && chave !== '--motion-duration-instant') {
    ok(cssReduzir.get(chave) === '1ms', `reduzir: ${chave} vira 1ms (era ${valor})`);
  }
  if (chave.startsWith('--motion-distance-')) ok(cssReduzir.get(chave) === '0px', `reduzir: ${chave} vira 0px`);
  if (chave.startsWith('--motion-scale-')) ok(cssReduzir.get(chave) === '1', `reduzir: ${chave} vira 1`);
}
ok(
  /\.surgir\s*\{\s*animation-delay:\s*0m?s\s*!important;?\s*\}/.test(blocoReduzir),
  'reduzir: escalonamento do surgir zera (o atraso inline não segura o item invisível)',
);
for (const v of ['enter-translate-x', 'enter-translate-y', 'enter-scale', 'enter-rotate', 'exit-translate-x', 'exit-translate-y', 'exit-scale', 'exit-rotate']) {
  ok(new RegExp(`--tw-${v}:\\s*[01]\\s*!important`).test(blocoReduzir), `reduzir: overlays do tw-animate sem --tw-${v}`);
}

// ── 3) keyframes e utilitários: só transform/opacity, tempo só de token ─────
const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];
ok(keyframes.length >= 5, `tokens.css define ${keyframes.length} keyframes`);
for (const [, nome, corpo] of keyframes) {
  const props = [...corpo.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
  ok(props.length > 0 && props.every((p) => p === 'transform' || p === 'opacity'), `@keyframes ${nome} anima só transform/opacity`);
}
for (const [, nome, corpo] of css.matchAll(/@utility\s+([\w-]+)\s*\{([^}]*)\}/g)) {
  const anim = corpo.match(/animation:\s*([^;]+);/)?.[1] ?? '';
  ok(/var\(--motion-duration-[\w-]+\)/.test(anim) && !/\d+m?s\b/.test(anim), `@utility ${nome}: duração vem de token (zera em reduzir)`);
}

// ── 4) infraestrutura ligada ────────────────────────────────────────────────
ok(TOKENS_MOTION.politica.reducedMotion === 'user', 'política: reducedMotion = "user"');
const lazy = readFileSync(join(animate, 'motion-lazy.tsx'), 'utf8');
ok(/<MotionConfig\s+reducedMotion=\{TOKENS_MOTION\.politica\.reducedMotion\}/.test(lazy), 'MotionConfig reducedMotion="user" envolve o painel (motion-lazy.tsx)');
ok(/<LazyMotion\s+strict/.test(lazy), 'LazyMotion continua strict');
ok(/@import\s+"\.\/components\/animate\/tokens\.css"/.test(readFileSync(join(src, 'global.css'), 'utf8')), 'global.css importa tokens.css');
ok(/surgir-pagina/.test(readFileSync(join(src, 'layouts', 'dashboard', 'main.tsx'), 'utf8')), 'troca de tela usa surgir-pagina (CSS, só opacidade)');
ok(/active:scale-\(--motion-scale-press\)/.test(readFileSync(join(src, 'ui', 'button.tsx'), 'utf8')), 'botão aperta com o token de press');

// ── 5) varredura de todo componente do painel ───────────────────────────────
// Herança do template Slash Admin, sem uso em tela (ver README do animate). NÃO
// acrescente arquivos novos aqui: código novo segue os tokens.
const HERANCA = new Set(
  ['motion-container.tsx', 'motion-viewport.tsx', join('scroll-progress', 'scroll-progress.tsx'), join('scroll-progress', 'use-scroll-progress.ts')].map((f) => join(animate, f)),
);
const HERANCA_DIR = join(animate, 'variants') + sep;

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

const PROPS_ANIMADAS = /\b(initial|animate|exit|whileHover|whileTap|whileInView|whileFocus|whileDrag)=\{\{([^}]*)\}/g;
const PERMITIDAS = new Set(['opacity', 'x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate', 'transition']);
const problemas: string[] = [];
let comMotion = 0;

for (const arquivo of arquivos(src)) {
  if (HERANCA.has(arquivo) || arquivo.startsWith(HERANCA_DIR)) continue;
  const rel = relative(raiz, arquivo);
  const texto = readFileSync(arquivo, 'utf8');
  // Comentários fora: um exemplo em comentário não é código.
  const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  if (/<motion\.\w|\bmotion\.(div|span|button|li|ul|section|a|p|img|svg|path)\b/.test(codigo)) {
    problemas.push(`${rel}: usa motion.* — use m.* (LazyMotion strict)`);
  }
  const importaMotion = /from\s+["']motion\/react["']/.test(codigo);
  const animaComMotion = importaMotion && /<m\.\w/.test(codigo);
  if (animaComMotion) {
    comMotion += 1;
    if (!/\buseMovimento\b|\buseReducedMotion\b/.test(codigo) && !arquivo.endsWith('motion-lazy.tsx')) {
      problemas.push(`${rel}: anima com m.* sem useMovimento/useReducedMotion`);
    }
  }
  for (const m of codigo.matchAll(PROPS_ANIMADAS)) {
    for (const chave of [...m[2].matchAll(/(\w+)\s*:/g)].map((k) => k[1])) {
      if (!PERMITIDAS.has(chave) && !['duration', 'ease', 'delay', 'type', 'stiffness', 'damping', 'mass'].includes(chave)) {
        problemas.push(`${rel}: ${m[1]} anima "${chave}" — só transform/opacity`);
      }
    }
  }
  // Código que usa o sistema de movimento: importa o Motion, os tokens ou as
  // variáveis `--motion-*`. As regras de número e de layout valem para ele; o resto
  // do painel (ex.: `duration: 3000` do toast, que é tempo de exibição, e a gaveta
  // lateral herdada do template) não é animação desta camada.
  const usaMovimento = importaMotion || /components\/animate\/|--motion-|\bsurgir\b/.test(codigo);
  if (importaMotion && !arquivo.endsWith(`${sep}tokens.ts`)) {
    // `duration: 0` é o "sem movimento" do useMovimento — o único número permitido.
    if (/\b(duration|stiffness|damping|staggerChildren|delayChildren)\s*:\s*(?!0(?![.\d]))\d/.test(codigo)) {
      problemas.push(`${rel}: número de movimento solto — use TRANSICAO/TOKENS_MOTION`);
    }
    if (/repeat\s*:\s*(Infinity|Number\.POSITIVE_INFINITY)/.test(codigo)) {
      problemas.push(`${rel}: loop infinito no Motion`);
    }
  }
  if (/requestAnimationFrame\s*\(/.test(codigo) && /textContent|setFracao|anima/i.test(codigo) && !/\buseMovimento\b|\buseReducedMotion\b|duration-\(--motion/.test(codigo)) {
    problemas.push(`${rel}: animação em requestAnimationFrame sem caminho para "Reduzir movimento"`);
  }
  for (const m of codigo.matchAll(/className=(?:"([^"]*)"|\{[^}]*?["'`]([^"'`]*)["'`])/g)) {
    const classes = m[1] ?? m[2] ?? '';
    if (/(^|\s)animate-(pulse|bounce|ping)\b/.test(classes) && !/motion-reduce:animate-none/.test(classes)) {
      problemas.push(`${rel}: animate-pulse/bounce/ping sem motion-reduce:animate-none`);
    }
    if (usaMovimento && /(^|\s)(transition-\[[^\]]*\b(width|height|top|left|right|bottom|margin|padding)\b[^\]]*\])/.test(classes)) {
      problemas.push(`${rel}: transição de propriedade de layout (${classes.match(/transition-\[[^\]]*\]/)?.[0]})`);
    }
  }
  // Atraso inline só onde "Reduzir movimento" o anula: no `surgir` (regra em
  // tokens.css) ou em animação que some com `motion-reduce:animate-none`.
  if (/animationDelay\s*:/.test(codigo) && !/\bsurgir\b|motion-reduce:animate-none/.test(codigo)) {
    problemas.push(`${rel}: animationDelay inline fora do surgir — em "Reduzir movimento" o atraso continuaria`);
  }
  if (arquivo.startsWith(animate) && /<canvas\b|getContext\(/.test(codigo)) {
    problemas.push(`${rel}: canvas na biblioteca de movimento`);
  }
}

ok(comMotion >= 1, `varredura achou ${comMotion} arquivo(s) animando com m.* (o teste está enxergando)`);
if (problemas.length) console.log(`\n${problemas.map((p) => `  FALHA ${p}`).join('\n')}\n`);
ok(problemas.length === 0, `nenhuma animação fora das regras em webapp/src (${problemas.length} problema(s))`);

// ── 6) os momentos existem e passam pela porta ──────────────────────────────
const contador = readFileSync(join(animate, 'contador-dinheiro.tsx'), 'utf8');
ok(/useMovimento\(\)/.test(contador) && /if \(reduzir \|\|/.test(contador), 'contador de dinheiro: "Reduzir movimento" mostra o valor pronto');
ok(/sr-only[\s\S]*formatar\(valor\)/.test(contador) && /aria-hidden="true"/.test(contador), 'contador de dinheiro: leitor de tela lê só o valor final');
ok(!/import\s*\{[^}]*\banimate\b[^}]*\}\s*from\s*["']motion/.test(contador), 'contador de dinheiro não traz o motor animate() do Motion');
const radar = readFileSync(join(src, 'pages', 'olli', 'inicio', 'RadarDinheiroCard.tsx'), 'utf8');
ok(/initial=\{false\}/.test(radar) && /exit=\{\{/.test(radar) && /surgir/.test(radar), 'radar: entrada em CSS, saída pelo Motion (initial={false})');
const aprovado = readFileSync(join(src, 'pages', 'olli', 'inicio', 'AprovadoPeloClienteCard.tsx'), 'utf8');
ok(/assentar/.test(aprovado) && /anel-celebracao/.test(aprovado) && /Agendar o servi/.test(aprovado), 'aprovado: celebração curta que termina numa ação');

// ── 7) LGPD: o valor em reais guardado para "desde a sua última visita" sai no "Sair"
const valorVisto = readFileSync(join(animate, 'use-valor-visto.ts'), 'utf8');
const memoria = readFileSync(join(animate, 'memoria-visto.ts'), 'utf8');
ok(/from\s+["']\.\/memoria-visto["']/.test(valorVisto) && !/["']olli\.visto\.["']/.test(valorVisto), 'use-valor-visto usa o prefixo único de memoria-visto.ts');
ok(/export function esquecerValoresVistos/.test(memoria) && /startsWith\(PREFIXO_VISTO\)/.test(memoria) && /removeItem/.test(memoria), 'esquecerValoresVistos apaga toda chave do prefixo');
const userStore = readFileSync(join(src, 'store', 'userStore.ts'), 'utf8');
const sair = userStore.slice(userStore.indexOf('export const useSignOut'), userStore.indexOf('export function useAuthSync'));
ok(/finally\s*\{[\s\S]*esquecerValoresVistos\(\)/.test(sair), '"Sair" apaga os valores vistos (computador compartilhado)');

console.log(`\n${passou} verificações passaram.\n`);
