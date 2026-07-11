import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../../theme';
import { Fonts } from '../../theme/fonts';
import { useReducedMotion } from '../../theme/motion';
import { Tilt3D } from './Tilt3D';

/**
 * ComparadorLanding — seção da landing que mata a comparação que o visitante
 * faria sozinho com um ERP de escritório. Self-contained: só soltar
 * `<ComparadorLanding />` numa página; nenhuma prop obrigatória.
 */

// ─── Dados da tabela ──────────────────────────────────────────────────────────
type VarianteIcone = 'sim' | 'nao' | 'parcial';

interface CelulaIcone {
  readonly tipo: 'icone';
  readonly variante: VarianteIcone;
  readonly legenda?: string;
}

interface CelulaValor {
  readonly tipo: 'valor';
  readonly texto: string;
  readonly serif?: boolean;
  readonly destaque?: boolean;
}

type Celula = CelulaIcone | CelulaValor;

interface LinhaComparativo {
  readonly rotulo: string;
  readonly olli: Celula;
  readonly erp: Celula;
}

const LINHAS: readonly LinhaComparativo[] = [
  {
    rotulo: 'Funciona sem sinal',
    olli: { tipo: 'icone', variante: 'sim' },
    erp: { tipo: 'icone', variante: 'nao', legenda: 'trava sem internet' },
  },
  {
    rotulo: 'PMOC pronto pra fiscalização',
    olli: { tipo: 'icone', variante: 'sim' },
    erp: { tipo: 'icone', variante: 'nao' },
  },
  {
    rotulo: 'IA que diagnostica o defeito',
    olli: { tipo: 'icone', variante: 'sim' },
    erp: { tipo: 'icone', variante: 'nao', legenda: 'só nota fiscal' },
  },
  {
    rotulo: 'Equipe no mapa em tempo real',
    olli: { tipo: 'icone', variante: 'sim' },
    erp: { tipo: 'icone', variante: 'parcial', legenda: 'às vezes' },
  },
  {
    rotulo: 'Preço pra começar',
    olli: { tipo: 'valor', texto: 'R$ 0', serif: true },
    erp: { tipo: 'valor', texto: 'R$ 119–379/mês', serif: true, destaque: true },
  },
  {
    rotulo: 'Tempo até o 1º orçamento',
    olli: { tipo: 'valor', texto: 'minutos' },
    erp: { tipo: 'valor', texto: 'treinamento' },
  },
];

const ICONES_VARIANTE: Record<VarianteIcone, keyof typeof MaterialCommunityIcons.glyphMap> = {
  sim: 'check-circle',
  nao: 'close-circle',
  parcial: 'minus-circle',
};

function resumoCelula(celula: Celula): string {
  if (celula.tipo === 'valor') return celula.texto;
  if (celula.variante === 'sim') return 'sim';
  if (celula.variante === 'parcial') return `às vezes${celula.legenda ? ` (${celula.legenda})` : ''}`;
  return `não${celula.legenda ? ` (${celula.legenda})` : ''}`;
}

