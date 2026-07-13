import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useEstilos, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { PressableWebState } from '../../components/web/pressableWebState';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useVerticais } from '../../hooks/useVerticais';
import type { VerticalId } from '../../services/verticais';
import { haCalculoParaOficio } from '../../services/calculosOficio';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Ferramenta {
  key: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  desc: string;
  color: string;
  route: keyof RootStackParamList;
  /** Ferramenta de HVAC (diagnósticos de ar-condicionado). Some para outros ofícios. */
  verticalHvac?: boolean;
  /** Ferramenta única de um ofício (ex.: calculadora de tinta → 'pintura'). */
  vertical?: VerticalId;
  /** Hub de calculadoras do ofício — some para ramos sem calculadora. */
  calcHub?: boolean;
}

/**
 * Grid de atalhos para as telas "mobile-like" já embrulhadas em
 * `comCentroDesktop` pela F1 — abrem centradas sobre o shell da sidebar.
 * Mesmo catálogo de ferramentas da ContaScreen (mobile), com o acréscimo de
 * Diagnóstico IA e Planos, que também vivem no stack raiz.
 *
 * As cores dependem da paleta atual (dark/light/marca) — por isso viram uma
 * fábrica como `criarEstilos`, e não uma constante de módulo (que congelaria
 * no import).
 */
function criarFerramentas(c: Cores): Ferramenta[] {
  return [
    { key: 'olliVoz', icon: 'microphone', label: 'OLLI por voz', desc: 'Monte orçamentos falando', color: c.accentLight, route: 'OlliVoz' },
    { key: 'olliChat', icon: 'chat-processing-outline', label: 'Chat com a OLLI', desc: 'Sua assistente técnica', color: c.primaryLight, route: 'OlliChat' },
    { key: 'diagnosticoIA', icon: 'robot-outline', label: 'Diagnóstico IA', desc: 'Descreva o defeito, a OLLI ajuda', color: c.accentLight, route: 'DiagnosticoIA', verticalHvac: true },
    { key: 'erro', icon: 'card-search-outline', label: 'Códigos de erro', desc: 'Diagnóstico · OLLI Técnica', color: c.accentLight, route: 'Diagnostico', verticalHvac: true },
    { key: 'tinta', icon: 'format-paint', label: 'Calculadora de tinta', desc: 'Litros e latas pela área', color: c.warning, route: 'CalculadoraTinta', vertical: 'pintura' },
    { key: 'anvisa', icon: 'file-certificate-outline', label: 'Certificado ANVISA', desc: 'Comprovante RDC 52 de dedetização', color: c.success, route: 'CertificadoAnvisa', vertical: 'dedetizacao' },
    { key: 'calcOficio', icon: 'calculator-variant-outline', label: 'Calculadoras do ofício', desc: 'Cálculos técnicos do seu ramo', color: c.accentLight, route: 'FerramentasOficio', calcHub: true },
    { key: 'servicos', icon: 'wrench-outline', label: 'Catálogo de serviços', desc: 'Serviços e preços', color: c.primary, route: 'Servicos' },
    { key: 'produtos', icon: 'package-variant-closed', label: 'Produtos e peças', desc: 'Materiais e estoque', color: c.primary, route: 'Produtos' },
    { key: 'recibo', icon: 'receipt', label: 'Recibos', desc: 'Emita recibos de pagamento', color: c.success, route: 'EmitirRecibo' },
    // '#F7B23B' era o warning fixo do handoff escuro — agora acompanha o warning
    // (ajustado por contraste) do modo atual.
    { key: 'negocio', icon: 'storefront-outline', label: 'Personalizar', desc: 'Seu negócio, logo e marca', color: c.warning, route: 'MeuNegocio' },
    { key: 'planos', icon: 'crown-outline', label: 'Planos', desc: 'Assine o OLLI PRO', color: c.plan, route: 'Planos' },
  ];
}

export default function FerramentasDesktopScreen() {
  const nav = useNavigation<Nav>();
  const styles = useEstilos(criarEstilos);
  const { mostraHvac, mostraVertical } = useVerticais();
  const ferramentas = useEstilos(criarFerramentas).filter(
    (f) =>
      !(f.verticalHvac && !mostraHvac) &&
      !(f.vertical && !mostraVertical(f.vertical)) &&
      !(f.calcHub && !haCalculoParaOficio(mostraVertical)),
  );

  return (
    <LayoutDesktop titulo="Ferramentas" subtitulo="Tudo que você precisa para atender seus clientes.">
      <View style={styles.grid}>
        {ferramentas.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => (nav.navigate as (rota: keyof RootStackParamList, params?: unknown) => void)(f.route, undefined)}
            style={({ hovered, focused }: PressableWebState) => [styles.card, hovered && styles.cardHover, focused && styles.cardFocado]}
            accessibilityRole="button"
            accessibilityLabel={f.label}
          >
            <View style={[styles.iconeWrap, { backgroundColor: f.color + '20' }]}>
              {/* f.color já é sempre um token de primeiro plano com contraste
                  provado sobre superfície clara (accentLight/primaryLight/
                  primary/success/warning/plan — nunca o accent puro, que
                  reprova o limiar de ícone a 2.05:1). */}
              <MaterialCommunityIcons name={f.icon} size={24} color={f.color} />
            </View>
            <Text style={styles.label}>{f.label}</Text>
            <Text style={styles.desc}>{f.desc}</Text>
          </Pressable>
        ))}
      </View>
    </LayoutDesktop>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  card: {
    width: 240,
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardHover: {
    backgroundColor: c.surfacePressed,
    borderColor: c.strokeGlow,
  },
  cardFocado: {
    outlineWidth: 2,
    outlineColor: c.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,
  iconeWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  label: {
    ...Typography.h4,
    color: c.onSurface,
  },
  desc: {
    ...Typography.bodySmall,
    color: c.onSurfaceVariant,
  },
});
