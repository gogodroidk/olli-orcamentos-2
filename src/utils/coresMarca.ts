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
