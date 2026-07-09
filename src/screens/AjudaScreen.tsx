import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Linking, Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, Shadow } from '../theme';
import { GradientHeader } from '../components/GradientHeader';
import { OlliButton } from '../components/OlliButton';
import { OlliInput } from '../components/OlliInput';
import { EmptyState } from '../components/EmptyState';
import { AnimatedEntrance } from '../components/AnimatedEntrance';
import { abrirWhatsApp } from '../utils/exportarDocumento';
import { WHATSAPP_SUPORTE, APP_VERSION } from '../config';
import { usePlano } from '../hooks/usePlano';
import { track, Eventos } from '../services/analytics';
import { goBackOrHome } from '../navigation/safeBack';
import {
  CATEGORIAS_AJUDA, ARTIGOS_AJUDA, getCategoria, getArtigo, getArtigosDaCategoria,
  buscarArtigos, type AjudaArtigo, type AjudaBloco,
} from '../content/ajuda';

/**
 * Params aceitos por esta tela. Copie esta linha para `RootStackParamList` (em
 * navigation/AppNavigator.tsx) ao registrar a rota — ex.: `Ajuda: AjudaRouteParams;`.
 * Todos os campos são opcionais: `nav.navigate('Ajuda')` sem params sempre funciona
 * e abre a Central na tela inicial (categorias).
 */
export type AjudaRouteParams = {
  /** Abre direto este artigo (ex.: vindo de uma DicaContextual "saiba mais"). */
  artigoId?: string;
  /** Abre direto esta categoria. */
  categoriaId?: string;
  /** Nome da tela de origem, pro contexto da mensagem de suporte (ex.: "Orçamentos"). */
  origem?: string;
} | undefined;

type Rota = RouteProp<Record<'Ajuda', AjudaRouteParams>, 'Ajuda'>;

/** E-mail oficial de suporte — mesmo domínio do link público (config.LINK_BASE_URL). */
const EMAIL_SUPORTE = 'suporte@olliorcamentos.online';

const PLANO_LABEL: Record<string, string> = { gratis: 'Grátis', pro: 'Pro', empresa: 'Empresa' };

type TipoContato = 'duvida' | 'sugestao' | 'bug';
const TIPO_CONTATO_LABEL: Record<TipoContato, string> = { duvida: 'Dúvida', sugestao: 'Sugestão', bug: 'Algo não funcionou' };

