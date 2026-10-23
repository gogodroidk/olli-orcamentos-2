# Runbook — backfill do status pelo link (#202). NADA AQUI É MIGRATION: não roda sozinho.

Ordem (cada passo com OK explícito do Igor e teste antes em `BEGIN ... ROLLBACK`):

1. **Passo 0 (este SQL)**: pré-insere os marcos `retroativo` com a data REAL. Sem ele o backfill carimba "enviado/aprovado" com a data de hoje.
   Seguro para o CAPI: a função de pendentes ignora marcos `estimado = true` (`20261007120000`, `not coalesce(m.estimado, false)`).
2. **Migration** `20261022150000_status_orcamento_pelo_link.sql` (trigger de status).
3. **Backfill**: `update public.orcamentos_publicos set status = status;` — só depois dos passos 1 e 2.
4. Conferir: 0 orçamentos em rascunho com link enviado/visto/aprovado; `select marco, origem, estimado, criado_em::date from funil_marcos where origem='retroativo'` sem data de hoje.

Origem: rascunho v3 do TECH — Supabase (23/10/2026), revisado pelo CTO. Não aplicado.

```sql
-- PASSO 0 do backfill do #202 (NAO APLICADO) — tech-supabase 23/10. Rodar ANTES de `update orcamentos_publicos set status = status`.
-- Por que: funil_marco_orcamento grava marco com now() a cada mudanca de status; sem este passo o backfill carimba 'enviado/aprovado' com a data de HOJE (falsa).
-- Como: funil_registrar_marco faz ON CONFLICT (user_id, marco) DO NOTHING, entao marco ja existente nunca e sobrescrito. Precedente no banco: origem='retroativo', estimado=true (5 enviado + 4 aprovado + 23 perfil).
-- Data real: enviado = criacao do link publico (orcamentos_publicos.criado_em); aprovado = respondido_em do cliente (fallback criado_em).
-- Medido 23/10 00:40: 4 contas enviado (2026-08-28, 10-14, 10-14, 10-21) + 1 aprovado (2026-10-21 18:59Z). Obs: 6ea9f60b = conta do Igor (admin); o marco dela e dado interno, nao entra em metrica de cliente.
with alvo as (
  select p.user_id, p.status, p.criado_em, p.respondido_em
  from public.orcamentos o
  join public.orcamentos_publicos p on p.orcamento_id = o.id::text and p.user_id = o.user_id and p.revogado_em is null
  where o.status = 'rascunho'
    and (p.status in ('enviado','aprovado','recusado') or p.visualizado_em is not null)
)
insert into public.funil_marcos (user_id, marco, origem, criado_em, estimado)
select user_id, 'orcamento_enviado', 'retroativo', min(criado_em), true from alvo group by user_id
union all
select user_id, 'orcamento_aprovado', 'retroativo', min(coalesce(respondido_em, criado_em)), true from alvo where status = 'aprovado' group by user_id
on conflict (user_id, marco) do nothing;
-- Conferir: select marco, origem, estimado, criado_em::date from funil_marcos where origem='retroativo' and criado_em > now() - interval '90 days';  (nenhuma data = hoje)
-- Teste sugerido: rodar tudo dentro de BEGIN ... ROLLBACK antes do OK.
```
