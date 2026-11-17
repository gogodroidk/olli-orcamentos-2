import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  ErroCaptcha,
  TURNSTILE_BASE_URL,
  TURNSTILE_SITEKEY,
  captchaAtivo,
  htmlTurnstile,
  lerMensagemCaptcha,
  registrarProvedorCaptcha,
} from '../../services/captcha';

type Pedido = { id: number; ok: (t: string) => void; falha: (e: Error) => void };

/**
 * Provedor do Turnstile no app nativo. Montado uma vez na raiz: fica invisível e,
 * a cada `obterTokenCaptcha()`, abre um WebView com o widget em modo
 * `interaction-only`. Só aparece na tela se a Cloudflare pedir interação.
 * Na web não renderiza nada (o provedor de lá é o script direto, em captcha.ts).
 */
export function CaptchaHost() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [interativo, setInterativo] = useState(false);
  const pedidoRef = useRef<Pedido | null>(null);
  const contador = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web' || !captchaAtivo()) return;
    registrarProvedorCaptcha(
      () =>
        new Promise<string>((ok, falha) => {
          pedidoRef.current?.falha(new ErroCaptcha());
          contador.current += 1;
          const novo = { id: contador.current, ok, falha };
          pedidoRef.current = novo;
          setInterativo(false);
          setPedido(novo);
        }),
    );
    return () => registrarProvedorCaptcha(null);
  }, []);

  if (Platform.OS === 'web' || !pedido) return null;

  const encerrar = (fn: (p: Pedido) => void) => {
    const atual = pedidoRef.current;
    if (!atual || atual.id !== pedido.id) return;
    pedidoRef.current = null;
    setPedido(null);
    setInterativo(false);
    fn(atual);
  };

  const aoReceber = (ev: WebViewMessageEvent) => {
    const m = lerMensagemCaptcha(ev.nativeEvent.data);
    if (!m) return;
    if (m.tipo === 'token') encerrar((p) => p.ok(m.token));
    else if (m.tipo === 'erro') encerrar((p) => p.falha(new ErroCaptcha()));
    else setInterativo(m.tipo === 'interativo');
  };

  return (
    <View style={interativo ? styles.fundo : styles.escondido} pointerEvents={interativo ? 'auto' : 'none'}>
      <View style={interativo ? styles.caixa : styles.minusculo}>
        <WebView
          key={pedido.id}
          originWhitelist={['https://*']}
          source={{ html: htmlTurnstile(TURNSTILE_SITEKEY), baseUrl: TURNSTILE_BASE_URL }}
          onMessage={aoReceber}
          onError={() => encerrar((p) => p.falha(new ErroCaptcha()))}
          javaScriptEnabled
          style={styles.web}
          backgroundColor="transparent"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  escondido: { position: 'absolute', width: 1, height: 1, opacity: 0.01, bottom: 0, right: 0 },
  minusculo: { width: 1, height: 1 },
  fundo: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  caixa: { width: 320, height: 90, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
