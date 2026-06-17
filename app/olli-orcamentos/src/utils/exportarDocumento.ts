import { Platform } from 'react-native';

/* ─── Saída de documentos (HTML → PDF) multiplataforma ────────────────
 * Um único ponto de entrega para o PDF, funcionando no nativo E na web.
 *
 *  - NATIVO (ios/android): expo-print gera o PDF e expo-sharing abre a
 *    folha de compartilhamento. Os módulos nativos só são carregados
 *    (require) dentro do ramo nativo — nunca são avaliados na web, então
 *    o bundle web não quebra.
 *
 *  - WEB: abrimos o HTML num iframe oculto e chamamos
 *    `iframe.contentWindow.print()`. O usuário escolhe "Salvar como PDF"
 *    (ou imprime). Sem popups bloqueados, sem expo-print/file-system.
 */

const isWeb = Platform.OS === 'web';

export interface OpcoesCompartilhar {
  /** Título da folha de compartilhamento (nativo) / da janela de impressão (web). */
  dialogTitle?: string;
}

/** Remove caracteres inválidos para nome de arquivo. */
export function safeFileName(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'documento'
  );
}

/* ─── WEB ──────────────────────────────────────────────────────────── */

/**
 * Imprime o HTML via iframe oculto na web. Resolve depois de disparar o
 * diálogo de impressão. O iframe é removido em seguida (com folga para o
 * navegador abrir o diálogo, que em alguns browsers é síncrono).
 */
function imprimirHtmlWeb(html: string, opcoes?: OpcoesCompartilhar): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const doc: any = typeof document !== 'undefined' ? document : undefined;
      if (!doc || !doc.body) {
        reject(new Error('Impressão indisponível neste ambiente.'));
        return;
      }

      const iframe = doc.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';

      let done = false;
      const cleanup = () => {
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch {
          /* ignore */
        }
      };
      const finish = () => {
        if (done) return;
        done = true;
        // Remove o iframe um pouco depois — em alguns navegadores o print()
        // é assíncrono e remover cedo demais cancela o diálogo.
        setTimeout(cleanup, 1500);
        resolve();
      };

      const onLoad = () => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            cleanup();
            reject(new Error('Não foi possível preparar a impressão.'));
            return;
          }
          if (opcoes?.dialogTitle && iframe.contentDocument) {
            try {
              iframe.contentDocument.title = opcoes.dialogTitle;
            } catch {
              /* ignore */
            }
          }
          win.focus();
          win.print();
          finish();
        } catch (e) {
          cleanup();
          reject(e instanceof Error ? e : new Error('Falha ao imprimir.'));
        }
      };

      iframe.onload = onLoad;
      doc.body.appendChild(iframe);

      // Escreve o HTML no iframe. Usar srcdoc é mais robusto que document.write
      // e evita bloqueios; mantemos o onload como gatilho do print.
      const idoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (idoc) {
        idoc.open();
        idoc.write(html);
        idoc.close();
        // Se o conteúdo for síncrono e o onload não disparar (alguns browsers),
        // garantimos a impressão no próximo tick.
        if (idoc.readyState === 'complete') {
          setTimeout(() => {
            if (!done) onLoad();
          }, 50);
        }
      } else {
        iframe.setAttribute('srcdoc', html);
      }
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Falha ao gerar o documento.'));
    }
  });
}

/* ─── NATIVO ───────────────────────────────────────────────────────── */

async function exportarHtmlNativo(
  html: string,
  nomeArquivo: string,
  opcoes?: OpcoesCompartilhar,
): Promise<void> {
  // require dentro do ramo nativo: estes módulos NUNCA são avaliados na web.
  const Print = require('expo-print');
  const Sharing = require('expo-sharing');
  const FileSystem = require('expo-file-system/legacy');

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const fileName = nomeArquivo.toLowerCase().endsWith('.pdf') ? nomeArquivo : `${nomeArquivo}.pdf`;
  const dest = FileSystem.documentDirectory + fileName;
  await FileSystem.copyAsync({ from: uri, to: dest });
  await Sharing.shareAsync(dest, {
    mimeType: 'application/pdf',
    dialogTitle: opcoes?.dialogTitle ?? fileName,
  });
}

/* ─── API pública ──────────────────────────────────────────────────── */

/**
 * Entrega um HTML como PDF, escolhendo o caminho certo por plataforma.
 *  - Web: imprime via iframe oculto (usuário salva como PDF).
 *  - Nativo: expo-print + expo-sharing (comportamento original preservado).
 *
 * @param html         documento HTML completo (string pura, já montada).
 * @param nomeArquivo  nome base do arquivo (sem precisar da extensão .pdf).
 * @param opcoes       opções de compartilhamento (título do diálogo).
 */
export async function exportarHtmlComoPdf(
  html: string,
  nomeArquivo: string,
  opcoes?: OpcoesCompartilhar,
): Promise<void> {
  if (isWeb) {
    await imprimirHtmlWeb(html, opcoes);
    return;
  }
  await exportarHtmlNativo(html, nomeArquivo, opcoes);
}

/**
 * Abre o WhatsApp com uma mensagem pré-preenchida.
 *  - Web: `https://wa.me/<numero>?text=...` (abre no navegador / WhatsApp Web).
 *  - Nativo: esquema `whatsapp://` (mantém o comportamento original).
 */
export async function abrirWhatsApp(telefone: string, mensagem: string): Promise<void> {
  const numero = (telefone || '').replace(/\D/g, '');
  const comDDI = numero.startsWith('55') ? numero : `55${numero}`;
  const texto = encodeURIComponent(mensagem);

  if (isWeb) {
    const url = `https://wa.me/${comDDI}?text=${texto}`;
    const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
    if (g?.open) {
      g.open(url, '_blank');
    } else if (g?.location) {
      g.location.href = url;
    }
    return;
  }

  const { Linking } = require('react-native');
  const url = `whatsapp://send?phone=${comDDI}&text=${texto}`;
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return;
    }
  } catch {
    /* cai no fallback wa.me abaixo */
  }
  // Fallback nativo: wa.me também abre o app instalado.
  await Linking.openURL(`https://wa.me/${comDDI}?text=${texto}`);
}
