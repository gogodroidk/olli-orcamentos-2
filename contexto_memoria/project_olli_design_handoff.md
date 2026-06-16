---
name: project-olli-design-handoff
description: "Handoff de design do OLLI (feito pelo Igor) — vira plataforma escura \"cockpit\" pro prestador. Fonte da verdade do visual."
metadata: 
  node_type: memory
  type: project
  originSessionId: b38e5d95-9e9b-4e00-9db5-2d7962cbad70
---

# Design Handoff OLLI — fonte da verdade do visual

Pasta: `C:\Users\ADMIN\Desktop\OLLI ORCAMENTO CODEX FINAL\design_handoff_olli\` (.dc.html = referência visual; recriar em RN, não copiar HTML). `OLLI App.dc.html` é o protótipo principal navegável. README.md tem a spec completa.

**Virada:** de app de orçamento → **plataforma de operação escura "cockpit"** pro prestador. Igor quer TUDO isso. Relaciona [[project-olli-roadmap]] [[project-olli-build-status]].

## Design tokens (tema ESCURO do app)
bg #0A1626 · barras #0C1B2E · card surface #101F33 (≈ branco 5%) · borda rgba(255,255,255,0.08) · primary #0B6FCE · accent/frost #34C6D9→#7FE9F5 · ink #0A2540 · success #2BD787 · warning #F7B23B · danger #FF6B6B · texto #fff · muted rgba(226,232,240,0.55). PDF/link cliente = tema CLARO à parte.
Fontes: Plus Jakarta Sans (UI) + **Spectral** serif (títulos de documento/PDF, números de destaque). Raios: chips 999, cards 14-22, botões 12-14.
Mascote OLLI = robôzinho SVG (cabeça arredondada gradiente azul→ciano, olhos #7FE9F5, antena, pisca+flutua). Monograma "O" = marca d'água do PDF.

## 12 telas/views a construir
1. Home "Cockpit": próxima parada + countdown ao vivo + alerta trânsito ("saia 14:02") + KPIs (faturamento/conversão/em aberto) + mala do dia (checklist) + equipe ao vivo (mini-mapa) + timeline + ações rápidas. Tab bar 5: Início·Agenda·[+Orçamento central elevado]·Estoque·Conta.
2. OLLI Voz: orçamento por voz, máquina de estados idle→listening→processing→result (speech-to-text + LLM extrai itens e casa com catálogo).
3. Agenda: Dia/Semana/Mês, timeline + chips de deslocamento/trânsito.
4. Equipe: técnicos com status ao vivo.
5. Estoque + preço de mercado via API (não é prioridade do dono).
6. Códigos de erro: busca marca/modelo → causas + solução passo a passo. Schema codigo_erro{marca,modelo,codigo,titulo,causas[],passos[],pecas[]}. Base populada por IA varrendo manuais.
7. Orçamentos lista: filtros, badges (Rascunho·OLLI/Parado+5dias/Aprovado), botão Cobrar, FAB criar por voz.
8. Processos & Lembretes: "Meu dia" (mala, lembretes, templates) + OS guiada (checklist Chegada→Diagnóstico→Execução→Teste→Fotos→Assinatura; OLLI bloqueia fechar sem foto depois + assinatura).
9. Novo Orçamento wizard 4 etapas (Cliente·Itens·Detalhes·Enviar) + tela sucesso com link copiável.
10. PDF A4 editorial (Spectral, espinha de cor, monograma marca d'água, personalizável por empresa via props).
11. Link do Cliente (web CLARO): pendente→aprovado, Aprovar/Recusar/WhatsApp → grava status no backend + notifica empresa. (Cloudflare Worker + Supabase.)
12. Painel Web do Patrão (desktop/PWA escuro): login admin/funcionário, KPIs, gráfico, tabela OS+cumprimento de processo, donut, equipe, alertas OLLI.

## Infra que o Igor conectou (MCP disponível)
Supabase (backend/sync), Cloudflare (Worker do link do cliente), Stripe (planos), Hostinger (domínio olli.app). Usar quando chegar a fase de backend/link/cobrança.

## Plano de fases (build só no fim de cada fase — Igor pediu p/ não buildar a cada mudança)
- FASE 1 (EM ANDAMENTO 2026-06): tema escuro (FEITO) + mascote OlliMascot (FEITO) + Home cockpit + nav 5 abas + converter telas existentes pro escuro.
- FASE 2: Agenda + dashboard financeiro + notificações.
- FASE 3: link do cliente (Cloudflare+Supabase) + aprovação + notificação push — o recurso matador.
- FASE 4: OLLI Voz (speech+LLM) + processos/OS guiada + códigos de erro.
- FASE 5: painel web + planos (Stripe) + iOS (build nuvem).

## Planos (modelo de negócio do handoff)
Grátis (5 orç/mês, 1 user) · Pro R$49-69 (ilimitado, voz, PDF/link, agenda) · Empresa R$149-229 (funcionários, painel web, processos, estoque). +Funcionário R$29-39. Teste 14 dias.

## Estratégia de plataforma (definida 2026-06-15)
UM código Expo → 3 plataformas: **Android = APK nativo** · **iPhone = PWA** (Expo web/react-native-web, foge da taxa Apple) · **Web = site/painel**. Tudo hospedado na **Hostinger** no domínio do Igor (ver config-hostinger-mcp.json no Desktop; tem MCP hostinger-domains/dns disponível) + backend Supabase. PWA precisa de storage web (IndexedDB) no lugar do SQLite — adaptar na fase web.

## Requisitos novos (Igor 2026-06-15)
- **NÃO buildar APK até tudo pronto** (Igor para os builds; só no final).
- **Códigos de erro**: Igor tem um arquivo (pesquisa profunda feita no ChatGPT) com a base — PEDIR o caminho e integrar na tela de Códigos de Erro (schema codigo_erro{marca,modelo,codigo,titulo,causas[],passos[],pecas[]}).
- **IA no app inteiro**: OLLI Voz, resumo do dia, cobrar cliente, assistente. Usar API Claude/Anthropic (precisa de API key — guiar Igor). Ver skill claude-api.
- **Mapa + trânsito ao vivo** na Home (hero "próxima parada"): "saia 14:02, trânsito até lá, X min". Precisa Google Maps/Directions API key.

## Fase 1 — status (2026-06-15)
FEITO: tema escuro cockpit + OlliMascot + Home cockpit (KPIs reais, lembrete OLLI parados+5dias, ações rápidas, hero próxima parada empty-state) + 16 telas convertidas pro escuro via agentes Sonnet (tsc 0 erros) + tab bar escura. NÃO buildado (Igor parou). Falta: nav 5 abas quando Agenda/Estoque existirem.

## Pesquisa de campo do Igor (4 docs + planilha, 15/06/2026)
Igor entregou pesquisa profunda (Downloads/): relatorio_enriquecimento_codigos_erro, base_codigos_erro_...xlsx (602 códigos, 23 marcas, 11 abas), briefing_ideias_ia_app, analise_dores_usuarios. Ver detalhes em PLANO_MESTRE_OLLI.md seção 11 (refinamento v2).
- **602 códigos JÁ exportados** → `olli-orcamentos/assets/codigos_erro.json` (353KB). Schema = aba MODELO_DADOS_APP. Tabela `codigos_erro`(marca,familia,tipo,codigo,exibicao,falha,catApp,severidade,causa,acao,confianca,fonteId,url,obs).
- Reposicionamento: OLLI = COPILOTO DE CAMPO HVAC. Anzol = código de erro + diagnóstico IA (diferencial único BR).
- IA = 5 personas: Orçamentista/Técnica/Secretária/Gerente/Professora (prompts nos docs).
- **Regra de ouro:** pedir marca+modelo, mostrar confiança, NUNCA condenar peça sem teste = feature + blindagem jurídica.
- **Painel MASTER do Igor** (dono do SaaS, ≠ painel do dono-empresa): usuários/MRR/churn/custo-IA/funil/eventos. Instrumentar eventos JÁ.
- **Custo de IA**: regra-antes-de-IA + cache + créditos por plano. Crítico p/ margem.
- Viralidade: "Feito com OLLI" no link grátis + indique-ganhe + cards de insight.
- Preço refinado: Grátis/Solo 39-59/Pro 79-99/Empresa 149-229 + créditos IA.
- Momento mágico: criar+enviar 1º orçamento em <5min.

## Veredito do Conselho + decisões (15/06/2026)
- LLM Council (5 lentes + 3 revisores) sobre a estratégia: VEREDITO = FAZER COM AJUSTES. Cortar o escopo enorme; construir UMA fatia vertical: **código de erro → diagnóstico IA → orçamento → link do cliente**. Adiar: Stripe, painel master, OLLI Voz, PWA, agenda, equipe, estoque. Relatório: `Desktop/OLLI ORCAMENTOS/council-report-olli-estrategia.md`.
- Pontos cegos do Conselho (TRAVAR): (1) cache de IA por código+marca desde o dia 1 (margem + fallback se API cair); (2) canal de validação; (3) builds curtos/checkpoints (assistente é gargalo, Igor não é dev).
- **CANAL DE VALIDAÇÃO RESOLVIDO:** família do Igor toda tem empresa de ar-condicionado → testam de graça, depois vira pago. Campo de teste real garantido.
- **VISÃO = HORIZONTAL, LANÇAMENTO = VERTICAL.** OLLI vai servir TODOS os prestadores de serviço (+ empresas com equipes pequenas até ~10), mas HVAC é a cabeça de praia (beachhead). Estratégia: NÚCLEO universal (orçamento/cliente/agenda/OS/link/cobrança/equipe — não amarrar em HVAC) + "Pacote HVAC" (602 códigos/diagnóstico/LED) como anzol + pacotes futuros (elétrica/hidráulica/pintura) por cima do mesmo núcleo. O próprio arquivo de pesquisa do Igor diz: "primeiro dominar HVAC, não abrir geral cedo demais."
- PRÓXIMA CONSTRUÇÃO (1ª ação do Conselho): importar os 602 códigos (já em assets/codigos_erro.json) + tela de busca (marca→modelo→código→causa/testes/confiança/fonte). Núcleo genérico por baixo.

## Ambiente de build (lembrar)
PC 8GB RAM (Igor vai p/ 16GB). REGRA: emulador FECHADO durante build (senão estoura memória/clang). MAX_PATH: limpar build com `cmd /c rmdir /s /q "\\?\<path>"`. reactNativeArchitectures=x86_64 p/ emulador, arm64-v8a p/ S24, ambos p/ APK final.
