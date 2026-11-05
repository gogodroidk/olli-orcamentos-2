/**
 * Paleta de cores de marca compartilhada entre MeuNegocioScreen (cor padrão
 * da empresa) e Step4Personalizacao (cor por orçamento, pode sobrescrever a
 * padrão). Mantida num só lugar para as duas telas nunca divergirem.
 *
 * A AMOSTRA guarda a cor escolhida (o Ciano continua #19D3E6). Quem pinta
 * texto ou cabeçalho com branco por cima usa `corMarcaNoPapel`: escurece só
 * o que fica abaixo de 4,5:1 e devolve a cor original, caixa inclusive,
 * quando ela já passa. Cor inválida vira o azul OLLI — nunca o texto cru.
 */
import { ajustarParaContraste, contraste, textoSobre } from '../theme/cores.ts';
import { safeHexColor } from './html.ts';

export interface CorMarcaSwatch {
  label: string;
  value: string;
}

/** Azul OLLI. Cor de marca inválida cai aqui, nunca no texto que veio de fora. */
export const COR_MARCA_FALLBACK = '#0B6FCE';

/** Papel do PDF e fundo claro do painel. */
export const FUNDO_PAPEL = '#FFFFFF';

/**
 * Superfície escura mais clara do painel (elevated). É o pior caso para texto
 * escuro: se passa aqui, passa no cartão e no fundo, que são mais escuros.
 */
export const FUNDO_PAINEL_ESCURO = '#16304D';

const ALVO_TEXTO = 4.5;

export const CORES_MARCA: CorMarcaSwatch[] = [
  { label: 'Azul', value: '#0B6FCE' },
  { label: 'Verde', value: '#0E7C66' },
  { label: 'Terracota', value: '#B4451F' },
  { label: 'Roxo', value: '#5B3DA8' },
  { label: 'Grafite', value: '#1C2230' },
  { label: 'Ciano', value: '#19D3E6' },
  { label: 'Marrom', value: '#8B5E34' },
  { label: 'Vinho', value: '#8B2942' },
];

/** `#RGB` → `#RRGGBB`, preservando a caixa. Um `#RGB0F` não é alfa de CSS. */
function hex6(cor: string): string {
  return /^#[0-9a-fA-F]{3}$/.test(cor)
    ? '#' + cor.slice(1).split('').map((c) => c + c).join('')
    : cor;
}

/**
 * Cor de marca para papel branco (PDF, recibo, página pública, etiqueta).
 * Hex validado, `#RGB` expandido, escurecida só até o texto branco passar
 * 4,5:1. Quem já passa volta idêntico, inclusive a caixa (`#123ABC` fica
 * `#123ABC`). Entrada inválida devolve `fallback`, sem interpolar o texto.
 */
export function corMarcaNoPapel(bruta: unknown, fallback = COR_MARCA_FALLBACK): string {
  const segura = hex6(safeHexColor(bruta, fallback));
  return ajustarParaContraste(segura, FUNDO_PAPEL, ALVO_TEXTO);
}

/** A mesma guarda contra um fundo qualquer (ícone sobre a superfície do app). */
export function corMarcaSobre(bruta: unknown, fundo: string, fallback = COR_MARCA_FALLBACK): string {
  const segura = hex6(safeHexColor(bruta, fallback));
  return ajustarParaContraste(segura, fundo, ALVO_TEXTO);
}

export interface MisturasMarca {
  lighter: string;
  light: string;
  dark: string;
  darker: string;
}

export interface TokensMarca extends MisturasMarca {
  default: string;
  foreground: string;
}

/**
 * Rampa do painel. Os degraus que já passam 4,5:1 ficam como a mistura os
 * calculou (não achata uma marca boa até o mínimo). O que falha cede:
 * `default` no claro é a cor do papel; no escuro, a cor legível sobre o navy.
 * `dark` é texto no claro; `light` é texto no escuro.
 */
export function tokensDaMarca(base: string, misturas: MisturasMarca, escuro: boolean): TokensMarca {
  const noPapel = ajustarParaContraste(base, FUNDO_PAPEL, ALVO_TEXTO);
  const noEscuro = ajustarParaContraste(base, FUNDO_PAINEL_ESCURO, ALVO_TEXTO);
  const dark = contraste(misturas.dark, FUNDO_PAPEL) >= ALVO_TEXTO ? misturas.dark : noPapel;
  const light = contraste(misturas.light, FUNDO_PAINEL_ESCURO) >= ALVO_TEXTO ? misturas.light : noEscuro;
  const principal = escuro ? noEscuro : noPapel;
  return {
    lighter: misturas.lighter,
    light,
    default: principal,
    dark,
    darker: misturas.darker,
    foreground: textoSobre(principal),
  };
}

/**
 * Branco ou tinta sobre o swatch. Usa o contraste de verdade (`textoSobre`),
 * não o corte de luminância em 0,5 — esse corte errava cores do meio, as que
 * a logo sugere. O ✓ da paleta é o único uso.
 */
export function contrasteTextoSobre(hex: string): string {
  return textoSobre(hex6(safeHexColor(hex, '#000000')));
}
