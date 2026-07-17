/**
 * "Esta conta PODE usar Equipe?" — a decisão PURA do paywall Empresa + F0d.
 *
 * Existe separada porque o Plano-Mestre é explícito na regra 11.2: a UI e o worker
 * devem perguntar **"esta conta PODE X"**, nunca **"esta conta É Empresa"**. Assim
 * que aparece um `if (plano === 'empresa')` espalhado por tela, o grandfathering (e
 * qualquer exceção futura) vira caça a `if` pelo código inteiro.
 *
 * O worker é quem MANDA (`orgTemEmpresaAtivo`, com service_role). Isto aqui é UX:
 * serve para não mostrar muro de pagamento a quem o servidor vai deixar passar.
 * Paywall no client é vitrine; fechadura é server-side.
 */
import type { LeituraOrganizacao } from './equipe';

/** Três estados — o de sempre. `indeterminado` NÃO é "pode" nem "não pode". */
export type AcessoEquipe =
  | { pode: true; motivo: 'plano' | 'grandfathered' }
  | { pode: false; motivo: 'sem_plano' }
  | { pode: false; motivo: 'indeterminado' };

/**
 * @param temPlanoEquipe o plano atual libera `equipe`? (vem do `usePlano`, que já
 *   cacheia o último plano bom — por isso quem paga não perde acesso numa oscilação)
 * @param leituraOrg    resultado de `carregarMinhaOrganizacao()` (3 estados)
 *
 * A ordem importa. O PLANO decide primeiro: quem paga entra mesmo que a leitura da
 * org falhe (é o caso comum e o que não pode quebrar). Só depois olhamos o
 * grandfathering, que exige saber QUAL org é — e por isso depende da leitura.
 *
 * Erro ao ler a org NÃO vira "não é grandfathered" (que negaria acesso a quem
 * sempre pôde) nem "é" (que daria Empresa de graça): vira `indeterminado`, e quem
 * chama decide o que mostrar. Aqui o "não sei" é honesto em vez de conveniente.
 */
export function acessoEquipe(temPlanoEquipe: boolean, leituraOrg: LeituraOrganizacao): AcessoEquipe {
  if (temPlanoEquipe) return { pode: true, motivo: 'plano' };
  if (leituraOrg.status === 'erro') return { pode: false, motivo: 'indeterminado' };
  // `status: 'ok'` com `org: null` = conta pessoal de verdade: não há org para
  // herdar grandfathering, e sem plano não há Equipe.
  if (leituraOrg.org?.equipeGrandfathered === true) return { pode: true, motivo: 'grandfathered' };
  return { pode: false, motivo: 'sem_plano' };
}

/**
 * A tela deve mostrar o muro do paywall?
 *
 * `indeterminado` → NÃO mostra o muro ainda: mostrar "assine o Empresa" para quem
 * talvez seja grandfathered é acusar o usuário de caloteiro por causa de um erro de
 * rede. Fica no estado de carregando/erro da própria tela; e se ele tentar convidar
 * de verdade, o worker responde 503 e o app pede para tentar de novo — negar é
 * decisão do servidor, com o dado na mão, não chute do client.
 */
export function mostrarMuroEquipe(acesso: AcessoEquipe): boolean {
  return acesso.pode === false && acesso.motivo === 'sem_plano';
}
