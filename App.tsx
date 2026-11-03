import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, View, Text, StyleSheet, Platform, Dimensions, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { PaperProvider } from 'react-native-paper';
import { registerTranslation, pt as ptDatas } from 'react-native-paper-dates';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  Rubik_800ExtraBold,
} from '@expo-google-fonts/rubik';
import {
  Spectral_600SemiBold,
  Spectral_700Bold,
} from '@expo-google-fonts/spectral';
import { criarAppTheme, Colors, TemaProvider, useTema } from './src/theme';
import { Fonts } from './src/theme/fonts';
import { applyFontPatch } from './src/theme/aplicarFontPatch';
import { OlliLogo } from './src/components/OlliLogo';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { DialogoDesktopHost } from './src/components/DialogoDesktopHost';
import { ConfirmSheetHost, ToastHost } from './src/components/feedback';
import { AvisoRelogioErrado } from './src/components/AvisoRelogioErrado';
import { AtualizacaoObrigatoria, useVersaoMinima } from './src/components/AtualizacaoObrigatoria';
import { curvas } from './src/components/motion/curvas';
import { DURACAO, MOLA, TOQUE, useReduzirMovimento } from './src/theme/motion';
import { AppNavigator } from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { instalarCapturaDeErro } from './src/services/errorReport';
import { abrirParticaoDoUsuario, getDb, getEmpresa } from './src/database/database';
import { supabase, sessaoAtiva } from './src/services/supabase';
import { resolverEstadoEmpresaDaSessao, syncOnLogin } from './src/services/cloudSync';
import { iniciarReligarSync } from './src/services/iniciarReligarSync';
import { iniciarAvisoAberturaCliente } from './src/services/avisoAberturaCliente';
import { iniciarAuthAutoRefreshNativo } from './src/services/authAutoRefresh';
import { retomarCapturaOSInterrompida } from './src/services/capturaFotoOSNativa';
import { sincronizarPagamentosPendentes } from './src/services/pagamentos';
import { esquecerPseudonimo } from './src/services/analyticsRemoto';
import { maybeAutoBackup } from './src/services/autoBackup';
import { criarLinkingConfig } from './src/navigation/linking';
import { limparCacheTipoConta, resetarTipoConta } from './src/hooks/useTipoConta';
import { recarregarPlanoGlobal, resetarPlano } from './src/hooks/usePlano';
import { DESKTOP_BREAKPOINT } from './src/hooks/useEhDesktop';
import type { RootStackParamList } from './src/navigation/AppNavigator';
import * as Sentry from '@sentry/react-native';
import { limparBreadcrumbSentry, limparEventoSentry } from './src/services/sentryScrub';
import { capturarExcecao, conectarSentry } from './src/services/sentryCaptura';

/**
 * Sentry — crash reporting. Roda no import, ANTES de qualquer render, para pegar
 * erro de boot (foi assim que o v6 morreu no Hermes sem ninguém ver).
 *
 * Convive de propósito com `instalarCapturaDeErro` (src/services/errorReport.ts):
 * aquele encadeia o ErrorUtils preservando o handler anterior, então instalando o
 * Sentry primeiro (import) e o nosso depois (useEffect), OS DOIS recebem o erro —
 * o Sentry com stack simbolizado, o nosso na caixa do /admin.
 *
 * A DSN é pública por natureza (vai dentro do bundle do APK de qualquer jeito);
 * está fixa no código de propósito: em env var, uma variável faltando desligaria o
 * monitoramento em silêncio — que é o bug "erro vira vazio" que estamos matando.
 */
/**
 * Medição de desempenho por tela (item 2.17 — gate em docs/MOTION_PERFORMANCE.md).
 * Cada troca de rota vira uma transação com o NOME da tela (nunca parâmetro de
 * rota) e, no nativo, as medidas `frames_total`/`frames_slow`/`frames_frozen`
 * (frames tracking) e `stall_*` (JS travado, stall tracking). É o que permite
 * cobrar "0 frozen e <5% slow em Home, Agenda, Orçar e Detalhe".
 *
 * Só ACRESCENTA instrumentação: DSN, `sendDefaultPii`, redatores e a amostragem
 * de erro (100%) não mudam; trace continua amostrado em 10% (`tracesSampleRate`).
 * `routeChangeTimeoutMs`: navegação que não termina em 1 s é descartada, não
 * registrada como tela lenta. TTID só no nativo (na web não há frame nativo).
 */
const navegacaoSentry = Sentry.reactNavigationIntegration({
  routeChangeTimeoutMs: 1_000,
  enableTimeToInitialDisplay: Platform.OS !== 'web',
  ignoreEmptyBackNavigationTransactions: true,
});

