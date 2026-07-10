import { Platform } from 'react-native';
import { enviarFeedback } from './feedback';

/**
 * Captura GLOBAL de erros de JS e grava na caixa (tipo 'erro'), para o dono ver no
 * painel /admin o que esta quebrando de verdade nos aparelhos. Best-effort e
 * defensivo: NUNCA pode derrubar o app (todo caminho e try/catch), preserva o
 * handler original (a tela vermelha do dev continua), deduplica erros iguais e
 * limita por sessao para nao inundar a caixa. So o essencial vai: mensagem, topo
 * do stack, tela atual — nada de dado de cliente.
 */
let instalado = false;
let ultimaChave = '';
let enviadosNaSessao = 0;
const MAX_POR_SESSAO = 8;

export function instalarCapturaDeErro(telaAtual?: () => string | undefined): void {
  if (instalado) return;
  instalado = true;

  const reportar = (mensagem: string, stack?: string) => {
    try {
      if (!mensagem || enviadosNaSessao >= MAX_POR_SESSAO) return;
      const chave = (mensagem + '|' + (stack || '')).slice(0, 240);
      if (chave === ultimaChave) return; // nao repete o mesmo erro em sequencia
      ultimaChave = chave;
      enviadosNaSessao += 1;
      let tela: string | undefined;
      try { tela = telaAtual?.(); } catch { tela = undefined; }
      enviarFeedback('erro', mensagem.slice(0, 1000), {
        tela,
        stack: (stack || '').split('\n').slice(0, 5).join('\n'),
      }).catch(() => {});
    } catch {
      // o reporter nunca pode lancar
    }
  };

  // Hermes / native: encadeia o handler global preservando o anterior.
  try {
    const g = globalThis as unknown as {
      ErrorUtils?: { getGlobalHandler?: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void };
    };
    const eu = g.ErrorUtils;
    if (eu?.getGlobalHandler && eu?.setGlobalHandler) {
      const anterior = eu.getGlobalHandler();
      eu.setGlobalHandler((e: unknown, fatal?: boolean) => {
        const err = e as { message?: string; stack?: string } | undefined;
        reportar(String(err?.message ?? e), err?.stack);
        try { anterior?.(e, fatal); } catch { /* mantem o app vivo mesmo se o anterior falhar */ }
      });
    }
  } catch { /* sem ErrorUtils nesta plataforma */ }

  // Web (react-native-web): erros nao capturados + promises rejeitadas.
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener?.('error', (ev: unknown) => {
        const e = ev as { message?: string; error?: { message?: string; stack?: string } };
        reportar(String(e?.message ?? e?.error?.message ?? ''), e?.error?.stack);
      });
      window.addEventListener?.('unhandledrejection', (ev: unknown) => {
        const e = ev as { reason?: { message?: string; stack?: string } };
        reportar('Promise rejeitada: ' + String(e?.reason?.message ?? e?.reason ?? ''), e?.reason?.stack);
      });
    }
  } catch { /* ambiente sem window */ }
}
