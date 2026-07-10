import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Spacing, useEstilos, type Cores } from '../../theme';
import { useEhDesktop } from '../../hooks/useEhDesktop';

/**
 * HOC que dá a uma tela "mobile-like" (wizard de orçamento, equipamentos,
 * detalhes, recibo…) um **corpo de página web** quando ela roda no desktop.
 *
 * - No NATIVO e na web < 1024px: PASS-THROUGH PURO (identidade). Renderiza a tela
 *   exatamente como hoje — zero View extra, zero efeito no APK. Este é o contrato
 *   central da regra de ouro (código desktop é aditivo).
 * - Na web ≥ 1024px: a tela recebe uma página — largura de leitura confortável,
 *   respiro nas laterais, fundo do app correndo até a borda da janela.
 *
 * A versão anterior travava a tela em 560px COM bordas laterais desenhadas: essa é
 * a largura e a moldura de um telefone. Abrir Equipamentos no navegador mostrava
 * um celular. Uma página web também limita a medida do texto — nenhum site sério
 * estica um formulário até 2000px — mas limita em ~1100px e não desenha o aparelho
 * em volta. Quem separa a tela do shell da sidebar é o espaço, não um traço.
 */
export function comCentroDesktop<P extends object>(
  Tela: React.ComponentType<P>,
): React.ComponentType<P> {
  function PaginaDesktop(props: P) {
    const ehDesktop = useEhDesktop();
    const styles = useEstilos(criarEstilos);

    // Pass-through idêntico fora do desktop: NADA muda no mobile/APK.
    if (!ehDesktop) {
      return <Tela {...props} />;
    }

    return (
      <View style={styles.fundo}>
        <View style={styles.pagina}>
          <Tela {...props} />
        </View>
      </View>
    );
  }

  // Preserva o nome no devtools/erros (ex.: "PaginaDesktop(EquipamentoScreen)").
  const nome = Tela.displayName || Tela.name || 'Tela';
  PaginaDesktop.displayName = `PaginaDesktop(${nome})`;

  return PaginaDesktop;
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: c.background,
    alignItems: 'center',
  },
  pagina: {
    flex: 1,
    width: '100%',
    // 1100px é medida de página, não de aparelho: cabe uma tabela larga ou duas
    // colunas, e o texto corrido ainda não passa do limite de leitura.
    maxWidth: 1100,
    paddingHorizontal: Spacing.lg,
    backgroundColor: c.background,
  },
});
