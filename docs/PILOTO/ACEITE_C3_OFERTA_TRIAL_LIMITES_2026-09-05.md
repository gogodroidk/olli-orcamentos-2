# Aceite local C3 — oferta, trial e limites comerciais

Data: **2026-09-05**  
Checkout canônico: `C:\OLLI_REL`  
Branch: `Codex/piloto-p0`

## Resultado

O pacote C3 está implementado e validado localmente. O plano Grátis continua
permanente, com criação de rascunhos, clientes, produtos, histórico e recibos
sem limite; a entrega de orçamentos por PDF, link ou WhatsApp oficial fica
limitada a **5 envios confirmados por tenant/mês**. A plataforma pode oferecer um
trial Pro **opt-in de 14 dias**, sem cartão, sem renovação automática e sem apagar
dados no downgrade.

## Contrato operacional

- A autorização acontece antes do efeito externo, por uma reserva transacional.
- A reserva tem token, expiração de 10 minutos e chave idempotente por
  `tenant_id + periodo + orcamento_id`.
- O consumo só é confirmado depois que a entrega local termina com sucesso.
- Falha de entrega cancela a reserva; falha de confirmação mantém a reserva até
  expirar, evitando liberar uma cota que pode já ter sido consumida.
- Mais de uma organização possível para a mesma sessão falha fechada com
  `tenant_ambiguo`.
- O trial só começa por ação explícita do usuário na tela de planos. Não há
  captura de cartão nem cobrança automática no experimento.
- O Worker reconhece o trial via RPC de serviço; se a RPC ainda não existir no
  ambiente, mantém o regime de cota anterior, sem liberar acesso por erro.

## Evidências locais

- `npm run typecheck` — passou.
- `npm run build` em `webapp` — passou.
- `npm run build` em `web` — passou.
- `npm run test:limites-comerciais` — passou.
- `npm run test:planos-fonte` — passou (31 ok, 0 falha; mutações 7/7).
- `npm run test:creditos-voz` — passou (145 ok, 0 falha).
- `npm run test:cobranca-ia-ponta-a-ponta` — passou (58 ok, 0 falha).
- `npm run test:ia-quota` — passou (47 ok, 0 falha).
- `git diff --check` — passou.

## Limites da prova

A migration `supabase/migrations/20260905053000_cota_orcamentos_trial_pro.sql`
foi escrita, mas **não foi aplicada em produção**. Esta máquina não possui
Supabase CLI, Docker ou `psql` disponíveis para uma execução local real. Ainda
faltam, portanto, aplicação em ambiente de staging, teste com sessão/tenant
real, validação de RLS no banco hospedado e experimento comercial autorizado.
Billing, checkout, publicação e coorte permanecem gates externos.

