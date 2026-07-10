import React from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';

/**
 * Botão "Continuar com a Apple".
 *
 * Usa o COMPONENTE NATIVO da Apple, e não um botão nosso: a Guideline 4.8 e as
 * Human Interface Guidelines exigem o botão oficial (ou um pixel-perfeito com a
 * especificação deles). Reimplementar é convite a rejeição.
 *
 * `expo-apple-authentication` não existe fora do iOS (docs SDK 56), então o
 * módulo é resolvido com `require` dentro de uma guarda de plataforma. Um import
 * estático quebraria o bundle do Android e da web. Fora do iOS o componente
 * renderiza `null` — não ocupa espaço, não deixa buraco no layout.
 */

type ModuloApple = typeof import('expo-apple-authentication');

// Resolvido UMA vez, no carregamento do módulo, e só no iOS.
const Apple: ModuloApple | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-apple-authentication') as ModuloApple;
  } catch {
    return null; // build sem o módulo nativo: some o botão em vez de crashar
  }
})();

interface Props {
  onPress: () => void;
  /** Enquanto `true`, o toque é ignorado (o botão nativo não tem prop `disabled`). */
  desabilitado?: boolean;
  style?: ViewStyle;
}

export function BotaoApple({ onPress, desabilitado, style }: Props) {
  if (!Apple) return null;

  return (
    // O AppleAuthenticationButton não aceita `disabled`; bloquear o toque no
    // wrapper é a forma suportada de impedir dois logins simultâneos.
    <View
      pointerEvents={desabilitado ? 'none' : 'auto'}
      style={[styles.wrap, desabilitado && styles.desabilitado, style]}
    >
      <Apple.AppleAuthenticationButton
        buttonType={Apple.AppleAuthenticationButtonType.CONTINUE}
        // Fundo do OLLI é escuro: a HIG da Apple pede o botão BRANCO sobre escuro.
        buttonStyle={Apple.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={12}
        style={styles.botao}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', marginTop: 10 },
  // Altura equivalente à do OlliButton size="lg", para a Apple não parecer
  // secundária ao lado do Google (a Guideline 4.8 pede peso equivalente).
  botao: { width: '100%', height: 52 },
  desabilitado: { opacity: 0.5 },
});