Sentry.init({
  dsn: 'https://5c5495085721aace9d32dbd79121c084@o4511745793327104.ingest.us.sentry.io/4511745839661061',
  environment: __DEV__ ? 'development' : 'production',
  // LGPD: nada de IP/dado pessoal. Mesma regra do errorReport.
  sendDefaultPii: false,
  beforeSend: (event) => limparEventoSentry(event as unknown as Record<string, unknown>) as unknown as typeof event,
  beforeSendTransaction: (event) => limparEventoSentry(event as unknown as Record<string, unknown>) as unknown as typeof event,
  beforeBreadcrumb: (breadcrumb) => limparBreadcrumbSentry(breadcrumb as unknown as Record<string, unknown>) as unknown as typeof breadcrumb | null,
  // Plano grátis = 5k eventos/mês. Erro vai 100%; trace é amostrado.
  tracesSampleRate: 0.1,
  // Slow/frozen frames por tela + JS travado + tempo de abertura (padrão do SDK
  // já é true; explícito para ninguém desligar sem ver o gate cair).
  enableNativeFramesTracking: true,
  enableStallTracking: true,
  enableAppStartTracking: true,
  // Array = SOMA aos integrations padrão do SDK (não substitui).
  integrations: [navegacaoSentry],
});
// Exceções que o nosso código SEGURA (ErrorBoundary, catch do boot) não passam pelo
// handler global do SDK; elas chegam ao Sentry por esta porta (sentryCaptura.ts).
conectarSentry(Sentry);

SplashScreen.preventAutoHideAsync().catch(() => {});

// TimePickerModal/DatePickerModal (react-native-paper-dates) — Agenda usa
// locale="pt-BR". Registro único no boot (idempotente: é só uma atribuição de
// dicionário); PaperProvider abaixo já cobre o tema, então não precisa de outro
// provider — os modais dessa lib usam o Modal nativo do RN, não um Portal.
registerTranslation('pt-BR', ptDatas);

/**
 * Modo desktop RESOLVIDO UMA VEZ no boot (fora do render). O linking precisa de
 * um mapa de URL fixo — o dual-mapping mobile/desktop de 'orcamentos'/'clientes'
 * é decidido aqui, no momento de criar o NavigationContainer. Redimensionar a
 * janela cruzando 1024px troca o LAYOUT na hora (via useEhDesktop nas telas),
 * mas o MAPA de URL permanece o do boot — limitação aceita e documentada (F5).
 *
 * No nativo `Platform.OS !== 'web'` garante `false` (o mapa é o mesmo dos dois
 * lados exceto pela chave de 'orcamentos'/'clientes', que no APK é irrelevante).
 */
const ehDesktopInicial =
  Platform.OS === 'web' && Dimensions.get('window').width >= DESKTOP_BREAKPOINT;

// Config de linking criada uma única vez (referência estável) — recriar o objeto
// a cada render remontaria o NavigationContainer e perderia o estado.
const linkingConfig = criarLinkingConfig(ehDesktopInicial);

/**
 * Rotas que um VISITANTE DESLOGADO tem o direito de abrir direto pela URL. Tudo
 * que não está aqui é considerado protegido e o onReady devolve o visitante para
 * a porta.
 *
 * Privacidade e Termos precisam ser alcançáveis por link externo (exigência das
 * lojas e da LGPD); Ajuda e Planos estão no sitemap.xml e são a porta de entrada
 * do tráfego de busca. Sem esta lista, o guard tratava QUALQUER rota diferente de
 * `initialRoute` como protegida — inclusive estas cinco — e descartava o deep link.
 */
const ROTAS_PUBLICAS = new Set(['Landing', 'Entrar', 'Ajuda', 'Privacidade', 'Termos', 'Planos']);

/**
 * Destino do app DESLOGADO. Na WEB, um visitante que chega no domínio vê a
 * LANDING pública; no NATIVO (APK) não existe "chegar no domínio" — a porta é
 * direto o login ('Entrar'). Resolvido uma vez no boot (Platform é estável) e
 * usado em TODOS os pontos que mandam o usuário para fora do app: rota inicial,
 * boot sem sessão, INITIAL_SESSION sem sessão e SIGNED_OUT. Manter num só lugar
 * evita divergência entre eles.
 */
const ROTA_DESLOGADO: keyof RootStackParamList = Platform.OS === 'web' ? 'Landing' : 'Entrar';

/**
 * Ref global de navegação. A sessão Supabase é a única porta do app, então
 * precisamos comandar a navegação de fora da árvore de telas em dois momentos:
 * (1) SIGNED_OUT → resetar para 'Entrar' (sair da conta nunca deixa o usuário
 * dentro das Tabs); (2) guardas defensivos ("sessão expirada") em telas internas.
 */
// navigationRef mora em src/navigation/navigationRef (modulo folha, sem ciclos).

