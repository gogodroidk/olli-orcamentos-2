import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { vibrar } from '../../utils/haptico';
import { BorderRadius, Spacing, useCores, useEstilos, type Cores } from '../../theme';
import { Fonts } from '../../theme/fonts';
import { Motion, useReducedMotion } from '../../theme/motion';
import {
  casasDoCodigo,
  normalizarCodigo,
  TAMANHO_CODIGO,
  type EstadoCampoCodigo,
} from '../../services/acessoCodigo';

interface Props {
  valor: string;
  onMudar: (codigo: string) => void;
  estado: EstadoCampoCodigo;
  /** Texto do erro (já em pt-BR). Anunciado ao leitor de tela. */
  erro?: string | null;
  autoFocus?: boolean;
}

/**
 * Campo do código de 6 dígitos do e-mail (login por código e "esqueci a senha").
 *
 * Um ÚNICO TextInput invisível por cima de 6 casas desenhadas: o teclado numérico,
 * o autopreenchimento do sistema (iOS "Do Mail", Android `sms-otp`/`one-time-code`)
 * e o colar funcionam como num campo comum, e o leitor de tela lê um campo só,
 * não seis. O colar aceita a frase inteira do e-mail (`normalizarCodigo`).
 *
 * Movimento (tokens de theme/motion.ts): tremida curta em translateX no erro e
 * haptic de erro/sucesso. Com "Reduzir movimento", nada se move — a cor da borda
 * e a mensagem dizem o mesmo.
 */
export function CampoCodigo({ valor, onMudar, estado, erro, autoFocus = true }: Props) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReducedMotion();
  const ref = useRef<TextInput>(null);
  const tremida = useRef(new Animated.Value(0)).current;
  const casas = casasDoCodigo(valor);

  // Erro: haptic + tremida. Sucesso: haptic. Um efeito por transição de estado.
  const estadoAnterior = useRef<EstadoCampoCodigo>(estado);
  useEffect(() => {
    if (estadoAnterior.current === estado) return;
    estadoAnterior.current = estado;
    if (estado === 'sucesso') {
      vibrar('sucesso');
      return;
    }
    if (estado !== 'erro') return;
    vibrar('erro');
    if (reduzir) return;
    const { distancia, ciclos } = Motion.tremida;
    const passo = Motion.dur.base / (ciclos * 2);
    const idas: Animated.CompositeAnimation[] = [];
    for (let i = 0; i < ciclos; i++) {
      idas.push(
        Animated.timing(tremida, { toValue: distancia, duration: passo, easing: Motion.easing.standard, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(tremida, { toValue: -distancia, duration: passo, easing: Motion.easing.standard, useNativeDriver: Platform.OS !== 'web' }),
      );
    }
    idas.push(Animated.timing(tremida, { toValue: 0, duration: passo, easing: Motion.easing.standard, useNativeDriver: Platform.OS !== 'web' }));
    Animated.sequence(idas).start();
  }, [estado, reduzir, tremida]);

  const bloqueado = estado === 'verificando' || estado === 'sucesso';
  const corBorda = (preenchida: boolean, ativa: boolean) => {
    if (estado === 'erro') return cores.danger;
    if (estado === 'sucesso') return cores.success;
    if (ativa) return cores.accentLight;
    return preenchida ? cores.outlineDark : cores.outline;
  };

  return (
    <View>
      <Pressable
        onPress={() => ref.current?.focus()}
        accessible={false}
        style={styles.linhaWrap}
      >
        <Animated.View style={[styles.linha, { transform: [{ translateX: tremida }] }]}>
          {casas.map((c) => (
            <View
              key={c.posicao}
              style={[
                styles.casa,
                { borderColor: corBorda(c.preenchida, c.ativa) },
                c.ativa && styles.casaAtiva,
              ]}
            >
              <Text style={styles.digito}>{c.digito}</Text>
            </View>
          ))}
          {estado === 'sucesso' && (
            <View style={styles.check} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <MaterialCommunityIcons name="check-circle" size={22} color={cores.success} />
            </View>
          )}
        </Animated.View>
        <TextInput
          ref={ref}
          value={valor}
          onChangeText={(t) => onMudar(normalizarCodigo(t))}
          editable={!bloqueado}
          autoFocus={autoFocus}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete={Platform.select({ android: 'sms-otp', default: 'one-time-code' }) as 'sms-otp' | 'one-time-code'}
          maxLength={TAMANHO_CODIGO + 8 /* colar "123 456" ou com hífen */}
          caretHidden
          selectionColor="transparent"
          accessibilityLabel={`Código de ${TAMANHO_CODIGO} dígitos`}
          accessibilityHint="Digite ou cole o código recebido por e-mail"
          accessibilityState={{ disabled: bloqueado, busy: estado === 'verificando' }}
          style={styles.inputInvisivel}
        />
      </Pressable>
      <View accessibilityLiveRegion="polite" accessibilityRole={erro ? 'alert' : undefined}>
        {estado === 'erro' && !!erro && <Text style={styles.erro}>{erro}</Text>}
        {estado === 'verificando' && <Text style={styles.info}>Confirmando o código…</Text>}
        {estado === 'sucesso' && <Text style={styles.sucesso}>Código confirmado.</Text>}
      </View>
    </View>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  linhaWrap: { alignSelf: 'stretch', marginVertical: Spacing.sm },
  linha: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  casa: {
    width: 44, height: 52,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    backgroundColor: c.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  casaAtiva: { borderWidth: 2 },
  digito: { fontSize: 22, fontFamily: Fonts.bold, color: c.onSurface },
  check: { marginLeft: Spacing.xs },
  // Cobre as casas: o toque cai no campo real (foco, colar, menu do sistema).
  inputInvisivel: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    color: 'transparent',
    opacity: Platform.OS === 'web' ? 0.01 : 0.02,
    fontSize: 1,
  },
  erro: { color: c.danger, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  info: { color: c.onSurfaceVariant, fontSize: 13, textAlign: 'center', marginTop: 4 },
  sucesso: { color: c.success, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 4 },
});
