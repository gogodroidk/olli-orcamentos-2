import React, { useCallback, useEffect } from 'react';
import { View, ScrollView, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEstilos, type Cores } from '../theme';
import { useEhDesktop } from '../hooks/useEhDesktop';
import { RootStackParamList } from '../navigation/AppNavigator';
import { aplicarSeo } from '../utils/seoWeb';
import {
  TopoLanding,
  HeroLanding,
  PilaresLanding,
  ComoFuncionaLanding,
  MockProdutoLanding,
  PlanosLanding,
  ProvaLanding,
  FaqLanding,
  CtaFinalLanding,
  FooterLanding,
  CtaFixaLanding,
  WhatsAppFlutuante,
} from '../components/web/LandingSecoes';
import { ComparadorLanding } from '../components/web/ComparadorLanding';
import { TeatroOffline } from '../components/web/TeatroOffline';
import { RevealProvider, Revelar, useRevealScrollHandler } from '../components/Revelar';
import { LandingScrollProvider, useLandingScrollHandler } from '../components/web/LandingScroll';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Versão WEB (real) — o Metro escolhe este arquivo (`LandingScreen.web.tsx`)
 * ao empacotar para a web; o nativo pega `LandingScreen.tsx` (stub, ao lado).
 * A rota 'Landing' só é alcançada na web (`ROTA_DESLOGADO` em App.tsx é
 * 'Entrar' no nativo) — sem este split, todo este conteúdo (Landing +
 * Reveal/Parallax/Tilt3D/Comparador/TeatroOffline) ainda assim entrava no
 * bundle Hermes do APK, só por causa do import estático no AppNavigator.
 *
 * Página de PRODUTO para quem chega deslogado no domínio (v4/FRENTE 4).
 *
 * Puramente de apresentação + navegação: nenhuma chamada de auth/rede própria
 * (o cadastro/login real continua todo em EntrarScreen; os preços reais e o
 * checkout continuam todos em PlanosScreen). Aqui só existem CTAs que levam a
 * essas telas — zero lógica de negócio duplicada.
 *
 * 'Landing' ainda NÃO está registrada em RootStackParamList/linking (arquivos
 * do INTEGRADOR — ver observações do relatório desta frente). Por isso as
 * rotas de Ajuda/Privacidade/Termos (que também não existem ainda) são
 * navegadas via cast — o padrão já usado em outras telas do app (ex.:
 * InicioDesktopScreen) para paths que só o integrador registra depois.
 */
export default function LandingScreen() {
  const nav = useNavigation<Nav>();
  const ehDesktop = useEhDesktop();
  const styles = useEstilos(criarEstilos);

  // Rota pública "/" — sem isso, a home fica com o <title>/canonical fixos do
  // index.html estático (mesmo problema das demais rotas públicas; ver
  // src/utils/seoWeb.ts).
  //
  // Esta descrição é FACTUAL, não copy de posicionamento: o Google a indexa e o
  // WhatsApp a usa no cartão do link. Só pode citar o que o app entrega HOJE.
  // Duas coisas que ela já afirmou e eram falsas: "ordem de serviço com assinatura"
  // (a OS tem fotos e checklist; quem tem assinatura é o ORÇAMENTO) e "equipe"
  // (os recursos de equipe do plano Empresa estão "(em breve)" em PlanosScreen).
  useEffect(() => {
    aplicarSeo({
      titulo: 'OLLI Orçamentos — Do orçamento ao recibo, sem planilha',
      descricao:
        'OLLI é o sistema para quem presta serviço em campo: orçamento que o cliente aprova e assina online, ordem de serviço com fotos e checklist, agenda, clientes e financeiro num só lugar. Comece grátis.',
      caminho: '/',
    });
  }, []);

  const irParaEntrar = () => nav.navigate('Entrar');
  const irParaPlanos = () => nav.navigate('Planos');
  const irParaAjuda = () => (nav as any).navigate('Ajuda');
  const irParaPrivacidade = () => (nav as any).navigate('Privacidade');
  const irParaTermos = () => (nav as any).navigate('Termos');

  return (
    <View style={styles.container}>
      {/* LandingScrollProvider: fonte única da posição de rolagem (ver
          LandingScroll.tsx — a JANELA não rola nesta tela, só a ScrollView
          abaixo; parallax do hero e a CTA fixa assinam esse contexto).
          RevealProvider: as secoes abaixo da dobra se revelam ao rolar ate elas
          (em vez de animarem no mount, antes de estarem visiveis). O conteudo real
          vive em ConteudoLanding para o onScroll poder ler os dois contextos.
          CtaFixaLanding/WhatsAppFlutuante ficam FORA da ScrollView, como irmãs
          absolutas sobre este contêiner de tela cheia — por isso "flutuam" por
          cima do conteúdo rolado em vez de rolar junto. */}
      <LandingScrollProvider>
        <RevealProvider>
          <ConteudoLanding
            ehDesktop={ehDesktop}
            irParaEntrar={irParaEntrar}
            irParaPlanos={irParaPlanos}
            irParaAjuda={irParaAjuda}
            irParaPrivacidade={irParaPrivacidade}
            irParaTermos={irParaTermos}
            styles={styles}
          />
        </RevealProvider>
        <CtaFixaLanding onCriarConta={irParaEntrar} />
      </LandingScrollProvider>
      <WhatsAppFlutuante />
    </View>
  );
}

