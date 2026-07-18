import React from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import { Fonts } from './fonts';

// Este arquivo é o ÚNICO do tema que toca React Native. Ele mora separado de
// `fonts.ts` de propósito: o painel web (webapp/) reusa código deste `src/` — o
// gerador de PDF, os tipos de domínio — e o `tsc` dele arrasta junto tudo que
// esses arquivos importam. Enquanto `Fonts` era exportado do mesmo módulo que o
// patch, qualquer um que só quisesse o NOME da fonte arrastava o React Native
// para dentro do painel, que não tem esses tipos (3 erros de compilação, gate
// vermelho). Token é dado puro; patch é efeito de plataforma. Separados, cada
// lado importa só o que consegue compilar.
// Só o boot (App.tsx) importa daqui.

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
    // IMPORTANTE (web): em react-native-web o elemento já vem com o `style`
    // resolvido para um objeto CSS plano num nó DOM (div/span/input). Passar um
    // ARRAY de styles para um nó DOM faz o react-dom tentar `node.style[0] = ...`
    // -> "Failed to set an indexed property [0] on 'CSSStyleDeclaration'" (tela
    // branca). Por isso achatamos para um único objeto plano, que é seguro tanto
    // na web (objeto CSS) quanto no nativo (RN também achata arrays internamente).
    const merged = StyleSheet.flatten([
      (el.props as any).style,
      { fontFamily: family, fontWeight: undefined },
    ]);
    return React.cloneElement(el as any, { style: merged });
  };
}
