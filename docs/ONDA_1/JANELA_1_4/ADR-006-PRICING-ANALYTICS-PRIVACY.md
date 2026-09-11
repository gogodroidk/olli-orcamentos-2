# ADR-006 — Precificação explicável, analytics e privacidade entre organizações

Status: **ACEITO COMO DIREÇÃO ARQUITETURAL LOCAL; RUNTIME E BENCHMARK COLETIVO NO-GO**  
Data: 2026-08-28  
Versão da decisão: **1.1**  
Dono: **Produto/Precificação**, com aprovação obrigatória de **Dados, Segurança e Privacidade/Jurídico** antes de analytics coletivo

## Contexto

O valor estratégico desejado é usar o histórico de orçamentos para alertar quando um preço parece baixo/alto e ajudar o prestador. Esse valor só é legítimo se custo/margem da empresa permanecerem privados, uma organização não puder ser identificada por outra, a qualidade estatística for demonstrada e a decisão final continuar humana.

A Janela 1.3 provou a separação fixture-only entre cálculo privado, projeção pública e sugestão allowlistada. Ainda não existe consentimento/base legal, coorte mínima, qualidade ou proteção contra reidentificação suficientes para analytics cross-tenant.

## Escopo, não-escopo e substituição

Escopo: contratos privado/público de precificação, cálculo reprodutível, ajuste humano, métricas internas minimizadas e gates de analytics cross-org.

Não-escopo: recomendação coletiva real, decisão automática de preço, cobrança/pagamento, regra tributária definitiva, dado real, endpoint/job cross-org ou ativação remota.

Dependências: ADR-004 para snapshot publicado, ADR-005 para autorização, ADR-007 para DTO de IA, taxonomia de serviços, política LGPD/retenção e feature flags server-side.

Substituição exige ADR versionado com compatibilidade de snapshots/regras, avaliação de viés/privacidade, migration/rollback e proibição de recalcular preço/documento histórico. Nenhuma regra nova reescreve o resultado aceito.

## Decisão

Separar quatro contratos:

1. `PricingInputPrivate`: custos, mão de obra, deslocamento, impostos, overhead, margem-alvo e restrições da própria organização;
2. `PricingResultPrivate`: preço/faixa calculados, decomposição, premissas, avisos e dados de qualidade;
3. `PricingExplanationPublic`: escopo, itens, quantidades, opções, preço, validade e premissas permitidas ao cliente;
4. `PricingSuggestion`: recomendação determinística/IA, versão, fonte, confiança, incerteza, premissas e posterior decisão humana.

Na primeira versão:

- cálculo usa somente dados da própria organização e regras determinísticas;
- moeda padrão é BRL; valores persistidos são inteiros em centavos; percentuais são basis points; arredondamento é `half-up` nos limites definidos pela regra;
- toda execução registra `pricing_rule_version`, inputs privados validados, resultado e timestamp, tornando o cálculo reproduzível;
- preço ausente ou entrada insuficiente permanece pendente, nunca vira zero ou média arbitrária;
- ajustes manuais exigem capability própria e registram autor, motivo, valor anterior/novo e versão;
- publicação congela a projeção pública e o resultado aplicável; regra futura não recalcula documento publicado/aceito;
- custo, margem, overhead, score e regra interna nunca entram em documento/link público nem no DTO padrão de IA;
- eventos de orçamento/publicação/aceite/edição/rejeição podem formar métricas internas minimizadas;
- analytics/benchmark entre organizações permanece desabilitado por design e feature flag.

Analytics coletivo somente poderá ser proposto depois de finalidade, base legal/consentimento, pseudonimização, comparabilidade, coorte mínima, proteção contra reidentificação, retenção/exclusão e qualidade estatística aprovadas. Este ADR não inventa um limiar numérico: a política deverá defini-lo e justificá-lo com especialista/evidência antes de qualquer recomendação real.

## Fontes de autoridade e enforcement

| Decisão | Fonte autoritativa | Enforcement |
|---|---|---|
| organização/ator/capability | sessão + membership/capability atual | gateway/RPC |
| inputs e regra | contrato privado validado + `pricing_rule_version` homologada | calculadora server-side/domínio |
| valor publicado | snapshot da `document_version` | comando de publicação/renderer |
| projeção pública | schema allowlistado | serializer/renderer/gateway público |
| métricas internas | eventos minimizados do próprio tenant | pipeline tenant-scoped |
| analytics cross-org | política, consentimento/opt-out, coorte e flag server-side | job/endpoint dedicado; ausente na V1 |

Campo, versão, política, consentimento ou amostra ausentes resultam em `pending/sem recomendação`; nunca há zero, média global ou liberação presumida. `analytics_cross_org_enabled=false` deve estar no servidor, sem endpoint/job/dataset exportável que misture empresas. Ocultar UI não é controle.

O comportamento é fail-closed: campo desconhecido, regra não homologada, versão divergente, autorização incompleta, scrubber indisponível ou política de analytics ausente bloqueiam cálculo/publicação/coleta conforme o caso e produzem estado explícito, nunca permissão presumida.

## Invariantes

