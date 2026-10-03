/**
 * Guarda de envio da `empresa` (uma linha por dono) — a regra pura.
 *
 *     testado por: node scripts/teste-relogio-sessao.ts
 *
 * O carimbo local (`EMPRESA_STAMP_KEY`) diz "a partir de qual versão da nuvem
 * este aparelho partiu". Desde 02/10/2026 ele é SEMPRE um `atualizado_em` do
 * servidor (lido no pull ou logo depois do envio) — nunca o relógio do aparelho.
 * A versão anterior gravava `new Date()` depois de cada envio: num celular 21
 * dias adiantado (revisor da Play) o carimbo vencia qualquer data do servidor e
 * o aparelho empurrava a cópia VAZIA por cima do cadastro corrigido na nuvem.
 *
 * A decisão (o erro de leitura, "não sei", fica com quem chama):
 *  - nuvem sem linha → pode escrever (conta nova criando a dela);
 *  - linha da nuvem SEM cadastro nenhum → pode escrever (nada a perder: é o caso
 *    do Onboarding completando uma linha que nasceu vazia);
 *  - sem carimbo local → a nuvem vence (aparelho novo não sobrescreve cadastro
 *    que nunca viu);
 *  - carimbo no FUTURO da nuvem (mais de 5 min) → é carimbo de relógio adiantado
 *    de versão antiga: não vale como prova, a nuvem vence e o pull o corrige;
 *  - nuvem mais nova que o carimbo → a nuvem vence; senão, pode escrever.
 */

export type EstadoEmpresaAntesDoPush = 'pode_escrever' | 'nuvem_mais_nova' | 'nao_sei';

/** Folga para carimbos legítimos de versões antigas (gravados logo após o envio). */
export const TOLERANCIA_CARIMBO_FUTURO_MS = 5 * 60_000;

export interface EmpresaRemotaParaGuarda {
  atualizadoEm: string | null | undefined;
  /** A linha existe mas não identifica negócio nenhum (ver `empresaSemCadastro`). */
  semCadastro: boolean;
}

export function decidirPushEmpresa(stampLocal: string | null | undefined, remoto: EmpresaRemotaParaGuarda | null): EstadoEmpresaAntesDoPush {
  if (!remoto) return 'pode_escrever';
  if (remoto.semCadastro) return 'pode_escrever';
  if (!stampLocal) return 'nuvem_mais_nova';
  const carimbo = Date.parse(stampLocal);
  const nuvem = remoto.atualizadoEm ? Date.parse(remoto.atualizadoEm) : Number.NaN;
  // Sem data da nuvem (linha legada) ou carimbo ilegível: mesmo piso de antes.
  if (Number.isNaN(carimbo) || Number.isNaN(nuvem)) return 'pode_escrever';
  if (carimbo > nuvem + TOLERANCIA_CARIMBO_FUTURO_MS) return 'nuvem_mais_nova';
  return nuvem > carimbo ? 'nuvem_mais_nova' : 'pode_escrever';
}
