import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { PressableWebState } from '../../components/web/pressableWebState';
import { RootStackParamList } from '../../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Grid de atalhos para as telas "mobile-like" já embrulhadas em
 * `comCentroDesktop` pela F1 — abrem centradas sobre o shell da sidebar.
 * Mesmo catálogo de ferramentas da ContaScreen (mobile), com o acréscimo de
 * Diagnóstico IA e Planos, que também vivem no stack raiz.
 */
const FERRAMENTAS: {
  key: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  desc: string;
  color: string;
  route: keyof RootStackParamList;
}[] = [
  { key: 'olliVoz', icon: 'microphone', label: 'OLLI por voz', desc: 'Monte orçamentos falando', color: Colors.accent, route: 'OlliVoz' },
  { key: 'olliChat', icon: 'chat-processing-outline', label: 'Chat com a OLLI', desc: 'Sua assistente técnica', color: Colors.primaryLight, route: 'OlliChat' },
  { key: 'diagnosticoIA', icon: 'robot-outline', label: 'Diagnóstico IA', desc: 'Descreva o defeito, a OLLI ajuda', color: Colors.accentLight, route: 'DiagnosticoIA' },
  { key: 'erro', icon: 'card-search-outline', label: 'Códigos de erro', desc: 'Diagnóstico · OLLI Técnica', color: Colors.accent, route: 'Diagnostico' },
  { key: 'servicos', icon: 'wrench-outline', label: 'Catálogo de serviços', desc: 'Serviços e preços', color: Colors.primary, route: 'Servicos' },
  { key: 'produtos', icon: 'package-variant-closed', label: 'Produtos e peças', desc: 'Materiais e estoque', color: Colors.primary, route: 'Produtos' },
  { key: 'recibo', icon: 'receipt', label: 'Recibos', desc: 'Emita recibos de pagamento', color: Colors.success, route: 'EmitirRecibo' },
  { key: 'negocio', icon: 'storefront-outline', label: 'Personalizar', desc: 'Seu negócio, logo e marca', color: '#F7B23B', route: 'MeuNegocio' },
  { key: 'planos', icon: 'crown-outline', label: 'Planos', desc: 'Assine o OLLI PRO', color: Colors.plan, route: 'Planos' },
];

export default function FerramentasDesktopScreen() {
  const nav = useNavigation<Nav>();

  return (
    <LayoutDesktop titulo="Ferramentas" subtitulo="Tudo que você precisa para atender seus clientes.">
      <View style={styles.grid}>
        {FERRAMENTAS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => (nav.navigate as (rota: keyof RootStackParamList, params?: unknown) => void)(f.route, undefined)}
            style={({ hovered }: PressableWebState) => [styles.card, hovered && styles.cardHover]}
            accessibilityRole="button"
            accessibilityLabel={f.label}
          >
            <View style={[styles.iconeWrap, { backgroundColor: f.color + '20' }]}>
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

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  card: {
    width: 240,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardHover: {
    backgroundColor: Colors.surfacePressed,
    borderColor: Colors.strokeGlow,
  },
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
    color: Colors.onSurface,
  },
  desc: {
    ...Typography.bodySmall,
    color: Colors.onSurfaceVariant,
  },
});
