import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { Aparecer } from '../motion';
import { useConfirmacoesVisitas } from '../../services/confirmacaoVisita';
import {
  confirmacaoDaVisita,
  seloDaConfirmacao,
  type StatusConfirmacao,
  type VisitaConfirmavel,
} from '../../utils/confirmacaoVisita';

/**
 * SELO DA CONFIRMAÇÃO DE VÉSPERA (Onda I3) — "Confirmada pelo cliente",
 * "Pediu para remarcar" ou "Aguardando o cliente", na Agenda e no Hoje.
 *
 * Só aparece quando EXISTE pedido de confirmação para a visita no horário atual
 * dela (remarcou → a resposta antiga some). Sem pedido, sem leitura ou com a
 * leitura falhando, não ocupa espaço — o selo é um sinal, nunca um "não
 * confirmada" por falta de dado. Lê do store compartilhado (uma consulta para a
 * tela inteira, não uma por cartão).
 */
export function SeloConfirmacao({ visita, style }: { visita: VisitaConfirmavel; style?: StyleProp<ViewStyle> }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { mapa } = useConfirmacoesVisitas();
  const selo = seloDaConfirmacao(confirmacaoDaVisita(visita, mapa));
  if (!selo) return null;
  const cor = corDoSelo(selo.tipo, cores);
  return (
    <Aparecer style={style}>
      <View
        style={[styles.selo, { backgroundColor: comAlfa(cor, 0.13), borderColor: comAlfa(cor, 0.38) }]}
        accessibilityRole="text"
        accessibilityLabel={selo.rotulo}
      >
        <MaterialCommunityIcons name={selo.icone} size={13} color={cor} />
        <Text style={[styles.txt, { color: cor }]} numberOfLines={1}>{selo.rotulo}</Text>
      </View>
    </Aparecer>
  );
}

export function corDoSelo(tipo: StatusConfirmacao, cores: Cores): string {
  if (tipo === 'confirmada') return cores.success;
  if (tipo === 'remarcar') return cores.warning;
  return cores.accentLight;
}

const criarEstilos = (_c: Cores) => StyleSheet.create({
  selo: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  txt: { fontSize: 13, fontWeight: '800' },
});
