# PLANO DE EXECUÇÃO — "rode em loop" (2026-07-12)

> Backlog codável que une a **auditoria** (`AUDITORIA_GERAL.md`/`FOLLOWUPS.md` → "app perfeito") e a
> **estratégia** (`ESTRATEGIA_SUPERIOR.md` → "superior a todos"), na ordem do roadmap. Verificação de cada
> tarefa: `npx tsc --noEmit` (ignorando `web/`, subprojeto Astro à parte) e `node --check` no worker.
> ⚠️ **Regra Hermes:** nada de APK entregue sem teste no emulador `olli_phone`. Aqui só desenvolvo + typecheck;
> o gate de emulador + simulação de webhook Stripe é obrigatório ANTES de buildar/deployar.
> Decisão do dono confirmada: monetização **híbrida (créditos + módulos + planos)**.

## Legenda
`[x]` feito+verificado (typecheck/node-check) · `[~]` feito, requer teste vivo (emulador/Stripe/Supabase) · `[ ]` pendente

## ENTREGUE nesta sessão (2026-07-12) — 10 commits, todos tsc 0 / node --check OK
**Estratégia/direção:** `aa2c103` docs (re-auditoria + estratégia + plano).
**F0 (confiança/receita):** `ebcaceb` login à prova de perda de dados (3 estados) + paywall do plano Empresa (worker).
**F1a (aquisição):** `6242b0a` fundação do CNPJ (worker+domínio+cliente) · `03b98f0` autofill no Onboarding.
**Ondas de correção da auditoria (P1/P2):**
- `c73d866` XSS no PDF (`modeloPdf`) + reduced-motion no OlliSkeleton + calculadora de tinta (serviço).
- `ad716fc` "Feito com OLLI" no portal (growth loop) + reduced-motion na voz/chat.
- `90265fc` sinal/entrada (R$ + data) e laudo técnico passam a aparecer no PDF do cliente.
- `ffd1065` toque na notificação navega pra área certa (payload deixou de ser código morto).
- `f...` NovoOrcamentoScreen usa diálogo temático na web (fim do `window.alert/confirm` — resto do P1-10).
**Nada rodou em emulador/Stripe ainda** — ver o runbook de teste abaixo antes de publicar.

## AINDA NÃO FEITO (precisa do emulador para verificar com segurança, ou é feature maior)
F0c GatePro na Equipe (org-aware) · calculadora plugada no Step2 · temas de PDF por segmento (F1d) ·
`codigos_erro.json` fora do parse de boot (P2, toca o boot) · Fases 2-5 (ledger de créditos, compra PIX,
portal com pagamento, "a caminho" com GPS, verticais). Priorizado nas fases acima.

## RUNBOOK — testar e publicar (só roda no ambiente com emulador/Stripe, ex. C:\olli)
1. **Login (F0a) no emulador `olli_phone`:** logar um usuário EXISTENTE num aparelho novo/limpo, com e sem
   rede. Confirmar que ele cai nas Tabs com os dados sincronizados — NUNCA no Onboarding, e a empresa real
   na nuvem NÃO vira branco. Repetir forçando erro de rede na 1ª checagem.
2. **Paywall (F0b) via Stripe:** conta Grátis tenta convidar → 402 `plano_requer_empresa`; conta Empresa
   ATIVA → convite OK; simular `customer.subscription.deleted` e reconferir que o convite passa a 402.
3. **CNPJ (F1a):** deploy do worker (declarar o binding `CNPJ_RL` no wrangler antes) e testar o botão
   "Preencher pelo CNPJ" no Onboarding com um CNPJ real — confere autofill + segmento deduzido.
4. **Portal "Feito com OLLI":** abrir um link `/o/<token>` e conferir o rodapé + o deep-link.
5. **Build:** seguir a memória `olli-build-apk-windows` (C:\olli, `-x lintVitalRelease`), smoke test no
   emulador (boot sem FATAL — regra Hermes), depois AAB/deploy.
> Enquanto o Workers Build por Git não estiver comprovadamente OFF, todo push na main derruba o worker +
> os 5 rate-limiters (ver KNOWN_BLOCKERS B5) — `reparar.mjs` de plantão.

---

## FASE 0 — Estancar sangramentos (confiança + receita)

- `[x]` **F0a · Login não grava empresa em branco.** `EntrarScreen.tsx` `entrarNoApp` agora usa a regra dos
  3 estados (`tem`/`nao_tem`/`nao_sei`): só vai ao Onboarding quando confirma que a nuvem NÃO tem empresa;
  em erro/rede → Tabs (não-destrutivo, o sync popula). Defesa em profundidade: `cloudSync.ts`
  `empresaNuvemMudouDesdeUltimoPull` sem carimbo local passou a CONSULTAR a nuvem — se já há empresa, puxa em
  vez de sobrescrever. **Verificado: tsc 0 nos arquivos tocados.** → *Teste no emulador antes de shipar:
  logar usuário existente em aparelho novo offline/online; confirmar que a empresa real não é apagada.*
- `[x]` **F0b · Paywall do plano Empresa (worker).** `worker/src/equipe.js` `handleConvite` passou a checar
  `orgTemEmpresaAtivo(env, org_id)` (plano do DONO, `plano==='empresa'` e status fora de
  `{canceled,unpaid,incomplete_expired}`) — 3 estados, `erro`→503 (fail-closed), sem plano→402. **node --check OK.**
  → *Teste vivo: simular webhook Stripe (empresa ativo/cancelado) + convite com conta grátis vs Empresa.*
