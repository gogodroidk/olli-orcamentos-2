# PLANO DE EXECUÇÃO — "rode em loop" (2026-07-12)

> Backlog codável que une a **auditoria** (`AUDITORIA_GERAL.md`/`FOLLOWUPS.md` → "app perfeito") e a
> **estratégia** (`ESTRATEGIA_SUPERIOR.md` → "superior a todos"), na ordem do roadmap. Verificação de cada
> tarefa: `npx tsc --noEmit` (ignorando `web/`, subprojeto Astro à parte) e `node --check` no worker.
> ⚠️ **Regra Hermes:** nada de APK entregue sem teste no emulador `olli_phone`. Aqui só desenvolvo + typecheck;
> o gate de emulador + simulação de webhook Stripe é obrigatório ANTES de buildar/deployar.
> Decisão do dono confirmada: monetização **híbrida (créditos + módulos + planos)**.

## Legenda
`[x]` feito+verificado (typecheck/node-check) · `[~]` feito, requer teste vivo (emulador/Stripe/Supabase) · `[ ]` pendente

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

- `[ ]` **F1a · Cadastro mágico por CNPJ.** Rota no worker `POST /cnpj` (proxy BrasilAPI, cache 30d no Supabase,
  fallback Casa dos Dados), NUNCA do app direto (padrão `/eta`). Serviço `src/services/cnpj.ts` + tabela
  `CNAE_PARA_VERTICAL` em `src/services/verticais.ts`. Tela de CNPJ no Onboarding com "Não tenho CNPJ" → picker.
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
