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
### P1 — dados (bugs reais)
- [ ] **FormEquipamento não relê fresco antes de salvar** — `FormEquipamento.tsx:132-177` monta com o prop capturado na abertura, não com releitura do banco (FormOrcamento/FormOs já fazem). Foto anexada no celular ou QR revogado durante a edição no painel são **apagados em silêncio** (lost update). Fix: `select('*').eq('id').maybeSingle()` como base do spread.
- [ ] **proximoNumeroOs sem paginação/ordenação** — `mutacoes.ts:155-165` faz `select('numero')` sem `.order()`/limit (proximoNumeroDocumento já foi corrigido). Acima de ~1000 OS pode **duplicar "OS-0007"** em documento do cliente. Fix: `.order('criado_em',{ascending:false}).limit(1000)`.
- [ ] **FormOs sobrescreve o checklist do técnico** — `FormOs.tsx:170-230` releu fresco e preserva `fotos`, mas `checklist` está em `campos` e sobrescreve o estado do banco; o `feito:true` marcado no celular DEPOIS da abertura é revertido. E a copy (linha 230) **afirma falsamente** que o checklist é preservado. Fix: merge por `id` com `fresca.checklist` + corrigir a copy.

### P2 — segurança
- [ ] **Senha da demo em texto puro nos docs** — `docs/WEB_ESTADO_E_PLANO.md:22`, `docs/WEB_REBUILD_BRIEF.md:170/508` ainda têm `GrTechDemo2026` (código já usa env). Fix: remover dos .md. + confirmar rotação no Supabase (humano → BLOQUEIOS).
- [ ] **SIGNED_OUT por expiração não limpa cache** — `userStore.ts:170-186`: logout manual limpa React Query, mas expiração/revogação de sessão só chama `resetBrandColor()`, não `queryClient.clear()` — dado de um tenant pode vazar pro próximo login na mesma aba. Fix: exportar `queryClient` e limpar no branch SIGNED_OUT.

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
