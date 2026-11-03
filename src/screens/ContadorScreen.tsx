import { View, Text, ScrollView, StyleSheet, Pressable, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Fonts, BorderRadius, useCores, useEstilos, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliCard } from '../components/OlliCard';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import {
  AVISO_CONTADOR,
  CAMINHOS_NFSE,
  INTRO_CONTADOR,
  PASSOS_NFSE,
  RODAPE_CONTADOR,
  SERVICOS_OFICIAIS,
  TIPOS_EMPRESA,
  type FonteOficial,
} from '../content/contador';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Guia de contador (D-1438 G13): tipos de empresa e o caminho da NFS-e.
 * A OLLI não emite a nota — os botões só abrem o site oficial.
 */
export default function ContadorScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  function abrir(href: string) {
    Linking.openURL(href).catch(() => undefined);
  }

  return (
    <View style={styles.tela}>
      <GradientHeader
        title="Contador e nota fiscal"
        subtitle="A OLLI não emite a nota"
        onBack={() => goBackOrHome(nav)}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.aviso} accessibilityRole="text">
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={cores.warning} />
          <Text style={styles.avisoTxt}>{AVISO_CONTADOR}</Text>
        </View>

        <Text style={styles.intro}>{INTRO_CONTADOR}</Text>

        <Text style={styles.secao}>Tipos de empresa</Text>
        {TIPOS_EMPRESA.map((tipo) => (
          <OlliCard key={tipo.id} style={styles.card}>
            <Text style={styles.nome}>{tipo.nome}</Text>
            <Text style={styles.titulo}>{tipo.titulo}</Text>
            <Text style={styles.texto}>{tipo.texto}</Text>
            {tipo.fontes.map((fonte) => (
              <LinkFonte key={fonte.href + fonte.rotulo} fonte={fonte} onPress={() => abrir(fonte.href)} styles={styles} />
            ))}
          </OlliCard>
        ))}

        <Text style={styles.secao}>Quem emite onde</Text>
        {CAMINHOS_NFSE.map((caminho) => (
          <OlliCard key={caminho.id} style={styles.card}>
            <Text style={styles.nome}>{caminho.titulo}</Text>
            <Text style={styles.texto}>{caminho.quando}</Text>
            <LinkFonte fonte={caminho.fonte} onPress={() => abrir(caminho.fonte.href)} styles={styles} />
          </OlliCard>
        ))}

        <Text style={styles.secao}>Como emitir a NFS-e</Text>
        <OlliCard style={styles.card}>
          {PASSOS_NFSE.map((passo, indice) => (
            <View key={passo.id} style={styles.passo}>
              <Text style={styles.passoNum}>{indice + 1}</Text>
              <Text style={styles.texto}>{passo.texto}</Text>
            </View>
          ))}
        </OlliCard>

        <Text style={styles.secao}>Fontes oficiais</Text>
        <OlliCard style={styles.card}>
          {SERVICOS_OFICIAIS.map((fonte) => (
            <LinkFonte key={fonte.href + fonte.rotulo} fonte={fonte} onPress={() => abrir(fonte.href)} styles={styles} />
          ))}
          <Text style={styles.rodape}>{RODAPE_CONTADOR}</Text>
        </OlliCard>
      </ScrollView>
    </View>
  );
}

function LinkFonte({
  fonte,
  onPress,
  styles,
}: {
  fonte: FonteOficial;
  onPress: () => void;
  styles: ReturnType<typeof criarEstilos>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={fonte.rotulo}
      style={({ pressed }) => [styles.link, pressed && styles.linkPress]}
    >
      <MaterialCommunityIcons name="open-in-new" size={14} color={styles.linkTxt.color} />
      <Text style={styles.linkTxt}>{fonte.rotulo}</Text>
    </Pressable>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: c.background },
    scroll: { padding: Spacing.base, gap: Spacing.md, paddingBottom: Spacing.xxxl },
    aviso: {
      flexDirection: 'row',
      gap: Spacing.sm,
      alignItems: 'flex-start',
      backgroundColor: `${c.warning}14`,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
    },
    avisoTxt: { flex: 1, fontSize: 13.5, fontFamily: Fonts.medium, color: c.onSurface, lineHeight: 20 },
    intro: { fontSize: 14, fontFamily: Fonts.regular, color: c.onSurface, lineHeight: 21 },
    secao: { fontSize: 16, fontFamily: Fonts.semiBold, color: c.onSurface, marginTop: Spacing.xs },
    card: { gap: Spacing.sm },
    nome: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.onSurface },
    titulo: { fontSize: 13, fontFamily: Fonts.medium, color: c.onSurfaceVariant },
    texto: { flex: 1, fontSize: 13.5, fontFamily: Fonts.regular, color: c.onSurface, lineHeight: 20 },
    passo: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
    passoNum: {
      width: 22,
      fontSize: 13.5,
      fontFamily: Fonts.semiBold,
      color: c.accentLight,
    },
    link: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: 2 },
    linkPress: { opacity: 0.7 },
    linkTxt: { flex: 1, fontSize: 13, fontFamily: Fonts.semiBold, color: c.accentLight },
    rodape: { fontSize: 12, fontFamily: Fonts.regular, color: c.onSurfaceVariant, lineHeight: 18 },
  });
