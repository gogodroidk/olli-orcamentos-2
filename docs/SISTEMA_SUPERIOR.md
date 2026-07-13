<!--
  SISTEMA SUPERIOR — spec + backlog priorizado. Sintese de pesquisa avancada (7 frentes,
  Fable) 2026-07-12: o que o OLLI precisa ter pro TECNICO amar, o prestador dizer "isso e
  diferente" e PAGAR COM GOSTO. Ancorado no que JA EXISTE (verticais.ts, portal, radares,
  voz Gemini, PMOC, Stripe, offline-first). Complementa docs/ESTRATEGIA_SUPERIOR.md.
-->

# SISTEMA SUPERIOR — plano de execução

## A TESE (Fable)
O OLLI ganha **não por ter mais features, mas por ser o único app que SE VESTE DO OFÍCIO** do
prestador. Ninguém (Jobber/Housecall/Auvo) tem dedução de vertical por CNAE. Estratégia em 3 camadas,
**nesta ordem**, sempre ancorando no que já está pronto (nada de refazer fundação):

1. **PERSONALIZAÇÃO POR VERTICAL** — o pintor abre e vê calculadora de tinta; o dedetizador vê certificado
   ANVISA; a IA fala a língua do ofício. Efeito "app feito pra mim" que nenhum genérico replica.
2. **AMOR DO TÉCNICO** — fechar os 4 atritos de campo baratos (ligar/navegar em 1 toque, voz nos campos,
   scanner do QR, sol/lua no header), quase tudo reuso de infra pronta.
3. **LOOPS QUE VENDEM SOZINHOS** — radar de reputação, indicação, antes/depois, Pix do cliente final,
   reaproveitando o portal público e o motor de radares.

Monetização **não muda preço** (R$39/R$99 já é 1/10 do gringo) — muda **gatilho**: paywall contextual,
garantia 30 dias, ancoragem, prova social, **Pix**.

## COMO FAZER A PERSONALIZAÇÃO POR VERTICAL (prioridade nº1, detalhada)
1. **PERSISTIR**: `verticais: VerticalId[]` + `ferramentasAtivas: FerramentaId[]` no perfil da org
   (Supabase + cache offline). O onboarding já chama `deduzirVerticais(cnae)` — hoje o resultado morre
   como rótulo; passa a ser gravado como **default editável** em "Meu ofício" (MeuNegocioScreen). A dedução
   nunca impõe (regra do `verticais.ts`).
2. **GATE CENTRAL**: hook `useVertical()`/`temFerramenta(id)` que toda tela especializada consulta. PMOC,
   códigos de erro e diagnóstico HVAC gated por `'refrigeracao'`. **`geral` ou sem-vertical = fluxo atual**
   (backward-compat: usuário existente não perde nada).
3. **HOME POR VERTICAL**: HojeScreen monta atalhos a partir de `ferramentasSugeridas(verticais)`.
4. **IA POR VERTICAL**: o payload de voz/diagnóstico leva `vertical`; o worker injeta system prompt +
   few-shots + schema por segmento na MESMA infra Gemini (prompt parametrizado, não modelo novo).
5. **CONSTRUIR AS FERRAMENTAS** (copiando o padrão PMOC: form + PDF brand-aware + gate de plano), na ordem
   mais-pronta-por-norma:
   - **Certificado ANVISA** (dedetização) — RDC 622: 11 campos fechados + validade por praga (cupim=12m,
     baratas=3-6m) + telefone do CIT. Esforço **P**.
   - **Calculadora de tinta** (pintura) — `litros=(m²×demãos)÷rendimento+10%`, no item do orçamento. **P**.
   - **Contrato recorrente** (jardinagem/dedetização) — reusa o motor do PMOC trocando o checklist. **P/M**.
   - **Checklist NR-10 + laudo elétrico** — ~30 pontos NBR 5410, foto por item, campo ART, preço ref. R$500-2.000. **M**.
   - **Laudo de estanqueidade** (hidráulica) — NBR 5626 (1,5× pressão de serviço ou 60 mca, 1h sem queda),
     **timer de 1h embutido** com foto timestampada. Laudo avulso vale **R$3-7 mil** — paga o app sozinho. **M**.
   - **PMOC calibrado por norma** — periodicidade POR PEÇA pré-preenchida (filtro/bandeja mensal, ventilador semestral).
6. Ligar `disponivel:true` conforme constrói; tela Ferramentas mostra as da vertical primeiro.
7. **NOVAS VERTICAIS** (só adicionar entrada no array VERTICAIS): serralheria, gesso/drywall (P), TI/assistência,
   marcenaria, estética (M), **solar** (checklist REN 1000 + contador de 15 dias úteis — G, maior valor/esforço).

