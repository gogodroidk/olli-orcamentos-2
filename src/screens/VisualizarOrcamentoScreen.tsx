import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Share, ActivityIndicator, Image,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow, Typography } from '../theme';
import { OlliCard } from '../components/OlliCard';
import { GradientHeader } from '../components/GradientHeader';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { OlliPressable } from '../components/OlliPressable';
import { Celebracao } from '../components/Celebracao';
import { OverlayProgresso } from '../components/OverlayProgresso';
import { getOrcamento, getEmpresa, getDepoimentos, saveOrcamento, getVersoesOrcamento } from '../database/database';
import { Orcamento, Empresa, Depoimento, StatusOrcamento, OrcamentoVersao, EventoTrilhaCliente, STATUS_LABELS, STATUS_COLORS } from '../types';
import { formatCurrency } from '../utils/currency';
import { formatDateTime, nowISO } from '../utils/date';
import { compartilharPdfOrcamento, abrirWhatsApp } from '../utils/pdfGenerator';
import { montarMensagemEnvioOrcamento, montarMensagemLinkOrcamento } from '../utils/mensagensOrcamento';
import { gerarLinkOrcamento, linkConfigurado, sincronizarStatusLinks, trilhaDoLink, puxarVersoesNuvemParaOrcamento } from '../services/clienteLink';
import { usePlano } from '../hooks/usePlano';
import type { Recurso } from '../services/planos';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';

// Recurso que remove o selo OLLI do PDF (Pro/Empresa). Frente C adiciona
// 'remove_olli_brand' ao type Recurso; codificamos contra o NOME do contrato.
// O cast mantém o call site válido até a união ser ampliada.
const RECURSO_REMOVE_MARCA = 'remove_olli_brand' as Recurso;

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'VisualizarOrcamento'>;

// Ações de status na ordem lógica do funil (mestre 13). Derivadas de uma única
// fonte (o type/labels/colors em ../types) para nunca divergir. 'visualizado' fica
// de fora da lista MANUAL: é um estado que o CLIENTE dispara pelo link (sync), não
// algo que o dono marca à mão — mas continua aparecendo no badge quando ocorre.
const STATUS_MANUAIS: StatusOrcamento[] = [
  'rascunho', 'enviado', 'em_negociacao', 'aguardando_assinatura',
  'aprovado', 'recusado', 'expirado', 'cancelado', 'convertido',
];
const STATUS_ACTIONS: Array<{ status: StatusOrcamento; label: string; color: string }> =
  STATUS_MANUAIS.map(status => ({ status, label: STATUS_LABELS[status], color: STATUS_COLORS[status] }));

