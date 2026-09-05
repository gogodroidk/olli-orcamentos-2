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
| C1 | PWA instalável e offline mínimo seguro | NEXT | manifest instalável, service worker controlado, fallback offline sem cachear sessão/dados privados, atualização previsível, testes e Lighthouse/DevTools locais |
| C2 | Motor de precificação V1 | QUEUED | custo/hora, deslocamento, materiais, impostos, margem, preço mínimo/sugerido e memória de cálculo explicável, com testes |
| C3 | Financeiro operacional V1 | QUEUED | contas a receber, baixas, despesas, fluxo de caixa e ligação rastreável a orçamento/OS, preservando offline e tenant |
| C4 | Documentos, contratos e versões | QUEUED | modelos, versões imutáveis, recuperação do original, aceite simples claramente rotulado e trilha auditável |
| C5 | HVAC/PMOC operacional | QUEUED | ativos, carteira, visita, checklist, evidências e pacote documental; alegações regulatórias continuam condicionadas ao gate profissional |
| C6 | Portal, integrações e automações | QUEUED | portal mínimo, agenda, mensageria assistida e automações com consentimento, idempotência e alternativa manual |
| C7 | IA madura e aprendizado próprio | QUEUED | tarefas tipadas, avaliação, proveniência, controles de privacidade, fallback manual e recomendações explicáveis com dados próprios |
| C8 | Packs adjacentes | QUEUED | elétrica, hidráulica, pintura, dedetização e jardinagem usando núcleo comum e validação por ofício |
| C9 | Hardening e release | BLOCKED_EXTERNAL | revisão independente, testes reais, observabilidade, restore, canário, publicação e aceite do dono |

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

