# Plano único OLLI Orçamentos — execução 0→100

Atualizado em: **2026-09-03**
Base: ledger do piloto, readiness transversal, plano mestre, três ondas e
diretrizes posteriores do dono.

## O que “100%” significa

O programa só chega a 100% quando o escopo estiver implementado, integrado no
ambiente aprovado, testado em aparelhos/navegadores reais, com segurança,
observabilidade, rollback e aceite humano. Código local verde não substitui
produção nem validação real.

Situação atual: **organização concluída localmente; produto ainda não é 100%**.

## Estado resumido

| Frente | Evidência atual | Estado honesto |
| --- | --- | --- |
| Base mobile/web/admin/worker | Código amplo já existe em `C:\OLLI_REL` | Parcial, com regressões locais verdes |
| Onda 1 — fundações/pesquisa/arquitetura | ADRs, inventários, schemas e gates documentados | Feita localmente; pesquisa de campo e gates regulatórios continuam |
| Onda 2 — contratos e kernels | Contratos locais, outbox, shadow, documentos e testes | Feita no escopo local/sintético |
| Onda 3 — verticais | J3.2 local concluída; J3.1 travada; J3.3 depende de gates | Parcial/bloqueada |
| E-mail de boas-vindas/onboarding | Evento, template, supressão, cadência, outbox e adapter locais | Contrato local pronto; envio real bloqueado |
| Notificações app/web | Políticas, inbox, journal, registry e orquestração locais | Contrato local pronto; persistência/dispositivo/VAPID bloqueados |
| Admin e dados | Políticas, auditoria e dataset local | Contrato local pronto; acesso a dado real bloqueado |
| Monetização | Estratégia, eventos, trial, reconciliação e journal locais | Contrato local pronto; fonte de billing e sandbox bloqueados |
| PWA/APK/site | Manifesto web e configuração EAS parcial | Release/distribuição não aceita |
| Automação | Protocolo v4, lease, quota, anti-loop, ledger e readiness | ID canônico reconciliado; pausa corretamente quando não existe item seguro |

## O que já foi concluído no escopo autônomo

- Repositório canônico, baseline e arquitetura alvo documentados.
- Governança de tenant, comandos, idempotência, outbox e shadow-read modelada e
  testada localmente.
- Kernel documental, versões imutáveis e contratos de resultado implementados
  em laboratório local.
- Fluxos do orçamento, revisão, identidade e ajustes de UX receberam mudanças
  e regressões locais.
- Estratégia de conversão para Pro foi definida sem limite duro de orçamento:
  núcleo grátis útil, Pro por valor visível, CTA após ativação e trial opt-in
  somente depois de billing confiável.
- Contratos locais de onboarding, e-mail, notificações, admin e monetização
  foram fechados sem chamar provedores ou tocar dados reais.
- Meta-suíte registrada em `140/140`, readiness em `32/32` e typecheck verde
  na última fatia de produto concluída.
- Pacote de campanha e identidade OLLI Orçamentos foi criado.
- A automação ganhou controle de cota, lease, anti-loop e estado
  `ACTIVE/PAUSED` coerente.

## O que ainda falta

### G1 — decisões e identidades externas

1. Escolher a fonte única de cobrança da release.
2. Definir domínio/remetente e provider de e-mail.
3. Definir armazenamento e retenção de notificações.
4. Definir papéis, finalidade, campos, retenção e base legal do admin com dados.
5. Escolher aparelhos, navegadores e coorte de aceite.

### G2 — integração controlada e sandbox

1. Aplicar migrations versionadas somente após aprovação e rollback.
2. Ligar hook transacional de cadastro à outbox.
3. Configurar e testar e-mail em caixa controlada.
4. Validar Web Push/VAPID e push móvel em aparelhos aprovados.
5. Validar checkout, webhook assinado, entitlement, downgrade e segundo ciclo
   somente em sandbox.
6. Integrar consultas administrativas reais com AAL2, RBAC, auditoria e
   minimização.

### G3 — aceite de release

1. Gerar build exato, registrar hash e instalar em aparelhos.
2. Exercitar login, offline/sync, orçamento, PDF/link, agenda, notificações,
   e-mail, billing e admin no ambiente correto.
3. Fazer canário, observabilidade, restore e rollback.
4. Publicar somente com autorização.

### G4 — validação de negócio e campo

1. Observar prestadores reais com consentimento.
2. Medir primeiro orçamento/PDF, hábito, CTA, trial, pagamento e segundo ciclo.
3. Revisar PMOC/NBR/licenças e linguagem pública com responsável competente.
4. Registrar resultados inconclusivos como inconclusivos.

## Sequência recomendada

| Ordem | Pacote | Executor recomendado | Gate |
| --- | --- | --- | --- |
| 1 | Organização e fonte única | Principal forte + Luna mecânico + governador | Local |
| 2 | Decisão de billing e e-mail | Principal forte + decisão do dono | Humano |
| 3 | Preparação de migrations/runbooks | Principal forte; revisão database/security | Aprovação |
| 4 | Integração em sandbox | Principal + QA; auxiliares mecânicos | Credenciais sandbox |
| 5 | Aceite em dispositivo/navegador | QA + dono/coorte autorizada | Humano |
| 6 | Canário e observabilidade | Principal + DevOps/security | Produção autorizada |
| 7 | Experimento de conversão | Produto + dados minimizados | Consentimento e baseline |
| 8 | Release/publicação | Principal; checklist final | Autorização explícita |

## Backlog de execução após esta organização

Os itens abaixo ficam preparados, mas o modelo menor só deve executar o que não
atravessa gates:

1. **Luna máximo — mecânico/local:** manter índices, manifests, testes, fixtures,
   relatórios, catalogação, checagens de links e correções estritamente
   allowlistadas.
2. **Modelo principal forte — arquitetura/segurança:** billing, migrations,
   tenancy, acesso administrativo, privacidade, release e síntese final.
3. **QA read-only/local:** repetir suítes, builds locais e inspeção sem publicar.
4. **Governador read-only:** início e fim de cada fatia; no máximo uma melhoria.

Não é possível “trocar” o modelo principal silenciosamente pela documentação.
Quando o dono selecionar Luna máximo na tarefa, o self-prompt deverá limitar a
execução aos itens mecânicos desta matriz. Tarefas de alto risco voltam ao
modelo principal forte.

## Critério de parada correto

A execução de produto não parou por erro: ela ficou `PAUSED` porque todos os
itens autônomos anteriores estavam terminais e restavam gates humanos. Uma
mensagem “siga” sem um item novo era consumida uma vez pela guarda anti-loop e
encerrava silenciosamente. Esta organização foi um item novo explícito e já foi
concluída. A repetição visível de heartbeats tinha uma segunda causa: os
controles citavam um ID recriado que não existia, enquanto os heartbeats
históricos mostravam outro ID também já ausente do app. Foi criada uma única
vigia pausada, `piloto-olli-0-100-continuidade-controlada`. O runbook
`docs/ORGANIZACAO/AUTOMACAO_E_HANDOFF.md` registra a reconciliação.

Ao terminar esta fatia:

- se houver novo item local seguro, registrá-lo com DoD e allowlist antes de
  continuar;
- se restarem apenas gates humanos, voltar para `blocked/PAUSED`;
- nunca manter `ACTIVE` fingindo trabalho.
