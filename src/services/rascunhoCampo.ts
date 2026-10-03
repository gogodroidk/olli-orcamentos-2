/**
 * Rascunho por campo — a regra pura (sem React Native, sem AsyncStorage).
 *
 *     testada por: node scripts/teste-confianca-offline.ts
 *
 * POR QUE POR CAMPO. Tirar foto no Android pode MATAR o app (pouca memória, ou
 * "Não manter atividades" ligado). Tudo que estava só no `useState` some. O
 * técnico volta da câmera e o texto que digitou no item do checklist, ou o
 * título da OS nova, evaporou. Gravar cada campo no aparelho enquanto se digita
 * (com um respiro curto) e DESCARREGAR na hora em que o app vai para o segundo
 * plano fecha essa janela: abrir a câmera põe o app em segundo plano antes de o
 * sistema poder matá-lo.
 *
 * Este módulo não importa nada de propósito: o `node` do gate não parseia o
 * React Native, e a regra do respiro (o que grava, quando, e o que descarta) é a
 * parte que pode estar errada sem ninguém perceber. O hook que a usa mora em
 * `src/hooks/useRascunhoCampo.ts`.
 */

import { RASCUNHO_CAMPO_PREFIX } from './storageKeys.ts';

/** Prefixo das chaves no AsyncStorage. A limpeza do logout apaga por ele. */
export const RASCUNHO_CAMPO_PREFIXO = RASCUNHO_CAMPO_PREFIX;

/** Um rascunho esquecido não volta para sempre: depois disso, é lixo. */
export const RASCUNHO_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

/** Respiro entre a última tecla e a gravação. */
export const RASCUNHO_ESPERA_MS = 400;

interface RegistroRascunho {
  v: 1;
  valor: string;
  salvoEm: number;
}

/** Chave estável e segura (sem espaço/barra) para escopo + campo. */
export function chaveRascunho(escopo: string, campo: string): string {
  const limpar = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `${RASCUNHO_CAMPO_PREFIXO}${limpar(escopo)}.${limpar(campo)}`;
}

export function serializarRascunho(valor: string, agora: number): string {
  const r: RegistroRascunho = { v: 1, valor, salvoEm: agora };
  return JSON.stringify(r);
}

/**
 * Texto do rascunho, ou null se não há, venceu ou está corrompido. Corrompido
 * vira null (não há o que restaurar) — aqui isso é correto: o pior caso é o
 * campo vir vazio, que é exatamente o estado sem esta proteção.
 */
export function lerRascunho(bruto: string | null | undefined, agora: number, validadeMs = RASCUNHO_VALIDADE_MS): string | null {
  if (!bruto) return null;
  try {
    const r = JSON.parse(bruto) as Partial<RegistroRascunho>;
    if (r?.v !== 1 || typeof r.valor !== 'string' || typeof r.salvoEm !== 'number') return null;
    if (agora - r.salvoEm > validadeMs) return null;
    if (r.valor.length === 0) return null;
    return r.valor;
  } catch {
    return null;
  }
}

export interface DependenciasGravador {
  /** Grava (`valor` string) ou apaga (`null`) o rascunho. Pode falhar. */
  gravar: (valor: string | null) => Promise<void>;
  /** Agenda `fn` para daqui a `ms`; devolve o cancelamento. */
  agendar: (fn: () => void, ms: number) => () => void;
  esperaMs?: number;
}

export interface GravadorRascunho {
  /** O campo mudou: grava depois do respiro (string vazia = apaga). */
  mudar: (valor: string) => void;
  /** Grava AGORA o que estiver pendente (app indo para o segundo plano). */
  descarregar: () => Promise<void>;
  /** Cancela o pendente e apaga o rascunho (salvou de verdade / descartou). */
  limpar: () => Promise<void>;
  /** Há escrita esperando o respiro? (diagnóstico/teste) */
  pendente: () => boolean;
}

/**
 * Debounce com descarga. Nunca lança: uma falha de gravação não pode derrubar
 * a digitação de ninguém — o campo continua na tela.
 */
export function criarGravadorRascunho(deps: DependenciasGravador): GravadorRascunho {
  const espera = deps.esperaMs ?? RASCUNHO_ESPERA_MS;
  let valorPendente: string | null | undefined; // undefined = nada pendente
  let cancelar: (() => void) | null = null;

  async function escrever(): Promise<void> {
    if (valorPendente === undefined) return;
    const valor = valorPendente;
    valorPendente = undefined;
    try {
      await deps.gravar(valor);
    } catch {
      // best-effort: o texto continua no campo
    }
  }

  return {
    mudar(valor) {
      valorPendente = valor.length > 0 ? valor : null;
      cancelar?.();
      cancelar = deps.agendar(() => {
        cancelar = null;
        void escrever();
      }, espera);
    },
    async descarregar() {
      cancelar?.();
      cancelar = null;
      await escrever();
    },
    async limpar() {
      cancelar?.();
      cancelar = null;
      valorPendente = undefined;
      try {
        await deps.gravar(null);
      } catch {
        // best-effort
      }
    },
    pendente() {
      return valorPendente !== undefined;
    },
  };
}
