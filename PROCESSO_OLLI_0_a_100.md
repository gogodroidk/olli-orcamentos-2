# 🚀 PROCESSO OLLI — do 0 ao 100%
*Plano de execução sequenciado, pós-Conselho. Lançamento VERTICAL (HVAC), arquitetura HORIZONTAL.*
*Regra mestra: só avança de etapa quando a "Definição de pronto" estiver batida. Marque [x] ao concluir.*

---

## 🔒 ETAPA 0 — Travas e fundação *(antes de construir feature)*
- [ ] `0.1` **Núcleo genérico:** adicionar campo `segmento` no cadastro da empresa (ar-condicionado, elétrica, hidráulica, pintura, outro). Nada amarrado a HVAC no código do orçamento/cliente/agenda.
- [ ] `0.2` **Git + checkpoints:** inicializar repositório, commit a cada passo concluído (rollback fácil — trava do "assistente é gargalo").
- [ ] `0.3` **Cache de IA (arquitetura dia 1):** tabela `cache_ia(chave, resposta, criado_em)` — diagnóstico por `código+marca` é cacheado; IA só é chamada se não houver cache.
- [ ] `0.4` **Eventos:** função `track(evento, props)` gravando em tabela `eventos` (signup, quote_created, quote_sent, quote_approved, error_code_searched, ai_used…). Mesmo simples, desde já.
> **Pronto quando:** app abre, segmento existe no cadastro, git commitando, cache e eventos gravando.

## 🎣 ETAPA 1 — O ANZOL: Códigos de erro *(SEM IA ainda — lançável e único no BR)*
- [ ] `1.1` Tabela `codigos_erro` (schema da planilha) no SQLite + Supabase.
- [ ] `1.2` Importar os **602 códigos** (`assets/codigos_erro.json`) na primeira abertura.
- [ ] `1.3` **Tela de busca:** marca → modelo/família → código (ou "LED piscando") → **resultado**: falha, causa provável, ação inicial, severidade, **nível de confiança**, fonte (link auditável).
- [ ] `1.4` Filtro por marca (chips) + busca livre por código/sintoma.
- [ ] `1.5` **Regra de ouro** visível: pede modelo, mostra confiança, bloco "⚠️ não faça ainda / antes de trocar placa".
- [ ] `1.6` Botão "não achei meu erro" → salva o caso (marca/modelo/código/sintoma) p/ enriquecer a base.
> **Pronto quando:** técnico digita "Midea E4" e recebe diagnóstico estruturado em <90s, offline.

## 🤖 ETAPA 2 — Diagnóstico por IA *(a OLLI Técnica)*
- [ ] `2.1` Conectar API Claude (🔑 key do Igor). Serviço `olliIA(prompt)` com o prompt-base do briefing.
- [ ] `2.2` **Cache primeiro:** consulta `cache_ia` antes de chamar a API; grava a resposta.
- [ ] `2.3` Tela **"Me ajuda com esse caso"**: campo livre (ex: "LG inverter CH05, condensadora não parte") → resposta no formato: resumo · causa provável · testes em ordem · peça suspeita · **não faça ainda** · confiança · **mensagem pro cliente** · **sugestão de orçamento** · fontes.
- [ ] `2.4` **Fallback:** se a IA falhar/estourar limite, mostra o resultado da BASE de códigos (rede de segurança).
- [ ] `2.5` Limite de chamadas de IA no plano grátis (medir custo real por chamada antes de precificar).
> **Pronto quando:** IA responde diagnóstico acionável, cache funciona, e cai pro plano B se a API falhar.

## 💰 ETAPA 3 — Loop de dinheiro *(o que paga a conta)*
- [ ] `3.1` **Diagnóstico → orçamento** em 1 toque (puxa serviço/peça sugerida do diagnóstico).
- [ ] `3.2` **Link do cliente** (Cloudflare Worker + Supabase): página clara → **Aprovar / Recusar / Dúvida no WhatsApp**.
- [ ] `3.3` Aprovação grava status no backend + **notifica o prestador** (push `expo-notifications`) + atualiza o app.
- [ ] `3.4` **"Orçamentos parados"** na Home + botão **Cobrar** (mensagem automática por estágio: 1/3/5/7 dias).
- [ ] `3.5` Recibo + **"Receber agora"** (Pix/link) ao concluir.
> **Pronto quando:** orçamento sai do diagnóstico, vira link, cliente aprova e o Igor recebe a notificação.

