# VISÃO DE COMUNICAÇÃO & INTELIGÊNCIA — notificação, mensagem pro cliente, feedback

> Painel de 6 especialistas + síntese-mestra do **Fable** (run `wf_6b010467-c66`, 2026-07-17).
> Aprofunda `ENGAJAMENTO_VISAO.md` (é o "capítulo do gatilho" que faltava). Pedido do dono: notificações
> inteligentes/sincronizadas com a agenda + o OLLI sugerindo a fala pro cliente + loop de feedback.

## Tese: 3 circuitos que hoje estão MUDOS (e 60-80% da infra já existe)
- **↓ PARA DENTRO (notificação):** o app fala com o prestador só quando há valor real em 1 toque, sincronizado com a agenda REAL (ETA/trânsito, vão livre, colisão) — nunca relógio fixo, nunca no vazio.
- **↑ PARA FORA (mensagem pro cliente):** os 5 sinais que já são calculados em silêncio ganham a **fala pronta pro cliente DELE**, derivada do dado real do orçamento, pré-preenchida no WhatsApp, **nunca enviada sozinha**.
- **↺ PARA CIMA (feedback):** ouve o prestador no fim do dia → guarda → analisa em massa → **fecha o ciclo** avisando quem pediu quando a melhoria chega ("você pediu, chegou").

**O trabalho não é construir sistema novo — é LIGAR os fios.** Descobertas: `mensagensOrcamento.ts` já tem 6 templates (`montarMensagemFollowUpOrcamento` é **código morto sem botão**); `public.feedback` + `enviarFeedback()` + `/admin` já existem; `link.js` já grava o evento "aprovado"; ETA/`EtaChip.tomDaFolga`, TTS `falarRelatorio`, radares — tudo pronto.

## Sistema de notificação (o gatilho que faltava)
**2 âncoras + agenda real + adaptativo:**
- **"Bom dia da OLLI" (07h):** manchete = sinal mais quente (compromisso hoje > R$ parado > cliente sumido > PMOC ≤15d), dos 4 loaders da Home. **Só se há sinal real** (senão silêncio). Reagendada toda noite (idempotente, como `pmocLembretes`).
- **"Fechar o dia" (18h config.):** só se `relatorioDia.semMovimentos===false`; prévia + toque pra ouvir o TTS.
- **Tudo o mais AGREGA** nessas 2 âncoras. Teto = 2 notificações de engajamento/dia. Exceção: push "cliente APROVOU" (raro, altíssimo valor).
- **Agenda-sync:** lembrete de visita deixa de ser 60min fixo → calibrado pelo ETA real (recalc no boot da manhã; fallback 60min preservado). Aviso proativo de atraso (folga negativa vira "avisar cliente" em 1 toque). Colisão de horário pós-sync.
- **Adaptativo:** quem age muito recebe menos empurrão; quem não age recebe o reforço. **Sempre pra baixo**; dormente = silêncio, nunca cobrança.
- ⚠️ **Honestidade de stack:** sem TaskManager/BackgroundFetch, recálculo só roda com app aberto (ancorar nos 2 momentos rituais). Notificação local tem conteúdo estático → ETA preciso fica no chip da Home, não no push.

## Assistente de comunicação (o OLLI dita, o prestador aperta Enviar)
7 momentos, todos de campo real (zero invenção), `abrirWhatsApp` pré-preenche e **o Enviar é humano** (guardrail nativo):
(1) enviar orçamento [já existe; add sinal+prazo] · (2) follow-up de proposta parada [ligar o código morto] · (3) confirmar visita na véspera · (4) lembrar sinal a vencer [**BLOQUEADO** até decidir modelagem sinal/saldo] · (5) agradecer pós-serviço · (6) **pedir indicação** [motor de boca-a-boca] · (7) avisar cliente do PMOC.
**Regra 90/10:** template é a fonte (grátis, offline, preciso); IA (Gemini) é só um botão OPCIONAL "deixar mais pessoal" — nunca o padrão, nunca queima crédito em ação batida.

## Loop de feedback (ouvir → guardar → analisar → avisar quem pediu)
- **Ouvir:** "Pulso da semana" (1 toque emoji, pulável, **≤1x/14 dias**, só semana com movimento) em `HojeScreen` (tela UNIVERSAL — pega o técnico também, não só gestão). + recado por voz no Fechar-o-dia (a mesma Olli que fala o relatório escuta). **Linha vermelha: a Nota do dia é diário do NEGÓCIO, nunca minerada como feedback.**
- **Guardar:** `public.feedback` (já existe) + nota no JSONB (sem migração).
- **Analisar em massa:** síntese mensal → temas (hoje a triagem é 1-a-1 e nunca vira roadmap).
- **Fechar o ciclo:** quando a melhoria pedida chega, o usuário que pediu recebe "Você pediu, chegou" — **o gerador de lealdade mais barato que existe.**

## Plano em fases (alinha 1:1 com ENGAJAMENTO_VISAO)
- **Onda 0 (prereq):** ligar analytics (signup/quoteCreated/quoteApproved) + evento "ação tocada a partir de sinal" + **tela de preferências de notificação** (toggle por canal/horário/domingo — não existe hoje) + baseline.
- **Onda 1 (1 sprint, ZERO backend, alto impacto):** colher o maduro — radar de follow-up + ligar o template morto · agradecimento+indicação no recibo · botão "avisar cliente" na notificação PMOC · confirmação de visita na Agenda.
- **Onda 2 (ritual, 100% notificação local):** Bom-dia + Fechar-o-dia + lembrete por ETA + aviso de atraso.
- **Onda 3 (ouvir+adaptar):** Pulso da semana + recado por voz + cadência adaptativa + colisão.
- **Onda 4 (backend novo):** push "cliente aprovou" (Expo token + `link.js`) + síntese de feedback + "você pediu, chegou".
- **Onda 5 (decisões do DONO):** modelagem sinal/saldo (bloqueia o lembrete de sinal) · gate de plano dos radares novos · incentivo de indicação em crédito · botão IA "mais pessoal" (custo).

## Limites duros (anti-spam / anti-dark / LGPD) — cravados
Teto 2/dia · silêncio 07h-20h + domingo mudo (sinal fora da janela é RETIDO, vira manchete do Bom-dia) · sem sinal = silêncio · "visualizado" NUNCA vira push · adaptação sempre pra baixo (dormente = silêncio, nunca "tom de dívida") · nenhuma mensagem ao cliente enviada sozinha · cliente final nunca é refém · número medido ou nada (ETA "~X min", nunca falsa precisão) · push de aprovação com nome/valor ocultos no lockscreen · Nota do dia nunca minerada · Pulso pulável, ≤1x/14d · erro nunca vira vazio · copy derivada da fonte · não codar o lembrete de sinal antes da decisão de modelagem.

## Sinergia
Menos-cliques levado ao limite (a mensagem que ele levaria 3min digitando chega pronta) · voz (Fechar-o-dia ancora o TTS; o recado por voz fecha a simetria — a Olli que fala é a que escuta) · identidade (a Olli vira personagem consistente: acorda junto, sopra a fala certa, comemora com lastro, pergunta como foi o dia).
