import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Colors, Spacing, BorderRadius, Typography, Gradients, Fonts } from '../../theme';
import { OlliLogo } from '../OlliLogo';
import { getCurrentUser } from '../../services/supabase';
import { usePermissao, type Acao } from '../../hooks/usePermissao';
import { useTipoConta } from '../../hooks/useTipoConta';
import { usePlano } from '../../hooks/usePlano';
import type { Recurso } from '../../services/planos';
import { PressableWebState } from './pressableWebState';

/**
 * Barra lateral fixa do shell desktop — substitui a tab bar inferior quando
 * `ehDesktop` (ver AppNavigator: tabBarPosition:'left' + tabBar={SidebarNav}).
 * Recebe exatamente `BottomTabBarProps` do bottom-tabs v7 — zero estado próprio
 * de navegação, só lê `state`/`descriptors` e chama `navigation.navigate`.
 *
 * Nunca é montada no nativo nem na web < 1024px (ver AppNavigator) — componente
 * 100% novo, não importado por nenhuma tela mobile.
 *
 * ONDA 5 · Frente C — a navegação é CONSCIENTE DE CONTEXTO: papel (usePermissao),
 * tipo de conta (useTipoConta) e plano (usePlano) decidem quais itens aparecem e
 * quais aparecem com cadeado (levando a Planos). Deriva tudo desses hooks, sem
 * inventar rotas: cada item aponta para uma rota que já existe no AppNavigator.
 */

type ItemMenu = {
  /** nome da rota (tab ou, para itens do stack raiz, a rota do stack). */
  rota: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /** `true` quando a rota vive no STACK raiz (um nível acima das tabs). */
  stack?: boolean;
  /**
   * Ação de PERMISSÃO exigida (usePermissao.pode). Ausente = liberado para todos
   * os papéis (ex.: Início, Ferramentas, Conta).
   */
  acao?: Acao;
  /**
   * Só aparece para conta empresa (pertence a uma organização). Ausente = aparece
   * em ambos os tipos de conta.
   */
  soEmpresa?: boolean;
  /**
   * Some para o técnico mesmo que a permissão base deixasse passar. Usado nos
   * itens de "dono do catálogo/financeiro" (Serviços, Produtos, Recibos), que o
   * menu enxuto do técnico não deve mostrar.
   */
  ocultarTecnico?: boolean;
  /**
   * Recurso pago (RECURSOS_POR_PLANO) que este item exige. Se o plano não libera,
   * o item aparece COM CADEADO e o clique leva a Planos (mesmo destino do GatePro),
   * em vez de abrir a rota. Ausente = item livre em qualquer plano.
   */
  recurso?: Recurso;
};

/**
 * Catálogo dos itens principais, em ordem de exibição. A visibilidade real é
 * filtrada em runtime por papel/tipo-de-conta; o cadeado por plano. Toda `rota`
 * existe no AppNavigator (nada inventado).
 */
const ITENS_PRINCIPAIS: ItemMenu[] = [
  { rota: 'Home', label: 'Início', icon: 'home-outline' },
  { rota: 'OrcamentosTab', label: 'Orçamentos', icon: 'file-document-outline', acao: 'criar_orcamento' },
  { rota: 'ClientesTab', label: 'Clientes', icon: 'account-group-outline', acao: 'ver_clientes' },
  // Catálogo (dono do negócio/gestão). Técnico não mantém catálogo → oculto.
  { rota: 'Servicos', label: 'Serviços', icon: 'wrench-outline', stack: true, acao: 'criar_orcamento', ocultarTecnico: true },
  { rota: 'Produtos', label: 'Produtos', icon: 'package-variant-closed', stack: true, acao: 'criar_orcamento', ocultarTecnico: true },
  { rota: 'Agenda', label: 'Agenda', icon: 'calendar-month-outline', acao: 'ver_agenda_propria' },
  // Ordens de serviço (stack raiz). Rótulo role-aware definido em runtime.
  { rota: 'OrdemServico', label: 'Ordens de serviço', icon: 'clipboard-check-outline', stack: true },
  // Recibos (financeiro). Técnico não emite recibos no menu enxuto → oculto.
  { rota: 'EmitirRecibo', label: 'Recibos', icon: 'receipt', stack: true, acao: 'criar_orcamento', ocultarTecnico: true },
  // Relatórios: permissão (ver_relatorios) + recurso pago (relatorios → cadeado).
  { rota: 'RelatoriosTab', label: 'Relatórios', icon: 'chart-line', acao: 'ver_relatorios', recurso: 'relatorios' },
  { rota: 'FerramentasTab', label: 'Ferramentas', icon: 'toolbox-outline' },
  // Equipe: só empresa, quem pode ver a equipe (owner/admin/gestor), recurso 'equipe'.
  { rota: 'Equipe', label: 'Equipe', icon: 'account-multiple-outline', stack: true, acao: 'ver_equipe', soEmpresa: true, recurso: 'equipe' },
];