/** Payload que os lembretes locais gravam em `content.data` (agenda, PMOC, ritual, follow-up). */
type NotificacaoPendente = {
  ordemId?: string;
  agendamentoId?: string;
  ritual?: 'bomDia' | 'fecharDia';
  /** Follow-up D+2/D+5, "Cliente aprovou/recusou" ou "Cliente abriu agora" (services/followUpLembretes). */
  orcamentoId?: string;
  /** Lembrete agrupado de follow-up ou aviso de rascunhos: abre a lista. */
  listaOrcamentos?: 'followUp' | 'rascunhos';
  /** Onda I3: "Confirmar visitas de amanhã" (18h) → a fila. */
  vespera?: boolean;
  /** Onda I3: "Garantia vencendo em 7 dias" → as garantias para cuidar. */
  garantia?: boolean;
};

/**
 * Leva o toque na notificação para a área certa. Usado no app quente (listener)
 * e no app frio (fila consumida no `onReady`), para os dois caminhos não divergirem.
 *
 * Agenda é ABA (dentro de 'Tabs'), não rota do stack raiz: `navigate('Agenda')`
 * a partir do ref raiz só funcionava se o TabNavigator já estivesse montado — com
 * o guard de perfil ainda verificando (app frio), o toque morria em silêncio.
 * Navegar por 'Tabs' com a aba aninhada funciona nos dois casos, e o
 * `abrirAgendamentoId` diz à Agenda qual compromisso abrir.
 *
 * `{ pop: true }`: no React Navigation 7, `navigate('Tabs')` com outra tela do
 * stack por cima (ex.: detalhe de orçamento aberto quando o lembrete chega)
 * EMPILHA um segundo 'Tabs' — outro TabNavigator e outro guard de perfil em cima
 * do primeiro. Com `pop` ele volta ao 'Tabs' que já existe.
 */
function abrirDestinoDaNotificacao(data: NotificacaoPendente) {
  // `as never`/`as any`: navigate com nome de rota dinâmico (e, no caso de
  // 'Tabs', com params de rota aninhada) não casa os overloads do ref.
  if (data.ordemId) navigationRef.navigate('OrdemServico' as never);
  else if (data.agendamentoId) {
    (navigationRef.navigate as any)(
      'Tabs',
      { screen: 'Agenda', params: { abrirAgendamentoId: data.agendamentoId } },
      { pop: true },
    );
  } else if (data.ritual === 'fecharDia') navigationRef.navigate('RelatorioDia' as never);
  else if (data.ritual === 'bomDia') (navigationRef.navigate as any)('Tabs', { screen: 'Home' }, { pop: true });
  // Follow-up/resposta do cliente: VisualizarOrcamento e Orcamentos são rotas do
  // stack raiz (não abas), então o navigate direto funciona com app frio ou quente.
  else if (data.orcamentoId) (navigationRef.navigate as any)('VisualizarOrcamento', { orcamentoId: data.orcamentoId });
  else if (data.listaOrcamentos) navigationRef.navigate('Orcamentos' as never);
  else if (data.vespera) navigationRef.navigate('ConfirmarVisitas' as never);
  else if (data.garantia) navigationRef.navigate('Garantias' as never);
}

/**
 * Fundo da splash. É o MESMO `backgroundColor` do plugin `expo-splash-screen` em
 * app.json: a splash nativa some e a BrandSplash assume no mesmo pixel, sem
 * piscar de cor no meio (scripts/teste-feedback-navegacao.ts confere que os dois batem).
 */
const FUNDO_SPLASH = '#0A2547';

/**
 * Splash da marca — a PONTE entre a splash nativa e a primeira tela.
 *
 * Sequência (item 2.2 da Onda 2):
 * 1. a splash nativa (logo parado) cobre o boot do JS;
 * 2. assim que as fontes carregam e esta view já foi desenhada, a nativa é
 *    escondida — por baixo dela já está a BrandSplash, na mesma cor;
 * 3. a marca entra com a mola `gentle` enquanto o banco e a sessão resolvem;
 * 4. quando o app fica pronto, o navegador monta POR BAIXO e a BrandSplash
 *    some em fade (`DURACAO.slow`) por cima dele — a Home aparece, não "pula".
 *
 * Antes, a troca era seca: a splash nativa ficava até tudo pronto e a Home
 * surgia de uma vez (a BrandSplash animada quase nunca chegava a ser vista).
 * Com "Reduzir movimento", nada desliza: a marca já nasce no lugar e a saída é
 * imediata. Só transform/opacity, na UI thread.
 */