export default function VisualizarOrcamentoScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { orcamentoId } = route.params;
  const { temAcesso } = usePlano();

  const [orc, setOrc] = useState<Orcamento | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([]);
  const [versoes, setVersoes] = useState<OrcamentoVersao[]>([]);
  const [trilha, setTrilha] = useState<EventoTrilhaCliente[]>([]);
  const [versoesAbertas, setVersoesAbertas] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [celebrando, setCelebrando] = useState(false);
  // Overlay de progresso — cobre a espera "silenciosa" de gerar/compartilhar
  // PDF ou link do cliente (mensagem varia conforme a ação em andamento).
  const [overlayInfo, setOverlayInfo] = useState<{ titulo: string; subtitulo: string } | null>(null);
  const statusAnteriorRef = useRef<StatusOrcamento | null>(null);

  useFocusEffect(useCallback(() => {
    async function load() {
      setCarregando(true);
      const [o, e, deps, vs] = await Promise.all([
        getOrcamento(orcamentoId), getEmpresa(), getDepoimentos(), getVersoesOrcamento(orcamentoId),
      ]);
      if (!o) {
        setOrc(null);
        setNaoEncontrado(true);
        setCarregando(false);
        return;
      }
      statusAnteriorRef.current = o.status;
      setOrc(o);
      setEmpresa(e);
      setDepoimentos(deps);
      setVersoes(vs);
      setNaoEncontrado(false);
      setCarregando(false);
      // Trilha do cliente (link público) — leitura VIVA, não bloqueia a tela: a
      // página já mostra os dados locais e a trilha aparece quando a nuvem responde.
      trilhaDoLink(orcamentoId).then(setTrilha).catch(() => setTrilha([]));
    }
    load();
    // sincronizarStatusLinks() nunca lança — traz de volta o status que o
    // cliente deu pelo link público (visualizado/aprovado/recusado). Não é
    // aguardado: a tela abre instantaneamente com os dados locais, e só recarrega
    // se algo realmente mudou, igual ao padrão já usado em OrcamentosScreen.
    sincronizarStatusLinks().then(alterados => {
      if (alterados > 0) load();
    });
    // Versões criadas em OUTRO aparelho/pela equipe: puxa da nuvem e, se algo novo
    // chegou, atualiza só a lista de versões (sem recarregar a tela inteira).
    puxarVersoesNuvemParaOrcamento(orcamentoId).then(aplicadas => {
      if (aplicadas > 0) getVersoesOrcamento(orcamentoId).then(setVersoes).catch(() => {});
    }).catch(() => {});
  }, [orcamentoId]));

  async function handleShare() {
    if (!orc || !empresa) return;
    setSharing(true);
    setOverlayInfo({ titulo: 'Gerando seu orçamento...', subtitulo: 'Deixando bonito para o cliente...' });
    try {
      await compartilharPdfOrcamento(orc, empresa, depoimentos, orc.corMarca, {
        removerMarca: temAcesso(RECURSO_REMOVE_MARCA),
      });
      if (orc.status === 'rascunho') await updateStatus('enviado');
    } catch (e: any) {
      // Quando o compartilhamento não está disponível no dispositivo, a
      // mensagem já vem específica (e diz onde o PDF foi salvo); nos demais
      // casos cai no texto genérico.
      Alert.alert('Erro', e?.message || 'Não foi possível gerar o PDF.');
    } finally {
      // SEMPRE volta o loading — inclusive na web, onde a impressão é assíncrona.
      setSharing(false);
      setOverlayInfo(null);
    }
  }

  async function handleWhatsApp() {
    if (!orc) return;
    if (!orc.clienteTelefone?.trim()) {
      Alert.alert('WhatsApp', 'Cliente sem telefone cadastrado.');
      return;
    }
    const msg = montarMensagemEnvioOrcamento(orc, empresa);
    try {
      await abrirWhatsApp(orc.clienteTelefone, msg);
      if (orc.status === 'rascunho') await updateStatus('enviado');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.');
    }
  }

  async function handleLinkCliente() {
    if (!orc) return;
    if (!linkConfigurado()) {
      Alert.alert(
        'Link do cliente',
        'Para enviar um link onde o cliente aprova com 1 toque, ative o backup na nuvem (tela Conta) e configure o domínio do app. Por enquanto, use o WhatsApp ou o PDF.',
      );
      return;
    }
    setLinking(true);
    setOverlayInfo({ titulo: 'Gerando o link do cliente...', subtitulo: 'Preparando a página de aprovação...' });
    try {
      const url = await gerarLinkOrcamento(orc, empresa);
      if (orc.status === 'rascunho') await updateStatus('enviado');
      await Share.share({
        message: montarMensagemLinkOrcamento(orc, empresa, url),
      });
    } catch (e: any) {
      Alert.alert('Não consegui gerar o link', e?.message ?? 'Tente novamente.');
    } finally {
      setLinking(false);
      setOverlayInfo(null);
    }
  }

  async function updateStatus(s: StatusOrcamento) {
    if (!orc) return;
    const updated = { ...orc, status: s, atualizadoEm: nowISO() };
    await saveOrcamento(updated);
    if (s === 'aprovado' && statusAnteriorRef.current !== 'aprovado') {
      setCelebrando(true);
    }
    statusAnteriorRef.current = s;
    setOrc(updated);
    setShowStatusMenu(false);
  }

  // Abre a Agenda já criando um agendamento ligado a este orçamento/cliente.
  function agendarVisita() {
    if (!orc) return;
    nav.navigate('Tabs', {
      screen: 'Agenda',
      params: {
        novoParaClienteId: orc.clienteId || undefined,
        novoParaClienteNome: orc.clienteNome,
        novoParaOrcamentoId: orc.id,
        novoEndereco: orc.clienteEndereco || undefined,
        novoTitulo: `Orçamento nº ${orc.numero}`,
      },
    });
  }

  // Abre os orçamentos deste cliente (CRM). Sem clienteId (orçamento avulso) só avisa.
  function verCliente() {
    if (!orc) return;
    if (!orc.clienteId) {
      Alert.alert('Cliente', 'Este orçamento não está vinculado a um cliente cadastrado.');
      return;
    }
    nav.navigate('Orcamentos', { clienteId: orc.clienteId, clienteNome: orc.clienteNome });
  }

  if (naoEncontrado) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <GradientHeader title="Orçamento" onBack={() => goBackOrHome(nav)} compact />
        <EmptyState
          icon="file-remove-outline"
          title="Orçamento não encontrado"
          subtitle="Este orçamento não existe mais ou foi removido."
          actionLabel="Voltar"
          onAction={() => goBackOrHome(nav)}
        />
      </View>
    );
  }

  if (!orc || carregando) return <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={Colors.primary} /></View>;

  const Row = ({ label, value }: { label: string; value?: string }) =>
    value ? (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    ) : null;

  const fechamentoChecks = [
    { label: 'Logo da empresa', ok: !!empresa?.logoUri },
    { label: 'Validade definida', ok: !!orc.validadeOrcamento },
    { label: 'Garantia clara', ok: !!orc.garantia },
    { label: 'Pagamento explicado', ok: !!orc.condicoesPagamento },
    { label: 'Aprovação ativa', ok: orc.exibirAprovacao !== false || linkConfigurado() },
  ];
  const fechamentoOk = fechamentoChecks.filter(c => c.ok).length;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <GradientHeader title={`Orçamento nº ${orc.numero}`} subtitle={orc.clienteNome} onBack={() => goBackOrHome(nav)} compact>
        <View style={styles.actionBar}>
          <ActionBtn icon="pencil" label="Editar" onPress={() => nav.navigate('EditarOrcamento', { orcamentoId: orc.id })} />
          <ActionBtn icon="link-variant" label="Link" onPress={handleLinkCliente} loading={linking} />
          <ActionBtn icon="whatsapp" label="WhatsApp" onPress={handleWhatsApp} />
          <ActionBtn icon="file-pdf-box" label="PDF" onPress={handleShare} loading={sharing} />
          <ActionBtn icon="receipt" label="Recibo" onPress={() => nav.navigate('EmitirRecibo', { orcamentoId: orc.id })} />
          <ActionBtn icon="calendar-plus" label="Agendar" onPress={agendarVisita} />
        </View>
      </GradientHeader>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }}>
        {/* STATUS */}
        <View style={styles.statusRow}>
          <View>
            <Text style={styles.numLabel}>Orçamento nº {orc.numero}</Text>
            <Text style={styles.dateLabel}>{formatDateTime(orc.criadoEm)}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowStatusMenu(!showStatusMenu)}>
            <StatusBadge status={orc.status} />
          </TouchableOpacity>
        </View>

        {/* STATUS MENU */}
        {showStatusMenu && (
          <OlliCard style={{ padding: 4, marginBottom: Spacing.base }}>
            <Text style={styles.menuTitle}>Alterar status:</Text>
            {STATUS_ACTIONS.map(a => (
              <TouchableOpacity
                key={a.status}
                style={[styles.menuItem, orc.status === a.status && { backgroundColor: a.color + '15' }]}
                onPress={() => updateStatus(a.status)}
              >
                <View style={[styles.menuDot, { backgroundColor: a.color }]} />
                <Text style={[styles.menuLabel, orc.status === a.status && { color: a.color, fontWeight: '700' }]}>{a.label}</Text>
                {orc.status === a.status && <MaterialCommunityIcons name="check" size={16} color={a.color} />}
              </TouchableOpacity>
            ))}
          </OlliCard>
        )}

        <OlliCard style={styles.closeCard}>
          <View style={styles.closeTop}>
            <View style={styles.closeIcon}>
              <MaterialCommunityIcons name="handshake-outline" size={24} color={Colors.accentLight} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.closeEyebrow}>Fechar negócio</Text>
              <Text style={styles.closeTitle}>Envie uma proposta pronta para aprovação</Text>
              <Text style={styles.closeSub}>
                {fechamentoOk}/{fechamentoChecks.length} sinais de confiança configurados
              </Text>
            </View>
          </View>

          <OlliPressable style={styles.closePrimary} onPress={handleWhatsApp} haptic="light">
            <MaterialCommunityIcons name="whatsapp" size={20} color="#0A1626" />
            <Text style={styles.closePrimaryText}>Enviar no WhatsApp</Text>
          </OlliPressable>

          <View style={styles.closeActions}>
            <CloseAction icon="link-variant" label="Link" onPress={handleLinkCliente} loading={linking} />
            <CloseAction icon="file-pdf-box" label="PDF" onPress={handleShare} loading={sharing} />
            <CloseAction icon="calendar-plus" label="Agendar" onPress={agendarVisita} />
          </View>

          <View style={styles.closeChecklist}>
            {fechamentoChecks.map(check => (
              <View key={check.label} style={styles.closeCheck}>
                <MaterialCommunityIcons
                  name={check.ok ? 'check-circle' : 'alert-circle-outline'}
                  size={15}
                  color={check.ok ? Colors.success : Colors.warning}
                />
                <Text style={[styles.closeCheckText, !check.ok && styles.closeCheckTextWarn]}>{check.label}</Text>
              </View>
            ))}
          </View>
        </OlliCard>

        {/* CLIENTE — toque para ver os orçamentos deste cliente (CRM) */}
        <OlliCard onPress={verCliente} style={{ padding: Spacing.base, marginBottom: 12 }}>
          <View style={styles.clientHeader}>
            <Text style={styles.cardTitle}>Cliente</Text>
            {orc.clienteId ? (
              <View style={styles.clientLink}>
                <Text style={styles.clientLinkText}>ver orçamentos</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.accent} />
              </View>
            ) : null}
          </View>
          <Text style={styles.clientName}>{orc.clienteNome}</Text>
          <Text style={styles.clientInfo}>{orc.clienteTelefone}</Text>
          {orc.clienteCpfCnpj && <Text style={styles.clientInfo}>CPF/CNPJ: {orc.clienteCpfCnpj}</Text>}
          {orc.clienteEndereco && <Text style={styles.clientInfo}>{orc.clienteEndereco}</Text>}
        </OlliCard>

        {/* ITENS */}
        {orc.itens.length > 0 && (
          <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
            <Text style={styles.cardTitle}>Itens ({orc.itens.length})</Text>
            {orc.itens.map(item => (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.nome}</Text>
                  <Text style={styles.itemQty}>{item.quantidade} {item.unidade} × {formatCurrency(item.preco)}</Text>
                </View>
                <Text style={styles.itemSubtotal}>{formatCurrency(item.subtotal)}</Text>
              </View>
            ))}
          </OlliCard>
        )}

        {/* FOTOS DO SERVIÇO — faixa horizontal (registro fotográfico entra no PDF também) */}
        {!!orc.fotosServico?.length && (
          <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
            <Text style={styles.cardTitle}>Fotos do serviço ({orc.fotosServico.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fotosRow}>
              {orc.fotosServico.map(uri => (
                <Image key={uri} source={{ uri }} style={styles.fotoStrip} />
              ))}
            </ScrollView>
          </OlliCard>
        )}

        {/* TOTAIS */}
        <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
          <Text style={styles.cardTitle}>Resumo financeiro</Text>
          {orc.subtotalServicos > 0 && <Row label="Serviços" value={formatCurrency(orc.subtotalServicos)} />}
          {orc.subtotalProdutos > 0 && <Row label="Produtos" value={formatCurrency(orc.subtotalProdutos)} />}
          {orc.subtotal - orc.valorTotal > 0 && <Row label="Desconto" value={`-${formatCurrency(orc.subtotal - orc.valorTotal)}`} />}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(orc.valorTotal)}</Text>
          </View>
        </OlliCard>

        {/* DETALHES */}
        <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
          <Text style={styles.cardTitle}>Detalhes</Text>
          {orc.modeloNome && <Row label="Modelo PDF" value={orc.modeloNome} />}
          {orc.validadeOrcamento && <Row label="Válido até" value={orc.validadeOrcamento} />}
          {orc.dataVisitaTecnica && <Row label="Visita técnica" value={orc.dataVisitaTecnica} />}
          {orc.agendamentoServico && <Row label="Agendamento" value={orc.agendamentoServico} />}
          {orc.condicoesPagamento && <Row label="Pagamento" value={orc.condicoesPagamento} />}
          {orc.garantia && <Row label="Garantia" value={orc.garantia} />}
          {orc.condicoesContratuais && (
            <View style={styles.textBlock}>
              <Text style={styles.rowLabel}>Condições contratuais</Text>
              <Text style={styles.textBlockContent}>{orc.condicoesContratuais}</Text>
            </View>
          )}
        </OlliCard>

        {/* TRILHA DO CLIENTE (link público) — o que o cliente fez com a proposta */}
        {trilha.length > 0 && (
          <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
            <Text style={styles.cardTitle}>Trilha do cliente</Text>
            {trilha.map((ev, i) => (
              <TrilhaLinha key={`${ev.tipo}-${i}`} evento={ev} ultimo={i === trilha.length - 1} />
            ))}
          </OlliCard>
        )}

        {/* HISTÓRICO DE VERSÕES — snapshots congelados antes de cada edição enviada */}
        {versoes.length > 0 && (
          <OlliCard style={{ padding: Spacing.base, marginBottom: 12 }}>
            <TouchableOpacity
              style={styles.versoesHeader}
              onPress={() => setVersoesAbertas(v => !v)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Versões anteriores ({versoes.length})</Text>
                <Text style={styles.versoesHint}>
                  Guardamos o que o cliente viu antes de cada alteração.
                </Text>
              </View>
              <MaterialCommunityIcons
                name={versoesAbertas ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={Colors.onSurfaceVariant}
              />
            </TouchableOpacity>
            {versoesAbertas && versoes.map(v => (
              <View key={v.id} style={styles.versaoItem}>
                <View style={styles.versaoTop}>
                  <View style={styles.versaoBadge}>
                    <Text style={styles.versaoBadgeText}>v{v.numeroVersao}</Text>
                  </View>
                  <Text style={styles.versaoData}>{formatDateTime(v.criadoEm)}</Text>
                  <Text style={styles.versaoValor}>{formatCurrency(v.dados.valorTotal ?? 0)}</Text>
                </View>
                <Text style={styles.versaoResumo}>
                  {(v.dados.itens?.length ?? 0)} {(v.dados.itens?.length ?? 0) === 1 ? 'item' : 'itens'}
                  {v.dados.validadeOrcamento ? ` · válido até ${v.dados.validadeOrcamento}` : ''}
                </Text>
              </View>
            ))}
          </OlliCard>
        )}
      </ScrollView>

      <Celebracao visible={celebrando} tipo="aprovado" onDone={() => setCelebrando(false)} />
      <OverlayProgresso
        visible={!!overlayInfo}
        titulo={overlayInfo?.titulo}
        subtitulo={overlayInfo?.subtitulo}
      />
    </View>
  );
}

