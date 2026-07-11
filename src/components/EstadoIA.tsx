import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BorderRadius, Spacing, comAlfa, useCores, useEstilos, type Cores } from '../theme';
import { Motion, useReducedMotion } from '../theme/motion';
import { OlliMascot } from './OlliMascot';
import { OlliButton } from './OlliButton';
import { mapearErroIA, type TipoErroIA } from '../services/erroIA';

interface Props {
  /** carregando = a OLLI está pensando; erro = falha (rede/auth/cota/…); vazio = nada pra mostrar ainda. */
  variante: 'carregando' | 'erro' | 'vazio';
  /** Só usado quando `variante === 'erro'` — deriva título/mensagem/ação padrão da taxonomia única. */
  tipoErro?: TipoErroIA;
  /** Sobrescreve (ou define, fora de 'erro') o título. */
  titulo?: string;
  /** Sobrescreve (ou define, fora de 'erro') a mensagem. */
  mensagem?: string;
  /** Sobrescreve o rótulo do botão de ação principal. */
  acaoLabel?: string;
  onAcao?: () => void;
  /** Botão secundário opcional (ex.: "Cancelar" durante o carregamento). */
  acaoSecundariaLabel?: string;
  onAcaoSecundaria?: () => void;
  tamanho?: number;
  onDark?: boolean;
  /** Conteúdo extra abaixo da mensagem (skeleton, links, etc.). */
  children?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Estado único de IA — reusado pelas 3 telas que usam OLLI Técnica (diagnóstico,
 * chat, códigos de erro) pra parar de reimplementar a mesma taxonomia de falha
 * com visuais divergentes. Sempre com a OLLI (OlliMascot) na tela — a IA erra
 * como "gente", não como caixa de alerta genérica. Motion só opacity, respeita
 * "reduzir movimento".
 */
export function EstadoIA({
  variante, tipoErro, titulo, mensagem, acaoLabel, onAcao,
  acaoSecundariaLabel, onAcaoSecundaria, tamanho, onDark, children, style,
}: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const opacidade = useRef(new Animated.Value(0)).current;
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    if (reduzirMovimento) {
      opacidade.setValue(1);
      return;
    }
    opacidade.setValue(0);
    Animated.timing(opacidade, {
      toValue: 1,
      duration: Motion.dur.base,
      easing: Motion.easing.standard,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduzirMovimento, variante, tipoErro, titulo, mensagem]);

  const mapeado = variante === 'erro' ? mapearErroIA(tipoErro ?? 'desconhecido') : null;
  const tituloFinal = titulo ?? mapeado?.titulo ?? '';
  const mensagemFinal = mensagem ?? mapeado?.mensagem ?? '';
  const acaoFinal = acaoLabel ?? mapeado?.acao ?? 'Tentar de novo';

  const tintado = variante === 'erro';
  const corTint = tipoErro === 'cota' ? cores.plan : cores.warning;

  return (
    <Animated.View
      style={[
        styles.container,
        tintado && { backgroundColor: comAlfa(corTint, 0.08), borderColor: comAlfa(corTint, 0.28) },
        { opacity: opacidade },
        style,
      ]}
    >
      <OlliMascot size={tamanho ?? (variante === 'carregando' ? 44 : 40)} onDark={onDark} float={variante === 'carregando'} />
      {!!tituloFinal && <Text style={styles.titulo}>{tituloFinal}</Text>}
      {!!mensagemFinal && <Text style={styles.mensagem}>{mensagemFinal}</Text>}
      {children}
      {(onAcao || onAcaoSecundaria) && (
        <View style={styles.acoes}>
          {onAcao && (
            <OlliButton
              label={acaoFinal}
              variant={tipoErro === 'cota' ? 'gradient' : 'outline'}
              size="sm"
              onPress={onAcao}
              style={styles.btnAcao}
            />
          )}
          {onAcaoSecundaria && (
            <OlliButton
              label={acaoSecundariaLabel ?? 'Cancelar'}
              variant="ghost"
              size="sm"
              onPress={onAcaoSecundaria}
              style={styles.btnAcao}
            />
          )}
        </View>
      )}
    </Animated.View>
  );
}

const criarEstilos = (c: Cores) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    titulo: { fontSize: 15, fontWeight: '800', color: c.onSurface, textAlign: 'center', marginTop: 12 },
    mensagem: { fontSize: 13, color: c.onSurfaceVariant, textAlign: 'center', lineHeight: 19, marginTop: 6 },
    acoes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 14 },
    btnAcao: { marginTop: 0 },
  });
