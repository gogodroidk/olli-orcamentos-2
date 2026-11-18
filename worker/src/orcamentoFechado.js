/**
 * Regra única do /admin para "orçamento fechado" e "orçamento ativo".
 *
 * Fechado = o prestador ou o cliente fechou o serviço: status `aprovado` OU `convertido`
 * (convertido = virou serviço/recibo no app; o /admin antigo só contava `aprovado`).
 * Ativo = não está na lixeira (`excluido_em` nulo). Excluído nunca entra em contagem nem em soma.
 */
export function orcamentoFechado(o) {
  return !!o && (o.status === 'aprovado' || o.status === 'convertido');
}

export function orcamentoAtivo(o) {
  return !!o && (o.excluido_em === null || o.excluido_em === undefined);
}
