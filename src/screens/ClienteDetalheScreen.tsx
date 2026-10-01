/**
 * PÁGINA DO CLIENTE (item 2.15) — tudo o que o prestador já fez para UMA pessoa.
 *
 * Abre ao tocar no cliente na lista (ClientesScreen). Mostra:
 *  - KPIs: gasto total pago (recibos não estornados), último serviço, próxima
 *    visita e o retorno previsto (último serviço + intervalo do ofício — a mesma
 *    data da lista "Clientes para lembrar");
 *  - ações rápidas: WhatsApp (número pelo helper único `numeroWhatsAppBR`), ligar,
 *    novo orçamento já com este cliente e agendar visita;
 *  - endereço: mapa estático SÓ se o cadastro já tiver coordenada E o app tiver a
 *    chave de mapa que já existe (`EXPO_PUBLIC_MAPS_KEY`). Sem isso, só o botão
 *    "Traçar rota" (deep link do Google Maps, sem chave nenhuma);
 *  - equipamentos do cliente (inventário PMOC), quando houver;
 *  - linha do tempo unificada de orçamentos, OS, recibos e visitas, do mais recente
 *    para o mais antigo; tocar abre o documento.
 *
 * As contas (KPIs e timeline) moram em `utils/clienteDetalhe.ts`, TS puro testado
 * por `scripts/teste-cliente-detalhe.ts`. Aqui só se lê o banco e se desenha.
 *
 * QUEM VÊ O QUÊ (mesma matriz de `hooks/usePermissao.ts`): o TÉCNICO vê só as
 * visitas e OS atribuídas a ele (como na Agenda e em "Minhas OS") e nada de
 * dinheiro (gasto total pago e recibos são `ver_valores_agregados`). Enquanto o
 * papel não é conhecido a página fica em "carregando"; se não der para saber o
 * papel, ela diz isso — nunca cai na visão de gestão nem numa página vazia.
 *
 * Estados honestos: carregando | erro (com "Tentar de novo") | cliente não
 * encontrado | conteúdo. Erro NUNCA vira "sem histórico"; a falha só dos
 * equipamentos aparece como aviso na seção dela, sem derrubar a página.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking,
  RefreshControl, ActivityIndicator, Image,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vibrar } from '../utils/haptico';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Spacing, BorderRadius, Typography, useCores, useEstilos, sombrasDe, corCategoria, type Cores,
} from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { EmptyState } from '../components/EmptyState';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { getCliente, getOrcamentos, getRecibos, getEmpresa } from '../database/database';
import { getOrdens } from '../services/ordemServico';
import { getAgendamentos, getAgendamentosExpandidos } from '../services/agenda';
import { getEquipamentosDoCliente } from '../services/equipamentos';
import { marcarReciboComoPdfEmitido } from '../services/pagamentos';
import { onSyncAplicado } from '../services/cloudSync';
import { abrirRotaGoogleMaps } from '../services/rotas';
import { RECURSO_REMOVE_MARCA } from '../services/planos';
import { usePlano } from '../hooks/usePlano';
import { usePermissao } from '../hooks/usePermissao';
import { useTipoConta } from '../hooks/useTipoConta';
import { getCurrentUser } from '../services/supabase';
import { aplicarEscopo, resolverEscopoAgenda, type EntradaEscopo, type EscopoAgenda } from '../utils/agendaDominio';
import { EXPO_PUBLIC_MAPS_KEY } from '../config';
import { numeroWhatsAppBR } from '../utils/telefoneWhatsapp';
import { abrirWhatsApp, exportarHtmlComoPdf } from '../utils/exportarDocumento';
import { montarHtmlRecibo } from '../utils/reciboPdf';
import { retornoDoOficio } from '../utils/posVenda';
import { formatCurrency } from '../utils/currency';
import { formatDate, formatDateTime } from '../utils/date';
import {
  calcularKpisCliente,
  coordenadasDoCliente,
  enderecoCompletoCliente,
  montarTimelineCliente,
  urlMapaEstatico,
  type ItemTimeline,
  type KpisCliente,
  type TipoItemTimeline,
} from '../utils/clienteDetalhe';
import {
  STATUS_EQUIP_LABELS,
  type Cliente,
  type Empresa,
  type Equipamento,
  type Recibo,
} from '../types';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rota = RouteProp<RootStackParamList, 'ClienteDetalhe'>;

/** Próximas visitas: um ano à frente basta para "a próxima" (inclui séries recorrentes). */
const JANELA_PROXIMA_VISITA_MS = 366 * 86_400_000;
/** A timeline desenha em lotes — cliente antigo pode ter centenas de documentos. */
const LOTE_TIMELINE = 40;

