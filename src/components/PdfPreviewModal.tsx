import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius, Typography, useCores, useEstilos, sombrasDe, type Cores } from '../theme';
import { useEhDesktop } from '../hooks/useEhDesktop';
import { OlliPressable } from './OlliPressable';
import { OlliSkeleton } from './OlliSkeleton';
import { montarHtmlOrcamentoCompleto } from '../utils/pdfGenerator';
import { exportarHtmlComoPdf, safeFileName } from '../utils/exportarDocumento';
import { Orcamento, Empresa, Depoimento } from '../types';

// WebView é nativo-only (Android/iOS); a web usa <iframe srcDoc> via DOM direto
// (react-native-web deixa passar elementos HTML crus através de createElement).
// Importar condicionalmente evita que o bundle nativo puxe código de DOM inútil
// e que o bundle web precise do módulo nativo do WebView.
let WebView: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebView = require('react-native-webview').WebView;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Orçamento a pré-visualizar. Opcional quando `construirHtml` é passado. */
  orcamento?: Orcamento;
  empresa: Empresa | null;
  depoimentos?: Depoimento[];
  /**
   * Se `true`, monta a prévia SEM o rodapé/selo OLLI — igual ao PDF que o
   * cliente recebe quando o usuário é Pro/Empresa (recurso 'remove_olli_brand').
   * Padrão `false`: a prévia mostra o mesmo selo discreto do envio no grátis.
   * Threaded a partir do call site para a prévia ser IDÊNTICA ao que se envia.
   */
  removerMarca?: boolean;
  /**
   * Construtor de HTML alternativo (ex.: recibo). Se passado, ignora o caminho
   * do orçamento e usa o HTML que esta função devolver. Fica num ref para não
   * disparar rebuild a cada render — a reconstrução é atrelada a `chave`.
   */
  construirHtml?: () => Promise<string>;
  /** Muda para forçar reconstrução da prévia (ex.: id do modelo selecionado). */
  chave?: string | number;
  /** Título do cabeçalho. Padrão: "Prévia do orçamento". */
  titulo?: string;
  /**
   * Nome-base do arquivo ao exportar o PDF de verdade (sem ".pdf"). Default:
   * derivado do orçamento (`Orcamento-<cliente>-<numero>`) quando `orcamento`
   * está presente, senão de `titulo`, senão "documento".
   */
  nomeArquivo?: string;
}

/** Empresa mínima para a prévia funcionar mesmo sem "Meu Negócio" preenchido. */
const EMPRESA_VAZIA: Empresa = {
  id: 'preview',
  nome: 'Sua empresa',
  especialidade: '',
  slogan: '',
  cnpj: '',
  cpf: '',
  endereco: '',
  cidade: '',
  estado: '',
  telefone: '',
  whatsapp: '',
  site: '',
  email: '',
  chavePix: '',
  normas: '',
  nomePrestador: '',
};

/**
 * Largura de "papel" do documento em px CSS — a mesma medida de design do
 * `.sheet` em pdfGenerator.ts (794px ≈ A4 a 96dpi). O recibo (reciboPdf.ts) é
 * um pouco mais estreito (700+padding), mas por ter `max-width` + `margin:auto`
 * ele só centraliza com uma sobra branca discreta dentro desta moldura — não
 * quebra o layout. Serve de referência única para o zoom/fit de QUALQUER
 * documento pré-visualizado aqui, sem acoplar este componente a um modelo.
 */
const PAGE_W = 794;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.15;

function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/** Componente da web: um <iframe> cru para renderizar o HTML final do orçamento. */
function PreviewWeb({ html }: { html: string }) {
  return React.createElement('iframe', {
    srcDoc: html,
    style: { width: '100%', height: '100%', border: 0, backgroundColor: '#fff' },
    title: 'Prévia do orçamento',
  });
}

/**
 * Prévia real do PDF (mesmo HTML que vai para o compartilhamento), sem
 * thumbnails falsos: nativo usa WebView, web usa iframe srcDoc. Contrato F3.
 *
 * F3.1/F3.2 (pdf-preview): a prévia ganha uma MOLDURA de página (fundo cinza +
 * sombra de "folha" + zoom/ajustar-largura via `transform: scale`) e um atalho
 * no header que chama `exportarHtmlComoPdf` — o PDF de verdade, share sheet no
 * nativo / diálogo de impressão na web — reaproveitando o HTML já montado aqui
 * em vez de reconstruir o documento.
 */
