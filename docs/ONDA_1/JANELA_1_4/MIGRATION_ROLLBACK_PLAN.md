# Plano de migration, convivência e rollback V1 → V2

Estado: **plano local; nenhuma migration aplicada**

## 1. Invariantes de mudança

1. Toda alteração começa aditiva e compatível.
2. Um agregado possui um único writer oficial por organização/fase.
3. V1 não pode sobrescrever agregado cortado para V2.
4. Shadow read mede divergência sem mudar resultado do usuário.
5. Backfill ambíguo para e gera relatório; não escolhe tenant por heurística silenciosa.
6. Documento/evidência aceitos nunca são apagados para executar rollback.
7. Feature flag possui owner, escopo, data, kill switch e critério de remoção.
8. A migração precisa ser ensaiada em banco efêmero sintético antes de qualquer ambiente remoto.

## 2. Fases

### Fase 0 — catálogo e baseline

- obter catálogo autorizado de tabelas, colunas, índices, policies, functions, triggers, grants e storage;
- mapear `user_id`/owner atual para organizações existentes;
- contar órfãos, duplicidades e referências inconsistentes;
- congelar métricas de baseline: contagens por tabela, checksums lógicos e testes de isolamento;
- escrever rollback e queries de reconciliação antes da migration.

Gate: somente leitura; qualquer discrepância material volta para arquitetura.

### Fase 1 — expansão aditiva

- criar/normalizar `organizations` e `organization_memberships` sem remover o legado;
- adicionar `organization_id` nullable e `version` aos agregados priorizados;
- adicionar tabelas V2 de comando, idempotência, documentos, versões e eventos;
- criar índices e constraints compatíveis com a carga;
- não ligar novos writers.

Gate: migration aplica e reverte em banco efêmero; V1 continua funcional.

### Fase 2 — backfill verificável

- preencher `organization_id` somente quando o mapeamento for inequívoco;
- registrar cada exceção e não avançar com órfão sem decisão explícita;
- validar relações de co-tenancy;
- comparar contagens/checksums antes e depois;
- repetir de modo idempotente sem alterar resultado já correto.

Gate: zero órfão inexplicado no escopo piloto e relatório assinado pela revisão técnica.

### Fase 3 — políticas e gateway V2 em shadow

- criar funções/RPCs que derivem ator da sessão e validem membership/capacidade/recurso;
- RLS com `USING` e `WITH CHECK` por organização;
- `SECURITY DEFINER` somente quando inevitável, com `search_path` controlado, nomes qualificados, `REVOKE PUBLIC` e grants mínimos;
- habilitar shadow read e comparar projeções V1/V2;
- nenhum resultado shadow altera UI ou dado.

Gate: testes positivos/negativos com owner, admin, técnico, viewer, revogado, outsider e usuário multiempresa.

### Fase 4 — piloto por organização/agregado

- ligar feature flag somente para organização sintética/piloto aprovada;
- começar pela espinha `organization → client → location`;
- executor V2 torna-se único writer desse agregado no escopo piloto;
- o mesmo executor produz a projeção compatível para leitores V1;
- cliente V1 tenta escrever agregado migrado: gateway adapta ou rejeita com atualização necessária;
- observar idempotência, conflito, rejeição, divergência e latência.

Gate: dois dispositivos, duas organizações, rede intermitente, revogação e rollback ensaiados.

### Fase 5 — prova comercial documental

- orçamento existente gera snapshot `quote` versionado;
- HTML/PDF deriva somente do snapshot;
- aceite se liga ao hash/versão e preserva cópia;
- uma evidência privada pode ser referenciada sem bytes na outbox;
- V1 permanece fallback de leitura conforme a matriz de writer.

Gate: testes mobile/web, adulteração, repetição, revogação e retificação.

### Fase 6 — cutover e contração

- ampliar agregado por agregado somente após métricas verdes;
- tornar `organization_id` obrigatório quando o backfill estiver comprovado;
- remover writers V1, depois leitores V1, em releases separadas;
- remover colunas/paths legados apenas após janela de retenção e rollback aprovada;
- preservar trilha, versões, comandos e chaves de idempotência pelo prazo aplicável.

Gate: não existir cliente suportado que dependa do caminho removido.

## 3. Rollback por fase

| Fase | Ação de rollback | Preservação obrigatória |
|---|---|---|
| expansão | desabilitar objetos/flags V2; reverter migration somente se não houver dado V2 | schema/dados V1 |
| backfill | corrigir por migration compensatória; nunca `DELETE` amplo | relatório de exceções e trilha |
| shadow | desligar comparação/telemetria | divergências observadas |
| piloto | desligar novos comandos V2; reconciliar pendentes; V1 apenas se ainda for writer oficial daquele agregado | comandos, resultados, versões e documentos |
| documento | bloquear novos aceites e manter leitura | snapshots, hashes, eventos e evidências |
| cutover | migration forward de correção; não retornar a writer obsoleto sem compatibilidade provada | consistência canônica e audit trail |

## 4. Kill switches

- `v2_tenancy_enabled` por organização;
- `v2_commands_clients_locations` por organização;
- `v2_document_kernel_quote` por organização;
- `v2_acceptance_enabled` por organização;
- `ai_suggestion_enabled` por caso de uso;
- `analytics_cross_org_enabled` permanece `false` até política e gate próprios.

Cada flag precisa registrar owner, motivo, criado em, expira em, métrica, rollback e release mínima.

## 5. Evidência de aceite antes de ambiente real

- migrations forward/backward em Postgres efêmero;
- fixtures com owner A, técnico A, outsider, revogado e usuário membro de A+B;
- contagens/checksums sem órfão inexplicado;
- teste cross-tenant para cada tabela/RPC/Storage policy;
- idempotência com a mesma chave repetida dez vezes e payload divergente;
- conflito de `expected_version` visível;
- app fechado/reaberto com comando pendente;
- rollback preserva documentos, eventos e comandos;
- logs sem PII/conteúdo sensível;
- relatório de compatibilidade mobile/web/V1.

## 6. Gates humanos/externos

- acesso autenticado ao catálogo remoto;
- janela de migration/deploy;
- decisão sobre registros ambíguos;
- teste em aparelho físico e duas organizações;
- aprovação de privacidade/retenção;
- revisão jurídica/RT para documentos regulados;
- autorização específica para produção.
