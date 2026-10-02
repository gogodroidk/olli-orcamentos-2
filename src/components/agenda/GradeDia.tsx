import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { isSameDay } from 'date-fns';
import { BorderRadius, Spacing, textoSobre, useCores, useEstilos, type Cores } from '../../theme';
import { DURACAO, MOLA, useReduzirMovimento } from '../../theme/motion';
import { PressableAnimado } from '../motion';
import { vibrar } from '../../utils/haptico';
import { duracaoEstimadaMin, semHoraMarcada } from '../../utils/agendaDominio';
import {
  MINUTOS_SNAP, faixaDeHoras, inicioArrastado, layoutDoDia, minutosParaHHMM, type BlocoDia,
} from '../../utils/agendaVisual';
import type { OcorrenciaAgendamento } from '../../utils/contratoRecorrente';

/** Altura de uma hora na grade (dp). 15 min = 16 dp: dá para mirar com o dedo. */
const PX_HORA = 64;
const PX_PASSO = (PX_HORA * MINUTOS_SNAP) / 60;
const COLUNA_HORAS = 50;
const ALTURA_MIN_BLOCO = 30;

interface Props {
  dia: Date;
  /** Itens do dia, já filtrados (com e sem hora). */
  itens: OcorrenciaAgendamento[];
  corDe: (item: OcorrenciaAgendamento) => string;
  onAbrir: (item: OcorrenciaAgendamento) => void;
  /** Soltou o bloco em outro horário. Resolve `true` se remarcou (a lista recarrega). */
  onRemarcar: (item: OcorrenciaAgendamento, novoInicioMin: number) => Promise<boolean>;
  podeArrastar: (item: OcorrenciaAgendamento) => boolean;
  refreshControl?: React.ReactElement<any>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  paddingInferior: number;
  /** Conteúdo acima da grade, dentro da mesma rolagem (ex.: o cartão de clima das próximas visitas). */
  cabecalho?: React.ReactNode;
}

/**
 * VISÃO DIA — grade de horas (estilo calendário do iPhone) com a linha vermelha do
 * "agora". Segurar um compromisso e arrastar remarca no MESMO dia, com encaixe de
 * 15 em 15 min, um toque de vibração a cada passo e a confirmação de quem chama
 * (`onRemarcar`). Só transform/opacity animam; a posição real vem do horário
 * gravado depois de salvar.
 */
