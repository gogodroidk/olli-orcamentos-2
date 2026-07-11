import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet, Linking,
  NativeSyntheticEvent, TextInputKeyPressEventData,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, comAlfa, sombrasDe, type Cores } from '../../theme';
import { LayoutDesktop } from '../../components/web/LayoutDesktop';
import { PressableWebState } from '../../components/web/pressableWebState';
import { OlliInput } from '../../components/OlliInput';
import { OlliButton } from '../../components/OlliButton';
import { abrirWhatsApp } from '../../utils/exportarDocumento';
import { WHATSAPP_SUPORTE, APP_VERSION } from '../../config';
import { usePlano } from '../../hooks/usePlano';
import { enviarFeedback } from '../../services/feedback';
import { track, Eventos } from '../../services/analytics';
import {
  CATEGORIAS_AJUDA, ARTIGOS_AJUDA, getCategoria, getArtigosDaCategoria,
  buscarArtigos, type AjudaArtigo, type AjudaBloco,
} from '../../content/ajuda';
import { avisar } from './dialogo';

/** Mesmo e-mail oficial de suporte da AjudaScreen mobile (src/screens/AjudaScreen.tsx). */
const EMAIL_SUPORTE = 'suporte@olliorcamentos.online';

const PLANO_LABEL: Record<string, string> = { gratis: 'Grátis', pro: 'Pro', empresa: 'Empresa' };

type TipoContato = 'duvida' | 'sugestao' | 'bug';
const TIPO_CONTATO_LABEL: Record<TipoContato, string> = { duvida: 'Dúvida', sugestao: 'Sugestão', bug: 'Algo não funcionou' };

const MAX_RESULTADOS_DROPDOWN = 8;

/**
 * Ajuda desktop (v4) — única fora do padrão tabela do kit: busca hero + grid de
 * categorias na entrada, e leitura em duas colunas (índice sticky + artigo)
 * dentro de uma categoria. Reaproveita 100% do conteúdo e dos serviços já
 * usados pela AjudaScreen mobile (content/ajuda, services/feedback,
 * services/analytics, usePlano, utils/exportarDocumento) — só a casca (React
 * Native puro + LayoutDesktop, sem GradientHeader/Modal de tela cheia) muda.
 */
