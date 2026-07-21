/**
 * PAPEL NA ORGANIZAÇÃO — quem é dono da conta, e quem trabalha nela.
 *
 * Módulo PURO (zero imports) porque a pergunta "sou eu o dono?" é feita por dois
 * lugares que não podem discordar:
 *
 *   - a tela de Planos, que decide se mostra o plano lido ou "quem gerencia é o dono";
 *   - a marca do documento (`marcaRegra.ts`), que decide se o selo do OLLI sai.
 *
 * Os dois liam a MESMA linha de `organizacao_membros` e escreviam a mesma condição à
 * mão. Duas cópias de uma regra de COBRANÇA é como elas divergem: no dia em que um
 * papel novo aparecesse (`financeiro`, `supervisor`), um dos dois lados o trataria
 * como dono e o outro não — e o sintoma seria um técnico recebendo documento sem
 * marca, ou um dono pagante recebendo com.
 */

/**
 * `owner` = dono da organização. `pessoal` = conta sem organização (o
 * `useContextoDeEscrita` devolve esse rótulo quando não há linha de membresia).
 * Qualquer outro papel — `admin`, `gestor`, `tecnico`, ou um papel que ainda não
 * existe — NÃO é dono: a assinatura não é dele e a RLS não entrega a linha do dono.
 */
export function ehDonoDaConta(papel: string | undefined): boolean {
	return papel === "owner" || papel === "pessoal";
}

/**
 * `true` SÓ quando temos certeza de que a pessoa é membro e não é dona.
 *
 * `papel` indefinido (carregando, ou a leitura falhou) devolve `false` de propósito:
 * "não sei o papel" não é "é membro". Quem chama trata o desconhecido no caminho
 * normal — a linha de assinatura lida é a dela, e se ELA assina, o direito é dela.
 */
export function ehMembroNaoDono(papel: string | undefined): boolean {
	return !!papel && !ehDonoDaConta(papel);
}
