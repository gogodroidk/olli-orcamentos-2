import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, comAlfa, type Cores } from '../theme';
import type { EstadoFeriado } from '../services/feriados';

interface Props {
  estado: EstadoFeriado;
}

/**
 * Aviso NÃO BLOQUEANTE de feriado no dia escolhido, no formulário de agendar.
 * Mesmo comportamento do aviso de sobreposição de horário logo acima: informa,
 * não impede. Marcar visita em feriado é decisão legítima (plantão, urgência,
 * cliente que só está em casa nesse dia) — o app não sabe mais que ele.
 *
 * DUAS SEVERIDADES, porque para o prestador elas são fatos operacionais
 * diferentes:
 *   `nacional`    → quase tudo fecha; o cliente provavelmente não recebe.
 *   `facultativo` → comércio costuma abrir; vale confirmar antes de marcar.
 * Carnaval e Corpus Christi são facultativos, não feriados nacionais (Portaria
 * MGI nº 11.460/2025) — dizer "feriado nacional" ali faria o app desaconselhar
 * um dia de trabalho que costuma ser dia de trabalho.
 *
 * O ESTADO `indisponivel` APARECE, e é o ponto mais fácil de errar deste
 * arquivo: sem essa linha, um aparelho que nunca baixou o calendário mostraria
 * exatamente a mesma tela de um dia comum — e silêncio, aqui, é lido como
 * "não é feriado". Seria "não sei" virando "não tem" pela porta dos fundos.
 */
export function AvisoFeriado({ estado }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  // Primeiro frame: nada. É lookup local em quase todo caso, e um esqueleto
  // piscando embaixo do campo de data seria mais distração que informação.
  if (estado.estado === 'carregando') return null;

  if (estado.estado === 'indisponivel') {
    return (
      <View style={styles.linha}>
        <MaterialCommunityIcons name="calendar-question" size={15} color={cores.onSurfaceMuted} />
        <Text style={styles.linhaTexto}>
          Não consegui conferir se esse dia é feriado (ainda não baixei o calendário neste aparelho).
        </Text>
      </View>
    );
  }

  if (!estado.feriado) return null;

  const nacional = estado.feriado.tipo === 'nacional';
  const cor = nacional ? cores.warning : cores.onSurfaceVariant;

  return (
    <View style={[styles.card, nacional && styles.cardNacional]} accessibilityRole="alert">
      <View style={styles.head}>
        <MaterialCommunityIcons name={nacional ? 'calendar-alert' : 'calendar-clock'} size={16} color={cor} />
        <Text style={styles.headText}>
          {estado.feriado.nome} — {nacional ? 'feriado nacional' : 'ponto facultativo'}
        </Text>
      </View>
      <Text style={styles.corpo}>
        {nacional
          ? 'Na maior parte do país quase tudo fecha. Vale confirmar com o cliente antes de marcar.'
          : 'Comércio costuma abrir e indústria não. Vale perguntar se ele vai estar em casa.'}
      </Text>
      {/* A honestidade obrigatória da API (`municipaisIncluidos:false`): é
          justamente o feriado da cidade que esvazia a agenda do prestador, e
          calar isso faria o app parecer mais esperto do que é. Fica aqui, junto
          do feriado achado, e não como linha fixa no formulário: neste momento
          ele está pensando em calendário, então a ressalva é informação — solta
          em todo agendamento, seria ruído que se aprende a ignorar. */}
      {!estado.municipaisIncluidos && (
        <Text style={styles.rodape}>Feriado só da sua cidade (aniversário do município) não entra nesta lista.</Text>
      )}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  card: {
    backgroundColor: c.surfaceVariant,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    gap: 6,
  },
  cardNacional: {
    backgroundColor: c.warningLight,
    borderColor: comAlfa(c.warning, 0.35),
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headText: { flex: 1, fontSize: 13, fontWeight: '800', color: c.onSurface },
  corpo: { fontSize: 12, lineHeight: 17, color: c.onSurfaceVariant },
  rodape: { fontSize: 11, lineHeight: 15, color: c.onSurfaceMuted },
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: Spacing.sm },
  linhaTexto: { flex: 1, fontSize: 11, lineHeight: 15, color: c.onSurfaceMuted },
});
