import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { OlliMascot } from '../components/OlliMascot';
import { diagnosticarCaso } from '../services/olliIA';
import { DiagnosticoResultado } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';

type Route = RouteProp<RootStackParamList, 'DiagnosticoIA'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DiagnosticoIAScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const p = route.params ?? {};

  const [marca, setMarca] = useState(p.marca ?? '');
  const [modelo, setModelo] = useState(p.modelo ?? '');
  const [codigo, setCodigo] = useState(p.codigo ?? '');
  const [sintoma, setSintoma] = useState(p.sintoma ?? '');
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<DiagnosticoResultado | null>(null);

  const podeEnviar = !!codigo.trim() || !!sintoma.trim();

  async function pedirDiagnostico() {
    if (!podeEnviar) return;
    Haptics.selectionAsync().catch(() => {});
    setLoading(true);
    setRes(null);
    try {
      const r = await diagnosticarCaso({
        marca: marca.trim() || undefined,
        modelo: modelo.trim() || undefined,
        codigo: codigo.trim() || undefined,
        sintoma: sintoma.trim() || undefined,
      });
      setRes(r);
    } finally {
      setLoading(false);
    }
  }

  const d = res?.diagnostico;

  // Cria um novo orçamento já com um item-serviço descrevendo o reparo do caso.
  // O técnico só ajusta preço/quantidade no fluxo do orçamento.
  function criarOrcamento() {
    if (!d) return;
    Haptics.selectionAsync().catch(() => {});
    const partes = [marca.trim(), modelo.trim()].filter(Boolean).join(' ');
    const ref = codigo.trim() ? `código ${codigo.trim()}` : sintoma.trim();
    const nome = [
      'Diagnóstico e reparo',
      partes ? `— ${partes}` : '',
      ref ? `(${ref})` : '',
    ].filter(Boolean).join(' ').trim() || 'Serviço de diagnóstico e reparo';
    const descricao = d.sugestaoOrcamento?.trim() || d.significadoProvavel?.trim() || d.resumo?.trim();
    nav.navigate('NovoOrcamento', {
      prefillItem: { tipo: 'servico', nome, descricao },
    });
  }

  return (
    <View style={styles.container}>
      <GradientHeader title="Me ajuda com esse caso" subtitle="OLLI Técnica · diagnóstico guiado" onBack={() => nav.goBack()} />

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* FORM */}
        <View style={styles.card}>
          <View style={styles.rowFields}>
            <OlliInput label="Marca" value={marca} onChangeText={setMarca} placeholder="Ex: Fujitsu" containerStyle={{ flex: 1, marginRight: 10 }} />
            <OlliInput label="Modelo" value={modelo} onChangeText={setModelo} placeholder="Ex: ASBG12" containerStyle={{ flex: 1 }} />
          </View>
          <OlliInput label="Código / display" value={codigo} onChangeText={setCodigo} placeholder='Ex: "EE:04" ou "3 piscadas"' autoCapitalize="characters" />
          <OlliInput label="Sintoma" value={sintoma} onChangeText={setSintoma} placeholder="O que a máquina está fazendo?" multiline containerStyle={{ marginBottom: 4 }} />
          <OlliButton
            label={loading ? 'Analisando…' : 'Pedir diagnóstico'}
            variant="gradient"
            size="lg"
            fullWidth
            onPress={pedirDiagnostico}
            disabled={!podeEnviar || loading}
            icon={loading ? undefined : <MaterialCommunityIcons name="robot-happy-outline" size={20} color="#fff" />}
          />
        </View>

        {loading && (
          <View style={styles.loadingBox}>
            <OlliMascot size={44} onDark />
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 10 }} />
            <Text style={styles.loadingText}>A OLLI está cruzando código, marca e a base…</Text>
          </View>
        )}

        {d && (
          <View>
            {/* origem do diagnóstico */}
            <View style={styles.originRow}>
              <View style={[styles.originPill, res!.fonte === 'base' ? styles.originBase : styles.originIa]}>
                <MaterialCommunityIcons
                  name={res!.fonte === 'base' ? 'database-search-outline' : res!.fonte === 'cache' ? 'lightning-bolt-outline' : 'robot-happy-outline'}
                  size={13}
                  color={res!.fonte === 'base' ? Colors.warning : Colors.accentLight}
                />
                <Text style={[styles.originText, { color: res!.fonte === 'base' ? Colors.warning : Colors.accentLight }]}>
                  {res!.fonte === 'base' ? 'Base de códigos' : res!.fonte === 'cache' ? 'Cache' : `OLLI Técnica${res!.modelo ? ` · ${res!.modelo}` : ''}`}
                </Text>
              </View>
              <View style={[styles.confBadge, { backgroundColor: confColor(d.nivelConfianca) + '22' }]}>
                <Text style={[styles.confText, { color: confColor(d.nivelConfianca) }]}>Confiança {d.nivelConfianca}</Text>
              </View>
            </View>

            {res!.aviso && (
              <View style={styles.aviso}>
                <MaterialCommunityIcons name="information-outline" size={15} color={Colors.warning} />
                <Text style={styles.avisoText}>{res!.aviso}</Text>
              </View>
            )}

            <Text style={styles.resumo}>{d.resumo}</Text>
            {!!d.significadoProvavel && <Text style={styles.significado}>{d.significadoProvavel}</Text>}

            <ListSection icon="format-list-numbered" title="Testes em ordem" items={d.testesEmOrdem} accent />
            <ListSection icon="magnify" title="Causas mais comuns" items={d.causasComuns} />
            <ListSection icon="wrench-outline" title="Peças suspeitas" items={d.pecasSuspeitas} />

            {d.naoFacaAinda?.length > 0 && (
              <View style={styles.warnBox}>
                <View style={styles.warnHead}>
                  <MaterialCommunityIcons name="alert-octagon-outline" size={18} color={Colors.warning} />
                  <Text style={styles.warnTitle}>Não faça ainda</Text>
                </View>
                {d.naoFacaAinda.map((t, i) => <Text key={i} style={styles.warnItem}>• {t}</Text>)}
              </View>
            )}

            {!!d.mensagemCliente && (
              <Block icon="message-text-outline" title="Mensagem pro cliente" text={d.mensagemCliente} />
            )}
            {!!d.sugestaoOrcamento && (
              <Block icon="file-document-outline" title="Sugestão de orçamento" text={d.sugestaoOrcamento} />
            )}

            {d.fontes?.length > 0 && (
              <ListSection icon="link-variant" title="Fontes" items={d.fontes} />
            )}

            {/* CTA — vira orçamento com 1 toque (ciclo do dinheiro) */}
            <OlliButton
              label="Criar orçamento com este serviço"
              variant="gradient"
              size="lg"
              fullWidth
              onPress={criarOrcamento}
              icon={<MaterialCommunityIcons name="file-plus-outline" size={20} color="#fff" />}
              style={{ marginTop: 16 }}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function confColor(c: string): string {
  const v = (c || '').toLowerCase();
  if (v.startsWith('baix')) return Colors.danger;
  if (v.startsWith('méd') || v.startsWith('med')) return Colors.warning;
  return Colors.success;
}

function ListSection({ icon, title, items, accent }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; items: string[]; accent?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <View style={[styles.section, accent && styles.sectionAccent]}>
      <View style={styles.sectionHead}>
        <MaterialCommunityIcons name={icon} size={16} color={accent ? Colors.accentLight : Colors.onSurfaceVariant} />
        <Text style={[styles.sectionTitle, accent && { color: Colors.accentLight }]}>{title}</Text>
      </View>
      {items.map((t, i) => <Text key={i} style={styles.sectionItem}>{/^\s*\d/.test(t) ? '' : '• '}{t}</Text>)}
    </View>
  );
}

function Block({ icon, title, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <MaterialCommunityIcons name={icon} size={16} color={Colors.onSurfaceVariant} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.blockText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  rowFields: { flexDirection: 'row' },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, borderWidth: 1, borderColor: Colors.outline, ...Shadow.sm },

  loadingBox: { alignItems: 'center', paddingVertical: 28 },
  loadingText: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 10, textAlign: 'center', paddingHorizontal: 24 },

  originRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  originPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.full, borderWidth: 1 },
  originIa: { backgroundColor: 'rgba(127,233,245,0.10)', borderColor: 'rgba(127,233,245,0.3)' },
  originBase: { backgroundColor: 'rgba(247,178,59,0.10)', borderColor: 'rgba(247,178,59,0.3)' },
  originText: { fontSize: 11.5, fontWeight: '800' },
  confBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 5 },
  confText: { fontSize: 11.5, fontWeight: '800' },

  aviso: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.25)', borderRadius: BorderRadius.md, padding: 10, marginBottom: 12 },
  avisoText: { flex: 1, fontSize: 12, color: Colors.onSurfaceVariant, lineHeight: 17 },

  resumo: { fontSize: 18, fontWeight: '800', color: Colors.onSurface, lineHeight: 24 },
  significado: { fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 20, marginTop: 4 },

  section: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outline, padding: Spacing.base, marginTop: 12 },
  sectionAccent: { borderColor: 'rgba(52,198,217,0.35)', backgroundColor: 'rgba(52,198,217,0.06)' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  sectionTitle: { fontSize: 12.5, fontWeight: '800', color: Colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionItem: { fontSize: 14.5, color: Colors.onSurface, lineHeight: 22 },
  blockText: { fontSize: 14.5, color: Colors.onSurface, lineHeight: 21 },

  warnBox: { backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)', borderRadius: BorderRadius.lg, padding: Spacing.base, marginTop: 12 },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  warnTitle: { fontSize: 14, fontWeight: '800', color: Colors.warning },
  warnItem: { fontSize: 13.5, color: Colors.onSurface, lineHeight: 20 },
});