/**
 * Conteudo da landing. Separado do LandingScreen so para poder chamar
 * useRevealScrollHandler()/useLandingScrollHandler() DENTRO dos respectivos
 * providers (os hooks leem o contexto).
 */
function ConteudoLanding({
  ehDesktop, irParaEntrar, irParaPlanos, irParaAjuda, irParaPrivacidade, irParaTermos, styles,
}: {
  ehDesktop: boolean;
  irParaEntrar: () => void; irParaPlanos: () => void; irParaAjuda: () => void;
  irParaPrivacidade: () => void; irParaTermos: () => void;
  styles: ReturnType<typeof criarEstilos>;
}) {
  const onRevealScroll = useRevealScrollHandler();
  const onLandingScroll = useLandingScrollHandler();
  // Um único onScroll da ScrollView real alimenta os dois: o reveal-on-scroll
  // (existente) e o parallax/CTA-fixa (novos) — nenhum listener próprio extra.
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onRevealScroll(e);
    onLandingScroll(e);
  }, [onRevealScroll, onLandingScroll]);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollConteudo}
      onScroll={onScroll}
      scrollEventThrottle={32}
    >
      {/* Topo + Hero ficam acima da dobra: ja aparecem/animam no load (o Hero
          tem a propria entrada + o fundo Aurora). Do Pilares pra baixo, revela ao rolar. */}
      <TopoLanding onEntrar={irParaEntrar} onCriarConta={irParaEntrar} />
      <HeroLanding ehDesktop={ehDesktop} onCriarConta={irParaEntrar} onVerPlanos={irParaPlanos} />
      <Revelar><PilaresLanding /></Revelar>
      <Revelar><ComparadorLanding /></Revelar>
      <Revelar><ComoFuncionaLanding /></Revelar>
      <Revelar><MockProdutoLanding ehDesktop={ehDesktop} /></Revelar>
      <Revelar><TeatroOffline /></Revelar>
      <Revelar><PlanosLanding onEscolherGratis={irParaEntrar} onVerPlano={irParaPlanos} /></Revelar>
      <Revelar><ProvaLanding /></Revelar>
      <Revelar><FaqLanding /></Revelar>
      <Revelar><CtaFinalLanding onCriarConta={irParaEntrar} /></Revelar>
      <FooterLanding onAjuda={irParaAjuda} onPrivacidade={irParaPrivacidade} onTermos={irParaTermos} />
    </ScrollView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  scrollConteudo: { flexGrow: 1 },
});
