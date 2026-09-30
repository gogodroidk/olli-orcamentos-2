import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, comAlfa, type Cores } from '../theme';
import { OlliButton } from './OlliButton';
import { AnimatedEntrance } from './AnimatedEntrance';
import type { AcaoLembrete, UrgenciaLembrete } from '../services/lembreteAssinatura';
import type { LembreteExibivel } from '../services/lembreteAssinaturaLoja';

interface Props {
  /** Já adaptado à plataforma (ver `useLembreteAssinatura`). `null` = nada. */
  lembrete: LembreteExibivel | null;
  onAcao: (acao: AcaoLembrete) => void;
  onDispensar: () => void;
  /** Botão do teste grátis em andamento. */
  iniciandoTrial?: boolean;
  style?: ViewStyle;
}

const ICONE: Record<UrgenciaLembrete, keyof typeof MaterialCommunityIcons.glyphMap> = {
  info: 'crown-outline',
  atencao: 'alert-outline',
  critico: 'alert-circle-outline',
};

/**
 * Faixa de LEMBRETE DE ASSINATURA no topo da Home (mobile e desktop).
 *
 * Card, não modal: lembra sem interromper o trabalho. Quem decide O QUE aparece
 * é a regra pura (`services/lembreteAssinatura.ts`) e a adaptação às lojas
 * (`services/lembreteAssinaturaLoja.ts`) — este componente só desenha. Por isso
 * não há aqui nenhum `Platform.OS`: se um botão de compra chegasse até esta
 * faixa no iOS/Android, o erro estaria na adaptação, e é lá que o teste confere.
 *
 * Peso visual pela urgência, com os mesmos tokens dos avisos das outras telas
 * (AvisoFeriado, cobrancaAviso da PlanosScreen): `info` discreto na superfície,
 * `atencao` no amarelo, `critico` no vermelho. "Agora não" só existe quando a
 * regra permite dispensar (`dispensavelPorHoras !== null`).
 */
export function LembreteAssinaturaFaixa({ lembrete, onAcao, onDispensar, iniciandoTrial, style }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  if (!lembrete) return null;

  const { urgencia, cta, ctaSecundario } = lembrete;
  const corIcone = urgencia === 'critico' ? cores.danger : urgencia === 'atencao' ? cores.warning : cores.accentLight;
  const dispensavel = lembrete.dispensavelPorHoras !== null;
  const temBotoes = !!cta || !!ctaSecundario || dispensavel;

  return (
    <AnimatedEntrance index={0} style={style}>
      <View
        style={[styles.card, urgencia === 'atencao' && styles.cardAtencao, urgencia === 'critico' && styles.cardCritico]}
        // Crítico/atenção são anunciados pelo leitor de tela; o leve não interrompe.
        accessibilityRole={urgencia === 'info' ? 'summary' : 'alert'}
      >
        <View style={styles.head}>
          <View style={[styles.iconWrap, { backgroundColor: comAlfa(corIcone, 0.14) }]}>
            <MaterialCommunityIcons name={ICONE[urgencia]} size={18} color={corIcone} accessible={false} importantForAccessibility="no" />
          </View>
          <View style={styles.textos}>
            <Text style={styles.titulo} accessibilityRole="header">{lembrete.titulo}</Text>
            <Text style={styles.texto}>{lembrete.texto}</Text>
          </View>
        </View>

        {temBotoes ? (
          <View style={styles.botoes}>
            {cta ? (
              <OlliButton
                label={cta.rotulo}
                onPress={() => onAcao(cta.acao)}
                size="sm"
                loading={cta.acao === 'iniciar_trial' && iniciandoTrial}
              />
            ) : null}
            {ctaSecundario ? (
              <OlliButton
                label={ctaSecundario.rotulo}
                onPress={() => onAcao(ctaSecundario.acao)}
                variant="outline"
                size="sm"
                loading={ctaSecundario.acao === 'iniciar_trial' && iniciandoTrial}
              />
            ) : null}
            {dispensavel ? (
              <OlliButton
                label="Agora não"
                onPress={onDispensar}
                variant="ghost"
                size="sm"
                accessibilityLabel="Agora não. Esconder este lembrete por enquanto"
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </AnimatedEntrance>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  card: {
    backgroundColor: c.surfaceVariant,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardAtencao: {
    backgroundColor: c.warningLight,
    borderColor: comAlfa(c.warning, 0.35),
  },
  cardCritico: {
    backgroundColor: c.dangerLight,
    borderColor: comAlfa(c.danger, 0.4),
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  textos: { flex: 1, gap: 3 },
  titulo: { fontSize: 14, fontWeight: '800', color: c.onSurface },
  texto: { fontSize: 13, lineHeight: 18, color: c.onSurfaceVariant },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
});
