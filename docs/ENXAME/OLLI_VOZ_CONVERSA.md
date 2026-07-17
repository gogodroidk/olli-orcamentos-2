# OLLI por VOZ — conversa que monta orçamento (quadro geral)

> Ideia do dono (2026-07-17): o prestador clica um botão e **fala** — a Olli vai entendendo, pergunta,
> ele responde, tipo conversa com um funcionário — e sai o orçamento. Custeado por créditos.
> Endurecido por painel de 7 especialistas (run `wf_cf4b0972-60f`). Este é o mapa de implementação.

## Veredito
**A ideia se sustenta** — e ~80% da infra já existe. O que segura o risco (documento de dinheiro) já
está no código: voz sempre gera **rascunho**, cai no **wizard de revisão** (Step1–4), nunca envia sozinho,
e o **campo de texto** fica sempre visível (acessibilidade + fallback). Economia fecha folgada:
Gemini custa **R$0,02–0,10 por conversa inteira**; cobrar **1 crédito por orçamento gerado** dá 5–15× de margem.

## Regra de ROCHA (não-negociável)
1. **Nenhum número entra sem confirmação.** Preço/desconto/sinal que a IA sugere são SUGESTÃO — a Olli
   repete ("R$300 de sinal, confirma?") e só grava com o ok. Reusar o padrão do `Step2Itens` ("preço R$0 = é cortesia?").
2. **Nunca salva direto** — sempre cai no wizard preenchido pra revisão. (Já é o comportamento hoje.)
3. **Voz é atalho de entrada; a revisão continua.** Sem isso, a plataforma perde a cara de séria.

## O que JÁ existe (reusar sem reescrever)
| Peça | Onde | Estado |
|---|---|---|
| STT on-device (grátis, streaming) | `src/services/reconhecimentoVoz.ts` | pronto |
| STT nuvem (grava + `/transcrever`) | `src/services/vozNuvem.ts` | pronto |
| IA multi-turno | `worker/src/index.js` `gemini()` já aceita `contents[]` (o `/chat` usa) | pronto |
| Funil final (montar/revisar/salvar) | `OlliVozScreen.tsx` (Revisao) + `database.ts` | **agnóstico de origem** |
| TTS (Olli falar) | `expo-speech`, usado em `relatorioDia.ts` | existe, **nunca plugado na Olli** |
| Mecânica de chat (bolhas/histórico/retry) | `OlliChatScreen.tsx` | pronto |
| Personalização por ofício | `verticalParaIA` nos 3 endpoints | pronto |
| Contrato de rede no browser | `webapp/.../diagnostico/chat.ts` (mesmo `/chat`, JWT) | prova que dá pra portar |

## O GAP (hoje = ditado de um tiro; vision = conversa)
Hoje `/voz` sempre manda "monte os itens JÁ" num turno — **não existe** o contrato "preciso perguntar antes".
Backend é **stateless por chamada**. Dois níveis:

- **Tier A — melhora o tiro único (cabe na infra atual, barato, 80% do valor):** saudação, **leitura-de-volta**
  ("Entendi: 3 itens pra Dona Helena, total R$X"), banner não-bloqueante quando falta cliente/item, **unificar o
  gesto do microfone** (hoje "tocar o mic" faz coisa diferente no modo dispositivo vs nuvem), extração mais rica
  (desconto/sinal/prazo **com confirmação obrigatória**), casar nome falado com o CRM. **Não muda custo** (é 1 chamada, como hoje).
- **Tier B — a conversa de verdade (Olli pergunta de volta):** dá pra fazer **orquestrado no cliente** (acumula o
  `Orcamento` parcial em estado React + reenvia o histórico ao `gemini()` a cada turno — **sem backend novo com estado**).
  TTS (Olli falar) é **opt-in** ("toque pra ouvir"), nunca automático (campo barulhento). **Multiplica chamadas de IA por
  orçamento → exige trocar a cota de "por chamada" para "por sessão/resultado".** ← decisão do dono.

## Bugs/riscos que o crítico achou (endurecer ANTES de expandir)
- 🔴 **Preço nulo vira R$0 calado** — `montarOrcamento` faz `valorUnitario ?? 0` e "Criar orçamento" só desabilita se `itens.length===0`. Item que a IA honestamente marcou "não sei o preço" vira **R$0 no documento do cliente**. Bug concreto, conserto barato. **P0 — corrijo já.**
- 🟠 **Cota/paywall é decorativa** — o worker **nunca** chama `consumirCreditos` (existe `voz_ia:1`, nunca usado); os "3 usos grátis" são AsyncStorage (reseta reinstalando). Qualquer JWT válido bate no worker direto e gasta Gemini de graça. Mesmo padrão do "Paywall Empresa ausente". → decisão + implementação de cota server-side.
- 🟠 **Nome do cliente nunca é conferido contra o CRM** — voz grava `clienteId:''`; "Dona Helena" vs "Dona Eugênia" passa. Forçar seleção via `searchClientes` quando a origem é voz.
- 🟡 **Offline** — voz é a feature mais divulgada e a ÚNICA que **não** funciona sem internet (app é offline-first). Precisa de aviso PROATIVO antes de gravar (reusar `BarraOffline`). Dono assume isso conscientemente.
- 🟡 **Preço de crédito** — produção cobra R$0,25–0,50/cr; `ESTRATEGIA_SUPERIOR.md` planejava R$0,10–0,15. Divergência (já em BLOQUEIOS).

