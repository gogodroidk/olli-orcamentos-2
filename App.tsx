import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, View, Text, StyleSheet, Animated, Easing, Platform, Dimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { registerTranslation, pt as ptDatas } from 'react-native-paper-dates';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Spectral_600SemiBold,
  Spectral_700Bold,
} from '@expo-google-fonts/spectral';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { criarAppTheme, Colors, TemaProvider, useTema } from './src/theme';
import { Fonts, applyFontPatch } from './src/theme/fonts';
import { OlliLogo } from './src/components/OlliLogo';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { DialogoDesktopHost } from './src/components/DialogoDesktopHost';
import { AppNavigator } from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { instalarCapturaDeErro } from './src/services/errorReport';
import { getDb, getEmpresa } from './src/database/database';
import { ONBOARDED_KEY } from './src/screens/OnboardingScreen';
import { supabase, sessaoAtiva } from './src/services/supabase';
import { syncOnLogin } from './src/services/cloudSync';
import { esquecerPseudonimo } from './src/services/analyticsRemoto';
import { maybeAutoBackup } from './src/services/autoBackup';
import { criarLinkingConfig } from './src/navigation/linking';
import { limparCacheTipoConta, resetarTipoConta } from './src/hooks/useTipoConta';
import { DESKTOP_BREAKPOINT } from './src/hooks/useEhDesktop';
import type { RootStackParamList } from './src/navigation/AppNavigator';
import * as Sentry from '@sentry/react-native';

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
Sentry.init({
  dsn: 'https://5c5495085721aace9d32dbd79121c084@o4511745793327104.ingest.us.sentry.io/4511745839661061',
  environment: __DEV__ ? 'development' : 'production',
  // LGPD: nada de IP/dado pessoal. Mesma regra do errorReport.
  sendDefaultPii: false,
  // Plano grátis = 5k eventos/mês. Erro vai 100%; trace é amostrado.
  tracesSampleRate: 0.1,
});

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

const useNativeAnimations = Platform.OS !== 'web';

