/**
 * Onda 2, item 2.1 — fundação de motion (Reanimated 4).
 *
 *     node scripts/teste-motion-tokens.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que é puro roda de verdade: os tokens (`src/theme/motionTokens.ts`) e os
 * helpers de "Reduzir movimento". Os componentes são React Native e não rodam
 * em Node, então o teste lê o FONTE (sem comentários) e trava as regras da
 * fundação: só transform/opacity, nada de loop infinito fora do Skeleton, todo
 * componente ouvindo a preferência do sistema, e os dois pontos de prova ligados.
 */
import { readFileSync } from 'node:fs';
import {
  CICLO, CURVA, DISTANCIA, DURACAO, MOLA, STAGGER, TOQUE,
  atrasoEscalonado, duracaoAcessivel, duracoesAcessiveis,
} from '../src/theme/motionTokens.ts';

let falhas = 0;
let passes = 0;
function checar(nome: string, obtido: unknown, esperado: unknown) {
  if (Object.is(obtido, esperado)) {
    passes++;
    console.log(`  ok  ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHOU  ${nome}\n          esperado: ${JSON.stringify(esperado)}\n          obtido:   ${JSON.stringify(obtido)}`);
  }
}
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
/** Tira comentários de linha e de bloco: a prosa cita as regras que o teste procura. */
const semComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

// ─── 1. Tokens existem com os valores combinados ─────────────────────────────
console.log('\n1) Durações');
checar('instant = 90', DURACAO.instant, 90);
checar('fast = 160', DURACAO.fast, 160);
checar('base = 240', DURACAO.base, 240);
checar('slow = 360', DURACAO.slow, 360);
checar('escala crescente', DURACAO.instant < DURACAO.fast && DURACAO.fast < DURACAO.base && DURACAO.base < DURACAO.slow, true);

console.log('\n2) Molas, curvas, distâncias, stagger, toque');
for (const nome of ['snappy', 'gentle', 'bouncy'] as const) {
  const m = MOLA[nome];
  checar(`mola ${nome} tem damping/stiffness/mass positivos`, m.damping > 0 && m.stiffness > 0 && m.mass > 0, true);
}
checar('bouncy é a menos amortecida (quica mais)', MOLA.bouncy.damping < MOLA.gentle.damping && MOLA.bouncy.damping < MOLA.snappy.damping, true);
checar('snappy é a mais rígida', MOLA.snappy.stiffness > MOLA.gentle.stiffness && MOLA.snappy.stiffness > MOLA.bouncy.stiffness, true);
for (const nome of ['standard', 'emphasized', 'decelerate'] as const) {
  const c = CURVA[nome];
  const xValidos = c.length === 4 && c[0] >= 0 && c[0] <= 1 && c[2] >= 0 && c[2] <= 1;
  checar(`curva ${nome} é cubic-bezier válida (x em [0,1])`, xValidos, true);
  checar(`curva ${nome} termina em (1)`, c[3], 1);
}
checar('distâncias crescentes', DISTANCIA.sutil < DISTANCIA.entrada && DISTANCIA.entrada < DISTANCIA.deslize, true);
checar('stagger tem passo e teto', STAGGER.passo > 0 && STAGGER.maxItens > 0, true);
checar('escala do toque = 0.97', TOQUE.escalaPressionado, 0.97);
checar('opacidade do toque < 1', TOQUE.opacidadePressionado < 1 && TOQUE.opacidadePressionado > 0, true);
checar('ciclos de contagem e shimmer existem', CICLO.contagem > 0 && CICLO.shimmer > 0, true);

// ─── 3. Reduzir movimento zera durações ─────────────────────────────────────
console.log('\n3) "Reduzir movimento" zera as durações');
checar('duracaoAcessivel(240, true) = 0', duracaoAcessivel(240, true), 0);
checar('duracaoAcessivel(240, false) = 240', duracaoAcessivel(240, false), 240);
const reduzidas = duracoesAcessiveis(true);
checar('todas as durações viram 0', Object.values(reduzidas).every(v => v === 0), true);
checar('a tabela reduzida cobre todas as chaves', Object.keys(reduzidas).sort().join(','), Object.keys(DURACAO).sort().join(','));
const normais = duracoesAcessiveis(false);
checar('sem a preferência, durações intactas', (Object.keys(DURACAO) as (keyof typeof DURACAO)[]).every(k => normais[k] === DURACAO[k]), true);
checar('stagger zera com reduzir', atrasoEscalonado(5, true), 0);
checar('stagger do item 0 é 0', atrasoEscalonado(0, false), 0);
checar('stagger do item 2 = 2 passos', atrasoEscalonado(2, false), 2 * STAGGER.passo);
checar('stagger tem teto', atrasoEscalonado(500, false), STAGGER.maxItens * STAGGER.passo);
checar('stagger de índice inválido = 0', atrasoEscalonado(Number.NaN, false), 0);

