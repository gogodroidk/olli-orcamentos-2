import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { OlliMascot } from './OlliMascot';
import { OlliButton } from './OlliButton';
import { Spacing, Typography, useCores, useEstilos, type Cores } from '../theme';
import { enviarFeedback } from '../services/feedback';
import { navigationRef } from '../navigation/navigationRef';

interface Props {
  children: React.ReactNode;
}

interface State {
  temErro: boolean;
}

/**
 * Fallback temático (3º estado: "deu erro", nunca tela branca). Componente
 * FUNCIONAL à parte — só ele pode usar hooks de tema (useCores/useEstilos); a
 * classe abaixo só administra o estado da captura, que exige componentDidCatch
 * (só existe em class component).
 */
function TelaDeErro({ onTentarDeNovo }: { onTentarDeNovo: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const recarregar = () => {
    // Na web um reload de página limpa qualquer estado de módulo que o boundary
    // sozinho não alcança (ex.: um singleton que quebrou no meio da inicialização).
    // No nativo não existe "reload de página" — o reset do boundary é o recurso.
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
      window.location.reload();
      return;
    }
    onTentarDeNovo();
  };

  return (
    <View style={[styles.container, { backgroundColor: cores.background }]}>
      <OlliMascot size={72} float pulse={false} />
      <Text style={styles.title}>Algo deu errado</Text>
      <Text style={styles.subtitle}>
        Essa tela travou, mas seus dados estão salvos. Toque abaixo para tentar de novo.
      </Text>
      <OlliButton
        label={Platform.OS === 'web' ? 'Recarregar' : 'Tentar de novo'}
        onPress={recarregar}
        style={styles.btn}
      />
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
    title: { ...Typography.h2, color: c.onSurface, marginTop: Spacing.lg, textAlign: 'center' },
    subtitle: {
      ...Typography.body,
      color: c.onSurfaceVariant,
      marginTop: Spacing.sm,
      textAlign: 'center',
      lineHeight: 20,
      maxWidth: 340,
    },
    btn: { marginTop: Spacing.xl, minWidth: 220 },
  });

/**
 * Boundary de TOPO (item 1.12): sem isto, uma exceção de render em qualquer
 * tela derruba a árvore inteira e vira TELA BRANCA — fora dos 3 estados
 * contratados (regra de ouro nº 4: erro/vazio/preenchido, "não sei" nunca vira
 * "não tem"). Envolve só o navegador de telas (ver App.tsx): um boundary
 * único no topo, nunca um por tela.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { temErro: false };

  static getDerivedStateFromError(): State {
    return { temErro: true };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo): void {
    // Log técnico sempre (diagnóstico local/dev).
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] erro de render capturado:', erro, info.componentStack);

    // Mesma caixa de diagnóstico que a captura global de JS já usa (errorReport.ts)
    // — o dono vê no /admin também as quedas de RENDER, não só as de JS solto.
    // Best-effort e defensivo: nunca pode derrubar o próprio fallback.
    try {
      let tela: string | undefined;
      try {
        tela = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
      } catch {
        tela = undefined;
      }
      void enviarFeedback('erro', String(erro?.message ?? erro), {
        tela,
        stack: (erro?.stack || '').split('\n').slice(0, 5).join('\n'),
        origem: 'error-boundary',
      }).catch(() => {});
    } catch {
      // o reporte nunca pode lançar
    }
  }

  resetar = (): void => {
    this.setState({ temErro: false });
  };

  render(): React.ReactNode {
    if (this.state.temErro) {
      return <TelaDeErro onTentarDeNovo={this.resetar} />;
    }
    return this.props.children;
  }
}
