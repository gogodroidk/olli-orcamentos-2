/**
 * verticalSegmento.ts — ponte entre a taxonomia RICA de verticais (verticais.ts,
 * dedução por CNAE) e os SEGMENTOS (chips) do onboarding/MeuNegócio (types.Segmento).
 *
 * Fica num módulo próprio (não em verticais.ts) porque precisa do tipo `Segmento` de
 * `types`, e `types` já importa `VerticalId` de `verticais` — colocar aqui evita o ciclo
 * de import (este módulo depende de ambos; nenhum dos dois depende dele).
 */
import type { Empresa, Segmento } from '../types';
import type { VerticalId } from './verticais';

/** VerticalId (deduzido do CNAE) → Segmento (os chips do onboarding/MeuNegócio). */
export const VERTICAL_PARA_SEGMENTO: Record<VerticalId, Segmento> = {
  refrigeracao: 'ar-condicionado',
  eletrica: 'eletrica',
  hidraulica: 'hidraulica',
  pintura: 'pintura',
  dedetizacao: 'dedetizacao',
  caixa_dagua: 'caixa-dagua',
  piscina: 'piscina',
  extintores: 'extintores',
  jardinagem: 'outro',
  geral: 'outro',
};

/** Segmento (o chip que o usuário escolheu) → VerticalId (o "ofício" que dirige o gate). */
export const SEGMENTO_PARA_VERTICAL: Record<Segmento, VerticalId> = {
  'ar-condicionado': 'refrigeracao',
  eletrica: 'eletrica',
  hidraulica: 'hidraulica',
  pintura: 'pintura',
  dedetizacao: 'dedetizacao',
  'caixa-dagua': 'caixa_dagua',
  piscina: 'piscina',
  extintores: 'extintores',
  outro: 'geral',
};

/**
 * Verticais EFETIVOS da empresa: os explícitos (`verticais`), senão DERIVADOS do `segmento`
 * escolhido. A maioria das contas tem segmento (ex.: ar-condicionado) mas pode não ter
 * `verticais` preenchido (dado anterior à personalização) — sem isto, o gate caía no
 * backward-compat "sem ofício = mostra TUDO" e um HVAC via as ferramentas de pintura/ANVISA.
 * Sem NENHUM dos dois = conta realmente sem nicho = mostra tudo (backward-compat de verdade).
 *
 * Mora aqui (módulo puro, sem React Native) para os SERVICES usarem sem importar o hook
 * `useVerticais` — que puxa `AppState` e quebra o typecheck do painel (webapp), que
 * compila `services/*` via cloudSync.
 */
export function verticaisEfetivos(
  emp: Pick<Empresa, 'verticais' | 'segmento'> | null | undefined,
): VerticalId[] | undefined {
  if (emp?.verticais && emp.verticais.length > 0) return emp.verticais;
  if (emp?.segmento) return [SEGMENTO_PARA_VERTICAL[emp.segmento]];
  return undefined;
}
