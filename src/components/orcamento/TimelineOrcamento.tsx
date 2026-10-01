import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { BorderRadius, Spacing, comAlfa, textoSobre, useCores, useEstilos, type Cores } from '../../theme';
import { MOLA, atrasoEscalonado, useReduzirMovimento } from '../../theme/motion';
import { Aparecer } from '../motion/Aparecer';
import { PressableAnimado } from '../motion/PressableAnimado';
import { formatDateTime } from '../../utils/date';
import { formatarDataBR } from '../../utils/formatarData';
import type { EtapaLinhaDoTempo, LeituraLink, TomEtapa } from './linhaDoTempo';

interface Props {
  etapas: EtapaLinhaDoTempo[];
  leituraLink: LeituraLink;
  aoTentarDeNovo: () => void;
}

/** Data/hora quando a fonte tem hora; só o dia quando ela só tem o dia. */
function quando(em?: string): string {
  if (!em) return '';
  return em.includes('T') || / \d{2}:\d{2}/.test(em) ? formatDateTime(em) : formatarDataBR(em);
}

/**
 * Linha do tempo do orçamento (item 2.10): criado → enviado → visualizado →
 * aprovação → pago. Quem decide o estado de cada etapa é `montarLinhaDoTempo`
 * (puro); aqui só se desenha.
 *
 * Movimento: as linhas entram escalonadas (`Aparecer`) e o marcador da etapa
 * ATUAL assenta com a mola `bouncy` uma vez — sem pulsar em loop. "Reduzir
 * movimento" mostra tudo no lugar.
 */
export function TimelineOrcamento({ etapas, leituraLink, aoTentarDeNovo }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View accessibilityRole="list">
      {etapas.map((etapa, i) => (
        <Aparecer key={etapa.chave} indice={i}>
          <LinhaEtapa
            etapa={etapa}
            indice={i}
            ultima={i === etapas.length - 1}
            proximaFeita={etapas[i + 1]?.estado === 'feito'}
          />
        </Aparecer>
      ))}
      {leituraLink === 'erro' ? (
        <View style={styles.aviso}>
          <MaterialCommunityIcons name="cloud-alert-outline" size={20} color={cores.warning} />
          <Text style={styles.avisoTexto}>
            Não deu para consultar o link do cliente agora. Visualização e resposta podem estar desatualizadas.
          </Text>
          <PressableAnimado onPress={aoTentarDeNovo} haptic="light" hitSlop={8} accessibilityLabel="Tentar consultar o link de novo">
            <Text style={styles.avisoAcao}>Tentar de novo</Text>
          </PressableAnimado>
        </View>
      ) : null}
    </View>
  );
}

function corDoTom(tom: TomEtapa, c: Cores): string {
  switch (tom) {
    case 'sucesso': return c.success;
    case 'perigo': return c.danger;
    case 'aviso': return c.warning;
    default: return c.accentLight;
  }
}

function LinhaEtapa({ etapa, indice, ultima, proximaFeita }: {
  etapa: EtapaLinhaDoTempo;
  indice: number;
  ultima: boolean;
  proximaFeita: boolean;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const cor = etapa.estado === 'interrompido' && etapa.tom === 'neutro' ? cores.onSurfaceVariant : corDoTom(etapa.tom, cores);
  const atual = etapa.estado === 'atual';

  // Marcador da etapa atual: assenta com mola uma vez (0.6 → 1). Nada em loop.
  const escala = useSharedValue(atual && !reduzir ? 0.6 : 1);
  useEffect(() => {
    if (!atual || reduzir) {
      cancelAnimation(escala);
      escala.set(1);
      return;
    }
    escala.set(withDelay(atrasoEscalonado(indice, false), withSpring(1, MOLA.bouncy)));
    return () => cancelAnimation(escala);
  }, [atual, reduzir, indice, escala]);
  const estiloMarcador = useAnimatedStyle(() => ({ transform: [{ scale: escala.get() }] }));

  const data = quando(etapa.em);
  const feito = etapa.estado === 'feito';
  const rotuloAcessivel = [
    etapa.rotulo,
    feito ? 'concluído' : atual ? 'próximo passo' : etapa.estado === 'interrompido' ? 'encerrado' : etapa.estado === 'sem_registro' ? 'sem registro' : 'pendente',
    data,
    etapa.detalhe,
  ].filter(Boolean).join(', ');

  return (
    <View style={styles.linha} accessible accessibilityLabel={rotuloAcessivel}>
      <View style={styles.trilho}>
        <Animated.View
          style={[
            styles.marcador,
            feito || etapa.estado === 'interrompido'
              ? { backgroundColor: cor, borderColor: cor }
              : atual
                ? { borderColor: cor, backgroundColor: comAlfa(cor, 0.14) }
                : etapa.estado === 'sem_registro'
                  ? { borderColor: cores.outline, borderStyle: 'dashed' }
                  : { borderColor: cores.outline },
            estiloMarcador,
          ]}
        >
          {feito ? <MaterialCommunityIcons name="check" size={13} color={textoSobre(cor)} /> : null}
          {etapa.estado === 'interrompido' ? <MaterialCommunityIcons name="close" size={13} color={textoSobre(cor)} /> : null}
          {atual ? <View style={[styles.miolo, { backgroundColor: cor }]} /> : null}
          {etapa.estado === 'sem_registro' ? <MaterialCommunityIcons name="minus" size={13} color={cores.onSurfaceVariant} /> : null}
        </Animated.View>
        {!ultima ? (
          <View style={[styles.fio, feito && proximaFeita && { backgroundColor: comAlfa(cor, 0.55) }]} />
        ) : null}
      </View>
      <View style={[styles.corpo, !ultima && styles.corpoComFio]}>
        <View style={styles.cabeca}>
          <Text
            style={[
              styles.rotulo,
              !feito && !atual && styles.rotuloApagado,
              atual && { color: cores.onSurface },
              etapa.tom === 'perigo' && { color: cores.danger },
            ]}
          >
            {etapa.rotulo}
          </Text>
          {data ? <Text style={styles.data}>{data}</Text> : null}
        </View>
        {etapa.detalhe ? (
          <Text style={[styles.detalhe, etapa.tom === 'aviso' && { color: cores.warning }]}>{etapa.detalhe}</Text>
        ) : null}
      </View>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    linha: { flexDirection: 'row', gap: 12 },
    trilho: { width: 24, alignItems: 'center' },
    marcador: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    miolo: { width: 8, height: 8, borderRadius: 4 },
    fio: { width: 2, flex: 1, minHeight: 14, backgroundColor: c.outline, marginVertical: 2, borderRadius: 1 },
    corpo: { flex: 1, paddingTop: 1 },
    corpoComFio: { paddingBottom: 14 },
    cabeca: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    rotulo: { fontSize: 14.5, fontWeight: '700', color: c.onSurface, flexShrink: 1 },
    rotuloApagado: { color: c.onSurfaceVariant, fontWeight: '600' },
    data: { fontSize: 12, color: c.onSurfaceVariant },
    detalhe: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
    aviso: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: Spacing.md,
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      backgroundColor: comAlfa(c.warning, 0.1),
      borderWidth: 1,
      borderColor: comAlfa(c.warning, 0.3),
    },
    avisoTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 17 },
    avisoAcao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  });
