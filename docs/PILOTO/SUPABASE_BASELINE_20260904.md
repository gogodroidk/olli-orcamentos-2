# Baseline sanitizado do Supabase — OLLI Orçamentos

**Capturado em:** 2026-09-04T17:22:09-03:00  
**Boundary:** leitura somente, metadados e contrato; não é aceite de produção.  
**Fonte:** painel Supabase aberto no Chrome e SQL Editor do projeto confirmado.

## Identidade confirmada

- Organização exibida: `OLLI` (plano Free).
- Projeto exibido: `OLLI ORCAMENTOS`.
- Project ref: `yiaeplqinnnnniyvwtls`.
- Região/plano exibidos no painel: `AWS | us-west-2`, `nano`.
- A consulta ocorreu no banco `main` em modo de produção do painel, mas foi
  estritamente metadata-only: nenhum `SELECT` de tabela de negócio ou de linha
  de usuário foi executado.

## Método e limite da evidência

Foram executadas apenas consultas de catálogo no SQL Editor, sem salvar snippet,
sem DDL e sem exportação:

1. `information_schema.tables` para nomes de tabelas em `public` e `auth`;
2. `information_schema.columns` para as tabelas de identidade e orçamento;
3. `information_schema.triggers` para o vínculo de `auth.users`;
4. `pg_get_functiondef` somente para a função do trigger existente.

O resultado não contém corpo de usuário, e-mail de usuário, orçamento, segredo,
token ou resposta de provider. A execução não aplicou migration, não alterou
RLS, não publicou Worker e não enviou mensagem.

## Tabelas públicas observadas

O catálogo retornou estas relações públicas (nomes apenas):

`acessos_equipe`, `admin_audit_log`, `admin_memberships`, `agendamentos`,
`asset_qr_tokens`, `assets`, `assinaturas`, `backups`, `backups_versionados`,
`clientes`, `cnpj_cache`, `contadores`, `convites`, `credit_ledger`,
`depoimentos`, `empresa`, `eventos_orcamento_publico`, `exclusoes`,
`extras_sync`, `feedback`, `hvac_chunks`, `hvac_codigos`, `ia_cota_global_diaria`,
`ia_cota_reservas`, `ia_cota_usuario_diaria`, `ia_uso_gratis`,
`localizacoes_equipe`, `modelos`, `orcamento_versoes`, `orcamentos`,
`orcamentos_publicos`, `ordens_servico`, `organizacao_membros`,
`organizacao_membros_perfil`, `organizacoes`, `pmoc_ordens_geradas`,
`pmoc_plan_versions`, `pmoc_plans`, `produtos`, `profiles`, `qr_scan_events`,
`recibos`, `service_contract_versions`, `service_contracts`, `servicos` e
`webhook_events`.

## Colunas relevantes para o gate do welcome

O catálogo confirmou as seguintes colunas, sem consultar valores:

| Relação | Colunas observadas |
|---|---|
| `public.profiles` | `user_id uuid`, `email text`, `nome text`, `atualizado_em timestamptz` |
| `public.organizacoes` | `id uuid`, `owner_user_id uuid`, `nome text`, `criado_em timestamptz`, `equipe_grandfathered boolean` |
| `public.organizacao_membros` | `org_id uuid`, `user_id uuid`, `papel text`, `ativo boolean`, `criado_em timestamptz` |
| `public.organizacao_membros_perfil` | `org_id uuid`, `user_id uuid`, `papel text`, `ativo boolean`, `criado_em timestamptz`, `nome text`, `email text` |
| `public.orcamentos` | `id text`, `user_id uuid`, `numero text`, `cliente_id text`, `cliente_nome text`, `status text`, `subtotal numeric`, `desconto numeric`, `valor_total numeric`, `data_emissao timestamptz`, `dados jsonb`, `criado_em timestamptz`, `atualizado_em timestamptz`, `criado_por uuid`, `excluido_em timestamptz` |

## Hook de cadastro existente

O catálogo confirmou dois eventos do trigger `public.on_auth_user_sync_profile`:

- `INSERT` em `auth.users`;
- `UPDATE` em `auth.users`.

Ambos executam `public.sync_profile_from_auth()`.

O corpo observado da função tem este comportamento relevante:

- `SECURITY DEFINER` com `search_path` vazio;
- faz `INSERT ... ON CONFLICT (user_id) DO UPDATE` em `public.profiles`;
- deriva `nome` de `raw_user_meta_data` (`full_name`, `name` ou `nome`);
- captura `when others` e retorna `NEW` mesmo se a sincronização falhar.

Essa última regra é um risco operacional: falhas do perfil ficam silenciosas.
O welcome não deve substituir a função às cegas nem depender de uma exceção
engolida. A composição precisa ser explícita, idempotente e com rollback.

## Impacto no draft local

O draft `docs/ONDA_3/JANELA_3_3_EMAIL_PERSISTENCIA/20260904_email_welcome_outbox.sql`
referencia `auth.users`, `public.organizacoes` e `public.organizacao_membros`,
relações que existem no projeto confirmado. O baseline também mostra que já há
um trigger de sincronização de perfil; portanto, o rollout deve escolher uma
destas opções de forma registrada:

1. manter `sync_profile_from_auth()` e adicionar um hook separado, com ordem e
   falha observáveis; ou
2. compor as duas responsabilidades em uma função versionada, preservando o
   comportamento de perfil e acrescentando a RPC de welcome.

Não escolher automaticamente entre as opções. A migration não foi promovida e o
hook de runtime continua desligado.

## Gates que continuam humanos

O projeto e o baseline de catálogo estão agora documentados, mas ainda faltam:

- retenção e purge da PII mínima de destinatário;
- ownership do Worker/consumer e da função de dispatch;
- janela de aplicação e rollback testável;
- critério explícito `account.email_confirmed` →
  `email.welcome.requested` → outbox;
- smoke test com identidade sintética, sem usuários ou destinatários reais.

Até essas decisões serem registradas, a evidência permanece
`LOCAL_ONLY_SYNTHETIC`, `acceptedReal=false` e nenhuma migration pode ser
copiada para `supabase/migrations/`.

## Atualização do rollout — 2026-09-04T18:16:48-03:00

Os gates acima foram posteriormente decididos pelo proprietário e a camada de
persistência foi aplicada no mesmo projeto confirmado. Este bloco complementa
o snapshot original; não reescreve o estado histórico capturado antes da
migration.

- hook escolhido: triggers separados do `on_auth_user_sync_profile` existente;
- owner futuro do dispatch: Worker `olli-diagnostico`;
- retenção: PII de destinatário após 30 dias em estado terminal; metadados
  anonimizados por até um ano;
- migration remota `20260904210942_email_welcome_outbox`;
- complemento remoto `20260904211038_email_welcome_tenant_indexes`;
- canários: confirmação por `INSERT`, confirmação por `UPDATE`, replay
  idempotente, falha fail-open e purge, sempre em transação com `ROLLBACK`;
- limpeza comprovada: zero identidades, eventos ou itens de outbox sintéticos
  remanescentes.

RLS ficou habilitada e forçada, sem policies de cliente; `anon` e
`authenticated` não possuem privilégios nas novas tabelas/RPCs. O trigger de
perfil preexistente permaneceu habilitado. O aceite real continua `false`
porque o consumer da outbox não foi implementado/publicado e nenhum e-mail para
usuário real foi enviado.