export function PdfPreviewModal({ visible, onClose, orcamento, empresa, depoimentos, removerMarca, construirHtml, chave, titulo, nomeArquivo }: Props) {
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const ehDesktop = useEhDesktop();
  const styles = useEstilos(criarEstilos);
  const [html, setHtml] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erroExportar, setErroExportar] = useState(false);
  // Tamanho da área de prévia (moldura), medido por onLayout — base do zoom
  // "ajustar largura" e da altura disponível para a folha.
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });
  // `null` = zoom automático (segue "ajustar largura" a cada medição). Um
  // número explícito é o zoom manual do usuário (+/-), que passa a ignorar
  // remedições até o usuário tocar em "ajustar largura" de novo.
  const [zoomManual, setZoomManual] = useState<number | null>(null);

  // Ref para o construtor: usar a versão mais recente sem colocá-la nas deps do
  // efeito (uma função nova a cada render dispararia rebuild em loop).
  const construirRef = useRef(construirHtml);
  construirRef.current = construirHtml;

  useEffect(() => {
    if (!visible) {
      // Limpa ao fechar para a próxima abertura sempre remontar do zero
      // (evita mostrar a prévia antiga por um instante se o orçamento mudou).
      setHtml(null);
      setErro(false);
      setErroExportar(false);
      setExportando(false);
      setZoomManual(null);
      return;
    }
    let cancelado = false;
    setHtml(null);
    setErro(false);
    (async () => {
      try {
        const fn = construirRef.current;
        const doc = fn
          ? await fn()
          : orcamento
            ? await montarHtmlOrcamentoCompleto(orcamento, empresa ?? EMPRESA_VAZIA, depoimentos ?? [], orcamento.corMarca, { removerMarca })
            : '';
        if (!cancelado) setHtml(doc);
      } catch {
        if (!cancelado) setErro(true);
      }
    })();
    return () => { cancelado = true; };
  }, [visible, chave, orcamento, empresa, depoimentos, removerMarca]);

  const handleLayoutArea = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setAreaSize({ width, height });
  }, []);

  // Zoom "ajustar largura": a folha (PAGE_W fixo) encolhe/cresce para caber na
  // área medida menos o respiro da moldura. Some automaticamente quando o
  // usuário ainda não escolheu um zoom manual (+/-) — inclusive reagindo a
  // rotação de tela / redimensionar a janela no desktop.
  const fitZoom = areaSize.width > 0
    ? clampZoom((areaSize.width - Spacing.lg * 2) / PAGE_W)
    : 1;
  const zoom = zoomManual ?? fitZoom;
  const folhaHeight = areaSize.height > 0 ? Math.max(320, areaSize.height - Spacing.lg * 2) : 500;

  const nomeArquivoEfetivo = nomeArquivo
    ?? (orcamento ? `Orcamento-${safeFileName(orcamento.clienteNome)}-${orcamento.numero}` : safeFileName(titulo ?? 'documento'));
  const dialogTituloEfetivo = orcamento
    ? `Orçamento ${orcamento.numero} - ${orcamento.clienteNome}`
    : (titulo ?? 'Documento');

  const handleExportar = useCallback(async () => {
    if (!html || exportando) return;
    setErroExportar(false);
    setExportando(true);
    try {
      await exportarHtmlComoPdf(html, nomeArquivoEfetivo, { dialogTitle: dialogTituloEfetivo });
    } catch {
      setErroExportar(true);
    } finally {
      setExportando(false);
    }
  }, [html, exportando, nomeArquivoEfetivo, dialogTituloEfetivo]);

  const podeExportar = !!html && !erro;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.container, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
        <View style={[styles.shell, ehDesktop && styles.shellDesktop]}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{titulo ?? 'Prévia do orçamento'}</Text>
            <View style={styles.headerActions}>
              {podeExportar && (
                <OlliPressable
                  onPress={handleExportar}
                  disabled={exportando}
                  haptic="light"
                  accessibilityLabel="Abrir o PDF de verdade"
                  hitSlop={8}
                  style={styles.headerIconBtn}
                >
                  {exportando ? (
                    <ActivityIndicator size="small" color={cores.primary} />
                  ) : (
                    <MaterialCommunityIcons
                      name="file-pdf-box"
                      size={22}
                      color={erroExportar ? cores.danger : cores.primary}
                    />
                  )}
                </OlliPressable>
              )}
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar prévia" hitSlop={10}>
                <MaterialCommunityIcons name="close" size={24} color={cores.onSurface} />
              </TouchableOpacity>
            </View>
          </View>

          {erroExportar && (
            <View style={styles.exportErroBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={cores.danger} />
              <Text style={styles.exportErroText}>Não consegui abrir o PDF agora. Toque no ícone para tentar de novo.</Text>
            </View>
          )}

          {podeExportar && (
            <View style={styles.zoomBar}>
              <OlliPressable
                onPress={() => setZoomManual(clampZoom(zoom - ZOOM_STEP))}
                disabled={zoom <= ZOOM_MIN}
                accessibilityLabel="Diminuir zoom"
                hitSlop={8}
                style={styles.zoomBtn}
              >
                <MaterialCommunityIcons name="magnify-minus-outline" size={18} color={zoom <= ZOOM_MIN ? cores.onSurfaceMuted : cores.onSurfaceVariant} />
              </OlliPressable>
              <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
              <OlliPressable
                onPress={() => setZoomManual(clampZoom(zoom + ZOOM_STEP))}
                disabled={zoom >= ZOOM_MAX}
                accessibilityLabel="Aumentar zoom"
                hitSlop={8}
                style={styles.zoomBtn}
              >
                <MaterialCommunityIcons name="magnify-plus-outline" size={18} color={zoom >= ZOOM_MAX ? cores.onSurfaceMuted : cores.onSurfaceVariant} />
              </OlliPressable>
              <View style={styles.zoomDivider} />
              <OlliPressable
                onPress={() => setZoomManual(null)}
                disabled={zoomManual === null}
                accessibilityLabel="Ajustar à largura"
                hitSlop={8}
                style={styles.zoomBtn}
              >
                <MaterialCommunityIcons name="fit-to-page-outline" size={18} color={zoomManual === null ? cores.onSurfaceMuted : cores.onSurfaceVariant} />
              </OlliPressable>
            </View>
          )}

          <View style={styles.previewArea} onLayout={handleLayoutArea}>
            {erro ? (
              <View style={styles.centerMsg}>
                <MaterialCommunityIcons name="alert-circle-outline" size={32} color={cores.onSurfaceVariant} />
                <Text style={styles.erroText}>Não consegui montar a prévia agora.</Text>
              </View>
            ) : !html ? (
              <View style={styles.loadingWrap}>
                <OlliSkeleton height={28} style={{ marginBottom: Spacing.md }} />
                <OlliSkeleton.Lines count={3} />
                <OlliSkeleton height={180} style={{ marginTop: Spacing.lg }} radius={16} />
              </View>
            ) : (
              <View style={styles.moldura}>
                <View style={[styles.folhaSombra, { width: PAGE_W, height: folhaHeight, transform: [{ scale: zoom }] }]}>
                  <View style={styles.folhaClip}>
                    {Platform.OS === 'web' ? (
                      <PreviewWeb html={html} />
                    ) : (
                      WebView && (
                        <WebView
                          originWhitelist={['*']}
                          source={{ html }}
                          style={styles.webview}
                        />
                      )
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Frame do preview no desktop: coluna centralizada, no espírito do CentroDesktop
 *  (ver src/components/web/CentroDesktop.tsx) — mas mais estreita (~900px) porque
 *  aqui é um documento único a ler, não um formulário/dashboard. */
const SHELL_DESKTOP_MAX = 900;

const criarEstilos = (c: Cores) => {
  const sombras = sombrasDe(c);
  return StyleSheet.create({
    // Fundo do modal inteiro vira o "backdrop" cinza da moldura — a folha
    // branca flutua por cima dele (mesma leitura de um print-preview comum).
    container: { flex: 1, backgroundColor: c.surfaceVariant, alignItems: 'center' },
    shell: { flex: 1, width: '100%' },
    shellDesktop: { maxWidth: SHELL_DESKTOP_MAX, alignSelf: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.outline,
    },
    title: { ...Typography.h4, color: c.onSurface, flex: 1, minWidth: 0 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
    headerIconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    exportErroBanner: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
      backgroundColor: c.dangerLight, paddingHorizontal: Spacing.base, paddingVertical: Spacing.xs,
      borderBottomWidth: 1, borderBottomColor: c.outline,
    },
    exportErroText: { ...Typography.caption, color: c.danger, flex: 1 },
    zoomBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
      paddingVertical: Spacing.xs,
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.outline,
    },
    zoomBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm },
    zoomLabel: { ...Typography.caption, color: c.onSurfaceVariant, minWidth: 38, textAlign: 'center' },
    zoomDivider: { width: 1, height: 18, backgroundColor: c.outline, marginHorizontal: Spacing.xs },
    previewArea: { flex: 1 },
    // A moldura (backdrop cinza, herdado de `container`) só dá o respiro em
    // volta da folha — ela própria não tem cor: é o cinza do container que
    // aparece atrás da folha branca, exatamente como um print-preview comum.
    moldura: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    // A folha é SEMPRE branca — é o "papel" do PDF (mesmo contrato de
    // pdfGenerator.ts, que não lê o tema do app), não uma superfície temável.
    // Sombra e recorte ficam em views separadas de propósito: `overflow:hidden`
    // no MESMO view da elevação (Android) apaga a sombra — a "sombra de folha"
    // fica no wrapper, o `overflow:hidden` (pra arredondar o WebView/iframe)
    // na view de dentro.
    folhaSombra: { backgroundColor: '#fff', borderRadius: BorderRadius.sm, ...sombras.md },
    folhaClip: { flex: 1, overflow: 'hidden', borderRadius: BorderRadius.sm },
    webview: { flex: 1, backgroundColor: '#fff' },
    loadingWrap: { flex: 1, padding: Spacing.xl },
    centerMsg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.sm },
    erroText: { color: c.onSurfaceVariant, fontSize: 14, textAlign: 'center' },
  });
};
