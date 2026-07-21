# VISÃO DE ENGAJAMENTO — vício SAUDÁVEL do OLLI

> Painel de 6 especialistas de comportamento/psicologia + síntese-mestra do **Fable** (run `wf_cef44401-abf`, 2026-07-17).
> Pedido do dono: usuário viciado no OLLI. Enquadramento: **vício por VALOR REAL, não por truque.** Zero dark pattern.

## TESE (o Fable)
O prestador não vicia por truque — vicia porque o OLLI vira **o sócio que vigia o dinheiro e os clientes dele
enquanto ele está com a mão na massa, e só o chama quando tem valor real esperando.** O app já calcula em silêncio
todos os momentos que importam (dinheiro parado, cliente sumindo, manutenção vencendo, dia fechado). Falta **fechar o
circuito**: empurrar esse valor pra FORA do app (hoje é 100% pull) e **ecoar reconhecimento** quando o prestador
resolve — em especial no elo mudo hoje: **o dinheiro que ENTRA.**

**Regra de ouro (é o que torna saudável e sustentável por meses):** toda notificação carrega um dado real de negócio
acionável em **1 toque**; toda celebração tem lastro em dinheiro ou relação. **Nunca "abra o app", nunca badge vazio.**
Assim cada abertura se paga em reais/tempo, e sair do OLLI passa a significar **voltar a perder dinheiro por esquecimento.**

## Vetores de indispensabilidade (o que gruda — legítimo)
1. **Dinheiro vigiado** — radar de cobrança com Pix Copia-e-Cola embutido; só o OLLI sabe quanto está parado e resolve em 1 toque.
2. **Memória do negócio** — cada cliente/orçamento/recibo/nota alimenta radares e relatórios; sair = perder a memória viva do negócio.
3. **Retorno recorrente estrutural** — PMOC/manutenção = receita programada que MORA no app; o OLLI é quem lembra do dinheiro futuro.
4. **Ritual diário com valor** — "Bom dia da OLLI" + "Fechar o dia": duas âncoras temporais, nunca no vazio.
5. **Voz como menor esforço** — orçar falando é o AHA; ouvir o dia fechar por TTS é o espelho noturno.
6. **Reconhecimento com lastro** — comemorar só dinheiro/relação real (recibo, cliente reconquistado, recorde honesto, marco).

## Loop diário (concreto)
**Manhã (~7h, só se há sinal real; senão silêncio):** "Bom dia da OLLI" montada com os 3 loaders que a Home já roda
(próxima parada, R$ parado, cliente sumido) → toque → Home no hero nunca-vazio → ação de 1 toque já pronta
("Estou a caminho" com ETA / "Cobrar no WhatsApp" com Pix / "Chamar" o sumido). **Durante o dia:** gatilhos eventuais
que já existem (60min antes, PMOC) + futuro push "cliente aprovou" (dinheiro em tempo real); cada resolução ecoa
na hora (recibo → Celebração "recebido"). **Fim do expediente (~18h configurável, só se houve movimento):** "Fechar o
dia" → Relatório falado (TTS) + recorde honesto + Nota do dia. À noite o app **reagenda sozinho** os avisos de amanhã.
O trabalho de hoje alimenta os radares que geram o gatilho de amanhã.

## Diagnóstico: o OLLI já tem 3/4 do Hook Model
- **Ação fácil** ✅ forte (hero sem clique, WhatsApp+Pix 1 toque, voz, OS 1 toque).
- **Investimento** ✅ real (clientes→radar, PMOC→retorno, Nota→diário).
- **Recompensa variável** ✅ semente ética (radares mudam com o negócio real) — mas `Celebracao` é fixa e a variável só é vista se abrir o app.
- **Gatilho** ⚠️ **elo fraco** — só eventual (60min/PMOC); em dia sem agenda, NADA traz de volta. **É o buraco a fechar.**

## Plano em fases (impacto × esforço, ancorado no que já existe)
- **Onda 0 — Medir antes de mexer (dias, pré-requisito):** ligar os eventos de analytics que **nunca disparam** —
  `signup` (fim do cadastro), `quoteCreated` (no fluxo MANUAL, hoje só na voz), `quoteApproved` (no `updateStatus('aprovado')`).
  Baseline D1/D7/D30. Reusa `services/analytics.ts` (eventos já definidos, faltam as chamadas). **Sem isso é aposta cega.**
