import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import * as Application from 'expo-application';
import { ANDROID_PACKAGE, DIAGNOSTICO_URL } from '../config';
import { codigoBuildNativo, consultarVersaoMinima, linksPlay, type DecisaoVersao } from '../services/versaoMinima';
import { useTema } from '../theme/TemaProvider';

/**
 * Decisão da versão mínima (D-1326) para o build Android INSTALADO. Só vira `atualizar` com número confirmado dos dois
 * lados; rede, servidor ou build sem número = `desconhecido`, que não tranca nada. Reconsulta ao voltar para o app,
 * então quem atualiza e volta não fica preso.
 */
export function useVersaoMinima(): DecisaoVersao {
  const [decisao, setDecisao] = useState<DecisaoVersao>('desconhecido');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const codigo = codigoBuildNativo(Application.nativeBuildVersion);
    let ativo = true;
    const consultar = () => {
      void consultarVersaoMinima(DIAGNOSTICO_URL, codigo).then((d) => {
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
  return decisao;
}

/**
 * Tela "Atualize o OLLI". A raiz a desenha NO LUGAR do navegador (não por cima): assim o TalkBack não lê as telas de
 * baixo e nenhum Modal aberto depois fica por cima dela.
 */
export function AtualizacaoObrigatoria() {
  const { cores } = useTema();

  const abrirPlay = async () => {
    if (!ANDROID_PACKAGE) return;
    const { loja, web } = linksPlay(ANDROID_PACKAGE);
    try {
      await Linking.openURL(loja);
    } catch {
      await Linking.openURL(web).catch(() => {});
    }
  };

  return (
    <View style={[styles.fundo, { backgroundColor: cores.background }]}>
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
  fundo: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  titulo: { fontSize: 24, fontWeight: '700' },
  texto: { fontSize: 16, lineHeight: 24 },
  botao: { minHeight: 48 },
});
