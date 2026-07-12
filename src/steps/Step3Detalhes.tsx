import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { Orcamento, FormaPagamento, Empresa } from '../types';
import { formatCurrency } from '../utils/currency';
import { OlliInput, OlliMoneyInput } from '../components/OlliInput';
import { OlliButton } from '../components/OlliButton';
import { todayISO } from '../utils/date';
import { isoToBR } from '../utils/masks';
import {
  adicionarFotoCamera,
  adicionarFotoGaleria,
  removerFoto,
  abrirConfiguracoesPermissao,
  MAX_FOTOS_ORCAMENTO,
} from '../utils/fotosOrcamento';

interface Props {
  orc: Orcamento;
  onChange: (partial: Partial<Orcamento>) => void;
  empresa?: Empresa | null;
}

const PAYMENT_OPTIONS: Array<{ key: keyof FormaPagamento; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { key: 'pix', label: 'PIX', icon: 'qrcode' },
  { key: 'credito', label: 'Crédito', icon: 'credit-card' },
  { key: 'debito', label: 'Débito', icon: 'credit-card-outline' },
  { key: 'dinheiro', label: 'Dinheiro', icon: 'cash' },
];

function SectionTitle({ icon, children }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; children: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionIconBg}>
        <MaterialCommunityIcons name={icon} size={16} color={cores.primary} />
      </View>
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

