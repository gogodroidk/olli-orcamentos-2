import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, ScrollView,
  TouchableOpacity, Modal, Linking, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { EmptyState } from '../components/EmptyState';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import {
  getMarcasErro, countCodigosErro, searchCodigosErro, saveCasoErro,
} from '../database/database';
import { CodigoErro, CasoErro } from '../types';
import { track, Eventos } from '../services/analytics';
import { generateId } from '../utils/id';
import { nowISO } from '../utils/date';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goBackOrHome } from '../navigation/safeBack';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Cor da severidade da falha. */
function sevColor(s: string, c: Cores): string {
  const v = (s || '').toLowerCase();
  if (v.startsWith('crít') || v.startsWith('crit')) return c.danger;
  if (v.startsWith('alta')) return c.danger;
  if (v.startsWith('méd') || v.startsWith('med')) return c.warning;
  return c.primaryLight; // Info / desconhecido
}

/** Chips de severidade — valores exatamente como gravados na base (SQL casa por igualdade). */
const SEVERIDADES = ['Crítica', 'Alta', 'Média', 'Info'] as const;

/** Cor do nível de confiança da fonte. */
function confColor(conf: string, c: Cores): string {
  const v = (conf || '').toLowerCase();
  if (v.startsWith('baix')) return c.danger;
  if (v.startsWith('méd') || v.startsWith('med')) return c.warning;
  return c.success; // Alta / Média-Alta
}

