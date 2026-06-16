# 📘 PLANO MESTRE — OLLI
### A plataforma de operação do prestador de serviço
*Documento vivo · atualizado em 15/06/2026*

---

## 1. A visão (o que o OLLI é)
OLLI **não é um app de orçamento** — é o **sistema operacional do dia do prestador**.
O concorrente cobra ~R$50/mês e só faz orçamento. O OLLI organiza a **operação inteira**:
agenda com trânsito, financeiro, clientes, catálogo, processos/checklists, orçamentos
(manual ou **por voz**), envio por **link/PDF**, **assistente de IA (OLLI)** em todas as telas,
e um **painel web** pro dono. Tema **escuro "cockpit"**.

**Posicionamento:** *"O concorrente faz orçamento. O OLLI cuida do seu dia inteiro."*
É isso que faz o prestador largar o outro app e instalar o seu.

---

## 2. Arquitetura — 1 código, 3 plataformas, tudo seu
```
                 ┌─────────────────────────────┐
                 │   CÓDIGO ÚNICO (Expo / RN)   │
                 └─────────────┬───────────────┘
          ┌────────────────────┼────────────────────┐
   📱 ANDROID              🍎 iPHONE              💻 WEB
   APK nativo          PWA (sem taxa Apple)   site + painel
          └────────────────────┼────────────────────┘
                    Hospedado na HOSTINGER (seu domínio)
                                │
        ┌───────────────┬───────┴───────┬───────────────┐
   SUPABASE          CLOUDFLARE        STRIPE        ANTHROPIC + GOOGLE
   (backend,        (link do          (planos /     (IA OLLI +
    auth, sync)      cliente)          cobrança)     mapa/trânsito)
```
- **Android** = APK nativo (máxima performance, Play Store).
- **iPhone** = **PWA** — instala pela web, **foge da taxa de 30% da Apple**, atualiza sem App Store.
- **Web** = o mesmo app + o painel do dono.
- **Backend** = Supabase (já está vivo no seu projeto).
- **Tudo no seu domínio**, hospedado na Hostinger.

---

## 3. Stack técnica
| Camada | Tecnologia | Status |
|---|---|---|
| App | Expo SDK 56 · React Native 0.85 · TypeScript | ✅ |
| Navegação | React Navigation (tabs + stack) | ✅ |
| Banco local | expo-sqlite (offline-first) | ✅ |
| Nuvem | Supabase (9 tabelas + RLS por usuário) | ✅ vivo |
| PDF | expo-print (HTML→PDF) | ✅ |
| Fontes | Plus Jakarta Sans (UI) + Spectral (documentos) | ✅ |
| Gráficos | react-native-gifted-charts | ✅ |
| Assinatura | react-native-signature-canvas | a ligar |
| IA | API Claude (Anthropic) | a ligar 🔑 |
| Mapas/trânsito | Google Directions API | a ligar 🔑 |
| Link do cliente | Cloudflare Worker + Supabase | a fazer |
| Planos | Stripe | a configurar 🔑 |
| Push | expo-notifications | a ligar |
| Hospedagem web/PWA | Hostinger | a fazer |

🔑 = precisa de chave/conta (eu te guio, igual fizemos o Supabase)

---

## 4. Os módulos do app (12 telas) — status

| # | Tela / módulo | Status | Depende de |
|---|---|---|---|
| 1 | **Home "Cockpit"** (próxima parada, KPIs, lembrete OLLI, ações) | 🟡 base feita (falta mapa/trânsito) | Google Maps |
| 2 | **OLLI Voz** (orçamento falando) | ⬜ | IA Claude |
| 3 | **Agenda** (Dia/Semana/Mês + trânsito) | ⬜ | Google Maps |
| 4 | **Equipe** (técnicos ao vivo) | ⬜ | — |
| 5 | **Estoque** (+ preço de mercado) | ⬜ | API preço (opc.) |
| 6 | **Códigos de erro** (busca → solução) | ⬜ | seu arquivo 📄 |
| 7 | **Orçamentos** (lista, badges, cobrar) | ✅ (escuro) | — |
| 8 | **Processos & OS guiada** (checklists) | ⬜ | — |
| 9 | **Novo Orçamento** (wizard 4 etapas) | ✅ (escuro) | — |
| 10 | **PDF A4 editorial** (Spectral, personalizável) | 🟡 funcional (falta layout editorial) | — |
| 11 | **Link do Cliente** (web: aprovar→notifica) | ⬜ | Cloudflare+Supabase |
| 12 | **Painel Web do Patrão** | 🟡 esqueleto (Codex) | — |

