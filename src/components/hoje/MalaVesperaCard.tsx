/**
 * MALA DA VÉSPERA no Hoje (Onda I4, jogada 7) — a partir das 19h.
 *
 * "Para amanhã, separe:" com caixinha em cada item e [Compartilhar lista] (o
 * prestador manda ao ajudante pelo app que quiser — nada sai sozinho). Embaixo,
 * por visita, de onde veio cada item (orçamento ou kit usual do ofício) e o
 * aviso honesto "Sem dados para sugerir material desta visita".
 *
 * Fica em silêncio antes das 19h e quando não há visita amanhã (sinal real ou
 * silêncio). Erro de leitura NUNCA vira "nada para levar": vira aviso com
 * [Tentar de novo]. Gate: Pro (`relatorio_dia`, o pacote da rotina do dia).
 * Sem notificação nova de propósito: o ritual diário tem teto de 2 avisos/dia.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BorderRadius, Spacing, useCores, useEstilos, sombrasDe, type Cores } from '../../theme';
import { CartaoRecursoPlano, useRecursoPlano } from '../RecursoPlano';
import { DicaContextual } from '../DicaContextual';
import { Aparecer, PressableAnimado, Skeleton } from '../motion';
import { toast } from '../feedback';
import { vibrar } from '../../utils/haptico';
import { useVerticais } from '../../hooks/useVerticais';
import { deveMostrarMala, montarMala, textoMala, type MalaVespera } from '../../services/malaVespera';
import { amanhaDe, chaveDia, gravarMarcados, lerMarcados, visitasDaMala } from '../../services/malaVesperaDados';
import type { EscopoAgenda } from '../../utils/agendaDominio';

interface Props {
  /** Relógio da tela (o Hoje atualiza a cada minuto). */
  agora: Date;
  escopo: EscopoAgenda;
  /**
   * Moldura da tela (o nó da linha do tempo do Hoje). Só é chamada quando há o
   * que mostrar — assim a linha do tempo não ganha um nó vazio antes das 19h.
   */
  envolver?: (conteudo: React.ReactElement) => React.ReactElement;
}

type Estado = 'carregando' | 'erro' | { mala: MalaVespera; visitas: number };

