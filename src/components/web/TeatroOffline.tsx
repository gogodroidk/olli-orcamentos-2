import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../../theme';
import { Fonts } from '../../theme/fonts';
import { useReducedMotion } from '../../theme/motion';
import { Tilt3D } from './Tilt3D';

/**
 * TeatroOffline — seção da landing que prova o offline (a dor real de quem já
 * usou um ERP de escritório em campo). Self-contained: só soltar
 * `<TeatroOffline />` numa página; nenhuma prop obrigatória.
 */

interface ItemOrcamento {
  readonly texto: string;
  readonly valor: string;
}

const ITENS_ORCAMENTO: readonly ItemOrcamento[] = [
  { texto: 'Visita técnica + diagnóstico', valor: 'R$ 120' },
  { texto: 'Peça de reposição', valor: 'R$ 340' },
  { texto: 'Mão de obra', valor: 'R$ 180' },
];

const ALTURAS_BARRAS_SINAL: readonly number[] = [6, 10, 14, 18];

export function TeatroOffline() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReducedMotion();
  const [aviaoLigado, setAviaoLigado] = useState(false);

  function alternarAviao() {
    setAviaoLigado((atual) => !atual);
  }

  const corBadge = aviaoLigado ? cores.warning : cores.success;
  const bgBadge = aviaoLigado ? cores.warningLight : cores.successLight;
  const textoBadge = aviaoLigado ? '3 itens aguardando sinal' : 'tudo sincronizado';
  const iconeBadge: keyof typeof MaterialCommunityIcons.glyphMap = aviaoLigado ? 'clock-outline' : 'cloud-check-outline';
  const textoStatus = aviaoLigado ? 'salvo no aparelho ✓' : 'sincronizado com a nuvem';
  const corStatus = aviaoLigado ? cores.success : cores.onSurfaceVariant;
  const iconeAviao: keyof typeof MaterialCommunityIcons.glyphMap = aviaoLigado ? 'airplane' : 'airplane-off';

  return (
    <View style={styles.secao}>
      <View style={styles.interno}>
        <View style={styles.cabecalho}>
          <Text style={styles.kicker}>OFFLINE DE VERDADE</Text>
          <Text style={styles.titulo}>Desliga o Wi-Fi. A gente continua.</Text>
        </View>

        <View style={styles.colunas}>
          <View style={styles.colTexto}>
            <Text style={styles.textoCorpo}>
              Casa de máquinas, subsolo, elevador de serviço — é onde o 4G morre e onde você trabalha. O
              OLLI grava tudo no aparelho e sincroniza sozinho quando o sinal volta.
            </Text>
          </View>

          <View style={styles.colJanela}>
            <Tilt3D intensidade={6} escala={1.015} style={styles.tiltWrap}>
              <View style={[styles.janela, styles.janelaGlow]}>
                <View style={styles.barra}>
                  <View style={[styles.bolinha, { backgroundColor: '#FF6B6B' }]} />
                  <View style={[styles.bolinha, { backgroundColor: '#F7B23B' }]} />
                  <View style={[styles.bolinha, { backgroundColor: '#2BD787' }]} />
                  <Text style={styles.barraTitulo}>Orçamento #118</Text>
                </View>

                <View style={styles.corpo}>
                  <Pressable
                    onPress={alternarAviao}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: aviaoLigado }}
                    accessibilityLabel="Modo avião"
                    style={({ pressed }) => [styles.toggleWrap, pressed && !reduzir && styles.toggleWrapPressionado]}
                  >
                    <View style={styles.toggleLabelLinha}>
                      <MaterialCommunityIcons name={iconeAviao} size={16} color={cores.onSurfaceVariant} />
                      <Text style={styles.toggleLabel}>Modo avião</Text>
                    </View>
                    <View style={styles.togglePill}>
                      <View style={[styles.toggleSegmento, !aviaoLigado && styles.toggleSegmentoAtivo]}>
                        <Text style={[styles.toggleSegmentoTexto, !aviaoLigado && styles.toggleSegmentoTextoAtivo]}>
                          desligado
                        </Text>
                      </View>
                      <View style={[styles.toggleSegmento, aviaoLigado && styles.toggleSegmentoAtivoAviao]}>
                        <Text style={[styles.toggleSegmentoTexto, aviaoLigado && styles.toggleSegmentoTextoAtivoAviao]}>
                          LIGADO
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  <View style={styles.statusLinha}>
                    <View style={[styles.badge, { backgroundColor: bgBadge }]}>
                      <MaterialCommunityIcons name={iconeBadge} size={14} color={corBadge} />
                      <Text style={[styles.badgeTexto, { color: corBadge }]}>{textoBadge}</Text>
                    </View>

                    {!aviaoLigado ? (
                      <View style={styles.sinalWrap} accessibilityLabel="Sinal cheio">
                        {ALTURAS_BARRAS_SINAL.map((altura, i) => (
                          <View
                            key={`sinal-${i}`}
                            style={[styles.sinalBarra, { height: altura, backgroundColor: cores.accent }]}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <Text style={[styles.statusTexto, { color: corStatus }]}>{textoStatus}</Text>

                  <View style={styles.itens}>
                    {ITENS_ORCAMENTO.map((item) => (
                      <View key={item.texto} style={styles.itemLinha}>
                        <Text style={styles.itemTexto}>{item.texto}</Text>
                        <Text style={styles.itemValor}>{item.valor}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </Tilt3D>
          </View>
        </View>
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
  colunas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xxl,
    alignItems: 'flex-start',
  },
  colTexto: {
    flexGrow: 1,
    flexBasis: 300,
    minWidth: 260,
    justifyContent: 'center',
    paddingTop: Spacing.sm,
  },
  textoCorpo: {
    fontSize: 15.5,
    lineHeight: 24,
    fontFamily: Fonts.medium,
    color: c.onSurfaceVariant,
    maxWidth: 440,
  },
  colJanela: {
    flexGrow: 1,
    flexBasis: 360,
    minWidth: 280,
  },
  tiltWrap: {
    width: '100%',
  },
  janela: {
    width: '100%',
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    overflow: 'hidden',
    ...sombrasDe(c).md,
  },
  janelaGlow: {
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 30,
    elevation: 12,
  },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: c.surfaceVariant,
    borderBottomWidth: 1,
    borderBottomColor: c.outline,
  },
  bolinha: { width: 9, height: 9, borderRadius: 5 },
  barraTitulo: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: c.onSurfaceVariant,
    marginLeft: Spacing.sm,
  },
  corpo: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  toggleWrap: {
    gap: Spacing.sm,
  },
  toggleWrapPressionado: {
    transform: [{ scale: 0.99 }],
  },
  toggleLabelLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: c.onSurface,
  },
  togglePill: {
    flexDirection: 'row',
    backgroundColor: c.surfaceVariant,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: c.outline,
    padding: 3,
    gap: 3,
  },
  toggleSegmento: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleSegmentoAtivo: {
    backgroundColor: c.accentContainer,
    borderColor: c.accent,
  },
  toggleSegmentoAtivoAviao: {
    backgroundColor: c.warningLight,
    borderColor: c.warning,
  },
  toggleSegmentoTexto: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: c.onSurfaceMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  toggleSegmentoTextoAtivo: {
    color: c.primary,
  },
  toggleSegmentoTextoAtivoAviao: {
    color: c.warning,
  },
  statusLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  badgeTexto: {
    fontSize: 11.5,
    fontFamily: Fonts.bold,
  },
  sinalWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 18,
  },
  sinalBarra: {
    width: 4,
    borderRadius: 2,
  },
  statusTexto: {
    fontSize: 12.5,
    fontFamily: Fonts.semiBold,
  },
  itens: {
    marginTop: Spacing.xs,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: c.outline,
    paddingTop: Spacing.md,
  },
  itemLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTexto: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: c.onSurfaceVariant,
    marginRight: Spacing.sm,
  },
  itemValor: {
    fontSize: 15,
    fontFamily: Fonts.serifBold,
    color: c.onSurface,
  },
});
