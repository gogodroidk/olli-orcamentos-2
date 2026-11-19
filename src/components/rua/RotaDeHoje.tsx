/**
 * ROTA DE HOJE — as visitas do dia em sequência (Painel da Rua, item 2.6).
 *
 * A ordem é a do relógio; cada parada diz em que pé está (feita, agora,
 * próxima, sem baixa). "Rota no Maps" abre o Google Maps com todas as paradas
 * que faltam, pelo link público de direções (sem chave, sem custo).
 *
 * 3 estados, como todo o resto da Home: carregando → esqueleto; erro → aviso
 * com "Tentar de novo" (nunca "nada hoje"); ok vazio → "Nada marcado para
 * hoje" com o atalho para agendar.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import type { EstadoParadaDia, ParadaDoDia } from '../../utils/agendaDia';
import type { Agendamento } from '../../types';
import { Aparecer } from '../motion/Aparecer';
import { PressableAnimado } from '../motion/PressableAnimado';
import { Skeleton } from '../motion/Skeleton';

/** Quantas paradas cabem na Home antes do "ver o resto na Agenda". */
export const MAX_PARADAS_NA_HOME = 6;

export type EstadoRota = 'carregando' | 'erro' | 'ok';

interface Props {
  estado: EstadoRota;
  paradas: ParadaDoDia<Agendamento>[];
  /** Texto do erro (ex.: a agenda ainda não chegou da nuvem). */
  textoErro?: string;
  onTentarDeNovo: () => void;
  onAbrirVisita: (id: string) => void;
  onAgendar: () => void;
  onVerAgenda: () => void;
  /** `null` = não há 2+ paradas com endereço pela frente (o botão não aparece). */
  onRotaNoMaps: (() => void) | null;
  abrindoMaps: boolean;
}

const ROTULO: Record<EstadoParadaDia, string> = {
  feita: 'Feita',
  agora: 'Agora',
  sem_baixa: 'Sem baixa',
  proxima: 'Próxima',
  depois: '',
};