1. Cálculo privado não vaza para projeção pública, logs, analytics ou provider não autorizado.
2. Dado de outra organização não entra na calculadora V1.
3. `analytics_cross_org_enabled` inicia e permanece `false` até gate próprio.
4. Sugestão não altera preço/documento sem evento humano explícito.
5. Preço indefinido permanece `null/pending`, não zero.
6. Toda sugestão registra versão, fonte, amostra aplicável, premissas, confiança/incerteza e decisão.
7. Ausência de amostra comparável suficiente produz “sem recomendação”.
8. Segmentos não podem criar coorte identificável por região/ofício/empresa única.
9. Exclusão/retificação respeita privacidade, retenção e auditabilidade.
10. O produto não usa “média da plataforma” como argumento comercial antes do gate estatístico/privacidade.
11. Custo, margem, overhead, score, desconto privado e regra de risco não entram em link, URL, cache, log, analytics, mensagem, exportação padrão ou DTO de IA.
12. Regra posterior não altera preço, explicação ou documento já publicado/aceito.
13. Observabilidade aceita apenas DTO allowlistado e scrubbed; evento não codifica conteúdo/PII no nome.

## Privacidade, auditoria, kill switch e testes

Cada categoria deve declarar finalidade, classificação, minimização, retenção, acesso, exportação, correção/exclusão e eventual preservação documental. Pedido de exclusão não apaga silenciosamente documento aceito/audit trail sujeito a retenção; a exceção precisa de política, justificativa e evento.

Eventos mínimos: `pricing_calculated`, `pricing_pending`, `pricing_manual_adjustment`, `pricing_public_projection_created`, `pricing_suggestion_reviewed`, `analytics_event_rejected`, `analytics_opt_out_changed` e `analytics_cross_org_disabled`. Guardar IDs opacos, versões, faixa/valores estritamente necessários, decisão/código e timestamp; não guardar endereço, contato, contrato, foto, áudio, assinatura, prompt ou objeto integral.

Kill switches `pricing_suggestion_enabled` e `analytics_cross_org_enabled` são server-side por organização/caso, com owner, motivo, expiração/revisão e métrica. Desligar analytics interrompe egress/coleta futura sem apagar trilha/documentos sujeitos a retenção.

Testes executáveis obrigatórios:

- mesma entrada/regra gera mesmo resultado; regra/centavo/percentual diferente muda de forma prevista; arredondamento e impostos/discounts respeitam a versão;
- regra posterior não muda orçamento/documento publicado ou aceito;
- ajuste sem autor, motivo, capability ou versão falha;
- alias/campo extra de custo, margem ou desconto é rejeitado do DTO público, de IA, cache, log e analytics;
- evento contendo telefone, endereço, nome, documento, foto, áudio, assinatura, prompt ou objeto integral é rejeitado/scrubbed;
- habilitar apenas a UI não cria coleta cross-org; servidor permanece bloqueado;
- coorte sintética abaixo do limiar retorna “sem recomendação” e não permite reidentificação;
- opt-out interrompe coleta futura sem apagar evidência/documento preservado;
- tenant A nunca entra em cálculo privado, cache ou exportação padrão de B.

## Alternativas rejeitadas

- **Benchmark bruto entre empresas:** viola confidencialidade e facilita reidentificação.
- **Média simples sem contexto/amostra/incerteza:** parece precisa, mas pode orientar preço incorreto.
- **IA decide preço final:** transfere responsabilidade e amplifica viés/erro.
- **Mesmo objeto para cálculo privado e documento público:** torna vazamento provável.
- **Usar PII/características protegidas para preço:** risco legal, discriminatório e desnecessário.
- **Ativar coleta coletiva agora para “usar depois”:** coleta sem finalidade/gate aumenta risco e obrigação.

## Métricas internas permitidas no primeiro corte

- tempo entre criação/publicação/aceite;
- taxa de aceite por serviço/faixa dentro da própria organização;
- quantidade de revisões/ajustes manuais;
- diferença entre sugestão e decisão final do próprio prestador;
- campos ausentes que impediram cálculo;
- erro absoluto quando houver custo/resultado posteriores confiáveis.

Os eventos guardam códigos/valores estritamente necessários e não conteúdo integral de contrato, foto, assinatura, áudio ou contato.

## Rollout

1. calculadora determinística privada com fixtures da própria organização;
2. projeção pública allowlistada e testes de não vazamento;
3. histórico interno de sugestão → edição/aceite/rejeição;
4. painel interno explicando premissas e qualidade;
5. agregações somente em dados sintéticos para testar reidentificação/estatística;
6. política de analytics/privacidade revisada;
7. experimento sandbox opt-in após gate;
8. ativação por organização somente com métricas/consentimento e kill switch.

## Rollback

- desligar `analytics_cross_org_enabled` e interromper novas recomendações coletivas;
- manter calculadora/histórico privado da própria organização;
- preservar explicações e decisões humanas;
- eliminar/reprocessar derivados conforme política aprovada;
- nunca reativar dado/coorte removidos por risco sem nova revisão;
- sugestão errada não é apagada para esconder problema: fica auditada e marcada.

## Consequências

Positivas:

- valor imediato sem depender de massa coletiva;
- explicação clara e separação cliente/empresa;
- caminho futuro para inteligência coletiva com gates reais;
- auditabilidade de sugestões e decisões.

Custos:

- benefício coletivo adiado;
- necessidade de taxonomia, qualidade e governança estatística;
- retenção/exclusão mais complexas.

## Gates antes de analytics coletivo

- finalidade e papel controlador/operador definidos;
- revisão LGPD/jurídica e base legal/consentimento quando aplicável;
- política de coorte e comparabilidade;
- testes de reidentificação, inferência e membership;
- métrica de qualidade/viés/incerteza;
- retenção, exclusão e direito do titular;
- opt-in/controle da empresa quando exigido;
- logs/payloads sem custo, margem ou PII indevidos;
- aprovação humana explícita para qualquer experimento com dados reais.
- suites acima verdes em fixtures sintéticas e política técnica que prove ausência de endpoint/job cross-org na V1;
- owner de dados, auditoria e kill switch ensaiado antes de sandbox opt-in.
