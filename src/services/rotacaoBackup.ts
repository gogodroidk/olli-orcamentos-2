/**
 * Decisões do backup automático que envolvem DATA — a regra pura.
 *
 *     testado por: node scripts/teste-relogio-sessao.ts
 *
 * O BUG (02/10/2026). O backup decidia "já tem diário de hoje?" e "o semanal
 * tem mais de 7 dias?" comparando o `criado_em` do servidor com o relógio do
 * celular. Num aparelho 21 dias adiantado, todo semanal parecia velho: nascia um
 * semanal novo a cada abertura e a retenção (4 semanais) apagava as cópias boas
 * de semanas anteriores. A mesma marca apareceu em 16 e 17/09.
 *
 * AGORA:
 *  - o carimbo local de 24 h só é comparado com o MESMO relógio que o gravou, e
 *    um carimbo "no futuro" (a pessoa acertou a hora) é ignorado em vez de
 *    travar o backup por semanas;
 *  - o semanal é decidido com o `criado_em` do diário que ACABOU de entrar (a
 *    hora exata do servidor) contra o `criado_em` do último semanal: as duas
 *    pontas são do servidor. Sem uma delas, não decide (não cria, não gira).
 */

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/**
 * Horas desde o carimbo local (mesmo relógio do aparelho nas duas pontas).
 * `null` = carimbo ausente, ilegível ou no futuro (relógio voltou): não vale.
 */
export function horasDesdeCarimboLocal(carimbo: string | null | undefined, agoraAparelhoMs: number): number | null {
  if (!carimbo) return null;
  const quando = Date.parse(carimbo);
  if (Number.isNaN(quando)) return null;
  const horas = (agoraAparelhoMs - quando) / HORA_MS;
  return horas >= 0 ? horas : null;
}

export type DecisaoSemanal = 'criar' | 'pular' | 'nao_sei';

/**
 * @param agoraServidorIso `criado_em` do diário recém-inserido (hora do servidor)
 * @param ultimoSemanalIso `criado_em` do último semanal; `null` = nunca houve;
 *                         `undefined` = a leitura falhou
 */
export function decidirBackupSemanal(
  agoraServidorIso: string | null | undefined,
  ultimoSemanalIso: string | null | undefined,
  diasEntreSemanais = 7,
): DecisaoSemanal {
  const agora = agoraServidorIso ? Date.parse(agoraServidorIso) : Number.NaN;
  if (Number.isNaN(agora)) return 'nao_sei';
  if (ultimoSemanalIso === undefined) return 'nao_sei';
  if (ultimoSemanalIso === null) return 'criar';
  const ultimo = Date.parse(ultimoSemanalIso);
  if (Number.isNaN(ultimo)) return 'nao_sei';
  return (agora - ultimo) / DIA_MS >= diasEntreSemanais ? 'criar' : 'pular';
}
