import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { OlliMascot } from '../components/OlliMascot';
import { OlliSkeleton } from '../components/OlliSkeleton';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { diagnosticarCaso, motivoFalhaDiagnostico } from '../services/olliIA';
import { DiagnosticoResultado } from '../types';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';
import { usePlano } from '../hooks/usePlano';

/** Depois de quantos segundos de loading o botão "Cancelar" aparece. */
const SEGUNDOS_PARA_MOSTRAR_CANCELAR = 4;

type Route = RouteProp<RootStackParamList, 'DiagnosticoIA'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DiagnosticoIAScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const p = route.params ?? {};

  const [marca, setMarca] = useState(p.marca ?? '');
  const [modelo, setModelo] = useState(p.modelo ?? '');
  const [codigo, setCodigo] = useState(p.codigo ?? '');
  const [sintoma, setSintoma] = useState(p.sintoma ?? '');
  const [loading, setLoading] = useState(false);
  const [podeCancelar, setPodeCancelar] = useState(false);
  const [res, setRes] = useState<DiagnosticoResultado | null>(null);
  const [falhouIA, setFalhouIA] = useState(false);
  const [avisoCota, setAvisoCota] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { temAcesso, usosIaRestantes, consumirUsoIa } = usePlano();
  // Grátis tem 3 usos de IA/mês (voz + chat + diagnóstico). Esgotou → o
  // diagnóstico continua funcionando pela base offline de 698 códigos (nunca
  // fica mudo), só sem a análise da nuvem, com um aviso caloroso + CTA.
  const iaNuvemEsgotada = !temAcesso('ia_ilimitada') && usosIaRestantes <= 0;

  // limpa timers/abort pendentes ao desmontar a tela
  useEffect(() => {
    return () => {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const podeEnviar = !!codigo.trim() || !!sintoma.trim();

  async function pedirDiagnostico() {
    if (!podeEnviar) return;
    Haptics.selectionAsync().catch(() => {});
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setPodeCancelar(false);
    setRes(null);
    setFalhouIA(false);
    setAvisoCota(iaNuvemEsgotada);
    cancelarTimerRef.current = setTimeout(() => setPodeCancelar(true), SEGUNDOS_PARA_MOSTRAR_CANCELAR * 1000);
    try {
      const r = await diagnosticarCaso({
        marca: marca.trim() || undefined,
        modelo: modelo.trim() || undefined,
        codigo: codigo.trim() || undefined,
        sintoma: sintoma.trim() || undefined,
      }, controller.signal, { forcarOffline: iaNuvemEsgotada });
      setRes(r);
      setFalhouIA(!!motivoFalhaDiagnostico());
      // Só consome cota quando a NUVEM realmente respondeu (fonte 'ia').
      // A base offline (fonte 'base') e o cache são sempre livres.
      if (r.fonte === 'ia') await consumirUsoIa();
    } finally {
      if (cancelarTimerRef.current) clearTimeout(cancelarTimerRef.current);
      setLoading(false);
      setPodeCancelar(false);
      abortRef.current = null;
    }
  }

  function cancelarDiagnostico() {
    Haptics.selectionAsync().catch(() => {});
    abortRef.current?.abort();
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
      <GradientHeader title="Me ajuda com esse caso" subtitle="OLLI Técnica · diagnóstico guiado" onBack={() => goBackOrHome(nav)} />

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
            <Text style={styles.loadingText}>A OLLI está cruzando código, marca e a base…</Text>
            <OlliSkeleton.Lines count={4} style={{ width: '100%', marginTop: 16 }} />
            {podeCancelar && (
              <OlliButton
                label="Cancelar"
                variant="outline"
                size="sm"
                onPress={cancelarDiagnostico}
                style={{ marginTop: 16 }}
              />
            )}
          </View>
        )}

        {d && avisoCota && (
          <AnimatedEntrance index={0}>
            <View style={styles.cotaCard}>
              <MaterialCommunityIcons name="creation" size={18} color={cores.plan} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.cotaTitulo}>Você usou seus 3 diagnósticos com IA do mês</Text>
                <Text style={styles.cotaTexto}>
                  Esta resposta veio da nossa base offline de 698 códigos. No Pro, a análise da OLLI por IA é ilimitada.
                </Text>
                <Text style={styles.cotaLink} onPress={() => nav.navigate('Planos')}>Ver planos →</Text>
              </View>
            </View>
          </AnimatedEntrance>
        )}
        {d && (
          <View>
            {/* origem do diagnóstico */}
            <AnimatedEntrance index={0}>
              <View style={styles.originRow}>
                <View style={[styles.originPill, res!.fonte === 'base' ? styles.originBase : styles.originIa]}>
                  <MaterialCommunityIcons
                    name={res!.fonte === 'base' ? 'database-search-outline' : res!.fonte === 'cache' ? 'lightning-bolt-outline' : 'robot-happy-outline'}
                    size={13}
                    color={res!.fonte === 'base' ? cores.warning : cores.accentLight}
                  />
                  <Text style={[styles.originText, { color: res!.fonte === 'base' ? cores.warning : cores.accentLight }]}>
                    {res!.fonte === 'base' ? 'Base de códigos' : res!.fonte === 'cache' ? 'Cache' : `OLLI Técnica${res!.modelo ? ` · ${res!.modelo}` : ''}`}
                  </Text>
                </View>
                <View style={[styles.confBadge, { backgroundColor: confColor(d.nivelConfianca, cores) + '22' }]}>
                  <Text style={[styles.confText, { color: confColor(d.nivelConfianca, cores) }]}>Confiança {d.nivelConfianca}</Text>
                </View>
              </View>
            </AnimatedEntrance>

            {res!.aviso && (
              <AnimatedEntrance index={1}>
                <View style={styles.aviso}>
                  <MaterialCommunityIcons name="information-outline" size={15} color={cores.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.avisoText}>{res!.aviso}</Text>
                    {falhouIA && (
                      <OlliButton
                        label="Tentar de novo"
                        variant="outline"
                        size="sm"
                        onPress={pedirDiagnostico}
                        haptic={false}
                        icon={<MaterialCommunityIcons name="refresh" size={15} color={cores.accentLight} />}
                        style={{ marginTop: 10, alignSelf: 'flex-start' }}
                      />
                    )}
                  </View>
                </View>
              </AnimatedEntrance>
            )}

            <AnimatedEntrance index={2}>
              <Text style={styles.resumo}>{d.resumo}</Text>
              {!!d.significadoProvavel && <Text style={styles.significado}>{d.significadoProvavel}</Text>}
            </AnimatedEntrance>

            <AnimatedEntrance index={3}>
              <ListSection icon="format-list-numbered" title="Testes em ordem" items={d.testesEmOrdem} accent />
            </AnimatedEntrance>
            <AnimatedEntrance index={4}>
              <ListSection icon="magnify" title="Causas mais comuns" items={d.causasComuns} />
            </AnimatedEntrance>
            <AnimatedEntrance index={5}>
              <ListSection icon="wrench-outline" title="Peças suspeitas" items={d.pecasSuspeitas} />
            </AnimatedEntrance>

            {d.naoFacaAinda?.length > 0 && (
              <AnimatedEntrance index={6}>
                <View style={styles.warnBox}>
                  <View style={styles.warnHead}>
                    <MaterialCommunityIcons name="alert-octagon-outline" size={18} color={cores.warning} />
                    <Text style={styles.warnTitle}>Não faça ainda</Text>
                  </View>
                  {d.naoFacaAinda.map((t, i) => <Text key={i} style={styles.warnItem}>• {t}</Text>)}
                </View>
              </AnimatedEntrance>
            )}

            {!!d.mensagemCliente && (
              <AnimatedEntrance index={7}>
                <Block icon="message-text-outline" title="Mensagem pro cliente" text={d.mensagemCliente} />
              </AnimatedEntrance>
            )}
            {!!d.sugestaoOrcamento && (
              <AnimatedEntrance index={8}>
                <Block icon="file-document-outline" title="Sugestão de orçamento" text={d.sugestaoOrcamento} />
              </AnimatedEntrance>
            )}

            {d.fontes?.length > 0 && (
              <AnimatedEntrance index={9}>
                <ListSection icon="link-variant" title="Fontes" items={d.fontes} />
              </AnimatedEntrance>
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

function confColor(nivel: string, c: Cores): string {
  const v = (nivel || '').toLowerCase();
  if (v.startsWith('baix')) return c.danger;
  if (v.startsWith('méd') || v.startsWith('med')) return c.warning;
  return c.success;
}

function ListSection({ icon, title, items, accent }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; items: string[]; accent?: boolean }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  if (!items || items.length === 0) return null;
  return (
    <View style={[styles.section, accent && styles.sectionAccent]}>
      <View style={styles.sectionHead}>
        <MaterialCommunityIcons name={icon} size={16} color={accent ? cores.accentLight : cores.onSurfaceVariant} />
        <Text style={[styles.sectionTitle, accent && { color: cores.accentLight }]}>{title}</Text>
      </View>
      {items.map((t, i) => <Text key={i} style={styles.sectionItem}>{/^\s*\d/.test(t) ? '' : '• '}{t}</Text>)}
    </View>
  );
}

function Block({ icon, title, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; text: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <MaterialCommunityIcons name={icon} size={16} color={cores.onSurfaceVariant} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.blockText}>{text}</Text>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  rowFields: { flexDirection: 'row' },
  card: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, borderWidth: 1, borderColor: c.outline, ...sombrasDe(c).sm },

  loadingBox: { alignItems: 'center', paddingVertical: 28 },
  loadingText: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 10, textAlign: 'center', paddingHorizontal: 24 },

  cotaCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: c.plan + '14', borderWidth: 1, borderColor: c.plan + '33', borderRadius: BorderRadius.md, padding: 12, marginTop: 16 },
  cotaTitulo: { color: c.onSurface, fontWeight: '700', fontSize: 13.5 },
  cotaTexto: { color: c.onSurfaceVariant, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  cotaLink: { color: c.plan, fontWeight: '700', fontSize: 13, marginTop: 6 },
  originRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  originPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.full, borderWidth: 1 },
  // Cyan/amarelo fixos (base #7FE9F5 / warning do handoff): decorativos, sem chave semântica exata.
  originIa: { backgroundColor: 'rgba(127,233,245,0.10)', borderColor: 'rgba(127,233,245,0.3)' },
  originBase: { backgroundColor: 'rgba(247,178,59,0.10)', borderColor: 'rgba(247,178,59,0.3)' },
  originText: { fontSize: 11.5, fontWeight: '800' },
  confBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 5 },
  confText: { fontSize: 11.5, fontWeight: '800' },

  // Amarelo/warning fixo do handoff cockpit; próximo de `warningLight` mas alfa/hex não batem (ver rule 7).
  aviso: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.25)', borderRadius: BorderRadius.md, padding: 10, marginBottom: 12 },
  avisoText: { flex: 1, fontSize: 12, color: c.onSurfaceVariant, lineHeight: 17 },

  resumo: { fontSize: 18, fontWeight: '800', color: c.onSurface, lineHeight: 24 },
  significado: { fontSize: 14, color: c.onSurfaceVariant, lineHeight: 20, marginTop: 4 },

  section: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base, marginTop: 12 },
  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  sectionAccent: { borderColor: 'rgba(52,198,217,0.35)', backgroundColor: 'rgba(52,198,217,0.06)' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  sectionTitle: { fontSize: 12.5, fontWeight: '800', color: c.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionItem: { fontSize: 14.5, color: c.onSurface, lineHeight: 22 },
  blockText: { fontSize: 14.5, color: c.onSurface, lineHeight: 21 },

  // Amarelo/warning fixo do handoff cockpit; próximo de `warningLight` mas alfa/hex não batem (ver rule 7).
  warnBox: { backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)', borderRadius: BorderRadius.lg, padding: Spacing.base, marginTop: 12 },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  warnTitle: { fontSize: 14, fontWeight: '800', color: c.warning },
  warnItem: { fontSize: 13.5, color: c.onSurface, lineHeight: 20 },
});