export default function CodigosErroScreen() {
  const nav = useNavigation<Nav>();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const insets = useSafeAreaInsets();
  const [marcas, setMarcas] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [marca, setMarca] = useState<string | null>(null);
  const [severidade, setSeveridade] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CodigoErro[]>([]);
  const [selected, setSelected] = useState<CodigoErro | null>(null);
  const [naoAchei, setNaoAchei] = useState<Partial<CasoErro> | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroBusca, setErroBusca] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const [ms, t] = await Promise.all([getMarcasErro(), countCodigosErro()]);
        setMarcas(ms);
        setTotal(t);
      } catch {
        // contadores do cabeçalho são cosméticos — falha silenciosa
      }
    })();
  }, []));

  const executarBusca = useCallback(async () => {
    const q = query.trim();
    if (!marca && !severidade && q.length === 0) { setResults([]); setErroBusca(false); return; }
    setCarregando(true);
    setErroBusca(false);
    try {
      const r = await searchCodigosErro({ marca, q, severidade });
      setResults(r);
      if (q.length >= 2) track(Eventos.errorCodeSearched, { q, marca, severidade, resultados: r.length });
    } catch {
      setErroBusca(true);
    } finally {
      setCarregando(false);
    }
  }, [marca, severidade, query]);

  // busca reativa (marca/severidade imediatas, texto com debounce)
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    debounce.current = setTimeout(() => { executarBusca(); }, q ? 250 : 0);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [marca, severidade, query, executarBusca]);

  function pickMarca(m: string | null) {
    Haptics.selectionAsync().catch(() => {});
    setMarca(prev => (prev === m ? null : m));
  }

  function pickSeveridade(s: string) {
    Haptics.selectionAsync().catch(() => {});
    setSeveridade(prev => (prev === s ? null : s));
  }

  function openDetail(c: CodigoErro) {
    Haptics.selectionAsync().catch(() => {});
    setSelected(c);
    track(Eventos.errorCodeOpened, { marca: c.marca, codigo: c.codigo });
  }

  function abrirNaoAchei() {
    setNaoAchei({ marca: marca ?? undefined, codigo: query.trim() || undefined });
  }

  function pedirDiagnostico(prefill?: { marca?: string; codigo?: string; sintoma?: string }) {
    Haptics.selectionAsync().catch(() => {});
    setSelected(null);
    nav.navigate('DiagnosticoIA', prefill ?? { marca: marca ?? undefined, codigo: query.trim() || undefined });
  }

  // Cria um orçamento já com um item-serviço descrevendo o reparo do código aberto.
  function criarOrcamentoDoCodigo(c: CodigoErro) {
    Haptics.selectionAsync().catch(() => {});
    setSelected(null);
    const ctx = [c.marca, c.familia].filter(Boolean).join(' ');
    const nome = [
      'Diagnóstico e reparo',
      ctx ? `— ${ctx}` : '',
      c.codigo ? `(código ${c.codigo})` : '',
    ].filter(Boolean).join(' ').trim() || 'Serviço de diagnóstico e reparo';
    const descricao = [c.falha, c.acao].filter(Boolean).join('. ') || undefined;
    nav.navigate('NovoOrcamento', {
      prefillItem: { tipo: 'servico', nome, descricao },
    });
  }

  async function salvarCaso() {
    const caso: CasoErro = {
      id: generateId(),
      marca: naoAchei?.marca?.trim() || undefined,
      modelo: naoAchei?.modelo?.trim() || undefined,
      codigo: naoAchei?.codigo?.trim() || undefined,
      sintoma: naoAchei?.sintoma?.trim() || undefined,
      criadoEm: nowISO(),
    };
    await saveCasoErro(caso);
    track(Eventos.errorCodeNotFound, { marca: caso.marca, modelo: caso.modelo, codigo: caso.codigo });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setNaoAchei(null);
    Alert.alert('Anotado! 🙏', 'Registramos seu caso pra enriquecer a base. Quando a OLLI Técnica (IA) chegar, ela ajuda com casos como esse.');
  }

  const buscando = !!marca || !!severidade || query.trim().length > 0;

  return (
    <View style={styles.container}>
      <GradientHeader
        onBack={() => goBackOrHome(nav)}
        title="Diagnóstico"
        subtitle={total ? `${total} códigos de erro · ${marcas.length} marcas` : 'Códigos de erro'}
        right={
          <TouchableOpacity style={styles.olliHeaderBtn} onPress={() => pedirDiagnostico({})} activeOpacity={0.85}>
            <MaterialCommunityIcons name="robot-happy-outline" size={16} color={cores.accentLight} />
            <Text style={styles.olliHeaderText}>OLLI</Text>
          </TouchableOpacity>
        }
      >
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={cores.onSurfaceVariant} />
          <TextInput
            style={styles.searchInput}
            placeholder='Código, marca ou sintoma (ex: "E4", "LED piscando")'
            value={query}
            onChangeText={setQuery}
            placeholderTextColor={cores.onSurfaceMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close-circle" size={18} color={cores.onSurfaceMuted} />
            </TouchableOpacity>
          )}
        </View>
      </GradientHeader>

      {/* REGRA DE OURO — sempre visível (feature + blindagem jurídica) */}
      <View style={styles.ouro}>
        <MaterialCommunityIcons name="shield-alert-outline" size={16} color={cores.warning} />
        <Text style={styles.ouroText}>
          Regra de ouro: peça <Text style={styles.ouroBold}>marca + modelo</Text>, veja a confiança e
          <Text style={styles.ouroBold}> nunca troque a placa sem testar</Text>. Código genérico não é diagnóstico.
        </Text>
      </View>

      {/* CHIPS DE MARCA */}
      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <TouchableOpacity style={[styles.chip, !marca && styles.chipActive]} onPress={() => pickMarca(null)} activeOpacity={0.85}>
            <Text style={[styles.chipText, !marca && styles.chipTextActive]}>Todas</Text>
          </TouchableOpacity>
          {marcas.map(m => {
            const active = marca === m;
            return (
              <TouchableOpacity key={m} style={[styles.chip, active && styles.chipActive]} onPress={() => pickMarca(m)} activeOpacity={0.85}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{m}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* CHIPS DE SEVERIDADE */}
      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {SEVERIDADES.map(s => {
            const active = severidade === s;
            const cor = sevColor(s, cores);
            return (
              <TouchableOpacity
                key={s}
                style={[
                  styles.sevChip,
                  { borderColor: active ? cor : cores.outline, backgroundColor: active ? cor + '22' : cores.surface },
                ]}
                onPress={() => pickSeveridade(s)}
                activeOpacity={0.85}
              >
                <View style={[styles.sevDot, { backgroundColor: cor }]} />
                <Text style={[styles.chipText, { color: active ? cor : cores.onSurfaceVariant }]}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={results}
        keyExtractor={c => String(c.id)}
        contentContainerStyle={{
          paddingTop: Spacing.base, paddingHorizontal: Spacing.base, gap: 10, flexGrow: 1,
          paddingBottom: Spacing.base + insets.bottom + (buscando && results.length > 0 ? 80 : 0),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item: c, index }) => (
          <AnimatedEntrance index={Math.min(index, 8)}>
            <TouchableOpacity style={styles.card} onPress={() => openDetail(c)} activeOpacity={0.85}>
              <View style={styles.codeBox}>
                <Text style={styles.codeText} numberOfLines={1}>{c.codigo || '—'}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.cardMarca}>{[c.marca, c.familia].filter(Boolean).join(' · ')}</Text>
                <Text style={styles.cardFalha} numberOfLines={2}>{c.falha || 'Falha não descrita'}</Text>
                <View style={styles.badgesRow}>
                  {!!c.severidade && (
                    <View style={[styles.badge, { backgroundColor: sevColor(c.severidade, cores) + '22' }]}>
                      <Text style={[styles.badgeText, { color: sevColor(c.severidade, cores) }]}>{c.severidade}</Text>
                    </View>
                  )}
                  {!!c.confianca && (
                    <View style={[styles.badge, { backgroundColor: confColor(c.confianca, cores) + '22' }]}>
                      <MaterialCommunityIcons name="shield-check" size={11} color={confColor(c.confianca, cores)} />
                      <Text style={[styles.badgeText, { color: confColor(c.confianca, cores) }]}>{c.confianca}</Text>
                    </View>
                  )}
                </View>
                {!!c.acao && (
                  <View style={styles.acaoRow}>
                    <MaterialCommunityIcons name="hand-pointing-right" size={13} color={cores.accentLight} />
                    <Text style={styles.acaoText} numberOfLines={1}>{c.acao}</Text>
                  </View>
                )}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={cores.onSurfaceMuted} />
            </TouchableOpacity>
          </AnimatedEntrance>
        )}
        ListEmptyComponent={
          carregando ? (
            <View style={{ gap: 10 }}>
              {[0, 1, 2].map(i => <View key={i} style={styles.skeletonCard} />)}
            </View>
          ) : erroBusca ? (
            <View style={styles.noResult}>
              <MaterialCommunityIcons name="database-alert-outline" size={44} color={cores.danger} />
              <Text style={styles.noResultTitle}>Não consegui buscar agora</Text>
              <Text style={styles.noResultSub}>Deu um erro lendo a base local. Tente de novo.</Text>
              <OlliButton label="Tentar de novo" variant="outline" size="md" onPress={executarBusca} icon={<MaterialCommunityIcons name="refresh" size={18} color={cores.primary} />} style={{ marginTop: 14 }} />
            </View>
          ) : buscando ? (
            <View style={styles.noResult}>
              <MaterialCommunityIcons name="magnify-close" size={44} color={cores.onSurfaceMuted} />
              <Text style={styles.noResultTitle}>Nenhum código encontrado</Text>
              <Text style={styles.noResultSub}>Tente outra marca, o código exato ou descreva o sintoma.</Text>
              <OlliButton label="Não achei meu erro" variant="outline" size="md" onPress={abrirNaoAchei} icon={<MaterialCommunityIcons name="help-circle-outline" size={18} color={cores.primary} />} style={{ marginTop: 14 }} />
              {query.trim().length > 0 && (
                <OlliButton
                  label="Perguntar pra OLLI mesmo assim"
                  variant="gradient"
                  size="md"
                  onPress={() => pedirDiagnostico({ marca: marca ?? undefined, sintoma: query.trim() })}
                  icon={<MaterialCommunityIcons name="robot-happy-outline" size={18} color="#fff" />}
                  style={{ marginTop: 10 }}
                />
              )}
            </View>
          ) : (
            <EmptyState
              icon="card-search-outline"
              title="Busque um código de erro"
              subtitle="Escolha a marca acima ou digite o código que aparece no display/LED. Funciona offline, no campo."
            />
          )
        }
      />

      {/* botão flutuante "não achei" quando há busca ativa */}
      {buscando && results.length > 0 && (
        <TouchableOpacity style={[styles.naoAcheiFab, { bottom: insets.bottom + 18 }]} onPress={abrirNaoAchei} activeOpacity={0.9}>
          <MaterialCommunityIcons name="help-circle-outline" size={16} color={cores.accentLight} />
          <Text style={styles.naoAcheiFabText}>Não achei meu erro</Text>
        </TouchableOpacity>
      )}

      {/* ─── DETALHE ─── */}
      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCode}>{selected.codigo || '—'}</Text>
                <Text style={styles.modalBrand}>{[selected.marca, selected.familia].filter(Boolean).join(' · ')}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={26} color={cores.onSurface} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{
              paddingTop: Spacing.base, paddingHorizontal: Spacing.base,
              paddingBottom: 32 + insets.bottom,
            }}>
              <Text style={styles.detFalha}>{selected.falha || 'Falha não descrita'}</Text>

              <View style={styles.detBadges}>
                {!!selected.severidade && (
                  <View style={[styles.badge, { backgroundColor: sevColor(selected.severidade, cores) + '22' }]}>
                    <MaterialCommunityIcons name="alert-outline" size={12} color={sevColor(selected.severidade, cores)} />
                    <Text style={[styles.badgeText, { color: sevColor(selected.severidade, cores) }]}>Severidade {selected.severidade}</Text>
                  </View>
                )}
                {!!selected.confianca && (
                  <View style={[styles.badge, { backgroundColor: confColor(selected.confianca, cores) + '22' }]}>
                    <MaterialCommunityIcons name="shield-check" size={12} color={confColor(selected.confianca, cores)} />
                    <Text style={[styles.badgeText, { color: confColor(selected.confianca, cores) }]}>Confiança {selected.confianca}</Text>
                  </View>
                )}
              </View>

              {!!selected.causa && (
                <AnimatedEntrance index={0}>
                  <Section icon="magnify" title="Causa provável" text={selected.causa} />
                </AnimatedEntrance>
              )}
              {!!selected.acao && (
                <AnimatedEntrance index={1}>
                  <Section icon="hand-pointing-right" title="Ação inicial segura" text={selected.acao} accent />
                </AnimatedEntrance>
              )}
              {(!!selected.exibicao || !!selected.catApp) && (
                <AnimatedEntrance index={2}>
                  <View style={styles.metaRow}>
                    {!!selected.exibicao && <Meta icon="monitor" label="Onde aparece" value={selected.exibicao} />}
                    {!!selected.catApp && <Meta icon="shape-outline" label="Categoria" value={selected.catApp} />}
                  </View>
                </AnimatedEntrance>
              )}

              {/* Regra de ouro / "não faça ainda" */}
              <View style={styles.warnBox}>
                <View style={styles.warnHead}>
                  <MaterialCommunityIcons name="alert-octagon-outline" size={18} color={cores.warning} />
                  <Text style={styles.warnTitle}>Antes de trocar a placa</Text>
                </View>
                <Text style={styles.warnText}>
                  Confiança não é certeza. Confirme com o <Text style={styles.ouroBold}>modelo exato</Text> (interna e
                  condensadora), meça sensores e tensões e só então decida. Código genérico aponta o caminho — não condena a peça.
                </Text>
              </View>

              {!!selected.obs && (
                <Text style={styles.obs}>Obs.: {selected.obs}</Text>
              )}

              {!!selected.url && (
                <TouchableOpacity style={styles.fonteBtn} onPress={() => Linking.openURL(selected.url).catch(() => Alert.alert('Link', 'Não consegui abrir a fonte.'))} activeOpacity={0.85}>
                  <MaterialCommunityIcons name="open-in-new" size={16} color={cores.accentLight} />
                  <Text style={styles.fonteText} numberOfLines={1}>Fonte auditável{selected.fonteId ? ` (${selected.fonteId})` : ''}</Text>
                </TouchableOpacity>
              )}

              {/* Etapa 2 — diagnóstico guiado por IA (cache + fallback pra base) */}
              <TouchableOpacity
                style={styles.olliBox}
                activeOpacity={0.85}
                onPress={() => pedirDiagnostico({ marca: selected.marca, codigo: selected.codigo, sintoma: selected.falha })}
              >
                <MaterialCommunityIcons name="robot-happy-outline" size={22} color={cores.accentLight} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.olliTitle}>Perguntar pra OLLI</Text>
                  <Text style={styles.olliText}>resposta com citação de manual e página — testes em ordem, o que não fazer ainda e mensagem pro cliente.</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={cores.accentLight} />
              </TouchableOpacity>

              {/* CTA — transforma o diagnóstico em orçamento (ciclo do dinheiro) */}
              <OlliButton
                label="Criar orçamento com este reparo"
                variant="gradient"
                size="lg"
                fullWidth
                onPress={() => criarOrcamentoDoCodigo(selected)}
                icon={<MaterialCommunityIcons name="file-plus-outline" size={20} color="#fff" />}
                style={{ marginTop: 14 }}
              />
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* ─── NÃO ACHEI MEU ERRO ─── */}
      <Modal visible={!!naoAchei} animationType="slide" transparent onRequestClose={() => setNaoAchei(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Não achei meu erro</Text>
            <Text style={styles.sheetSub}>Conta o que aparece — isso enriquece a base e ensina a OLLI.</Text>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 6 }}>
              <View style={styles.rowFields}>
                <OlliInput label="Marca" value={naoAchei?.marca ?? ''} onChangeText={v => setNaoAchei(p => ({ ...p, marca: v }))} placeholder="Ex: Fujitsu" containerStyle={{ flex: 1, marginRight: 10 }} />
                <OlliInput label="Modelo" value={naoAchei?.modelo ?? ''} onChangeText={v => setNaoAchei(p => ({ ...p, modelo: v }))} placeholder="Ex: ASBG12" containerStyle={{ flex: 1 }} />
              </View>
              <OlliInput label="Código / display" value={naoAchei?.codigo ?? ''} onChangeText={v => setNaoAchei(p => ({ ...p, codigo: v }))} placeholder="Ex: EE:04 ou 3 piscadas" autoCapitalize="characters" />
              <OlliInput label="Sintoma" value={naoAchei?.sintoma ?? ''} onChangeText={v => setNaoAchei(p => ({ ...p, sintoma: v }))} placeholder="O que a máquina está fazendo?" multiline />
            </ScrollView>
            <View style={styles.sheetActions}>
              <OlliButton label="Cancelar" variant="ghost" size="md" onPress={() => setNaoAchei(null)} style={{ flex: 1 }} />
              <OlliButton label="Enviar caso" variant="gradient" size="md" onPress={salvarCaso} style={{ flex: 1.4 }} icon={<MaterialCommunityIcons name="send" size={16} color="#fff" />} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Section({ icon, title, text, accent }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; text: string; accent?: boolean }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={[styles.section, accent && styles.sectionAccent]}>
      <View style={styles.sectionHead}>
        <MaterialCommunityIcons name={icon} size={16} color={accent ? cores.accentLight : cores.onSurfaceVariant} />
        <Text style={[styles.sectionTitle, accent && { color: cores.accentLight }]}>{title}</Text>
      </View>
      <Text style={styles.sectionText}>{text}</Text>
    </View>
  );
}