export default function AjudaDesktopScreen() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const { plano } = usePlano();

  const [query, setQuery] = useState('');
  const [focoBusca, setFocoBusca] = useState(false);
  const [artigoAtivo, setArtigoAtivo] = useState<AjudaArtigo | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [formNome, setFormNome] = useState('');
  const [formTipo, setFormTipo] = useState<TipoContato>('duvida');
  const [formMensagem, setFormMensagem] = useState('');
  const [enviandoForm, setEnviandoForm] = useState(false);

  const inputBuscaRef = useRef<TextInput>(null);

  const buscando = query.trim().length >= 2;
  const resultados = useMemo(() => (buscando ? buscarArtigos(query) : []), [query, buscando]);
  const dropdownAberto = focoBusca && buscando;

  // Atalho de teclado "/" foca a busca — padrão de central de ajuda desktop.
  // Este arquivo só monta na web (≥1024px), então document/window são seguros.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== '/') return;
      const ativo = document.activeElement as HTMLElement | null;
      const digitando = !!ativo && (ativo.tagName === 'INPUT' || ativo.tagName === 'TEXTAREA' || ativo.isContentEditable);
      if (digitando) return;
      e.preventDefault();
      inputBuscaRef.current?.focus();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  // Busca: registra 1x por pausa de digitação (mesmo padrão da tela mobile).
  const debounceBusca = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceBusca.current) clearTimeout(debounceBusca.current);
    if (!buscando) return;
    debounceBusca.current = setTimeout(() => {
      track(Eventos.ajudaBuscou, { q: query.trim(), resultados: resultados.length });
    }, 500);
    return () => { if (debounceBusca.current) clearTimeout(debounceBusca.current); };
  }, [query, buscando, resultados.length]);

  function origemAtual(): string {
    if (artigoAtivo) return `Artigo: ${artigoAtivo.titulo}`;
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

  function abrirArtigo(a: AjudaArtigo, origem: string) {
    setArtigoAtivo(a);
    setQuery('');
    setFocoBusca(false);
    track(Eventos.ajudaArtigoAberto, { id: a.id, origem });
  }

  function abrirCategoria(id: string) {
    const artigos = getArtigosDaCategoria(id);
    if (artigos[0]) abrirArtigo(artigos[0], `Categoria: ${getCategoria(id)?.titulo ?? id}`);
  }

  function voltarInicio() {
    setArtigoAtivo(null);
    setQuery('');
  }

  function handleWhatsApp() {
    if (!WHATSAPP_SUPORTE) {
      avisar('Ainda não disponível', 'O contato por WhatsApp ainda não foi configurado. Tente por e-mail.');
      return;
    }
    track(Eventos.ajudaSuporteContato, { canal: 'whatsapp', origem: origemAtual() });
    abrirWhatsApp(WHATSAPP_SUPORTE, mensagemSuporte()).catch(() => {
      avisar('Ops', 'Não consegui abrir o WhatsApp agora. Tente novamente.');
    });
  }

  function handleEmail() {
    track(Eventos.ajudaSuporteContato, { canal: 'email', origem: origemAtual() });
    const assunto = encodeURIComponent('Suporte OLLI Orçamentos');
    const corpo = encodeURIComponent(mensagemSuporte());
    Linking.openURL(`mailto:${EMAIL_SUPORTE}?subject=${assunto}&body=${corpo}`).catch(() => {
      avisar('Ops', 'Não consegui abrir seu aplicativo de e-mail agora.');
    });
  }

  async function handleEnviarFormulario() {
    if (!formMensagem.trim()) {
      avisar('Conta pra gente', 'Escreva sua dúvida ou o que aconteceu antes de enviar.');
      return;
    }
    if (enviandoForm) return;
    setEnviandoForm(true);
    track(Eventos.ajudaSuporteContato, { canal: 'formulario', tipo: formTipo, origem: origemAtual() });

    // GRAVA de verdade na caixa (o dono ve no /admin) — mesma chamada da mobile.
    const tipoDb = formTipo === 'sugestao' ? 'sugestao' : formTipo === 'bug' ? 'bug' : 'feedback';
    const nome = formNome.trim();
    const mensagem = (nome ? `[${nome}] ` : '') + formMensagem.trim();
    const r = await enviarFeedback(tipoDb, mensagem, { tela: origemAtual(), plano: PLANO_LABEL[plano] ?? plano });
    setEnviandoForm(false);

    if (r === 'ok') {
      avisar('Recebemos!', 'Sua mensagem chegou pra gente. Se precisar de retorno rápido, chama no WhatsApp.');
      setFormAberto(false);
      setFormNome('');
      setFormMensagem('');
      setFormTipo('duvida');
      return;
    }

    // Sem sessao / falha de rede: nao perde a mensagem — abre o e-mail ja escrito.
    const extra = [
      nome ? `Nome: ${nome}` : null,
      `Tipo: ${TIPO_CONTATO_LABEL[formTipo]}`,
      `Mensagem: ${formMensagem.trim()}`,
    ].filter(Boolean).join('\n');
    const assunto = encodeURIComponent(`Suporte OLLI — ${TIPO_CONTATO_LABEL[formTipo]}`);
    const corpo = encodeURIComponent(mensagemSuporte(extra));
    Linking.openURL(`mailto:${EMAIL_SUPORTE}?subject=${assunto}&body=${corpo}`)
      .then(() => {
        avisar('Quase lá', 'Não consegui salvar aqui agora, então abri seu e-mail com a mensagem pronta — é só enviar.');
        setFormAberto(false);
        setFormNome('');
        setFormMensagem('');
        setFormTipo('duvida');
      })
      .catch(() => avisar('Ops', 'Não consegui salvar nem abrir o e-mail agora. Tente o WhatsApp.'));
  }

  function aoTeclarBusca(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === 'Escape') {
      setQuery('');
      inputBuscaRef.current?.blur();
    }
  }

  function aoSubmeterBusca() {
    if (resultados[0]) abrirArtigo(resultados[0], 'Busca');
  }

  /** Botões WhatsApp/E-mail/Formulário + o formulário inline — reaproveitado na home e no fim do artigo. */
  function renderCanaisDeSuporte() {
    return (
      <>
        <View style={styles.suporteBtns}>
          <Pressable
            onPress={handleWhatsApp}
            accessibilityRole="button"
            accessibilityLabel="Falar no WhatsApp"
            style={({ hovered, focused }: PressableWebState) => [styles.suporteBtn, styles.suporteBtnWhats, hovered && styles.suporteBtnWhatsHover, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name="whatsapp" size={17} color={cores.onPrimary} />
            <Text style={styles.suporteBtnTextWhats}>WhatsApp</Text>
          </Pressable>
          <Pressable
            onPress={handleEmail}
            accessibilityRole="button"
            accessibilityLabel="Enviar e-mail"
            style={({ hovered, focused }: PressableWebState) => [styles.suporteBtn, hovered && styles.suporteBtnHover, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name="email-outline" size={17} color={cores.accentLight} />
            <Text style={styles.suporteBtnText}>E-mail</Text>
          </Pressable>
          <Pressable
            onPress={() => setFormAberto((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Abrir formulário de contato"
            style={({ hovered, focused }: PressableWebState) => [styles.suporteBtn, hovered && styles.suporteBtnHover, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name={formAberto ? 'chevron-up' : 'form-textbox'} size={17} color={cores.accentLight} />
            <Text style={styles.suporteBtnText}>Formulário</Text>
          </Pressable>
        </View>

        {formAberto && (
          <View style={styles.formBox}>
            <OlliInput
              label="Seu nome (opcional)"
              value={formNome}
              onChangeText={setFormNome}
              placeholder="Como podemos te chamar?"
              containerStyle={{ marginBottom: 10 }}
            />
            <Text style={styles.formLabel}>Sobre o quê?</Text>
            <View style={styles.formChips}>
              {(Object.keys(TIPO_CONTATO_LABEL) as TipoContato[]).map((t) => {
                const ativo = formTipo === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setFormTipo(t)}
                    accessibilityRole="button"
                    accessibilityLabel={TIPO_CONTATO_LABEL[t]}
                    style={({ hovered, focused }: PressableWebState) => [styles.formChip, ativo && styles.formChipAtivo, hovered && !ativo && styles.formChipHover, focused && styles.focoVisivel]}
                  >
                    <Text style={[styles.formChipText, ativo && styles.formChipTextAtivo]}>{TIPO_CONTATO_LABEL[t]}</Text>
                  </Pressable>
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
              label="Enviar mensagem"
              variant="gradient"
              size="md"
              loading={enviandoForm}
              onPress={handleEnviarFormulario}
              icon={<MaterialCommunityIcons name="send" size={16} color="#fff" />}
            />
          </View>
        )}
      </>
    );
  }

  const categoriaAtiva = artigoAtivo ? getCategoria(artigoAtivo.categoriaId) : undefined;
  const artigosDaCategoria = artigoAtivo ? getArtigosDaCategoria(artigoAtivo.categoriaId) : [];

  return (
    <LayoutDesktop
      titulo="Central de Ajuda"
      subtitulo={`${ARTIGOS_AJUDA.length} artigos · fale com o suporte quando quiser`}
    >
      {artigoAtivo ? (
        // ─── LEITURA: índice sticky + artigo ──────────────────────────────
        <View>
          <Pressable
            onPress={voltarInicio}
            accessibilityRole="button"
            accessibilityLabel="Voltar para a Central de Ajuda"
            style={({ hovered, focused }: PressableWebState) => [styles.breadcrumb, focused && styles.focoVisivel]}
          >
            <MaterialCommunityIcons name="chevron-left" size={18} color={cores.accentLight} />
            <Text style={styles.breadcrumbText}>Central de Ajuda</Text>
          </Pressable>

          <View style={styles.leituraLinha}>
            <View style={styles.indiceColuna}>
              <Text style={styles.indiceCategoria}>{categoriaAtiva?.titulo}</Text>
              {artigosDaCategoria.map((a) => {
                const ativo = a.id === artigoAtivo.id;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => abrirArtigo(a, `Categoria: ${categoriaAtiva?.titulo ?? ''}`)}
                    accessibilityRole="button"
                    accessibilityLabel={a.titulo}
                    style={({ hovered, focused }: PressableWebState) => [styles.indiceItem, ativo && styles.indiceItemAtivo, hovered && !ativo && styles.indiceItemHover, focused && styles.focoVisivel]}
                  >
                    <Text style={[styles.indiceItemTexto, ativo && styles.indiceItemTextoAtivo]} numberOfLines={2}>{a.titulo}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={voltarInicio}
                accessibilityRole="button"
                accessibilityLabel="Ver todas as categorias"
                style={({ hovered, focused }: PressableWebState) => [styles.indiceTodasCategorias, focused && styles.focoVisivel]}
              >
                <MaterialCommunityIcons name="view-grid-outline" size={15} color={cores.onSurfaceVariant} />
                <Text style={styles.indiceTodasCategoriasTexto}>Todas as categorias</Text>
              </Pressable>
            </View>

            <View style={styles.conteudoColuna}>
              <Text style={styles.artigoEyebrow}>{categoriaAtiva?.titulo}</Text>
              <Text style={styles.artigoTitulo}>{artigoAtivo.titulo}</Text>
              <Text style={styles.artigoResumo}>{artigoAtivo.resumo}</Text>

              {artigoAtivo.corpo.map((b, i) => <Bloco key={i} bloco={b} />)}

              <View style={styles.duvidaBox}>
                <Text style={styles.duvidaTitulo}>Ainda com dúvida?</Text>
                <Text style={styles.duvidaSub}>Fala com a gente — é rápido.</Text>
                {renderCanaisDeSuporte()}
              </View>
            </View>
          </View>
        </View>
      ) : (
        // ─── HOME: busca hero + grid de categorias ─────────────────────────
        <View>
          <View style={styles.heroWrap}>
            <Text style={styles.heroTitulo}>Como podemos ajudar?</Text>
            <Text style={styles.heroSub}>
              Busque por um assunto, ou explore por categoria abaixo. Atalho{' '}
              <Text style={styles.heroTecla}>/</Text> foca a busca.
            </Text>

            <View style={styles.heroBuscaBox}>
              <View style={[styles.heroBusca, focoBusca && styles.heroBuscaFoco]}>
                <MaterialCommunityIcons name="magnify" size={22} color={cores.onSurfaceMuted} />
                <TextInput
                  ref={inputBuscaRef}
                  style={styles.heroBuscaInput}
                  placeholder="Busque por um assunto (ex.: link do cliente, backup)"
                  placeholderTextColor={cores.onSurfaceMuted}
                  value={query}
                  onChangeText={setQuery}
                  onFocus={() => setFocoBusca(true)}
                  onBlur={() => setTimeout(() => setFocoBusca(false), 150)}
                  onKeyPress={aoTeclarBusca}
                  onSubmitEditing={aoSubmeterBusca}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Limpar busca" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="close-circle" size={18} color={cores.onSurfaceMuted} />
                  </Pressable>
                )}
              </View>

              {dropdownAberto && (
                <View style={styles.dropdown}>
                  {resultados.length === 0 ? (
                    <View style={styles.dropdownVazio}>
                      <Text style={styles.dropdownVazioTexto}>Nada encontrado para "{query.trim()}".</Text>
                      <Pressable onPress={handleWhatsApp} accessibilityRole="button" accessibilityLabel="Falar com o suporte">
                        <Text style={styles.dropdownVazioLink}>Falar com o suporte →</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      {resultados.slice(0, MAX_RESULTADOS_DROPDOWN).map((a) => (
                        <Pressable
                          key={a.id}
                          onPress={() => abrirArtigo(a, 'Busca')}
                          accessibilityRole="button"
                          accessibilityLabel={a.titulo}
                          style={({ hovered, focused }: PressableWebState) => [styles.dropdownItem, hovered && styles.dropdownItemHover, focused && styles.focoVisivel]}
                        >
                          <Text style={styles.dropdownItemCategoria}>{getCategoria(a.categoriaId)?.titulo}</Text>
                          <Text style={styles.dropdownItemTitulo}>{a.titulo}</Text>
                          <Text style={styles.dropdownItemResumo} numberOfLines={1}>{a.resumo}</Text>
                        </Pressable>
                      ))}
                      {resultados.length > MAX_RESULTADOS_DROPDOWN && (
                        <Text style={styles.dropdownMais}>+{resultados.length - MAX_RESULTADOS_DROPDOWN} outro(s) resultado(s) — refine sua busca</Text>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          </View>

          <View style={styles.grid}>
            {CATEGORIAS_AJUDA.map((c) => {
              const count = ARTIGOS_AJUDA.filter((a) => a.categoriaId === c.id).length;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => abrirCategoria(c.id)}
                  accessibilityRole="button"
                  accessibilityLabel={c.titulo}
                  style={({ hovered, focused }: PressableWebState) => [styles.catCard, hovered && styles.catCardHover, focused && styles.focoVisivel]}
                >
                  <View style={styles.catIconWrap}>
                    <MaterialCommunityIcons name={c.icone as keyof typeof MaterialCommunityIcons.glyphMap} size={24} color={cores.accentLight} />
                  </View>
                  <Text style={styles.catTitulo}>{c.titulo}</Text>
                  <Text style={styles.catCount}>{count} artigo{count === 1 ? '' : 's'}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.suporteHome}>
            <View style={styles.suporteHomeHead}>
              <MaterialCommunityIcons name="lifebuoy" size={20} color={cores.accentLight} />
              <Text style={styles.suporteHomeTitulo}>Precisa falar com a gente?</Text>
            </View>
            <Text style={styles.suporteHomeSub}>Escolha o canal — sem precisar mandar dado sensível de cliente.</Text>
            {renderCanaisDeSuporte()}
          </View>
        </View>
      )}
    </LayoutDesktop>
  );
}

function Bloco({ bloco }: { bloco: AjudaBloco }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
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
        <MaterialCommunityIcons name="information-outline" size={16} color={cores.warning} />
        <Text style={styles.avisoText}>{bloco.conteudo}</Text>
      </View>
    );
  }
  if (typeof bloco.conteudo === 'string') {
    return <Text style={styles.paragrafo}>{bloco.conteudo}</Text>;
  }
  return null;
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  focoVisivel: {
    outlineWidth: 2,
    outlineColor: c.accent,
    outlineStyle: 'solid',
    outlineOffset: 2,
  } as any,

  // ── Hero de busca (home) ──────────────────────────────────────────────
  heroWrap: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  heroTitulo: {
    ...Typography.h1,
    color: c.onBackground,
    textAlign: 'center',
  },
  heroSub: {
    ...Typography.body,
    color: c.onSurfaceVariant,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  heroTecla: {
    ...Typography.caption,
    color: c.onSurfaceVariant,
    backgroundColor: c.surfaceVariant,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  heroBuscaBox: {
    width: '100%',
    maxWidth: 640,
    position: 'relative',
  } as any,
  heroBusca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.outline,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    height: 56,
    ...sombrasDe(c).sm,
  },
  heroBuscaFoco: {
    borderColor: c.accent,
  },
  heroBuscaInput: {
    ...Typography.body,
    flex: 1,
    fontSize: 16,
    color: c.onSurface,
    outlineStyle: 'none',
  } as any,
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: Spacing.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.xs,
    zIndex: 20,
    ...sombrasDe(c).md,
  } as any,
  dropdownItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dropdownItemHover: {
    backgroundColor: c.surfacePressed,
  },
  dropdownItemCategoria: {
    ...Typography.label,
    color: c.accentLight,
    textTransform: 'uppercase',
  },
  dropdownItemTitulo: {
    ...Typography.h4,
    fontSize: 14,
    color: c.onSurface,
    marginTop: 2,
  },
  dropdownItemResumo: {
    ...Typography.caption,
    color: c.onSurfaceVariant,
    marginTop: 2,
  },
  dropdownMais: {
    ...Typography.caption,
    color: c.onSurfaceMuted,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
  },
  dropdownVazio: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  dropdownVazioTexto: {
    ...Typography.bodySmall,
    color: c.onSurfaceVariant,
  },
  dropdownVazioLink: {
    ...Typography.bodySmall,
    color: c.accentLight,
    fontWeight: '700',
    marginTop: Spacing.xs,
  },

  // ── Grid de categorias ─────────────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  catCard: {
    width: 384,
    backgroundColor: c.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: c.outline,
    padding: Spacing.lg,
    gap: Spacing.xs,
    ...sombrasDe(c).sm,
  },
  catCardHover: {
    backgroundColor: c.surfacePressed,
    borderColor: c.strokeGlow,
  },
  catIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: comAlfa(c.accentLight, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  catTitulo: {
    ...Typography.h4,
    color: c.onSurface,
  },
  catCount: {
    ...Typography.caption,
    color: c.onSurfaceVariant,
  },

  // ── Suporte (home) ──────────────────────────────────────────────────────
  suporteHome: {
    backgroundColor: comAlfa(c.accent, 0.08),
    borderWidth: 1,
    borderColor: comAlfa(c.accentLight, 0.25),
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  suporteHomeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  suporteHomeTitulo: {
    ...Typography.h4,
    color: c.onSurface,
  },
  suporteHomeSub: {
    ...Typography.bodySmall,
    color: c.onSurfaceVariant,
    marginTop: 4,
    marginBottom: Spacing.md,
  },

  // ── Botões de canal + formulário (compartilhado home/artigo) ────────────
  suporteBtns: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  suporteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  suporteBtnHover: {
    backgroundColor: c.surfacePressed,
    borderColor: c.strokeGlow,
  },
  suporteBtnText: {
    ...Typography.bodySmall,
    fontWeight: '800',
    color: c.accentLight,
  },
  suporteBtnWhats: {
    backgroundColor: c.whatsapp,
    borderColor: c.whatsapp,
  },
  suporteBtnWhatsHover: {
    opacity: 0.9,
  },
  suporteBtnTextWhats: {
    ...Typography.bodySmall,
    fontWeight: '800',
    color: c.onPrimary,
  },

  formBox: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: c.outline,
    maxWidth: 460,
  },
  formLabel: {
    ...Typography.bodySmall,
    fontWeight: '700',
    color: c.onSurfaceVariant,
    marginBottom: Spacing.sm,
  },
  formChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  formChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: c.outline,
    backgroundColor: c.surface,
  },
  formChipHover: {
    borderColor: c.strokeGlow,
  },
  formChipAtivo: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  formChipText: {
    ...Typography.bodySmall,
    fontWeight: '700',
    color: c.onSurfaceVariant,
  },
  formChipTextAtivo: {
    color: c.onPrimary,
  },

  // ── Leitura: breadcrumb + duas colunas ──────────────────────────────────
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
    paddingVertical: 4,
  },
  breadcrumbText: {
    ...Typography.bodySmall,
    fontWeight: '700',
    color: c.accentLight,
  },
  leituraLinha: {
    flexDirection: 'row',
    gap: Spacing.xxl,
    alignItems: 'flex-start',
  },
  indiceColuna: {
    width: 260,
    flexShrink: 0,
    position: 'sticky',
    top: Spacing.xxl,
    gap: 2,
  } as any,
  indiceCategoria: {
    ...Typography.label,
    color: c.onSurfaceMuted,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  indiceItem: {
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  indiceItemHover: {
    backgroundColor: c.surfacePressed,
  },
  indiceItemAtivo: {
    backgroundColor: c.surfacePressed,
    borderLeftColor: c.accent,
  },
  indiceItemTexto: {
    ...Typography.bodySmall,
    color: c.onSurfaceVariant,
    lineHeight: 18,
  },
  indiceItemTextoAtivo: {
    color: c.onSurface,
    fontWeight: '700',
  },
  indiceTodasCategorias: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: c.outline,
    paddingHorizontal: Spacing.sm,
  },
  indiceTodasCategoriasTexto: {
    ...Typography.caption,
    color: c.onSurfaceVariant,
  },

  conteudoColuna: {
    flex: 1,
    maxWidth: 720,
  },
  artigoEyebrow: {
    ...Typography.label,
    color: c.accentLight,
    textTransform: 'uppercase',
  },
  artigoTitulo: {
    ...Typography.h2,
    color: c.onSurface,
    marginTop: 4,
  },
  artigoResumo: {
    ...Typography.body,
    fontSize: 15.5,
    color: c.onSurfaceVariant,
    lineHeight: 22,
    marginTop: Spacing.sm,
  },

  paragrafo: {
    ...Typography.body,
    fontSize: 15.5,
    color: c.onSurface,
    lineHeight: 24,
    marginTop: Spacing.lg,
  },

  passosBox: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  passoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  passoNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: comAlfa(c.primary, 0.16),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  passoNumText: {
    ...Typography.caption,
    fontWeight: '800',
    color: c.accentLight,
  },
  passoText: {
    flex: 1,
    ...Typography.body,
    fontSize: 15,
    color: c.onSurface,
    lineHeight: 22,
  },

  avisoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: comAlfa(c.warning, 0.10),
    borderWidth: 1,
    borderColor: comAlfa(c.warning, 0.28),
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  avisoText: {
    flex: 1,
    ...Typography.bodySmall,
    color: c.onSurfaceVariant,
    lineHeight: 19,
  },

  duvidaBox: {
    marginTop: Spacing.xxl,
    backgroundColor: comAlfa(c.accent, 0.08),
    borderWidth: 1,
    borderColor: comAlfa(c.accentLight, 0.25),
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  duvidaTitulo: {
    ...Typography.h4,
    color: c.onSurface,
  },
  duvidaSub: {
    ...Typography.bodySmall,
    color: c.onSurfaceVariant,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
});
