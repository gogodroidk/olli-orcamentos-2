import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, Spacing, sombrasDe, useEstilos, type Cores } from '../../theme';
import { Aparecer } from '../motion';
import { LADO_ICONE_AJUSTE } from './LinhaAjuste';

interface Props {
  /** Título da seção (em caixa alta discreta, como nos Ajustes do sistema). */
  titulo?: string;
  /** Algo entre o título e o cartão (ex.: aviso de notificação bloqueada). */
  aviso?: React.ReactNode;
  /** Texto pequeno embaixo do cartão, explicando a seção. */
  rodape?: React.ReactNode;
  /** Conteúdo que já traz o próprio cartão (ex.: SeletorTema): sem moldura extra. */
  semCartao?: boolean;
  /** Posição na tela: escalona a entrada. */
  indice?: number;
  children?: React.ReactNode;
}

/**
 * GRUPO DE AJUSTES — título + cartão com as linhas separadas por um fio que
 * começa depois do ícone (o separador "recuado" dos Ajustes do iOS).
 *
 * Grupo sem nenhuma linha visível não desenha NADA (nem o título): é assim que
 * a busca esconde seções inteiras sem a tela precisar repetir a condição.
 */
export function GrupoAjustes({ titulo, aviso, rodape, semCartao = false, indice = 0, children }: Props) {
  const styles = useEstilos(criarEstilos);
  const filhos = React.Children.toArray(children);
  if (filhos.length === 0) return null;

  return (
    <Aparecer indice={indice}>
      {titulo ? <Text style={styles.titulo} accessibilityRole="header">{titulo}</Text> : null}
      {aviso}
      {semCartao ? (
        <View style={styles.semCartao}>{filhos}</View>
      ) : (
        <View style={styles.cartao}>
          {filhos.map((filho, i) => (
            <React.Fragment key={React.isValidElement(filho) && filho.key != null ? String(filho.key) : i}>
              {i > 0 ? <View style={styles.separador} /> : null}
              {filho}
            </React.Fragment>
          ))}
        </View>
      )}
      {rodape ? <Text style={styles.rodape}>{rodape}</Text> : null}
    </Aparecer>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    titulo: {
      fontSize: 12.5,
      fontWeight: '800',
      color: c.onSurfaceMuted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      paddingHorizontal: Spacing.base + Spacing.xs,
      marginTop: Spacing.xl,
      marginBottom: Spacing.sm,
    },
    cartao: {
      backgroundColor: c.surfaceGlass,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: c.outlineDark,
      marginHorizontal: Spacing.base,
      paddingHorizontal: Spacing.base,
      ...sombrasDe(c).sm,
    },
    semCartao: { marginHorizontal: Spacing.base },
    separador: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.outline,
      marginLeft: LADO_ICONE_AJUSTE + Spacing.md,
    },
    rodape: {
      fontSize: 12,
      color: c.onSurfaceMuted,
      lineHeight: 17,
      paddingHorizontal: Spacing.base + Spacing.xs,
      marginTop: Spacing.sm,
    },
  });