function Meta({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.meta}>
      <MaterialCommunityIcons name={icon} size={14} color={cores.onSurfaceMuted} />
      <View style={{ marginLeft: 8, flex: 1 }}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue}>{value}</Text>
      </View>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  // Cyan fixo (base #7FE9F5, não a cor de marca escolhida): decorativo, sem chave semântica exata.
  olliHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(127,233,245,0.12)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 7 },
  olliHeaderText: { fontSize: 12.5, fontWeight: '800', color: c.accentLight },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceVariant, borderRadius: BorderRadius.lg, paddingHorizontal: 14, paddingVertical: 11, gap: 8, marginTop: 14, borderWidth: 1, borderColor: c.outline },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface },

  // Amarelo/warning fixo do handoff cockpit; próximo de `warningLight` mas alfa/hex não batem (ver rule 7).
  ouro: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(247,178,59,0.10)', borderBottomWidth: 1, borderBottomColor: 'rgba(247,178,59,0.22)', paddingHorizontal: Spacing.base, paddingVertical: 10 },
  ouroText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: c.onSurfaceVariant },
  ouroBold: { fontWeight: '800', color: c.onSurface },

  chipsWrap: { borderBottomWidth: 1, borderBottomColor: c.outline },
  chipsRow: { paddingHorizontal: Spacing.base, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: c.outline, backgroundColor: c.surface },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant },
  chipTextActive: { color: c.onPrimary },
  sevChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.full, borderWidth: 1.5 },
  sevDot: { width: 7, height: 7, borderRadius: 4 },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1, borderColor: c.outline, ...sombrasDe(c).sm },
  // Azul fixo (base da marca padrão, não a cor de marca escolhida): decorativo, sem chave semântica exata.
  codeBox: { minWidth: 58, maxWidth: 96, paddingHorizontal: 10, paddingVertical: 10, borderRadius: BorderRadius.md, backgroundColor: 'rgba(11,111,206,0.18)', alignItems: 'center', justifyContent: 'center' },
  codeText: { fontSize: 16, fontWeight: '800', color: c.accentLight, letterSpacing: 0.5 },
  cardMarca: { fontSize: 11.5, fontWeight: '700', color: c.onSurfaceMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  cardFalha: { fontSize: 14.5, fontWeight: '700', color: c.onSurface, marginTop: 2 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  acaoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  acaoText: { flex: 1, fontSize: 12, color: c.accentLight, fontWeight: '600' },

  skeletonCard: { height: 78, borderRadius: BorderRadius.lg, backgroundColor: c.surfaceVariant, borderWidth: 1, borderColor: c.outline, opacity: 0.6 },

  noResult: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  noResultTitle: { fontSize: 16, fontWeight: '800', color: c.onSurface, marginTop: 10 },
  noResultSub: { fontSize: 13, color: c.onSurfaceVariant, textAlign: 'center', marginTop: 4, lineHeight: 19 },

  naoAcheiFab: { position: 'absolute', alignSelf: 'center', bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: 'rgba(127,233,245,0.3)', borderRadius: BorderRadius.full, paddingHorizontal: 16, paddingVertical: 11, ...sombrasDe(c).lg },
  naoAcheiFabText: { fontSize: 13, fontWeight: '800', color: c.accentLight },

  // detalhe
  modal: { flex: 1, backgroundColor: c.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.outline },
  modalCode: { fontSize: 24, fontWeight: '800', color: c.accentLight, letterSpacing: 0.5 },
  modalBrand: { fontSize: 13, fontWeight: '700', color: c.onSurfaceVariant, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  detFalha: { fontSize: 19, fontWeight: '800', color: c.onSurface, lineHeight: 25 },
  detBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 4 },

  section: { backgroundColor: c.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: c.outline, padding: Spacing.base, marginTop: 12 },
  // Cyan fixo (não segue a cor de marca escolhida): decorativo, sem chave semântica exata.
  sectionAccent: { borderColor: 'rgba(52,198,217,0.35)', backgroundColor: 'rgba(52,198,217,0.06)' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  sectionTitle: { fontSize: 12.5, fontWeight: '800', color: c.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionText: { fontSize: 14.5, color: c.onSurface, lineHeight: 21 },

  metaRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  meta: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, padding: 12 },
  metaLabel: { fontSize: 10.5, fontWeight: '700', color: c.onSurfaceMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { fontSize: 13.5, fontWeight: '700', color: c.onSurface, marginTop: 1 },

  // Amarelo/warning fixo do handoff cockpit; próximo de `warningLight` mas alfa/hex não batem (ver rule 7).
  warnBox: { backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.3)', borderRadius: BorderRadius.lg, padding: Spacing.base, marginTop: 16 },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  warnTitle: { fontSize: 14, fontWeight: '800', color: c.warning },
  warnText: { fontSize: 13, color: c.onSurfaceVariant, lineHeight: 19 },

  obs: { fontSize: 12.5, fontStyle: 'italic', color: c.onSurfaceMuted, marginTop: 14, lineHeight: 18 },
  fonteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: c.outline, paddingHorizontal: 14, paddingVertical: 12, marginTop: 16 },
  fonteText: { flex: 1, fontSize: 13, fontWeight: '700', color: c.accentLight },

  // Cyan fixo (base #7FE9F5, não a cor de marca escolhida): decorativo, sem chave semântica exata.
  olliBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(127,233,245,0.08)', borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: 'rgba(127,233,245,0.22)', padding: Spacing.base, marginTop: 16 },
  olliTitle: { fontSize: 14.5, fontWeight: '800', color: c.onSurface, marginBottom: 2 },
  olliText: { fontSize: 12.5, color: c.onSurfaceVariant, lineHeight: 18 },

  // sheet "não achei"
  rowFields: { flexDirection: 'row' },
  // Scrim do bottom sheet: escurece o fundo sempre, nos dois modos (convenção
  // padrão de overlay de modal — sem chave "scrim" na paleta).
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.base, paddingTop: 10, paddingBottom: 28, maxHeight: '88%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.outlineDark, marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: c.onSurface },
  sheetSub: { fontSize: 13, color: c.onSurfaceVariant, marginTop: 3, marginBottom: 14 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
