/**
 * MAPA DO DIA (tela nova, Onda I2 — jogada 3 do plano "OLLI Inteligente").
 *
 * Ver o dia no espaço, ordenar a rota e saber onde vai chover — tudo GRÁTIS:
 *  - mapa: MapLibre + tiles OpenFreeMap (atribuição OSM sempre visível);
 *  - pontos: as coordenadas que o app já salva dos clientes;
 *  - "Saia às" e km: estimativa no aparelho, SEM trânsito, e a tela diz isso;
 *  - ordenar: vizinho mais próximo + 2-opt no aparelho (`rotaOtimizar.ts`),
 *    respeitando os horários combinados (cadeado);
 *  - chuva: `/clima` do worker (MET Norway, CC BY 4.0, com o crédito na tela).
 *
 * Plano: ver o próprio dia no mapa é de todos. Ordenar e "Saia às" são
 * inteligência do Pro (`hora_de_sair`); o anel de chuva é `clima_visita`. Os
 * gates usam `RecursoPlanoChip` / `useRecursoPlano` (carregando, plano não
 * confirmado, bloqueado, liberado).
 *
 * Honestidade (P0):
 *  - visita sem local no mapa NÃO some: lista própria com "Completar endereço";
 *  - erro ao ler a agenda é erro (com "Tentar de novo"), nunca "nada hoje";
 *  - aplicar a nova ordem PERGUNTA antes e mostra quem muda de horário; avisar o
 *    cliente é um toque do prestador por cliente, pelo link oficial do WhatsApp.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BorderRadius, Spacing, comAlfa, sombrasDe, textoSobre, useCores, useEstilos, type Cores } from '../theme';
import { GESTO, MOLA, useReduzirMovimento } from '../theme/motion';
import { getClientes, getEmpresa } from '../database/database';
import { getAgendamentosDoDia } from '../services/agenda';
import { remarcarVisita } from '../services/remarcarVisita';
import { abrirRotaDoDia } from '../services/rotas';
import { pontoDaBase, type LeituraBase } from '../services/etaSaida';
import { enderecoDoAgendamento, estimarSaida, hhmm, rotuloEstimativa, type ResultadoSaida } from '../services/saidaCalculo';
import { ROTULO_ESTIMATIVA, textoKm, textoMinutos } from '../services/etaEstimado';
import { otimizarRota, textoGanho, textoMotivoRota, totaisDaRota, type ResultadoRota } from '../services/rotaOtimizar';
import { buscarClima } from '../services/clima';
import { analisarClimaVisita, visitaPrecisaDeClima } from '../services/climaVisitaRegra';
import { ROTA_FIXAS_KEY } from '../services/storageKeys';
import { montarRotaDoDia } from '../utils/agendaDia';
import { diaNoMapa, linhaDaRota, resumoDoDia, ROTULO_ESTADO_PIN, type ParadaComLocal, type ParadaMapa } from '../utils/mapaDia';
import type { OcorrenciaAgendamento } from '../utils/contratoRecorrente';
import { abrirWhatsApp } from '../utils/pdfGenerator';
import type { Cliente } from '../types';
import { MapaBase } from '../components/mapa/MapaBase';
import { corDoPin, COR_CHUVA } from '../components/mapa/PinView';
import type { PinMapa } from '../components/mapa/tipos';
import { PressableAnimado, Skeleton } from '../components/motion';
import { DicaContextual } from '../components/DicaContextual';
import { EmptyState } from '../components/EmptyState';
import { RecursoPlanoChip, useRecursoPlano } from '../components/RecursoPlano';
import { confirmar, toast } from '../components/feedback';
import { vibrar } from '../utils/haptico';
import { goBackOrHome } from '../navigation/safeBack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Dia = 'hoje' | 'amanha';

interface Avisar {
  id: string;
  nome: string;
  telefone: string | null;
  paraMs: number;
}

function diaAlvo(d: Dia): Date {
  const hoje = new Date();
  return d === 'hoje' ? hoje : new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1, 12);
}

function horaDe(ms: number): string {
  return hhmm(new Date(ms));
}

function ehFutura(p: ParadaMapa): boolean {
  return p.estado === 'proxima' || p.estado === 'depois';
}

async function lerFixas(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(ROTA_FIXAS_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x: unknown) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export default function MapaDiaScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'MapaDia'>>();
  const insets = useSafeAreaInsets();
  const { height: alturaTela } = useWindowDimensions();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();

  const [dia, setDia] = useState<Dia>(route.params?.dia ?? 'hoje');
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaAgendamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [base, setBase] = useState<LeituraBase | null>(null);
  const [fixas, setFixas] = useState<Set<string>>(new Set());
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [chuvas, setChuvas] = useState<Record<string, boolean>>({});
  const [creditoClima, setCreditoClima] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Extract<ResultadoRota, { ok: true }> | null>(null);
  const [ordenando, setOrdenando] = useState(false);
  const [avisar, setAvisar] = useState<Avisar[]>([]);
  const { estado: estadoSair } = useRecursoPlano('hora_de_sair');
  const { estado: estadoClima } = useRecursoPlano('clima_visita');

  const carregar = useCallback(async () => {
    setEstado('carregando');
    try {
      const [ag, cli, emp, fx] = await Promise.all([
        getAgendamentosDoDia(diaAlvo(dia)),
        getClientes(),
        getEmpresa().catch(() => null),
        lerFixas(),
      ]);
      setOcorrencias(ag);
      setClientes(cli);
      setFixas(fx);
      setEstado('ok');
      // A base vem depois (pode ir à rede uma vez); a tela não espera por ela.
      void pontoDaBase(emp).then(setBase);
    } catch {
      setEstado('erro');
    }
  }, [dia]);

  useFocusEffect(useCallback(() => { void carregar(); }, [carregar]));

  const paradas = useMemo(() => montarRotaDoDia(ocorrencias, new Date()), [ocorrencias]);
  const noMapa = useMemo(() => diaNoMapa(paradas, clientes), [paradas, clientes]);
  const pontoBase = base?.estado === 'ok' ? base.ponto : null;

  // Ordem exibida: a da agenda, ou a PRÉVIA da ordenação (antes de aplicar).
  const ordemExibida = useMemo<ParadaComLocal[]>(() => {
    if (!previa) return noMapa.comLocal;
    const porId = new Map(noMapa.comLocal.map((p) => [p.id, p]));
    const anteriores = noMapa.comLocal.filter((p) => !ehFutura(p));
    const novas = previa.ordem.map((id) => porId.get(id)).filter((p): p is ParadaComLocal => !!p);
    const resto = noMapa.comLocal.filter((p) => ehFutura(p) && !previa.ordem.includes(p.id));
    return [...anteriores, ...novas, ...resto];
  }, [noMapa, previa]);

  const pins = useMemo<PinMapa[]>(
    () =>
      ordemExibida.map((p, i) => ({
        id: p.id,
        lat: p.ponto.lat,
        lon: p.ponto.lon,
        rotulo: String(i + 1),
        tom: p.estado,
        chuva: !!chuvas[p.id],
        aproximado: p.aproximado,
        acessibilidade: `Parada ${i + 1}, ${p.nome}, ${horaDe(previa?.inicios[p.id] ?? p.inicioMs)}${chuvas[p.id] ? ', chuva prevista' : ''}`,
      })),
    [ordemExibida, chuvas, previa],
  );
  const linha = useMemo(() => linhaDaRota(ordemExibida.map((p) => p.ponto)), [ordemExibida]);
  const chaveAnimacao = useMemo(() => ordemExibida.map((p) => p.id).join(','), [ordemExibida]);

  // "Saia às" de cada parada que ainda vai acontecer (Pro). Origem: a parada
  // anterior no mapa; a primeira do dia sai da base da empresa.
  const saidas = useMemo<Record<string, ResultadoSaida>>(() => {
    if (estadoSair !== 'liberado') return {};
    const agora = new Date();
    const out: Record<string, ResultadoSaida> = {};
    ordemExibida.forEach((p, i) => {
      if (!ehFutura(p)) return;
      const anterior = i > 0 ? ordemExibida[i - 1] : null;
      const origem = anterior ? { ponto: anterior.ponto, de: 'visita_anterior' as const } : pontoBase ? { ponto: pontoBase, de: 'base' as const } : null;
      out[p.id] = estimarSaida({ origem, destino: p.ponto, chegarEm: new Date(previa?.inicios[p.id] ?? p.inicioMs), agora });
    });
    return out;
  }, [estadoSair, ordemExibida, pontoBase, previa]);

  const resumo = useMemo(() => {
    if (paradas.length === 0) return null;
    const seq = ordemExibida.map((p) => ({ id: p.id, ponto: p.ponto, inicioMs: previa?.inicios[p.id] ?? p.inicioMs, duracaoMin: p.duracaoMin, fixa: true }));
    const t = seq.length > 0 ? totaisDaRota(seq, null) : null;
    const fim = [...seq, ...noMapa.semLocal].reduce((m, p) => Math.max(m, p.inicioMs + p.duracaoMin * 60_000), 0);
    return {
      texto: resumoDoDia(paradas.length, t && seq.length > 1 ? t.km : null, fim || null),
      estrada: t && seq.length > 1 ? textoMinutos(t.minutos) : null,
    };
  }, [paradas.length, ordemExibida, noMapa.semLocal, previa]);

  // Chuva na hora de cada visita futura (Pro, `clima_visita`). Falha de clima
  // não pinta nada e não esconde nada: o anel só aparece com previsão de verdade.
  useEffect(() => {
    if (estadoClima !== 'liberado' || estado !== 'ok') return;
    let vivo = true;
    const alvo = noMapa.comLocal.filter(ehFutura);
    void (async () => {
      const novo: Record<string, boolean> = {};
      let credito: string | null = null;
      for (const p of alvo) {
        const visita = {
          inicio: p.visita.inicio,
          fim: p.visita.fim ?? null,
          lat: p.ponto.lat,
          lon: p.ponto.lon,
          externa: p.visita.externa ?? null,
        };
        if (!visitaPrecisaDeClima(visita)) continue;
        try {
          const clima = await buscarClima(p.ponto.lat, p.ponto.lon);
          const analise = analisarClimaVisita(visita, clima);
          if (analise.estado === 'previsao' && (analise.nivel === 'forte' || analise.nivel === 'chuva')) novo[p.id] = true;
          if (analise.atribuicao) credito = analise.atribuicao;
        } catch {
          // sem anel: "não sei" não vira "vai chover" nem "não vai"
        }
      }
      if (vivo) {
        setChuvas(novo);
        setCreditoClima(credito);
      }
    })();
    return () => { vivo = false; };
  }, [estadoClima, estado, noMapa]);

  // ─── Folha de baixo (arrastável, 2 alturas) ─────────────────────────────
  const alturaFolha = Math.round(alturaTela * 0.74);
  const alturaRecolhida = Math.round(alturaTela * 0.38);
  const deslocRecolhida = alturaFolha - alturaRecolhida;
  const y = useSharedValue(deslocRecolhida);
  const inicioArrasto = useSharedValue(0);

  const arrastar = Gesture.Pan()
    .activeOffsetY([-GESTO.folgaAtivacao, GESTO.folgaAtivacao])
    .onStart(() => { inicioArrasto.set(y.get()); })
    .onUpdate((e) => {
      const v = inicioArrasto.get() + e.translationY;
      y.set(Math.max(0, Math.min(deslocRecolhida, v)));
    })
    .onEnd((e) => {
      const abrir = e.velocityY < -GESTO.velocidadeDispensa || (e.velocityY < GESTO.velocidadeDispensa && y.get() < deslocRecolhida / 2);
      const alvo = abrir ? 0 : deslocRecolhida;
      y.set(reduzir ? alvo : withSpring(alvo, MOLA.gentle));
    });

  const estiloFolha = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  const alternarFolha = useCallback(() => {
    const alvo = y.get() > deslocRecolhida / 2 ? 0 : deslocRecolhida;
    y.set(reduzir ? alvo : withSpring(alvo, MOLA.gentle));
  }, [y, deslocRecolhida, reduzir]);

  // ─── Ações ──────────────────────────────────────────────────────────────
  const alternarFixa = useCallback(async (id: string) => {
    vibrar('selecao');
    const nova = new Set(fixas);
    if (nova.has(id)) nova.delete(id);
    else nova.add(id);
    setFixas(nova);
    setPrevia(null);
    try {
      await AsyncStorage.setItem(ROTA_FIXAS_KEY, JSON.stringify([...nova]));
    } catch {
      toast.erro('Não consegui guardar o cadeado neste aparelho. Ele vale até você sair da tela.');
    }
  }, [fixas]);

  const telefoneDe = useCallback((clienteId?: string) => {
    if (!clienteId) return null;
    return clientes.find((c) => c.id === clienteId)?.telefone?.trim() || null;
  }, [clientes]);

  const ordenar = useCallback(async () => {
    if (ordenando) return;
    vibrar('selecao');
    const futuras = noMapa.comLocal.filter(ehFutura);
    const anteriores = noMapa.comLocal.filter((p) => !ehFutura(p));
    const origem = anteriores.length > 0 ? anteriores[anteriores.length - 1].ponto : pontoBase;
    const bloqueios = noMapa.semLocal.filter(ehFutura).map((p) => ({ inicioMs: p.inicioMs, fimMs: p.inicioMs + p.duracaoMin * 60_000 }));
    const r = otimizarRota(
      futuras.map((p) => ({ id: p.id, ponto: p.ponto, inicioMs: p.inicioMs, duracaoMin: p.duracaoMin, fixa: fixas.has(p.id) })),
      { origem, bloqueios },
    );
    if (!r.ok) {
      toast.info(textoMotivoRota(r.motivo), { titulo: 'Não deu para ordenar' });
      return;
    }
    if (!r.melhorou) {
      toast.info('Sua ordem já é a mais curta que achei (estimativa, sem trânsito).');
      return;
    }
    setPrevia(r);
    const nomes = new Map(noMapa.comLocal.map((p) => [p.id, p.nome]));
    const linhas = r.mudancas.map((m) => `• ${nomes.get(m.id) ?? 'Visita'}: ${horaDe(m.deMs)} → ${horaDe(m.paraMs)}`).join('\n');
    const ok = await confirmar({
      titulo: 'Aplicar a nova ordem?',
      mensagem: `${textoGanho(r.ganhoMin, r.ganhoKm)}\n\n${linhas}\n\nDepois você escolhe quem avisar no WhatsApp.`,
      rotuloConfirmar: 'Aplicar',
      rotuloCancelar: 'Manter como está',
    });
    if (!ok) {
      setPrevia(null);
      return;
    }
    setOrdenando(true);
    const aplicadas: Avisar[] = [];
    try {
      for (const m of r.mudancas) {
        const oc = ocorrencias.find((o) => o.id === m.id);
        if (!oc) throw new Error('Uma das visitas não está mais na agenda.');
        await remarcarVisita(oc, new Date(m.paraMs));
        aplicadas.push({ id: m.id, nome: oc.clienteNome || oc.titulo || 'Cliente', telefone: telefoneDe(oc.clienteId), paraMs: m.paraMs });
      }
      vibrar('sucesso');
      toast.sucesso('Rota reordenada. Avise quem mudou de horário.');
    } catch (e) {
      const motivo = e instanceof Error ? e.message : 'Erro ao salvar.';
      toast.erro(`Mudei ${aplicadas.length} de ${r.mudancas.length} visitas. ${motivo}`, { titulo: 'Ordem aplicada só em parte' });
    } finally {
      setAvisar(aplicadas);
      setPrevia(null);
      setOrdenando(false);
      void carregar();
    }
  }, [ordenando, noMapa, pontoBase, fixas, ocorrencias, telefoneDe, carregar]);

  const avisarCliente = useCallback(async (a: Avisar) => {
    if (!a.telefone) {
      toast.info(`Cadastre o WhatsApp de ${a.nome} em Clientes para avisar por aqui.`, { titulo: 'Sem telefone' });
      return;
    }
    const primeiro = a.nome.trim().split(/\s+/)[0] || 'tudo bem';
    try {
      await abrirWhatsApp(a.telefone, `Olá ${primeiro}, organizei minha rota e sua visita de ${dia === 'hoje' ? 'hoje' : 'amanhã'} ficou para as ${horaDe(a.paraMs)}. Pode ser? Se não der, me avise que a gente acerta.`);
      setAvisar((lista) => lista.filter((x) => x.id !== a.id));
    } catch {
      toast.erro('Não deu para abrir o WhatsApp agora.');
    }
  }, [dia]);

  const iniciarRota = useCallback(async () => {
    vibrar('selecao');
    const enderecos = ordemExibida.filter(ehFutura).map((p) => enderecoDoAgendamento(p.visita, clientes));
    const abriu = await abrirRotaDoDia(enderecos);
    if (!abriu) toast.info('Nenhuma visita pendente com endereço para abrir no Maps.');
  }, [ordemExibida, clientes]);

  const ligar = useCallback(async (telefone: string) => {
    const digitos = telefone.replace(/\D/g, '');
    if (!digitos) return;
    try {
      await Linking.openURL(`tel:${digitos}`);
    } catch {
      toast.erro('Não deu para abrir o discador.');
    }
  }, []);

  const verNaAgenda = useCallback((id: string) => {
    nav.navigate('Tabs', { screen: 'Agenda', params: { abrirAgendamentoId: id } } as never);
  }, [nav]);

  const completarEndereco = useCallback((p: ParadaMapa) => {
    if (p.visita.clienteId) nav.navigate('ClienteDetalhe', { clienteId: p.visita.clienteId });
    else verNaAgenda(p.id);
  }, [nav, verNaAgenda]);

  const sel = selecionado ? ordemExibida.find((p) => p.id === selecionado) ?? null : null;
  const telSel = sel ? telefoneDe(sel.visita.clienteId) : null;
  const futurasComLocal = noMapa.comLocal.filter(ehFutura).length;

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.tela}>
      {estado === 'ok' && pins.length > 0 ? (
        <MapaBase
          pins={pins}
          linha={linha}
          onPinPress={(id) => { vibrar('selecao'); setSelecionado(id); }}
          selecionado={selecionado}
          chaveAnimacao={chaveAnimacao}
          margens={{ topo: insets.top + 110, base: alturaRecolhida + 24, lados: 40 }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fundoSemMapa]} />
      )}

      {/* Topo flutuante: voltar + título + Hoje/Amanhã */}
      <View style={[styles.topo, { paddingTop: insets.top + Spacing.sm }]} pointerEvents="box-none">
        <View style={styles.topoLinha} pointerEvents="box-none">
          <PressableAnimado style={styles.botaoRedondo} onPress={() => goBackOrHome(nav)} haptic="selection" accessibilityLabel="Voltar">
            <MaterialCommunityIcons name="chevron-left" size={26} color={cores.onSurface} />
          </PressableAnimado>
          <View style={styles.tituloPilula}>
            <Text style={styles.titulo}>Mapa do dia</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.chips} pointerEvents="box-none">
          {(['hoje', 'amanha'] as const).map((d) => (
            <PressableAnimado
              key={d}
              style={[styles.chip, dia === d && styles.chipAtivo]}
              onPress={() => { if (d !== dia) { vibrar('selecao'); setPrevia(null); setSelecionado(null); setAvisar([]); setChuvas({}); setDia(d); } }}
              haptic={false}
              accessibilityRole="tab"
              accessibilityState={{ selected: dia === d }}
              accessibilityLabel={d === 'hoje' ? 'Hoje' : 'Amanhã'}
            >
              <Text style={[styles.chipTexto, dia === d && styles.chipTextoAtivo]}>{d === 'hoje' ? 'Hoje' : 'Amanhã'}</Text>
            </PressableAnimado>
          ))}
        </View>
      </View>

      {/* Cartão da parada tocada no mapa */}
      {sel ? (
        <View style={[styles.cartaoSel, { bottom: alturaRecolhida + Spacing.md }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.selNome} numberOfLines={1}>{sel.nome}</Text>
            <Text style={styles.selSub} numberOfLines={1}>
              {horaDe(previa?.inicios[sel.id] ?? sel.inicioMs)} · {ROTULO_ESTADO_PIN[sel.estado]}{sel.aproximado ? ' · local aproximado pelo CEP' : ''}
            </Text>
          </View>
          <PressableAnimado
            style={styles.selBotao}
            onPress={() => { const e = enderecoDoAgendamento(sel.visita, clientes); if (e) void abrirRotaDoDia([e]); }}
            haptic="selection"
            accessibilityLabel={`Ir até ${sel.nome} no app de mapas`}
          >
            <MaterialCommunityIcons name="navigation-variant" size={18} color={cores.accentLight} />
          </PressableAnimado>
          {telSel ? (
            <PressableAnimado style={styles.selBotao} onPress={() => { void ligar(telSel); }} haptic="selection" accessibilityLabel={`Ligar para ${sel.nome}`}>
              <MaterialCommunityIcons name="phone" size={18} color={cores.accentLight} />
            </PressableAnimado>
          ) : null}
          <PressableAnimado style={styles.selBotao} onPress={() => verNaAgenda(sel.id)} haptic="selection" accessibilityLabel={`Ver ${sel.nome} na agenda`}>
            <MaterialCommunityIcons name="calendar-text" size={18} color={cores.accentLight} />
          </PressableAnimado>
          <PressableAnimado style={styles.selBotao} onPress={() => setSelecionado(null)} haptic="selection" accessibilityLabel="Fechar">
            <MaterialCommunityIcons name="close" size={18} color={cores.onSurfaceMuted} />
          </PressableAnimado>
        </View>
      ) : null}

      {/* Folha de baixo */}
      <Animated.View style={[styles.folha, { height: alturaFolha, paddingBottom: insets.bottom }, estiloFolha]}>
        <GestureDetector gesture={arrastar}>
          <View style={styles.pegadorArea}>
            <PressableAnimado onPress={alternarFolha} haptic={false} style={styles.pegadorToque} accessibilityLabel="Abrir ou recolher a lista do dia">
              <View style={styles.pegador} />
            </PressableAnimado>
            <Text style={styles.folhaTitulo}>{dia === 'hoje' ? 'Hoje' : 'Amanhã'}</Text>
            {estado === 'ok' && resumo ? (
              <Text style={styles.folhaResumo}>
                {resumo.texto}{resumo.estrada ? ` · ~${resumo.estrada} de estrada` : ''}
              </Text>
            ) : null}
            {estado === 'ok' && paradas.length > 0 ? <Text style={styles.folhaNota}>{ROTULO_ESTIMATIVA}</Text> : null}
          </View>
        </GestureDetector>

        <ScrollView contentContainerStyle={styles.folhaConteudo} showsVerticalScrollIndicator={false}>
          {estado === 'carregando' ? (
            <View style={{ gap: Spacing.md }} accessibilityLabel="Carregando as visitas do dia">
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.linhaEsqueleto}>
                  <Skeleton width={28} height={28} radius={14} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton width="55%" height={14} />
                    <Skeleton width="35%" height={11} />
                  </View>
                </View>
              ))}
            </View>
          ) : estado === 'erro' ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Não consegui ler a agenda"
              subtitle="As visitas do dia não carregaram agora. Isso não quer dizer que o dia está vazio."
              actionLabel="Tentar de novo"
              onAction={() => { void carregar(); }}
            />
          ) : paradas.length === 0 ? (
            <EmptyState
              icon="calendar-blank-outline"
              title={dia === 'hoje' ? 'Nenhuma visita hoje' : 'Nenhuma visita amanhã'}
              subtitle="Quando houver visitas com endereço, elas aparecem aqui no mapa, na ordem do dia."
              actionLabel="Agendar visita"
              onAction={() => nav.navigate('Tabs', { screen: 'Agenda', params: { novo: true } } as never)}
            />
          ) : (
            <>
              <DicaContextual
                id="mapa.primeira-vez"
                texto="Aqui está seu dia no mapa. Toque em Ordenar e a OLLI acha o caminho mais curto respeitando os horários marcados (cadeado)."
                icon="map-marker-path"
                style={{ marginBottom: Spacing.md }}
              />

              <View style={styles.acoes}>
                <View style={{ flex: 1 }}>
                  <RecursoPlanoChip recurso="hora_de_sair">
                    <PressableAnimado
                      style={[styles.botaoPrincipal, (futurasComLocal < 2 || ordenando) && styles.botaoDesligado]}
                      onPress={() => { void ordenar(); }}
                      disabled={ordenando}
                      haptic="light"
                      accessibilityLabel="Ordenar as visitas pelo caminho mais curto"
                      accessibilityState={{ busy: ordenando }}
                    >
                      <MaterialCommunityIcons name="sort-variant" size={18} color={textoSobre(cores.accentLight)} />
                      <Text style={styles.botaoPrincipalTexto}>{ordenando ? 'Aplicando…' : 'Ordenar pelo caminho mais curto'}</Text>
                    </PressableAnimado>
                  </RecursoPlanoChip>
                </View>
              </View>
              <PressableAnimado style={styles.botaoSecundario} onPress={() => { void iniciarRota(); }} haptic="light" accessibilityLabel="Abrir a rota das visitas pendentes no app de mapas">
                <MaterialCommunityIcons name="navigation-variant-outline" size={18} color={cores.accentLight} />
                <Text style={styles.botaoSecundarioTexto}>Iniciar rota no Maps</Text>
              </PressableAnimado>

              {base?.estado === 'sem_endereco' && estadoSair === 'liberado' ? (
                <PressableAnimado style={styles.avisoLinha} onPress={() => nav.navigate('MeuNegocio')} haptic="selection" accessibilityLabel="Completar o endereço da empresa em Meu negócio">
                  <MaterialCommunityIcons name="home-alert-outline" size={16} color={cores.warning} />
                  <Text style={styles.avisoTexto}>Sem o endereço da empresa no mapa, a 1ª saída do dia não é estimada. Completar em Meu negócio.</Text>
                </PressableAnimado>
              ) : base?.estado === 'indisponivel' && estadoSair === 'liberado' ? (
                <View style={styles.avisoLinha}>
                  <MaterialCommunityIcons name="wifi-off" size={16} color={cores.onSurfaceMuted} />
                  <Text style={styles.avisoTexto}>Não consegui localizar a base da empresa agora. A 1ª saída do dia fica sem estimativa.</Text>
                </View>
              ) : null}

              {avisar.length > 0 ? (
                <View style={styles.avisarBloco}>
                  <Text style={styles.secao}>Avisar quem mudou de horário</Text>
                  {avisar.map((a) => (
                    <View key={a.id} style={styles.avisarLinha}>
                      <Text style={styles.avisarNome} numberOfLines={1}>{a.nome} · agora às {horaDe(a.paraMs)}</Text>
                      <PressableAnimado style={styles.botaoWhats} onPress={() => { void avisarCliente(a); }} haptic="light" accessibilityLabel={`Avisar ${a.nome} no WhatsApp`}>
                        <MaterialCommunityIcons name="whatsapp" size={16} color={textoSobre(cores.whatsapp)} />
                        <Text style={styles.botaoWhatsTexto}>Avisar</Text>
                      </PressableAnimado>
                    </View>
                  ))}
                </View>
              ) : null}

              {previa ? (
                <View style={styles.previa}>
                  <MaterialCommunityIcons name="sort-variant" size={16} color={cores.accentLight} />
                  <Text style={styles.previaTexto}>Prévia da nova ordem no mapa: {textoGanho(previa.ganhoMin, previa.ganhoKm)}</Text>
                </View>
              ) : null}

              <Text style={styles.secao}>Paradas no mapa</Text>
              {ordemExibida.length === 0 ? (
                <Text style={styles.vazioTexto}>Nenhuma visita deste dia tem local no mapa ainda.</Text>
              ) : (
                ordemExibida.map((p, i) => {
                  const s = saidas[p.id];
                  const inicioMs = previa?.inicios[p.id] ?? p.inicioMs;
                  const podeTrancar = ehFutura(p);
                  const trancada = fixas.has(p.id);
                  return (
                    <PressableAnimado
                      key={p.id}
                      style={[styles.parada, selecionado === p.id && styles.paradaSel]}
                      escala={0.98}
                      onPress={() => setSelecionado(p.id)}
                      haptic="selection"
                      accessibilityLabel={`Parada ${i + 1}, ${horaDe(inicioMs)}, ${p.nome}. Mostrar no mapa`}
                    >
                      <View style={[styles.numero, { backgroundColor: corDoPin(p.estado, cores) }, chuvas[p.id] && { borderColor: COR_CHUVA, borderWidth: 2 }]}>
                        <Text style={[styles.numeroTexto, { color: textoSobre(corDoPin(p.estado, cores)) }]}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.paradaNome} numberOfLines={1}>
                          <Text style={styles.paradaHora}>{horaDe(inicioMs)}  </Text>{p.nome}
                        </Text>
                        {s?.estado === 'ok' ? (
                          <Text style={[styles.paradaSub, s.atrasado && { color: cores.warning }]} numberOfLines={2}>
                            {s.atrasado ? `Já devia ter saído · chega ~${hhmm(s.sairAgoraChegaEm)}` : `Saia às ${hhmm(s.sairEm)} · ~${s.minutos} min · ${textoKm(s.distanciaKm)}`}
                            {s.aproximado ? ' · local aproximado' : ''}
                          </Text>
                        ) : s?.estado === 'endereco_insuficiente' ? (
                          <Text style={styles.paradaSub} numberOfLines={1}>Saída sem estimativa: falta o ponto de partida</Text>
                        ) : (
                          <Text style={styles.paradaSub} numberOfLines={1}>{ROTULO_ESTADO_PIN[p.estado]}{p.aproximado ? ' · local aproximado pelo CEP' : ''}</Text>
                        )}
                      </View>
                      {chuvas[p.id] ? <MaterialCommunityIcons name="weather-pouring" size={18} color={COR_CHUVA} accessibilityLabel="Chuva prevista na hora da visita" /> : null}
                      {podeTrancar ? (
                        <PressableAnimado
                          style={styles.cadeado}
                          onPress={() => { void alternarFixa(p.id); }}
                          haptic={false}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: trancada }}
                          accessibilityLabel={trancada ? `Horário combinado com ${p.nome}: não muda ao ordenar` : `Marcar o horário de ${p.nome} como combinado`}
                        >
                          <MaterialCommunityIcons name={trancada ? 'lock' : 'lock-open-variant-outline'} size={18} color={trancada ? cores.accentLight : cores.onSurfaceMuted} />
                        </PressableAnimado>
                      ) : null}
                    </PressableAnimado>
                  );
                })
              )}

              {estadoSair === 'liberado' && ordemExibida.some((p) => saidas[p.id]?.estado === 'ok') ? (
                <Text style={styles.rodapeNota}>
                  "Saia às" já inclui uma folga ({rotuloEstimativa({ aproximado: false })}). Confira o trânsito no app de mapas antes de sair.
                </Text>
              ) : null}

              {noMapa.semLocal.length > 0 ? (
                <View style={{ marginTop: Spacing.lg }}>
                  <Text style={styles.secao}>Sem local no mapa ({noMapa.semLocal.length})</Text>
                  {noMapa.semLocal.map((p) => (
                    <View key={p.id} style={styles.semLocalLinha}>
                      <MaterialCommunityIcons name="map-marker-question-outline" size={18} color={cores.warning} />
                      <Text style={styles.semLocalNome} numberOfLines={1}>{horaDe(p.inicioMs)}  {p.nome}</Text>
                      <PressableAnimado onPress={() => completarEndereco(p)} haptic="selection" hitSlop={8} accessibilityLabel={`Completar o endereço de ${p.nome}`}>
                        <Text style={styles.link}>Completar endereço</Text>
                      </PressableAnimado>
                    </View>
                  ))}
                  <Text style={styles.rodapeNota}>O local vem do CEP e do endereço do cliente. Visita marcada em outro endereço fica fora do mapa até o cliente ter esse endereço.</Text>
                </View>
              ) : null}

              <View style={styles.legenda}>
                {(['proxima', 'depois', 'agora', 'feita', 'sem_baixa'] as const).map((t) => (
                  <View key={t} style={styles.legendaItem}>
                    <View style={[styles.legendaPonto, { backgroundColor: corDoPin(t, cores) }]} />
                    <Text style={styles.legendaTexto}>{ROTULO_ESTADO_PIN[t]}</Text>
                  </View>
                ))}
                <View style={styles.legendaItem}>
                  <View style={[styles.legendaPonto, styles.legendaAnel]} />
                  <RecursoPlanoChip recurso="clima_visita">
                    <Text style={styles.legendaTexto}>Chuva na hora da visita</Text>
                  </RecursoPlanoChip>
                </View>
              </View>
              {creditoClima ? <Text style={styles.credito}>{creditoClima} · previsão por ponto, não é radar</Text> : null}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: c.background },
    fundoSemMapa: { backgroundColor: c.surfaceVariant },
    topo: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: Spacing.base },
    topoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    botaoRedondo: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: comAlfa(c.surface, 0.94),
      alignItems: 'center',
      justifyContent: 'center',
      ...sombrasDe(c).sm,
    },
    tituloPilula: {
      paddingHorizontal: Spacing.base,
      minHeight: 36,
      justifyContent: 'center',
      borderRadius: BorderRadius.full,
      backgroundColor: comAlfa(c.surface, 0.94),
      ...sombrasDe(c).sm,
    },
    titulo: { fontSize: 15, fontWeight: '800', color: c.onSurface },
    chips: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center', marginTop: Spacing.sm },
    chip: {
      minHeight: 36,
      paddingHorizontal: Spacing.base,
      borderRadius: BorderRadius.full,
      justifyContent: 'center',
      backgroundColor: comAlfa(c.surface, 0.9),
      borderWidth: 1,
      borderColor: c.outline,
    },
    chipAtivo: { backgroundColor: c.accentLight, borderColor: c.accentLight },
    chipTexto: { fontSize: 13, fontWeight: '700', color: c.onSurface },
    chipTextoAtivo: { color: textoSobre(c.accentLight) },
    cartaoSel: {
      position: 'absolute',
      left: Spacing.base,
      right: Spacing.base,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.outline,
      ...sombrasDe(c).md,
    },
    selNome: { fontSize: 15, fontWeight: '800', color: c.onSurface },
    selSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
    selBotao: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    folha: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.surface,
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: c.outline,
      ...sombrasDe(c).md,
    },
    pegadorArea: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
    pegadorToque: { alignSelf: 'center', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl, minHeight: 28 },
    pegador: { width: 40, height: 5, borderRadius: 3, backgroundColor: c.outlineDark },
    folhaTitulo: { fontSize: 18, fontWeight: '800', color: c.onSurface },
    folhaResumo: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginTop: 2 },
    folhaNota: { fontSize: 13, color: c.onSurfaceMuted, marginTop: 1 },
    folhaConteudo: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxxl },
    linhaEsqueleto: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    acoes: { flexDirection: 'row', gap: Spacing.sm },
    botaoPrincipal: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 48,
      borderRadius: BorderRadius.md,
      backgroundColor: c.accentLight,
      paddingHorizontal: Spacing.base,
    },
    botaoDesligado: { opacity: 0.55 },
    botaoPrincipalTexto: { fontSize: 14.5, fontWeight: '800', color: textoSobre(c.accentLight) },
    botaoSecundario: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 44,
      marginTop: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: c.strokeGlow,
      backgroundColor: c.surfacePressed,
    },
    botaoSecundarioTexto: { fontSize: 13.5, fontWeight: '800', color: c.accentLight },
    avisoLinha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: Spacing.md,
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      backgroundColor: c.surfaceVariant,
    },
    avisoTexto: { flex: 1, fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 17 },
    avisarBloco: { marginTop: Spacing.md },
    avisarLinha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 48 },
    avisarNome: { flex: 1, fontSize: 13.5, fontWeight: '700', color: c.onSurface },
    botaoWhats: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.full,
      backgroundColor: c.whatsapp,
    },
    botaoWhatsTexto: { fontSize: 13, fontWeight: '800', color: textoSobre(c.whatsapp) },
    previa: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: Spacing.md,
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      backgroundColor: c.accentContainer,
    },
    previaTexto: { flex: 1, fontSize: 12.5, fontWeight: '700', color: c.onSurface },
    secao: { fontSize: 13, fontWeight: '800', color: c.onSurfaceVariant, marginTop: Spacing.lg, marginBottom: Spacing.sm, letterSpacing: 0.3 },
    vazioTexto: { fontSize: 13, color: c.onSurfaceVariant },
    parada: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      minHeight: 60,
      paddingHorizontal: Spacing.sm,
      borderRadius: BorderRadius.md,
    },
    paradaSel: { backgroundColor: c.surfacePressed },
    numero: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    numeroTexto: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
    paradaHora: { fontWeight: '800', color: c.onSurface, fontVariant: ['tabular-nums'] },
    paradaNome: { fontSize: 14.5, fontWeight: '700', color: c.onSurface },
    paradaSub: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 2 },
    cadeado: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    rodapeNota: { fontSize: 13, color: c.onSurfaceMuted, marginTop: Spacing.sm, lineHeight: 17 },
    semLocalLinha: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
    semLocalNome: { flex: 1, fontSize: 13.5, color: c.onSurface },
    link: { fontSize: 13, fontWeight: '800', color: c.accentLight },
    legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.lg },
    legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendaPonto: { width: 12, height: 12, borderRadius: 6 },
    legendaAnel: { borderWidth: 2, borderColor: COR_CHUVA, backgroundColor: 'transparent' },
    legendaTexto: { fontSize: 12, color: c.onSurfaceVariant },
    credito: { fontSize: 13, color: c.onSurfaceMuted, marginTop: Spacing.sm },
  });