export function ComparadorLanding() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReducedMotion();
  const [linhaAtiva, setLinhaAtiva] = useState<number | null>(null);

  function corIcone(variante: VarianteIcone): string {
    return variante === 'sim' ? cores.success : cores.onSurfaceMuted;
  }

  function renderCelula(celula: Celula, colunaOlli: boolean) {
    if (celula.tipo === 'icone') {
      return (
        <View style={styles.celulaConteudo}>
          <MaterialCommunityIcons name={ICONES_VARIANTE[celula.variante]} size={22} color={corIcone(celula.variante)} />
          {celula.legenda ? <Text style={styles.celulaLegenda}>{celula.legenda}</Text> : null}
        </View>
      );
    }
    return (
      <View style={styles.celulaConteudo}>
        <Text
          style={[
            celula.serif ? styles.celulaValorSerif : styles.celulaValorTexto,
            colunaOlli && !celula.destaque ? styles.celulaValorOlli : null,
            celula.destaque ? styles.celulaValorDestaque : null,
          ]}
        >
          {celula.texto}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.secao}>
      <View style={styles.interno}>
        <View style={styles.cabecalho}>
          <Text style={styles.kicker}>OLLI × ERP DE ESCRITÓRIO</Text>
          <Text style={styles.titulo}>ERP gerencia sua empresa. O OLLI trabalha com você.</Text>
        </View>

        <Tilt3D intensidade={4} escala={1.008} style={styles.tiltWrap}>
          <View style={styles.cartao}>
            <View style={styles.linhaHeader}>
              <View style={styles.colRotulo} />
              <View style={[styles.colValor, styles.colOlliHeader]}>
                <Text style={styles.headerOlliTexto}>OLLI</Text>
              </View>
              <View style={styles.colValor}>
                <Text style={styles.headerErpTexto}>ERP de escritório</Text>
              </View>
            </View>

            {LINHAS.map((linha, i) => (
              <Pressable
                key={linha.rotulo}
                onHoverIn={() => setLinhaAtiva(i)}
                onHoverOut={() => setLinhaAtiva((atual) => (atual === i ? null : atual))}
                accessibilityRole="text"
                accessibilityLabel={`${linha.rotulo}: OLLI ${resumoCelula(linha.olli)}. ERP de escritório ${resumoCelula(linha.erp)}.`}
                style={[
                  styles.linha,
                  i === LINHAS.length - 1 && styles.linhaUltima,
                  linhaAtiva === i && styles.linhaRealce,
                  linhaAtiva === i && !reduzir && styles.linhaRealceElevada,
                ]}
              >
                <View style={styles.colRotulo}>
                  <Text style={styles.rotuloTexto}>{linha.rotulo}</Text>
                </View>
                <View style={styles.colValor}>{renderCelula(linha.olli, true)}</View>
                <View style={styles.colValor}>{renderCelula(linha.erp, false)}</View>
              </Pressable>
            ))}
          </View>
        </Tilt3D>
      </View>
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────
const criarEstilos = (c: Cores) => StyleSheet.create({
  secao: {
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
  },
  interno: {
    width: '100%',
    maxWidth: 1120,
  },
  cabecalho: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    maxWidth: 640,
    alignSelf: 'center',
  },
  kicker: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: c.accentLight,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  titulo: {
    fontSize: 32,
    lineHeight: 39,
    fontFamily: Fonts.extraBold,
    color: c.onSurface,
    textAlign: 'center',
  },
  tiltWrap: {
    width: '100%',
  },
  cartao: {
    width: '100%',
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    overflow: 'hidden',
    ...sombrasDe(c).md,
  },
  linhaHeader: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
    backgroundColor: c.surfaceVariant,
  },
  colRotulo: {
    flexGrow: 1.4,
    flexBasis: 160,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  colValor: {
    flexGrow: 1,
    flexBasis: 110,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  colOlliHeader: {
    backgroundColor: c.accentContainer,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: c.accent,
  },
  headerOlliTexto: {
    fontSize: 14,
    fontFamily: Fonts.extraBold,
    color: c.primary,
    letterSpacing: 0.5,
  },
  headerErpTexto: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: c.onSurfaceVariant,
    textAlign: 'center',
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
  },
  linhaUltima: {
    borderBottomWidth: 0,
  },
  linhaRealce: {
    backgroundColor: c.surfaceVariant,
  },
  linhaRealceElevada: {
    transform: [{ scale: 1.005 }],
  },
  rotuloTexto: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: c.onSurface,
  },
  celulaConteudo: {
    alignItems: 'center',
    gap: 2,
  },
  celulaLegenda: {
    fontSize: 10.5,
    fontFamily: Fonts.regular,
    color: c.onSurfaceMuted,
    textAlign: 'center',
  },
  celulaValorTexto: {
    fontSize: 13.5,
    fontFamily: Fonts.bold,
    color: c.onSurface,
    textAlign: 'center',
  },
  celulaValorSerif: {
    fontSize: 16,
    fontFamily: Fonts.serifBold,
    color: c.onSurface,
    textAlign: 'center',
  },
  celulaValorOlli: {
    color: c.primary,
  },
  celulaValorDestaque: {
    color: c.danger,
  },
});
