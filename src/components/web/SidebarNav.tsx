import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Colors, Spacing, BorderRadius, Typography, Gradients, Fonts } from '../../theme';
import { OlliLogo } from '../OlliLogo';
import { getCurrentUser } from '../../services/supabase';
import { PressableWebState } from './pressableWebState';

/**
 * Barra lateral fixa do shell desktop (v4) — substitui a tab bar inferior
 * quando `ehDesktop` (ver AppNavigator: tabBarPosition:'left' + tabBar={SidebarNav}).
 * Recebe exatamente `BottomTabBarProps` do bottom-tabs v7 — zero estado próprio
 * de navegação, só lê `state`/`descriptors` e chama `navigation.navigate`.
 *
 * Nunca é montada no nativo nem na web < 1024px (ver AppNavigator) — componente
 * 100% novo, não importado por nenhuma tela mobile.
 */

type ItemMenu = {
  /** nome da rota (tab ou, para "Conta", também é uma tab). */
  rota: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const ITENS_PRINCIPAIS: ItemMenu[] = [
  { rota: 'Home', label: 'Início', icon: 'home-outline' },
  { rota: 'OrcamentosTab', label: 'Orçamentos', icon: 'file-document-outline' },
  { rota: 'ClientesTab', label: 'Clientes', icon: 'account-group-outline' },
  { rota: 'Agenda', label: 'Agenda', icon: 'calendar-month-outline' },
  { rota: 'RelatoriosTab', label: 'Relatórios', icon: 'chart-line' },
  { rota: 'FerramentasTab', label: 'Ferramentas', icon: 'toolbox-outline' },
];

const ITEM_CONTA: ItemMenu = { rota: 'Conta', label: 'Conta', icon: 'account-circle-outline' };

export function SidebarNav({ state, navigation }: BottomTabBarProps) {
  const [email, setEmail] = useState<string | null>(null);
  const rotaAtiva = state.routes[state.index]?.name;

  useEffect(() => {
    let ativo = true;
    getCurrentUser()
      .then((user) => {
        if (ativo) setEmail(user?.email ?? null);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  function irPara(rota: string) {
    // rotas presentes no state (tabs) navegam direto; a navegação de tabs
    // já lida com foco/params existentes.
    (navigation as any).navigate(rota);
  }

  function novoOrcamento() {
    // NovoOrcamento vive no stack raiz, um nível acima do TabNavigator.
    const pai = navigation.getParent?.() ?? navigation;
    (pai as any).navigate('NovoOrcamento', {});
  }

  return (
    <View style={styles.container}>
      <View style={styles.topo}>
        <View style={styles.marca}>
          <OlliLogo size={36} tile />
          <Text style={styles.wordmark}>OLLI</Text>
        </View>

        <Pressable
          onPress={novoOrcamento}
          accessibilityRole="button"
          accessibilityLabel="Novo orçamento"
          style={({ hovered, pressed }: PressableWebState) => [
            styles.botaoNovoWrap,
            hovered && styles.botaoNovoWrapHover,
            pressed && styles.botaoNovoWrapPressed,
          ]}
        >
          <LinearGradient
            colors={Gradients.primaryDiagonal}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.botaoNovo}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#fff" />
            <Text style={styles.botaoNovoLabel}>Novo orçamento</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <ScrollView style={styles.menu} contentContainerStyle={styles.menuConteudo} showsVerticalScrollIndicator={false}>
        {ITENS_PRINCIPAIS.map((item) => (
          <ItemSidebar
            key={item.rota}
            item={item}
            ativo={rotaAtiva === item.rota}
            onPress={() => irPara(item.rota)}
          />
        ))}
      </ScrollView>

      <View style={styles.rodape}>
        <ItemSidebar
          item={ITEM_CONTA}
          ativo={rotaAtiva === ITEM_CONTA.rota}
          onPress={() => irPara(ITEM_CONTA.rota)}
        />
        {email && (
          <Text style={styles.email} numberOfLines={1}>
            {email}
          </Text>
        )}
      </View>
    </View>
  );
}

function ItemSidebar({ item, ativo, onPress }: { item: ItemMenu; ativo: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      style={({ hovered, pressed }: PressableWebState) => [
        styles.item,
        ativo && styles.itemAtivo,
        !ativo && hovered && styles.itemHover,
        pressed && styles.itemPressed,
      ]}
    >
      <MaterialCommunityIcons
        name={item.icon}
        size={20}
        color={ativo ? Colors.tabActive : Colors.tabInactive}
      />
      <Text style={[styles.itemLabel, ativo && styles.itemLabelAtivo]}>{item.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 248,
    height: '100%',
    backgroundColor: Colors.surfaceVariant,
    borderRightWidth: 1,
    borderRightColor: Colors.outline,
    flexDirection: 'column',
  },
  topo: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  marca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  wordmark: {
    ...Typography.h3,
    color: Colors.onSurface,
    letterSpacing: 1,
  },
  botaoNovoWrap: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  botaoNovoWrapHover: {
    opacity: 0.92,
  },
  botaoNovoWrapPressed: {
    opacity: 0.8,
  },
  botaoNovo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: 11,
    paddingHorizontal: Spacing.md,
  },
  botaoNovoLabel: {
    ...Typography.button,
    color: '#fff',
    fontSize: 13,
  },
  menu: {
    flex: 1,
  },
  menuConteudo: {
    paddingHorizontal: Spacing.md,
    gap: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md - 3,
    borderRadius: BorderRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  itemHover: {
    backgroundColor: Colors.surfacePressed,
  },
  itemPressed: {
    opacity: 0.85,
  },
  itemAtivo: {
    backgroundColor: Colors.accentContainer,
    borderLeftColor: Colors.accent,
  },
  itemLabel: {
    ...Typography.body,
    color: Colors.tabInactive,
    fontSize: 14,
  },
  itemLabelAtivo: {
    color: Colors.tabActive,
    fontFamily: Fonts.bold,
  },
  rodape: {
    borderTopWidth: 1,
    borderTopColor: Colors.outline,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  email: {
    ...Typography.caption,
    color: Colors.onSurfaceMuted,
    paddingHorizontal: Spacing.md,
  },
});
