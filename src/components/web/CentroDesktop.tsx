import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, BorderRadius } from '../../theme';
import { useEhDesktop } from '../../hooks/useEhDesktop';

/**
 * HOC que embrulha telas "mobile-like" (wizard de orçamento, detalhes, recibo,
 * ferramentas…) para o modo desktop da v4.
 *
 * - No NATIVO e na web < 1024px: PASS-THROUGH PURO (identidade). Renderiza a
 *   tela exatamente como hoje — zero View extra, zero efeito no APK. Este é o
 *   contrato central da regra de ouro (código desktop é aditivo).
 * - Na web ≥ 1024px: centraliza a tela num container de largura máxima 560px
 *   sobre o fundo do app, com uma borda outline sutil (fica "flutuando" sobre o
 *   shell da sidebar em vez de esticar para a tela toda). O fluxo em 4 passos do
 *   orçamento já é vertical e funciona perfeito assim; redesenho fica para v5.
 */
export function comCentroDesktop<P extends object>(
  Tela: React.ComponentType<P>,
): React.ComponentType<P> {
  function CentroDesktop(props: P) {
    const ehDesktop = useEhDesktop();

    // Pass-through idêntico fora do desktop: NADA muda no mobile/APK.
    if (!ehDesktop) {
      return <Tela {...props} />;
    }

    return (
      <View style={styles.fundo}>
        <View style={styles.container}>
          <Tela {...props} />
        </View>
      </View>
    );
  }

  // Preserva o nome no devtools/erros (ex.: "CentroDesktop(NovoOrcamentoScreen)").
  const nome = Tela.displayName || Tela.name || 'Tela';
  CentroDesktop.displayName = `CentroDesktop(${nome})`;

  return CentroDesktop;
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    backgroundColor: Colors.background,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.outline,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
});
