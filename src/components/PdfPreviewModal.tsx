import React, { useEffect, useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography } from '../theme';
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
  orcamento: Orcamento;
  empresa: Empresa | null;
  depoimentos: Depoimento[];
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
export function PdfPreviewModal({ visible, onClose, orcamento, empresa, depoimentos }: Props) {
  const insets = useSafeAreaInsets();
  const [html, setHtml] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

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
        const doc = await montarHtmlOrcamentoCompleto(orcamento, empresa ?? EMPRESA_VAZIA, depoimentos, orcamento.corMarca);
        if (!cancelado) setHtml(doc);
      } catch {
        if (!cancelado) setErro(true);
      }
    })();
    return () => { cancelado = true; };
  }, [visible, orcamento, empresa, depoimentos]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.container, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Prévia do orçamento</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar prévia" hitSlop={10}>
            <MaterialCommunityIcons name="close" size={24} color={Colors.onSurface} />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {erro ? (
            <View style={styles.centerMsg}>
              <MaterialCommunityIcons name="alert-circle-outline" size={32} color={Colors.onSurfaceVariant} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outline,
  },
  title: { ...Typography.h4, color: Colors.onSurface },
  body: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1, backgroundColor: '#fff' },
  loadingWrap: { flex: 1, padding: Spacing.xl, backgroundColor: Colors.background },
  centerMsg: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.sm },
  erroText: { color: Colors.onSurfaceVariant, fontSize: 14, textAlign: 'center' },
});
