import React, { useState } from 'react';
import { Linking, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, Typography, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { FolhaAcoes, ItemFolha } from '../orcamento/FolhaAcoes';
import { Aparecer } from '../motion/Aparecer';
import { PressableAnimado } from '../motion/PressableAnimado';
import { verbeteDaTela, type TelaComoFunciona } from '../../content/comoFunciona';
import { track, Eventos } from '../../services/analytics';

type IconeMCI = keyof typeof MaterialCommunityIcons.glyphMap;

interface PropsFolha {
  tela: TelaComoFunciona;
  visivel: boolean;
  aoFechar: () => void;
  /** Quem já está na Central de Ajuda abre o guia ali mesmo (sem empilhar outra Ajuda). */
  aoAbrirGuia?: (artigoId: string) => void;
}

/**
 * Folha "Como funciona" de uma tela: resumo em uma frase, passos com ícone (a
 * ilustração, em cascata) e, quando existir, o guia completo e o vídeo curto.
 *
 * Usa a mesma folha que sobe de baixo do detalhe do orçamento (`FolhaAcoes`):
 * mola suave, arrastar para baixo fecha, "Reduzir movimento" respeitado. Os links
 * são `ItemFolha`: a folha sai primeiro e só então a navegação roda.
 */
export function FolhaComoFunciona({ tela, visivel, aoFechar, aoAbrirGuia }: PropsFolha) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const nav = useNavigation<{ navigate: (rota: 'Ajuda', params: { artigoId: string; origem: string }) => void }>();
  const v = verbeteDaTela(tela);
  return (
    <FolhaAcoes visivel={visivel} titulo={`Como funciona: ${v.titulo}`} subtitulo={v.resumo} aoFechar={aoFechar}>
      <View style={styles.passos}>
        {v.passos.map((p, i) => (
          <Aparecer key={p.texto} indice={i}>
            <View style={styles.passo}>
              <View style={styles.numeroCaixa}>
                <MaterialCommunityIcons name={p.icone as IconeMCI} size={20} color={cores.accentLight} />
                <View style={styles.numero}><Text style={styles.numeroTexto}>{i + 1}</Text></View>
              </View>
              <Text style={styles.passoTexto}>{p.texto}</Text>
            </View>
          </Aparecer>
        ))}
      </View>
      {v.videoUrl ? (
        <View style={styles.extra}>
          <ItemFolha
            icon="play-circle-outline"
            label="Ver o vídeo curto"
            descricao="Abre no navegador"
            onPress={() => { void Linking.openURL(v.videoUrl as string).catch(() => undefined); }}
          />
        </View>
      ) : null}
      {v.artigoId ? (
        <View style={styles.extra}>
          <ItemFolha
            icon="book-open-variant"
            label="Ler o guia completo"
            descricao="Passo a passo na Central de Ajuda"
            onPress={() => {
              const artigoId = v.artigoId as string;
              if (aoAbrirGuia) aoAbrirGuia(artigoId);
              else nav.navigate('Ajuda', { artigoId, origem: `Como funciona: ${v.titulo}` });
            }}
          />
        </View>
      ) : null}
    </FolhaAcoes>
  );
}

interface PropsBotao {
  tela: TelaComoFunciona;
  /** Cor do ícone (no cabeçalho em gradiente, `gradientes.sobreHeader`). */
  cor?: string;
  style?: StyleProp<ViewStyle>;
}

/** O "?" do cabeçalho: abre a folha "Como funciona" da tela. */
export function BotaoComoFunciona({ tela, cor, style }: PropsBotao) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [aberta, setAberta] = useState(false);
  const titulo = verbeteDaTela(tela).titulo;
  return (
    <>
      <PressableAnimado
        onPress={() => { setAberta(true); track(Eventos.comoFuncionaAberto, { tela }); }}
        haptic="selection"
        hitSlop={10}
        style={[styles.botao, style]}
        accessibilityLabel={`Como funciona: ${titulo}`}
        accessibilityHint="Abre uma explicação curta desta tela"
      >
        <MaterialCommunityIcons name="help-circle-outline" size={22} color={cor ?? cores.onSurfaceVariant} />
      </PressableAnimado>
      <FolhaComoFunciona tela={tela} visivel={aberta} aoFechar={() => setAberta(false)} />
    </>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    botao: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    passos: { gap: Spacing.sm, paddingTop: Spacing.xs },
    passo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: Spacing.md,
      borderRadius: BorderRadius.lg,
      backgroundColor: c.surfacePressed,
    },
    numeroCaixa: {
      width: 42,
      height: 42,
      borderRadius: BorderRadius.chip,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: comAlfa(c.accentLight, 0.12),
    },
    numero: {
      position: 'absolute',
      right: -4,
      top: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.strokeGlow,
    },
    numeroTexto: { fontSize: 10.5, fontWeight: '800', color: c.accentLight },
    passoTexto: { ...Typography.body, flex: 1, color: c.onSurface, lineHeight: 20 },
    extra: { marginTop: Spacing.sm },
  });
