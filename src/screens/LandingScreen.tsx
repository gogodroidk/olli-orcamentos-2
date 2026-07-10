import React, { useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../theme';
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
} from '../components/web/LandingSecoes';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollConteudo}>
        <TopoLanding onEntrar={irParaEntrar} onCriarConta={irParaEntrar} />
        <HeroLanding ehDesktop={ehDesktop} onCriarConta={irParaEntrar} onVerPlanos={irParaPlanos} />
        <PilaresLanding />
        <ComoFuncionaLanding />
        <MockProdutoLanding ehDesktop={ehDesktop} />
        <PlanosLanding onEscolherGratis={irParaEntrar} onVerPlano={irParaPlanos} />
        <ProvaLanding />
        <FaqLanding />
        <CtaFinalLanding onCriarConta={irParaEntrar} />
        <FooterLanding onAjuda={irParaAjuda} onPrivacidade={irParaPrivacidade} onTermos={irParaTermos} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollConteudo: { flexGrow: 1 },
});
