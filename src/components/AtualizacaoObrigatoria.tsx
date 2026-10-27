import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { ANDROID_PACKAGE, APP_VERSION_CODE, DIAGNOSTICO_URL } from '../config';
import { consultarVersaoMinima, linksPlay, type DecisaoVersao } from '../services/versaoMinima';
import { useTema } from '../theme/TemaProvider';

/**
 * Tela que cobre o app quando o build Android está abaixo da versão mínima do servidor (D-1326). Só aparece com
 * `atualizar` confirmado; `desconhecido` (rede, servidor) não cobre nada. Reconsulta ao voltar para o app, então
 * quem atualiza e volta não fica preso.
 */
export function AtualizacaoObrigatoria() {
  const { cores } = useTema();
  const [decisao, setDecisao] = useState<DecisaoVersao>('desconhecido');

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let ativo = true;
    const consultar = () => {
      void consultarVersaoMinima(DIAGNOSTICO_URL, APP_VERSION_CODE).then((d) => {
        if (ativo) setDecisao(d);
      });
    };
    consultar();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') consultar();
    });
    return () => {
      ativo = false;
      sub.remove();
    };
  }, []);

  if (decisao !== 'atualizar' || !ANDROID_PACKAGE) return null;

  const abrirPlay = async () => {
    const { loja, web } = linksPlay(ANDROID_PACKAGE);
    try {
      await Linking.openURL(loja);
    } catch {
      await Linking.openURL(web).catch(() => {});
    }
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.fundo, { backgroundColor: cores.background }]}
      accessibilityViewIsModal
    >
      <Text style={[styles.titulo, { color: cores.onBackground }]} accessibilityRole="header">
        Atualize o OLLI
      </Text>
      <Text style={[styles.texto, { color: cores.onSurfaceVariant }]}>
        Esta versão do app saiu de uso. Atualize pela Play Store para continuar. Seus orçamentos, clientes e
        recibos continuam salvos.
      </Text>
      <Button mode="contained" onPress={abrirPlay} contentStyle={styles.botao}>
        Atualizar na Play Store
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  fundo: { justifyContent: 'center', padding: 24, gap: 16, zIndex: 1000, elevation: 1000 },
  titulo: { fontSize: 24, fontWeight: '700' },
  texto: { fontSize: 16, lineHeight: 24 },
  botao: { minHeight: 48 },
});
