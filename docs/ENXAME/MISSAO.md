# OPERAÇÃO OLLI-PERFEITO — sala de guerra do enxame

> Cérebro vivo da operação. Todo agente lê isto pra saber a missão, as regras e onde estamos.
> Atualizado a cada onda pelo coordenador (thread principal). Fonte de verdade da OPERAÇÃO
> (não do produto — produto é `docs/EXECUTION_LOG.md` + `docs/PILOTO/LEDGER.md`).

## Missão (pedido do dono, 2026-07-17)
Deixar o OLLI **perfeito** — app (APK) + painel web + landing — com cara de empresa bilionária
(Stripe/Apple): tudo funciona, tudo faz sentido, UX fenomenal, ícones que casam, zero fora de
layout, onboarding, página de ajuda, sinergia entre telas. Análise de código caractere-por-caractere,
sem código-lixo. Preparar a publicação na **Google Play** até o ponto dos cliques do dono. Apple: só
depois de 20/07.

## Decisões travadas
1. **Todas as frentes em paralelo** — auditoria de código + perfeição UI/UX + destravar loja/comercial.
2. **Play Store:** preparo TUDO (AAB assinado, listing, prints, data safety, content rating) e paro
   nos cliques do dono (regra: não digito credencial, não aceito termos, não clico "publicar"). Começo
   por faixa de **teste interno** (reversível), não produção direta.
3. **Loop autônomo que NÃO para:** se não posso fazer algo → marca BLOQUEADO-HUMANO e pula. Se não há
   o que fazer numa frente → próxima. Roda onda após onda até o dono voltar e mandar parar.

## Regras P0 (do OBJETIVO.md / ARMADILHAS — não são sugestão)
1. **Erro nunca vira vazio** — todo gate de plano/permissão/vertical exige 3 estados (carregando|erro|valor).
2. **Copy/preço/feature só derivada da fonte** (`PLANOS_BASE`, types, Stripe live) — nunca de memória.
3. Wrangler: `env -u CLOUDFLARE_API_TOKEN` (token do .env é fraco e sabota o deploy).
4. PowerShell não roda comando começando com dígito; MCP no Windows exige `setx` + reiniciar.
5. **Verificar contra a realidade** — versão/licença = registry npm; "tem bug" = ler/rodar; nunca votação de céticos pra fato.
6. **A FILA pode estar velha** — conferir no repo vivo se o item ainda é verdade ANTES de codar (lição 16/07).
7. Gate de merge: `npm test` (root, 8 scripts) + `npm run typecheck` (exit 0) têm que continuar verdes.
8. NÃO mexer em `diagnostico.`/`link.` (backend vivo). NÃO tocar domínio (decisão do dono).

## Roteamento por custo (skill roteador-de-modelos)
Braçal em lote → swarm/haiku · análise/inventário → sonnet · **síntese/decisão/escrita sensível → Opus** · Fable só horizonte longo.

## Protocolo do loop (como o coordenador continua, mesmo após resumo de contexto)
1. Cada **onda** = 1 Workflow (fan-out roteado + verificação adversarial).
2. Ao completar, o coordenador: (a) sintetiza, (b) persiste achados nos docs desta pasta,
   (c) aplica/agenda correções, (d) commita a onda, (e) lança a próxima onda.
3. Nunca empurrar pra produção/loja/main sozinho — isso é ato do dono. Trabalho fica em commits locais.
4. Item humano → registra em `LOJA.md`/`BLOQUEIOS.md` e segue.

## Log de ondas
- **Onda 1 — Reconhecimento** ✅ (2026-07-17): 6 agentes, 0 erro. Achados em `ACHADOS.md`, humanos em `BLOQUEIOS.md`, loja em `LOJA.md`.
  - Correção crítica: memória mentia — `HEAD == main == origin/main == 1f38cd3`; os "29 commits não pushados" JÁ estão em produção.
  - 2 gates estavam VERMELHOS (não documentado): `tsconfig` sem `web` no exclude + mock de env com nome velho. **Ambos corrigidos, gate verde confirmado** (`typecheck`/`test` exit 0).
  - Mapa: app ~55 telas, painel ~19 rotas, landing 6 páginas. Padrão-raiz "erro vira vazio" em 18+ sítios do app.
