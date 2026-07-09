import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Alert, FlatList, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { OlliCard } from '../components/OlliCard';
import { EmptyState } from '../components/EmptyState';
import { OverlayProgresso } from '../components/OverlayProgresso';
import { getOrcamento, getEmpresa, getNextReciboNumber, saveRecibo, getRecibos } from '../database/database';
import { getReciboDoOrcamento, marcarReciboComoPdfEmitido } from '../services/pagamentos';
import { Recibo, Empresa, Orcamento } from '../types';
import { formatCurrency } from '../utils/currency';
import { formatDateTime, nowISO, todayISO } from '../utils/date';
import { isoToBR } from '../utils/masks';
import { generateId } from '../utils/id';
import { exportarHtmlComoPdf } from '../utils/exportarDocumento';
import { imagemParaDataUri } from '../utils/imagemDataUri';
import { escapeHtml } from '../utils/html';
import { footerSeloOlliHtml } from '../utils/pdfGenerator';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { GuardaPapel } from '../components/GuardaPapel';

type Route = RouteProp<RootStackParamList, 'EmitirRecibo'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const FORMAS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência'];

type Aba = 'novo' | 'emitidos';

export default function EmitirReciboScreen() {
  // Recibo é documento financeiro (valor recebido, forma de pagamento, PIX da
  // empresa) — parte da camada de valores do negócio, negada ao técnico.
  return (
    <GuardaPapel acao="ver_valores_agregados" area="Emitir recibo">
      <EmitirReciboConteudo />
    </GuardaPapel>
  );
}

