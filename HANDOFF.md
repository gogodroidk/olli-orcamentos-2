# HANDOFF — CQ-NFSE-F1 (18/11/2026)

- **Quem mexeu por último:** Claude (Sonnet 5.5). Branch `claude/cq-nfse-f1`, worktree `/home/igor/wt/cq-nfse-f1`, base `origin/main` 872962a0.
- **Estado:** fase 1 construída atrás de `NFSE_ENABLED=0`, provedor mock. Nada aplicado, nada em produção.

## Feito
F1-a migration (arquivo) · F1-b emissão no **worker** (o repo usa Worker, não edge function) · botão + conferência + resultado (F1-e, sem WhatsApp) · testes (63 + app).
Status por consulta (`/nfse/status`), sem webhook.

## Falta (ordem)
1. **Igor — decisão 2:** conta de teste Focus (30 dias grátis). Com ela: conferir `montarPayload` (campos de memória) e emitir 1 nota em homologação.
2. **Igor — migration:** revisar e aplicar `20261118120000_nfse_f1.sql` antes de ligar a flag.
3. **F1-d assistente fiscal:** tela para o prestador preencher `perfil_fiscal` (CNPJ, IM, município IBGE, regime, código do serviço, ISS) + upload do certificado A1 direto ao parceiro. **Hoje não há como gravar o perfil pelo app**: com a flag ligada, a emissão responde "perfil fiscal incompleto".
4. F1-c webhook do parceiro (hoje só consulta), F1-f cancelamento e lista, F1-g 5 cenários no sandbox, envio por WhatsApp.
5. Cliente real: CNPJ, inscrição municipal e certificado A1 do prestador; cobertura do município (Focus cobre o padrão nacional; fora dele, "sua cidade ainda não é atendida").
6. Decidir se o Pro vê o botão com "disponível no Empresa" (decisão 1 recomenda; esta fase esconde para quem não é Empresa, como pedido).

## Conflitos possíveis
PR #375 (CQ-APP-13-A) também altera `VisualizarOrcamentoScreen.tsx`; aqui são 2 linhas (import + `<EmitirNotaBotao orc={orc} />` antes do cartão "cobrar"). Se conflitar, reaplicar as 2 linhas.
`entitlements.ts` NÃO foi tocado de propósito: um recurso novo apareceria nos cartões de plano e prometeria nota antes de existir (CDC).
