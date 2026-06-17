import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { getOrcamento, getEmpresa, getNextReciboNumber, saveRecibo } from '../database/database';
import { Recibo, Empresa, Orcamento } from '../types';
import { formatCurrency } from '../utils/currency';
import { formatDateTime, nowISO, todayISO } from '../utils/date';
import { isoToBR } from '../utils/masks';
import { generateId } from '../utils/id';
import { exportarHtmlComoPdf } from '../utils/exportarDocumento';
import { RootStackParamList } from '../navigation/AppNavigator';

type Route = RouteProp<RootStackParamList, 'EmitirRecibo'>;

const FORMAS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência'];

export default function EmitirReciboScreen() {
  const nav = useNavigation();
  const route = useRoute<Route>();
  const orcamentoId = route.params?.orcamentoId;

  const [orc, setOrc] = useState<Orcamento | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [numero, setNumero] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [valorRecebido, setValorRecebido] = useState(0);
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [dataRecebimento, setDataRecebimento] = useState(isoToBR(todayISO()));
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    async function init() {
      const [emp, num] = await Promise.all([getEmpresa(), getNextReciboNumber()]);
      setEmpresa(emp);
      setNumero(num);
      if (orcamentoId) {
        const o = await getOrcamento(orcamentoId);
        if (o) {
          setOrc(o);
          setClienteNome(o.clienteNome);
          setClienteTelefone(o.clienteTelefone);
          setValorRecebido(o.valorTotal);
        }
      }
    }
    init();
  }, []);

  function buildHtml(r: Recibo): string {
    if (!empresa) return '';
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #212121; margin: 0; }
  .page { padding: 32px; max-width: 700px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1565C0; padding-bottom: 16px; margin-bottom: 20px; }
  .empresa-nome { font-size: 20px; font-weight: 700; color: #1565C0; }
  .empresa-info { font-size: 12px; color: #555; line-height: 1.6; }
  .recibo-title { font-size: 28px; font-weight: 800; text-align: center; color: #1565C0; margin: 24px 0 16px; letter-spacing: 4px; }
  .recibo-num { text-align: center; font-size: 14px; color: #555; margin-bottom: 24px; }
  .info-box { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: #777; font-size: 12px; }
  .info-value { font-weight: 600; font-size: 13px; }
  .valor-box { background: #1565C0; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
  .valor-label { font-size: 12px; opacity: 0.8; }
  .valor-num { font-size: 32px; font-weight: 800; margin-top: 4px; }
  .assinatura-row { display: flex; justify-content: space-between; margin-top: 48px; }
  .assinatura-block { text-align: center; min-width: 200px; }
  .assinatura-line { border-top: 1px solid #ccc; padding-top: 8px; font-size: 12px; color: #555; margin-top: 40px; }
  .footer { border-top: 1px solid #e0e0e0; padding-top: 10px; margin-top: 24px; font-size: 11px; color: #888; text-align: center; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="empresa-nome">${empresa.nome}</div>
      <div class="empresa-info">${empresa.especialidade}<br/>CNPJ: ${empresa.cnpj}<br/>${empresa.telefone}</div>
    </div>
    <div class="empresa-info" style="text-align:right">Documento gerado em<br/>${formatDateTime(r.criadoEm)}</div>
  </div>

  <div class="recibo-title">RECIBO</div>
  <div class="recibo-num">Nº ${r.numero}</div>

  <div class="info-box">
    <div class="info-row"><span class="info-label">Cliente</span><span class="info-value">${r.clienteNome}</span></div>
    <div class="info-row"><span class="info-label">Telefone</span><span class="info-value">${r.clienteTelefone}</span></div>
    <div class="info-row"><span class="info-label">Data do recebimento</span><span class="info-value">${r.dataRecebimento}</span></div>
    <div class="info-row"><span class="info-label">Forma de pagamento</span><span class="info-value">${r.formaPagamento}</span></div>
    ${r.orcamentoNumero ? `<div class="info-row"><span class="info-label">Referente ao orçamento</span><span class="info-value">Nº ${r.orcamentoNumero}</span></div>` : ''}
  </div>

  <div class="valor-box">
    <div class="valor-label">Valor recebido</div>
    <div class="valor-num">${formatCurrency(r.valorRecebido)}</div>
  </div>

  <p style="font-size:13px;color:#444;text-align:center;">
    Recebi de <strong>${r.clienteNome}</strong> a importância de <strong>${formatCurrency(r.valorRecebido)}</strong>
    referente aos serviços prestados pela <strong>${empresa.nome}</strong>.
    Emitido em ${r.dataRecebimento}.
  </p>

  <div class="assinatura-row">
    <div class="assinatura-block">
      <div class="assinatura-line">
        <strong>${empresa.nomePrestador}</strong><br/>
        ${empresa.nome}<br/>
        CNPJ: ${empresa.cnpj}
      </div>
    </div>
    <div class="assinatura-block">
      <div class="assinatura-line">
        <strong>${r.clienteNome}</strong><br/>
        Cliente
      </div>
    </div>
  </div>

  <div class="footer">${empresa.nome} · CNPJ: ${empresa.cnpj} · ${empresa.telefone}</div>
</div>
</body>
</html>`;
  }

  async function handleGerar() {
    if (!clienteNome.trim() || !valorRecebido) {
      Alert.alert('Atenção', 'Preencha o nome do cliente e o valor.');
      return;
    }
    setSharing(true);
    const recibo: Recibo = {
      id: generateId(),
      numero,
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
      criadoEm: nowISO(),
    };
    try {
      // Persistimos o recibo ANTES da entrega: o registro fica salvo mesmo
      // que a geração/compartilhamento do PDF falhe (ou seja cancelada).
      await saveRecibo(recibo);
      const html = buildHtml(recibo);
      // Entrega multiplataforma (web: imprime/salva PDF; nativo: print + share).
      await exportarHtmlComoPdf(html, `Recibo-${numero}`, { dialogTitle: `Recibo ${numero}` });
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível gerar o PDF do recibo. O recibo foi salvo.');
    } finally {
      // SEMPRE volta o loading — inclusive na web (impressão assíncrona).
      setSharing(false);
    }
  }

  return (
    <View style={styles.container}>
      <GradientHeader title="Emitir recibo" subtitle={`Nº ${numero}`} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {orc && (
          <View style={styles.orcCard}>
            <MaterialCommunityIcons name="file-document-check-outline" size={22} color={Colors.success} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.orcLabel}>Referente ao orçamento nº {orc.numero}</Text>
              <Text style={styles.orcTotal}>{formatCurrency(orc.valorTotal)}</Text>
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
          disabled={!clienteNome.trim() || !valorRecebido}
          icon={<MaterialCommunityIcons name="file-pdf-box" size={22} color="#fff" />}
          style={{ marginTop: 4 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  orcCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.successLight, marginBottom: Spacing.base,
    borderRadius: BorderRadius.md, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.success,
  },
  orcLabel: { fontSize: 13, color: Colors.onSurface },
  orcTotal: { fontSize: 16, fontWeight: '800', color: Colors.success },
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
