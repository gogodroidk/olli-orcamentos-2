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
- **Onda 5 — Coerência visual & limpeza** (próxima): (C1) dead code seguro (rota TecnicoHome morta, resíduo do template Slash no painel, `webapp/package-lock.json` órfão); (C2) badges PMOC com contraste (`corCategoriaEmChip`), nav da Home linkando #oficios, painel com empty-state de onboarding; (C3) `NovoOrcamento` window.alert→ConfirmDialog + notificação (deep-link morto + cancelar lembretes no logout). Fan-out disjunto. **Depois:** Onda de QC visual (screenshots via demo) + prep Play (ícone 512, feature graphic).