export function GradeDia({ dia, itens, corDe, onAbrir, onRemarcar, podeArrastar, refreshControl, onScroll, paddingInferior, cabecalho }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const scrollRef = useRef<ScrollView>(null);
  const [largura, setLargura] = useState(0);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const diaTodo = useMemo(() => itens.filter((a) => semHoraMarcada(a)), [itens]);
  const comHora = useMemo(() => itens.filter((a) => !semHoraMarcada(a)), [itens]);
  const blocos = useMemo(() => layoutDoDia(comHora, dia, duracaoEstimadaMin), [comHora, dia]);

  // "Agora": atualiza a cada minuto só quando o dia é hoje (um timer, não animação em loop).
  const ehHoje = isSameDay(dia, new Date());
  const [agoraMin, setAgoraMin] = useState(() => minutosDeAgora());
  useEffect(() => {
    if (!ehHoje) return;
    setAgoraMin(minutosDeAgora());
    const t = setInterval(() => setAgoraMin(minutosDeAgora()), 60_000);
    return () => clearInterval(t);
  }, [ehHoje]);

  const { de, ate } = useMemo(() => faixaDeHoras(blocos, ehHoje ? agoraMin : null), [blocos, ehHoje, agoraMin]);
  const alturaGrade = (ate - de) * PX_HORA;
  const yDe = useCallback((min: number) => ((min - de * 60) / 60) * PX_HORA, [de]);

  // Abre já no ponto útil: o "agora" (hoje) ou o 1º compromisso. Uma vez por dia.
  // O que fica acima da grade (cabeçalho + "Dia todo") entra na conta: espera a
  // 1ª medida dele para o "agora" continuar no mesmo ponto da tela.
  const [alturaTopo, setAlturaTopo] = useState<number | null>(null);
  const diaChave = `${dia.getFullYear()}-${dia.getMonth()}-${dia.getDate()}`;
  const rolouPara = useRef<string | null>(null);
  useEffect(() => {
    if (rolouPara.current === diaChave || alturaTopo === null) return;
    rolouPara.current = diaChave;
    const alvo = ehHoje ? agoraMin : blocos[0]?.iniMin ?? 8 * 60;
    const y = Math.max(0, alturaTopo + yDe(alvo) - PX_HORA * 0.75);
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(t);
  }, [diaChave, ehHoje, agoraMin, blocos, yDe, alturaTopo]);

  const horas = useMemo(() => Array.from({ length: ate - de + 1 }, (_, i) => de + i), [de, ate]);
  const larguraArea = Math.max(0, largura - COLUNA_HORAS - 6);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: paddingInferior }}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      scrollEnabled={arrastando === null}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View onLayout={(e: LayoutChangeEvent) => {
        const h = e.nativeEvent.layout.height;
        setAlturaTopo((a) => (a === null ? h : a));
      }}>
        {cabecalho}
        {diaTodo.length > 0 ? (
          <View style={styles.diaTodoLinha}>
            <Text style={styles.diaTodoRotulo}>Dia todo</Text>
            <View style={{ flex: 1, gap: 6 }}>
              {diaTodo.map((a) => (
                <PressableAnimado
                  key={a.id}
                  style={[styles.diaTodoChip, { borderLeftColor: corDe(a) }]}
                  onPress={() => onAbrir(a)}
                  haptic="selection"
                  accessibilityLabel={`${a.titulo}, dia todo, ${a.clienteNome}`}
                >
                  <Text style={[styles.blocoTitulo, a.status === 'cancelado' && styles.riscado]} numberOfLines={1}>{a.titulo}</Text>
                  <Text style={styles.blocoSub} numberOfLines={1}>{a.clienteNome}</Text>
                </PressableAnimado>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <View style={{ height: alturaGrade + 12 }} onLayout={(e: LayoutChangeEvent) => setLargura(e.nativeEvent.layout.width)}>
        {horas.map((h) => (
          <View key={h} style={[styles.linhaHora, { top: (h - de) * PX_HORA }]} pointerEvents="none">
            <Text style={styles.rotuloHora}>{`${String(h % 24).padStart(2, '0')}:00`}</Text>
            <View style={styles.fio} />
          </View>
        ))}

        {ehHoje && agoraMin >= de * 60 && agoraMin <= ate * 60 ? (
          <View style={[styles.agora, { top: yDe(agoraMin) }]} pointerEvents="none" accessibilityLabel={`Agora, ${minutosParaHHMM(agoraMin)}`}>
            <View style={[styles.agoraBolinha, { backgroundColor: cores.danger }]} />
            <View style={[styles.agoraFio, { backgroundColor: cores.danger }]} />
          </View>
        ) : null}

        {larguraArea > 0 && blocos.map((b) => {
          const w = larguraArea / b.colunas;
          return (
            <BlocoArrastavel
              key={b.item.id}
              bloco={b}
              top={yDe(b.iniMin) + 1}
              altura={Math.max(ALTURA_MIN_BLOCO, ((b.fimMin - b.iniMin) / 60) * PX_HORA - 2)}
              left={COLUNA_HORAS + 6 + b.coluna * w}
              largura={w - 3}
              cor={corDe(b.item)}
              arrastavel={podeArrastar(b.item)}
              elevado={arrastando === b.item.id}
              onAbrir={onAbrir}
              onRemarcar={onRemarcar}
              onArrasto={setArrastando}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

function minutosDeAgora(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function BlocoArrastavel({
  bloco, top, altura, left, largura, cor, arrastavel, elevado, onAbrir, onRemarcar, onArrasto,
}: {
  bloco: BlocoDia<OcorrenciaAgendamento>;
  top: number;
  altura: number;
  left: number;
  largura: number;
  cor: string;
  arrastavel: boolean;
  elevado: boolean;
  onAbrir: (item: OcorrenciaAgendamento) => void;
  onRemarcar: (item: OcorrenciaAgendamento, novoInicioMin: number) => Promise<boolean>;
  onArrasto: (id: string | null) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const { item, iniMin, fimMin } = bloco;
  const duracao = fimMin - iniMin;
  const dy = useSharedValue(0);
  const ativo = useSharedValue(0);
  const passoAtual = useSharedValue(0);
  const [previa, setPrevia] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // A posição nova chega pelo `top` depois de salvar: o deslocamento do gesto zera.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o disparo É a mudança de `top` (horário novo gravado).
  useEffect(() => { dy.set(0); }, [top, dy]);

  // Limites do gesto em passos de 15 min: o compromisso não sai do próprio dia.
  const passosMin = -Math.floor(iniMin / MINUTOS_SNAP);
  const passosMax = Math.floor((24 * 60 - Math.max(MINUTOS_SNAP, duracao) - iniMin) / MINUTOS_SNAP);

  const novoInicio = useCallback((passos: number) => inicioArrastado(iniMin, passos * PX_PASSO, PX_HORA, duracao), [iniMin, duracao]);

  const comecou = useCallback(() => {
    vibrar('medio');
    onArrasto(item.id);
    setPrevia(`${minutosParaHHMM(iniMin)}–${minutosParaHHMM(iniMin + duracao)}`);
  }, [item.id, iniMin, duracao, onArrasto]);

  const mudouPasso = useCallback((passos: number) => {
    vibrar('selecao');
    const ini = novoInicio(passos);
    setPrevia(`${minutosParaHHMM(ini)}–${minutosParaHHMM(ini + duracao)}`);
  }, [novoInicio, duracao]);

  const soltou = useCallback(async (passos: number) => {
    onArrasto(null);
    setPrevia(null);
    const ini = novoInicio(passos);
    if (passos === 0 || ini === iniMin) {
      dy.set(reduzir ? 0 : withSpring(0, MOLA.snappy));
      return;
    }
    setSalvando(true);
    let ok = false;
    try {
      ok = await onRemarcar(item, ini);
    } catch {
      ok = false;
    } finally {
      setSalvando(false);
    }
    // Não remarcou (cancelou ou falhou): volta para o lugar de antes.
    if (!ok) dy.set(reduzir ? 0 : withSpring(0, MOLA.snappy));
  }, [novoInicio, iniMin, onRemarcar, item, dy, reduzir, onArrasto]);

  const abrir = useCallback(() => onAbrir(item), [onAbrir, item]);

  const pan = Gesture.Pan()
    .enabled(arrastavel && !salvando)
    .activateAfterLongPress(320)
    .onStart(() => {
      passoAtual.set(0);
      ativo.set(reduzir ? 1 : withTiming(1, { duration: DURACAO.fast }));
      scheduleOnRN(comecou);
    })
    .onUpdate((e) => {
      const passos = Math.min(passosMax, Math.max(passosMin, Math.round(e.translationY / PX_PASSO)));
      dy.set(passos * PX_PASSO);
      if (passos !== passoAtual.get()) {
        passoAtual.set(passos);
        scheduleOnRN(mudouPasso, passos);
      }
    })
    .onEnd(() => {
      scheduleOnRN(soltou, passoAtual.get());
    })
    .onFinalize(() => {
      ativo.set(reduzir ? 0 : withTiming(0, { duration: DURACAO.fast }));
    });

  const tap = Gesture.Tap()
    .maxDuration(300)
    .onEnd((_e, terminou) => {
      if (terminou) scheduleOnRN(abrir);
    });

  const gesto = Gesture.Race(pan, tap);

  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateY: dy.get() }, { scale: 1 + ativo.get() * 0.03 }],
    opacity: 1 - ativo.get() * 0.06,
  }));

  const cancelado = item.status === 'cancelado';
  const concluido = item.status === 'concluido';
  const compacto = altura < 48;
  const descricaoA11y = `${item.titulo}, ${minutosParaHHMM(iniMin)} às ${minutosParaHHMM(fimMin)}, ${item.clienteNome}${item.responsavelNome ? `, com ${item.responsavelNome}` : ''}${concluido ? ', concluído' : cancelado ? ', cancelado' : ''}`;

  return (
    <GestureDetector gesture={gesto}>
      <Animated.View
        style={[
          styles.bloco,
          { top, height: altura, left, width: largura, borderLeftColor: cor, backgroundColor: cor + (cancelado ? '12' : '24') },
          (concluido || cancelado) && { opacity: 0.62 },
          elevado && styles.blocoElevado,
          estilo,
        ]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={descricaoA11y}
        accessibilityHint={arrastavel ? 'Toque para abrir. Use as ações para mover 15 minutos.' : 'Toque para abrir.'}
        accessibilityActions={arrastavel
          ? [{ name: 'activate' }, { name: 'increment', label: '15 minutos mais tarde' }, { name: 'decrement', label: '15 minutos mais cedo' }]
          : [{ name: 'activate' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'activate') onAbrir(item);
          else if (e.nativeEvent.actionName === 'increment') void onRemarcar(item, novoInicio(1));
          else if (e.nativeEvent.actionName === 'decrement') void onRemarcar(item, novoInicio(-1));
        }}
      >
        <View style={styles.blocoLinha}>
          <Text style={[styles.blocoTitulo, cancelado && styles.riscado, { flex: 1 }]} numberOfLines={compacto ? 1 : 2}>
            {item.titulo}
          </Text>
          {concluido ? <MaterialCommunityIcons name="check-circle" size={14} color={cores.success} /> : null}
          {item.recorrencia ? <MaterialCommunityIcons name="repeat" size={13} color={cores.onSurfaceVariant} /> : null}
        </View>
        {!compacto ? (
          <Text style={styles.blocoSub} numberOfLines={1}>
            {`${minutosParaHHMM(iniMin)}–${minutosParaHHMM(fimMin)} · ${item.clienteNome}`}
          </Text>
        ) : null}
        {previa ? (
          <View style={[styles.previa, { backgroundColor: cor }]} pointerEvents="none">
            <Text style={[styles.previaTexto, { color: textoSobre(cor) }]}>{previa}</Text>
          </View>
        ) : null}
        {salvando ? (
          <View style={styles.salvando} pointerEvents="none">
            <MaterialCommunityIcons name="clock-outline" size={12} color={cores.onSurfaceVariant} />
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  diaTodoLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: c.outline },
  diaTodoRotulo: { width: COLUNA_HORAS, fontSize: 11, fontWeight: '800', color: c.onSurfaceMuted, paddingTop: 8 },
  diaTodoChip: { backgroundColor: c.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, borderLeftWidth: 4, paddingHorizontal: 10, paddingVertical: 6 },
  linhaHora: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', height: 14, marginTop: -7 },
  rotuloHora: { width: COLUNA_HORAS, fontSize: 11, fontWeight: '700', color: c.onSurfaceMuted },
  fio: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.outline },
  agora: { position: 'absolute', left: COLUNA_HORAS - 4, right: 0, flexDirection: 'row', alignItems: 'center', height: 10, marginTop: -5, zIndex: 5 },
  agoraBolinha: { width: 10, height: 10, borderRadius: 5 },
  agoraFio: { flex: 1, height: 2 },
  bloco: {
    position: 'absolute', borderRadius: BorderRadius.md, borderLeftWidth: 4, borderWidth: 1, borderColor: c.outline,
    paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden', zIndex: 2,
  },
  blocoElevado: { zIndex: 10, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 14 },
  blocoLinha: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blocoTitulo: { fontSize: 13, fontWeight: '800', color: c.onSurface },
  blocoSub: { fontSize: 11.5, color: c.onSurfaceVariant, marginTop: 1 },
  riscado: { textDecorationLine: 'line-through', color: c.onSurfaceMuted },
  previa: { position: 'absolute', right: 4, top: 4, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  previaTexto: { fontSize: 11, fontWeight: '900' },
  salvando: { position: 'absolute', right: 4, bottom: 4 },
});