function BrandSplash({ saindo, aoDesenhar, aoSair }: { saindo: boolean; aoDesenhar: () => void; aoSair: () => void }) {
  const reduzir = useReduzirMovimento();
  // Marca: 0 = antes de entrar, 1 = no lugar. Véu: 1 = cobrindo, 0 = saiu.
  const marca = useSharedValue(reduzir ? 1 : 0);
  const cobertura = useSharedValue(1);

  useEffect(() => {
    if (reduzir) { marca.set(1); return; }
    marca.set(withSpring(1, MOLA.gentle));
    return () => cancelAnimation(marca);
  }, [reduzir, marca]);

  useEffect(() => {
    if (!saindo) return;
    if (reduzir) { aoSair(); return; }
    cobertura.set(withTiming(0, { duration: DURACAO.slow, easing: curvas.standard }, (terminou) => {
      if (terminou) scheduleOnRN(aoSair);
    }));
    // Rede de segurança: animação interrompida não pode deixar a splash por cima do app.
    const t = setTimeout(aoSair, DURACAO.slow * 3);
    return () => clearTimeout(t);
  }, [saindo, reduzir, cobertura, aoSair]);

  const estiloCobertura = useAnimatedStyle(() => ({ opacity: cobertura.get() }));
  const estiloMarca = useAnimatedStyle(() => {
    const p = marca.get();
    // Cresce de `escalaDestaque` (0.92) até 1: presença sem o "pulo" do back-easing antigo.
    const de = TOQUE.escalaDestaque;
    return { opacity: Math.min(1, p), transform: [{ scale: de + (1 - de) * p }] };
  });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.splash, estiloCobertura]}
      pointerEvents={saindo ? 'none' : 'auto'}
      onLayout={aoDesenhar}
      accessibilityLabel="OLLI carregando"
      // Saindo, a splash ainda cobre o app por um fade: o leitor de tela já
      // tem de ler a primeira tela que está por baixo, não a marca.
      accessibilityElementsHidden={saindo}
      importantForAccessibility={saindo ? 'no-hide-descendants' : 'auto'}
    >
      <Animated.View style={[styles.splashMarca, estiloMarca]}>
        <OlliLogo size={104} />
        <Text style={styles.brand}>OLLI</Text>
        <Text style={styles.tagline}>Orçamentos que fecham negócio</Text>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Raiz do app. O TemaProvider tem de ficar ACIMA de tudo que lê cor — inclusive do
 * PaperProvider, cujo tema deriva da nossa paleta.
 */
function App() {
  return (
    <TemaProvider>
      <AppConteudo />
    </TemaProvider>
  );
}

// Sentry.wrap é exigido pelo SDK: instala o ErrorBoundary nativo e a instrumentação
// de performance na raiz. Não substitui o nosso <ErrorBoundary> — envolve-o.
export default Sentry.wrap(App);

