/**
 * ROTA DO DIA NO GOOGLE MAPS — miolo PURO (sem import nenhum em tempo de
 * execução, para `node scripts/teste-painel-rua.ts` provar o comportamento).
 *
 * Usa o link público de direções do Maps (`/maps/dir/?api=1`), o mesmo do
 * "Traçar rota": sem chave, sem billing, sem API paga. A origem fica de fora de
 * propósito — o próprio Maps parte de onde o celular está.
 *
 * Limite do link: 1 destino + até 9 paradas no meio (o Maps ignora o resto em
 * silêncio). Por isso cortamos em 10 e a tela diz quantas foram.
 */

/** Destino + 9 waypoints: o máximo que o link de direções do Maps aceita. */
export const MAX_PARADAS_LINK_MAPS = 10;

/** Endereço curto demais não é endereço (mesma régua do ETA). */
const MIN_ENDERECO = 3;

function limpar(endereco: string | null | undefined): string {
  return typeof endereco === 'string' ? endereco.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Endereços que entram na rota, em ordem: só os utilizáveis, sem repetir a
 * mesma parada em seguida (duas visitas no mesmo prédio viram um ponto só) e
 * cortados no limite do link.
 */
export function enderecosDaRota(enderecos: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const bruto of enderecos) {
    const e = limpar(bruto);
    if (e.length < MIN_ENDERECO) continue;
    if (out.length > 0 && out[out.length - 1].toLowerCase() === e.toLowerCase()) continue;
    out.push(e);
    if (out.length === MAX_PARADAS_LINK_MAPS) break;
  }
  return out;
}

/**
 * Link do Maps com TODAS as paradas (a última é o destino, as outras viram
 * `waypoints`). `null` quando não há nenhum endereço utilizável — a tela não
 * mostra um botão que abriria o Maps vazio.
 */
export function urlRotaDoDia(enderecos: readonly (string | null | undefined)[]): string | null {
  const paradas = enderecosDaRota(enderecos);
  if (paradas.length === 0) return null;
  const destino = paradas[paradas.length - 1];
  const meio = paradas.slice(0, -1);
  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
  if (meio.length > 0) url += `&waypoints=${encodeURIComponent(meio.join('|'))}`;
  return url;
}
