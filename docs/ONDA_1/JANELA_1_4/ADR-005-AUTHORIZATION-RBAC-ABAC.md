# ADR-005 — Autorização fail-closed por organização, recurso, ação e contexto

Status: **ACEITO COMO DIREÇÃO ARQUITETURAL LOCAL; NO-GO PARA RUNTIME, DADO REAL E PRODUÇÃO**  
Data: 2026-08-28  
Versão da decisão: **1.1**  
Dono: **Arquitetura/Segurança de aplicação**, com validação de **Produto/Operações** para a matriz de capacidades

## Contexto

O desenho legado usa `user_id` do owner como aproximação de tenant. A V2 precisa suportar owner, administradores, gestores, técnicos, visualizadores, usuários multiempresa e aprovadores externos sem confundir autoria, empresa e permissão. A Janela 1.3 provou em fixture reautorização no drain, papéis fail-closed e negação após revogação, mas isso ainda não existe como garantia de runtime/RLS.

## Escopo, não-escopo e substituição

Escopo: decisão de autorização para mobile/web/gateway/RPC/Postgres/Storage, catálogo inicial de papéis/capacidades, atributos por recurso, revogação, anti-enumeração e administração interna do SaaS.

Não-escopo: autenticação/recuperação de conta final, catálogo remoto, migration/RLS remotas, suporte break-glass real, dados reais ou customização livre de papéis no primeiro corte.

Dependências: ADR-001/002/003, recurso canônico com `organization_id`, sessão válida, catálogo versionado de capabilities, policies/RPCs e feature flags server-side.

Substituição exige ADR posterior deny-by-default, matriz de compatibilidade, testes cross-tenant/revogação, migration compensatória e preservação integral de autoria/auditoria. Nunca se faz rollback desligando RLS ou reabrindo grants amplos.

## Decisão

Adotar autorização combinando RBAC e atributos do recurso/contexto:

- `organization_id` é a fronteira canônica de tenant;
- ator vem exclusivamente da sessão/JWT validado;
- membership ativa é consultada/revalidada pelo servidor em toda operação sensível;
- papel concede um conjunto versionado de capacidades, nunca acesso geral;
- decisão também considera recurso, organização, atribuição, estado, versão, finalidade e audiência;
- ausência de regra, papel desconhecido, contexto incompleto ou divergência falha fechado;
- `organization_memberships` da empresa cliente e `admin_memberships` do SaaS são domínios independentes;
- RLS é defesa obrigatória, mas não substitui autorização de domínio em endpoints `service_role`;
- cliente pode solicitar organização/recurso, mas não fornece autoridade para ator, papel, owner, audiência ou custo.

Fluxo obrigatório e indivisível de decisão:

```text
sessão/JWT válida
→ actor_user_id derivado no servidor
→ membership ativa na fonte canônica
→ capability/política versionada
→ organization_id do recurso canônico
→ atributos de atribuição/estado/finalidade/audiência/versão/feature flag
→ gateway/RPC/RLS/Storage
```

Qualquer passo ausente, desconhecido ou divergente nega. Claims antigas de papel/membership no JWT podem auxiliar cache, mas não autorizam operação sensível nem drain offline sem revalidação atual.

## Fontes de autoridade e enforcement

| Dado decisório | Fonte autoritativa | Enforcement |
|---|---|---|
| ator/sessão | provedor de identidade validado e `auth.uid()` | gateway/Worker e RPC |
| membership/papel | `organization_memberships` ativa | gateway/RPC dentro da transação |
| capability | catálogo versionado + grants ativos | motor de policy server-side |
| tenant/owner do recurso | linha/relação canônica persistida | RPC e RLS `USING`/`WITH CHECK` |
| atribuição/estado/finalidade/versão | agregado canônico | policy de domínio na mutação/leitura |
| audiência pública | versão compartilhada + token opaco | gateway público/Storage |
| feature flag | configuração server-side por organização | gateway/RPC; UI não é autoridade |

`actor_user_id`, `organization_id`, papel, capacidade, owner e audiência enviados no body/path são dados não confiáveis. Podem ser intenção de navegação, nunca decisão de autorização.

## Papéis default e capacidades

Defaults iniciais: `owner`, `admin`, `manager`, `technician`, `viewer`. Aprovador externo usa token/escopo de uma versão documental e não recebe membership interna por padrão.

Capacidades são códigos explícitos, por exemplo:

- `organization.manage`;
- `members.manage`;
- `clients.read|write`;
- `jobs.dispatch|execute`;
- `pricing.private.read`;
- `quotes.draft|publish|discount`;
- `documents.internal.read|approve|share`;
- `evidence.upload|read`;
- `pmoc.plan.manage|task.execute`;
- `data.export`.

A matriz inicial está em `RBAC_AND_DATA_MATRIX.md`; ela é baseline de teste, não configuração final sem validação de campo.

## Invariantes

1. `actor_user_id` nunca vem do body autoritativo.
2. `organization_id` do comando é revalidado contra membership ativa.
3. Toda relação crítica pertence à mesma organização.
4. Owner não representa funcionário nem apaga autoria individual.
5. Membro revogado perde autorização no servidor, inclusive para comando offline antigo.
6. Técnico não vê custo/margem por default e não promove a si mesmo.
7. Documento aceito não pode ser alterado por papel algum; retificação é outra ação/capacidade.
8. Link público possui escopo mínimo de recurso/versão/ação, expira e revoga.
9. `service_role` só opera depois de autorização explícita e auditável.
10. Cache/JWT de papel não é fonte única quando membership pode mudar.
11. Troca de organização é explícita por dispositivo e não move comando já criado para outro tenant.
12. Administração interna do SaaS não ganha acesso silencioso ao conteúdo operacional de tenants.

