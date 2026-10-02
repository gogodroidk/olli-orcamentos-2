/**
 * LUCRO REAL DA VISITA na OS concluída (Onda I4, jogada 11).
 *
 * Faixa verde ("Sobrou R$ 292 (65%)") ou vermelha (prejuízo), com a conta
 * inteira em 1 frase — derivada de `textoLucro`, nunca escrita à mão. Faltou
 * dado → faixa neutra dizendo O QUE falta e onde completar; lucro parcial nunca
 * aparece como se fosse o lucro.
 *
 * Gate: recurso `relatorios` (Pro) + permissão de ver valores (o técnico da
 * equipe não vê dinheiro agregado). Leitura do banco em 3 estados.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { useRecursoPlano } from '../RecursoPlano';
import { DicaContextual } from '../DicaContextual';
import { Aparecer } from '../motion/Aparecer';
import { PressableAnimado } from '../motion/PressableAnimado';
import { Skeleton } from '../motion/Skeleton';
import { RecursoTrancado } from './RecursoTrancado';
import { carregarContextoLucro, lucroDaOS } from '../../services/lucroMes';
import {
  ondeCompletar,
  textoFalta,
  textoIncompleto,
  textoLucro,
  type FaltaLucro,
  type ResultadoLucro,
} from '../../services/lucroVisita';
import type { OrdemServico } from '../../types';

interface Props {
  ordem: OrdemServico;
  /** Abre Meu negócio (custo por km, comissão, ponto de saída). */
  onAbrirMeuNegocio: () => void;
}

type Estado = 'carregando' | 'erro' | ResultadoLucro;

export function LucroVisitaFaixa({ ordem, onAbrirMeuNegocio }: Props) {
  const { estado: plano } = useRecursoPlano('relatorios');
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [estado, setEstado] = useState<Estado>('carregando');

  const calcular = useCallback(async () => {
    setEstado('carregando');
    try {
      const ctx = await carregarContextoLucro(ordem.orcamentoId ? [ordem.orcamentoId] : []);
      setEstado(lucroDaOS(ordem, ctx));
    } catch {
      setEstado('erro');
    }
  }, [ordem]);

  useEffect(() => {
    if (plano === 'liberado') void calcular();
  }, [plano, calcular]);

  if (plano !== 'liberado') {
    return (
      <RecursoTrancado
        recurso="relatorios"
        titulo="Lucro real da visita"
        beneficio="Veja quanto sobrou deste serviço depois do material, do deslocamento e da comissão."
      />
    );
  }

  if (estado === 'carregando') {
    return (
      <View style={styles.faixa} accessibilityLabel="Calculando o lucro da visita">
        <Skeleton width="45%" height={14} />
        <Skeleton width="90%" height={12} style={{ marginTop: 6 }} />
      </View>
    );
  }

  if (estado === 'erro') {
    return (
      <View style={styles.faixa}>
        <Text style={styles.rotulo}>LUCRO REAL DA VISITA</Text>
        <Text style={styles.texto}>Não consegui calcular o lucro agora.</Text>
        <PressableAnimado onPress={() => void calcular()} haptic="selection" hitSlop={8} accessibilityLabel="Calcular o lucro de novo">
          <Text style={styles.acao}>Tentar de novo</Text>
        </PressableAnimado>
      </View>
    );
  }

  if (estado.estado === 'incompleto') {
    const precisaNegocio = estado.faltas.some((f: FaltaLucro) => ondeCompletar(f) === 'meu_negocio');
    return (
      <Aparecer>
        <View style={styles.faixa}>
          <View style={styles.linha}>
            <MaterialCommunityIcons name="calculator-variant-outline" size={16} color={cores.onSurfaceVariant} />
            <Text style={styles.rotulo}>LUCRO REAL DA VISITA</Text>
          </View>
          <Text style={styles.titulo}>{textoIncompleto(estado.faltas)}</Text>
          {estado.faltas.map((f) => (
            <Text key={f.tipo} style={styles.texto}>• {textoFalta(f)}</Text>
          ))}
          {precisaNegocio ? (
            <PressableAnimado onPress={onAbrirMeuNegocio} haptic="selection" hitSlop={8} accessibilityLabel="Completar os custos em Meu negócio">
              <Text style={styles.acao}>Completar em Meu negócio</Text>
            </PressableAnimado>
          ) : null}
        </View>
      </Aparecer>
    );
  }

  const positivo = estado.sobrou >= 0;
  const cor = positivo ? cores.success : cores.danger;
  return (
    <Aparecer>
      <View style={[styles.faixa, { borderColor: comAlfa(cor, 0.45), backgroundColor: comAlfa(cor, 0.1) }]}>
        <View style={styles.linha}>
          <MaterialCommunityIcons name={positivo ? 'trending-up' : 'trending-down'} size={16} color={cor} />
          <Text style={[styles.rotulo, { color: cor }]}>{positivo ? 'SOBROU DE VERDADE' : 'ESTA VISITA DEU PREJUÍZO'}</Text>
        </View>
        <Text style={styles.texto} accessibilityLiveRegion="polite">{textoLucro(estado)}</Text>
        <Text style={styles.nota}>Deslocamento é estimativa (distância em linha reta × 1,4, ida e volta), sem trânsito.</Text>
      </View>
      <DicaContextual
        id="lucro.primeira-os"
        icon="cash-check"
        texto="Esse é o quanto sobrou de verdade. Ajuste o custo por km e a comissão em Meu negócio para ficar exato."
      />
    </Aparecer>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    faixa: {
      backgroundColor: c.surfaceGlass,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: c.outlineDark,
      padding: Spacing.md,
      gap: 4,
    },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rotulo: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: c.onSurfaceVariant },
    titulo: { fontSize: 14, fontWeight: '700', color: c.onSurface },
    texto: { fontSize: 13, lineHeight: 19, color: c.onSurface },
    nota: { fontSize: 11, lineHeight: 15, color: c.onSurfaceMuted, marginTop: 2 },
    acao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight, marginTop: 4 },
  });
