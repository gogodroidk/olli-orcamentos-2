# CATÁLOGO VISUAL — auditoria de UI/UX (Onda 6)

> Achados visuais das 3 superfícies + coerência cross. Fonte: 5 auditores (2026-07-17).
> Detalhe completo no journal do run `wf_01b22ea6-0e2`. `[x]` = corrigido; `[ ]` = aberto; `[DONO]` = decisão de identidade.

## VEREDITO CROSS (o "tudo tem que casar")
Hoje as 3 pontas parecem **produtos de empresas diferentes**, amarradas só pela logo-mascote e pelo azul `#0B6FCE`/`#3FD8EA` (pixel-idênticos em favicon/OlliLogo das 3). Fora isso divergem em 4 eixos — é o que falta pra "Stripe/Apple coeso":

| Eixo | Landing | Painel | App | Decisão |
|---|---|---|---|---|
| **Ícones** | emoji Unicode 🧾🛠️ | Solar duotone (menu) + lucide (conteúdo) | MDI outline | `[DONO]` escolher 1 família |
| **Fontes** | Plus Jakarta + Spectral | Open Sans + Inter (nenhuma sobreposição) | Plus Jakarta + Spectral | `[DONO]` painel adota Jakarta+Spectral? |
| **Raio botão** | 8/12px | 6px (rounded-md) | 24px (pílula) | `[DONO]` convergir escala |
| **Dark mode** | — | preto/zinza + sombra preta | navy sem sombra (elevação por superfície) | `[DONO]` painel vira navy? |
| **Status** | — | warning #FFAB00 / error #FF5630 | warning #D98008 / danger #E5484D | baixa prio |

**Recomendação (quando o dono decidir):** convergir tudo pra linguagem do APP (mais madura e já documentada em `src/theme/cores.ts`): Plus Jakarta+Spectral, navy no dark, raio ~16px, e UMA família de ícone (lucide já é maioria no painel: 57 vs 6 arquivos). **Não executo isso sozinho — muda a cara do produto inteiro, ele tem que ver.**

## P0 — quebra / ilegível (conserto imediato)
- [ ] **APP — ícone de botão invisível com marca clara** — `OlliButton.tsx:60` renderiza o `icon` cru; os 39 call-sites cravam `color="#fff"`. O rótulo já usa `textoSobre(bg)`, mas o ícone não — com marca clara (extraída do logo do dono em MeuNegocio) o ícone mede ~1.4:1. **Fix 1 linha**: `cloneElement(icon, { color })` reusando a cor já calculada. Corrige os 39 de uma vez.
- [ ] **APP-DESKTOP — PainelNovoPlano sem `<Modal>`** — `PmocDesktopScreen.tsx:533,669-679`: único dos 7 painéis que usa `<View position:absolute>` em vez de `<Modal>` → preso ao scroll da página, corta/exige rolagem pra achar "Criar plano". Fix: envolver em `<Modal transparent>` como os outros 6.

## P1 — destoa / contraste / incoerência
### App
- [ ] Categoria `#A78BFA` crua como ícone (2.72:1 no CLARO) — `HomeScreen.tsx:801`, `ClientesScreen.tsx:597` → `corCategoria('#A78BFA', cores.surface)`.
- [ ] `cores.voice`/`cores.plan` como fundo sólido + texto/ícone `#fff` (2.81:1 no escuro) — `NovoOrcamentoScreen.tsx:393,566,576`, `OlliChatScreen.tsx:294,428` → `textoSobre(cores.voice/plan)`.
- [ ] Check do passo concluído `#fff` sobre `c.success` (2.73:1 escuro) — `StepIndicator.tsx:32` → `textoSobre(c.success)` (o passo ativo ao lado já faz).
### App-desktop
- [ ] Largura de painel 460 vs 420 — `PainelOS.tsx:608`, `PainelNovaOS.tsx:273` → 420 (constante única).
- [ ] CTA "Novo X" com 3 tratamentos (gradiente/`c.primary`/`c.accent`) — `AgendaDesktopScreen.tsx:682` `c.accent`→`c.primary`; médio prazo trocar Pressables hand-rolled por `OlliButton`.
- [ ] `PainelOS`/`PainelNovaOS` usam fontSize literais vs `Typography` — alinhar aos outros painéis.
- [ ] Agenda edita em modal centralizado vs painel lateral 420 do resto — migrar pro painel lateral.
### Landing
- [ ] Hover invertido — cards sem link ganham elevação, cards-link só borda — `index.astro:392` vs `:345`. Mover elevação pros links.
- [ ] 3º verde hardcoded `#0f9d63` — `HeroDevices.tsx:271,339,452` → `text-check` (token já auditado).
- [ ] CTA de header `py-2` (~33px de toque) vs hero `py-3.5` (~52px) — `index.astro:232`, `para/[oficio].astro:158` → `py-2.5`/`min-h-11`.

## P2/P3 — polimento / consistência
- [ ] Landing: 4 rodapés diferentes → `Footer.astro`; header sticky/largura inconsistente → `Header.astro`; pastilha de ícone só na home (não nas calculadoras); `＋` fullwidth (U+FF0B)→`+`; bullet `●` sem aria-hidden; `<br/>` do H1 pode quebrar feio em 360px.
- [ ] App: chip squircle com raio 10-16 chutado em ~15 telas → `BorderRadius.sm`(12) ou token `chip`.
- [ ] App-desktop: fontSize fracionário (11.5/12.5/13.5) em 25+ sítios/9 arquivos → step de Typography; TabelaDados sem indicador de overflow em 1024px; KpiGrid quebra 4→2+2 em 1024px.
- [ ] Painel: mistura Solar (menu) + lucide (conteúdo) — unificar em lucide (maioria).

## Plano de correção
- **Onda 7 (agora):** P0 + P1 objetivos + landing polish + painel icon-family (dentro do painel) — bugs claros, sem redesign de identidade.
- **`[DONO]`:** a tabela cross (fontes/raio/dark/ícone unificado + emoji→SVG na landing) — ver BLOQUEIOS. Recomendo convergir pra linguagem do app; ele decide a direção.
