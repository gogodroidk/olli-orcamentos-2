# ACHADOS dos E2E (branch claude/qa-e2e, base main a1f846b)

Só entram aqui falhas reais do produto. Falha de teste/mock não entra.

## #1 — Criar cliente de dentro do orçamento acende "Escolha o cliente deste orçamento." (CONFIRMADO)
- **Onde:** `webapp/src/pages/olli/clientes/FormCliente.tsx` (`aoSubmeter`, ~l.250) renderizado dentro de `SeletorCliente`, que está dentro do `<form onSubmit={enviar}>` de `FormOrcamento.tsx` (~l.625).
- **Causa:** o diálogo do cliente é um portal, mas eventos sintéticos do React borbulham pela árvore React, não pela DOM. O `submit` do FormCliente chega ao `enviar` do orçamento (`validar()` roda com `clienteId` ainda vazio) e `setErro("Escolha o cliente deste orçamento.")` aparece. `aoSubmeter` só chama `preventDefault`, nunca `stopPropagation`.
- **Efeito:** o cliente é criado e selecionado, mas o banner de erro vermelho continua visível (só some no próximo submit). Confunde o usuário e parece que a seleção falhou. Nenhum dado se perde.
- **Severidade:** baixa (UX), mas está no 1º orçamento do funil de ativação.
- **Teste que pega:** `e2e/painel/fluxo-comercial.spec.mjs` → "2b." (falha hoje, passa quando corrigir).
- **Correção sugerida (CTO):** `ev.stopPropagation()` em `FormCliente.aoSubmeter` (e checar outros forms aninhados via portal, ex.: `FormDialog` dentro de formulários).

## Observações (não são bug)
- `web/dist` na pasta C:\OLLI_REL é de 13/ago/2026 (build velho). Quem testar landing precisa rebuildar; os E2E usam build próprio em `.e2e-dist/`.
- Campo de preço do item tem máscara de centavos: digitar `850` vira R$ 8,50 (esperado; teste digita `85000`).