## RLS e funções

O catálogo de Onda 2 deve classificar tabelas/RPCs como expostas ou proibidas, aplicar grants mínimos e `REVOKE` de `PUBLIC` onde cabível. Toda tabela tenant-aware usa RLS deny-by-default e policies explícitas para SELECT/INSERT/UPDATE/DELETE, com `USING` e `WITH CHECK` coerentes. `storage.objects` recebe policies próprias por vínculo canônico; `service_role` permanece exclusivamente no backend/Worker e nunca aparece em app, browser, link público ou log.

Preferir `SECURITY INVOKER`. Exceções `SECURITY DEFINER` exigem:

- necessidade documentada;
- `search_path` controlado/vazio;
- nomes de schema qualificados;
- `REVOKE PUBLIC` e grants mínimos;
- ator derivado de `auth.uid()` quando aplicável;
- validação de tenant/recurso dentro da transação;
- logs sanitizados e testes por papel.

Administração interna `admin_memberships` não concede leitura de tenant. Break-glass futuro exige justificativa, recurso/tenant mínimo, aprovação definida, expiração curta e evento auditável. Respostas públicas para ID inexistente, ID de outro tenant e token inválido devem ser indistinguíveis; o motivo detalhado fica somente em código interno sanitizado.

## Auditoria, kill switch e testes obrigatórios

Eventos mínimos: `authorization_denied`, `membership_invited`, `membership_role_changed`, `membership_revoked`, `resource_assignment_changed`, `document_publish_authorized`, `discount_approved`, `data_export_authorized`, `break_glass_requested` e `break_glass_expired`. Guardar IDs opacos, ator, organização, recurso/ação, policy version, resultado/código e timestamp; nunca conteúdo, segredo, token, custo/margem ou PII desnecessária.

Kill switches são por organização/agregado (`v2_commands_enabled`, `v2_public_share_enabled`, `v2_support_break_glass_enabled`), server-side, com owner operacional, motivo, expiração/revisão e métrica. Desligar flag bloqueia novas ações, mas não desliga RLS/auditoria, não amplia grants e não reabre writer V1 incompatível.

Antes de piloto, testes executáveis devem cobrir owner, admin, manager, técnico atribuído, técnico não atribuído, viewer, revogado, outsider e usuário A+B, incluindo:

- adulteração de `organization_id`, `actor_user_id`, papel, owner, audiência, capability e `expected_version`;
- técnico tentando ler custo/margem, publicar orçamento, promover-se, revogar owner, autoatribuir-se ou exportar;
- mudança de organização entre enqueue/drain: comando mantém tenant original e revalida membership atual;
- chamada direta a tabela, RPC e `storage.objects`; `SECURITY DEFINER` sem requisito; tentativa de usar `service_role` no cliente;
- token externo válido sem enumeração de cliente, custo, evidências internas ou outros documentos;
- revogação entre intenção/confirmação de upload e entre enqueue/drain;
- papel/policy desconhecido, membership ausente e recurso de outro tenant negados fail-closed.

## Alternativas rejeitadas

- **Owner como tenant permanente:** confunde empresa, autoria e permissão; impede multiempresa correto.
- **RBAC apenas por nome do papel:** não cobre atribuição, estado, recurso, versão e finalidade.
- **Autorização somente na UI:** facilmente contornável por cliente alterado/requisição direta.
- **Confiar somente no JWT para membership:** revogação pode ficar atrasada.
- **Confiar somente em RLS:** endpoints `service_role` e regras de domínio precisam de autorização própria.
- **Uma conta por empresa:** quebra técnicos/gestores multiempresa e administração legítima.
- **Matriz totalmente customizável no primeiro corte:** aumenta complexidade e risco sem evidência de necessidade.

## Rollout

1. fixtures/contratos de capacidade e atores sintéticos;
2. tabela de decisão e testes negativos locais;
3. migrations aditivas em banco efêmero;
4. policies/functions e harness owner/admin/manager/tech/viewer/revoked/multi/outsider;
5. gateway de comandos para cliente/local;
6. shadow read sem alterar comportamento;
7. piloto por organização/agregado com feature flag;
8. validação real somente após catálogo remoto autorizado.

## Rollback

- kill switch interrompe novos comandos V2;
- V1 continua writer antes do cutover;
- memberships/capacidades novas não são apagadas para mascarar falha;
- policy defeituosa é corrigida por migration forward revisada;
- revogação e audit trail permanecem;
- agregado cortado não volta a writer V1 sem reconciliação/compatibilidade comprovadas.

## Consequências

Positivas:

- isolamento explícito por empresa;
- funcionários com acessos proporcionais;
- comando offline seguro após revogação;
- políticas testáveis e auditáveis;
- base para agenda/equipe/PMOC/analytics.

Custos:

- mais tabelas, policies e testes;
- gestão explícita de organização ativa;
- necessidade de gateway uniforme entre mobile, web e Worker.

## Gates antes de produção

- catálogo real de schema/policies/functions/grants, somente leitura;
- backfill sem órfão inexplicado;
- testes positivos/negativos por tabela/RPC/storage;
- dois dispositivos, duas organizações e usuário multiempresa;
- revogação, convite, troca de papel e recuperação de acesso;
- auditoria de `SECURITY DEFINER`/service_role;
- revisão de privacidade e suporte operacional;
- migration/rollback ensaiados em banco efêmero;
- autorização explícita para qualquer escrita remota.
- todos os testes acima executáveis e verdes em banco efêmero com fixtures sintéticas;
- nenhuma credencial, dado real, policy/migration remota ou produção antes do gate humano correspondente.