interface DadosCliente {
  cliente: Cliente;
  kpis: KpisCliente;
  timeline: ItemTimeline[];
  recibos: Map<string, Recibo>;
  empresa: Empresa | null;
  /** A leitura da empresa FALHOU (≠ empresa não cadastrada). */
  empresaFalhou: boolean;
}

type EstadoEquipamentos = { estado: 'ok'; lista: Equipamento[] } | { estado: 'erro' };

export default function ClienteDetalheScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rota>();
  const clienteId = route.params?.clienteId ?? '';
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const { temAcesso } = usePlano();
  const tipoConta = useTipoConta();
  const { pode } = usePermissao();

  // Quem está logado — o técnico só vê o que é dele (mesma regra da Agenda).
  const [usuario, setUsuario] = useState<EntradaEscopo['usuario']>({ status: 'carregando' });
  const lerUsuario = useCallback(() => {
    setUsuario({ status: 'carregando' });
    getCurrentUser()
      .then((u) => setUsuario({ status: 'ok', id: u?.id ?? null }))
      .catch(() => setUsuario({ status: 'ok', id: null }));
  }, []);
  useEffect(() => { lerUsuario(); }, [lerUsuario]);
  const escopo: EscopoAgenda = useMemo(() => resolverEscopoAgenda({
    papelResolvido: tipoConta.resolvido,
    papelCarregando: tipoConta.carregando,
    podeVerEquipe: pode('ver_agenda_equipe'),
    usuario,
  }), [tipoConta.resolvido, tipoConta.carregando, pode, usuario]);
  // Dinheiro (gasto pago, recibos) é camada de valores do negócio: negada ao técnico.
  const podeFinanceiro = tipoConta.resolvido && pode('ver_valores_agregados');

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [dados, setDados] = useState<DadosCliente | null>(null);
  const [equipamentos, setEquipamentos] = useState<EstadoEquipamentos>({ estado: 'ok', lista: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [limiteTimeline, setLimiteTimeline] = useState(LOTE_TIMELINE);
  const [abrindoReciboId, setAbrindoReciboId] = useState<string | null>(null);
  const [mapaFalhou, setMapaFalhou] = useState(false);

  const carregar = useCallback(async () => {
    // Papel/usuário ainda indefinidos: não lê nada (nem mostra a visão de gestão).
    if (escopo.status === 'carregando') { setCarregando(true); return; }
    if (escopo.status === 'erro') { setCarregando(false); return; }
    setErro(false);
    try {
      const agora = new Date();
      const [cliente, orcamentos, todasOrdens, recibos, todosAgendamentos, todasFuturas, leituraEmpresa] = await Promise.all([
        getCliente(clienteId),
        getOrcamentos(),
        getOrdens(),
        getRecibos(),
        getAgendamentos(),
        getAgendamentosExpandidos(agora.toISOString(), new Date(agora.getTime() + JANELA_PROXIMA_VISITA_MS).toISOString()),
        // Sem empresa a página ainda funciona (intervalo genérico do ofício). Falha
        // de leitura fica marcada: não pode virar "cadastre sua empresa".
        getEmpresa().then(
          (e) => ({ empresa: e, falhou: false }),
          () => ({ empresa: null, falhou: true }),
        ),
      ]);
      const empresa = leituraEmpresa.empresa;
      if (!cliente || cliente.excluidoEm) {
        setDados(null);
        return;
      }
      // Técnico: só as visitas e OS atribuídas a ele; gestão/conta pessoal: tudo.
      const agendamentos = aplicarEscopo(todosAgendamentos, escopo);
      const futuras = aplicarEscopo(todasFuturas, escopo);
      const ordens = escopo.status === 'propria'
        ? todasOrdens.filter((os) => os.tecnicoId === escopo.userId)
        : todasOrdens;
      // Recibos: a DATA ainda conta como "último serviço" para todos (não é valor),
      // mas a lista e os valores só chegam a quem pode ver dinheiro.
      const recibosVisiveis = podeFinanceiro ? recibos : [];
      const entrada = { clienteId: cliente.id, orcamentos, ordens, recibos: recibosVisiveis, agendamentos };
      setDados({
        cliente,
        kpis: calcularKpisCliente({
          ...entrada,
          recibos,
          ocorrenciasFuturas: futuras,
          mesesIntervalo: retornoDoOficio(empresa?.verticais).meses,
          agora,
        }),
        timeline: montarTimelineCliente(entrada),
        recibos: new Map(recibosVisiveis.filter((r) => r.clienteId === cliente.id).map((r) => [r.id, r] as const)),
        empresa,
        empresaFalhou: leituraEmpresa.falhou,
      });
      // Equipamentos são um extra: a falha deles não derruba a página inteira.
      try {
        setEquipamentos({ estado: 'ok', lista: await getEquipamentosDoCliente(cliente.id) });
      } catch {
        setEquipamentos({ estado: 'erro' });
      }
    } catch {
      // Leitura falhou de verdade — nunca vira "cliente sem histórico".
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [clienteId, escopo, podeFinanceiro]);

  useFocusEffect(useCallback(() => { void carregar(); }, [carregar]));
  useEffect(() => onSyncAplicado(() => { void carregar(); }), [carregar]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await carregar();
    setRefreshing(false);
  }, [carregar]);

  const cliente = dados?.cliente ?? null;
  const numeroWhats = useMemo(() => numeroWhatsAppBR(cliente?.telefone), [cliente?.telefone]);
  const digitosTelefone = (cliente?.telefone ?? '').replace(/[^\d+]/g, '');
  const podeLigar = digitosTelefone.replace(/\D/g, '').length >= 8;
  const endereco = cliente ? enderecoCompletoCliente(cliente) : '';
  const coordenada = useMemo(() => coordenadasDoCliente(cliente), [cliente]);
  const urlMapa = mapaFalhou ? null : urlMapaEstatico(coordenada, EXPO_PUBLIC_MAPS_KEY);

  // ─── AÇÕES RÁPIDAS ─────────────────────────────────────────────────────────
  async function chamarWhatsApp() {
    if (!cliente) return;
    if (!numeroWhats) {
      Alert.alert('WhatsApp', cliente.telefone?.trim()
        ? 'O telefone cadastrado não é um número de WhatsApp válido. Corrija o cadastro (DDD + número).'
        : 'Este cliente não tem telefone cadastrado.');
      return;
    }
    vibrar('selecao');
    const primeiroNome = cliente.nome.trim().split(/\s+/)[0] || cliente.nome;
    try {
      await abrirWhatsApp(numeroWhats, `Olá ${primeiroNome}!`);
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.');
    }
  }

  async function ligar() {
    if (!cliente) return;
    if (!podeLigar) {
      Alert.alert('Ligar', 'Este cliente não tem telefone cadastrado.');
      return;
    }
    vibrar('selecao');
    try {
      await Linking.openURL(`tel:${digitosTelefone}`);
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o telefone.');
    }
  }

  function novoOrcamento() {
    if (!cliente) return;
    vibrar('selecao');
    nav.navigate('NovoOrcamento', { clienteId: cliente.id });
  }

  function agendarVisita() {
    if (!cliente) return;
    vibrar('selecao');
    const enderecoVisita = [cliente.endereco, cliente.complemento, cliente.cidade, cliente.estado].filter(Boolean).join(', ');
    nav.navigate('Tabs', {
      screen: 'Agenda',
      params: { novoParaClienteId: cliente.id, novoParaClienteNome: cliente.nome, novoEndereco: enderecoVisita || undefined },
    });
  }

  function tracarRota() {
    const destino = coordenada ? `${coordenada.lat},${coordenada.lng}` : endereco;
    if (!destino) return;
    vibrar('selecao');
    void abrirRotaGoogleMaps(destino);
  }

  function abrirAgendamento(id: string) {
    nav.navigate('Tabs', { screen: 'Agenda', params: { abrirAgendamentoId: id } });
  }

  // ─── ABRIR DOCUMENTO DA TIMELINE ───────────────────────────────────────────
  async function abrirRecibo(id: string) {
    const recibo = dados?.recibos.get(id);
    const empresa = dados?.empresa;
    if (!recibo) return;
    if (!empresa && dados?.empresaFalhou) {
      Alert.alert('Não deu para abrir', 'Não conseguimos ler os dados da sua empresa agora. Puxe a tela para atualizar e tente de novo.');
      return;
    }
    if (!empresa) {
      Alert.alert('Cadastre sua empresa antes', 'Para abrir o PDF do recibo, cadastre os dados da sua empresa em Meu Negócio.');
      return;
    }
    if (abrindoReciboId) return;
    setAbrindoReciboId(id);
    try {
      // Mesmo HTML da tela de recibos (modelo e cor de marca da empresa).
      const html = await montarHtmlRecibo(recibo, empresa, {
        modelo: empresa.modeloReciboPadrao,
        corMarca: empresa.corMarca,
        removerMarca: temAcesso(RECURSO_REMOVE_MARCA),
      });
      await exportarHtmlComoPdf(html, `Recibo-${recibo.numero}`, { dialogTitle: `Recibo ${recibo.numero}` });
      // Mesmo efeito colateral das telas de recibo: a 1ª emissão marca o PDF como emitido.
      if (recibo.pdfEmitido === false) {
        await marcarReciboComoPdfEmitido(recibo).catch(() => {});
        void carregar();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message ? e.message : 'Não foi possível gerar o PDF deste recibo agora.';
      Alert.alert('Erro', msg);
    } finally {
      setAbrindoReciboId(null);
    }
  }

  function abrirItem(item: ItemTimeline) {
    vibrar('selecao');
    switch (item.tipo) {
      case 'orcamento':
        nav.navigate('VisualizarOrcamento', { orcamentoId: item.id });
        return;
      case 'os':
        nav.navigate('OrdemServico', { ordemId: item.id });
        return;
      case 'recibo':
        void abrirRecibo(item.id);
        return;
      case 'visita':
        abrirAgendamento(item.id);
        return;
    }
  }

  function abrirEquipamento(e: Equipamento) {
    vibrar('selecao');
    nav.navigate('Equipamento', e.qrToken ? { abrirToken: e.qrToken } : undefined);
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────
  const proximaVisitaId = dados?.kpis.proximaVisita?.agendamentoId ?? null;
  const subtitulo = cliente
    ? [cliente.telefone?.trim(), [cliente.cidade, cliente.estado].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || undefined
    : undefined;

  return (
    <View style={styles.container}>
      <GradientHeader
        title={cliente?.nome ?? 'Cliente'}
        subtitle={subtitulo}
        onBack={() => goBackOrHome(nav)}
      />

      {escopo.status === 'erro' ? (
        <View style={{ flex: 1 }}>
          <EmptyState
            icon="account-lock-outline"
            title="Não deu para confirmar seu acesso"
            subtitle="Não conseguimos saber o seu papel na equipe agora, então a página não mostra nada para não mostrar o que não devia. Verifique a conexão e tente de novo."
            actionLabel="Tentar de novo"
            onAction={() => { void tipoConta.recarregar(); lerUsuario(); }}
          />
        </View>
      ) : carregando ? (
        <View style={styles.conteudo}>
          <View style={styles.kpiGrid}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.kpiCard, { gap: 8 }]}>
                <OlliSkeleton width="50%" height={11} />
                <OlliSkeleton width="75%" height={20} />
              </View>
            ))}
          </View>
          <OlliSkeleton height={84} radius={BorderRadius.lg} />
          {[0, 1, 2].map((i) => <OlliSkeleton key={i} height={64} radius={BorderRadius.lg} />)}
        </View>
      ) : erro ? (
        <View style={{ flex: 1 }}>
          <EmptyState
            icon="alert-circle-outline"
            title="Não deu para carregar"
            subtitle="Não conseguimos buscar os dados deste cliente agora. Verifique a conexão e tente de novo."
            actionLabel="Tentar de novo"
            onAction={() => { setCarregando(true); void carregar(); }}
          />
        </View>
      ) : !dados || !cliente ? (
        <View style={{ flex: 1 }}>
          <EmptyState
            icon="account-question-outline"
            title="Cliente não encontrado"
            subtitle="Ele pode ter sido excluído (veja a Lixeira) ou ainda não chegou neste aparelho."
            actionLabel="Voltar para clientes"
            onAction={() => goBackOrHome(nav)}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.conteudo, { paddingBottom: insets.bottom + Spacing.xxl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[cores.primary]} tintColor={cores.primary} />}
        >
          {/* AÇÕES RÁPIDAS */}
          <AnimatedEntrance index={0}>
            <View style={styles.acoes}>
              <AcaoRapida
                icon="whatsapp"
                matiz={cores.whatsapp}
                label="WhatsApp"
                desabilitada={!numeroWhats}
                onPress={chamarWhatsApp}
              />
              <AcaoRapida icon="phone" matiz={cores.success} label="Ligar" desabilitada={!podeLigar} onPress={ligar} />
              <AcaoRapida icon="file-plus-outline" matiz={cores.primary} label="Orçamento" onPress={novoOrcamento} />
              <AcaoRapida icon="calendar-plus" matiz="#A78BFA" label="Agendar" onPress={agendarVisita} />
            </View>
          </AnimatedEntrance>

          {/* KPIs */}
          <AnimatedEntrance index={1}>
            <View style={styles.kpiGrid}>
              {podeFinanceiro ? (
                <Kpi
                  rotulo="Gasto total pago"
                  valor={formatCurrency(dados.kpis.gastoTotalPago)}
                  detalhe={dados.kpis.pagamentos > 0
                    ? `${dados.kpis.pagamentos} pagamento${dados.kpis.pagamentos === 1 ? '' : 's'}`
                    : 'Nenhum recibo ainda'}
                  destaque
                />
              ) : (
                // Técnico não vê valores do negócio: no lugar do gasto, quantos
                // orçamentos este cliente tem (o técnico também cria orçamento).
                <Kpi
                  rotulo="Orçamentos"
                  valor={String(dados.timeline.filter((i) => i.tipo === 'orcamento').length)}
                  detalhe="Deste cliente"
                />
              )}
              <Kpi
                rotulo="Último serviço"
                valor={dados.kpis.ultimoServico ? formatDate(dados.kpis.ultimoServico) : '—'}
                detalhe={dados.kpis.ultimoServico ? 'Concluído' : 'Sem serviço concluído'}
              />
              <Kpi
                rotulo="Próxima visita"
                valor={dados.kpis.proximaVisita ? formatDate(dados.kpis.proximaVisita.inicio) : '—'}
                detalhe={dados.kpis.proximaVisita
                  ? `${dados.kpis.proximaVisita.titulo} · ${horaDe(dados.kpis.proximaVisita.inicio)}`
                  : 'Nada marcado'}
                onPress={proximaVisitaId ? () => abrirAgendamento(proximaVisitaId) : undefined}
              />
              <Kpi
                rotulo="Próximo lembrete"
                valor={dados.kpis.proximoLembrete ? formatDate(dados.kpis.proximoLembrete.quando) : '—'}
                detalhe={dados.kpis.proximoLembrete
                  ? dados.kpis.proximoLembrete.vencido ? 'Já está na hora de lembrar' : 'Retorno do serviço'
                  : 'Depois do 1º serviço'}
                alerta={!!dados.kpis.proximoLembrete?.vencido}
              />
            </View>
          </AnimatedEntrance>

          {/* ENDEREÇO */}
          <AnimatedEntrance index={2}>
            <View style={styles.card}>
              <View style={styles.cardTituloLinha}>
                <MaterialCommunityIcons name="map-marker-outline" size={18} color={cores.primaryLight} />
                <Text style={styles.cardTitulo}>Endereço</Text>
              </View>
              {urlMapa ? (
                <Image
                  source={{ uri: urlMapa }}
                  style={styles.mapa}
                  resizeMode="cover"
                  onError={() => setMapaFalhou(true)}
                  accessibilityLabel={`Mapa do endereço de ${cliente.nome}`}
                />
              ) : null}
              <Text style={endereco ? styles.enderecoTexto : styles.textoMudo}>
                {endereco || 'Sem endereço cadastrado.'}
              </Text>
              {endereco || coordenada ? (
                <TouchableOpacity
                  style={styles.botaoRota}
                  onPress={tracarRota}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Traçar rota no Google Maps"
                >
                  <MaterialCommunityIcons name="navigation-variant-outline" size={18} color={cores.primaryLight} />
                  <Text style={styles.botaoRotaTexto}>Traçar rota</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </AnimatedEntrance>

          {/* EQUIPAMENTOS — só aparece quando há ativo (ou quando a leitura falhou). */}
          {equipamentos.estado === 'erro' ? (
            <View style={styles.card}>
              <View style={styles.cardTituloLinha}>
                <MaterialCommunityIcons name="air-conditioner" size={18} color={cores.primaryLight} />
                <Text style={styles.cardTitulo}>Equipamentos</Text>
              </View>
              <Text style={styles.textoMudo}>Não deu para carregar os equipamentos agora. Puxe a tela para tentar de novo.</Text>
            </View>
          ) : equipamentos.lista.length > 0 ? (
            <AnimatedEntrance index={3}>
              <View style={styles.card}>
                <View style={styles.cardTituloLinha}>
                  <MaterialCommunityIcons name="air-conditioner" size={18} color={cores.primaryLight} />
                  <Text style={styles.cardTitulo}>Equipamentos</Text>
                  <Text style={styles.contador}>{equipamentos.lista.length}</Text>
                </View>
                {equipamentos.lista.map((e) => {
                  const nome = [e.fabricante, e.modelo].filter(Boolean).join(' ') || e.codigoInterno || 'Equipamento';
                  const extra = [e.capacidadeBtu ? `${e.capacidadeBtu.toLocaleString('pt-BR')} BTU/h` : '', e.localizacao].filter(Boolean).join(' · ');
                  return (
                    <TouchableOpacity
                      key={e.id}
                      style={styles.linhaEquip}
                      onPress={() => abrirEquipamento(e)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Abrir equipamento ${nome}`}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linhaTitulo} numberOfLines={1}>{nome}</Text>
                        {extra ? <Text style={styles.linhaSub} numberOfLines={1}>{extra}</Text> : null}
                      </View>
                      <Text style={styles.linhaStatus}>{STATUS_EQUIP_LABELS[e.situacao] ?? e.situacao}</Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={cores.onSurfaceMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </AnimatedEntrance>
          ) : null}

          {/* LINHA DO TEMPO */}
          <View style={styles.secaoCabecalho}>
            <Text style={styles.secaoTitulo}>Histórico</Text>
            {dados.timeline.length > 0 ? <Text style={styles.contador}>{dados.timeline.length}</Text> : null}
          </View>
          {dados.timeline.length === 0 ? (
            <View style={[styles.card, styles.vazio]}>
              <MaterialCommunityIcons name="timeline-clock-outline" size={28} color={cores.onSurfaceMuted} />
              <Text style={styles.vazioTitulo}>Nenhum documento ainda</Text>
              <Text style={styles.textoMudo}>
                {podeFinanceiro
                  ? 'Orçamentos, ordens de serviço, recibos e visitas deste cliente aparecem aqui.'
                  : 'Orçamentos deste cliente e as ordens de serviço e visitas atribuídas a você aparecem aqui.'}
              </Text>
              <TouchableOpacity style={styles.botaoRota} onPress={novoOrcamento} activeOpacity={0.85} accessibilityRole="button">
                <MaterialCommunityIcons name="file-plus-outline" size={18} color={cores.primaryLight} />
                <Text style={styles.botaoRotaTexto}>Criar o primeiro orçamento</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.timeline}>
              {dados.timeline.slice(0, limiteTimeline).map((item) => (
                <LinhaTimeline
                  key={item.chave}
                  item={item}
                  carregando={item.tipo === 'recibo' && abrindoReciboId === item.id}
                  onPress={() => abrirItem(item)}
                />
              ))}
              {dados.timeline.length > limiteTimeline ? (
                <TouchableOpacity
                  style={styles.mostrarMais}
                  onPress={() => setLimiteTimeline((n) => n + LOTE_TIMELINE)}
                  accessibilityRole="button"
                >
                  <Text style={styles.botaoRotaTexto}>
                    Mostrar mais ({dados.timeline.length - limiteTimeline})
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── PEDAÇOS ─────────────────────────────────────────────────────────────────

/** "14:30" no fuso do aparelho. */
function horaDe(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
}

function AcaoRapida({ icon, matiz, label, onPress, desabilitada = false }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  matiz: string;
  label: string;
  onPress: () => void;
  desabilitada?: boolean;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  // `matiz` pinta só o fundo/borda translúcidos do chip; o glifo passa pelo ajuste
  // de contraste contra a superfície real (mesmo padrão do menu da lista).
  return (
    <TouchableOpacity
      style={[styles.acao, desabilitada && { opacity: 0.45 }]}
      // Desabilitada continua tocável: explica POR QUE (sem telefone / número inválido).
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: desabilitada }}
    >
      <View style={[styles.acaoIcone, { backgroundColor: `${matiz}1E`, borderColor: `${matiz}3A` }]}>
        <MaterialCommunityIcons name={icon} size={22} color={corCategoria(matiz, cores.surface)} />
      </View>
      <Text style={styles.acaoLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function Kpi({ rotulo, valor, detalhe, destaque = false, alerta = false, onPress }: {
  rotulo: string;
  valor: string;
  detalhe: string;
  destaque?: boolean;
  alerta?: boolean;
  onPress?: () => void;
}) {
  const styles = useEstilos(criarEstilos);
  const conteudo = (
    <>
      <Text style={styles.kpiRotulo} numberOfLines={1}>{rotulo}</Text>
      <Text style={[styles.kpiValor, destaque && styles.kpiValorDestaque]} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      <Text style={[styles.kpiDetalhe, alerta && styles.kpiDetalheAlerta]} numberOfLines={2}>{detalhe}</Text>
    </>
  );
  if (!onPress) return <View style={styles.kpiCard}>{conteudo}</View>;
  return (
    <TouchableOpacity style={styles.kpiCard} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${rotulo}: ${valor}`}>
      {conteudo}
    </TouchableOpacity>
  );
}

const ICONE_TIPO: Record<TipoItemTimeline, keyof typeof MaterialCommunityIcons.glyphMap> = {
  orcamento: 'file-document-outline',
  os: 'clipboard-check-outline',
  recibo: 'cash-check',
  visita: 'calendar-clock',
};

const ROTULO_TIPO: Record<TipoItemTimeline, string> = {
  orcamento: 'Orçamento',
  os: 'Ordem de serviço',
  recibo: 'Recibo',
  visita: 'Visita',
};

function LinhaTimeline({ item, carregando, onPress }: { item: ItemTimeline; carregando: boolean; onPress: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const matiz: Record<TipoItemTimeline, string> = {
    orcamento: cores.primary,
    os: '#F7B23B',
    recibo: cores.success,
    visita: '#A78BFA',
  };
  const m = matiz[item.tipo];
  const quando = item.quando ? (item.tipo === 'visita' ? formatDateTime(item.quando) : formatDate(item.quando)) : 'Sem data';
  return (
    <TouchableOpacity
      style={[styles.itemTimeline, item.inativo && { opacity: 0.62 }]}
      onPress={onPress}
      disabled={carregando}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${ROTULO_TIPO[item.tipo]}: ${item.titulo}, ${item.status}, ${quando}`}
    >
      <View style={[styles.itemIcone, { backgroundColor: `${m}1E`, borderColor: `${m}3A` }]}>
        <MaterialCommunityIcons name={ICONE_TIPO[item.tipo]} size={18} color={corCategoria(m, cores.surface)} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.linhaTitulo} numberOfLines={1}>{item.titulo}</Text>
        <Text style={styles.linhaSub} numberOfLines={1}>{quando} · {item.status}</Text>
      </View>
      {carregando
        ? <ActivityIndicator size="small" color={cores.primaryLight} />
        : item.valor !== null
          ? <Text style={[styles.itemValor, item.inativo && styles.itemValorRiscado]}>{formatCurrency(item.valor)}</Text>
          : <MaterialCommunityIcons name="chevron-right" size={18} color={cores.onSurfaceMuted} />}
    </TouchableOpacity>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  conteudo: { padding: Spacing.base, gap: Spacing.md },

  acoes: { flexDirection: 'row', gap: Spacing.sm },
  acao: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: Spacing.md,
    backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline,
    ...sombrasDe(c).sm,
  },
  acaoIcone: { width: 44, height: 44, borderRadius: BorderRadius.chip, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  acaoLabel: { fontSize: 12.5, fontWeight: '700', color: c.onSurface },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  kpiCard: {
    flexGrow: 1, flexBasis: '46%', minHeight: 92, padding: Spacing.md,
    backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline,
    ...sombrasDe(c).sm,
  },
  kpiRotulo: { ...Typography.label, color: c.onSurfaceVariant, textTransform: 'uppercase' },
  kpiValor: { fontSize: 19, fontWeight: '800', color: c.onSurface, marginTop: 6 },
  kpiValorDestaque: { ...Typography.value, fontSize: 21, color: c.onSurface },
  kpiDetalhe: { fontSize: 12, color: c.onSurfaceMuted, marginTop: 4 },
  kpiDetalheAlerta: { color: c.warning, fontWeight: '700' },

  card: {
    backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline,
    padding: Spacing.base, gap: Spacing.sm, ...sombrasDe(c).sm,
  },
  cardTituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitulo: { flex: 1, fontSize: 15, fontWeight: '800', color: c.onSurface },
  contador: { fontSize: 12, fontWeight: '800', color: c.onSurfaceVariant },
  mapa: { width: '100%', height: 150, borderRadius: BorderRadius.md, backgroundColor: c.surfaceVariant },
  enderecoTexto: { fontSize: 14, color: c.onSurface, lineHeight: 20 },
  textoMudo: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 19 },
  botaoRota: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.full,
    backgroundColor: c.primaryContainer, marginTop: 2,
  },
  botaoRotaTexto: { fontSize: 13.5, fontWeight: '800', color: c.primaryLight },

  linhaEquip: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.outline,
  },
  linhaTitulo: { fontSize: 14.5, fontWeight: '700', color: c.onSurface },
  linhaSub: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2 },
  linhaStatus: { fontSize: 12, fontWeight: '700', color: c.onSurfaceVariant },

  secaoCabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm, paddingHorizontal: 2 },
  secaoTitulo: { ...Typography.h4, fontWeight: '800', color: c.onSurface },
  vazio: { alignItems: 'center', paddingVertical: Spacing.xl },
  vazioTitulo: { fontSize: 15, fontWeight: '800', color: c.onSurface },

  timeline: { gap: Spacing.sm },
  itemTimeline: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
    backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline,
  },
  itemIcone: { width: 40, height: 40, borderRadius: BorderRadius.chip, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  itemValor: { fontSize: 14, fontWeight: '800', color: c.onSurface, marginLeft: 8 },
  itemValorRiscado: { textDecorationLine: 'line-through', color: c.onSurfaceMuted },
  mostrarMais: { alignItems: 'center', paddingVertical: Spacing.md },
});