## PAGAR COM GOSTO (não mexer no preço — mexer no gatilho)
Paywall **contextual** no momento em que a cota de IA zera, com ROI da vertical ("1 laudo de estanqueidade
vale R$3-7 mil; o Pro custa R$39"); **garantia 30 dias** no card (+15-26%); **ancoragem** de 3 planos +
"a maioria escolhe o Pro" (+1,4×); **prova social** (2-3 depoimentos com resultado, +34%); **Pix** (religar
no worker → Pix Automático na assinatura — 40% do volume do país, barreira nº1); créditos avulsos de IA no
Grátis. **Regra de ouro anti-GetNinjas: NUNCA cobrar por tentativa/lead — só assinatura + custo variável real.**

## "ISSO É DIFERENTE" (as features que o prestador evangeliza)
App que se veste do ofício (CNAE→vertical) · ferramenta-assinatura que vale dinheiro (laudo R$3-7 mil no
celular) · IA foto+voz do ofício · voz que EXECUTA ("concluí, troquei o capacitor" fecha a OS) · chegou-
escaneou-abriu-a-ficha (QR) · tudo num fio de WhatsApp · Pix no recibo · radar de reputação + indicação ·
antes/depois no portal · **lucro de verdade** (não faturamento) · contrato que cobra sozinho · NFS-e automática.

## BACKLOG PRIORIZADO (39 itens, por fase)
> Detalhe completo no journal do workflow. Ordem = maior "amor do técnico / isso é diferente" por esforço.

**FASE 1 — App do ofício** (o pré-requisito de tudo)
- [x] **Motor de personalização por vertical** — `verticais.ts` + `useVerticais` (store reativo). Deduz no
  onboarding (CNAE→`Empresa.verticais`, schema-less), editável em "Meu negócio", gate esconde HVAC
  (Equipamentos/PMOC/Diagnóstico) para outros ofícios em SidebarNav + Ferramentas (mobile E desktop).
- [x] IA por vertical — worker `rotuloVertical()` + `vozSystem`/`chatSystem` (VOZ/CHAT/transcrever); cliente
  injeta `vertical` via `verticalParaIA()`. Default = HVAC (backward-compat). Diagnóstico segue HVAC-only.
- [x] Calculadora de tinta (pintura) — `CalculadoraTintaScreen`, gate por `vertical:'pintura'`, resultado
  vira item de orçamento (`PrefillItem.quantidade`). [ ] Certificado ANVISA (dedetização). **P** · [ ] Contrato recorrente. **P**
- [x] BÔNUS: Checklist por ofício na OS (`checklistVertical.ts`) — kickstart de 1 toque por vertical.

**FASE 2 — Amor do técnico**
- [x] Botões "Ligar"/"WhatsApp"/"Ir até lá" no detalhe da OS (Linking tel:/wa.me/maps; busca o Cliente p/ contato+endereço).
- [ ] Sol/lua no header da execução (reusa toggleTema). **P**
- [ ] `CampoComVoz` (TextInput+microfone) em observações/checklist/PMOC. **M**
- [ ] Scanner de QR do equipamento (expo-camera). **M**
- [ ] Paywall contextual com ROI da vertical. **P** · Garantia 30 dias + ancoragem. **P** · Prova social. **P**

**FASE 3 — Loops que vendem**
- [ ] Radar de reputação (review Google via WhatsApp). **P** · Indicação. **P** · Antes/depois no portal. **P**
- [ ] Link de rastreamento "a caminho" por WhatsApp. **P** · Meta de faturamento/lucro no KpiCard. **P**
- [ ] Religar Pix no worker + QR Pix dinâmico no recibo/portal. **M** · Foto no diagnóstico IA. **M** · Voz-ação. **M**

**FASE 4 — Verticais onda 2 + cérebro do dono**
- [ ] Laudo NR-10 elétrico. **M** · Laudo de estanqueidade (timer 1h). **M** · PMOC calibrado. **M**
- [ ] Comissão por técnico. **M** · Despesas gerais (OCR). **M** · **"Resultado do mês" (DRE simples)**. **M**
- [ ] Cobrança recorrente do cliente final (gate anti-Auvo). **M** · Orçamento 3 opções. **M** · Agendamento self-service. **M** · Roteirização. **M**

**FASE 5 — Apostas grandes**
- [ ] Solar (checklist REN 1000). **G** · Inbox WhatsApp oficial. **G** · **NFS-e automática**. **G** ·
  Pix Automático na assinatura. **G** · OLLI ao vivo (Gemini Live / escriba ambiente). **G** · Whisper on-device. **G** · Financiamento no ato. **G**