✅ pronto · 🟡 parcial · ⬜ a fazer · 📄 esperando seu arquivo

---

## 5. IA no app inteiro (a OLLI)
A OLLI aparece em todas as telas. Usos:
- **OLLI Voz** → você fala o serviço, ela monta o orçamento (casando com seu catálogo).
- **Resumo do dia** → "Hoje: 4 visitas, R$ 2.300 previsto, 1 alerta de trânsito."
- **Cobrar cliente** → escreve a mensagem de cobrança do orçamento parado.
- **Códigos de erro** → "Perguntar à OLLI" sobre o defeito.
- **Sugestão de preço/itens** no orçamento.
> Motor: **API Claude (Anthropic)**. Precisa de 1 API key sua.

---

## 6. Mapa + trânsito ao vivo (Home)
O hero "AO VIVO · próxima parada" mostra: cliente, endereço, **anel de countdown**
("falta 12:30 p/ sair"), **alerta de trânsito** ("saia 14:02 · trânsito intenso"),
distância e botões **Iniciar rota / Ligar**.
> Motor: **Google Directions API** (ETA + trânsito em tempo real). Precisa de 1 API key sua.

---

## 7. Roadmap em FASES (ordem recomendada)
> Build de APK só no fim de cada fase (como você pediu).

- **FASE 0 — Consolidação** ✅ *Um repositório só; backend do Codex aproveitado.*
- **FASE 1 — Nova cara (dark cockpit)** ✅ *Tema escuro + mascote + Home + 16 telas convertidas.* (não buildado ainda)
- **FASE 2 — Operação:** Agenda · Dashboard financeiro · Notificações · Processos/OS guiada.
- **FASE 3 — Códigos de erro:** integrar sua base 📄 + busca + "Perguntar à OLLI".
- **FASE 4 — O matador:** Link do cliente (Cloudflare+Supabase) → aprovar → **te notifica** + atualiza o app.
- **FASE 5 — IA (OLLI Voz + assistente):** API Claude em todo o app.
- **FASE 6 — Mapa/trânsito ao vivo** na Home e Agenda (Google Directions).
- **FASE 7 — Multi-plataforma:** PWA (iPhone/Web) + Painel web do patrão + Hostinger + domínio.
- **FASE 8 — Negócio:** Planos (Stripe) · publicação (Play Store) · onboarding.

---

## 8. Modelo de negócio (planos)
| Plano | Preço | Inclui |
|---|---|---|
| **Grátis** (isca) | R$0 | 5 orçamentos/mês, 1 usuário |
| **Pro** | R$49–69/mês | Ilimitado, OLLI Voz, PDF/link com logo, agenda, catálogo |
| **Empresa** | R$149–229/mês | + funcionários, painel web, processos, estoque, equipe ao vivo |
| **+ Funcionário** | R$29–39/mês | por técnico extra |
Teste grátis 14 dias · anual com ~2 meses grátis.

---

## 9. ✅ O que eu preciso de VOCÊ (checklist)
- [ ] 📄 **Arquivo de códigos de erro** (sua pesquisa do ChatGPT) → me aponte o caminho
- [ ] 🔑 **API key Anthropic** (IA) — quando chegar a Fase 5
- [ ] 🔑 **API key Google Maps/Directions** (trânsito) — Fase 6
- [ ] 🔑 **Stripe** (produtos/planos) — Fase 8
- [ ] 🌐 Confirmar o **domínio** comprado na Hostinger
- [ ] 💾 RAM: upgrade pra 16GB (acelera build + emulador + hot-reload ao vivo)

---

## 10. Próximos passos imediatos
1. Você me manda os **arquivos** (códigos de erro + o que mais tiver).
2. Eu integro + sigo a Fase 2 (Agenda + financeiro) no tema escuro.
3. Quando uma fase fechar coerente → **1 build** pra você ver no emulador.
4. Builds de APK final (Android) + PWA (iPhone/Web) só lá na Fase 7.

---

## 11. REFINAMENTO v2 — pesquisa de campo do Igor (15/06/2026)
*Baseado em 4 docs + base de 602 códigos de erro (23 marcas) que o Igor entregou.*

