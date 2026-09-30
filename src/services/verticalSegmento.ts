/**
 * verticalSegmento.ts — ponte entre a taxonomia RICA de verticais (verticais.ts,
 * dedução por CNAE) e os SEGMENTOS (chips) do onboarding/MeuNegócio (types.Segmento).
 *
 * Fica num módulo próprio (não em verticais.ts) porque precisa do tipo `Segmento` de
 * `types`, e `types` já importa `VerticalId` de `verticais` — colocar aqui evita o ciclo
 * de import (este módulo depende de ambos; nenhum dos dois depende dele).
 */
import type { Segmento } from '../types';
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
