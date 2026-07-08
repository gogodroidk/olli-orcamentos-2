import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Colors, Spacing, BorderRadius, Typography, Gradients, Fonts } from '../../theme';
import { OlliLogo } from '../OlliLogo';
import { getCurrentUser } from '../../services/supabase';
import { usePermissao } from '../../hooks/usePermissao';
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
  /** `true` quando a rota vive no STACK raiz (um nível acima das tabs). */
  stack?: boolean;
};

const ITENS_PRINCIPAIS: ItemMenu[] = [
  { rota: 'Home', label: 'Início', icon: 'home-outline' },
  { rota: 'OrcamentosTab', label: 'Orçamentos', icon: 'file-document-outline' },
  { rota: 'ClientesTab', label: 'Clientes', icon: 'account-group-outline' },
  { rota: 'Agenda', label: 'Agenda', icon: 'calendar-month-outline' },
  // Onda 4 — Ordens de serviço. Vive no stack raiz (não é tab); o rótulo é
  // definido em runtime (role-aware) no corpo do componente.
  { rota: 'OrdemServico', label: 'Ordens de serviço', icon: 'clipboard-check-outline', stack: true },
  { rota: 'RelatoriosTab', label: 'Relatórios', icon: 'chart-line' },
  { rota: 'FerramentasTab', label: 'Ferramentas', icon: 'toolbox-outline' },
];

const ITEM_CONTA: ItemMenu = { rota: 'Conta', label: 'Conta', icon: 'account-circle-outline' };

export function SidebarNav({ state, navigation }: BottomTabBarProps) {
  const [email, setEmail] = useState<string | null>(null);
  const { papel } = usePermissao();
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

  // Rótulo role-aware das Ordens: o técnico vê "Minhas OS" (só as dele);
  // gestão/pessoal vê "Ordens de serviço" (todas). Só o rótulo muda — a rota
  // é a mesma, e a própria tela decide o que listar pelo papel.
  const rotuloOrdens = papel === 'tecnico' ? 'Minhas OS' : 'Ordens de serviço';

  function irPara(item: ItemMenu) {
    if (item.stack) {
      // Rotas do stack raiz (ex.: OrdemServico) ficam um nível acima das tabs.
      const pai = navigation.getParent?.() ?? navigation;
      (pai as any).navigate(item.rota);
      return;
    }
    // rotas presentes no state (tabs) navegam direto; a navegação de tabs
    // já lida com foco/params existentes.
    (navigation as any).navigate(item.rota);
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
          style={({ hovered, focused, pressed }: PressableWebState) => [
            styles.botaoNovoWrap,
            hovered && styles.botaoNovoWrapHover,
            focused && styles.botaoNovoWrapFocado,
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
            item={item.rota === 'OrdemServico' ? { ...item, label: rotuloOrdens } : item}
            ativo={rotaAtiva === item.rota}
            onPress={() => irPara(item)}
          />
        ))}
      </ScrollView>

      <View style={styles.rodape}>
        <ItemSidebar
          item={ITEM_CONTA}
          ativo={rotaAtiva === ITEM_CONTA.rota}
          onPress={() => irPara(ITEM_CONTA)}
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
      style={({ hovered, focused, pressed }: PressableWebState) => [
        styles.item,
        ativo && styles.itemAtivo,
        !ativo && hovered && styles.itemHover,
        focused && styles.itemFocado,
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
  botaoNovoWrapFocado: {
    outlineWidth: 2,
    outlineColor: Colors.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,
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
  itemFocado: {
    outlineWidth: 2,
    outlineColor: Colors.accent,
    outlineStyle: 'solid',
    outlineOffset: -2,
  } as any,
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
