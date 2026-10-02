/**
 * ClimaProximasVisitas — cartão "Clima nas próximas visitas" da visão Dia da
 * Agenda. A grade de horas não tem espaço para um chip em cada bloco (1h = 64
 * dp), então o clima das visitas das próximas 12h (a janela do MET) mora num
 * cartão só, acima da grade: uma linha por visita, com o chip e o "Remarcar por
 * chuva" quando a visita é externa.
 *
 * Hierarquia de rua: o cartão só existe quando há visita agendada nas próximas
 * 12h com o ponto do cliente. As que ficaram sem localização são CONTADAS no
 * rodapé (nunca somem). Crédito "Previsão: MET Norway" uma vez, no rodapé.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, isToday } from 'date-fns';
import { BorderRadius, Spacing, sombrasDe, useCores, useEstilos, type Cores } from '../../theme';
import { Aparecer } from '../motion';
import { ClimaDaVisita } from '../clima/ClimaDaVisita';
import { ATRIBUICAO_CLIMA } from '../../services/climaTexto';
import { semHoraMarcada } from '../../utils/agendaDominio';
import { textoSemLocal, visitasDoClimaNoDia } from '../../utils/climaNaAgenda';
import type { OcorrenciaAgendamento } from '../../utils/contratoRecorrente';
import type { Cliente } from '../../types';

interface Props {
  itens: OcorrenciaAgendamento[];
  clientes: Cliente[];
  aoRemarcado: () => void;
}

export function ClimaProximasVisitas({ itens, clientes, aoRemarcado }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const porId = useMemo(() => new Map(clientes.map((c) => [c.id, c] as const)), [clientes]);
  const { comLocal, semLocal } = useMemo(
    () => visitasDoClimaNoDia(itens, (id) => porId.get(id), semHoraMarcada),
    [itens, porId],
  );
  if (comLocal.length === 0) return null;
  const nota = textoSemLocal(semLocal);

  return (
    <Aparecer style={styles.card}>
      <View style={styles.cabecalho}>
        <MaterialCommunityIcons name="weather-partly-rainy" size={18} color={cores.accentLight} />
        <Text style={styles.titulo}>Clima nas próximas visitas</Text>
      </View>
      {comLocal.map((v, i) => {
        const ini = new Date(v.inicio);
        const hora = Number.isNaN(ini.getTime()) ? '--:--' : format(ini, 'HH:mm');
        return (
          <View key={v.id} style={[styles.linha, i > 0 && styles.linhaSeparada]}>
            <View style={styles.horaCol}>
              <Text style={styles.hora}>{hora}</Text>
              {!isToday(ini) ? <Text style={styles.amanha}>amanhã</Text> : null}
            </View>
            <View style={styles.corpo}>
              <Text style={styles.quem} numberOfLines={1}>
                {v.clienteNome} · {v.titulo}
              </Text>
              <ClimaDaVisita
                visita={v}
                cliente={v.clienteId ? porId.get(v.clienteId) : null}
                clientes={clientes}
                aoRemarcado={aoRemarcado}
                mostrarAtribuicao={false}
                indice={i + 1}
                style={styles.chip}
              />
            </View>
          </View>
        );
      })}
      {nota ? <Text style={styles.nota}>{nota}</Text> : null}
      <Text style={styles.credito}>{ATRIBUICAO_CLIMA}</Text>
    </Aparecer>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    card: {
      marginBottom: Spacing.md,
      padding: Spacing.md,
      backgroundColor: c.surface,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: c.outline,
      ...sombrasDe(c).sm,
    },
    cabecalho: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    titulo: { color: c.onSurface, fontSize: 14, fontWeight: '800' },
    linha: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm },
    linhaSeparada: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.outline },
    horaCol: { width: 48 },
    hora: { color: c.onSurface, fontSize: 14, fontWeight: '800' },
    amanha: { color: c.onSurfaceMuted, fontSize: 11, fontWeight: '700', marginTop: 1 },
    corpo: { flex: 1, minWidth: 0 },
    quem: { color: c.onSurfaceVariant, fontSize: 12.5, fontWeight: '600' },
    chip: { marginTop: Spacing.xs + 2 },
    nota: { color: c.onSurfaceVariant, fontSize: 12, lineHeight: 16, marginTop: Spacing.sm },
    credito: { color: c.onSurfaceMuted, fontSize: 11, marginTop: Spacing.xs },
  });