### 11.1 Reposicionamento
OLLI = **copiloto de campo do técnico HVAC** (não "app de orçamento"). O **anzol** é
**código de erro + diagnóstico por IA** — diferencial que nenhum concorrente BR tem.
Loop mágico: **diagnóstico → orçamento → link → cobrança**.

### 11.2 A IA OLLI = 5 personas
- **Orçamentista** (monta/ajusta orçamento, protege margem, sugere preço)
- **Técnica** (interpreta erro, diagnóstico guiado, "antes de trocar placa")
- **Secretária** (lembra retorno, cobra parado, confirma visita, agradece)
- **Gerente** (números, equipe atrasada, parados, callback, estoque)
- **Professora de campo** (ensina medir sensor, superaquecimento… sem humilhar)
Prompts já escritos nos docs do Igor. Motor: API Claude.

### 11.3 Base de códigos de erro (PRONTA)
- `assets/codigos_erro.json` (602 códigos, 353KB) — exportado da planilha do Igor.
- Tabela `codigos_erro`: id, marca, familia, tipo, codigo, exibicao(LED/display),
  falha, catApp, severidade, causa, acao(1ª ação segura), confianca(Alta/Média/Baixa),
  fonteId, url(auditável), obs. (Schema = aba MODELO_DADOS_APP da planilha.)
- **Regra de ouro:** sempre pedir marca+modelo; mostrar confiança; NUNCA condenar
  peça sem testar; código genérico ≠ verdade. É feature + blindagem jurídica.
- Fluxos: Busca por código · "Não sei o código" (por sintoma) · "LED piscando" ·
  "Me ajuda com esse caso" (campo livre→IA) · Modo Fujitsu · "Não faça ainda".

### 11.4 Painel MASTER do Igor (dono do SaaS) — módulo próprio
Distinto do painel do dono-da-empresa. Mostra: usuários (ativos D/7/30), novos,
MRR, churn, **custo de IA por usuário/plano**, funil de ativação (signup→1º
orçamento→enviado→aprovado), uso de IA, códigos mais buscados, erros não
encontrados, risco de churn, suporte. **Instrumentar eventos desde já** (signup_started,
quote_created, quote_sent, quote_approved, ai_voice_used, error_code_searched,
error_code_not_found, churn_risk_detected, subscription_started…).

### 11.5 Arquitetura de custo de IA (desde o dia 1)
Regra ANTES de IA (orçamento por regra; IA só p/ voz/diagnóstico/texto) · cache de
respostas técnicas comuns · créditos por plano (franquia + pacote extra) · prompts
curtos · IA "rápida" vs "profunda". Sem isso a margem morre.

### 11.6 Viralidade
"Feito com OLLI" no rodapé do link/PDF grátis (removível no pago) · indique-e-ganhe
(1 mês/créditos) · cards compartilháveis de insight ("recuperou R$2.300 parados") ·
templates compartilháveis. Cada link enviado = anúncio.

### 11.7 Preço (refinado pelos docs)
Grátis isca (5 orç/mês, marca OLLI, 1 user) · Solo R$39-59 · Pro R$79-99 (IA forte,
automações, OS+fotos, relatórios) · Empresa R$149-229 (equipe, painel web, processos,
estoque) · +Funcionário R$29-39 · créditos de IA à parte.

### 11.8 Momento mágico (norte do MVP)
Criar+enviar 1º orçamento em <5 min · falar→IA monta→link→cliente vê→OLLI lembra
cobrar→aprova→OS c/ foto/assinatura→recibo. Nunca jogar usuário em dashboard vazio.

### 11.9 Reordenação de fases (com a pesquisa)
Prioridade por IMPACTO: (1) dinheiro imediato — orçamento+link+follow-up+cobrança+recibo;
(2) anzol técnico — códigos de erro + diagnóstico IA (a base já está pronta!);
(3) organização — agenda+OS+checklist+histórico da máquina; (4) empresa — painel+equipe;
(5) crescimento — PMOC, WhatsApp oficial, avaliações. Painel master + eventos: começar a
instrumentar já.

---
*OLLI · GR TECH Refrigeração · backend Supabase `yiaeplqinnnnniyvwtls` · domínio Hostinger · base 602 códigos de erro*
