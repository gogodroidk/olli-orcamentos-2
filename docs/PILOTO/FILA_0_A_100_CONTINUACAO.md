# Fila de continuação do Plano Mestre OLLI 0→100

Atualizado em: **2026-09-04**  
Repositório canônico: `C:\OLLI_REL`  
Branch de execução: `Codex/piloto-p0`

## Regra de verdade

Esta fila complementa — e não reescreve — a fila histórica do piloto. Um item só
recebe `DONE` quando o respectivo DoD tem evidência verificável. `DONE_LOCAL`
significa implementação e prova local concluídas, mas não substitui sandbox,
dispositivo real, coorte, parecer profissional ou autorização de publicação.

## Sequência executável

| ID | Pacote | Estado | Definition of Done |
| --- | --- | --- | --- |
| C0 | Consolidar a árvore herdada | DONE_LOCAL | branch própria, temporários ignorados, ZIP conferido, zero segredo detectado, dependências alinhadas, auditoria sem vulnerabilidade conhecida, preflight de release verde e commit local |
| C1 | PWA instalável e offline mínimo seguro | DONE_LOCAL | manifest instalável, service worker controlado, shell e artefatos locais disponíveis offline sem cachear sessão/dados privados, atualização previsível e QA automatizado em Chromium |
| C1A | Reconciliar o pedido de 04/09 com o plano mestre | DONE_LOCAL | matriz requisito→estado→decisão→DoD cobrindo landing, segmentos, aquisição, planos/trial, onboarding, orçamentos, financeiro, equipe, configurações, IA, integrações e legibilidade por agentes |
| C2 | Onboarding e perfil obrigatório | DONE_LOCAL | contrato compartilhado exige telefone e identidade mínima antes do uso operacional; app sem “Pular”, painel com guard fail-closed, fluxo segmentado, retorno seguro, consentimento de marketing separado e evidência em `ACEITE_C2_ONBOARDING_PERFIL_2026-09-05.md` |
| C3 | Oferta, trial e limites comerciais | QUEUED | contrato único de planos, limite Grátis e trial Pro de 14 dias definidos como experimento, comunicação transparente, downgrade sem perda e billing real ainda separado por gate |
| C4 | Landing, verticais e descoberta por humanos/agentes | QUEUED | home coerente com o produto inteiro, páginas úteis por segmento, telas reais mobile/web corretamente rotuladas, trust pages, JSON-LD, markdown e 404/redirect corretos, sem prometer integrações não aceitas |
| C5 | Orçamentos, estados e financeiro operacional | QUEUED | editar/revisar/duplicar sem destruir histórico, estados aprovado/pago/finalizado, comprovantes, contas a receber, baixas, despesas e métricas explicáveis por tenant |
| C6 | Configurações, identidade e equipe | QUEUED | perfil/auth completos, tema e marca descobríveis, equipe conectada com permissões granulares e trilha auditável |
| C7 | Integrações e central do prestador | QUEUED | agenda, notificações, armazenamento, WhatsApp oficial e catálogo oficial fiscal/Sebrae/INSS com consentimento, idempotência, proveniência e alternativa manual |
| C8 | IA operacional segura | QUEUED | ferramentas por intenção, tenant e RBAC derivados da sessão, preview/diff, confirmação, limites, auditoria e rollback; CRUD bruto, apagar tudo, cobrar e enviar sem confirmação permanecem proibidos |
| C9 | Motor de precificação e packs de ofício | QUEUED | custo/hora, deslocamento, materiais, impostos, margem e packs elétrica/hidráulica/pintura/dedetização/jardinagem sobre o núcleo comum, com memória explicável e validação por ofício |
| C10 | HVAC/PMOC e documentos avançados | QUEUED | ativos, visitas, checklist, evidências, contratos e versões imutáveis; alegações regulatórias condicionadas a parecer profissional |
| C11 | Hardening e release | BLOCKED_EXTERNAL | revisão independente, testes reais, observabilidade, restore, canário, publicação e aceite do dono |

## Gates que não podem ser simulados

- uso de credenciais, destinatários ou dados reais;
- migrations ou escrita em produção;
- cobrança, transferência ou checkout real;
- contato com clientes ou coortes sem consentimento;
- assinatura, distribuição, indexação ou publicação;
- parecer jurídico, contábil, regulatório ou de responsável técnico;
- revisão independente e aceite em dispositivos/navegadores definidos.

Esses gates não cancelam os pacotes locais anteriores: cada pacote deve ser levado
até `DONE_LOCAL` antes de a fila parar por dependência externa real.
