/**
 * SugestaoEncaixe — "Você já vai estar a 1,2 km daqui na terça às 14h (cliente
 * Maria). Encaixar às 15h30?" (Onda I1, jogada 4 · Encaixe Inteligente).
 *
 * Componente ISOLADO e presentacional. Quem chama calcula (é síncrono, sem API):
 *   const encaixe = useMemo(
 *     () => sugerirEncaixe({ lat, lon }, ocorrenciasDos7Dias, { duracaoMin }),
 *     [lat, lon, ocorrenciasDos7Dias, duracaoMin],
 *   );
 *   <SugestaoEncaixe resultado={encaixe} onEscolher={(s) => preencher(s.inicio, s.fim)} />
 *
 * `resultado: 'carregando'` enquanto a agenda ainda não saiu do banco local.
 *
 * Nenhum estado some calado:
 *  - cliente sem coordenada → "Cadastre o CEP do cliente…" (não "nenhum encaixe");
 *  - sem visita com localização na semana → diz isso;
 *  - visitas sem localização que ficaram de fora → diz quantas;
 *  - rodapé honesto: a distância é em linha reta (sem API de rota).
 *
 * Motion: `Aparecer` escalonado nas linhas, `PressableAnimado` no toque,
 * `Skeleton` no carregando — todos respeitam "Reduzir movimento".
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { Aparecer, PressableAnimado, Skeleton } from '../motion';
import type { ResultadoEncaixe, SugestaoEncaixe as Sugestao } from '../../services/encaixe';

export interface SugestaoEncaixeProps {
  resultado: ResultadoEncaixe | 'carregando';
  onEscolher: (sugestao: Sugestao) => void;
  /** Padrão "Encaixe perto de onde você já vai estar". */
  titulo?: string;
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export function SugestaoEncaixe({ resultado, onEscolher, titulo }: SugestaoEncaixeProps) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  const cabecalho = (
    <View style={styles.cabecalho}>
      <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={cores.accentLight} />
      <Text style={styles.titulo}>{titulo ?? 'Encaixe perto de onde você já vai estar'}</Text>
    </View>
  );

  if (resultado === 'carregando') {
    return (
      <View style={styles.caixa} accessible accessibilityLabel="Calculando horários de encaixe">
        {cabecalho}
        <Skeleton height={52} radius={BorderRadius.md} style={styles.esqueleto} />
        <Skeleton height={52} radius={BorderRadius.md} style={styles.esqueleto} />
      </View>
    );
  }

  if (!resultado.ok) {
    return (
      <Aparecer style={styles.caixa}>
        {cabecalho}
        <Text style={styles.vazio}>
          Cadastre o CEP ou o endereço do cliente para ver horários perto das suas outras visitas.
        </Text>
      </Aparecer>
    );
  }

  const { sugestoes, visitasConsideradas, visitasSemLocalizacao } = resultado;
  const foraDaConta =
    visitasSemLocalizacao > 0
      ? `${plural(visitasSemLocalizacao, 'visita sem localização ficou', 'visitas sem localização ficaram')} de fora da conta.`
      : null;

  return (
    <Aparecer style={styles.caixa}>
      {cabecalho}
      {sugestoes.length === 0 ? (
        <Text style={styles.vazio}>
          {visitasConsideradas === 0
            ? 'Nenhuma visita com localização nos próximos 7 dias para comparar.'
            : 'Nenhum horário livre perto das suas visitas nos próximos 7 dias.'}
        </Text>
      ) : (
        sugestoes.map((s, i) => (
          <Aparecer key={s.inicio} indice={i + 1}>
            <PressableAnimado
              onPress={() => onEscolher(s)}
              haptic="selection"
              accessibilityLabel={`Encaixar ${s.quando}, ${s.motivo}`}
              style={styles.linha}
            >
              <View style={styles.linhaTexto}>
                <Text style={styles.quando} numberOfLines={1}>
                  Encaixar {s.quando}
                </Text>
                <Text style={styles.motivo} numberOfLines={2}>
                  {s.ancora.posicao === 'depois' ? 'Logo depois' : 'Logo antes'}: {s.motivo}
                </Text>
              </View>
              <MaterialCommunityIcons name="calendar-check-outline" size={20} color={cores.accentLight} />
            </PressableAnimado>
          </Aparecer>
        ))
      )}
      {foraDaConta ? <Text style={styles.nota}>{foraDaConta}</Text> : null}
      {sugestoes.length > 0 ? (
        <Text style={styles.nota}>Distância em linha reta entre os endereços. Confirme o trajeto antes de marcar.</Text>
      ) : null}
    </Aparecer>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    caixa: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.outline,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    cabecalho: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    titulo: { color: c.onSurface, fontSize: 14, fontWeight: '800', flexShrink: 1 },
    esqueleto: { marginTop: Spacing.xs },
    vazio: { color: c.onSurfaceVariant, fontSize: 13, lineHeight: 18 },
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.md,
      minHeight: 52,
      borderRadius: BorderRadius.md,
      backgroundColor: comAlfa(c.accentLight, 0.08),
      borderWidth: 1,
      borderColor: comAlfa(c.accentLight, 0.25),
    },
    linhaTexto: { flex: 1 },
    quando: { color: c.onSurface, fontSize: 14, fontWeight: '700' },
    motivo: { color: c.onSurfaceVariant, fontSize: 12, marginTop: 2 },
    nota: { color: c.onSurfaceMuted, fontSize: 11, lineHeight: 15 },
  });