- **Onda 2 — Verdade & confiança** ✅ (2026-07-17): 5 clusters disjuntos, 0 erro. Root gate verde. Feito: skeleton infinito Home (3 estados+retry), EquipeAoVivo visível + copy, XSS `img()` no PDF, FAQ+404 landing, filtro KPI painel. Achado novo: benefício órfão `dashboard_empresa` (removido, decisão do dono pendente). ⚠️ web/webapp sem typecheck local (sem node_modules) — CI cobre.
- **Onda 3 — Blindagem** ✅ (2026-07-17): 9 agentes, 0 erro. CI criado (3 jobs, push/PR). Sweep "erro vira vazio" fechado nas 12 telas de maior impacto (16 arquivos). typecheck+test exit 0. Achado novo: webapp com 2 lockfiles. A8 autocorrigiu o alvo (PmocPlanosScreen plural).
- **Onda 4 — Segurança & dado que some & coerência** ✅ (2026-07-17): 4 agentes, 0 erro. Root gate + webapp typecheck (instalei deps) + 8 testes verdes. B1 worker (MP webhook cap + /transcrever cap+rate-limit; `TRANSCREVER_RL` precisa deploy→BLOQUEIOS). B3 gate vertical Diagnóstico + redirect privacidade. B4 reduced-motion do wizard. B2 e metade do B1 eram STALE (já feitos) — enxame confirmou sem duplicar. Efeito colateral do pnpm: `lefthook install` (hook benigno, não bloqueia).
- **Onda 5 — Coerência visual & privacidade** ✅ (2026-07-17): 5 agentes, 0 erro. app typecheck+test + webapp tsc verdes. C1 (contraste badge PMOC desktop + rota morta), C2 (nav #oficios), C3 (onboarding "Primeiros passos" no painel), C4 (ConfirmDialog temático), C5 (notificação: cold-start deep-link + cancelar lembretes no logout "manter dados" + teto 150). C5 achou que o warm-start já existia (ffd1065).
- **Onda 6 — QC VISUAL** ✅ (2026-07-17): auditoria por código (5 auditores) — screenshot ao vivo travou (hero 3D) e produção é pré-ondas, então fui por código. Catálogo em `CATALOGO_VISUAL.md`. Achados fortes: OlliButton com ícone `#fff` invisível sob marca clara (P0, 39 arquivos), PainelNovoPlano sem Modal (P0), vários contrastes de categoria, e o VEREDITO CROSS: 3 superfícies parecem 3 empresas (ícone/fonte/raio/dark divergem) → decisão de identidade do dono em BLOQUEIOS.
  - **Nota de segurança:** NÃO digitei a senha da demo em login (regra dura de credenciais). Painel autenticado fica pro dono logar ou build local sem-senha.
- **Onda 7 — Correção visual (bugs objetivos)** ✅ (2026-07-17): F1 contraste app (OlliButton cloneElement cura 39 telas + StepIndicator/categorias/voice/plan), F2 landing polish, F3 app-desktop (PainelNovoPlano→Modal, 460→420, CTA Agenda), F4 painel unifica ícone (solar→lucide). Gate app+painel verde. Identidade cross = dono (BLOQUEIOS).
- **Onda 8 — Fecho de raízes + re-auditoria** ✅ (2026-07-17): G1 fecha "erro vira vazio" (Agenda/Conta/Step4/CodigosErro — 100% da raiz no app); G2 extrai Footer/Header na landing (dedupe, verificado com astro dev + DOM); G3 re-audita os 152 do painel → ~65 fechados, ~19 abertos (top-10 em `REAUDITORIA_PAINEL.md`). app typecheck+test + astro check (0 erros) verdes.
- **Onda VOZ:** design ✅ (`OLLI_VOZ_CONVERSA.md`, 7 especialistas). **Tier A parcial ✅** (2026-07-17): Fase 0 (preço-nulo→R$0 com confirmação) + saudação + leitura-de-volta + banner de falta. tsc+test verdes. Pendentes seguros (follow-up): unificar mic (partir `vozNuvem.pararEEnviar`), casar cliente por voz, extração rica. **Fase 2 (cota/preço) e Fase 3 (Tier B) esperam o dono.**
- **Onda 9 — bugs de dado + mic da voz** ✅ (2026-07-17): H1 (FormEquipamento relê fresco, proximoNumeroOs pagina, FormOs mescla checklist + copy honesta), H2 (senha demo fora dos docs, cache limpo no SIGNED_OUT via singleton), H3 (mic unificado — `vozNuvem` partido). app typecheck+test + webapp tsc verdes (test crashou 1x por flake de libuv do Node/Windows; passou no retry).
- **Onda 10 — mop-up P2/P3 do painel** ✅ (2026-07-17): J1 a11y (badge -darker, aria-label preço/busca/LocalePicker, zh_CN fora), J2 **fluxo de redefinir senha consertado** (nova rota `/nova-senha` — antes mandava e-mail e não trocava a senha) + número de recibo no retry, J3 (MenuDaLinha içado, adapter antd órfão deletado). webapp tsc exit 0.
- **Loop:** raiz "erro vira vazio" 100%, bugs de dado e P2/P3 do painel fechados, voz Tier A pronta. **Restam:** P2/P3 VISUAIS do app (squircle radius, fontSize desktop→Typography, TabelaDados overflow, KpiGrid breakpoint), P3 residuais do painel (STATUS_META, LoginAuthGuard flash, MotionLazy, deps antd no package.json), e as DECISÕES do dono (voz Fase 2/3 + cobrança, identidade visual cross, humanos). Cadência de polish até o dono voltar.
- **Backlog restante** (ACHADOS): "erro vira vazio" em Agenda/Conta (grandes), re-sweep AUDITORIA_ABA_POR_ABA (152), dead code do template Slash, contraste tema claro painel, code-splitting web, prep Play (ícone 512, feature graphic).
