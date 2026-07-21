# INTEGRAÇÕES — ideia PARKED (não construir agora)

> Dono (17/07): "seria legal ter diversas integrações. Ex.: integração do WhatsApp que LÊ e RESPONDE
> o WhatsApp do cliente dele, e a gente cobra por isso. **Não vamos fazer agora — já é muita coisa —
> é só uma ideia.** Faça uma busca pra a gente ter uma noção de quais integrações são interessantes."

## Status: PARKED. Só pesquisa/visão. NÃO implementar.
Foco atual segue: menos-cliques → voz+cobrança → identidade → engajamento/comunicação/feedback.

## Ideia-âncora do dono
**Assistente de WhatsApp do cliente:** o OLLI lê as mensagens do cliente do prestador e responde por
ele (com IA), poupando o tempo do prestador. Monetizável (crédito/plano).
- ⚠️ **Reality-check obrigatório** (a pesquisa confere): a Meta NÃO permite ler/automatizar o WhatsApp
  PESSOAL. O caminho oficial é o **WhatsApp Business Cloud API** — o número comercial DO PRESTADOR é
  conectado e o OLLI responde os clientes DELE dentro das regras (janela 24h, templates aprovados,
  preço por conversa). Automação de WhatsApp pessoal = risco de banimento. Distinguir isso é o pulo do gato.
- Hoje o OLLI já usa o caminho SEGURO: deep link `wa.me` com mensagem pronta (1 toque) — sem API, sem risco.

## Pesquisa (feita 17/07, busca web real — `wf_314a1c9c`). Continua PARKED.

### 🚨 ACHADO CRÍTICO (não é integração — é correção): Nuvem Fiscal MORRE em 31/07/2026
O provider fiscal escolhido no **ADR-0011** anuncia desativação em 31/07/2026 (confirmado no site). **ADR-0011 está obsoleto** — quem for fazer nota fiscal um dia NÃO deve codar em cima do Nuvem Fiscal. Substituto indicado: **Focus NFe** (R$89,90/mês, integra município novo em 15 dias por R$199 fixo). Registrar quando mexer em fiscal.

### Veredito do WhatsApp (a ideia-âncora do dono)
- ❌ **A ideia literal (ler/responder o WhatsApp DO CLIENTE) não existe** — a Meta não deixa automatizar WhatsApp pessoal; On-Premises foi descontinuada; só a **Cloud API** existe.
- ✅ **Versão viável:** conectar o número **comercial DO PRESTADOR** à Cloud API; a Olli responde os clientes dele com IA — MAS: exige **CNPJ** (trava autônomo), **disclosure de IA obrigatório** (política Meta jan/2026, não dá pra fingir que é o prestador), custo **por mensagem** que **sobe em 01/10/2026** (service messages, hoje grátis dentro da janela 24h, passam a custar ~R$0,035). BSP oficial: 360dialog/Twilio/Gupshup.
- ⚠️ **Versão "fácil" (Z-API/Baileys por QR, não-oficial):** viola ToS; o padrão PROATIVO que o OLLI já usa (cobrança/reconquista) = **15-30% de risco de banimento em 12 meses**. Não vender isso.
- 💡 O OLLI **já tem** o caminho seguro: `src/utils/mensagensOrcamento.ts` (templates de envio/follow-up/cobrança/reconquista/avaliação) + `wa.me` deep link — zero API, zero custo, zero risco, 1 toque. E `creditos.js` já tem `whatsapp_utilidade:1`/`whatsapp_marketing:5` prontos pra quando for a Cloud API.

### TOP 5 integrações (ordem de implementar, quando sair do parked)
1. **Link de avaliação do Google** (Place ID nativo) — custo/aprovação ZERO, reusa `wa.me`; pede avaliação ao cliente após orçamento aprovado. `creditos.js` já tem `review_google:3`. **Maior ROI da lista.**
2. **PaymentProvider com InfinitePay** — o prestador cobra O CLIENTE dele (Pix 0%, aceita CPF puro). Dor real, ~1 arquivo (espelha `abacate.js`), `ports/PaymentProvider` já existe vazio.
3. **Webhooks de saída** (orçamento aprovado/pago/OS concluída, HMAC) — automação Zapier/Make sem cair na licença do n8n (que proíbe revenda); o prestador conecta sozinho.
4. **Terminar o Google Calendar sync** — `googleAgenda.ts` já 90% pronto atrás de flag; falta só o passo humano B3 (OAuth Android + SHA-1). Maior retorno por esforço marginal.
5. **ZapSign** (não Documenso) pra contrato/garantia/PMOC — mais barato, API nativa, entrega por WhatsApp casa com o DNA. POC comparativo antes de travar.

**Fora:** fiscal (Nuvem Fiscal morrendo + fragmentação municipal + exige certificado digital); marketplaces (GetNinjas/Triider sem API de parceiro, Habitissimo morreu out/2024, "iQuilibrio" é esoterismo — nome errado?); contabilidade (vem de brinde com Asaas).

> Tudo isso é **DEPOIS** — o dono disse "não agora". Registrado pra não perder. Foco segue: menos-cliques, voz, identidade, engajamento.
