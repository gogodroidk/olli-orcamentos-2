/**
 * Relógio do SERVIDOR visto do aparelho — quanto o relógio do celular está
 * adiantado (ou atrasado) em relação ao Supabase. Módulo puro (sem React Native).
 *
 *     testado por: node scripts/teste-relogio-sessao.ts
 *
 * POR QUE EXISTE. Os revisores da Play usam aparelhos com o relógio até 21 dias
 * adiantado (medido em 02/10/2026). Com isso, todo token parecia vencido ao
 * chegar (rajada de refresh), o carimbo da empresa vencia qualquer data do
 * servidor e o backup "semanal" era recriado e girava cópias boas para fora.
 * Toda decisão que COMPARA uma data do aparelho com uma data do servidor passa a
 * usar `agoraDoServidorMs()`, e a tela mostra um aviso quando a diferença passa
 * de 5 minutos (ver components/AvisoRelogioErrado.tsx).
 *
 * DE ONDE VEM A MEDIDA (a mais recente vence):
 *  - `cabecalho_date`: o cabeçalho HTTP `Date` de qualquer resposta do Supabase
 *    (fetch do cliente, ver services/supabase.ts). Resolução de 1 s; a latência
 *    da rede soma poucos segundos, irrelevante perto do limite de 5 min;
 *  - `jwt`: o `iat` de um token recém-emitido, no momento em que a sessão é
 *    gravada (ver services/sessaoRelogio.ts).
 *
 * TRÊS ESTADOS: sem medida nenhuma, `defasagemRelogioMs()` devolve `null` — "não
 * sei" — e quem decide algo com a hora do servidor tem de tratar isso (nunca
 * cair no relógio do aparelho para APAGAR coisa alguma).
 */

/** A partir daqui o aviso "Data e hora do celular erradas" aparece. */
export const LIMITE_AVISO_RELOGIO_MS = 5 * 60_000;

export type FonteDefasagem = 'cabecalho_date' | 'jwt';

export interface MedidaRelogio {
  /** Relógio do aparelho MENOS o do servidor (positivo = celular adiantado). */
  defasagemMs: number;
  fonte: FonteDefasagem;
  /** Quando a medida foi feita, no relógio do aparelho. */
  medidaEm: number;
}

let medida: MedidaRelogio | null = null;
const ouvintes = new Set<(m: MedidaRelogio | null) => void>();

function avisar(): void {
  for (const ouvinte of ouvintes) {
    try { ouvinte(medida); } catch { /* um ouvinte quebrado não derruba os outros */ }
  }
}

/**
 * Registra uma medida nova. Só avisa os ouvintes quando muda algo que eles usam
 * (mais de 1 s de diferença, ou o aviso liga/desliga) — o cabeçalho chega em
 * TODA resposta e re-renderizar a tela a cada requisição seria desperdício.
 */
export function registrarDefasagem(defasagemMs: number, fonte: FonteDefasagem, agoraAparelhoMs: number = Date.now()): void {
  if (!Number.isFinite(defasagemMs) || !Number.isFinite(agoraAparelhoMs)) return;
  const anterior = medida;
  medida = { defasagemMs: Math.round(defasagemMs), fonte, medidaEm: agoraAparelhoMs };
  const mudouAviso = relogioDoAparelhoErrado(anterior) !== relogioDoAparelhoErrado(medida);
  const mudouValor = !anterior || Math.abs(anterior.defasagemMs - medida.defasagemMs) > 1_000;
  if (mudouAviso || mudouValor) avisar();
}

/**
 * Lê o cabeçalho `Date` de uma resposta do servidor. Valor ausente ou ilegível
 * (na web o navegador esconde o `Date` de respostas de outra origem) é ignorado:
 * não medir é melhor que medir errado.
 */
export function registrarHoraDoServidor(cabecalhoDate: string | null | undefined, agoraAparelhoMs: number = Date.now()): void {
  if (!cabecalhoDate) return;
  const servidorMs = Date.parse(cabecalhoDate);
  if (Number.isNaN(servidorMs)) return;
  registrarDefasagem(agoraAparelhoMs - servidorMs, 'cabecalho_date', agoraAparelhoMs);
}

/** Medida atual ou `null` (ainda não sei). */
export function medidaRelogio(): MedidaRelogio | null {
  return medida;
}

/** Defasagem atual em ms (aparelho − servidor) ou `null` quando ainda não sei. */
export function defasagemRelogioMs(): number | null {
  return medida ? medida.defasagemMs : null;
}

/**
 * "Agora" no relógio do servidor, estimado pela última medida. `null` = não sei:
 * quem chama decide o que fazer sem cair no relógio do aparelho.
 */
export function agoraDoServidorMs(agoraAparelhoMs: number = Date.now()): number | null {
  return medida ? agoraAparelhoMs - medida.defasagemMs : null;
}

/** O relógio do aparelho está errado a ponto de merecer aviso? Sem medida = não. */
export function relogioDoAparelhoErrado(m: MedidaRelogio | null = medida): boolean {
  return !!m && Math.abs(m.defasagemMs) > LIMITE_AVISO_RELOGIO_MS;
}

/** Ouve mudanças na medida. Devolve a função que cancela. */
export function assinarRelogio(ouvinte: (m: MedidaRelogio | null) => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

/** Só para teste: volta ao estado "não sei". */
export function _zerarRelogioParaTeste(): void {
  medida = null;
  ouvintes.clear();
}