// ─── 4. Hook lê a preferência do sistema e escuta mudanças ──────────────────
console.log('\n4) useReduzirMovimento ouve o sistema');
const motion = semComentarios(ler('../src/theme/motion.ts'));
checar('existe useReduzirMovimento', /export function useReduzirMovimento\(/.test(motion), true);
checar('lê isReduceMotionEnabled', /AccessibilityInfo\.isReduceMotionEnabled/.test(motion), true);
checar('escuta reduceMotionChanged', /addEventListener\?\.\(\s*'reduceMotionChanged'/.test(motion), true);
checar('remove o listener no cleanup', /sub\?\.remove\?\.\(\)/.test(motion), true);
checar('Motion.dur.base vem do token', /base:\s*DURACAO\.base/.test(motion), true);

// ─── 5. Componentes: só transform/opacity, reduzir movimento, sem loop solto ─
console.log('\n5) Regras dos componentes de motion');
const componentes = ['PressableAnimado', 'Aparecer', 'ContadorAnimado', 'Skeleton'] as const;
const fontes = Object.fromEntries(componentes.map(n => [n, semComentarios(ler(`../src/components/motion/${n}.tsx`))])) as Record<(typeof componentes)[number], string>;
for (const nome of componentes) {
  const src = fontes[nome];
  checar(`${nome} usa Reanimated`, /from 'react-native-reanimated'/.test(src), true);
  checar(`${nome} respeita Reduzir movimento`, /useReduzirMovimento\(\)/.test(src), true);
  checar(`${nome} cancela a animação ao desmontar`, /cancelAnimation\(/.test(src), true);
  checar(`${nome} não tem número mágico de duração`, /duration:\s*\d/.test(src), false);
  checar(`${nome} não cria mola com número solto`, /withSpring\([^)]*\{\s*damping/.test(src), false);
  // Animar layout (width/height/margem/top...) dentro de useAnimatedStyle é proibido.
  const blocos = [...src.matchAll(/useAnimatedStyle\(([\s\S]*?)\}\)?\);/g)].map(m => m[1]).join('\n');
  if (nome !== 'ContadorAnimado') checar(`${nome} tem estilo animado para conferir`, /transform|opacity/.test(blocos), true);
  checar(`${nome} anima só transform/opacity`, /\b(width|height|margin\w*|padding\w*|top|left|right|bottom|backgroundColor)\s*:/.test(blocos), false);
  if (nome !== 'Skeleton') checar(`${nome} sem loop infinito`, /withRepeat\(/.test(src), false);
}
checar('Skeleton é o único loop e desliga no web/reduzir', /!reduzir && Platform\.OS !== 'web'/.test(fontes.Skeleton), true);
checar('PressableAnimado escala com o token', /TOQUE\.escalaPressionado/.test(fontes.PressableAnimado), true);
checar('PressableAnimado volta com a mola snappy', /withSpring\(0, MOLA\.snappy\)/.test(fontes.PressableAnimado), true);
checar('PressableAnimado preserva o estado acessível', /accessibilityState=\{\{ disabled, \.\.\.accessibilityState \}\}/.test(fontes.PressableAnimado), true);
checar('ContadorAnimado anuncia o valor final', /accessibilityLabel=\{textoFinal\}/.test(fontes.ContadorAnimado), true);
checar('ContadorAnimado formata BRL', /formatCurrency/.test(fontes.ContadorAnimado), true);

// ─── 6. Pontos de prova ligados ─────────────────────────────────────────────
console.log('\n6) Pontos de prova');
const botao = semComentarios(ler('../src/components/OlliButton.tsx'));
checar('OlliButton usa PressableAnimado', /<PressableAnimado/.test(botao), true);
checar('OlliButton não usa mais OlliPressable', /OlliPressable/.test(botao), false);
const painel = semComentarios(ler('../src/components/PainelDinheiroParado.tsx'));
const blocoEsperando = painel.slice(painel.indexOf('ESPERANDO RESPOSTA'), painel.indexOf('ESPERANDO RESPOSTA') + 400);
checar('"Esperando resposta" usa ContadorAnimado em BRL', /<ContadorAnimado valor=\{totalFollowUp\} formato="brl"/.test(blocoEsperando), true);

// ─── 7. Dependência nativa declarada ────────────────────────────────────────
console.log('\n7) Dependências');
const pkg = JSON.parse(ler('../package.json')) as { dependencies: Record<string, string> };
checar('react-native-reanimated 4.x', /^[~^]?4\./.test(pkg.dependencies['react-native-reanimated'] ?? ''), true);
checar('react-native-worklets declarado', typeof pkg.dependencies['react-native-worklets'], 'string');

console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