## Contrato de extração (JSON por turno — serve single-shot e multi-turno; null = "não mencionado", nunca "apagar")
```json
{ "cliente": {"nomeFalado": "string|null"},
  "itens": [{"descricao","quantidade","valorUnitario": "number|null","tipo":"servico|produto","catalogoIdSugerido":"string|null"}],
  "desconto": {"valor":"number|null","tipo":"valor|percentual|null"},
  "condicoesPagamento":"string|null", "formasPagamento":{"pix","credito","debito","dinheiro":"boolean|null"},
  "sinal":{"valor":"number|null","data":"string|null"}, "laudoTecnico":"string|null",
  "prazo":{"validadeOrcamento","dataVisitaTecnica","agendamentoServico":"string|null"}, "observacao":"string|null","titulo":"string|null" }
```
Regras: dinheiro só `number` ou `null` (nunca 0/vago); cliente resolvido **no app** por `searchClientes` (worker nunca casa); `catalogoIdSugerido` revalidado local; data relativa ("semana que vem") resolvida mas **mostrada** pra confirmar; só `cliente + 1 item` bloqueiam criar.

## Onde implementa (cross-superfície)
- **App (agora):** evoluir `OlliVozScreen` (Tier A) → depois Tier B. Base toda aqui.
- **Painel web (gap real):** hoje **zero** captura de voz. Portar o padrão dual: Web Speech API (= modo dispositivo) + `MediaRecorder`→`/transcrever` (= nuvem). ⚠️ o worker precisa aceitar `audio/webm` na whitelist (`TRANSCREVER_MIME_OK` não tem hoje).
- **Worker:** Tier A reusa `/transcrever` modo `orcamento`; Tier B reusa `gemini()` multi-turno (orquestração no cliente) OU um `/conversa` stateful (só se quiser sessão no servidor). Ligar `consumirCreditos` nas rotas de IA.

## Extensões (mesma engine — "crie novas")
Reusa `useGravadorNuvem` + um `modo` novo no worker (quase zero backend):
- **Agora (trivial):** mic na **Nota do Dia** (`RelatorioDia` já FALA, não OUVE), mic no **OlliChat**, mic no **Sintoma** do Diagnóstico.
- **Agora (médio):** voz no **checklist/status da OS** (mãos sujas — mas com tela de revisão, nunca fecha OS direto da transcrição); **"cobrança por voz"** = abrir WhatsApp pronto (⚠️ NÃO é envio de Pix real — a copy tem que deixar claro).
- **Depois:** agenda por voz (datas pt-BR), cliente/equipamento por voz (equipamento no campo + foto tem valor PMOC).
- **Não fazer:** onboarding inteiro por voz (o cadastro por CNPJ já resolve).

## Plano em fases
- **Fase 0 — endurecer (P0, faço já):** matar o preço-nulo→R$0.
- **Fase 1 — Tier A (app):** saudação + leitura-de-volta + banner de falta + unificar gesto do mic + extração rica com confirmação + casar cliente. Não muda custo.
- **Fase 2 — cota real (DONO decide o modelo):** `consumirCreditos` no worker; migrar "grátis" pro ledger; **1 crédito por orçamento gerado**; 1ª conversa grátis; mesada nos planos pagos.
- **Fase 3 — Tier B (conversa de verdade):** multi-turno orquestrado no cliente + TTS opt-in. **Só depois da Fase 2.**
- **Fase 4 — painel web:** Web Speech + MediaRecorder + `audio/webm` no worker.
- **Fase 5 — extensões:** Nota do Dia / OlliChat / Sintoma primeiro.

## Decisões do DONO (mudam o que eu construo)
1. **Tier A já resolve, ou você quer a conversa de verdade (Tier B) que pergunta de volta?** (Tier B dá pra fazer sem backend novo, mas exige a Fase 2 de cota.)
2. **Cobrança:** 1 crédito por **orçamento gerado** (recomendo) vs por turno vs manter os 3 grátis/mês. E ligar a cobrança de verdade no worker (hoje é de graça/burlável).
3. **Olli fala de volta (TTS)?** Recomendo opt-in ("toque pra ouvir"), nunca automático.
4. **Voz no painel web agora, ou só mobile por enquanto?** (mãos-sujas é mobile; painel pode esperar.)
5. **Assumir que voz não funciona offline** (aviso proativo) — ok?
