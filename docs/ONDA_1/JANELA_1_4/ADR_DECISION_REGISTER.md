# Registro de decisão — reconciliação ADR-001 a ADR-007

Data: **2026-08-28**  
Estado: **arquitetura local reconciliada; laboratório da Onda 2 autorizado; aceitação operacional condicionada**

## Regra de leitura

- `ADOTADO-ARQUITETURA`: decisão usada para construir/testar localmente.
- `PENDENTE-PROVA`: direção mantida, mas precisa de evidência antes de runtime/ambiente autorizado.
- `BLOQUEADO`: ação externa/irreversível não autorizada nesta janela.

Nenhum status abaixo transforma fixture/local em prova de produção.

## ADRs anteriores

| ADR | Adotado para arquitetura | Pendente de prova | Bloqueado nesta janela |
|---|---|---|---|
| ADR-001 — ponte de tenancy | `organization_id` canônico V2; ator da sessão; organização ativa como contexto; co-tenancy; membership/capacidade revalidadas; migration aditiva; owner legado preservado na ponte | catálogo real de tabelas/policies/grants; backfill sem órfão; constraints/RPCs; RLS; dois tenants/dispositivos; usuário multiempresa; rollback; matriz final de capacidades | migration remota; `NOT NULL`/cutover real; remover `donos_visiveis()`/legado; alterar agregado de produção |
| ADR-002 — sync/outbox | comando versionado; idempotência; outbox SQLite; reautorização no drain; conflito explícito; blobs fora; retry/backoff; contrato comum mobile/web/Worker | comparação com `cloudSync`; banco efêmero; projeção V2→V1; retenção/expurgo; concorrência/dispositivos; métricas/restore | provider/protocolo externo sem ADR; outbox V2 em produção; trocar writer real; migrar todos os módulos |
| ADR-003 — V1/V2 | fatias verticais; V1 fallback temporário; V2 por flags; um writer/agregado; shadow read; projeção compatível; dupla escrita invisível proibida | paridade mobile/web; projeção ordenada/idempotente; divergência; piloto; clientes antigos; critérios de remoção; rollback | cutover real; remover writers/leitores V1; rollout amplo; encerrar janela de rollback |

## ADRs desta janela

| ADR | Estado local | Provas já existentes | Provas/gates restantes |
|---|---|---|---|
| ADR-004 — documentos/storage/assinatura | `ADOTADO-ARQUITETURA` | fixture J1.3 de schema/hash/aceite/recusa/retificação; catálogo J1.2 | storage/digest bytes/RLS/MIME/scan/retention; jurídico/RT; provider/certificado; aparelho/web |
| ADR-005 — autorização | `ADOTADO-ARQUITETURA` | fixture J1.3 de papéis/revogação/read isolation/outbox | catálogo/RLS/RPC/service_role; backfill; dois tenants/dispositivos; matriz de campo; rollback |
| ADR-006 — preço/analytics | `ADOTADO-ARQUITETURA`; cross-org `BLOQUEADO` | fixture J1.3 de cálculo privado/projeção pública/allowlist | calculadora runtime; qualidade; LGPD/finalidade/coorte/reidentificação/consentimento antes de cross-org |
| ADR-007 — IA/egress | `ADOTADO-ARQUITETURA`; dado real `BLOQUEADO` | fixture J1.3 de DTO reduzido/provider determinístico/decisão humana | adapter oficial sandbox; injection/egress/logs/quota/circuit; privacidade; autorização antes de dado real |

Os ADRs 004–007 estão na versão 1.1. A revisão adversarial foi incorporada com escopo/não-escopo/dono, fontes de autoridade, enforcement, comportamento fail-closed, auditoria mínima, kill switches, rollback preservando trilha e listas de testes executáveis. Isso fecha o P0 documental; a prova de implementação permanece pendente na Onda 2 local.

## Decisão consolidada

1. **GO:** arquitetura local da Janela 1.4 encerrada após manifesto/validador verdes e revisão independente incorporada.
2. **GO:** iniciar Onda 2 apenas em schemas, código local, fixtures sintéticas e banco efêmero, começando por organização → cliente → local → comando idempotente.
3. **NO-GO:** integrar os spikes diretamente ao runtime.
4. **NO-GO:** migration/deploy/storage/provider/dado real sem gates e autorização próprios.
5. **NO-GO:** benchmark entre empresas, assinatura qualificada ou conformidade regulatória por alegação.

## Critério de promoção operacional

Um ADR só muda de direção local para aceitação operacional quando suas provas pendentes estiverem registradas com ambiente, comando/teste, resultado, rollback e responsável. A promoção de um ADR não promove automaticamente os demais.