export default function AjudaScreen() {
  const nav = useNavigation();
  const route = useRoute<Rota>();
  const { plano } = usePlano();

  const [query, setQuery] = useState('');
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(route.params?.categoriaId ?? null);
  const [artigo, setArtigo] = useState<AjudaArtigo | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [formNome, setFormNome] = useState('');
  const [formTipo, setFormTipo] = useState<TipoContato>('duvida');
  const [formMensagem, setFormMensagem] = useState('');

  // Deep-link: chegar já num artigo específico (ex.: vindo de uma dica contextual).
  useEffect(() => {
    const id = route.params?.artigoId;
    if (!id) return;
    const a = getArtigo(id);
    if (a) {
      setArtigo(a);
      track(Eventos.ajudaArtigoAberto, { id: a.id, origem: route.params?.origem ?? 'deep_link' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buscando = query.trim().length >= 2;
  const resultados = useMemo(() => (buscando ? buscarArtigos(query) : []), [query, buscando]);

  // Busca: registra 1x por pausa de digitação (evita evento por tecla).
  const debounceBusca = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceBusca.current) clearTimeout(debounceBusca.current);
    if (!buscando) return;
    debounceBusca.current = setTimeout(() => {
      track(Eventos.ajudaBuscou, { q: query.trim(), resultados: resultados.length });
    }, 500);
    return () => { if (debounceBusca.current) clearTimeout(debounceBusca.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, buscando]);

  const artigosDaCategoria = categoriaAtiva ? getArtigosDaCategoria(categoriaAtiva) : [];
  const categoriaSelecionada = categoriaAtiva ? getCategoria(categoriaAtiva) : undefined;

  function origemAtual(): string {
    if (artigo) return `Artigo: ${artigo.titulo}`;
    if (categoriaSelecionada) return `Categoria: ${categoriaSelecionada.titulo}`;
    if (route.params?.origem) return route.params.origem;
    return 'Central de Ajuda';
  }

  /** Mensagem contextual pro suporte: tela + plano + versão — nunca dado do cliente. */
  function mensagemSuporte(extra?: string): string {
    const linhas = [
      'Olá! Preciso de ajuda com o OLLI Orçamentos.',
      `Tela: ${origemAtual()}`,
      `Plano: ${PLANO_LABEL[plano] ?? plano}`,
      `Versão do app: ${APP_VERSION || 'não informada'}`,
    ];
    if (extra?.trim()) linhas.push('', extra.trim());
    return linhas.join('\n');
  }

  function abrirCategoria(id: string) {
    Haptics.selectionAsync().catch(() => {});
    setQuery('');
    setCategoriaAtiva(prev => (prev === id ? null : id));
  }

  function abrirArtigo(a: AjudaArtigo) {
    Haptics.selectionAsync().catch(() => {});
    setArtigo(a);
    track(Eventos.ajudaArtigoAberto, { id: a.id, origem: origemAtual() });
  }

  function handleWhatsApp() {
    Haptics.selectionAsync().catch(() => {});
    if (!WHATSAPP_SUPORTE) {
      Alert.alert('Ainda não disponível', 'O contato por WhatsApp ainda não foi configurado. Tente por e-mail.');
      return;
    }
    track(Eventos.ajudaSuporteContato, { canal: 'whatsapp', origem: origemAtual() });
    abrirWhatsApp(WHATSAPP_SUPORTE, mensagemSuporte()).catch(() => {
      Alert.alert('Ops', 'Não consegui abrir o WhatsApp agora. Tente novamente.');
    });
  }

  function handleEmail() {
    Haptics.selectionAsync().catch(() => {});
    track(Eventos.ajudaSuporteContato, { canal: 'email', origem: origemAtual() });
    const assunto = encodeURIComponent('Suporte OLLI Orçamentos');
    const corpo = encodeURIComponent(mensagemSuporte());
    Linking.openURL(`mailto:${EMAIL_SUPORTE}?subject=${assunto}&body=${corpo}`).catch(() => {
      Alert.alert('Ops', 'Não consegui abrir seu aplicativo de e-mail agora.');
    });
  }

  function handleEnviarFormulario() {
    if (!formMensagem.trim()) {
      Alert.alert('Conta pra gente', 'Escreva sua dúvida ou o que aconteceu antes de enviar.');
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    track(Eventos.ajudaSuporteContato, { canal: 'formulario', tipo: formTipo, origem: origemAtual() });
    const extra = [
      formNome.trim() ? `Nome: ${formNome.trim()}` : null,
      `Tipo: ${TIPO_CONTATO_LABEL[formTipo]}`,
      `Mensagem: ${formMensagem.trim()}`,
    ].filter(Boolean).join('\n');
    const assunto = encodeURIComponent(`Suporte OLLI — ${TIPO_CONTATO_LABEL[formTipo]}`);
    const corpo = encodeURIComponent(mensagemSuporte(extra));
    Linking.openURL(`mailto:${EMAIL_SUPORTE}?subject=${assunto}&body=${corpo}`)
      .then(() => {
        Alert.alert('Prontinho!', 'Abrimos seu app de e-mail com a mensagem já escrita — é só conferir e enviar.');
        setFormAberto(false);
        setFormNome('');
        setFormMensagem('');
        setFormTipo('duvida');
      })
      .catch(() => Alert.alert('Ops', 'Não consegui abrir seu aplicativo de e-mail agora.'));
  }

  /** Botões WhatsApp/E-mail/Formulário + o formulário inline quando aberto — reaproveitado no card do topo e dentro do artigo. */
  function renderCanaisDeSuporte() {
    return (
      <>
        <View style={styles.suporteBtns}>
          <TouchableOpacity style={[styles.suporteBtn, styles.suporteBtnWhats]} onPress={handleWhatsApp} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Falar no WhatsApp">
            <MaterialCommunityIcons name="whatsapp" size={17} color="#fff" />
            <Text style={styles.suporteBtnTextWhats}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.suporteBtn} onPress={handleEmail} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Enviar e-mail">
            <MaterialCommunityIcons name="email-outline" size={17} color={Colors.accentLight} />
            <Text style={styles.suporteBtnText}>E-mail</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.suporteBtn} onPress={() => setFormAberto(v => !v)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Abrir formulário de contato">
            <MaterialCommunityIcons name={formAberto ? 'chevron-up' : 'form-textbox'} size={17} color={Colors.accentLight} />
            <Text style={styles.suporteBtnText}>Formulário</Text>
          </TouchableOpacity>
        </View>

        {formAberto && (
          <AnimatedEntrance from="scale" style={styles.formBox}>
            <OlliInput
              label="Seu nome (opcional)"
              value={formNome}
              onChangeText={setFormNome}
              placeholder="Como podemos te chamar?"
              containerStyle={{ marginBottom: 10 }}
            />
            <Text style={styles.formLabel}>Sobre o quê?</Text>
            <View style={styles.formChips}>
              {(Object.keys(TIPO_CONTATO_LABEL) as TipoContato[]).map(t => {
                const ativo = formTipo === t;
                return (
                  <TouchableOpacity key={t} style={[styles.formChip, ativo && styles.formChipAtivo]} onPress={() => setFormTipo(t)} activeOpacity={0.85}>
                    <Text style={[styles.formChipText, ativo && styles.formChipTextAtivo]}>{TIPO_CONTATO_LABEL[t]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <OlliInput
              label="Mensagem"
              value={formMensagem}
              onChangeText={setFormMensagem}
              placeholder="Conte o que você estava tentando fazer e o que aconteceu..."
              multiline
              containerStyle={{ marginTop: 12, marginBottom: 14 }}
            />
            <OlliButton
              label="Enviar por e-mail"
              variant="gradient"
              size="md"
              fullWidth
              onPress={handleEnviarFormulario}
              icon={<MaterialCommunityIcons name="send" size={16} color="#fff" />}
            />
          </AnimatedEntrance>
        )}
      </>
    );
  }

  return (
    <View style={styles.container}>
      <GradientHeader onBack={() => goBackOrHome(nav as any)} title="Central de Ajuda" subtitle={`${ARTIGOS_AJUDA.length} artigos · fale com o suporte quando quiser`}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={Colors.onSurfaceVariant} />
          <TextInput
            style={styles.searchInput}
            placeholder="Busque por um assunto (ex.: link do cliente, backup)"
            value={query}
            onChangeText={setQuery}
            placeholderTextColor={Colors.onSurfaceMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close-circle" size={18} color={Colors.onSurfaceMuted} />
            </TouchableOpacity>
          )}
        </View>
      </GradientHeader>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {/* SUPORTE — sempre acessível, mesmo sem ter aberto nenhum artigo */}
        <AnimatedEntrance index={0}>
          <View style={styles.suporteCard}>
            <View style={styles.suporteHead}>
              <MaterialCommunityIcons name="lifebuoy" size={20} color={Colors.accentLight} />
              <Text style={styles.suporteTitle}>Precisa falar com a gente?</Text>
            </View>
            <Text style={styles.suporteSub}>Escolha o canal — sem precisar mandar dado sensível de cliente.</Text>
            {renderCanaisDeSuporte()}
          </View>
        </AnimatedEntrance>

        {buscando ? (
          // ─── RESULTADOS DE BUSCA ──────────────────────────────
          <View style={{ marginTop: Spacing.lg }}>
            <Text style={styles.sectionTitle}>
              {resultados.length} resultado{resultados.length === 1 ? '' : 's'} para "{query.trim()}"
            </Text>
            {resultados.length === 0 ? (
              <EmptyState
                icon="text-box-search-outline"
                title="Nada encontrado"
                subtitle="Tenta outra palavra, ou fala direto com o suporte — a gente responde rápido."
                actionLabel="Falar com o suporte"
                onAction={handleWhatsApp}
              />
            ) : (
              resultados.map((a, idx) => <ArtigoRow key={a.id} artigo={a} index={idx} onPress={() => abrirArtigo(a)} />)
            )}
          </View>
        ) : categoriaSelecionada ? (
          // ─── ARTIGOS DA CATEGORIA ─────────────────────────────
          <View style={{ marginTop: Spacing.lg }}>
            <TouchableOpacity style={styles.breadcrumb} onPress={() => setCategoriaAtiva(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="chevron-left" size={18} color={Colors.accentLight} />
              <Text style={styles.breadcrumbText}>Categorias</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>{categoriaSelecionada.titulo}</Text>
            {artigosDaCategoria.map((a, idx) => <ArtigoRow key={a.id} artigo={a} index={idx} onPress={() => abrirArtigo(a)} />)}
          </View>
        ) : (
          // ─── CATEGORIAS ────────────────────────────────────────
          <View style={{ marginTop: Spacing.lg }}>
            <Text style={styles.sectionTitle}>Categorias</Text>
            {CATEGORIAS_AJUDA.map((c, idx) => {
              const count = ARTIGOS_AJUDA.filter(a => a.categoriaId === c.id).length;
              return (
                <AnimatedEntrance key={c.id} index={Math.min(idx, 8)}>
                  <TouchableOpacity style={styles.catCard} onPress={() => abrirCategoria(c.id)} activeOpacity={0.85}>
                    <View style={styles.catIconWrap}>
                      <MaterialCommunityIcons name={c.icone as keyof typeof MaterialCommunityIcons.glyphMap} size={22} color={Colors.accentLight} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.catTitle}>{c.titulo}</Text>
                      <Text style={styles.catCount}>{count} artigo{count === 1 ? '' : 's'}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.onSurfaceMuted} />
                  </TouchableOpacity>
                </AnimatedEntrance>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ─── DETALHE DO ARTIGO ─── */}
      <Modal visible={!!artigo} animationType="slide" onRequestClose={() => setArtigo(null)}>
        {artigo && (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCategoria}>{getCategoria(artigo.categoriaId)?.titulo}</Text>
                <Text style={styles.modalTitle}>{artigo.titulo}</Text>
              </View>
              <TouchableOpacity onPress={() => setArtigo(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
                <MaterialCommunityIcons name="close" size={26} color={Colors.onSurface} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 40 }}>
              <Text style={styles.modalResumo}>{artigo.resumo}</Text>
              {artigo.corpo.map((b, i) => <Bloco key={i} bloco={b} />)}

              <View style={styles.duvidaBox}>
                <Text style={styles.duvidaTitle}>Ainda com dúvida?</Text>
                <Text style={styles.duvidaSub}>Fala com a gente — é rápido.</Text>
                {renderCanaisDeSuporte()}
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

function ArtigoRow({ artigo, index, onPress }: { artigo: AjudaArtigo; index: number; onPress: () => void }) {
  return (
    <AnimatedEntrance index={Math.min(index, 8)}>
      <TouchableOpacity style={styles.artRow} onPress={onPress} activeOpacity={0.85}>
        <View style={{ flex: 1 }}>
          <Text style={styles.artTitle}>{artigo.titulo}</Text>
          <Text style={styles.artResumo} numberOfLines={2}>{artigo.resumo}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.onSurfaceMuted} />
      </TouchableOpacity>
    </AnimatedEntrance>
  );
}

function Bloco({ bloco }: { bloco: AjudaBloco }) {
  if (bloco.tipo === 'passos' && Array.isArray(bloco.conteudo)) {
    return (
      <View style={styles.passosBox}>
        {bloco.conteudo.map((p, idx) => (
          <View key={idx} style={styles.passoRow}>
            <View style={styles.passoNum}><Text style={styles.passoNumText}>{idx + 1}</Text></View>
            <Text style={styles.passoText}>{p}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (bloco.tipo === 'aviso' && typeof bloco.conteudo === 'string') {
    return (
      <View style={styles.avisoBox}>
        <MaterialCommunityIcons name="information-outline" size={16} color={Colors.warning} />
        <Text style={styles.avisoText}>{bloco.conteudo}</Text>
      </View>
    );
  }
  if (typeof bloco.conteudo === 'string') {
    return <Text style={styles.paragrafo}>{bloco.conteudo}</Text>;
  }
  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.lg, paddingHorizontal: 14, paddingVertical: 11, gap: 8, marginTop: 14, borderWidth: 1, borderColor: Colors.outline },
  searchInput: { flex: 1, fontSize: 15, color: Colors.onSurface },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.onSurface, marginBottom: 10 },

  breadcrumb: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 6 },
  breadcrumbText: { fontSize: 13.5, fontWeight: '700', color: Colors.accentLight },

  catCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.outline, marginBottom: 10, ...Shadow.sm },
  catIconWrap: { width: 42, height: 42, borderRadius: BorderRadius.md, backgroundColor: 'rgba(127,233,245,0.12)', alignItems: 'center', justifyContent: 'center' },
  catTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.onSurface },
  catCount: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },

  artRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.outline, marginBottom: 10, ...Shadow.sm },
  artTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.onSurface },
  artResumo: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 3, lineHeight: 17 },

  // Suporte (card do topo + bloco dentro do artigo)
  suporteCard: { backgroundColor: 'rgba(52,198,217,0.08)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.25)', borderRadius: BorderRadius.lg, padding: Spacing.base },
  suporteHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  suporteTitle: { fontSize: 15, fontWeight: '800', color: Colors.onSurface },
  suporteSub: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 4, marginBottom: 12, lineHeight: 17 },
  suporteBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  suporteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.outline, borderRadius: BorderRadius.full, paddingHorizontal: 13, paddingVertical: 9 },
  suporteBtnText: { fontSize: 12.5, fontWeight: '800', color: Colors.accentLight },
  suporteBtnWhats: { backgroundColor: Colors.whatsapp, borderColor: Colors.whatsapp },
  suporteBtnTextWhats: { fontSize: 12.5, fontWeight: '800', color: '#fff' },

  formBox: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.outline },
  formLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.onSurfaceVariant, marginBottom: 8 },
  formChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: Colors.outline, backgroundColor: Colors.surface },
  formChipAtivo: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  formChipText: { fontSize: 12.5, fontWeight: '700', color: Colors.onSurfaceVariant },
  formChipTextAtivo: { color: '#fff' },

  duvidaBox: { marginTop: 24, backgroundColor: 'rgba(52,198,217,0.08)', borderWidth: 1, borderColor: 'rgba(127,233,245,0.25)', borderRadius: BorderRadius.lg, padding: Spacing.base },
  duvidaTitle: { fontSize: 15, fontWeight: '800', color: Colors.onSurface },
  duvidaSub: { fontSize: 12.5, color: Colors.onSurfaceVariant, marginTop: 3, marginBottom: 12 },

  // Modal do artigo
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.base, paddingTop: 56, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.outline },
  modalCategoria: { fontSize: 11.5, fontWeight: '800', color: Colors.accentLight, textTransform: 'uppercase', letterSpacing: 0.4 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: Colors.onSurface, marginTop: 2 },
  modalResumo: { fontSize: 14.5, color: Colors.onSurfaceVariant, lineHeight: 20, marginBottom: 6 },

  paragrafo: { fontSize: 14.5, color: Colors.onSurface, lineHeight: 21, marginTop: 14 },

  passosBox: { marginTop: 14, gap: 10 },
  passoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  passoNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(11,111,206,0.20)', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  passoNumText: { fontSize: 11.5, fontWeight: '800', color: Colors.accentLight },
  passoText: { flex: 1, fontSize: 14, color: Colors.onSurface, lineHeight: 20 },

  avisoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(247,178,59,0.10)', borderWidth: 1, borderColor: 'rgba(247,178,59,0.25)', borderRadius: BorderRadius.md, padding: 12, marginTop: 14 },
  avisoText: { flex: 1, fontSize: 12.5, color: Colors.onSurfaceVariant, lineHeight: 18 },
});