## 🧪 ETAPA 4 — Validação com a família *(o teste real)*
- [ ] `4.1` Onboarding violento de simples: criar+enviar 1º orçamento em <5 min (nunca cair em tela vazia).
- [ ] `4.2` Colocar a família (todos HVAC) usando de **graça**.
- [ ] `4.3` Medir: criaram orçamento? enviaram link? cliente abriu? voltaram no dia seguinte? custo de IA por uso?
- [ ] `4.4` Ouvir o que trava e ajustar. **NÃO avançar pra monetização sem retenção (voltaram em 7 dias).**
> **Pronto quando:** ≥5 da família usam de verdade e ≥3 voltam sozinhos no dia seguinte.

## 🗂️ ETAPA 5 — Operação do dia *(organização)*
- [ ] `5.1` **Agenda** (dia/semana/mês) + lembretes de visita.
- [ ] `5.2` **Histórico da máquina** (prontuário: marca/modelo/série/gás/erros/peças/garantia).
- [ ] `5.3` **OS guiada**: checklist + foto antes/depois + assinatura. Bloqueia fechar sem foto-depois + assinatura.
> **Pronto quando:** o técnico organiza o dia e fecha a OS com prova, dentro do app.

## 💳 ETAPA 6 — Monetização *(só depois da validação)*
- [ ] `6.1` Stripe: planos Grátis / Solo R$39-59 / Pro R$79-99 / Empresa R$149-229 + créditos de IA.
- [ ] `6.2` Paywall nos limites (ex: 5 orçamentos/mês no grátis).
- [ ] `6.3` Viralidade: **"Feito com OLLI"** no link/PDF grátis (removível no pago) + indique-e-ganhe.
> **Pronto quando:** alguém da família (ou fora) paga o primeiro plano de verdade.

## 📱 ETAPA 7 — Multi-plataforma
- [ ] `7.1` **Android**: APK assinado → Play Store.
- [ ] `7.2` **PWA (iPhone + Web)** via Expo web → hospedar na **Hostinger** + domínio.
- [ ] `7.3` Adaptar storage web (IndexedDB no lugar do SQLite).
> **Pronto quando:** roda no Android, no iPhone (PWA) e na web, no seu domínio.

## 🏢 ETAPA 8 — Empresa/equipe + Painéis
- [ ] `8.1` Equipe (até 10), permissões admin/funcionário.
- [ ] `8.2` **Painel web do dono** (KPIs, OS em andamento, processos, equipe).
- [ ] `8.3` **Painel MASTER do Igor** (SaaS): usuários, MRR, churn, **custo de IA**, funil de ativação, eventos.
> **Pronto quando:** dono enxerga a equipe e VOCÊ enxerga o SaaS inteiro.

## 🌍 ETAPA 9 — Expansão horizontal *(a visão grande)*
- [ ] `9.1` Pacote **elétrica** (templates de serviço; base técnica opcional).
- [ ] `9.2` Pacote **hidráulica**, **pintura**, etc. — por cima do mesmo núcleo.
- [ ] `9.3` Templates compartilháveis por segmento.
> **Pronto quando:** um eletricista usa o OLLI tão bem quanto um técnico de HVAC.

## 📈 ETAPA 10 — Crescimento
- [ ] `10.1` PMOC / contratos recorrentes.
- [ ] `10.2` Avaliações Google · WhatsApp oficial · marketplace de peças (futuro).
> **100% = OLLI é hábito diário de milhares de prestadores, em vários segmentos.**

---

## 🛑 Travas globais (do Conselho — valem o tempo todo)
1. **Corte:** se a feature não fecha `diagnóstico → orçamento → pagamento`, vai pro backlog.
2. **IA:** sempre cache antes de chamar; sempre fallback pra base; sempre limite no grátis.
3. **Canal:** validar com a família antes de gastar com aquisição.
4. **Build:** commits curtos e frequentes; emulador fechado durante build; nada de sprint de debug longo.
5. **Foco:** dominar HVAC antes de abrir os outros segmentos (núcleo genérico, mas lançamento vertical).

---
## 🔑 Pendências do Igor (quando chegar a etapa)
- [ ] Etapa 2: API key da **Anthropic** (Claude)
- [ ] Etapa 3: confirmar conta **Cloudflare** + domínio Hostinger pro link
- [ ] Etapa 6: configurar produtos no **Stripe**
- [ ] Etapa 4: lista da família que vai testar

*Documento de execução. Atualizar [x] conforme avança. Companheiro do PLANO_MESTRE_OLLI.md (visão/estratégia).*
