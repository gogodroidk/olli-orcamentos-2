import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AuroraBackground } from '../AuroraBackground';
import { Spacing, BorderRadius, useCores, useGradientes, sobreSecundario } from '../../theme';
import { Fonts } from '../../theme/fonts';
import { OlliMascot } from '../OlliMascot';

/**
 * Proposta de valor da coluna esquerda da tela "Entrar" no DESKTOP (web ≥ 1024px).
 * 100% apresentacional — nenhum estado, nenhuma navegação, nenhuma chamada de
 * login. A lógica de auth continua toda na EntrarScreen; aqui só vive a "capa de
 * produto" que o visitante deslogado vê à esquerda do card de login.
 *
 * Reutiliza o gradiente, as cores e a tipografia da marca (Gradients/Colors/Fonts)
 * e o próprio símbolo OLLI (OlliMascot). Sem API exótica (lição Hermes): só é
 * montado no ramo web da EntrarScreen, mas não usa nada proibido no nativo.
 */

interface Beneficio {
  icone: keyof typeof MaterialCommunityIcons.glyphMap;
  titulo: string;
  descricao: string;
}

/** Os três pilares de valor do produto — orçamento, campo, gestão. */
const BENEFICIOS: readonly Beneficio[] = [
  {
    icone: 'file-check-outline',
    titulo: 'Orçamento que aprova online',
    descricao: 'O cliente abre pelo link, aprova com um toque e você já emite o recibo.',
  },
  {
    icone: 'clipboard-check-outline',
    titulo: 'Ordem de serviço no campo',
    descricao: 'Cada visita vira uma OS com fotos, assinatura e histórico — sem papel.',
  },
  {
    icone: 'chart-box-outline',
    titulo: 'Equipe e financeiro num lugar',
    descricao: 'Agenda, técnicos e o que entra e sai da empresa, tudo no mesmo painel.',
  },
] as const;

/** Provas curtas de credibilidade — nada de número inventado, só o que o produto faz. */
const PROVAS: readonly string[] = [
  'Do orçamento ao recibo sem sair do sistema',
  'Funciona no celular do técnico e no computador do escritório',
  'Seus dados ficam salvos e sincronizados na nuvem',
] as const;

export function LandingHero() {
  const cores = useCores();
  const gradientes = useGradientes();

  return (
    <LinearGradient
      colors={gradientes.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fundo}
    >
      {/* Fundo AURORA: orbes da marca derivando devagar atras do conteudo. Substitui
          os dois glows estaticos — mesmo lugar, agora com vida. Intensidade baixa
          para nao roubar contraste do texto (que ja e 4.5:1 sobre gradientes.primary). */}
      <AuroraBackground
        cores={[cores.accent, cores.accentLight, cores.primaryLight, cores.accent]}
        intensidade={0.14}
      />

      <View style={styles.conteudo}>
        <View style={styles.marca}>
          <OlliMascot size={56} onDark />
          <Text style={[styles.marcaTexto, { color: gradientes.sobrePrimary }]}>OLLI</Text>
        </View>

        <Text style={[styles.headline, { color: gradientes.sobrePrimary }]}>
          Do orçamento ao recibo, sem planilha
        </Text>
        <Text
          style={[
            styles.subheadline,
            { color: sobreSecundario(gradientes.sobrePrimary, gradientes.primary) },
          ]}
        >
          A plataforma de campo para quem presta serviço: orçamento, ordem de
          serviço, equipe e financeiro no mesmo lugar.
        </Text>

        <View style={styles.beneficios}>
          {BENEFICIOS.map((b) => (
            <View key={b.titulo} style={styles.beneficio}>
              <View style={styles.beneficioIcone}>
                <MaterialCommunityIcons name={b.icone} size={22} color={gradientes.sobrePrimary} />
              </View>
              <View style={styles.beneficioTextos}>
                <Text style={[styles.beneficioTitulo, { color: gradientes.sobrePrimary }]}>
                  {b.titulo}
                </Text>
                <Text
                  style={[
                    styles.beneficioDescricao,
                    { color: sobreSecundario(gradientes.sobrePrimary, gradientes.primary) },
                  ]}
                >
                  {b.descricao}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.provas}>
          {PROVAS.map((p) => (
            <View key={p} style={styles.prova}>
              <MaterialCommunityIcons name="check-circle" size={16} color={cores.success} />
              <Text
                style={[
                  styles.provaTexto,
                  { color: sobreSecundario(gradientes.sobrePrimary, gradientes.primary) },
                ]}
              >
                {p}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

// Estilos abaixo NÃO usam `Colors`: os glows em rgba vivem sobre `gradientes.primary`,
// que é fixo (marca → marca escura) e igual nos dois modos — como o próprio `header`
// do tema (ver theme/index.ts), é um banner, não uma superfície. Por isso ficam
// module-scope, sem `useEstilos`: nada aqui congela por modo porque nada aqui depende
// do modo. Toda cor de TEXTO (principal e secundária) saiu daqui e é aplicada inline
// no ponto de uso — principal com `gradientes.sobrePrimary`, secundária com
// `sobreSecundario(gradientes.sobrePrimary, gradientes.primary)` — pois ambas dependem
// da marca customizável do usuário, e um alfa fixo não é seguro nas duas pontas do
// gradiente (ver assinatura de `sobreSecundario` em theme/cores.ts).
const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.xxl,
  },
  glow1: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(127,233,245,0.16)',
  },
  glow2: {
    position: 'absolute',
    bottom: -90,
    left: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(52,198,217,0.12)',
  },
  conteudo: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  marca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  marcaTexto: {
    fontSize: 30,
    fontFamily: Fonts.extraBold,
    letterSpacing: 1,
  },
  headline: {
    fontSize: 40,
    lineHeight: 48,
    fontFamily: Fonts.extraBold,
    letterSpacing: -0.5,
  },
  // Cor aplicada inline no ponto de uso (sobreSecundario sobre gradientes.primary) —
  // StyleSheet de escopo de módulo não enxerga o tema. Era 'rgba(226,232,240,0.82)',
  // que media 3.23:1 na ponta clara do gradiente padrão (reprova 4.5:1).
  subheadline: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Fonts.medium,
    marginTop: Spacing.base,
    marginBottom: Spacing.xxl,
  },
  beneficios: {
    gap: Spacing.lg,
  },
  beneficio: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.base,
  },
  beneficioIcone: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(52,198,217,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(127,233,245,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beneficioTextos: {
    flex: 1,
    gap: 2,
  },
  beneficioTitulo: {
    fontSize: 16,
    fontFamily: Fonts.bold,
  },
  // Cor aplicada inline no ponto de uso (sobreSecundario sobre gradientes.primary) —
  // era 'rgba(226,232,240,0.68)', que media 2.68:1 na ponta clara (reprova 4.5:1).
  beneficioDescricao: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.regular,
  },
  provas: {
    marginTop: Spacing.xxl,
    gap: Spacing.sm,
  },
  prova: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  // Cor aplicada inline no ponto de uso (sobreSecundario sobre gradientes.primary) —
  // era 'rgba(226,232,240,0.78)', que media 3.07:1 na ponta clara (reprova 4.5:1).
  provaTexto: {
    fontSize: 13.5,
    fontFamily: Fonts.semiBold,
  },
});
