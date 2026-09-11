import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { Orcamento, Empresa } from '../types';
import { OlliInput } from '../components/OlliInput';
import { CampoComVoz } from '../components/CampoComVoz';
import { OlliButton } from '../components/OlliButton';
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

export default function Step3Detalhes({ orc, onChange }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);

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

      {/* CONDIÇÕES */}
      <View style={styles.card}>
        <SectionTitle icon="file-document-outline">Condições e garantia</SectionTitle>
        <OlliInput
          label="Condições comerciais"
          value={orc.condicoesPagamento ?? ''}
          onChangeText={v => onChange({ condicoesPagamento: v })}
          placeholder="Ex.: 50% na aprovação e restante na conclusão. O pagamento é combinado diretamente com a empresa."
          multiline
        />
        <OlliInput label="Condições contratuais" value={orc.condicoesContratuais ?? ''} onChangeText={v => onChange({ condicoesContratuais: v })} placeholder="Prazo, materiais inclusos, responsabilidades..." multiline />
        <OlliInput label="Garantia" value={orc.garantia ?? ''} onChangeText={v => onChange({ garantia: v })} placeholder="Ex: 90 dias para mão de obra" multiline />
        <CampoComVoz label="Informações adicionais" value={orc.informacoesAdicionais ?? ''} onChangeText={v => onChange({ informacoesAdicionais: v })} placeholder="Observações gerais (toque no microfone para ditar)" multiline />
        <CampoComVoz label="Laudo técnico" value={orc.laudoTecnico ?? ''} onChangeText={v => onChange({ laudoTecnico: v })} placeholder="Diagnóstico técnico (toque no microfone para ditar)" multiline containerStyle={{ marginBottom: 0 }} />
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
