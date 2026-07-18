# RE-AUDITORIA do painel (AUDITORIA_ABA_POR_ABA, 152 achados) vs código atual

> Onda 8 / G3 (2026-07-17): re-varredura VERIFICADA no código vivo do webapp. Revisados 130/152.
> Confirma que as Ondas 1-7 (+ o piloto) fecharam ~65+ achados. Aqui ficam só os que SEGUEM ABERTOS.

## Fechados (amostra — confirmado no código)
Raiz 1 (contraste claro: `-darker` propagado + tokens no global.css), Raiz 2 (`htmlFor`/`useId` em ~95 campos),
Raiz 3 (`useOlliList` pagina com `.range()`, sem cap de 1000), numeração por-usuário (deriva do maior visível),
gate de papel (catálogo/recibos, 3 estados), `ehProduto` por tipo explícito, `2.5→25`, desconto negativo,
trava "já enviado" + lost update do orçamento, agenda (término estimado, toque do ⋮, resize sem hora),
equipamentos (badge "desativado" verde, filtro sem limpar), login (botões type, demo por env, reset real,
erros traduzidos, OAuth com feedback), chrome/nav (drawer fecha, aria-labels, RegExp escapada, ⌘K/Ctrl),
meu-negócio (branding no blob, contraste white-label, useBlocker), performance (apexcharts/route-loading/vendor),
landing (em-breve reconciliado, `<main>`+skip-link, alvo do FAQ, CTA WhatsApp, "Entrar" no celular, 3D cortado).

## ABERTOS — top prioridade (próxima onda)
### P1 — dados (bugs reais) — ✅ TODOS FECHADOS na Onda 9
- [x] **FormEquipamento não relê fresco antes de salvar** (Onda 9, H1) — agora relê `select('*').eq('id').maybeSingle()` via `linhaParaEquipamento` como base do spread; foto/QR do campo não são mais apagados. webapp tsc exit 0.
- [x] **proximoNumeroOs sem paginação** (Onda 9, H1) — `.order('criado_em',{ascending:false}).limit(1000)` como o `proximoNumeroDocumento`. Não duplica mais número de OS.
- [x] **FormOs sobrescreve o checklist do técnico** (Onda 9, H1) — merge por `id` com `fresca.checklist` (item que o painel não mexeu herda o fresco) + copy do diálogo corrigida pra verdade.

### P2 — segurança — ✅ FECHADOS na Onda 9 (código)
- [x] **Senha da demo em texto puro nos docs** (Onda 9, H2) — `GrTechDemo2026` removida dos 2 .md (referência ao cofre/env). ⚠️ **rotação no Supabase segue humana** (BLOQUEIOS).
- [x] **SIGNED_OUT por expiração não limpa cache** (Onda 9, H2) — `queryClient` extraído pra singleton (`store/queryClient.ts`, sem import circular); `userStore` chama `.clear()` no SIGNED_OUT. Não vaza mais entre tenants na mesma aba.

### P2/P3 — a11y & consistência
- [ ] Preço de item do orçamento sem `aria-label` (`FormOrcamento.tsx:799`).
- [ ] `ui/badge.tsx` usa `-dark` (não `-darker`) em warning/success/error — abaixo do AA que o resto adotou.
- [ ] Busca do `RecordListPage` (Clientes) sem `aria-label`/`type=search`.
- [ ] LocalePicker oferece "Chinese"/English num painel pt-BR + trigger sem aria-label.

### P3 — dados/perf residuais
- [ ] Numeração ainda não-atômica (select-then-upsert; colisão concorrente possível → RPC SECURITY DEFINER é o "definitivo", ligado ao O2-19).
- [ ] `FormRecibo` sem `numeroCompradoRef` (retry perde número, buraco na sequência REC-).
- [ ] `MenuDaLinha` declarado dentro da página (remonta a cada tecla) + `antd/@ant-design/cssinjs/styled-components` ainda no package.json (adapter órfão).
- [ ] `MotionLazy` importa `domMax` estático (perde o lazy do bundle); LoginAuthGuard pisca deslogado; rota `/nova-senha` não existe (reset manda e-mail mas não troca a senha).

## Não verificáveis (humano)
Rotação da senha demo no Supabase · visibilidade real do repo GitHub · contraste numérico exato (foi por inspeção dos hex nos comentários) · ~15-20 P3 triviais não reconferidos individualmente (priorizado P0/P1/raízes).
