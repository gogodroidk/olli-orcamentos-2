# BLOQUEIOS — só o dono resolve (o enxame NÃO tenta, só reporta)

> Regra do loop: item humano → registra aqui e segue. Quando o dono voltar, esta é a lista dele.
> Fonte: Onda 1 (2026-07-17). Marcar `[x]` quando o dono resolver.

## Destrava RECEITA (sem isso, ninguém paga)
- [ ] **MP_WEBHOOK_SECRET** ausente no cofre do worker (o `MP_ACCESS_TOKEN` já está lá). Único item que liga Pix/cartão. Registrar o webhook no painel Mercado Pago.
- [ ] **3 migrations no Supabase de produção** (ordem importa, fora de ordem = 500/503): `20260724_webhook_events.sql` → `20260725_equipe_grandfathering.sql` → `20260726_credit_ledger_imutavel.sql`. O código já assume que existem.
- [ ] **Stripe:** habilitar "Installments" (parcelamento BR) + criar 3 Prices (`olli_pro_12x`, `olli_empresa_mensal`, `olli_empresa_anual`) com lookup_keys.
- [x] **Cobrança de crédito da VOZ** — ✅ **APROVADO pelo dono (17/07): "ligar cobrança de crédito e voz, deixar tudo funcionando".** Decisão minha (dúvida→decido): manter os preços de pacote JÁ VIVOS no worker (R$0,25-0,498/cr — não mexer em preço live); consumo = **1 crédito por orçamento gerado por voz** (não por turno), 1ª conversa grátis, migrar os 3 usos grátis pro ledger (server-side, não burlável). **EM EXECUÇÃO** (Voz Fase 2).

## Google Play (trilha da loja — detalhe em LOJA.md)
- [ ] Abrir + pagar conta Play Console (cartão/CNPJ).
- [ ] Decidir conta pessoal vs. organização (pessoal = teste fechado 12 testadores × 14 dias antes de produção; organização isenta).
- [ ] Login EAS/Expo (`eas whoami` = Not logged in agora).
- [ ] Aprovar screenshots + feature graphic 1024×500 (não existem no repo).
- [ ] Responder questionário de classificação de conteúdo (IARC) e aceitar termos.
- [ ] Clique final de publicar/enviar para revisão.
- [ ] Confirmar senha da keystore de upload no cofre (chave já existe: `CONFIG CLAUDE/olli-keystore/olli-upload.jks`).

## Infra / chaves
- [ ] **Chave PostHog** (projeto não criado) — feature codada e desligada até a chave existir.
- [ ] **Chave Resend + verificar domínio** `mail.olliorcamentos.online` — sem isso o e-mail de convite falha calado (best-effort).
- [ ] **TOTP/MFA na conta ADMIN_EMAIL** (Supabase Auth) — enforcement aal2 é poucas linhas quando o fator existir.
- [x] ~~Rotacionar senha da conta demo GR Tech~~ — **DECIDIDO NÃO FAZER** (dono, 17/07): ele exclui a conta depois. Não perguntar mais. Ver memória `olli-senha-demo-nao-rotacionar`.
- [ ] **OAuth client Android** (precisa do SHA-1 do keystore de release) — login Google nativo + Google Agenda no APK.
- [ ] **Consent screen OAuth** (escopo calendar.events) — verificar submissão pra revisão Google (lead time 1-4 semanas).
- [ ] **pg_dump --schema-only das 13 tabelas legadas** → baseline versionado (exige sessão com acesso live ao Supabase).

## Decisão de produto (do dono)
- [x] **IDENTIDADE VISUAL UNIFICADA** — ✅ **APROVADO pelo dono (17/07): "quero completo isso daí, execute tudo da melhor forma".** Direção: convergir as 3 pontas pra linguagem do APP (família de ícone única, painel adota Plus Jakarta+Spectral, escala de raio única, dark navy no painel, emoji→SVG na landing, status colors unificados). Detalhe em `CATALOGO_VISUAL.md`. **EM EXECUÇÃO** (workstream próprio).
- [ ] **O2-19 numeração atômica** — 4 opções em FOLLOWUPS #31 (a "opção 4" sozinha tem furo). Depois de decidir, o SEED da migration por tenant precisa conferir o banco real.
- [ ] **Emulador olli_phone** — prova ao vivo de O0-1/O0-2/O0-3 (exige digitar senha; o piloto não faz).
- [ ] **APK final** — regra do dono: só builda quando o ciclo comercial estiver perfeito e testado; aprovação do momento é dele.

## Conectores MCP que precisam de OAuth (sessão não-interativa não autentica)
- [ ] **mercadopago** e **cloudflare** MCP pedem login `/mcp` interativo. Sem eles, opero MP/CF por CLI/REST quando possível, ou marco bloqueado.
