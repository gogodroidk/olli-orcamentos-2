# Módulo PMOC — Spec executável (fundação + mapa)

> **Status:** FUNDAÇÃO. Nenhuma parte deste módulo está aplicada ou implementada.
> A migration `supabase/migrations/20260709_pmoc_fundacao.sql` é um esqueleto
> **NÃO-aplicado** (entra no track PMOC pós-ciclo-comercial). Este doc é o mapa
> executável: o que **nós vamos realmente construir** (não a lista crua da pesquisa),
> em que ordem, e as regras de segurança/legais que não são negociáveis.

Fontes da pesquisa (leitura de base, já decantada aqui): `PESQUISA_PMOC_COMPLETA_OLLI.md`,
`PESQUISA_APROFUNDADA_FERRAMENTAS_OLLI_V2_PMOC.md`, `PROMPT_MESTRE_OLLI_V3_PMOC.md`.
A pesquisa lista ~90 tabelas "ideais". **Nós não vamos criar 90 tabelas.** Este doc
escolhe o subconjunto que faz sentido para a nossa stack (SQLite local + Supabase RLS
multi-tenant por camada de acesso) e joga o resto para `dados jsonb` versionado até a
demanda real justificar promover um campo a coluna/tabela.

---

## 1. O que o PMOC é para nós

Um vertical HVAC grande que transforma o Olli de "app de orçamento" em plataforma
operacional. A cadeia de valor:

```
cliente → contrato → local → sistema HVAC → equipamento (asset+QR)
        → plano PMOC vigente → periodicidades → ordem de serviço
        → execução em campo (offline) → evidências/leituras
        → não conformidade → ação corretiva → relatório → faturamento → renovação
```

O que ele **não é** (veredito da pesquisa, adotado): não é um PDF isolado, nem um
checklist mensal, nem um campo dentro da OS, nem uma agenda recorrente sem inventário,
nem um QR que abre página genérica. A etiqueta QR é a **porta física**; o contrato é o
motor financeiro; o plano é o motor técnico; a OS é a execução; o histórico é o ativo
de longo prazo.

---

## 2. Decisões de arquitetura para a NOSSA stack

Estas são decisões firmadas (não repetição da pesquisa):

1. **Multi-tenant por camada de acesso, não por `organization_id` nas linhas.**
   Seguimos a decisão da Onda 2 (`20260707_multitenant.sql`): os dados PMOC são do
   **OWNER** (`user_id` = dono). A equipe ativa enxerga/escreve via
   `public.donos_visiveis()` (SECURITY DEFINER, `search_path=''`). Isso mantém o
   single-tenant intacto (dono sozinho vê exatamente o que via) e reusa toda a
   infra de RLS/convites/papéis já testada. **Não** introduzimos `organization_id`
   em nenhuma tabela de dados — seria uma segunda fonte de verdade de tenancy.

2. **PK `text` gerada no app + `user_id default auth.uid()`.** Igual a
   `orcamentos`/`orcamento_versoes`: ids estáveis entre aparelhos, upsert idempotente,
   offline-first via SQLite espelhando as mesmas colunas. Sync = last-write-wins com
   `atualizado_em`, exceto onde há imutabilidade (versões assinadas/aprovadas).

