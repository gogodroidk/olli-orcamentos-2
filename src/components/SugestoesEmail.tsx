import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { BorderRadius, Fonts, Spacing, useEstilos, type Cores } from '../theme';
import { OlliPressable } from './OlliPressable';

/** Provedores de e-mail mais comuns no Brasil, na ordem de sugestão. */
const PROVEDORES_BR = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com.br',
  'icloud.com',
  'live.com',
  'terra.com.br',
  'uol.com.br',
  'bol.com.br',
];

// E-mail "fechado" (tem @ e um domínio com ponto) — a partir daqui a sugestão
// só atrapalharia quem já terminou de digitar.
const EMAIL_COMPLETO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SugestoesEmailProps {
  /** Valor atual do campo de e-mail (login ou cadastro — mesmo componente serve os dois). */
  email: string;
  /** Só calcula/mostra sugestões com o campo em foco; o chamador soma isto ao perder o foco. */
  focado: boolean;
  /** Toque numa sugestão — recebe o e-mail já completo, pronto para preencher o campo. */
  onSelecionar: (emailCompleto: string) => void;
}

/**
 * Fileira de sugestões de provedor ("<o que a pessoa digitou>@gmail.com",
 * "...@hotmail.com"...) que aparece assim que o usuário digita o "@" no
 * e-mail — 1 toque completa o campo inteiro, menos digitação num teclado de
 * celular. Filtra pelo que já foi digitado depois do "@" e some sozinha
 * quando o e-mail já está completo/válido ou o campo perde o foco.
 *
 * Componente burro e reusável: quem chama é dono do estado do campo (login
 * e cadastro, no mesmo `EntrarScreen`, usam a mesma instância).
 */
export function SugestoesEmail({ email, focado, onSelecionar }: SugestoesEmailProps) {
  const styles = useEstilos(criarEstilos);

  const sugestoes = useMemo(() => {
    if (!focado) return [];
    const arroba = email.indexOf('@');
    if (arroba === -1) return [];
    if (EMAIL_COMPLETO.test(email.trim())) return [];
    const local = email.slice(0, arroba);
    if (!local) return [];
    const digitadoDepois = email.slice(arroba + 1).toLowerCase();
    const candidatos = digitadoDepois
      ? PROVEDORES_BR.filter((p) => p.startsWith(digitadoDepois) && p !== digitadoDepois)
      : PROVEDORES_BR;
    return candidatos.map((provedor) => `${local}@${provedor}`);
  }, [email, focado]);

  if (sugestoes.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={styles.scroll}
      contentContainerStyle={styles.linha}
    >
      {sugestoes.map((sugestao) => (
        <OlliPressable
          key={sugestao}
          onPress={() => onSelecionar(sugestao)}
          haptic="selection"
          hitSlop={6}
          accessibilityLabel={`Usar e-mail ${sugestao}`}
          style={styles.chip}
        >
          <Text style={styles.texto} numberOfLines={1}>{sugestao}</Text>
        </OlliPressable>
      ))}
    </ScrollView>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  scroll: { marginTop: -6, marginBottom: Spacing.base },
  linha: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: c.surfaceVariant,
    borderWidth: 1,
    borderColor: c.outline,
  },
  texto: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.accentLight },
});