function AppConteudo() {
  const { modo, cores } = useTema();
  // Build Android abaixo da versão mínima do servidor (D-1326): a tela de atualizar substitui o navegador.
  const versao = useVersaoMinima();
  // O tema do Paper é recalculado só quando o modo ou a cor de marca mudam.
  const paperTheme = useMemo(() => criarAppTheme(modo, cores), [modo, cores]);
  const [dbReady, setDbReady] = useState(false);
  // Fail-closed: se a checagem de sessão lançar, a UI abre na PORTA do deslogado
  // (Landing na web, Entrar no nativo), nunca dentro do app. Só o caso "sem nuvem
  // configurada" abre direto nas Tabs.
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>(ROTA_DESLOGADO);
  // Corpo em Rubik (mesma família da landing e do painel), serifada em Spectral
  // (mesma do painel) só para valor R$. Os NOMES carregados aqui têm de bater
  // exatamente com os valores de `src/theme/fonts.ts` — é esse par de strings que
  // o `applyFontPatch` abaixo injeta em todo <Text>. Carregar um peso que o tema
  // não nomeia (ou vice-versa) não quebra o build: o texto simplesmente cai na
  // fonte do sistema, em silêncio, e ninguém vê até olhar o aparelho.
  //
  // Os 5 pesos são os 5 que `aplicarFontPatch.ts` mapeia (400/500/600/700/800).
  // Não somar peso sem necessidade: cada TTF de Rubik pesa ~208 kB brutos
  // (~85 kB gzip) — medido em node_modules, ~2× a Plus Jakarta que saiu, porque
  // a Rubik empacota cirílico (182 glifos), hebraico (47) e árabe (89) que este
  // app nunca vai desenhar. Fazer subset no build é follow-up conhecido.
  const [fontsLoaded] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
    Rubik_800ExtraBold,
    Spectral_600SemiBold,
    Spectral_700Bold,
  });

  // O refresh token acompanha o ciclo de vida nativo: pausa no background e
  // religa ao voltar. Evita refresh concorrente/suspenso parecer logout.
  useEffect(() => iniciarAuthAutoRefreshNativo(), []);

  // Captura global de erro de JS -> caixa de feedback (o dono ve no /admin o que
  // quebra nos aparelhos). Instala uma vez; a tela atual vem do navigationRef.
  // Best-effort e defensivo: nunca derruba o app.
  useEffect(() => {
    instalarCapturaDeErro(() => {
      try { return navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined; }
      catch { return undefined; }
    });
  }, []);

  // Toque na notificação (lembrete de PMOC, de agenda ou do Ritual diário) leva o
  // usuário à ÁREA certa. Sem isto o payload (ordemId/agendamentoId) era CÓDIGO
  // MORTO — tocar abria o app em qualquer tela (achado da re-auditoria). A Agenda
  // recebe o `abrirAgendamentoId` (ver TabParamList); OrdemServico ainda não
  // recebe id, então vai para a TELA. Nunca derruba o app.
  //
  // Ritual diário (services/ritualDiario.ts): "Bom dia da OLLI" leva pro hero da
  // Home (o "nunca-vazio" que já traz a ação de 1 toque pronta); "Fechar o dia"
  // leva direto pro RelatorioDia (onde mora o TTS/prévia que a notificação prometeu).
  //
  // APP FRIO: quando o toque abre o app do zero (estava morto), este efeito monta e
  // `getLastNotificationResponseAsync` resolve ANTES do NavigationContainer existir
  // (ele só monta quando `ready` vira true — fontes + banco). Sem fila, `tratar`
  // achava `navigationRef.isReady() === false` e descartava o toque em silêncio: o
  // deep link morria justo no caso mais comum (app fechado, lembrete tocado). O ref
  // abaixo guarda o payload pendente; o `onReady` do NavigationContainer (mais abaixo)
  // o consome assim que a navegação realmente existir.
  const notificacaoPendenteRef = useRef<NotificacaoPendente | null>(null);
  useEffect(() => {
    function tratar(resposta: Notifications.NotificationResponse | null) {
      if (!resposta) return;
      try {
        const data = resposta.notification.request.content.data as NotificacaoPendente;
        if (!data?.ordemId && !data?.agendamentoId && !data?.ritual && !data?.orcamentoId && !data?.listaOrcamentos && !data?.vespera && !data?.garantia) return;
        if (!navigationRef.isReady()) {
          notificacaoPendenteRef.current = data;
          return;
        }
        abrirDestinoDaNotificacao(data);
      } catch { /* best-effort: nunca derruba o app */ }
    }
    const sub = Notifications.addNotificationResponseReceivedListener(tratar);
    // App aberto A PARTIR do toque (estava fechado): se a navegação ainda não montou,
    // `tratar` enfileira acima em vez de descartar.
    Notifications.getLastNotificationResponseAsync().then(tratar).catch(() => {});
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Abre o banco e, ANTES de liberar a UI, decide a rota inicial. A sessão
    // Supabase é a ÚNICA porta do app:
    //   • sem nuvem configurada (build dev)  → Tabs (único caso sem sessão);
    //   • sem sessão                          → Landing (web) / Entrar (nativo);
    //   • com sessão + ausência confirmada     → Onboarding (pós-login);
    //   • estado remoto indeterminado          → tela de verificação do Onboarding;
    //   • com sessão e já configurado         → Tabs.
    // A rota Onboarding tem um gate próprio: enquanto a nuvem estiver
    // indeterminada, mostra retry e NÃO exibe o formulário nem grava empresa.
    (async () => {
      let haviaSessao = false;
      try {
        const session = await sessaoAtiva();
        haviaSessao = !!session;

        // A partição precisa ser escolhida ANTES de getDb/getEmpresa. Fazer a
        // leitura no banco que ficou aberto para outra conta poderia liberar a
        // Home com o cadastro de outra pessoa enquanto o sync ainda troca o DB.
        if (supabase && session?.user?.id) {
          await abrirParticaoDoUsuario(session.user.id);
        }
        await getDb();
        // Expurgo automático da lixeira (itens soft-deletados há mais de 30 dias).
        // Fire-and-forget best-effort: depende só do DB já aberto acima, nunca
        // bloqueia o boot e nunca lança (dynamic import + catch silencioso).
        import('./src/services/lixeira').then(m => m.purgarLixeiraAntiga()).catch(() => {});
        const empresa = await getEmpresa();
        if (!supabase) {
          // Build dev sem nuvem: não há login possível, entra direto nas abas.
          setInitialRoute('Tabs');
        } else if (!session) {
          // Deslogado: Landing (web) ou Entrar (nativo).
          setInitialRoute(ROTA_DESLOGADO);
        } else if (empresa !== null) {
          setInitialRoute('Tabs');
        } else {
          // Local vazio pode ser conta nova OU aparelho novo de uma conta que já
          // tem empresa. Só `nao_tem` autoriza o formulário. `nao_sei` segue para
          // a tela de verificação bloqueada, nunca para Home ou cadastro editável.
          const estadoRemoto = await resolverEstadoEmpresaDaSessao();
          if (estadoRemoto === 'tem') {
            setInitialRoute('Tabs');
          } else {
            setInitialRoute('Onboarding');
          }
        }
      } catch (e) {
        // Erro técnico só no console de desenvolvimento; em produção (APK) não
        // vaza stack trace ao usuário. Com sessão, a tela de verificação é mais
        // honesta que pedir login de novo; sem sessão, a porta continua fechada.
        if (__DEV__) console.error(e);
        // Boot que falhou abre na porta certa, mas não pode falhar em silêncio: é o
        // mesmo tipo de queda que matou o v6 no Hermes sem ninguém ver.
        capturarExcecao(e, { origem: 'boot' });
        if (haviaSessao) setInitialRoute('Onboarding');
      } finally {
        setDbReady(true);
      }
    })();
  }, []);

  const sincronizarTudo = useCallback(async () => {
    await syncOnLogin();
    await sincronizarPagamentosPendentes();
  }, []);

  // Sincronização per-row (painel web) ao logar. Listener global central: cobre
  // o login feito em qualquer tela (inclusive ContaScreen). Ao entrar uma sessão
  // (SIGNED_IN ou INITIAL_SESSION já autenticado), dispara o sync em background.
  // NÃO inclui TOKEN_REFRESHED: a renovação de token (~1h) não deve forçar um
  // sync completo. syncOnLogin é fire-and-forget e nunca lança (offline/deslogado = no-op).
  //
  // Logo em seguida, dispara o backup automático versionado (autoBackup.ts):
  // roda por conta própria (no-op se já houve 'diario' nas últimas 24h, toggle
  // desligado ou deslogado) e não depende do sync terminar — só entra DEPOIS
  // dele para não competir por rede com o sync no exato momento do login.
  useEffect(() => {
    if (!supabase) return;
    let usuarioDaSessao: string | null = null;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        if (usuarioDaSessao !== session.user.id) {
          usuarioDaSessao = session.user.id;
          resetarPlano();
          void recarregarPlanoGlobal();
        }
        void sincronizarTudo().finally(() => { void maybeAutoBackup(); });
      }
      // Guard de deep link deslogado (v4): com `linking`, a URL inicial tem
      // precedência sobre o initialRouteName — abrir /orcamentos "frio" (sem
      // sessão) montaria o app vazio. Ao boot sem sessão (INITIAL_SESSION &&
      // !session), reseta para a porta. Fecha o buraco sem tocar no fluxo OAuth:
      // o retorno ?code= dispara SIGNED_IN (não INITIAL_SESSION), então não cai
      // aqui. No nativo, onde não há deep link de URL de página, é inócuo.
      //
      // SEM INTERNET (I0 · sessão que não cai): com o token vencido e sem rede,
      // o INITIAL_SESSION chega com `session: null` embora a sessão continue
      // guardada no aparelho (o auth-js só apaga quando o SERVIDOR recusa). Antes
      // de expulsar alguém para a porta, confere a sessão guardada — senão o
      // técnico sem sinal caía no "Entrar" uma hora depois de abrir o app.
      if (event === 'INITIAL_SESSION' && !session && navigationRef.isReady()) {
        // setTimeout: nada de chamar o auth DENTRO do callback do auth (o lock
        // interno ainda está com quem emitiu o evento).
        setTimeout(() => {
          void sessaoAtiva().then((guardada) => {
            if (!guardada && navigationRef.isReady()) {
              navigationRef.reset({ index: 0, routes: [{ name: ROTA_DESLOGADO }] });
            }
          });
        }, 0);
      }
      // Sair da conta (em qualquer tela) volta SEMPRE para a porta: reset central
      // aqui evita corrida com o signOut chamado pela ContaScreen. Só reseta se o
      // container já montou (isReady) — no boot deslogado a rota inicial já é Entrar.
      //
      // Quem emite SIGNED_OUT: o "Sair" explícito ou o servidor dizendo que a
      // credencial morreu (invalid_grant, refresh token inexistente/já usado).
      // 429, 5xx, falha de rede e relógio errado NÃO chegam aqui: o fetch do
      // cliente os converte em "tente de novo" e a sessão continua guardada
      // (services/refreshResiliente.ts, rejeição da Play de 02/10/2026).
      if (event === 'SIGNED_OUT') {
        usuarioDaSessao = null;
        resetarPlano();
        // O papel do usuário que saiu não pode sobreviver ao logout: o store em
        // memória e o cache em disco são compartilhados por todo o app. Num aparelho
        // usado por técnico e dono, herdar o papel anterior restringe ou promete
        // demais. A hidratação também confere o dono, mas limpar é a defesa direta.
        resetarTipoConta();
        void limparCacheTipoConta();
        // Mesmo motivo, para o funil: o pseudônimo do PostHog fica em memória para
        // não re-hashear a cada evento. Sem esta linha, o primeiro evento do PRÓXIMO
        // usuário no mesmo aparelho sairia com o `distinct_id` de quem acabou de sair
        // — duas pessoas viram uma só no funil, e o dado fica errado justamente onde
        // ele existe para medir conversão.
        esquecerPseudonimo();
        if (navigationRef.isReady()) {
          navigationRef.reset({ index: 0, routes: [{ name: ROTA_DESLOGADO }] });
        }
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Religa o sync ao voltar do segundo plano (e, no web, quando o browser avisa
  // que a rede voltou). O listener acima cobre só BOOT e login: `INITIAL_SESSION`
  // não re-emite quando o app volta do bolso para a frente, então o que foi
  // escrito offline ficava esperando o app ser morto e reaberto. Ver
  // services/religarSync.ts para o limite que este gatilho NÃO cobre.
  useEffect(() => iniciarReligarSync(sincronizarTudo), [sincronizarTudo]);

  // "Cliente abriu seu orçamento agora" (termômetro, Pro): com o app ABERTO e
  // logado, escuta os sinais do link do cliente (Realtime) e avisa na hora. Com o
  // app no segundo plano a escuta desliga — não é push do servidor, e nenhum
  // texto promete isso. Ver services/avisoAberturaCliente.ts.
  useEffect(() => iniciarAvisoAberturaCliente(), []);

  // aplica o patch de fonte de forma síncrona (idempotente) antes de renderizar
  if (fontsLoaded) applyFontPatch();

  const ready = dbReady && fontsLoaded;

  // Handoff da splash (ver BrandSplash): a nativa sai assim que a BrandSplash
  // está desenhada COM as fontes certas — antes disso o texto da marca piscaria
  // na fonte do sistema. A BrandSplash cobre o resto do boot e some em fade.
  const [splashDesenhada, setSplashDesenhada] = useState(false);
  const [splashNaTela, setSplashNaTela] = useState(true);
  const marcarSplashDesenhada = useCallback(() => setSplashDesenhada(true), []);
  const tirarSplash = useCallback(() => setSplashNaTela(false), []);
  useEffect(() => {
    if (fontsLoaded && splashDesenhada) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, splashDesenhada]);
  // Rede de segurança: se a BrandSplash não reportar o layout (web sem layout,
  // erro de render), a nativa sai quando o app estiver pronto, como antes.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          {/* barStyle segue o MODO, não a marca: 'light-content' num app claro
              deixa os ícones do sistema brancos sobre branco — somem. */}
          <StatusBar
            backgroundColor="transparent"
            translucent
            barStyle={modo === 'escuro' ? 'light-content' : 'dark-content'}
          />
          {/* Na web o app ocupa a largura toda, em qualquer tamanho de janela. O
              frame de 430px que existia aqui desenhava um celular no meio do
              navegador sempre que a janela tinha menos de 1024px. Web é web, não
              emulador: abaixo do breakpoint o layout mobile flui em largura
              total, como qualquer site responsivo. No nativo isto nunca se
              aplicou — comportamento do APK intacto. */}
          <View style={[styles.appFrame, { backgroundColor: cores.background }]}>
            {ready && versao === 'atualizar' && <AtualizacaoObrigatoria />}
            {ready && versao !== 'atualizar' && (
              // linking com URLs reais (v4): o mapa é fixado no boot (linkingConfig).
              <NavigationContainer
                ref={navigationRef}
                linking={linkingConfig}
                // GATE DETERMINÍSTICO (web): com `linking`, a URL inicial tem
                // precedência sobre initialRouteName — sem isto, um visitante
                // deslogado abrindo '/' ou '/orcamentos' cairia DENTRO das Tabs
                // (o guard de INITIAL_SESSION perde a corrida com isReady()).
                // initialRoute já foi resolvido fail-closed no boot; se a porta é
                // do deslogado (Landing na web / Entrar no nativo) ou Onboarding e
                // o linking restaurou uma rota PROTEGIDA, reseta.
                //
                // O teste é "a rota restaurada é pública?", não "é diferente da
                // initialRoute?": as rotas públicas (Privacidade, Termos, Ajuda,
                // Planos) também são diferentes da porta, e a versão antiga as
                // descartava — matando todo deep link externo do deslogado.
                onReady={() => {
                  // Liga a transação por tela do Sentry (slow/frozen frames).
                  navegacaoSentry.registerNavigationContainer(navigationRef);
                  if (!navigationRef.isReady()) return;
                  const atual = navigationRef.getCurrentRoute()?.name;
                  const precisaDePorta =
                    initialRoute === ROTA_DESLOGADO || initialRoute === 'Onboarding';
                  if (precisaDePorta && atual && !ROTAS_PUBLICAS.has(atual)) {
                    navigationRef.reset({ index: 0, routes: [{ name: initialRoute }] });
                    // Sessão não está dentro do app agora (porta/onboarding): não
                    // navega para uma tela protegida por cima do reset acima. Um
                    // lembrete tocado sem sessão válida não deve arrastar ninguém
                    // para dentro do app — descarta o pendente.
                    notificacaoPendenteRef.current = null;
                    return;
                  }
                  // Toque em lembrete com o app FRIO (ver useEffect acima): a
                  // navegação não existia quando a resposta chegou; processa agora
                  // que o NavigationContainer está de pé.
                  const pendente = notificacaoPendenteRef.current;
                  if (pendente) {
                    notificacaoPendenteRef.current = null;
                    try { abrirDestinoDaNotificacao(pendente); } catch { /* best-effort */ }
                  }
                  // I0 · "a câmera mata o app e a OS volta igual": se o Android
                  // matou o app enquanto a pessoa fotografava para uma OS, recupera
                  // a foto pendente do picker, anexa e REABRE aquela OS. Sem o
                  // marcador gravado pela OS, não faz nada (services/capturaFotoOS).
                  // Só com a porta aberta: na porta (Entrar/Landing, rotas públicas
                  // que passam pelo guard acima) ou no Onboarding, reabrir a OS
                  // empurraria alguém sem sessão para DENTRO do app e gravaria a foto
                  // num banco sem dono. O marcador vence sozinho (30 min).
                  if (precisaDePorta) return;
                  void retomarCapturaOSInterrompida().then((retomada) => {
                    if (retomada.tipo !== 'reabrir' || !navigationRef.isReady()) return;
                    navigationRef.navigate('OrdemServico', { ordemId: retomada.ordemId });
                    if (retomada.fotosPerdidas > 0) {
                      Alert.alert(
                        'Foto não recuperada',
                        retomada.fotosPerdidas === 1
                          ? 'O celular fechou o app durante a câmera e não consegui recuperar a última foto. Tire de novo, por favor.'
                          : `O celular fechou o app durante a câmera e não consegui recuperar ${retomada.fotosPerdidas} fotos. Tire de novo, por favor.`,
                      );
                    }
                  });
                }}
              >
                {/* Boundary de topo (item 1.12): envolve só o navegador de telas —
                    uma exceção de render em qualquer tela cai aqui em vez de
                    branquear o app, sem desmontar o NavigationContainer (navigationRef
                    continua válido) nem exigir um boundary por tela. */}
                <ErrorBoundary>
                  <AppNavigator initialRouteName={initialRoute} />
                </ErrorBoundary>
              </NavigationContainer>
            )}
            {/* "Data e hora do celular erradas" (rejeição da Play, 02/10/2026): aviso
                por cima das telas, que NÃO bloqueia nada — a sessão já aguenta o
                relógio errado; o aviso só explica a lentidão e as datas tortas. */}
            {ready && <AvisoRelogioErrado />}
            {/* Por cima do navegador até terminar o fade de saída (ver BrandSplash). */}
            {splashNaTela && (
              <BrandSplash saindo={ready} aoDesenhar={marcarSplashDesenhada} aoSair={tirarSplash} />
            )}
          </View>
          {/* Host único de avisar()/confirmar() das telas desktop (dialogo.ts).
              Fica dentro do PaperProvider pra herdar o tema, mas fora do
              NavigationContainer/appFrame — não pode fechar junto com uma tela. */}
          <DialogoDesktopHost />
          {/* Feedback do app (item 2.2): toast (aviso que some sozinho) e folha de
              confirmação (sim/não). Fora do appFrame pelo mesmo motivo do host
              acima; o toast fica por cima de tudo que não é Modal. */}
          <ToastHost />
          <ConfirmSheetHost />
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  appFrame: { flex: 1, backgroundColor: Colors.background },
  splash: { justifyContent: 'center', alignItems: 'center', backgroundColor: FUNDO_SPLASH, zIndex: 10 },
  splashMarca: { alignItems: 'center' },
  brand: { fontSize: 42, fontFamily: Fonts.extraBold, color: '#fff', letterSpacing: 5, marginTop: 22 },
  tagline: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accent, letterSpacing: 1, marginTop: 4 }, // contraste-ok: splash FUNDO_SPLASH #0A2547 fixo (não segue o modo, igual à splash nativa) — accentLight cairia abaixo de 3:1
});
