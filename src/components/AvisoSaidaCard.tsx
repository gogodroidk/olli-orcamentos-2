import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, comAlfa, useCores, useEstilos, type Cores } from '../theme';
import { Motion, useReducedMotion } from '../theme/motion';
import { OlliPressable } from './OlliPressable';
import type { AvisoSaida } from '../services/avisoSaida';
// A copy dos estados de falha vem de `saidaCalculo` (puro) de propósito: lá o
// `node` alcança e o teste prova o TEXTO, não a existência de um `if`.
import { fraseSaida, textoEnderecoInsuficiente, textoIndisponivel } from '../services/saidaCalculo';

/**
 * "Saia às 14:23 para chegar às 15:00" na Home — a resposta que o dono pediu,
 * na tela.
 *
 * PRESENTACIONAL: não busca nada. Recebe o resultado que `avisoSaida.ts` já
 * calculou e guardou. Isso é regra de custo, não de arquitetura: cada cálculo
 * é uma chamada da Routes API no SKU Pro (US$ 10 / 1.000), e um `useEffect`
 * que recalcula a cada foco de tela transformaria a feature numa conta aberta.
 * A única chamada paga a partir daqui é o toque explícito em "Atualizar".
 *
 * FUNCIONA NO APK — e isso é o ponto. O `EtaChip` que já existe fica escondido
 * no nativo (`temDestinoEta` devolve `false` enquanto `expo-location` não
 * existir), então hoje o prestador com luva suja não vê estimativa nenhuma.
 * Este card não depende de localização: a origem vem do cadastro.
 *
 * TRÊS ESTADOS, sempre. E o quarto caso, o mais fácil de errar: quando não há
 * registro nenhum (`aviso == null`), o card NÃO aparece — porque nada foi
 * tentado, e escrever "não deu pra checar" sem ter checado é inventar um erro
 * do mesmo jeito que inventar um número. Quando a tentativa aconteceu e
 * falhou, o registro existe e o motivo aparece na tela.
 *
 * MOTION: só `opacity`, com caminho sem movimento quando o usuário pediu menos
 * animação no sistema. Nada de layout animado atrás de um horário que o
 * prestador precisa ler no sol, de luva.
 */

export interface AvisoSaidaCardProps {
  /** O que `lerAvisoSaida()` devolveu para a parada mostrada. `null` = nada tentado → não renderiza. */
  aviso: AvisoSaida | null;
  /** Toque em "Atualizar" — o ÚNICO caminho daqui que gasta uma chamada paga. */
  onAtualizar?: () => void;
  atualizando?: boolean;
  /** Injeção para teste; em produção é sempre o relógio real. */
  agora?: Date;
}

type Tom = 'ok' | 'alerta' | 'mudo';

function coresDoTom(tom: Tom, c: Cores): { bg: string; fg: string; borda: string } {
  if (tom === 'ok') return { bg: c.successLight, fg: c.success, borda: comAlfa(c.success, 0.4) };
  if (tom === 'alerta') return { bg: c.warningLight, fg: c.warning, borda: comAlfa(c.warning, 0.4) };
  return { bg: c.surfaceVariant, fg: c.onSurfaceMuted, borda: c.outline };
}

export function AvisoSaidaCard({ aviso, onAtualizar, atualizando, agora }: AvisoSaidaCardProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzirMovimento = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduzirMovimento ? 1 : 0)).current;
  const chaveEstado = aviso?.resultado.estado ?? 'vazio';

  useEffect(() => {
    if (reduzirMovimento) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: Motion.dur.base,
      easing: Motion.easing.standard,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveEstado, reduzirMovimento]);

  // Nada foi tentado para esta parada: silêncio honesto (ver docblock).
  if (!aviso) return null;

  const r = aviso.resultado;
  const relogio = agora ?? new Date();

  let tom: Tom = 'mudo';
  let icone: React.ComponentProps<typeof MaterialCommunityIcons>['name'] = 'clock-alert-outline';
  let texto: string;
  let mostrarAtualizar = !!onAtualizar;

  if (r.estado === 'ok') {
    tom = r.atrasado ? 'alerta' : 'ok';
    icone = r.atrasado ? 'alarm-light-outline' : 'car-clock';
    texto = fraseSaida(r, relogio);
  } else if (r.estado === 'endereco_insuficiente') {
    icone = 'map-marker-question-outline';
    texto = textoEnderecoInsuficiente(r.qual);
    // Tentar de novo não conserta um endereço: quem conserta é o prestador.
    mostrarAtualizar = false;
  } else {
    icone = 'wifi-off';
    // Diz o que aconteceu E o que continua valendo. Qual das duas frases é a
    // verdadeira depende de haver ou não um aviso calculado ainda na fila —
    // ver `textoIndisponivel`.
    texto = textoIndisponivel(aviso.avisoAgendado);
  }

  const t = coresDoTom(tom, cores);

  return (
    <Animated.View style={[styles.card, { opacity, backgroundColor: t.bg, borderColor: t.borda }]}>
      <MaterialCommunityIcons name={icone} size={16} color={t.fg} style={styles.icone} />
      <Text style={[styles.texto, { color: t.fg }]}>{texto}</Text>
      {mostrarAtualizar ? (
        <OlliPressable
          style={styles.botao}
          onPress={onAtualizar}
          disabled={atualizando}
          haptic="selection"
          accessibilityLabel="Recalcular a hora de sair com o trânsito de agora"
        >
          <Text style={[styles.botaoTexto, { color: t.fg }]}>
            {atualizando ? 'Checando…' : 'Atualizar'}
          </Text>
        </OlliPressable>
      ) : null}
    </Animated.View>
  );
}

const criarEstilos = (_c: Cores) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  icone: { marginTop: 1 },
  texto: { flex: 1, minWidth: 160, fontSize: 12.5, fontWeight: '700', lineHeight: 17 },
  // 44×44 de área de toque: é o piso das regras de movimento deste projeto, e
  // aqui não é teoria — quem toca neste botão está de luva, no sol, com o
  // cliente esperando.
  botao: {
    minHeight: 44,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  botaoTexto: { fontSize: 12.5, fontWeight: '800', textDecorationLine: 'underline' },
});
