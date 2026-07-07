/**
 * Paleta de cores de marca compartilhada entre MeuNegocioScreen (cor padrão
 * da empresa) e Step4Personalizacao (cor por orçamento, pode sobrescrever a
 * padrão). Mantida num só lugar para as duas telas nunca divergirem.
 */
export interface CorMarcaSwatch {
  label: string;
  value: string;
}

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

/**
 * Decide se o texto/ícone sobre um swatch de cor deve ser branco ou escuro,
 * usando luminância relativa simples (aproximação de WCAG). Usado no check
 * de seleção desenhado por cima da cor sugerida/paleta.
 */
export function contrasteTextoSobre(hex: string): '#FFFFFF' | '#0A1626' {
  const limpo = hex.replace('#', '');
  const valido = /^[0-9a-fA-F]{6}$/.test(limpo) ? limpo : '000000';
  const r = parseInt(valido.slice(0, 2), 16) / 255;
  const g = parseInt(valido.slice(2, 4), 16) / 255;
  const b = parseInt(valido.slice(4, 6), 16) / 255;
  const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminancia = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  return luminancia > 0.5 ? '#0A1626' : '#FFFFFF';
}
