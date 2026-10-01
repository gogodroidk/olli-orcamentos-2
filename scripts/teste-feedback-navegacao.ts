/**
 * Onda 2, itens 2.2 e 2.3 — feedback (toast + folha de confirmação + splash) e
 * toque/navegação premium.
 *
 *     node scripts/teste-feedback-navegacao.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que é puro roda de verdade: as filas de toast e de confirmação
 * (`src/components/feedback/filaFeedback.ts`). Os hosts e as telas são React
 * Native e não rodam em Node, então o teste lê o FONTE (sem comentários) e trava
 * as regras: só transform/opacity, "Reduzir movimento" respeitado, nada de
 * número mágico de duração, leitor de tela avisado, háptico por um helper só e
 * o "Backup feito!" fora do alerta cinza nativo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_TOASTS_NA_FILA,
  TEMPO_TOAST,
  criarFilaConfirmacao,
  criarFilaToast,
  duracaoDoToast,
  normalizarConfirmacao,
  textoAnunciado,
} from '../src/components/feedback/filaFeedback.ts';
import { GESTO, TOQUE } from '../src/theme/motionTokens.ts';

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

async function principal() {
  // ─── 1. Fila de toast ──────────────────────────────────────────────────────
  console.log('\n1) Fila de toast');
  const fila = criarFilaToast();
  checar('começa vazia', fila.atual(), null);
  checar('sem host não há ouvinte (a API cai no alerta do sistema)', fila.temOuvinte(), false);
  let avisos = 0;
  const sair = fila.assinar(() => { avisos++; });
  checar('assinar liga o ouvinte', fila.temOuvinte(), true);
  const a = fila.mostrar('sucesso', 'Backup feito');
  checar('mostrar notifica o host', avisos, 1);
  checar('o primeiro vira o atual', fila.atual()?.id, a);
  const repetido = fila.mostrar('sucesso', 'Backup feito');
  checar('o mesmo aviso repetido não duplica', repetido, a);
  checar('fila continua com 1', fila.todos().length, 1);
  const comAcao1 = fila.mostrar('sucesso', 'Foi para a Lixeira', { acao: { rotulo: 'Desfazer', aoTocar: () => {} } });
  const comAcao2 = fila.mostrar('sucesso', 'Foi para a Lixeira', { acao: { rotulo: 'Desfazer', aoTocar: () => {} } });
  checar('toast com "Desfazer" nunca é fundido (cada um desfaz um item)', comAcao1 !== comAcao2, true);
  checar('vazio vira texto honesto, nunca toast mudo', fila.todos().some(p => p.mensagem === '') , false);
  const vazio = fila.mostrar('erro', '   ');
  checar('erro vazio vira "Algo deu errado"', fila.todos().find(p => p.id === vazio)?.mensagem, 'Algo deu errado. Tente de novo.');
  for (let i = 0; i < 10; i++) fila.mostrar('info', `aviso ${i}`);
  checar(`teto: visível + ${MAX_TOASTS_NA_FILA} esperando`, fila.todos().length, MAX_TOASTS_NA_FILA + 1);
  checar('o visível nunca é derrubado pelo teto', fila.atual()?.id, a);
  checar('o mais novo sobrevive ao teto', fila.todos().at(-1)?.mensagem, 'aviso 9');
  fila.dispensar(a);
  checar('dispensar passa a vez ao próximo', fila.atual()?.id === a, false);
  fila.limpar();
  checar('limpar esvazia', fila.atual(), null);
  sair();
  checar('cancelar a assinatura desliga o ouvinte', fila.temOuvinte(), false);

  console.log('\n2) Tempo de leitura');
  checar('sucesso curto usa o piso do tipo', duracaoDoToast('sucesso', 'Salvo'), TEMPO_TOAST.sucesso);
  checar('erro fica mais que sucesso', duracaoDoToast('erro', 'x') > duracaoDoToast('sucesso', 'x'), true);
  checar('com botão fica pelo menos o piso de ação', duracaoDoToast('sucesso', 'x', true) >= TEMPO_TOAST.comAcao, true);
  checar('texto longo ganha tempo', duracaoDoToast('info', 'a'.repeat(120)) > duracaoDoToast('info', 'a'), true);
  checar('tem teto', duracaoDoToast('erro', 'a'.repeat(5000)), TEMPO_TOAST.maximo);
  checar('duração explícita é respeitada', criarFilaToast().todos().length === 0
    && (() => { const f = criarFilaToast(); const id = f.mostrar('info', 'x', { duracaoMs: 1234 }); return f.todos().find(p => p.id === id)?.duracaoMs; })(), 1234);

  console.log('\n3) Leitor de tela');
  checar('erro anuncia "Erro:"', textoAnunciado({ tipo: 'erro', mensagem: 'Sem internet' }), 'Erro: Sem internet');
  checar('sucesso anuncia título e mensagem', textoAnunciado({ tipo: 'sucesso', titulo: 'Backup feito', mensagem: 'Dados na nuvem.' }), 'Pronto: Backup feito. Dados na nuvem.');
  checar('ação é anunciada', textoAnunciado({ tipo: 'info', mensagem: 'x', acao: { rotulo: 'Desfazer', aoTocar: () => {} } }).includes('Ação disponível: Desfazer'), true);

  // ─── 4. Fila de confirmação ────────────────────────────────────────────────
  console.log('\n4) Folha de confirmação');
  const conf = criarFilaConfirmacao();
  const soltar = conf.assinar(() => {});
  const p1 = conf.pedir({ titulo: 'Excluir orçamento?', destrutivo: true });
  const p2 = conf.pedir({ titulo: 'Outra' });
  checar('a primeira pergunta fica na frente', conf.atual()?.titulo, 'Excluir orçamento?');
  checar('destrutivo sem rótulo vira "Excluir"', conf.atual()?.rotuloConfirmar, 'Excluir');
  const id1 = conf.atual()!.id;
  conf.responder(id1, true);
  conf.responder(id1, false); // toque duplo: ignorado
  checar('confirmar resolve true', await p1, true);
  checar('a próxima entra na frente', conf.atual()?.titulo, 'Outra');
  checar('não destrutivo vira "Confirmar"', conf.atual()?.rotuloConfirmar, 'Confirmar');
  conf.responder(conf.atual()!.id, 'sim' as unknown as boolean);
  checar('qualquer coisa que não seja true é "não"', await p2, false);
  const p3 = conf.pedir({ titulo: 'Pendurada' });
  soltar();
  checar('host desmontado com pergunta aberta responde "não" (await não fica pendurado)', await p3, false);
  const norm = normalizarConfirmacao({ titulo: '  ', rotuloCancelar: ' ', destrutivo: true }, 7);
  checar('título vazio ganha texto', norm.titulo, 'Tem certeza?');
  checar('cancelar vazio vira "Cancelar"', norm.rotuloCancelar, 'Cancelar');

  // ─── 5. Hosts: regras de motion ────────────────────────────────────────────
  console.log('\n5) Hosts de feedback seguem a fundação de motion');
  const toastSrc = semComentarios(ler('../src/components/feedback/ToastHost.tsx'));
  const sheetSrc = semComentarios(ler('../src/components/feedback/ConfirmSheet.tsx'));
  for (const [nome, src] of [['ToastHost', toastSrc], ['ConfirmSheet', sheetSrc]] as const) {
    checar(`${nome} usa Reanimated`, /from 'react-native-reanimated'/.test(src), true);
    checar(`${nome} respeita Reduzir movimento`, /useReduzirMovimento\(\)/.test(src), true);
    checar(`${nome} cancela a animação ao desmontar`, /cancelAnimation\(/.test(src), true);
    checar(`${nome} sem número mágico de duração`, /duration:\s*\d/.test(src), false);
    checar(`${nome} sem mola com número solto`, /withSpring\([^)]*\{\s*damping/.test(src), false);
    checar(`${nome} sem loop infinito`, /withRepeat\(/.test(src), false);
    checar(`${nome} arrasta com gesture-handler`, /Gesture\.Pan\(\)/.test(src) && /GestureDetector/.test(src), true);
    checar(`${nome} usa os limiares de GESTO`, /GESTO\./.test(src), true);
    const blocos = [...src.matchAll(/useAnimatedStyle\(([\s\S]*?)\}\)?\);/g)].map(m => m[1]).join('\n');
    checar(`${nome} anima só transform/opacity`, /\b(width|height|margin\w*|padding\w*|top|left|right|bottom|backgroundColor)\s*:/.test(blocos), false);
    checar(`${nome} vibra pelo helper único`, /vibrar\('/.test(src) && !/expo-haptics/.test(src), true);
  }
  checar('toast anuncia ao leitor de tela', /announceForAccessibility/.test(toastSrc), true);
  checar('toast dá o dobro do tempo com leitor de tela', /isScreenReaderEnabled/.test(toastSrc), true);
  checar('toast é dispensável por toque', /onPress=\{sair\}/.test(toastSrc), true);
  checar('folha é Modal (fica por cima de outro Modal)', /<Modal/.test(sheetSrc), true);
  checar('folha tem GestureHandlerRootView próprio (Modal do Android)', /<GestureHandlerRootView/.test(sheetSrc), true);
  checar('voltar do Android cancela', /onRequestClose=\{\(\) => fechar\(false\)\}/.test(sheetSrc), true);
  checar('destrutivo vibra aviso', /if \(pedido\.destrutivo\) vibrar\('aviso'\)/.test(sheetSrc), true);
  checar('destrutivo pinta o botão de perigo', /variant=\{pedido\.destrutivo \? 'danger' : 'primary'\}/.test(sheetSrc), true);
  checar('limiares de gesto existem', GESTO.limiarDispensa > 0 && GESTO.fracaoFechar > 0 && GESTO.fracaoFechar < 1 && GESTO.resistencia < 1, true);

  const api = semComentarios(ler('../src/components/feedback/index.ts'));
  checar('API sem host cai no alerta do sistema (aviso nunca some)', /if \(!filaToast\.temOuvinte\(\)\)/.test(api) && /Alert\.alert\(titulo, mensagem\)/.test(api), true);
  checar('confirmar sem host usa Alert com cancelar → false', /onPress: \(\) => resolver\(false\)/.test(api), true);
  // iOS: Modal irmão não abre por cima de outro Modal (UIKit "already presenting")
  // — a folha sumiria e o `await` ficaria pendurado. iOS vai ao alerta nativo.
  checar('confirmar no iOS usa o alerta nativo (Modal sobre Modal falha)', /Platform\.OS !== 'ios' && filaConfirmacao\.temOuvinte\(\)/.test(api), true);
  // VoiceOver: Pressable acessível esconde os filhos; a ação ("Desfazer") não pode
  // morar dentro do Pressable do corpo do toast.
  const corpoToast = toastSrc.match(/<Pressable\s+onPress=\{sair\}[\s\S]*?<\/Pressable>/)?.[0] ?? '';
  checar('ação do toast é irmã do corpo (alcançável pelo leitor de tela)', corpoToast.length > 0 && !/tocarAcao/.test(corpoToast), true);

  // ─── 6. App.tsx: hosts montados e splash suave ─────────────────────────────
  console.log('\n6) App.tsx');
  const app = semComentarios(ler('../App.tsx'));
  checar('ToastHost montado', /<ToastHost \/>/.test(app), true);
  checar('ConfirmSheetHost montado', /<ConfirmSheetHost \/>/.test(app), true);
  checar('BrandSplash fica por cima até o fade terminar', /\{splashNaTela && \(\s*<BrandSplash saindo=\{ready\}/.test(app), true);
  checar('splash nativa sai quando a BrandSplash está desenhada com as fontes', /if \(fontsLoaded && splashDesenhada\) SplashScreen\.hideAsync\(\)/.test(app), true);
  checar('BrandSplash sem Animated antigo (Reanimated)', /Animated\.timing\(/.test(app), false);
  const appJson = JSON.parse(ler('../app.json')) as { expo: { plugins: unknown[] } };
  const pluginSplash = appJson.expo.plugins.find(p => Array.isArray(p) && p[0] === 'expo-splash-screen') as [string, { backgroundColor: string }] | undefined;
  const fundoApp = app.match(/const FUNDO_SPLASH = '([^']+)'/)?.[1];
  checar('fundo da BrandSplash = fundo da splash nativa (sem piscar de cor)', fundoApp?.toLowerCase(), pluginSplash?.[1].backgroundColor.toLowerCase());

  // ─── 7. Telas migradas do Alert nativo ─────────────────────────────────────
  console.log('\n7) Alertas de alto uso migrados');
  const conta = semComentarios(ler('../src/screens/ContaScreen.tsx'));
  checar('"Backup feito!" saiu do alerta nativo', /Alert\.alert\('Backup feito/.test(conta), false);
  checar('backup usa toast.sucesso', /toast\.sucesso\('Seus dados estão seguros na nuvem\.', \{ titulo: 'Backup feito' \}\)/.test(conta), true);
  checar('falha do backup usa toast.erro', /titulo: 'Backup não feito'/.test(conta) && !/Alert\.alert\(\s*'Backup não feito'/.test(conta), true);
  checar('restaurar cópia confirma em folha destrutiva (2x)', (conta.match(/await confirmar\(\{/g) ?? []).length >= 2, true);
  const orc = semComentarios(ler('../src/screens/OrcamentosScreen.tsx'));
  checar('excluir orçamento confirma em folha', /titulo: 'Excluir orçamento\?'/.test(orc) && !/Alert\.alert\(\s*'Excluir orçamento'/.test(orc), true);
  checar('excluir orçamento oferece Desfazer', /restaurarItem\('orcamento', o\.id\)/.test(orc), true);
  checar('lote não esconde falha parcial', /foram para a Lixeira/.test(orc), true);
  const cli = semComentarios(ler('../src/screens/ClientesScreen.tsx'));
  checar('excluir cliente confirma em folha', /titulo: 'Excluir cliente\?'/.test(cli) && !/Alert\.alert\('Excluir cliente'/.test(cli), true);
  checar('excluir cliente oferece Desfazer', /restaurarItem\('cliente', c\.id\)/.test(cli), true);
  checar('linha do cliente usa PressableAnimado', /<PressableAnimado\s+style=\{\[styles\.card/.test(cli), true);

  // ─── 8. Háptico padronizado ────────────────────────────────────────────────
  console.log('\n8) Háptico por um helper único');
  const haptico = semComentarios(ler('../src/utils/haptico.ts'));
  for (const tipo of ['leve', 'medio', 'selecao', 'sucesso', 'erro', 'aviso']) {
    checar(`helper tem "${tipo}"`, new RegExp(`case '${tipo}'`).test(haptico), true);
  }
  const raizSrc = new URL('../src/', import.meta.url);
  const arquivos: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(caminho);
    }
  };
  andar(fileURLToPath(raizSrc));
  // "Não achei nada" só vale se a varredura de fato leu o app (não "leu zero arquivos").
  checar('a varredura leu o src inteiro', arquivos.length > 100, true);
  const foraDoHelper = arquivos
    .filter(f => !/[\\/]utils[\\/]haptico\.ts$/.test(f))
    .filter(f => /from 'expo-haptics'/.test(readFileSync(f, 'utf8')));
  checar('só o helper importa expo-haptics', foraDoHelper.map(f => f.split(/[\\/]src[\\/]/)[1]).join(', '), '');
  checar('PressableAnimado vibra pelo helper', /from '\.\.\/\.\.\/utils\/haptico'/.test(ler('../src/components/motion/pressionavel.ts')), true);

  // ─── 9. Navegação premium ──────────────────────────────────────────────────
  console.log('\n9) Toque e navegação');
  const nav = semComentarios(ler('../src/navigation/AppNavigator.tsx'));
  checar('sem duração cravada no stack', /animationDuration:\s*\d/.test(nav), false);
  checar('stack padrão desliza da direita', /opcoesTransicao\('slide_from_right', reduzir\)/.test(nav), true);
  checar('criar (Novo orçamento) sobe de baixo', /name="NovoOrcamento" component=\{NovoOrcamentoCentro\} options=\{criar\}/.test(nav), true);
  checar('Reduzir movimento vira fade no stack', /reduzir \? 'fade' : animacao/.test(nav), true);
  checar('troca de aba com fade + escala', /animation: 'fade',\s*sceneStyleInterpolator: trocaDeAbaSuave/.test(nav), true);
  checar('troca de aba usa token de duração', /duration: DURACAO\.fast/.test(nav), true);
  checar('troca de aba seca com Reduzir movimento/desktop', /ehDesktop \|\| reduzir \? \{ animation: 'none' as const \}/.test(nav), true);
  checar('troca de aba vibra seleção', /vibrar\('selecao'\)/.test(nav), true);
  checar('botão Orçar é PressableAnimado com escala de destaque', /<PressableAnimado[\s\S]*?escala=\{TOQUE\.escalaDestaque\}/.test(nav), true);
  checar('botão Orçar vibra médio', /haptic="medium"/.test(nav), true);
  checar('navegador sem TouchableOpacity', /TouchableOpacity/.test(nav), false);
  checar('escala de destaque < escala de card < 1', TOQUE.escalaDestaque < TOQUE.escalaPressionado && TOQUE.escalaPressionado < TOQUE.escalaCard && TOQUE.escalaCard < 1, true);
  const olliPressable = semComentarios(ler('../src/components/OlliPressable.tsx'));
  checar('OlliPressable roda na UI thread (adaptador do PressableAnimado)', /<PressableAnimado/.test(olliPressable) && !/Animated\.(timing|spring)\(/.test(olliPressable), true);

  console.log(`\n${passes} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
}

void principal();
