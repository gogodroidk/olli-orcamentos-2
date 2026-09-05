# Onda 1 — Janela 1.4: arquitetura de passagem para produção

Data: **2026-08-28**  
Estado: **ARQUITETURA LOCAL COMPLETA — GO PARA SCHEMAS/FIXTURES DA ONDA 2; RUNTIME CONTINUA NO-GO**  
Repositório: `C:\OLLI_REL`

## Resultado desta fatia

Esta fatia transforma as evidências das Janelas 1.1, 1.2 e 1.3 em contratos de arquitetura para a Onda 2. Ela não integra os spikes ao produto e não autoriza migration, storage, provider externo, deploy ou produção.

Decisões de direção já sustentadas pela evidência local:

1. `organization_id` será o tenant canônico da V2; ator e autorização serão derivados/revalidados no servidor.
2. Postgres será a fonte empresarial canônica e SQLite continuará como réplica operacional offline-first.
3. V1 permanece writer oficial até o cutover explícito de cada organização/agregado; dupla escrita invisível é proibida.
4. Documento aprovado ou aceito é um snapshot imutável, versionado e ligado a um hash; correção cria nova versão.
5. Evidências ficam em storage privado e são referenciadas por metadados/digest; bytes não trafegam na outbox.
6. Precificação V1 usa somente dados da própria organização e regras determinísticas; benchmark entre empresas permanece bloqueado.
7. IA é assistiva: DTO allowlistado, provider intercambiável, fallback determinístico e confirmação humana.
8. A primeira entrega da Onda 2 será dividida em espinha de tenancy e prova comercial documental, ambas atrás de feature flag.

## Fontes de evidência

- `../JANELA_1_1/TENANCY_SYNC_INVENTORY.md`;
- `../JANELA_1_1/ADR-001-PONTE-TENANCY.md`;
- `../JANELA_1_1/ADR-002-SYNC-OUTBOX.md`;
- `../JANELA_1_1/ADR-003-CONVIVENCIA-V1-V2.md`;
- `../JANELA_1_2/DOCUMENT_CATALOG.md`;
- `../JANELA_1_2/REGULATORY_GATES.md`;
- `../JANELA_1_3/RESULTS.md`;
- `../JANELA_1_3/SECURITY_REVIEW.md`;
- `../JANELA_1_3/DECISION_JANELA_1_4.md`;
- `../../TARGET_ARCHITECTURE.md`.

## Artefatos desta fatia

| Artefato | Conteúdo | Estado |
|---|---|---|
| `ARCHITECTURE_CONTRACTS.md` | domínios, dados, fronteiras de confiança, documentos, storage, preço e IA | concluído |
| `RBAC_AND_DATA_MATRIX.md` | papel × recurso × ação e classificação de dados | concluído para arquitetura; papéis finais exigem pesquisa de campo |
| `MIGRATION_ROLLBACK_PLAN.md` | expansão, backfill, shadow, piloto, cutover e rollback | concluído como plano; não executado |
| `FIRST_VERTICAL_SLICE.md` | espinha de tenancy e orçamento → documento → aceite | concluído como contrato/DoD |
| `THREAT_MODEL_AND_TESTS.md` | ameaças e testes negativos obrigatórios | concluído como plano de prova |
| `ADR-004-DOCUMENT-KERNEL-STORAGE-SIGNATURE.md` | kernel documental, hash, storage, aceite e retenção | direção local v1.1; runtime NO-GO |
| `ADR-005-AUTHORIZATION-RBAC-ABAC.md` | fluxo de autorização, RLS/RPC/Storage e revogação | direção local v1.1; runtime NO-GO |
| `ADR-006-PRICING-ANALYTICS-PRIVACY.md` | cálculo reprodutível, projeção pública e privacidade | direção local v1.1; cross-org NO-GO |
| `ADR-007-AI-PROVIDER-EGRESS.md` | porta de IA, egress, quota, fallback e aprovação humana | fixture local permitida; egress real NO-GO |
| `ADR_DECISION_REGISTER.md` | reconciliação dos ADRs 001–007 e limites probatórios | concluído |
| `artifact.json` | manifesto machine-readable, decisões, gates e checksums | gerado e validado localmente |
| `validate-artifact.mjs` | verificação determinística do manifesto e dos termos normativos | concluído |
| `GATE_DECISION.md` | decisão de passagem e pendências | GO Onda 2 local/fixture; runtime NO-GO |

## O que permanece pendente depois do fechamento local

- transformar os testes normativos dos ADRs em schemas, fixtures e suites executáveis do Incremento A;
- escrever migration draft aditiva e rollback, aplicando-os somente em banco efêmero sintético;
- catálogo autorizado do banco real, sem escrita, para validar tabelas/policies/functions/grants;
- aprovação humana da matriz de papéis e capacidades após pesquisa de campo;
- revisão jurídica/privacidade/RT dos pontos explicitamente marcados;
- storage/provider/egress/dado real apenas após gates e autorização específicos;
- migration, deploy e produção permanecem bloqueados.

A revisão adversarial independente foi incorporada: fonte de autoridade, enforcement, fail-closed, auditoria mínima, kill switches, rollback e testes positivos/negativos agora são normativos nos ADRs 004–007. A existência dos textos não substitui a execução das suites na Onda 2.

## Limites probatórios

Os arquivos desta janela descrevem uma arquitetura alvo e critérios de prova. Eles não demonstram que RLS, storage, autenticação, assinatura, IA ou produção já tenham esses controles. Nenhum dado real, secret, serviço externo ou ambiente de produção foi usado nesta fatia.
