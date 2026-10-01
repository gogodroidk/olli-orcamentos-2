/**
 * "Contas a receber" do aparelho, em SQL puro sobre o SQLite local — separado de
 * `database.ts` para o teste (`scripts/teste-banco-conexao.ts`) rodar a MESMA consulta
 * num SQLite de verdade no Node, sem expo-sqlite.
 *
 * A regra é a do radar de dinheiro (`src/services/radarDinheiro.ts`,
 * `listarDinheiroParado`), a mesma do painel e do resumo por e-mail:
 *  • orçamento GANHO = status `aprovado` OU `convertido` (`STATUS_A_RECEBER`). Antes só
 *    contava `aprovado`: o orçamento convertido em OS e ainda não pago sumia do "a receber";
 *  • a conta é pelo SALDO (valor do orçamento − recibos dele), não por "tem recibo ou não":
 *    pagamento parcial continua sendo dinheiro a receber (o saldo que falta);
 *  • recibo na lixeira ou estornado não abate nada (`getStatusFinanceiro` do app);
 *  • valor de recibo ilegível ou negativo abate zero; saldo até R$ 0,005 conta como quitado
 *    (a mesma folga de `getStatusFinanceiro`);
 *  • NÃO SEI ≠ ZERO: orçamento ganho sem valor numérico não entra na soma — sai contado em
 *    `sem_valor`, para ninguém mostrar "R$ 0,00" em cima de dado faltante.
 *
 * Colunas devolvidas: `contagem` (orçamentos com saldo), `soma` (total dos saldos) e
 * `sem_valor` (ganhos que ficaram fora por não ter valor legível).
 */
import { STATUS_A_RECEBER } from '../services/radarDinheiro.ts';

// Literais internos (a constante do radar), nunca entrada externa.
const STATUS_GANHO_SQL = STATUS_A_RECEBER.map((s) => `'${s}'`).join(', ');

export const SQL_CONTAS_A_RECEBER = `
WITH recebido AS (
  SELECT json_extract(r.data, '$.orcamentoId') AS orcamento_id,
         SUM(CASE
               WHEN typeof(json_extract(r.data, '$.valorRecebido')) IN ('integer', 'real')
               THEN MAX(0, json_extract(r.data, '$.valorRecebido'))
               ELSE 0
             END) AS valor
  FROM recibos r
  WHERE json_extract(r.data, '$.excluidoEm') IS NULL
    AND json_extract(r.data, '$.estornadoEm') IS NULL
    AND json_extract(r.data, '$.orcamentoId') IS NOT NULL
  GROUP BY json_extract(r.data, '$.orcamentoId')
),
ganhos AS (
  SELECT json_extract(o.data, '$.valorTotal') AS total,
         typeof(json_extract(o.data, '$.valorTotal')) IN ('integer', 'real') AS tem_valor,
         COALESCE(rc.valor, 0) AS pago
  FROM orcamentos o
  LEFT JOIN recebido rc ON rc.orcamento_id = o.id
  WHERE json_extract(o.data, '$.excluidoEm') IS NULL
    AND json_extract(o.data, '$.status') IN (${STATUS_GANHO_SQL})
)
SELECT COALESCE(SUM(CASE WHEN tem_valor AND total - pago > 0.005 THEN 1 ELSE 0 END), 0) AS contagem,
       COALESCE(SUM(CASE WHEN tem_valor AND total - pago > 0.005 THEN total - pago ELSE 0 END), 0) AS soma,
       COALESCE(SUM(CASE WHEN tem_valor THEN 0 ELSE 1 END), 0) AS sem_valor
FROM ganhos
`;
