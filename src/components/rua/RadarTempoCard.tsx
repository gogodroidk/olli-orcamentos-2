/**
 * RADAR DO TEMPO PARA VENDER no Painel (Onda I4, jogada 8).
 *
 * "Calor forte chegando: 3 dias com máxima de 32 °C ou mais. 23 clientes seus
 * estão com o serviço vencido. [Montar campanha]". A campanha é uma FILA: um
 * cliente por vez, mensagem pronta no WhatsApp oficial (wa.me), o prestador lê e
 * envia. Nenhum envio automático, nenhum envio em massa.
 *
 * Silêncio é a regra quando não há sinal: clima carregando/indisponível (o chip
 * "Clima do dia" logo acima já mostra a falha), worker sem o resumo por dia, ofício
 * sem gatilho, ninguém com serviço vencido ou sugestão já vista nesta semana.
 * Erro ao ler os clientes com um gatilho ativo NÃO some: vira aviso com
 * [Tentar de novo]. Gate: Pro (`radar_clientes`).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { BorderRadius, Spacing, useCores, useEstilos, sombrasDe, comAlfa, type Cores } from '../../theme';
import { CartaoRecursoPlano, useRecursoPlano } from '../RecursoPlano';
import { DicaContextual } from '../DicaContextual';
import { Aparecer, PressableAnimado, Skeleton } from '../motion';
import { toast } from '../feedback';
import { vibrar } from '../../utils/haptico';
import { abrirWhatsApp } from '../../utils/exportarDocumento';
import { useVerticais } from '../../hooks/useVerticais';
import { atribuicaoClima, type EstadoClima } from '../../services/clima';
import { clientesParaReconquistar, type ClienteParaReconquistar } from '../../services/radarClientes';
import { registrarLembreteEnviado } from '../../services/registroEnvios';
import { getEmpresa } from '../../database/database';
import { RADAR_TEMPO_KEY } from '../../services/storageKeys';
import {
  avaliarRadarTempo,
  mensagemCampanha,
  ocultar,
  podeMostrarSugestao,
  registrarMostrada,
  type EstadoRadarTempoGuardado,
  type SugestaoTempo,
} from '../../services/radarTempo';

interface Props {
  clima: EstadoClima;
}

type Clientes = 'carregando' | 'erro' | ClienteParaReconquistar[];

async function lerGuardado(): Promise<EstadoRadarTempoGuardado | null> {
  try {
    const raw = await AsyncStorage.getItem(RADAR_TEMPO_KEY);
    return raw ? (JSON.parse(raw) as EstadoRadarTempoGuardado) : null;
  } catch {
    return null;
  }
}

async function gravarGuardado(g: EstadoRadarTempoGuardado): Promise<void> {
  try {
    await AsyncStorage.setItem(RADAR_TEMPO_KEY, JSON.stringify(g));
  } catch {
    // sem disco: o limite semanal vale só nesta sessão
  }
}

export function RadarTempoCard({ clima }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { verticais } = useVerticais();
  const { estado: plano } = useRecursoPlano('radar_clientes');
  const [visivel, setVisivel] = useState<SugestaoTempo | null>(null);
  const [clientes, setClientes] = useState<Clientes>('carregando');
  const [fila, setFila] = useState<{ indice: number; abertos: number } | null>(null);
  const [prestador, setPrestador] = useState<string | null>(null);

  const dias = clima !== 'carregando' && clima.ok === true ? clima.dias : undefined;
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const avaliacao = useMemo(() => avaliarRadarTempo(dias, verticais, hoje), [dias, verticais, hoje]);
  const sugestao = avaliacao.estado === 'sugestao' ? avaliacao.sugestao : null;

  // Limite de 1 sugestão por semana (e o "agora não"/silenciar), por aparelho.
  useEffect(() => {
    let vivo = true;
    if (!sugestao) {
      setVisivel(null);
      return;
    }
    (async () => {
      const g = await lerGuardado();
      const agora = Date.now();
      if (!vivo) return;
      if (!podeMostrarSugestao(g, sugestao.chave, agora)) {
        setVisivel(null);
        return;
      }
      await gravarGuardado(registrarMostrada(g, sugestao.chave, agora));
      if (vivo) setVisivel(sugestao);
    })();
    return () => {
      vivo = false;
    };
  }, [sugestao]);

  const carregarClientes = useCallback(async () => {
    setClientes('carregando');
    try {
      const [lista, empresa] = await Promise.all([clientesParaReconquistar(), getEmpresa().catch(() => null)]);
      setPrestador(empresa?.nomePrestador || empresa?.nome || null);
      setClientes(lista);
    } catch {
      setClientes('erro');
    }
  }, []);

  useEffect(() => {
    if (visivel && plano === 'liberado') void carregarClientes();
  }, [visivel, plano, carregarClientes]);

  const fechar = useCallback(async (modo: 'semana' | 'silenciar') => {
    vibrar('selecao');
    const g = await lerGuardado();
    await gravarGuardado(ocultar(g, Date.now(), modo));
    setVisivel(null);
    setFila(null);
    if (modo === 'silenciar') toast.info('Radar do tempo silenciado por 30 dias.');
  }, []);

  if (!visivel) return null;
  const credito = atribuicaoClima(clima);

  if (plano !== 'liberado') {
    return (
      <CartaoRecursoPlano
        recurso="radar_clientes"
        titulo="Radar do tempo para vender"
        beneficio={`${visivel.titulo}. No Pro, a OLLI separa os clientes com o serviço vencido e deixa a mensagem pronta no WhatsApp.`}
      />
    );
  }

  if (clientes === 'carregando') {
    return (
      <View style={styles.card} accessibilityLabel="Conferindo clientes para a campanha">
        <Skeleton width="60%" height={14} />
        <Skeleton width="85%" height={12} style={{ marginTop: 8 }} />
      </View>
    );
  }

  if (clientes === 'erro') {
    return (
      <View style={styles.card}>
        <Text style={styles.rotulo}>RADAR DO TEMPO</Text>
        <Text style={styles.titulo}>{visivel.titulo}</Text>
        <Text style={styles.texto}>Não consegui ver quais clientes estão com o serviço vencido agora.</Text>
        <PressableAnimado onPress={() => void carregarClientes()} haptic="selection" hitSlop={8} accessibilityLabel="Tentar de novo">
          <Text style={styles.acao}>Tentar de novo</Text>
        </PressableAnimado>
      </View>
    );
  }

  // Calor chegando sem ninguém para lembrar: não há o que vender — silêncio.
  if (clientes.length === 0) return null;

  const atual = fila && fila.indice < clientes.length ? clientes[fila.indice] : null;

  async function enviarAtual() {
    if (!fila || !atual || !visivel) return;
    const telefone = (atual.cliente.telefone || '').trim();
    if (!telefone) {
      toast.info(`${atual.cliente.nome} não tem WhatsApp cadastrado. Pulei para o próximo.`);
      setFila({ ...fila, indice: fila.indice + 1 });
      return;
    }
    vibrar('selecao');
    try {
      await abrirWhatsApp(telefone, mensagemCampanha(visivel, { nome: atual.cliente.nome, meses: atual.mesesSemContato }, prestador));
      await registrarLembreteEnviado(atual.cliente.id);
      setFila({ indice: fila.indice + 1, abertos: fila.abertos + 1 });
    } catch {
      toast.erro('Não deu para abrir o WhatsApp agora. Tente de novo.');
    }
  }

  return (
    <Aparecer>
      <View style={[styles.card, { borderColor: comAlfa(cores.warning, 0.4), borderWidth: 1 }]}>
        <View style={styles.linha}>
          <MaterialCommunityIcons name={visivel.gatilho === 'chuva_forte' ? 'weather-pouring' : visivel.gatilho === 'seca' ? 'weather-sunny-alert' : 'thermometer-high'} size={18} color={cores.warning} />
          <Text style={styles.rotulo}>RADAR DO TEMPO PARA VENDER</Text>
        </View>
        <Text style={styles.titulo}>{visivel.titulo}</Text>
        <Text style={styles.texto}>{visivel.detalhe}</Text>
        <Text style={styles.texto}>
          {clientes.length} {clientes.length === 1 ? 'cliente seu está' : 'clientes seus estão'} na hora de repetir o serviço.
        </Text>
        {credito ? <Text style={styles.credito}>{credito}</Text> : null}

        {!fila ? (
          <View style={styles.botoes}>
            <PressableAnimado style={styles.botao} onPress={() => { vibrar('selecao'); setFila({ indice: 0, abertos: 0 }); }} haptic="light" accessibilityLabel="Montar campanha no WhatsApp, um cliente por vez">
              <MaterialCommunityIcons name="whatsapp" size={16} color={cores.accentLight} />
              <Text style={styles.botaoTxt}>Montar campanha</Text>
            </PressableAnimado>
            <PressableAnimado style={styles.botaoGhost} onPress={() => void fechar('semana')} accessibilityLabel="Agora não">
              <Text style={styles.botaoGhostTxt}>Agora não</Text>
            </PressableAnimado>
            <PressableAnimado style={styles.botaoGhost} onPress={() => void fechar('silenciar')} accessibilityLabel="Silenciar o radar do tempo por 30 dias">
              <Text style={styles.botaoGhostTxt}>Silenciar 30 dias</Text>
            </PressableAnimado>
          </View>
        ) : atual ? (
          <View style={styles.fila}>
            <Text style={styles.progresso}>{fila.indice + 1} de {clientes.length} · você envia, um por vez</Text>
            <Text style={styles.nome}>{atual.cliente.nome}</Text>
            <Text style={styles.previa} numberOfLines={4}>
              {mensagemCampanha(visivel, { nome: atual.cliente.nome, meses: atual.mesesSemContato }, prestador)}
            </Text>
            <View style={styles.botoes}>
              <PressableAnimado style={styles.botao} onPress={() => void enviarAtual()} haptic="light" accessibilityLabel={`Abrir o WhatsApp de ${atual.cliente.nome} com a mensagem pronta`}>
                <MaterialCommunityIcons name="whatsapp" size={16} color={cores.accentLight} />
                <Text style={styles.botaoTxt}>Abrir WhatsApp</Text>
              </PressableAnimado>
              <PressableAnimado style={styles.botaoGhost} onPress={() => { vibrar('selecao'); setFila({ ...fila, indice: fila.indice + 1 }); }} accessibilityLabel={`Pular ${atual.cliente.nome}`}>
                <Text style={styles.botaoGhostTxt}>Pular</Text>
              </PressableAnimado>
              <PressableAnimado style={styles.botaoGhost} onPress={() => void fechar('semana')} accessibilityLabel="Parar a campanha">
                <Text style={styles.botaoGhostTxt}>Parar</Text>
              </PressableAnimado>
            </View>
          </View>
        ) : (
          <View style={styles.fila}>
            <Text style={styles.titulo}>Campanha feita</Text>
            <Text style={styles.texto}>
              {fila.abertos} {fila.abertos === 1 ? 'conversa aberta' : 'conversas abertas'} no WhatsApp. Quem recebeu sai da lista de lembrar por 30 dias.
            </Text>
            <PressableAnimado style={styles.botaoGhost} onPress={() => void fechar('semana')} accessibilityLabel="Fechar">
              <Text style={styles.botaoGhostTxt}>Fechar</Text>
            </PressableAnimado>
          </View>
        )}
      </View>
      <DicaContextual
        id="painel.radar-tempo"
        icon="weather-partly-cloudy"
        texto="Quando a previsão mexe com o seu ofício (calor, chuva forte, época da dengue), eu separo os clientes certos. Você envia, um por vez. No máximo 1 aviso por semana."
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
    rotulo: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: c.onSurfaceVariant },
    titulo: { fontSize: 15, fontWeight: '700', color: c.onSurface, marginTop: 2 },
    texto: { fontSize: 13, lineHeight: 19, color: c.onSurface },
    credito: { fontSize: 10.5, color: c.onSurfaceMuted, marginTop: 2 },
    botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
    botao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: Spacing.base,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: c.accentLight,
      backgroundColor: c.accentContainer,
    },
    botaoTxt: { fontSize: 13.5, fontWeight: '800', color: c.accentLight },
    botaoGhost: {
      minHeight: 44,
      paddingHorizontal: Spacing.md,
      justifyContent: 'center',
      borderRadius: BorderRadius.full,
    },
    botaoGhostTxt: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },
    fila: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: c.outlineDark, gap: 4 },
    progresso: { fontSize: 11.5, fontWeight: '700', color: c.onSurfaceMuted },
    nome: { fontSize: 14, fontWeight: '700', color: c.onSurface },
    previa: { fontSize: 12.5, lineHeight: 18, color: c.onSurfaceVariant, fontStyle: 'italic' },
    acao: { fontSize: 12.5, fontWeight: '800', color: c.accentLight, marginTop: 4 },
  });
