import React from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';

export const Fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
};

const WEIGHT_TO_FAMILY: Record<string, string> = {
  '100': Fonts.regular,
  '200': Fonts.regular,
  '300': Fonts.regular,
  '400': Fonts.regular,
  normal: Fonts.regular,
  '500': Fonts.medium,
  '600': Fonts.semiBold,
  '700': Fonts.bold,
  bold: Fonts.bold,
  '800': Fonts.extraBold,
  '900': Fonts.extraBold,
};

/**
 * Faz TODO <Text>/<TextInput> usar a Plus Jakarta Sans no peso correto,
 * mapeando o fontWeight existente para o arquivo de fonte certo.
 * Aplicado uma vez no boot, depois das fontes carregarem. Zero edição por tela.
 */
export function applyFontPatch() {
  patch(Text as any);
  patch(TextInput as any);
}

function patch(Comp: any) {
  if (!Comp || Comp.__olliFontPatched) return;
  const orig = Comp.render;
  if (typeof orig !== 'function') return;
  Comp.__olliFontPatched = true;
  Comp.render = function (...args: any[]) {
    const el = orig.apply(this, args);
    if (!el || !React.isValidElement(el)) return el;
    const flat = StyleSheet.flatten((el.props as any).style) || {};
    const weight = flat.fontWeight != null ? String(flat.fontWeight) : '400';
    const family = flat.fontFamily || WEIGHT_TO_FAMILY[weight] || Fonts.regular;
    return React.cloneElement(el as any, {
      style: [(el.props as any).style, { fontFamily: family, fontWeight: undefined }],
    });
  };
}