export function MalaVesperaCard({ agora, escopo, envolver = (c) => c }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { estado: plano } = useRecursoPlano('relatorio_dia');
  const { verticais, carregando: carregandoOficio } = useVerticais();
  const [estado, setEstado] = useState<Estado>('carregando');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState(false);

  const horaDeMostrar = agora.getHours() >= 19;
  const amanha = useMemo(() => amanhaDe(agora), [agora]);
  const dia = chaveDia(amanha);
  const escopoPronto = escopo.status === 'equipe' || escopo.status === 'propria';

  // `agora` muda a cada minuto; só o DIA, o escopo e o ofício mudam a mala.
  const agoraRef = useRef(agora);
  agoraRef.current = agora;

  const carregar = useCallback(async () => {
    setEstado('carregando');
    try {
      const visitas = await visitasDaMala(agoraRef.current, escopo);
      const marc = await lerMarcados(dia);
      setMarcados(marc);
      setEstado({ mala: montarMala(visitas, verticais), visitas: visitas.length });
    } catch {
      setEstado('erro');
    }
  }, [dia, escopo, verticais]);

  useEffect(() => {
    if (horaDeMostrar && escopoPronto && !carregandoOficio) void carregar();
  }, [horaDeMostrar, escopoPronto, carregandoOficio, carregar]);

  const alternar = useCallback((id: string) => {
    vibrar('selecao');
    setMarcados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      void gravarMarcados(dia, novo);
      return novo;
    });
  }, [dia]);

  if (!horaDeMostrar || !escopoPronto) return null;

  if (estado === 'carregando') {
    return envolver(
      <View style={styles.card} accessibilityLabel="Montando a mala de amanhã">
        <Skeleton width="50%" height={14} />
        <Skeleton width="85%" height={12} style={{ marginTop: 8 }} />
        <Skeleton width="70%" height={12} style={{ marginTop: 6 }} />
      </View>
    );
  }

  if (estado === 'erro') {
    return envolver(
      <View style={styles.card}>
        <Text style={styles.rotulo}>MALA DE AMANHÃ</Text>
        <Text style={styles.texto}>Não consegui ler as visitas de amanhã para montar a lista.</Text>
        <PressableAnimado onPress={() => void carregar()} haptic="selection" hitSlop={8} accessibilityLabel="Tentar montar a mala de novo">
          <Text style={styles.acao}>Tentar de novo</Text>
        </PressableAnimado>
      </View>
    );
  }

  if (!deveMostrarMala(agora, estado.visitas)) return null;

  if (plano !== 'liberado') {
    return envolver(
      <CartaoRecursoPlano
        recurso="relatorio_dia"
        titulo="Mala da véspera"
        beneficio={`Amanhã você tem ${estado.visitas} ${estado.visitas === 1 ? 'visita' : 'visitas'}. No Pro, a OLLI monta a lista do que levar, com as peças do orçamento.`}
      />
    );
  }

  const { mala } = estado;
  const rotuloDia = format(amanha, "EEEE, dd/MM", { locale: ptBR });
  const feitos = mala.separar.filter((i) => marcados.has(i.id)).length;

  async function compartilhar() {
    vibrar('selecao');
    try {
      await Share.share({ message: textoMala(mala, rotuloDia, marcados) });
    } catch {
      toast.erro('Não consegui abrir o compartilhamento agora.');
    }
  }

  return envolver(
    <Aparecer>
      <View style={styles.card}>
        <View style={styles.linha}>
          <MaterialCommunityIcons name="bag-personal-outline" size={18} color={cores.accentLight} />
          <Text style={styles.rotulo}>MALA DE AMANHÃ · {estado.visitas} {estado.visitas === 1 ? 'VISITA' : 'VISITAS'}</Text>
          {mala.separar.length > 0 ? <Text style={styles.contador}>{feitos}/{mala.separar.length}</Text> : null}
        </View>

        {mala.separar.length === 0 ? (
          <Text style={styles.texto}>Sem dados para sugerir material para amanhã. Ligue um orçamento à visita para eu listar as peças.</Text>
        ) : (
          <>
            <Text style={styles.titulo}>Para {rotuloDia}, separe:</Text>
            {mala.separar.map((i) => {
              const ok = marcados.has(i.id);
              return (
                <PressableAnimado
                  key={i.id}
                  style={styles.item}
                  onPress={() => alternar(i.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ok }}
                  accessibilityLabel={`${i.texto}, ${i.origem}`}
                >
                  <MaterialCommunityIcons
                    name={ok ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                    size={20}
                    color={ok ? cores.success : cores.onSurfaceVariant}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemTexto, ok && styles.itemFeito]}>{i.texto}</Text>
                    <Text style={styles.origem}>{i.origem}</Text>
                    {i.detalhe ? <Text style={styles.origem}>{i.detalhe}</Text> : null}
                  </View>
                </PressableAnimado>
              );
            })}
          </>
        )}

        <PressableAnimado onPress={() => { vibrar('selecao'); setAberto((v) => !v); }} hitSlop={8} accessibilityLabel={aberto ? 'Esconder por visita' : 'Ver por visita'}>
          <Text style={styles.acao}>{aberto ? 'Esconder por visita' : 'Ver por visita'}</Text>
        </PressableAnimado>
        {aberto
          ? mala.grupos.map((g) => (
              <View key={g.visitaId} style={styles.grupo}>
                <Text style={styles.grupoTitulo}>{format(new Date(g.inicio), 'HH:mm')} · {g.clienteNome}</Text>
                {g.servicos.length ? <Text style={styles.origem}>Serviço: {g.servicos.join(', ')}</Text> : null}
                {g.semDados ? (
                  <Text style={styles.origem}>Sem dados para sugerir material desta visita.</Text>
                ) : (
                  g.itens.map((i) => <Text key={`${g.visitaId}:${i.id}`} style={styles.origem}>• {i.texto}</Text>)
                )}
              </View>
            ))
          : null}

        {mala.separar.length > 0 ? (
          <PressableAnimado style={styles.botao} onPress={() => void compartilhar()} haptic="light" accessibilityLabel="Compartilhar a lista da mala">
            <MaterialCommunityIcons name="share-variant-outline" size={16} color={cores.accentLight} />
            <Text style={styles.botaoTxt}>Compartilhar lista</Text>
          </PressableAnimado>
        ) : null}
      </View>
      <DicaContextual
        id="hoje.mala-vespera"
        icon="bag-personal-outline"
        texto="Toda noite, a partir das 19h, eu monto aqui a lista do que levar amanhã: peças do orçamento e o kit usual do seu ofício."
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
      gap: 6,
      ...sombrasDe(c).sm,
    },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rotulo: { flex: 1, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: c.onSurfaceVariant },
    contador: { fontSize: 12, fontWeight: '800', color: c.onSurfaceVariant },
    titulo: { fontSize: 15, fontWeight: '700', color: c.onSurface, marginTop: 2 },
    texto: { fontSize: 13, lineHeight: 19, color: c.onSurface },
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: 6, minHeight: 44 },
    itemTexto: { fontSize: 14, color: c.onSurface },
    itemFeito: { color: c.onSurfaceMuted, textDecorationLine: 'line-through' },
    origem: { fontSize: 11.5, lineHeight: 16, color: c.onSurfaceMuted },
    grupo: { paddingTop: 6, borderTopWidth: 1, borderTopColor: c.outlineDark, gap: 2 },
    grupoTitulo: { fontSize: 12.5, fontWeight: '700', color: c.onSurface },
    acao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight, marginTop: 4 },
    botao: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      marginTop: Spacing.sm,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: c.outlineDark,
    },
    botaoTxt: { fontSize: 13.5, fontWeight: '700', color: c.accentLight },
  });
