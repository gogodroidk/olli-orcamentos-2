# FOLLOWUPS — tarefas adiadas (recriar como chips ao retomar)

> Os chips de tarefa não sobrevivem ao reinício do app. Este arquivo é a fonte
> durável: ao retomar a sessão, recriar cada item abaixo como chip (spawn_task)
> ou atacá-los diretamente. Todos são melhorias fora do caminho crítico —
> nenhum bloqueia o que já está no ar.

## Pendentes (5)

1. **Badge financeiro na tabela desktop de orçamentos**
   - `src/screens/desktop/OrcamentosDesktopScreen.tsx` não recebeu o badge de estado
     financeiro (Pago / Recibo emitido / Aguardando) nem o atalho "Registrar pagamento"
     que o mobile (`OrcamentosScreen`) ganhou na Onda 3. Portar `getStatusFinanceiro` +
     `BadgeFinanceiroPill` de `src/services/pagamentos.ts` (carregar `getRecibos` junto
     de `getOrcamentos`). Paridade desktop, não elo quebrado.

2. **Limpar versões órfãs de orçamento na nuvem ao excluir**
   - `src/database/database.ts` `deleteOrcamento` apaga versões locais + tombstone do
     orçamento, mas NÃO propaga a exclusão de `orcamento_versoes` para a nuvem (a tabela
     não tem FK/cascade). Linhas órfãs podem ressuscitar histórico apagado se o
     `orcamento_id` reaparecer. Propagar a exclusão via o mecanismo de tombstone existente
     (ou cascade na nuvem). Protegido por RLS (não vaza) — é lixo, não vulnerabilidade.

3. **Campo `concluidoEm` na Ordem de Serviço**
   - "Concluídas no mês" (`src/screens/desktop/InicioDesktopScreen.tsx`) usa `atualizadoEm`
     como proxy de conclusão — qualquer edição posterior (foto/observação) re-carimba e
     conta no mês errado. Adicionar `concluidoEm?: string` ao tipo `OrdemServico`, gravado
     só na transição de status→`concluida` (em `atualizarStatusOS`), com coluna
     (migration aditiva + local + cloudSync como as demais colunas de OS), e filtrar por
     `noMesAtual(o.concluidoEm)`.

4. **KPIs do dashboard abrem lista já filtrada**
   - No `InicioDesktopScreen`, "Em aberto" e "Contas a receber" navegam para `OrcamentosTab`
     SEM filtro → abrem a lista completa (enganoso). Estender o param de `OrcamentosTab`
     (`AppNavigator` TabParamList) com um recorte inicial (ex.: `recorteInicial?: 'em_aberto'
     | 'a_receber' | StatusOrcamento`) e `OrcamentosDesktopScreen` inicializar o filtro a
     partir dele (recortes derivados via `propostaJaEnviada`/`getReciboDoOrcamento`).

5. **Role de checkbox no `OlliPressable` (acessibilidade)**
   - O toggle de checklist (`CheckRow` em `src/screens/HojeScreen.tsx`) usa `OlliPressable`,
     que hardcoda `accessibilityRole="button"` e não expõe `accessibilityRole/State`. Para
     leitor de tela soa como "botão", não "caixa marcada/desmarcada". Estender
     `src/components/OlliPressable.tsx` para repassar `accessibilityRole`+`accessibilityState`
     e usar `role="checkbox"` + `{checked: item.feito}` no CheckRow.

---

## RETOMAR AQUI (estado da sessão ao pausar — 2026-07-08)

**No ar em produção** (main até `6c29e70`): Ondas 1, 2, 3, 4, 5, 7, 10.

**PMOC Fase 1 — inventário HVAC + etiqueta QR — feita mas AINDA NÃO no gate/main:**
- Fundação `20260709_pmoc_fundacao.sql` APLICADA + RLS testada 4/4 (isolamento, membro,
  autoria carimbada, `user_id` imutável; QR opaco/único). `20260711_assets_fotos.sql`
  APLICADA (coluna `fotos` jsonb). Worker `/q/<token>` DEPLOYADO (v `c64671f4`).
- Código no working tree do branch (typecheck 0): `equipamentos.ts` (service),
  integração cloudSync `equipamentos`→`assets` (via `REMOTE_TABLE`, `qr_token`
  preservado/omitido), `EquipamentoScreen`, nav/SidebarNav, `worker/src/pmoc.js`.
- **A recuperar ao retomar:** o gate Fable da PMOC Fase 1 foi INTERROMPIDO na pausa.
  Resumir o workflow (runId `wf_ce6ac9c8-728`, os revisores estão em cache) → aplicar
  findings até zero critical/high/medium → re-typecheck → (se tocar worker, redeploy)
  → push main → atualizar cabeçalho de `20260709_pmoc_fundacao.sql` (era "NÃO APLICAR"
  → APLICADA) → `EXECUTION_LOG.md`.

**Próximo depois disso:** PMOC Fase 2 (plano PMOC + periodicidade + geração de ordens
recorrentes reusando `ordens_servico`).

**Bloqueios humanos (destravam ondas paradas):** chaves no cofre
`CONFIG CLAUDE/credenciais-locais.env` — Sentry DSN + PostHog key (Onda 2.5), Resend
key (Onda 6). Ver `docs/KNOWN_BLOCKERS.md`. Chrome extension desconectada (OAuth Android).

**Contas QA:** A=`e4f2858f-440f-469d-aca5-18bf0c35569a`, B=`daeb08b4-b1a3-4f96-b568-33b6eea879f0`.
</content>
