# Backend — OLLI Orçamentos (Supabase)

Projeto Supabase: **OLLI ORCAMENTOS** (`yiaeplqinnnnniyvwtls`, org `OLLI`).

Este backend é a **fonte de dados compartilhada** entre o **app mobile** (React Native / Expo, em `src/`) e o **painel web (PWA)** (em `web/`).

## Estado atual — Fase 1 (concluída)

Tabelas criadas, **todas com RLS** (cada usuário só acessa os próprios dados, via `user_id = auth.uid()`):

| Tabela | Tipo | Observação |
|---|---|---|
| `empresa` | 1 linha por usuário | perfil da empresa em `dados` (jsonb) |
| `clientes` | estruturada | |
| `servicos` | estruturada | |
| `produtos` | estruturada | |
| `orcamentos` | híbrida | colunas consultáveis + objeto completo em `dados` |
| `recibos` | híbrida | idem |
| `modelos` | híbrida | `orcamentoBase` em `dados` |
| `depoimentos` | estruturada | |
| `contadores` | sequência por usuário | numeração de orçamentos/recibos |
| `backups` | **preservada** | usada pelo app atual; não foi alterada |

**Decisão de arquitetura (tabelas complexas):** abordagem **híbrida** — colunas estruturadas para o que o painel precisa filtrar/somar (`numero`, `status`, `valor_total`, `cliente_nome`, datas…) **+** uma coluna `dados jsonb` com o objeto completo. Isso espelha como o app **já** guarda os dados (JSON), tornando a futura migração quase 1:1.

**Convenções:**
- `id` é **TEXT** (UUID gerado no cliente, igual ao app).
- `user_id` tem default `auth.uid()` — o cliente **não** precisa enviá-lo no insert.
- Datas em `timestamptz`; valores monetários em `numeric`.

## Migração

`migrations/0001_create_core_orcamentos_schema.sql` — já aplicada. Para replicar em outro ambiente, basta rodar esse SQL.

## Pendências de segurança (recomendado, não bloqueiam)

O linter aponta 2 itens **pré-existentes** (não vieram desta migração):

1. **Função `public.rls_auto_enable()` (SECURITY DEFINER) exposta** a `anon`/`authenticated`. Se não for usada, corrija com:
   ```sql
   revoke execute on function public.rls_auto_enable() from anon, authenticated;
   ```
2. **Proteção contra senhas vazadas desligada.** Ligar em: Dashboard → Authentication → Providers → Password → *Leaked password protection*.

## Próximos passos

- **Fase 2 (em andamento):** painel web PWA em `web/` — login + leitura dos dados + instalável no iPhone/Android.
- **Fase 3 (a fazer):** adaptar o app mobile para ler/gravar no Supabase (hoje usa SQLite local + backup em blob). Estratégia sugerida: manter o SQLite como **cache offline** e **sincronizar** com o Supabase. A numeração sequencial (`contadores`) deve virar uma função no banco / upsert atômico para não colidir entre dispositivos.

## Tipos

`types.ts` — tipos TypeScript gerados a partir do schema (fonte canônica). Regere após qualquer mudança de schema.