function hora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '--:--' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function RotaDeHoje(props: Props) {
  const { estado, paradas, onTentarDeNovo, onAbrirVisita, onAgendar, onVerAgenda, onRotaNoMaps, abrindoMaps } = props;
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const feitas = paradas.filter(p => p.estado === 'feita').length;
  const subtitulo = estado !== 'ok' || paradas.length === 0
    ? null
    : `${paradas.length} ${paradas.length === 1 ? 'parada' : 'paradas'}${feitas ? ` · ${feitas} ${feitas === 1 ? 'feita' : 'feitas'}` : ''}`;
  const visiveis = paradas.slice(0, MAX_PARADAS_NA_HOME);
  const resto = paradas.length - visiveis.length;

  const tom = (e: EstadoParadaDia): string => {
    if (e === 'feita') return cores.success;
    if (e === 'sem_baixa') return cores.warning;
    if (e === 'agora' || e === 'proxima') return cores.accentLight;
    return cores.onSurfaceMuted;
  };

  return (
    <View style={styles.bloco}>
      <View style={styles.cabeca}>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo} accessibilityRole="header">Rota de hoje</Text>
          {subtitulo ? <Text style={styles.sub}>{subtitulo}</Text> : null}
        </View>
        {estado === 'ok' && onRotaNoMaps ? (
          <PressableAnimado
            style={styles.btnMaps}
            onPress={onRotaNoMaps}
            disabled={abrindoMaps}
            haptic="light"
            accessibilityLabel="Abrir no Google Maps a rota com todas as paradas que faltam hoje"
            accessibilityState={{ busy: abrindoMaps }}
          >
            <MaterialCommunityIcons name="map-marker-path" size={16} color={cores.accentLight} />
            <Text style={styles.btnMapsTexto}>{abrindoMaps ? 'Abrindo…' : 'Rota no Maps'}</Text>
          </PressableAnimado>
        ) : null}
      </View>

      {estado === 'carregando' ? (
        <View style={styles.card} accessibilityLabel="Carregando a rota de hoje">
          {[0, 1].map(i => (
            <View key={i} style={styles.linhaEsqueleto}>
              <Skeleton width={44} height={14} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="40%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : estado === 'erro' ? (
        <View style={styles.aviso}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={cores.warning} />
          <Text style={styles.avisoTexto}>{props.textoErro ?? 'Não deu para ler a agenda de hoje agora.'}</Text>
          <PressableAnimado onPress={onTentarDeNovo} haptic="selection" hitSlop={8} accessibilityLabel="Tentar ler a agenda de hoje de novo">
            <Text style={styles.avisoAcao}>Tentar de novo</Text>
          </PressableAnimado>
        </View>
      ) : paradas.length === 0 ? (
        <View style={[styles.card, styles.vazio]}>
          <MaterialCommunityIcons name="calendar-check-outline" size={22} color={cores.onSurfaceMuted} />
          <Text style={styles.vazioTexto}>Nada marcado para hoje.</Text>
          <PressableAnimado style={styles.btnAgendar} onPress={onAgendar} haptic="light" accessibilityLabel="Agendar uma visita">
            <MaterialCommunityIcons name="calendar-plus" size={16} color={cores.accentLight} />
            <Text style={styles.btnMapsTexto}>Agendar</Text>
          </PressableAnimado>
        </View>
      ) : (
        <View style={styles.card}>
          {visiveis.map((p, i) => {
            const cor = tom(p.estado);
            const ultima = i === visiveis.length - 1;
            const rotulo = ROTULO[p.estado];
            const nome = p.visita.clienteNome || p.visita.titulo || 'Visita';
            return (
              <Aparecer key={p.visita.id} indice={i}>
                <PressableAnimado
                  style={styles.parada}
                  escala={0.98}
                  onPress={() => onAbrirVisita(p.visita.id)}
                  haptic="selection"
                  accessibilityLabel={`${hora(p.visita.inicio)}, ${nome}${p.visita.endereco ? `, ${p.visita.endereco}` : ''}${rotulo ? `. ${rotulo}` : ''}. Abrir na agenda`}
                >
                  <Text style={[styles.hora, p.estado === 'feita' && styles.feitaTexto]}>{hora(p.visita.inicio)}</Text>
                  <View style={styles.trilho}>
                    <View style={[styles.ponto, { borderColor: cor, backgroundColor: p.estado === 'feita' || p.estado === 'agora' ? cor : 'transparent' }]} />
                    {!ultima ? <View style={styles.fio} /> : null}
                  </View>
                  <View style={styles.meio}>
                    <Text style={[styles.nome, p.estado === 'feita' && styles.feitaTexto]} numberOfLines={1}>{nome}</Text>
                    <Text style={styles.endereco} numberOfLines={1}>{p.visita.endereco?.trim() || 'Sem endereço'}</Text>
                  </View>
                  {rotulo ? (
                    <View style={[styles.pilula, { backgroundColor: comAlfa(cor, 0.14), borderColor: comAlfa(cor, 0.36) }]}>
                      <Text style={[styles.pilulaTexto, { color: cor }]}>{rotulo}</Text>
                    </View>
                  ) : null}
                </PressableAnimado>
              </Aparecer>
            );
          })}
          {resto > 0 ? (
            <PressableAnimado style={styles.resto} onPress={onVerAgenda} haptic="selection" accessibilityLabel={`Ver as outras ${resto} paradas de hoje na Agenda`}>
              <Text style={styles.restoTexto}>+{resto} {resto === 1 ? 'parada' : 'paradas'} hoje · ver na Agenda</Text>
            </PressableAnimado>
          ) : null}
        </View>
      )}
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  bloco: { marginTop: Spacing.lg },
  cabeca: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, marginBottom: Spacing.sm, gap: Spacing.sm },
  titulo: { fontSize: 16, fontWeight: '800', color: c.onBackground },
  sub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2, fontWeight: '600' },
  btnMaps: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40,
    paddingHorizontal: 14, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: c.strokeGlow, backgroundColor: c.surfacePressed,
  },
  btnMapsTexto: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  card: {
    marginHorizontal: Spacing.base, backgroundColor: c.surfaceGlass,
    borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: c.outlineDark,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
  },
  linhaEsqueleto: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  parada: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: Spacing.sm },
  hora: { width: 46, fontSize: 13.5, fontWeight: '800', color: c.onSurface, fontVariant: ['tabular-nums'] },
  trilho: { width: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  ponto: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  fio: { position: 'absolute', top: '50%', marginTop: 8, bottom: -8, width: 2, borderRadius: 1, backgroundColor: c.outline },
  meio: { flex: 1, paddingVertical: Spacing.sm },
  nome: { fontSize: 14.5, fontWeight: '700', color: c.onSurface },
  endereco: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
  feitaTexto: { color: c.onSurfaceMuted },
  pilula: { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  pilulaTexto: { fontSize: 13, fontWeight: '800' },
  resto: { alignItems: 'center', paddingVertical: Spacing.sm, minHeight: 40, justifyContent: 'center' },
  restoTexto: { fontSize: 12.5, fontWeight: '700', color: c.accentLight },
  vazio: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  vazioTexto: { flex: 1, fontSize: 13.5, color: c.onSurfaceVariant, fontWeight: '600' },
  btnAgendar: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40,
    paddingHorizontal: 14, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: c.strokeGlow, backgroundColor: c.surfacePressed,
  },
  aviso: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: Spacing.base,
    backgroundColor: comAlfa(c.warning, 0.1), borderWidth: 1, borderColor: comAlfa(c.warning, 0.3),
    borderRadius: BorderRadius.xl, padding: Spacing.md,
  },
  avisoTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant },
  avisoAcao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
});