- `[ ]` **F0c · GatePro nas telas de Equipe (client).** `EquipeScreen`/`EquipeAoVivoScreen` sem gate → o
  usuário grátis vê a tela e só toma erro no POST. Envolver com `<GatePro recurso="equipe">` (preview real +
  CTA "Ver planos", nunca "em breve" — D-05). Tratar o 402 do worker com mensagem clara.
- `[ ]` **F0d · [decisão do dono] grandfathering.** Orgs criadas antes do paywall: bloquear novos convites
  (padrão atual) ou preservar? Se preservar, allowlist/flag antes do gate em `handleConvite`.

## FASE 1 — Aquisição (o funil de entrada)

- `[~]` **F1a · Cadastro mágico por CNPJ — FUNDAÇÃO feita.** `worker/src/index.js` `GET /cnpj/<14díg>`
  (proxy BrasilAPI autenticado, rate-limit gracioso `CNPJ_RL`, empresa normalizada) — **provado ao vivo**
  contra a BrasilAPI. `src/services/verticais.ts` (6 verticais + catálogo de ferramentas + `deduzirVerticais`
  casando CNAE por prefixo, resolve o ambíguo 4322-3). `src/services/cnpj.ts` (cliente, 4 estados, nunca lança).
  Verificado: tsc 0 + node --check OK. **Pendente:** cache 30d (tabela Supabase) + fallback Casa dos Dados +
  binding `CNPJ_RL` no wrangler.jsonc antes de deploy.
- `[~]` **F1a-UI · Autofill por CNPJ no Onboarding — feito.** Botão "Preencher pelo CNPJ" no passo 0:
  autofill (nome/cidade/UF/rua/bairro, só campos vazios) + dedução da vertical pré-selecionando o segmento
  (`VERTICAL_PARA_SEGMENTO`). CNPJ segue opcional ("Não tenho CNPJ" = não preenche). Verificado: tsc 0.
  Pendente: teste no emulador. **Evolução (Fase 4):** trocar os 5 segmentos MVP pela taxonomia rica de
  verticais + os cards de ferramentas ligáveis (`ferramentasSugeridas`).
- `[ ]` **F1b · Ferramentas sugeridas por vertical (cards ligáveis).** `empresa.verticais[]` + `empresa.ferramentas[]`
  (schema-less, aditivo); o Onboarding sugere pelo CNAE, o usuário ajusta. Reusa o padrão de entitlement.
- `[ ]` **F1c · Calculadora no item do orçamento** (m²→tinta, metro linear). `Step2Itens` — maior uau÷esforço.
- `[ ]` **F1d · Tema visual do orçamento por segmento** (reusa o PDF brand-aware).
- `[ ]` **F1e · Empacotar voz→orçamento em 60s** (orquestra o que já existe: `vozNuvem` → wizard preenchido).
- `[ ]` **F1f · Rodapé "Feito com OLLI" no portal público** (`worker/src/link.js`) com deep-link + UTM por prestador.

## FASE 2 — Receita (motor)

- `[ ]` **F2a · `credit_ledger` imutável no Supabase** (migration) + serviço + saldo único; cada gateway grava só após confirmação.
- `[ ]` **F2b · Compra de créditos por PIX/Stripe no painel web** + tabela pública de preços + mesada por plano.
- `[ ]` **F2c · 1º módulo vendável: Reviews Google via WhatsApp** (OS concluída → pedido + 2 lembretes; consome créditos).

## FASE 3 — Encantamento (o "surreal")

- `[ ]` **F3a · Portal do cliente 2.0**: pagamento PIX no link de aprovação + histórico de OS + "pedir novo serviço".
- `[ ]` **F3b · "Técnico a caminho" com mapa vivo no WhatsApp** (reusa `expo-location` + portal).

## FASE 4 — Expansão vertical (1/mês, cada uma com a ferramenta-assinatura)
- `[ ]` Elétrica (checklist NR-10 + laudo + ART) → Hidráulica (estanqueidade) → Dedetização (certificado ANVISA,
  recorrente) → Jardinagem (contrato recorrente reusando PMOC) → Pintura (calculadora).

## FASE 5 — Growth composto
- `[ ]` Indicação em créditos · agendamento online autônomo · iOS (exceção B2B da Apple) · mídia paga de alta intenção.

---

## Correções da auditoria que entram no caminho (por onda, ver `FOLLOWUPS.md` para o detalhe)
Fora da F0, as correções P0/P1 da re-auditoria (troca de conta contamina tenant, backup de equipe ressuscita
dados, `contextoEquipeOwner` 3-estados, gate de UI nos clientes, XSS `modeloPdf`, teto no `/stripe/webhook` e
`/transcrever`, cota de voz no worker, sinal/laudo no PDF, `window.alert` no NovoOrçamento, reduced-motion no
skeleton/voz, handler de toque na notificação, `codigos_erro.json` fora do boot) devem ser encaixadas nas fases
por afinidade — as de **identidade/conta/sync** junto da F0/F1; as de **worker/billing** junto da F2; as de
**UX/reduced-motion/copy** como higiene contínua.