- **Onda 1 — Fechar loops já abertos (1 sprint, baixo esforço, alto impacto, zero backend):** hero nunca vazio · "Já recebi
  → emitir recibo" 1 toque do card de cobrança (pré-preenchido) · `Celebracao` tipo "recebido" com dias-parado · "Adiar 30
  dias" agenda a notificação do vencimento. Reusa HomeScreen/Celebracao/radarCobranca/pmocLembretes.
- **Onda 2 — O ritual diário (2-3 sprints, 100% notificação LOCAL):** "Bom dia da OLLI" (3 loaders, só se sinal; padrão
  idempotente cancela-e-recria) · "Fechar o dia" (RelatorioDia + TTS + Nota) · recorde pessoal honesto · checklist da 1ª
  semana (4 ações de valor) · **toggle próprio por canal**. Reusa NotificationProvider/agenda.ts/relatorioDia/onboarding.
- **Onda 3 — Reconhecimento com lastro + PMOC no loop (2 sprints):** Celebração "reconquistado" (diferenciar de snooze) ·
  PMOC vencendo como 2º sinal do hero · marco de cliente Nº N · resumo mensal (1x, toggle) · "Orçar de novo" (duplicar) ·
  "Compartilhar a vitória" opt-in.
- **Onda 4 — Push REMOTO: a notícia de dinheiro (worker + Expo push/FCM):** push SÓ no evento "aprovado" do link do cliente
  (o worker já detecta; `eventos.push({tipo:'aprovado'})` já existe) — o momento de dinheiro fechando, hoje mudo. Registrar
  Expo push token no login; compartilhado app+painel. **NÃO** push em "visualizado" nesta fase.
- **Onda 5 — Economia de valor (EXIGE decisão de custo do dono):** cortesia de voz por crédito no gate dos 3 grátis ·
  crédito-presente por marco real (origem 'promo') · indicação vira crédito pros dois lados (só quando o convidado ATIVA).
  ↔ amarra com a cobrança de voz (Fase 2 da voz) que já vou construir.

## Métricas-norte
1. **Abertura em dias SEM compromisso agendado** (a métrica do hábito de verdade) + % notificação→abertura em 2h.
2. **Tempo aprovado→recibo** (dinheiro parado esfriando — prova que o OLLI põe dinheiro no bolso).
3. **% de sinais de radar AGIDOS em 48h** (cobrança enviada / cliente chamado / recibo do card).
4. **Retenção D7/D30 × nº de ações de valor na 1ª semana** (teste do "número mágico" 3-4).
5. **Opt-out por canal** (guarda-corpo: se sobe, viramos ruído).

## NUNCA fazer (dark patterns) — cravado
Notificação vazia/"abra o app"/"sentimos sua falta" · streak punitivo/culpa · urgência falsa (contador, cor de alarme) ·
recompensa variável fabricada (sorte de cassino) · confete em CRUD trivial · auto-share · auto-débito de crédito ·
usar o cliente FINAL como refém/pressão · opt-in silencioso · estimativa como fato medido ("você economizou 3h") ·
reativar dormente com tom de dívida. **Sinal real ou silêncio. Lastro em dinheiro/relação ou nada.**

## Sinergia com o que já está em construção (é a MESMA tese)
- **Menos-cliques** = o loop diário é o menos-cliques **pra fora do app**: a notificação certa aterrissa numa ação de 1 toque que já existe. Zero tela nova de fricção.
- **Voz** = o AHA de ativação + fecha o loop nos dois sentidos (de manhã FALA pra criar; à noite OUVE o dia). O ritual multiplica o uso de voz → o gate de 3 grátis vira o ponto sensível → a cortesia por crédito (Onda 5) é a válvula.
- **Identidade unificada** = o reconhecimento com lastro (celebração, mascote, tom honesto) é a personalidade da marca no momento de mais emoção — o mesmo OLLI que faz "documento de empresa grande" comemora o Pix caindo, no app, no painel e no PDF. Push da Onda 4 nasce compartilhado app+painel.