// Metadados visuais de cada tipo de evento da trilha do cliente.
const TRILHA_META: Record<EventoTrilhaCliente['tipo'], { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; label: string }> = {
  enviado: { icon: 'send', color: '#3B82F6', label: 'Proposta enviada' },
  visualizado: { icon: 'eye-outline', color: '#8B5CF6', label: 'Cliente visualizou' },
  aprovado: { icon: 'check-circle', color: '#10B981', label: 'Cliente aprovou' },
  recusado: { icon: 'close-circle', color: '#EF4444', label: 'Cliente recusou' },
};

function TrilhaLinha({ evento, ultimo }: { evento: EventoTrilhaCliente; ultimo: boolean }) {
  const meta = TRILHA_META[evento.tipo];
  return (
    <View style={styles.trilhaRow}>
      <View style={styles.trilhaGutter}>
        <View style={[styles.trilhaDot, { backgroundColor: meta.color }]}>
          <MaterialCommunityIcons name={meta.icon} size={12} color="#fff" />
        </View>
        {!ultimo && <View style={styles.trilhaLine} />}
      </View>
      <View style={{ flex: 1, paddingBottom: ultimo ? 0 : 14 }}>
        <Text style={styles.trilhaLabel}>{meta.label}</Text>
        {evento.em ? <Text style={styles.trilhaData}>{formatDateTime(evento.em)}</Text> : null}
        {evento.tipo === 'recusado' && evento.motivo ? (
          <View style={styles.trilhaMotivo}>
            <Text style={styles.trilhaMotivoLabel}>Motivo informado</Text>
            <Text style={styles.trilhaMotivoText}>{evento.motivo}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ActionBtn({ icon, label, onPress, loading }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void; loading?: boolean }) {
  return (
    <OlliPressable style={styles.actionBarBtn} onPress={onPress} disabled={loading}>
      {loading ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name={icon} size={22} color="#fff" />}
      <Text style={styles.actionBarLabel}>{label}</Text>
    </OlliPressable>
  );
}

function CloseAction({ icon, label, onPress, loading }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void; loading?: boolean }) {
  return (
    <OlliPressable style={styles.closeActionBtn} onPress={onPress} disabled={loading}>
      {loading ? <ActivityIndicator size="small" color={Colors.accentLight} /> : <MaterialCommunityIcons name={icon} size={19} color={Colors.accentLight} />}
      <Text style={styles.closeActionText}>{label}</Text>
    </OlliPressable>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    flexDirection: 'row', paddingTop: 14, gap: 8,
  },
  actionBarBtn: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingVertical: 12, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  actionBarLabel: { fontSize: 11, color: '#fff', fontWeight: '700' },

  statusRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: 12, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.outline,
  },
  numLabel: { fontSize: 18, fontWeight: '800', color: Colors.onSurface },
  dateLabel: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },

  menuTitle: { fontSize: 12, color: Colors.onSurfaceVariant, fontWeight: '600', padding: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderRadius: BorderRadius.md },
  menuDot: { width: 10, height: 10, borderRadius: 5 },
  menuLabel: { flex: 1, fontSize: 14, color: Colors.onSurface },

  closeCard: { padding: Spacing.base, marginBottom: 12, borderColor: Colors.strokeGlow },
  closeTop: { flexDirection: 'row', alignItems: 'center' },
  closeIcon: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: 'rgba(127,233,245,0.12)',
    borderWidth: 1, borderColor: 'rgba(127,233,245,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeEyebrow: { fontSize: 11, fontWeight: '800', color: Colors.accentLight, textTransform: 'uppercase', letterSpacing: 0.4 },
  closeTitle: { fontSize: 16, fontWeight: '800', color: Colors.onSurface, marginTop: 2 },
  closeSub: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 2 },
  closePrimary: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accentLight,
    borderRadius: BorderRadius.full,
    paddingVertical: 13,
  },
  closePrimaryText: { fontSize: 14.5, fontWeight: '800', color: '#0A1626' },
  closeActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  closeActionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.strokeGlow,
    backgroundColor: Colors.surfacePressed,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  closeActionText: { fontSize: 11.5, fontWeight: '800', color: Colors.accentLight },
  closeChecklist: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  closeCheck: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 6 },
  closeCheckText: { fontSize: 11.5, fontWeight: '700', color: Colors.onSurfaceVariant },
  closeCheckTextWarn: { color: Colors.warning },

  cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.onSurfaceVariant, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  clientHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clientLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  clientLinkText: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  clientName: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  clientInfo: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 3 },

  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  itemName: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  itemQty: { fontSize: 12, color: Colors.onSurfaceVariant },
  itemSubtotal: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  fotosRow: { gap: 10, paddingRight: 4 },
  fotoStrip: { width: 96, height: 96, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceVariant },

  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  rowLabel: { fontSize: 13, color: Colors.onSurfaceVariant },
  rowValue: { fontSize: 13, fontWeight: '600', color: Colors.onSurface, maxWidth: '60%', textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: Colors.onSurface },
  totalValue: { ...Typography.valueLarge, color: Colors.accentLight },

  textBlock: { paddingTop: 8 },
  textBlockContent: { fontSize: 13, color: Colors.onSurface, lineHeight: 20, marginTop: 4 },

  // Trilha do cliente (timeline)
  trilhaRow: { flexDirection: 'row', gap: 12 },
  trilhaGutter: { alignItems: 'center', width: 24 },
  trilhaDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trilhaLine: { width: 2, flex: 1, backgroundColor: Colors.outline, marginTop: 2 },
  trilhaLabel: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  trilhaData: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  trilhaMotivo: {
    marginTop: 8, padding: 10, borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)',
  },
  trilhaMotivoLabel: { fontSize: 10.5, fontWeight: '800', color: '#EF4444', textTransform: 'uppercase', letterSpacing: 0.4 },
  trilhaMotivoText: { fontSize: 13, color: Colors.onSurface, lineHeight: 19, marginTop: 3 },

  // Histórico de versões
  versoesHeader: { flexDirection: 'row', alignItems: 'center' },
  versoesHint: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: -4, marginBottom: 2 },
  versaoItem: {
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.outline,
  },
  versaoTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  versaoBadge: {
    backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  versaoBadgeText: { fontSize: 11, fontWeight: '800', color: Colors.onSurfaceVariant },
  versaoData: { flex: 1, fontSize: 12.5, color: Colors.onSurfaceVariant },
  versaoValor: { fontSize: 13.5, fontWeight: '700', color: Colors.onSurface },
  versaoResumo: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 4 },
});