export default function Step3Detalhes({ orc, onChange, empresa }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

  // Pré-preenche a chave PIX do orçamento com a chave PIX cadastrada em "Meu
  // Negócio" quando o campo ainda estiver vazio — evita redigitar em todo
  // orçamento novo, mas nunca sobrescreve um valor que o usuário já digitou.
  useEffect(() => {
    if (!orc.chavePix && empresa?.chavePix) {
      onChange({ chavePix: empresa.chavePix });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa?.chavePix]);

  function togglePagamento(key: keyof FormaPagamento) {
    onChange({ formasPagamento: { ...orc.formasPagamento, [key]: !orc.formasPagamento[key] } });
  }

  const restante = orc.sinalValor ? Math.max(0, orc.valorTotal - orc.sinalValor) : 0;

  // ─── FOTOS DO SERVIÇO ────────────────────────────────────────────
  const fotos = orc.fotosServico ?? [];
  const [processandoFoto, setProcessandoFoto] = useState<'camera' | 'galeria' | null>(null);

  function avisarPermissao(erro: string) {
    if (erro === 'PERMISSAO_NEGADA_PERMANENTE') {
      Alert.alert(
        'Permissão necessária',
        'Você negou o acesso e marcou "não perguntar novamente". Libere em Ajustes do aparelho para tirar fotos ou anexar da galeria.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir Ajustes', onPress: () => abrirConfiguracoesPermissao() },
        ],
      );
      return;
    }
    Alert.alert('Fotos do serviço', erro);
  }

  async function handleTirarFoto() {
    if (processandoFoto) return;
    setProcessandoFoto('camera');
    try {
      const resultado = await adicionarFotoCamera(fotos);
      if (resultado.erro) {
        avisarPermissao(resultado.erro);
      } else if (resultado.uris.length > 0) {
        onChange({ fotosServico: [...fotos, ...resultado.uris] });
      }
    } finally {
      setProcessandoFoto(null);
    }
  }

  async function handleEscolherGaleria() {
    if (processandoFoto) return;
    setProcessandoFoto('galeria');
    try {
      const resultado = await adicionarFotoGaleria(fotos);
      if (resultado.erro) {
        avisarPermissao(resultado.erro);
      } else if (resultado.uris.length > 0) {
        onChange({ fotosServico: [...fotos, ...resultado.uris] });
      }
    } finally {
      setProcessandoFoto(null);
    }
  }

  async function handleRemoverFoto(uri: string) {
    const atualizadas = await removerFoto(fotos, uri);
    onChange({ fotosServico: atualizadas });
  }

  const limiteAtingido = fotos.length >= MAX_FOTOS_ORCAMENTO;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* DATAS */}
      <View style={styles.card}>
        <SectionTitle icon="calendar-month">Datas e agendamento</SectionTitle>
        <OlliInput label="Validade do orçamento" mask="date" value={orc.validadeOrcamento ?? ''} onChangeText={v => onChange({ validadeOrcamento: v })} placeholder="DD/MM/AAAA" leftIcon="calendar-clock" />
        <OlliInput label="Visita técnica" mask="date" value={orc.dataVisitaTecnica ?? ''} onChangeText={v => onChange({ dataVisitaTecnica: v })} placeholder="DD/MM/AAAA" leftIcon="calendar-search" />
        <OlliInput label="Agendamento do serviço" mask="date" value={orc.agendamentoServico ?? ''} onChangeText={v => onChange({ agendamentoServico: v })} placeholder="DD/MM/AAAA" leftIcon="calendar-check" containerStyle={{ marginBottom: 0 }} />
      </View>

      {/* PAGAMENTO */}
      <View style={styles.card}>
        <SectionTitle icon="wallet">Pagamento</SectionTitle>
        <Text style={styles.fieldLabel}>Formas aceitas</Text>
        <View style={styles.paymentGrid}>
          {PAYMENT_OPTIONS.map(opt => {
            const on = orc.formasPagamento[opt.key];
            return (
              <TouchableOpacity key={opt.key} style={[styles.paymentChip, on && styles.paymentChipActive]} onPress={() => togglePagamento(opt.key)} activeOpacity={0.8}>
                <MaterialCommunityIcons name={opt.icon} size={18} color={on ? cores.onPrimary : cores.onSurfaceVariant} />
                <Text style={[styles.paymentLabel, on && { color: cores.onPrimary }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {orc.formasPagamento.pix && (
          <OlliInput label="Chave PIX" value={orc.chavePix ?? ''} onChangeText={v => onChange({ chavePix: v })} placeholder="CPF, CNPJ, e-mail ou chave aleatória" leftIcon="key-variant" containerStyle={{ marginTop: 12 }} />
        )}

        <OlliInput label="Condições de pagamento" value={orc.condicoesPagamento ?? ''} onChangeText={v => onChange({ condicoesPagamento: v })} placeholder="Ex: 50% de entrada, restante na entrega" multiline />

        <View style={styles.rowFields}>
          <OlliMoneyInput
            label="Sinal / entrada"
            value={orc.sinalValor ?? 0}
            onChangeValue={v => {
              const clamped = Math.max(0, Math.min(orc.valorTotal, v));
              // Percentual derivado do valorTotal (pós-desconto) — a MESMA base do clamp
              // acima e do "restante" (linha ~63). Antes usava o subtotal (pré-desconto),
              // então "50%" não batia com o total real quando havia desconto.
              onChange({ sinalValor: clamped, sinalPercentual: orc.valorTotal ? Math.round((clamped / orc.valorTotal) * 100) : 0 });
            }}
            containerStyle={{ flex: 1, marginRight: 10 }}
          />
          <View style={{ flex: 1 }}>
            <View style={styles.sinalDataRow}>
              <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>Data do sinal</Text>
              <TouchableOpacity onPress={() => onChange({ sinalData: isoToBR(todayISO()) })} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={styles.hojeLink}>Hoje</Text>
              </TouchableOpacity>
            </View>
            <OlliInput mask="date" value={orc.sinalData ?? ''} onChangeText={v => onChange({ sinalData: v })} placeholder="DD/MM/AAAA" containerStyle={{ marginBottom: 0 }} />
          </View>
        </View>
        {orc.sinalValor ? (
          <View style={styles.sinalInfo}>
            <MaterialCommunityIcons name="information" size={15} color={cores.primary} />
            <Text style={styles.sinalInfoText}>Sinal {formatCurrency(orc.sinalValor)} · Restante {formatCurrency(restante)}</Text>
          </View>
        ) : null}
      </View>

      {/* CONDIÇÕES */}
      <View style={styles.card}>
        <SectionTitle icon="file-document-outline">Condições e garantia</SectionTitle>
        <OlliInput label="Condições contratuais" value={orc.condicoesContratuais ?? ''} onChangeText={v => onChange({ condicoesContratuais: v })} placeholder="Prazo, materiais inclusos, responsabilidades..." multiline />
        <OlliInput label="Garantia" value={orc.garantia ?? ''} onChangeText={v => onChange({ garantia: v })} placeholder="Ex: 90 dias para mão de obra" multiline />
        <OlliInput label="Informações adicionais" value={orc.informacoesAdicionais ?? ''} onChangeText={v => onChange({ informacoesAdicionais: v })} placeholder="Observações gerais" multiline />
        <OlliInput label="Laudo técnico" value={orc.laudoTecnico ?? ''} onChangeText={v => onChange({ laudoTecnico: v })} placeholder="Diagnóstico técnico do equipamento" multiline containerStyle={{ marginBottom: 0 }} />
      </View>

      {/* FOTOS DO SERVIÇO */}
      <View style={styles.card}>
        <SectionTitle icon="camera-outline">Fotos do serviço</SectionTitle>
        <Text style={styles.fotosHint}>
          Registre o local, o equipamento ou o problema — as fotos saem no PDF do orçamento.
        </Text>

        {fotos.length > 0 && (
          <View style={styles.fotosGrid}>
            {fotos.map(uri => (
              <View key={uri} style={styles.fotoThumbWrap}>
                <Image source={{ uri }} style={styles.fotoThumb} />
                <TouchableOpacity
                  style={styles.fotoRemoveBtn}
                  onPress={() => handleRemoverFoto(uri)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Remover foto"
                >
                  <MaterialCommunityIcons name="close-circle" size={22} color={cores.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.fotosBotoes}>
          <OlliButton
            label="Tirar foto"
            variant="outline"
            size="sm"
            onPress={handleTirarFoto}
            disabled={limiteAtingido || processandoFoto !== null}
            loading={processandoFoto === 'camera'}
            icon={processandoFoto === 'camera' ? undefined : <MaterialCommunityIcons name="camera" size={16} color={cores.accentLight} />}
            style={styles.fotoBotao}
          />
          <OlliButton
            label="Galeria"
            variant="outline"
            size="sm"
            onPress={handleEscolherGaleria}
            disabled={limiteAtingido || processandoFoto !== null}
            loading={processandoFoto === 'galeria'}
            icon={processandoFoto === 'galeria' ? undefined : <MaterialCommunityIcons name="image-multiple-outline" size={16} color={cores.accentLight} />}
            style={styles.fotoBotao}
          />
        </View>

        <Text style={[styles.fotosContagem, limiteAtingido && styles.fotosContagemCheia]}>
          {limiteAtingido
            ? `Limite de ${MAX_FOTOS_ORCAMENTO} fotos atingido — remova alguma para adicionar outra.`
            : `${fotos.length}/${MAX_FOTOS_ORCAMENTO} fotos`}
        </Text>
      </View>
    </ScrollView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  card: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.base, ...sombrasDe(c).sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.base },
  sectionIconBg: { width: 30, height: 30, borderRadius: 8, backgroundColor: c.primaryContainer, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: c.onSurfaceVariant, marginBottom: 8 },
  paymentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paymentChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: c.outline, backgroundColor: c.surface },
  paymentChipActive: { backgroundColor: c.primary, borderColor: c.primary },
  paymentLabel: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },
  rowFields: { flexDirection: 'row' },
  sinalInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.primaryContainer, borderRadius: BorderRadius.md, padding: 10, marginTop: 4 },
  sinalInfoText: { fontSize: 13, color: c.primary, fontWeight: '700' },
  sinalDataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  hojeLink: { fontSize: 12, fontWeight: '700', color: c.primary },

  fotosHint: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: -6, marginBottom: 14, lineHeight: 17 },
  fotosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  fotoThumbWrap: { position: 'relative' },
  fotoThumb: { width: 78, height: 78, borderRadius: BorderRadius.md, backgroundColor: c.surfaceVariant },
  fotoRemoveBtn: { position: 'absolute', top: -8, right: -8, backgroundColor: c.surface, borderRadius: 11 },
  fotosBotoes: { flexDirection: 'row', gap: 10 },
  fotoBotao: { flex: 1 },
  fotosContagem: { fontSize: 12, color: c.onSurfaceVariant, marginTop: 10, textAlign: 'center' },
  fotosContagemCheia: { color: c.warning, fontWeight: '700' },
});