const ITEM_CONTA: ItemMenu = { rota: 'Conta', label: 'Conta', icon: 'account-circle-outline' };

export function SidebarNav({ state, navigation }: BottomTabBarProps) {
  const [email, setEmail] = useState<string | null>(null);
  const { papel, pode, ehEmpresa } = usePermissao();
  const { tipo } = useTipoConta();
  const { temAcesso } = usePlano();
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
  // gestão/pessoal vê "Ordens de serviço" (todas). Só o rótulo muda — a rota é a
  // mesma, e a própria tela decide o que listar pelo papel.
  const rotuloOrdens = papel === 'tecnico' ? 'Minhas OS' : 'Ordens de serviço';

  // Itens visíveis, derivados de papel + tipo de conta. O gate de PLANO (cadeado)
  // é outra dimensão: o item continua visível, mas trancado — ver `trancado`.
  const itensVisiveis = useMemo(() => {
    return ITENS_PRINCIPAIS.filter((item) => {
      // Itens de empresa não aparecem em conta pessoal.
      if (item.soEmpresa && tipo !== 'empresa') return false;
      // Itens marcados como "não-técnico" somem no menu enxuto do técnico.
      if (item.ocultarTecnico && papel === 'tecnico') return false;
      // Gate de permissão: se o item exige uma ação e o papel não a tem, some.
      if (item.acao && !pode(item.acao)) return false;
      return true;
    });
  }, [tipo, papel, pode]);

  function irPara(item: ItemMenu, trancado: boolean) {
    // Item pago sem acesso: em vez de abrir a rota, leva a Planos (mesmo destino
    // do GatePro). O cadeado no item já sinaliza que é premium.
    if (trancado) {
      const pai = navigation.getParent?.() ?? navigation;
      (pai as any).navigate('Planos');
      return;
    }
    if (item.stack) {
      // Rotas do stack raiz (ex.: OrdemServico, Servicos, Equipe) ficam um nível
      // acima das tabs.
      const pai = navigation.getParent?.() ?? navigation;
      (pai as any).navigate(item.rota);
      return;
    }
    // rotas presentes no state (tabs) navegam direto; a navegação de tabs já lida
    // com foco/params existentes.
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
        {itensVisiveis.map((item) => {
          const trancado = item.recurso ? !temAcesso(item.recurso) : false;
          const label = item.rota === 'OrdemServico' ? rotuloOrdens : item.label;
          return (
            <ItemSidebar
              key={item.rota}
              item={{ ...item, label }}
              ativo={rotaAtiva === item.rota && !trancado}
              trancado={trancado}
              onPress={() => irPara(item, trancado)}
            />
          );
        })}
      </ScrollView>

      <View style={styles.rodape}>
        <ItemSidebar
          item={ITEM_CONTA}
          ativo={rotaAtiva === ITEM_CONTA.rota}
          trancado={false}
          onPress={() => irPara(ITEM_CONTA, false)}
        />
        {email && (
          <Text style={styles.email} numberOfLines={1}>
            {email}
          </Text>
        )}
        {!ehEmpresa && email && (
          <Text style={styles.tipoConta} numberOfLines={1}>
            Conta pessoal
          </Text>
        )}
      </View>
    </View>
  );
}

function ItemSidebar({
  item,
  ativo,
  trancado,
  onPress,
}: {
  item: ItemMenu;
  ativo: boolean;
  trancado: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={trancado ? `${item.label} (premium)` : item.label}
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
      <Text style={[styles.itemLabel, ativo && styles.itemLabelAtivo, trancado && styles.itemLabelTrancado]}>
        {item.label}
      </Text>
      {trancado && (
        <MaterialCommunityIcons
          name="lock-outline"
          size={15}
          color={Colors.plan}
          style={styles.cadeado}
        />
      )}
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
    flex: 1,
  },
  itemLabelAtivo: {
    color: Colors.tabActive,
    fontFamily: Fonts.bold,
  },
  itemLabelTrancado: {
    color: Colors.onSurfaceMuted,
  },
  cadeado: {
    marginLeft: Spacing.xs,
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
  tipoConta: {
    ...Typography.caption,
    color: Colors.onSurfaceMuted,
    paddingHorizontal: Spacing.md,
  },
});
