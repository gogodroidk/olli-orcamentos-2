import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Spacing, Typography, useCores, useEstilos, type Cores } from '../theme';
import { OlliSkeleton } from './OlliSkeleton';
import { montarHtmlOrcamentoCompleto } from '../utils/pdfGenerator';
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
 */
export function PdfPreviewModal({ visible, onClose, orcamento, empresa, depoimentos, removerMarca, construirHtml, chave, titulo }: Props) {
  const insets = useSafeAreaInsets();
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [html, setHtml] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.container, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{titulo ?? 'Prévia do orçamento'}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar prévia" hitSlop={10}>
            <MaterialCommunityIcons name="close" size={24} color={cores.onSurface} />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
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
          ) : Platform.OS === 'web' ? (
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
    </Modal>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.outline,
    },
    title: { ...Typography.h4, color: c.onSurface },
    // Área do documento: sempre branca — é o "papel" do PDF (mesmo contrato de
    // pdfGenerator.ts, que não lê o tema do app), não uma superfície temável.
    body: { flex: 1, backgroundColor: '#fff' },
    webview: { flex: 1, backgroundColor: '#fff' },
    loadingWrap: { flex: 1, padding: Spacing.xl, backgroundColor: c.background },
    centerMsg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.sm },
    erroText: { color: c.onSurfaceVariant, fontSize: 14, textAlign: 'center' },
  });
