/**
 * Teste de NAVEGAÇÃO — guard de perfil das abas + toque na notificação da Agenda.
 *
 *     node scripts/teste-navegacao-guard-notificacao.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Tranca duas regressões da onda 1 (item 1.2):
 * 1. O TabsComPerfilGuard voltava para 'verificando' a CADA foco da rota 'Tabs',
 *    desmontando o TabNavigator (a aba atual se perdia e tudo recarregava). Desde
 *    02/10/2026 o guard nem fecha mais as abas: ele só mede o cadastro para o
 *    banner do Início, e erro de leitura nunca vira "falta preencher".
 * 2. A notificação "Visita em 1h" fazia `navigate('Agenda')` pelo ref raiz. Agenda é
 *    ABA (dentro de 'Tabs'), então o toque morria quando as abas ainda não estavam
 *    montadas. O destino precisa ser 'Tabs' > 'Agenda' com `abrirAgendamentoId`.
 *
 * Checagem estática sobre o código sem comentários (comentário não é código).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');
// Linha antes de bloco: um `// ... /mp/*` num comentário de linha abriria um
// "bloco" falso e engoliria código até o próximo `*/`.
const semComentarios = (s: string) =>
  s.replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');

const app = semComentarios(readFileSync(join(raiz, 'App.tsx'), 'utf8'));
const nav = semComentarios(readFileSync(join(raiz, 'src/navigation/AppNavigator.tsx'), 'utf8'));

let falhas = 0;
let oks = 0;
function checar(cond: boolean, msg: string) {
  if (cond) { oks += 1; console.log(`  ok   ${msg}`); }
  else { falhas += 1; console.log(`  FALHA ${msg}`); }
}

// ── Guard ────────────────────────────────────────────────────────────────────
const iniGuard = nav.indexOf('function TabsComPerfilGuard');
const fimGuard = nav.indexOf('\nfunction ', iniGuard + 10);
const guard = nav.slice(iniGuard, fimGuard === -1 ? undefined : fimGuard);
checar(iniGuard !== -1, 'TabsComPerfilGuard existe');

// Desde 02/10/2026 o guard não fecha mais as abas (rejeição da Play): ele só
// mede o cadastro e publica para o banner do Início. As regressões da onda 1
// continuam trancadas: o foco nunca desmonta o TabNavigator e erro de leitura
// nunca vira "falta preencher" nem "completo".
const iniVerificar = guard.indexOf('const verificar');
const corpoVerificar = guard.slice(iniVerificar, guard.indexOf('useFocusEffect', iniVerificar));
checar(iniVerificar !== -1, 'checagem do perfil está num callback próprio (verificar)');
checar(
  /return \(\s*<CadastroNegocioProvider value=\{contexto\}>\s*<TabNavigator \/>\s*<\/CadastroNegocioProvider>\s*\);/.test(guard),
  'o TabNavigator SEMPRE renderiza (foco não desmonta a aba atual; cadastro incompleto não fecha o app)',
);
checar(!/'verificando'|'liberado'/.test(guard), "o guard não tem mais estado que esconda as abas ('verificando'/'liberado')");
const blocoCatch = corpoVerificar.split('.catch')[1] ?? '';
checar(
  /estadoCadastroDaLeitura\(\{ ok: false \}, estadoRef\.current\)/.test(blocoCatch),
  'erro de leitura passa pela regra pura de 3 estados (mantém o último conhecido; sem ele, "erro")',
);
checar(blocoCatch !== '' && !blocoCatch.includes("'incompleto'") && !blocoCatch.includes("'completo'"), 'erro não vira incompleto nem completo ("não sei" ≠ "falta preencher")');
checar(!/#FFFFFF/i.test(guard), 'guard sem cor cravada');

// ── Notificação ──────────────────────────────────────────────────────────────
checar(!/navigate\(\s*'Agenda'/.test(app), "App.tsx não navega mais para 'Agenda' direto pelo ref raiz");
checar(
  /\(\s*'Tabs',\s*\{\s*screen:\s*'Agenda',\s*params:\s*\{\s*abrirAgendamentoId:\s*data\.agendamentoId\s*\}/.test(app),
  "toque na notificação abre 'Tabs' > 'Agenda' com abrirAgendamentoId",
);
// React Navigation 7: navigate('Tabs') com tela do stack por cima EMPILHA outro
// 'Tabs' (TabNavigator + guard duplicados). Toda ida a 'Tabs' pelo ref usa pop.
const idasTabs = app.match(/\(\s*'Tabs',[\s\S]*?\);/g) ?? [];
checar(
  idasTabs.length >= 2 && idasTabs.every((t) => /\{\s*pop:\s*true\s*\}\s*,?\s*\);$/.test(t)),
  "ida a 'Tabs' pelo ref volta ao 'Tabs' existente ({ pop: true }), sem empilhar outro",
);
const usosHelper = app.match(/abrirDestinoDaNotificacao\(/g) ?? [];
checar(usosHelper.length >= 3, 'app quente e app frio usam o MESMO helper de destino');
checar(/Agenda:\s*\{[^}]*abrirAgendamentoId\?:\s*string/.test(nav), 'TabParamList.Agenda aceita abrirAgendamentoId');

console.log(falhas ? `\nFALHOU: ${falhas} falha(s), ${oks} ok` : `\nPASSOU: ${oks} ok, 0 falha(s)`);
process.exit(falhas ? 1 : 0);