function EmitirReciboConteudo() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const orcamentoId = route.params?.orcamentoId;

  const [aba, setAba] = useState<Aba>('novo');
  const [carregandoEmpresa, setCarregandoEmpresa] = useState(true);
  const [orc, setOrc] = useState<Orcamento | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [numero, setNumero] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [valorRecebido, setValorRecebido] = useState(0);
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [dataRecebimento, setDataRecebimento] = useState(isoToBR(todayISO()));
  const [sharing, setSharing] = useState(false);
  // Overlay de progresso — cobre a espera "silenciosa" de gerar/compartilhar o PDF do recibo.
  const [overlayInfo, setOverlayInfo] = useState<{ titulo: string; subtitulo: string } | null>(null);

  // Histórico de recibos já emitidos (aba "Emitidos").
  const [emitidos, setEmitidos] = useState<Recibo[]>([]);
  const [carregandoEmitidos, setCarregandoEmitidos] = useState(false);
  const [reenviandoId, setReenviandoId] = useState<string | null>(null);

  // Recibo com pagamento já registrado (ex.: pelo botão "Registrar pagamento" na
  // lista de orçamentos) mas cujo PDF ainda não foi gerado/compartilhado. Ao abrir
  // esta tela a partir do mesmo orçamento, reaproveitamos ESTE registro em vez de
  // criar um recibo duplicado — só marcamos `pdfEmitido: true` nele.
  const [reciboPendente, setReciboPendente] = useState<Recibo | null>(null);

  useEffect(() => {
    async function initOrcamento() {
      if (orcamentoId) {
        const o = await getOrcamento(orcamentoId);
        if (o) {
          setOrc(o);
          setClienteNome(o.clienteNome);
          setClienteTelefone(o.clienteTelefone);
          setValorRecebido(o.valorTotal);
        }
        try {
          const recibos = await getRecibos();
          const pendente = getReciboDoOrcamento(orcamentoId, recibos);
          // Só reaproveita como "pendente" quando pdfEmitido é explicitamente
          // false. Ausente (recibo LEGADO, anterior a este campo) já foi
          // emitido na época — não deve ser retomado/renumerado aqui.
          if (pendente && pendente.pdfEmitido === false) {
            setReciboPendente(pendente);
            setClienteNome(pendente.clienteNome);
            setClienteTelefone(pendente.clienteTelefone);
            setValorRecebido(pendente.valorRecebido);
            setFormaPagamento(pendente.formaPagamento);
            setDataRecebimento(pendente.dataRecebimento);
          }
        } catch {
          // sem recibo pendente encontrado: segue o fluxo normal (cria um novo)
        }
      }
    }
    initOrcamento();
  }, [orcamentoId]);

  // Recarrega a empresa a cada vez que a tela ganha foco: cobre o caso de o
  // usuário sair pelo CTA "Ir para Meu Negócio", cadastrar a empresa e voltar
  // — sem isso, `empresa` continuava null e o botão de gerar ficava travado.
  useFocusEffect(useCallback(() => {
    let vivo = true;
    // IMPORTANTE: NÃO chamar getNextReciboNumber() aqui. Esse helper INCREMENTA
    // e PERSISTE o contador — só abrir a tela e sair queimaria o número. O número
    // real é obtido apenas no momento do salvar (handleGerar). Até lá exibimos
    // um placeholder neutro no cabeçalho.
    setCarregandoEmpresa(true);
    getEmpresa()
      .then(emp => { if (vivo) setEmpresa(emp); })
      .catch(() => { /* falha de leitura: trata como sem empresa, sem travar a tela */ })
      .finally(() => { if (vivo) setCarregandoEmpresa(false); });
    return () => { vivo = false; };
  }, []));

  const carregarEmitidos = useCallback(async () => {
    setCarregandoEmitidos(true);
    try {
      const lista = await getRecibos();
      setEmitidos(lista);
    } catch {
      setEmitidos([]);
    } finally {
      setCarregandoEmitidos(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (aba === 'emitidos') carregarEmitidos();
  }, [aba, carregarEmitidos]));

  async function buildHtml(r: Recibo): Promise<string> {
    if (!empresa) return '';

    // Converte as imagens em data URI ANTES de montar o HTML (igual ao PDF do
    // orçamento via populateImages/img). Em qualquer falha a conversão devolve
    // null e a imagem é simplesmente omitida — nunca quebra o documento.
    const [logoData, assinaturaData] = await Promise.all([
      imagemParaDataUri(empresa.logoUri),
      imagemParaDataUri(r.assinaturaPrestadorUri ?? empresa.assinaturaUri),
    ]);

    // Campos de string livre do usuário escapados (XSS / quebra de layout).
    const empresaNome = escapeHtml(empresa.nome);
    const empresaEspecialidade = escapeHtml(empresa.especialidade);
    const empresaCnpj = escapeHtml(empresa.cnpj);
    const empresaTelefone = escapeHtml(empresa.telefone);
    const empresaPrestador = escapeHtml(empresa.nomePrestador);
    const empresaPix = escapeHtml(empresa.chavePix);
    const clienteNomeHtml = escapeHtml(r.clienteNome);
    const clienteTelefoneHtml = escapeHtml(r.clienteTelefone);
    const dataRecebimentoHtml = escapeHtml(r.dataRecebimento);
    const formaPagamentoHtml = escapeHtml(r.formaPagamento);
    const orcamentoNumeroHtml = escapeHtml(r.orcamentoNumero);
    const numeroHtml = escapeHtml(r.numero);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #212121; margin: 0; }
  .page { padding: 32px; max-width: 700px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0B6FCE; padding-bottom: 16px; margin-bottom: 20px; }
  .brand-logo { max-height: 56px; max-width: 200px; margin-bottom: 8px; display: block; }
  .empresa-nome { font-size: 20px; font-weight: 700; color: #0B6FCE; }
  .empresa-info { font-size: 12px; color: #555; line-height: 1.6; }
  .recibo-title { font-size: 28px; font-weight: 800; text-align: center; color: #0B6FCE; margin: 24px 0 16px; letter-spacing: 4px; }
  .recibo-num { text-align: center; font-size: 14px; color: #555; margin-bottom: 24px; }
  .info-box { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: #777; font-size: 12px; }
  .info-value { font-weight: 600; font-size: 13px; }
  .valor-box { background: #0B6FCE; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
  .valor-label { font-size: 12px; opacity: 0.8; }
  .valor-num { font-size: 32px; font-weight: 800; margin-top: 4px; }
  .pix-box { border: 1px dashed #0B6FCE; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; background: #f3f8fe; }
  .pix-label { color: #0B6FCE; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .pix-key { font-size: 14px; font-weight: 600; margin-top: 4px; word-break: break-all; }
  .assinatura-row { display: flex; justify-content: space-between; margin-top: 48px; }
  .assinatura-block { text-align: center; min-width: 200px; }
  .sign-img { max-height: 56px; max-width: 200px; display: block; margin: 0 auto -6px; }
  .assinatura-line { border-top: 1px solid #ccc; padding-top: 8px; font-size: 12px; color: #555; margin-top: 40px; }
  .footer { border-top: 1px solid #e0e0e0; padding-top: 10px; margin-top: 24px; font-size: 11px; color: #888; text-align: center; }
  .footer-seal { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 10.5px; color: #B0B7C2; font-weight: 600; margin-top: 8px; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      ${logoData ? `<img src="${logoData}" class="brand-logo" />` : ''}
      <div class="empresa-nome">${empresaNome}</div>
      <div class="empresa-info">${empresaEspecialidade}<br/>CNPJ: ${empresaCnpj}<br/>${empresaTelefone}</div>
    </div>
    <div class="empresa-info" style="text-align:right">Documento gerado em<br/>${formatDateTime(r.criadoEm)}</div>
  </div>

  <div class="recibo-title">RECIBO</div>
  <div class="recibo-num">Nº ${numeroHtml}</div>

  <div class="info-box">
    <div class="info-row"><span class="info-label">Cliente</span><span class="info-value">${clienteNomeHtml}</span></div>
    <div class="info-row"><span class="info-label">Telefone</span><span class="info-value">${clienteTelefoneHtml}</span></div>
    <div class="info-row"><span class="info-label">Data do recebimento</span><span class="info-value">${dataRecebimentoHtml}</span></div>
    <div class="info-row"><span class="info-label">Forma de pagamento</span><span class="info-value">${formaPagamentoHtml}</span></div>
    ${r.orcamentoNumero ? `<div class="info-row"><span class="info-label">Referente ao orçamento</span><span class="info-value">Nº ${orcamentoNumeroHtml}</span></div>` : ''}
  </div>

  <div class="valor-box">
    <div class="valor-label">Valor recebido</div>
    <div class="valor-num">${formatCurrency(r.valorRecebido)}</div>
  </div>

  ${empresa.chavePix ? `<div class="pix-box">
    <div class="pix-label">PIX</div>
    <div class="pix-key">${empresaPix}</div>
  </div>` : ''}

  <p style="font-size:13px;color:#444;text-align:center;">
    Recebi de <strong>${clienteNomeHtml}</strong> a importância de <strong>${formatCurrency(r.valorRecebido)}</strong>
    referente aos serviços prestados pela <strong>${empresaNome}</strong>.
    Emitido em ${dataRecebimentoHtml}.
  </p>

  <div class="assinatura-row">
    <div class="assinatura-block">
      ${assinaturaData ? `<img src="${assinaturaData}" class="sign-img" />` : ''}
      <div class="assinatura-line">
        <strong>${empresaPrestador}</strong><br/>
        ${empresaNome}<br/>
        CNPJ: ${empresaCnpj}
      </div>
    </div>
    <div class="assinatura-block">
      <div class="assinatura-line">
        <strong>${clienteNomeHtml}</strong><br/>
        Cliente
      </div>
    </div>
  </div>

  <div class="footer">${empresaNome} · CNPJ: ${empresaCnpj} · ${empresaTelefone}</div>
  <div class="footer-seal">${footerSeloOlliHtml()}</div>
</div>
</body>
</html>`;
  }

  async function handleGerar() {
    if (carregandoEmpresa) {
      Alert.alert('Aguarde', 'Ainda estamos carregando os dados da sua empresa.');
      return;
    }
    // Sem empresa cadastrada o PDF sairia em branco (sem nome, CNPJ, PIX,
    // assinatura) e seria entregue ao cliente assim mesmo, sem nenhum aviso —
    // bloqueamos aqui e orientamos o usuário a cadastrar a empresa primeiro.
    if (!empresa) {
      Alert.alert(
        'Cadastre sua empresa antes',
        'Para emitir um recibo, cadastre os dados da sua empresa em Meu Negócio.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Ir para Meu Negócio', onPress: () => nav.navigate('MeuNegocio') },
        ],
      );
      return;
    }
    if (!clienteNome.trim() || !valorRecebido) {
      Alert.alert('Atenção', 'Preencha o nome do cliente e o valor.');
      return;
    }
    setSharing(true);
    try {
      // O número real é obtido SÓ AQUI (ao salvar): getNextReciboNumber incrementa
      // e persiste a sequência, então o contador só avança quando o recibo é de
      // fato emitido — abrir e sair da tela não queima mais o número. Fica dentro
      // do mesmo try/catch do salvamento: se o contador falhar, o usuário recebe
      // o mesmo aviso e nada fica salvo pela metade.
      let numeroFinal: string;
      let recibo: Recibo;
      try {
        // Se já existe um pagamento registrado para este orçamento (ex.: via
        // "Registrar pagamento" na lista), reaproveita o MESMO recibo — mesmo
        // id e número — em vez de duplicar, só atualizando os campos que o
        // usuário possa ter ajustado aqui e marcando o PDF como emitido. Sem
        // recibo pendente, o número real é obtido SÓ AQUI (ao salvar):
        // getNextReciboNumber incrementa e persiste a sequência, então o
        // contador só avança quando o recibo é de fato emitido — abrir e sair
        // da tela não queima mais o número.
        numeroFinal = reciboPendente ? reciboPendente.numero : await getNextReciboNumber();
        recibo = {
          id: reciboPendente?.id ?? generateId(),
          numero: numeroFinal,
          orcamentoId: orc?.id,
          orcamentoNumero: orc?.numero,
          clienteId: orc?.clienteId ?? generateId(),
          clienteNome,
          clienteTelefone,
          itens: orc?.itens ?? [],
          valorRecebido,
          formaPagamento,
          dataRecebimento,
          exibirAssinatura: true,
          criadoEm: reciboPendente?.criadoEm ?? nowISO(),
          pdfEmitido: true,
        };
        // Persistimos o recibo ANTES da entrega: o registro fica salvo mesmo
        // que a geração/compartilhamento do PDF falhe (ou seja cancelada).
        await saveRecibo(recibo);
        setReciboPendente(recibo);
      } catch {
        Alert.alert('Erro', 'Não foi possível salvar o recibo agora. Tente novamente.');
        return;
      }
      setNumero(numeroFinal);
      setOverlayInfo({ titulo: 'Gerando seu recibo...', subtitulo: 'Deixando bonito para o cliente...' });
      try {
        const html = await buildHtml(recibo);
        // Entrega multiplataforma (web: imprime/salva PDF; nativo: print + share).
        await exportarHtmlComoPdf(html, `Recibo-${numeroFinal}`, { dialogTitle: `Recibo ${numeroFinal}` });
        // PDF gerado/compartilhado com sucesso: limpa o "pendente" para o card
        // azul "Pagamento já registrado... gere o PDF" sumir — a ação que ele
        // pedia já foi concluída (sem isso o card ficava contradizendo a tela).
        setReciboPendente(null);
      } catch (e: any) {
        // Se o compartilhamento simplesmente não está disponível no aparelho,
        // a mensagem já vem específica (e diz onde o PDF foi salvo).
        const detalhe = e?.message ? `${e.message} ` : '';
        Alert.alert('Erro', `${detalhe}Não foi possível compartilhar o PDF do recibo agora. O recibo foi salvo e pode ser reenviado depois na aba "Emitidos".`);
      }
    } finally {
      // SEMPRE volta o loading — inclusive na web (impressão assíncrona).
      setSharing(false);
      setOverlayInfo(null);
    }
  }

  // Reconstrói o HTML de um recibo já emitido (aba "Emitidos") e compartilha
  // de novo — cenário comum: cliente perdeu o PDF e pede a segunda via.
  async function handleReenviar(r: Recibo) {
    if (!empresa) {
      Alert.alert(
        'Cadastre sua empresa antes',
        'Para reenviar um recibo, cadastre os dados da sua empresa em Meu Negócio.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Ir para Meu Negócio', onPress: () => nav.navigate('MeuNegocio') },
        ],
      );
      return;
    }
    setReenviandoId(r.id);
    const primeiraEmissao = r.pdfEmitido === false;
    setOverlayInfo(
      primeiraEmissao
        ? { titulo: 'Gerando seu recibo...', subtitulo: 'Deixando bonito para o cliente...' }
        : { titulo: 'Gerando o recibo...', subtitulo: 'Preparando a segunda via para envio...' }
    );
    try {
      const html = await buildHtml(r);
      await exportarHtmlComoPdf(html, `Recibo-${r.numero}`, { dialogTitle: `Recibo ${r.numero}` });
      // Pagamento registrado sem PDF ainda (ver "Registrar pagamento" na lista de
      // orçamentos): agora que o PDF foi gerado/compartilhado pela 1ª vez, marca
      // o recibo como emitido — vira o badge financeiro do orçamento de "Pago"
      // para "Recibo emitido".
      if (primeiraEmissao) {
        await marcarReciboComoPdfEmitido(r);
        carregarEmitidos();
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não foi possível gerar o PDF deste recibo agora.');
    } finally {
      setReenviandoId(null);
      setOverlayInfo(null);
    }
  }

  const semEmpresa = !carregandoEmpresa && !empresa;

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Emitir recibo"
        subtitle={numero ? `Nº ${numero}` : reciboPendente ? `Nº ${reciboPendente.numero} · pagamento registrado` : 'Número gerado ao emitir'}
        onBack={() => goBackOrHome(nav)}
      />

      {/* ABAS: Novo recibo / Emitidos (histórico) */}
      <View style={styles.tabsRow}>
        <TouchableOpacity style={[styles.tabBtn, aba === 'novo' && styles.tabBtnActive]} onPress={() => setAba('novo')} activeOpacity={0.85}>
          <MaterialCommunityIcons name="file-plus-outline" size={16} color={aba === 'novo' ? '#fff' : Colors.onSurfaceVariant} />
          <Text style={[styles.tabLabel, aba === 'novo' && styles.tabLabelActive]}>Novo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, aba === 'emitidos' && styles.tabBtnActive]} onPress={() => setAba('emitidos')} activeOpacity={0.85}>
          <MaterialCommunityIcons name="history" size={16} color={aba === 'emitidos' ? '#fff' : Colors.onSurfaceVariant} />
          <Text style={[styles.tabLabel, aba === 'emitidos' && styles.tabLabelActive]}>Emitidos</Text>
        </TouchableOpacity>
      </View>

      {aba === 'novo' ? (
        <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {carregandoEmpresa && (
            <View style={styles.avisoCard}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={styles.avisoText}>Carregando dados da sua empresa…</Text>
            </View>
          )}

          {semEmpresa && (
            <View style={styles.avisoCardWarn}>
              <MaterialCommunityIcons name="alert-circle-outline" size={22} color={Colors.warning} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.avisoWarnTitle}>Cadastre sua empresa antes</Text>
                <Text style={styles.avisoWarnText}>Sem esses dados o recibo sairia em branco para o cliente.</Text>
              </View>
              <TouchableOpacity style={styles.avisoWarnBtn} onPress={() => nav.navigate('MeuNegocio')} activeOpacity={0.85}>
                <Text style={styles.avisoWarnBtnText}>Cadastrar</Text>
              </TouchableOpacity>
            </View>
          )}

          {orc && (
            <View style={styles.orcCard}>
              <MaterialCommunityIcons name="file-document-check-outline" size={22} color={Colors.success} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.orcLabel}>Referente ao orçamento nº {orc.numero}</Text>
                <Text style={styles.orcTotal}>{formatCurrency(orc.valorTotal)}</Text>
              </View>
            </View>
          )}

          {reciboPendente && (
            <View style={styles.pendenteCard}>
              <MaterialCommunityIcons name="cash-check" size={22} color={Colors.primary} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.pendenteTitle}>Pagamento já registrado</Text>
                <Text style={styles.pendenteText}>
                  Recibo Nº {reciboPendente.numero} · confira os dados abaixo e gere o PDF para entregar ao cliente.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Dados do recibo</Text>
            <OlliInput label="Nome do cliente" required value={clienteNome} onChangeText={setClienteNome} placeholder="Nome de quem pagou" leftIcon="account" />
            <OlliInput label="Telefone" mask="phone" value={clienteTelefone} onChangeText={setClienteTelefone} placeholder="(11) 99999-9999" leftIcon="phone" />
            <OlliMoneyInput label="Valor recebido" required value={valorRecebido} onChangeValue={setValorRecebido} />
            <OlliInput label="Data do recebimento" mask="date" value={dataRecebimento} onChangeText={setDataRecebimento} placeholder="DD/MM/AAAA" leftIcon="calendar" />

            <Text style={styles.fieldLabel}>Forma de pagamento</Text>
            <View style={styles.formasGrid}>
              {FORMAS.map(f => (
                <TouchableOpacity key={f} style={[styles.formaChip, formaPagamento === f && styles.formaChipActive]} onPress={() => setFormaPagamento(f)} activeOpacity={0.8}>
                  <Text style={[styles.formaLabel, formaPagamento === f && { color: '#fff' }]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <OlliButton
            label="Gerar e compartilhar recibo"
            variant="success"
            size="lg"
            fullWidth
            loading={sharing}
            onPress={handleGerar}
            disabled={carregandoEmpresa || semEmpresa || !clienteNome.trim() || !valorRecebido}
            icon={<MaterialCommunityIcons name="file-pdf-box" size={22} color="#fff" />}
            style={{ marginTop: 4 }}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={emitidos}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40, flexGrow: 1 }}
          refreshing={carregandoEmitidos}
          onRefresh={carregarEmitidos}
          ListEmptyComponent={
            carregandoEmitidos ? (
              <View style={{ paddingTop: 40, alignItems: 'center' }}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : (
              <EmptyState
                icon="receipt"
                title="Nenhum recibo emitido"
                subtitle="Os recibos que você gerar aparecem aqui para reenvio."
              />
            )
          }
          renderItem={({ item }) => (
            <OlliCard style={{ padding: Spacing.base, marginBottom: 10 }}>
              <View style={styles.reciboRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reciboNumero}>Recibo Nº {item.numero}</Text>
                  <Text style={styles.reciboCliente} numberOfLines={1}>{item.clienteNome}</Text>
                  <Text style={styles.reciboMeta}>{formatDateTime(item.criadoEm)} · {item.formaPagamento}</Text>
                  {item.pdfEmitido === false && (
                    <Text style={styles.reciboPendenteTag}>Pagamento registrado · PDF ainda não gerado</Text>
                  )}
                </View>
                <Text style={styles.reciboValor}>{formatCurrency(item.valorRecebido)}</Text>
              </View>
              <TouchableOpacity
                style={styles.reenviarBtn}
                onPress={() => handleReenviar(item)}
                disabled={reenviandoId === item.id}
                activeOpacity={0.85}
              >
                {reenviandoId === item.id ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <MaterialCommunityIcons name={item.pdfEmitido === false ? 'file-pdf-box' : 'share-variant'} size={16} color={Colors.primary} />
                )}
                <Text style={styles.reenviarBtnText}>
                  {item.pdfEmitido === false ? 'Gerar e compartilhar PDF' : 'Reenviar / compartilhar'}
                </Text>
              </TouchableOpacity>
            </OlliCard>
          )}
        />
      )}

      <OverlayProgresso
        visible={!!overlayInfo}
        titulo={overlayInfo?.titulo}
        subtitulo={overlayInfo?.subtitulo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  tabsRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: Spacing.base, paddingVertical: 10,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.outline,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.outline, backgroundColor: Colors.surfaceVariant,
  },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabLabel: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant },
  tabLabelActive: { color: '#fff' },

  avisoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surfaceVariant, marginBottom: Spacing.base,
    borderRadius: BorderRadius.md, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.outline,
  },
  avisoText: { fontSize: 13, color: Colors.onSurfaceVariant },
  avisoCardWarn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.warningLight, marginBottom: Spacing.base,
    borderRadius: BorderRadius.md, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.warning,
  },
  avisoWarnTitle: { fontSize: 14, fontWeight: '800', color: Colors.onSurface },
  avisoWarnText: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  avisoWarnBtn: {
    backgroundColor: Colors.warning, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: BorderRadius.full, marginLeft: 8,
  },
  avisoWarnBtnText: { fontSize: 12, fontWeight: '800', color: '#0A1626' },

  reciboRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  reciboNumero: { fontSize: 14, fontWeight: '800', color: Colors.onSurface },
  reciboCliente: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  reciboMeta: { fontSize: 11.5, color: Colors.onSurfaceMuted, marginTop: 2 },
  reciboPendenteTag: { fontSize: 11, fontWeight: '700', color: Colors.warning, marginTop: 4 },
  reciboValor: { fontSize: 15, fontWeight: '800', color: Colors.success },
  reenviarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.outline,
  },
  reenviarBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  orcCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.successLight, marginBottom: Spacing.base,
    borderRadius: BorderRadius.md, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.success,
  },
  orcLabel: { fontSize: 13, color: Colors.onSurface },
  orcTotal: { fontSize: 16, fontWeight: '800', color: Colors.success },
  pendenteCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(11,111,206,0.12)', marginBottom: Spacing.base,
    borderRadius: BorderRadius.md, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.primary,
  },
  pendenteTitle: { fontSize: 13, fontWeight: '800', color: Colors.onSurface },
  pendenteText: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  card: {
    backgroundColor: Colors.surface, marginBottom: Spacing.base,
    borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.outline,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.onSurface, marginBottom: Spacing.base },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant, marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.base, fontSize: 14, color: Colors.onSurface,
    borderWidth: 1, borderColor: Colors.outline,
  },
  formasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  formaChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.outline, backgroundColor: Colors.surface },
  formaChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  formaLabel: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
  gerarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.success, margin: Spacing.base,
    borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: 10,
  },
  gerarBtnLabel: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
