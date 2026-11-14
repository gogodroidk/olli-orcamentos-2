# Central de atendimento — números no código

13/11/2026. O plano completo, com fonte e data, está em
`/home/igor/Desktop/Entregas Claude/OLLI/2026-11-13-ecossistema-olli/PRODUTO-ATENDIMENTO.md`.
Este repositório guarda só a conta e o teto, para o número não depender de memória.

- `src/services/atendimentoCusto.ts` calcula tarifa da Meta, IA, teto do piloto e o aceite do QR.
- `scripts/teste-atendimento-custo.ts` trava a conta. Rodar: `node scripts/teste-atendimento-custo.ts`.
- `schema-proposta.sql` não se aplica. Não está em `supabase/migrations`.

Pro R$ 39 e Empresa R$ 99 continuam em `src/services/precosPlanos.ts`. A hipótese de R$ 149 do piloto não entra na tela.
