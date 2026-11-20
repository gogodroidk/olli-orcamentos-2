import { Platform } from 'react-native';
import { linkApiWhatsApp, linkWaMe, numeroWhatsAppBR } from './telefoneWhatsapp';
import { comTempoLimite, MENSAGEM_PDF_DEMOROU, TEMPO_LIMITE_PDF_MS } from './tempoLimite';

/** A regra única do número de WhatsApp, à mão de quem já importa daqui (o shim web espelha). */
export { linkApiWhatsApp, linkWaMe, numeroWhatsAppBR } from './telefoneWhatsapp';

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
function imprimirHtmlWeb(html: string, opcoes?: OpcoesCompartilhar): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve, reject) => {
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
      let safetyTimer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (safetyTimer !== undefined) {
          clearTimeout(safetyTimer);
          safetyTimer = undefined;
        }
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
        if (safetyTimer !== undefined) {
          clearTimeout(safetyTimer);
          safetyTimer = undefined;
        }
        setTimeout(cleanup, 1500);
        resolve(undefined);
      };

      // Rede de segurança: se o onload do iframe NUNCA disparar (e o conteúdo
      // não estava 'complete' no instante do check), o iframe ficaria órfão e o
      // "Gerando…" travaria pra sempre. Após ~10s, limpamos e resolvemos mesmo
      // assim — o iframe SEMPRE sai do DOM e a Promise SEMPRE resolve.
      safetyTimer = setTimeout(() => {
        safetyTimer = undefined;
        if (done) return;
        done = true;
        cleanup();
        resolve(undefined);
      }, 10000);

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
): Promise<string> {
  // require dentro do ramo nativo: estes módulos NUNCA são avaliados na web.
  const Print = require('expo-print');
  const Sharing = require('expo-sharing');
  const FileSystem = require('expo-file-system/legacy');

  // Teto de 20 s: o `printToFileAsync` só resolve quando o WebView do sistema termina de carregar e
  // imprimir. Se o WebView trava (visto no Galaxy S20 FE com WebView Beta, 20/11/2026), a Promise
  // nunca resolve nem rejeita e o botão gira para sempre. Com o teto, vira um erro legível.
  const { uri } = await comTempoLimite<{ uri: string }>(
    Print.printToFileAsync({ html, base64: false }),
    TEMPO_LIMITE_PDF_MS,
    'gerar-pdf',
    MENSAGEM_PDF_DEMOROU,
  );
  const fileName = nomeArquivo.toLowerCase().endsWith('.pdf') ? nomeArquivo : `${nomeArquivo}.pdf`;
  const dest = FileSystem.documentDirectory + fileName;
  await FileSystem.copyAsync({ from: uri, to: dest });

  // Nem todo dispositivo tem a folha de compartilhamento disponível (emuladores
  // sem apps configurados, builds restritos corporativos). Sem essa checagem,
  // shareAsync rejeita e o chamador mostra "não foi possível gerar o PDF" mesmo
  // o arquivo já existindo salvo em documentDirectory — mensagem enganosa.
  const disponivel = await Sharing.isAvailableAsync();
  if (!disponivel) {
    throw new Error(
      `Compartilhamento não disponível neste dispositivo. O PDF foi salvo em: ${dest}`,
    );
  }

  await Sharing.shareAsync(dest, {
    mimeType: 'application/pdf',
    dialogTitle: opcoes?.dialogTitle ?? fileName,
  });
  return dest;
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
): Promise<string | undefined> {
  if (isWeb) {
    return imprimirHtmlWeb(html, opcoes);
  }
  return exportarHtmlNativo(html, nomeArquivo, opcoes);
}

/**
 * Abre o WhatsApp com uma mensagem pré-preenchida.
 *
 * O número passa SEMPRE por `numeroWhatsAppBR` (regra única, `telefoneWhatsapp.ts`):
 * DDD 55 correto, "0 + DDD" e "+55" aceitos. Sem número válido (vazio, curto, não
 * brasileiro), abre o WhatsApp no SELETOR DE CONTATO com a mensagem pronta
 * (`wa.me/?text=`) — nunca `wa.me/55` nem um chute de número.
 *  - Web: `https://wa.me/...` numa aba nova (WhatsApp Web ou o app instalado).
 *  - Android: `https://api.whatsapp.com/send` direto, SEM `canOpenURL`. No Android 11+
 *    o `canOpenURL('whatsapp://...')` devolve `false` sem o pacote no `<queries>`, e o
 *    app caía sempre no navegador; o link https é o App Link do próprio WhatsApp.
 *  - iOS: esquema `whatsapp://` quando o sistema confirma; senão, `wa.me` (link universal).
 * Lança se o sistema não conseguir abrir nada — quem chama mostra o erro.
 */
export async function abrirWhatsApp(telefone: string | null | undefined, mensagem: string): Promise<void> {
  const numero = numeroWhatsAppBR(telefone);

  if (isWeb) {
    const url = linkWaMe(numero, mensagem);
    const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
    if (g?.open) {
      g.open(url, '_blank');
    } else if (g?.location) {
      g.location.href = url;
    }
    return;
  }

  const { Linking } = require('react-native');
  if (Platform.OS === 'android') {
    await Linking.openURL(linkApiWhatsApp(numero, mensagem));
    return;
  }

  if (numero) {
    const url = `whatsapp://send?phone=${numero}&text=${encodeURIComponent(mensagem ?? '')}`;
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      /* cai no wa.me abaixo */
    }
  }
  // wa.me também abre o app instalado (link universal); sem número, abre o seletor.
  await Linking.openURL(linkWaMe(numero, mensagem));
}
