import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../../theme';
import { PressableAnimado } from '../motion';

type NomeIcone = keyof typeof MaterialCommunityIcons.glyphMap;

/** Tamanho do quadradinho do ícone. O separador do grupo começa depois dele. */
export const LADO_ICONE_AJUSTE = 32;

interface Props {
  icone: NomeIcone;
  /** Cor do ícone; o fundo do quadradinho é a mesma cor, translúcida. */
  cor: string;
  titulo: string;
  descricao?: string;
  /** Linha tocável: encolhe ao toque e mostra a seta. Sem isto é linha de leitura. */
  onPress?: () => void;
  /** Controle à direita (Switch, botão próprio). Substitui a seta. */
  direita?: React.ReactNode;
  /** Seta da direita para linha tocável: navega (chevron) ou sai do app (externo). */
  seta?: 'navegar' | 'externo';
  /** Ação que apaga/encerra algo: título em vermelho. */
  destrutivo?: boolean;
  /** Ação em andamento: troca a seta por um indicador e bloqueia novo toque. */
  carregando?: boolean;
  desabilitado?: boolean;
  accessibilityLabel?: string;
}

/**
 * LINHA DE AJUSTE — o tijolo da tela Conta "estilo Ajustes": quadradinho de
 * ícone colorido (sempre do mesmo tamanho e raio), título, descrição curta e,
 * à direita, a seta, um Switch ou um indicador de carregando.
 *
 * Tocável vira `PressableAnimado` (encolhe na UI thread, respeita "Reduzir
 * movimento") com háptico de seleção. Linha só de leitura é um `View` — nada de
 * área tocável que não faz nada.
 */
export function LinhaAjuste({
  icone, cor, titulo, descricao, onPress, direita, seta = 'navegar',
  destrutivo = false, carregando = false, desabilitado = false, accessibilityLabel,
}: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const corTitulo = destrutivo ? cores.danger : cores.onSurface;

  const conteudo = (
    <>
      <View style={[styles.icone, { backgroundColor: comAlfa(cor, 0.16) }]}>
        <MaterialCommunityIcons name={icone} size={19} color={cor} />
      </View>
      <View style={styles.textos}>
        <Text style={[styles.titulo, { color: corTitulo }]}>{titulo}</Text>
        {descricao ? <Text style={styles.descricao}>{descricao}</Text> : null}
      </View>
      {carregando ? (
        <ActivityIndicator size="small" color={cores.accentLight} style={styles.direita} />
      ) : direita !== undefined ? (
        <View style={styles.direita}>{direita}</View>
      ) : onPress ? (
        <MaterialCommunityIcons
          name={seta === 'externo' ? 'open-in-new' : 'chevron-right'}
          size={seta === 'externo' ? 17 : 21}
          color={cores.onSurfaceMuted}
          style={styles.direita}
        />
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.linha}>{conteudo}</View>;

  return (
    <PressableAnimado
      style={styles.linha}
      onPress={onPress}
      // Destrutiva abre uma folha que já vibra "aviso": dois toques seguidos seriam ruído.
      haptic={destrutivo ? false : 'selection'}
      escala={0.985}
      disabled={desabilitado || carregando}
      accessibilityLabel={accessibilityLabel ?? titulo}
      // O rótulo cobre os filhos: sem a dica, o leitor de tela nunca lê a descrição.
      accessibilityHint={descricao}
      accessibilityState={{ busy: carregando }}
    >
      {conteudo}
    </PressableAnimado>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingVertical: Spacing.md,
      gap: Spacing.md,
    },
    icone: {
      width: LADO_ICONE_AJUSTE,
      height: LADO_ICONE_AJUSTE,
      borderRadius: BorderRadius.fio * 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textos: { flex: 1 },
    titulo: { fontSize: 15, fontWeight: '700', color: c.onSurface },
    descricao: { fontSize: 12.5, color: c.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
    direita: { marginLeft: Spacing.xs },
  });