function BrandSplash() {
  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 650, easing: Easing.out(Easing.back(1.5)), useNativeDriver: useNativeAnimations }),
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: useNativeAnimations }),
    ]).start();
  }, []);

  return (
    <View style={styles.splash}>
      <Animated.View style={{ transform: [{ scale }], opacity, alignItems: 'center' }}>
        <OlliLogo size={104} />
        <Text style={styles.brand}>OLLI</Text>
        <Text style={styles.tagline}>Orçamentos que fecham negócio</Text>
      </Animated.View>
    </View>
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
  // O tema do Paper é recalculado só quando o modo ou a cor de marca mudam.
  const paperTheme = useMemo(() => criarAppTheme(modo, cores), [modo, cores]);
  const [dbReady, setDbReady] = useState(false);
  // Fail-closed: se a checagem de sessão lançar, a UI abre na PORTA do deslogado
  // (Landing na web, Entrar no nativo), nunca dentro do app. Só o caso "sem nuvem
  // configurada" abre direto nas Tabs.
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>(ROTA_DESLOGADO);
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Spectral_600SemiBold,
    Spectral_700Bold,
  });

  // Captura global de erro de JS -> caixa de feedback (o dono ve no /admin o que
  // quebra nos aparelhos). Instala uma vez; a tela atual vem do navigationRef.
  // Best-effort e defensivo: nunca derruba o app.
  useEffect(() => {
    instalarCapturaDeErro(() => {
      try { return navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined; }
      catch { return undefined; }
    });
  }, []);

  // Toque na notificação (lembrete de PMOC ou de agenda) leva o usuário à ÁREA certa.
  // Sem isto o payload (ordemId/agendamentoId) era CÓDIGO MORTO — tocar abria o app
  // em qualquer tela (achado da re-auditoria). As rotas OrdemServico/Agenda não recebem
  // id (ver RootStackParamList), então navegamos para a TELA/ABA relevante; abrir o item
  // específico exigiria um param novo nessas rotas (follow-up). Nunca derruba o app.
  useEffect(() => {
    function tratar(resposta: Notifications.NotificationResponse | null) {
      if (!resposta) return;
      try {
        const data = resposta.notification.request.content.data as { ordemId?: string; agendamentoId?: string };
        if (!navigationRef.isReady()) return;
        // `as never`: navigate com nome de rota dinâmico não casa os overloads do ref.
        if (data?.ordemId) navigationRef.navigate('OrdemServico' as never);
        else if (data?.agendamentoId) navigationRef.navigate('Agenda' as never);
      } catch { /* best-effort: nunca derruba o app */ }
    }
    const sub = Notifications.addNotificationResponseReceivedListener(tratar);
    // App aberto A PARTIR do toque (estava fechado): melhor-esforço se a navegação já montou.
    Notifications.getLastNotificationResponseAsync().then(tratar).catch(() => {});
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Abre o banco e, ANTES de liberar a UI, decide a rota inicial. A sessão
    // Supabase é a ÚNICA porta do app:
    //   • sem nuvem configurada (build dev)  → Tabs (único caso sem sessão);
    //   • sem sessão                          → Landing (web) / Entrar (nativo);
    //   • com sessão mas sem empresa/onboard  → Onboarding (pós-login);
    //   • com sessão e já configurado         → Tabs.
    // Fail-closed: qualquer erro cai no default 'Entrar' (nunca dentro do app).
    (async () => {
      try {
        await getDb();
        // Expurgo automático da lixeira (itens soft-deletados há mais de 30 dias).
        // Fire-and-forget best-effort: depende só do DB já aberto acima, nunca
        // bloqueia o boot e nunca lança (dynamic import + catch silencioso).
        import('./src/services/lixeira').then(m => m.purgarLixeiraAntiga()).catch(() => {});
        const [empresa, onboarded, session] = await Promise.all([
          getEmpresa(),
          AsyncStorage.getItem(ONBOARDED_KEY).catch(() => null),
          sessaoAtiva(),
        ]);
        if (!supabase) {
          // Build dev sem nuvem: não há login possível, entra direto nas abas.
          setInitialRoute('Tabs');
        } else if (!session) {
          // Deslogado: Landing (web) ou Entrar (nativo).
          setInitialRoute(ROTA_DESLOGADO);
        } else if (empresa === null && onboarded !== '1') {
          setInitialRoute('Onboarding');
        } else {
          setInitialRoute('Tabs');
        }
      } catch (e) {
        // Erro técnico só no console de desenvolvimento; em produção (APK) não
        // vaza stack trace ao usuário. O default 'Entrar' (fail-closed) segura.
        if (__DEV__) console.error(e);
      } finally {
        setDbReady(true);
      }
    })();
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
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        void syncOnLogin().finally(() => { void maybeAutoBackup(); });
      }
      // Guard de deep link deslogado (v4): com `linking`, a URL inicial tem
      // precedência sobre o initialRouteName — abrir /orcamentos "frio" (sem
      // sessão) montaria o app vazio. Ao boot sem sessão (INITIAL_SESSION &&
      // !session), reseta para a porta. Fecha o buraco sem tocar no fluxo OAuth:
      // o retorno ?code= dispara SIGNED_IN (não INITIAL_SESSION), então não cai
      // aqui. No nativo, onde não há deep link de URL de página, é inócuo.
      if (event === 'INITIAL_SESSION' && !session && navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: ROTA_DESLOGADO }] });
      }
      // Sair da conta (em qualquer tela) volta SEMPRE para a porta: reset central
      // aqui evita corrida com o signOut chamado pela ContaScreen. Só reseta se o
      // container já montou (isReady) — no boot deslogado a rota inicial já é Entrar.
      if (event === 'SIGNED_OUT') {
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

  // aplica o patch de fonte de forma síncrona (idempotente) antes de renderizar
  if (fontsLoaded) applyFontPatch();

  const ready = dbReady && fontsLoaded;

  // Esconde a splash nativa só quando tudo (fontes + banco) estiver pronto,
  // para a UI não aparecer antes da hora.
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
            {ready ? (
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
                  if (!navigationRef.isReady()) return;
                  const atual = navigationRef.getCurrentRoute()?.name;
                  const precisaDePorta =
                    initialRoute === ROTA_DESLOGADO || initialRoute === 'Onboarding';
                  if (precisaDePorta && atual && !ROTAS_PUBLICAS.has(atual)) {
                    navigationRef.reset({ index: 0, routes: [{ name: initialRoute }] });
                  }
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
            ) : (
              <BrandSplash />
            )}
          </View>
          {/* Host único de avisar()/confirmar() das telas desktop (dialogo.ts).
              Fica dentro do PaperProvider pra herdar o tema, mas fora do
              NavigationContainer/appFrame — não pode fechar junto com uma tela. */}
          <DialogoDesktopHost />
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  appFrame: { flex: 1, backgroundColor: Colors.background },
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primaryDark },
  brand: { fontSize: 42, fontFamily: Fonts.extraBold, color: '#fff', letterSpacing: 5, marginTop: 22 },
  tagline: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accent, letterSpacing: 1, marginTop: 4 }, // contraste-ok: splash Colors.primaryDark #042646 fixo (não segue o modo) — accentLight cairia a 2.96:1 (7.46:1)
});
