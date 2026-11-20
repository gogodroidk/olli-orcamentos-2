/**
 * "QUANTO SOBROU NO MÊS" (Onda I4 · Lucro real) — Painel e Meu negócio.
 *
 * Soma o que sobrou das visitas concluídas no mês (OS concluídas + visitas da
 * agenda ligadas a orçamento, sem contar duas vezes — `services/lucroMes.ts`).
 * Só entra na soma o serviço com TODOS os custos conhecidos; os outros aparecem
 * contados à parte ("2 serviços sem dados"), nunca somados como zero.
 *
 * Gate: recurso `relatorios` (Pro). Quem chama já garante a permissão de ver
 * valores (o técnico da equipe não vê dinheiro agregado).
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, useCores, useEstilos, sombrasDe, type Cores } from '../../theme';
import { CartaoRecursoPlano, useRecursoPlano } from '../RecursoPlano';
import { DicaContextual } from '../DicaContextual';
import { Aparecer, ContadorAnimado, PressableAnimado, Skeleton } from '../motion';
import { resumoLucroDoMes } from '../../services/lucroMes';
import { reais, textoFalta, type ResumoMes } from '../../services/lucroVisita';

interface Props {
  /** Abre Meu negócio para completar custos (some quando já está nele). */
  onCompletar?: () => void;
}

type Estado = 'carregando' | 'erro' | ResumoMes;

export function QuantoSobrouCard({ onCompletar }: Props) {
  const { estado: plano } = useRecursoPlano('relatorios');
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [estado, setEstado] = useState<Estado>('carregando');

  const carregar = useCallback(async () => {
    try {
      setEstado(await resumoLucroDoMes());
    } catch {
      setEstado('erro');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (plano === 'liberado') void carregar();
    }, [plano, carregar]),
  );

  if (plano !== 'liberado') {
    return (
      <CartaoRecursoPlano
        recurso="relatorios"
        titulo="Quanto sobrou no mês"
        beneficio="Veja quanto sobrou de verdade de cada serviço, depois do material, do deslocamento e da comissão."
      />
    );
  }

  if (estado === 'carregando') {
    return (
      <View style={styles.card} accessibilityLabel="Calculando quanto sobrou no mês">
        <Skeleton width="40%" height={12} />
        <Skeleton width="55%" height={26} style={{ marginTop: 8 }} />
        <Skeleton width="80%" height={12} style={{ marginTop: 8 }} />
      </View>
    );
  }

  if (estado === 'erro') {
    return (
      <View style={styles.card}>
        <Text style={styles.rotulo}>QUANTO SOBROU NO MÊS</Text>
        <Text style={styles.texto}>Não consegui somar o mês agora.</Text>
        <PressableAnimado onPress={() => { setEstado('carregando'); void carregar(); }} haptic="selection" hitSlop={8} accessibilityLabel="Somar o mês de novo">
          <Text style={styles.acao}>Tentar de novo</Text>
        </PressableAnimado>
      </View>
    );
  }

  const r = estado;
  const totalServicos = r.completas + r.incompletas.length;
  const positivo = r.sobrou >= 0;
  const primeiraFalta = r.incompletas.find((v) => v.resultado.estado === 'incompleto');

  return (
    <Aparecer>
      <View style={styles.card}>
        <View style={styles.linha}>
          <MaterialCommunityIcons name="cash-check" size={16} color={cores.accentLight} />
          <Text style={styles.rotulo}>QUANTO SOBROU NO MÊS</Text>
        </View>

        {totalServicos === 0 ? (
          <Text style={styles.texto}>Nenhum serviço concluído neste mês ainda. Ao concluir, eu mostro quanto sobrou de cada um.</Text>
        ) : r.completas === 0 ? (
          <Text style={styles.texto}>
            Ainda não dá para somar: {r.incompletas.length === 1 ? 'o serviço do mês está' : `os ${r.incompletas.length} serviços do mês estão`} sem algum custo.
            {primeiraFalta && primeiraFalta.resultado.estado === 'incompleto' && primeiraFalta.resultado.faltas[0]
              ? ` ${textoFalta(primeiraFalta.resultado.faltas[0])}`
              : ''}
          </Text>
        ) : (
          <>
            <ContadorAnimado
              valor={r.sobrou}
              formato="brl"
              style={[styles.valor, { color: positivo ? cores.success : cores.danger }]}
            />
            <Text style={styles.texto}>
              de {reais(r.cobrado)} cobrados em {r.completas} {r.completas === 1 ? 'serviço' : 'serviços'}
              {r.margem !== null ? ` (${Math.round(r.margem * 100)}% ficou com você)` : ''}.
            </Text>
            {r.melhores.length > 0 ? (
              <View style={styles.lista}>
                <Text style={styles.subtitulo}>Mais deixaram dinheiro</Text>
                {r.melhores.map((v) => (
                  <Text key={v.id} style={styles.item} numberOfLines={1}>
                    {v.titulo || v.clienteNome} · {reais(v.resultado.sobrou)}
                  </Text>
                ))}
              </View>
            ) : null}
            {r.prejuizo.length > 0 ? (
              <View style={styles.lista}>
                <Text style={[styles.subtitulo, { color: cores.danger }]}>Deram prejuízo</Text>
                {r.prejuizo.map((v) => (
                  <Text key={v.id} style={styles.item} numberOfLines={1}>
                    {v.titulo || v.clienteNome} · {reais(v.resultado.sobrou)}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        )}

        {r.incompletas.length > 0 && r.completas > 0 ? (
          <Text style={styles.nota}>
            {r.incompletas.length} {r.incompletas.length === 1 ? 'serviço ficou' : 'serviços ficaram'} fora da soma por falta de custo.
          </Text>
        ) : null}
        <Text style={styles.nota}>Preço − material − deslocamento (estimativa, sem trânsito) − comissão.</Text>
        {r.incompletas.length > 0 && onCompletar ? (
          <PressableAnimado onPress={onCompletar} haptic="selection" hitSlop={8} accessibilityLabel="Completar os custos em Meu negócio">
            <Text style={styles.acao}>Completar custos</Text>
          </PressableAnimado>
        ) : null}
      </View>
      <DicaContextual
        id="painel.quanto-sobrou"
        icon="cash-check"
        texto="Faturar não é lucrar. Aqui fica o que sobra depois do material, do combustível e da comissão."
      />
    </Aparecer>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.base,
      gap: 4,
      ...sombrasDe(c).sm,
    },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rotulo: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6, color: c.onSurfaceVariant },
    valor: { fontSize: 28, fontWeight: '800', marginTop: 2 },
    texto: { fontSize: 13, lineHeight: 19, color: c.onSurface },
    lista: { marginTop: Spacing.sm, gap: 2 },
    subtitulo: { fontSize: 12, fontWeight: '800', color: c.onSurfaceVariant },
    item: { fontSize: 12.5, color: c.onSurface },
    nota: { fontSize: 13, lineHeight: 17, color: c.onSurfaceMuted, marginTop: 4 },
    acao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight, marginTop: 4 },
  });