3. **`jsonb dados` versionado para o detalhe fino, colunas só para o que se filtra.**
   A pesquisa quer `contract_slas`, `contract_billing_rules`, `pmoc_frequency_rules`,
   `pmoc_procedure_templates` etc. como tabelas. Na fundação, o **snapshot** do
   contrato/plano mora em `*_versions.dados` (jsonb). Promovemos a coluna/tabela
   **quando** a UI precisar filtrar/ordenar por aquele campo (ex.: "contratos com
   reajuste vencendo" vira coluna indexada; "passo 7 do procedimento" fica no jsonb).
   Regra: **coluna = você filtra/ordena por ela; jsonb = você só a exibe/edita inteira.**

4. **Referências SOFT (id-texto sem FK dura) para cliente/local.** `clientes` é do
   app/SQLite e a Onda 3 mexe nesse território. Não criamos FK `assets.cliente_id →
   clientes.id` para não acoplar a fundação a uma tabela em movimento. Integridade
   referencial fica a cargo do app + testes; o banco protege por RLS/tenant.

5. **Nada de OS/agenda/qualidade-do-ar na fundação.** Essas dependem do app do técnico
   e do ciclo comercial. A fundação entrega só o **núcleo estável**: ativos+QR,
   contratos versionados, planos versionados. Ver §5 (sequenciamento).

6. **Imutabilidade do assinado é regra de banco, não de app.** Trigger
   `pmoc_bloquear_versao_congelada` barra UPDATE do snapshot depois de
   `assinado_em`/`aprovado_em`. Um app com bug não consegue reescrever um contrato
   assinado. `user_id` imutável reusa a trigger `bloquear_troca_user_id` da Onda 2.

---

## 3. Entidades que VAMOS criar (fundação)

O esqueleto `20260709_pmoc_fundacao.sql` cria exatamente estas 7 tabelas. Justificativa
de cada uma e o que fica de fora (por ora):

| Tabela | Papel | O que mora aqui | O que fica em `dados`/fase futura |
|---|---|---|---|
| `assets` | Equipamento HVAC | id, cliente/local (soft), fabricante/modelo/série, categoria, capacidade_btu, tensão, refrigerante, localização curta, situação (ciclo de vida), criticidade, **qr_token opaco único** | components, relationships, meters, warranties, photos, manuals → tabelas próprias na fase inventário |
| `asset_qr_tokens` | Histórico de QR | token emitido, emitido_em, revogado_em, motivo | rotação automática/expiração agendada |
| `qr_scan_events` | Auditoria de scan | asset_id, resolvido, ip_hash (nunca IP cru), UA | analytics agregada de scans |
| `service_contracts` | Cabeçalho do contrato | número, situação, vigência, renovação, versão_vigente | sites/assets/services como tabelas na fase contrato |
| `service_contract_versions` | Versões imutáveis | numero_versao, `dados` (escopo+SLA+comercial+anexos), assinado_em, assinatura_meta | promover SLA/billing a colunas quando houver painel de rentabilidade |
| `pmoc_plans` | Cabeçalho do plano | número, situação (operacional), versão_vigente | plan_sites/systems/assets como tabelas na fase plano |
| `pmoc_plan_versions` | Versões imutáveis | numero_versao, `dados` (inventário+procedimentos+periodicidades+referências), responsável_técnico, doc_responsabilidade, aprovado_em | procedure_templates e frequency_rules como tabelas na fase recorrência |

**Fora da fundação, entram fase a fase (ver §5):** `hvac_systems`, `asset_photos/documents/
manuals/warranties/meters/components/relationships`, `service_locations` (locais/unidades),
`work_orders` + execução, `nonconformities` + `corrective_actions`, qualidade do ar
(`air_*`, `sampling_*`, `laboratory_reports`, `reference_limits` versionadas),
responsabilidade técnica (`technical_responsibles`, `professional_registrations`),
etiquetas/impressão (`label_templates`, `label_print_batches`), documentos gerados
(`generated_documents` + hash). A pesquisa cataloga ~90 tabelas; a fundação são 7. O
resto é backlog priorizado, não schema morto.

---

## 4. Segurança do QR (regras firmes — implementação no worker)

O QR é a superfície pública do módulo. Regras adotadas da pesquisa e ancoradas na nossa
infra (worker Cloudflare já serve `/o/<token>` para orçamentos — o PMOC ganha `/q/<token>`):

- **Token opaco, aleatório, servidor.** `assets.qr_token` nasce de
  `gen_random_bytes(24)` em base64url (~32 chars, sem `+`/`/`/`=`). **Nunca** sequencial,
  **nunca** derivado do id. URL: `https://<dominio>/q/<token>`. **Não** existe
  `/equipamento/1` — anti-enumeração por construção.
- **Revogação e rotação.** `assets.qr_revogado_em` desliga o token vigente; a página
  pública nega tokens revogados/inexistentes com resposta idêntica (não distingue
  "não existe" de "revogado" → não vaza existência). Rotação = gera novo `qr_token`
  + registra o antigo em `asset_qr_tokens` com `revogado_em`+`motivo`.
- **Expiração opcional.** Fundação não força expiração (etiqueta física dura anos), mas
  o worker pode aplicar TTL por organização se configurado. Decisão de produto, não de
  schema.
- **Rate limit + anti-enumeração.** O worker limita tentativas por origem numa janela
  curta usando `ip_hash` (hash+salt truncado do IP, **nunca o IP cru** — LGPD).
  `qr_scan_events` registra cada scan (resolvido ou não) para detectar varredura.
  Tokens de 24 bytes tornam brute-force inviável; o rate limit é defesa em profundidade.
- **Página pública mínima.** Sem login, mostra só: código do equipamento, nome do
  prestador, telefone de suporte, situação básica e (se autorizado) botão "abrir chamado".
  **Nunca**: histórico, documentos, leituras, dados do cliente, contrato, margem, token
  legível, dados do responsável técnico. Dados internos exigem login (RLS decide o resto).
- **Segredos.** Zero segredo no cliente/adesivo. O que vai no adesivo é o texto do §17 da
  pesquisa (código, tipo, localização curta, telefone, QR, próxima manutenção) — nunca
  CPF/CNPJ integral, preço, contrato, token legível ou credencial.
- **Escrita de scan só server-side.** `qr_scan_events` não tem policy de INSERT para
  `authenticated`; só o worker (service_role, RLS off) grava. O gestor **lê** os scans dos
  seus ativos via RLS (`user_id in donos_visiveis()`); scans órfãos (enumeração, `user_id`
  null) ficam invisíveis a todos exceto investigação server-side.

---

## 5. Sequenciamento PMOC 0–8 mapeado nas NOSSAS ondas

A pesquisa define fases PMOC 0–8. Nós as encaixamos **depois** do que já está em curso
(ciclo comercial da Onda 3), respeitando a dependência real: PMOC precisa de OS e do app
do técnico antes de virar execução de campo. Ordem adotada:

| Fase PMOC | O que entrega | Depende de (nosso) | Quando |
|---|---|---|---|
| **PMOC 0 — auditoria** | ADR PMOC, este doc, o esqueleto SQL, decisão de sync do jsonb | — | **agora (esta entrega)** |
| **PMOC 1 — inventário + etiqueta** | `assets`+QR aplicados, `service_locations`, scanner no app, template A4 (parcial-folha), ficha do equipamento | Onda 3 (ciclo comercial) fechada | Track PMOC, sprint 1 |
| **PMOC 2 — plano + recorrência** | `pmoc_plans`/versões aplicados, biblioteca de procedimentos, frequências (regra combinada "a cada X OU Y horas"), geração de ordens recorrentes | **OS existir** (Onda de OS) | Track PMOC, sprint 2 |
| **PMOC 3 — execução** | checklist offline, leituras, fotos antes/depois, assinatura, materiais, relatório de visita | **App do técnico** (offline-first reforçado) | Track PMOC, sprint 3 |
| **PMOC 4 — contrato** | `service_contracts`/versões aplicados, SLA/billing promovidos a colunas, reajuste, renovação, margem realizada | Financeiro operacional (Onda 8) | Track PMOC, sprint 4 |
| **PMOC 5 — não conformidades** | `nonconformities`+`corrective_actions`, orçamento a partir da NC (integra com ciclo comercial) | Ciclo comercial + execução | Track PMOC, sprint 5 |
| **PMOC 6 — portal PMOC** | cliente vê ativos/visitas/docs/NCs liberadas, aprova corretiva | Portal do cliente (Onda 3) estendido | Track PMOC, sprint 6 |
| **PMOC 7 — qualidade do ar** | amostragem, laboratório parceiro, instrumentos+calibração, `reference_limits` versionadas | Execução + documentos | Track PMOC, sprint 7 |
| **PMOC 8 — inteligência** | dashboards de cobertura/execução/qualidade, IA (OCR de placa, resumo), predição | Tudo acima | Track PMOC, sprint 8 |

**Pré-requisito duro:** o PMOC roda **em paralelo/depois** da Onda 3 (guarda-chuva). Esta
entrega é PMOC 0 — não toca nos arquivos da Onda 3 (worker/src/link.js, VisualizarOrcamento,
clienteLink, pagamentos, EmitirRecibo, OrcamentosScreen, database.ts, types/index.ts,
migrations `20260708_*`).

---

## 6. Caveat legal (inegociável)

Ancorado no §2 "Regra inegociável" da pesquisa e na regra de ouro 16.3 do prompt mestre:

- **O Olli NUNCA declara conformidade legal automática.** Nenhuma coluna/estado do schema
  significa "está de acordo com a Lei 13.589/2018", a Portaria GM/MS 3.523/1998 ou a
  RE 9/2003 da Anvisa. `pmoc_plans.situacao` é **operacional** (rascunho/vigente/…), não
  jurídica. `aprovado_em`/`assinado_em` são aprovação **técnica** do responsável habilitado,
  não certificado de conformidade emitido pelo software.
- **Referências, periodicidades e limites são DADOS versionados e configuráveis**, nunca
  constantes de código. Moram em `pmoc_plan_versions.dados` (referências normativas com
  fonte/edição/vigência) e, na fase qualidade do ar, em `reference_limits` versionada
  (fonte, edição, vigência, parâmetro, limite, autor da config, aprovação técnica). Toda
  referência exibe origem e data.
- **A IA nunca assina, certifica, declara conformidade, altera periodicidade vigente,
  aprova plano, fecha NC ou inventa leitura.** Ela sugere; o profissional confirma.
- **Avisos claros na UI:** telas de plano/relatório exibem que requisitos legais e técnicos
  precisam de validação do responsável profissional habilitado e, quando necessário, de
  assessoria jurídica. O software é ferramenta de planejamento, controle, registro,
  evidência, versionamento, alerta, geração documental e auditoria — não de certificação.

---

## 7. Os 25 critérios de conclusão, adaptados à nossa realização

O módulo PMOC será considerado funcional quando cada item abaixo passar com evidência
(não "parece pronto"). Adaptado do §31 da pesquisa para a nossa stack e nomenclatura:

| # | Critério | Como validamos aqui | Fase |
|---|---|---|---|
| 1 | Criar contrato | `service_contracts` + UI; teste T7 do SQL | 4 |
| 2 | Versionar contrato | `service_contract_versions`, numeração única, assinado imutável (trigger + T7/T8) | 4 |
| 3 | Cadastrar unidade/local | `service_locations` (fase 1), soft-ref em `assets.local_id` | 1 |
| 4 | Cadastrar sistemas | `hvac_systems` (fase 1) agrupando assets | 1 |
| 5 | Importar equipamentos | CSV → `assets` com dedupe por (user_id, numero_serie/patrimonio) | 1 |
| 6 | Gerar etiquetas | `label_templates` + PDF A4 com impressão parcial-de-folha (começar na etiqueta 7) | 1 |
| 7 | Escanear QR | scanner no app resolve `/q/<token>` via worker; T1/T6 | 1 |
| 8 | Abrir ficha correta | ficha do equipamento a partir do QR (login) respeitando RLS | 1 |
| 9 | Criar plano | `pmoc_plans` + UI | 2 |
| 10 | Aprovar versão | `pmoc_plan_versions.aprovado_em` + trigger de imutabilidade (T9) | 2 |
| 11 | Gerar ordens recorrentes | motor lê plano vigente + frequências → OS futuras sem duplicidade | 2 |
| 12 | Executar offline | checklist/leituras/fotos no SQLite, fila de sync (reusa cloudSync) | 3 |
| 13 | Anexar evidência | fotos antes/depois vinculadas a asset+tarefa; sem reuso silencioso de foto | 3 |
| 14 | Registrar leituras | `inspection_readings` com faixa/resultado; faixas versionadas | 3 |
| 15 | Abrir não conformidade | `nonconformities` com severidade/status | 5 |
| 16 | Gerar corretiva | `corrective_actions` a partir da NC | 5 |
| 17 | Emitir relatório | relatório de visita/equipamento/contrato (PDF, hash) | 3–4 |
| 18 | Compartilhar com cliente | portal PMOC (estende portal da Onda 3) com permissão por doc | 6 |
| 19 | Calcular próxima visita | motor de recorrência recalcula pós-execução | 2–3 |
| 20 | Visualizar rentabilidade | painel do contrato (receita/custo/margem previsto vs realizado) | 4 |
| 21 | Controlar renovação | alerta de renovação/reajuste próximos | 4 |
| 22 | Gerar pacote documental | pacote de fiscalização selecionável (PMOC+inventário+evidências+laudos) | 4–7 |
| 23 | Respeitar permissões | RLS por `donos_visiveis()` + papéis; testes com 2 JWTs (T1–T10) | todas |
| 24 | Manter auditoria | `qr_scan_events`, versões append-only, `criado_por`, triggers de imutabilidade | 1+ |
| 25 | Não perder dados em sync | idempotência (PK text + upsert), tombstones, fila de falhas visível | todas |

Critérios 1–2, 7, 10, 23, 24 já têm a **base** de banco pronta e testável nesta fundação
(ver os testes SQL T1–T10 no rodapé da migration). O restante depende das fases.

---

## 8. Testes que já acompanham a fundação

A migration traz 10 blocos `-- TESTE: …` (T1–T10) para o integrador rodar com 2 JWTs
(dono A, técnico ativo B), no mesmo formato das migrations da Onda 2:

- **T1** QR nasce opaco/único/não-sequencial · **T2** zero vazamento entre tenants ·
  **T3** técnico ativo cria em nome do dono com autoria · **T4** `user_id` imutável ·
  **T5** QR globalmente único · **T6** revogação de QR · **T7** versão de contrato
  assinada é imutável (e não-assinada é reescrita pelo sync) · **T8** numeração de versão
  única · **T9** versão de plano aprovada é imutável · **T10** gestor vê só os scans dos
  seus ativos (órfãos de enumeração ficam ocultos).

Validação de sintaxe já feita: a migration passa no parser da gramática Postgres
(libpg_query) — 44 statements, sem erros. **Não aplicada** ainda: aguarda o track PMOC.
