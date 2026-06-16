# 📦 OLLI — HANDOFF COMPLETO (leia primeiro)
*Pacote de continuidade. Tudo que foi feito até 15/06/2026. Para retomar em outra conta/máquina SEM perder nada.*

---

## 🤖 PARA O PRÓXIMO CLAUDE (instrução de boot)
Antes de qualquer coisa, **leia nesta ordem**:
1. Esta página inteira.
2. `contexto_memoria/` — TODAS as `.md` (é a memória acumulada do projeto: perfil do dono, decisões, status, design, veredito do Conselho). **Esse é o cérebro. Não pule.**
3. `PLANO_MESTRE_OLLI.md` — visão, estratégia, arquitetura, planos, refinamento v2.
4. `PROCESSO_OLLI_0_a_100.md` — o passo a passo de execução (11 etapas, com checkboxes).
5. `council-report-olli-estrategia.md` — veredito do Conselho (o que cortar/priorizar).
6. `pesquisa/` — os 4 docs de pesquisa de campo do dono + a base de 602 códigos de erro.

Depois: `cd app/olli-orcamentos && npm install` e siga o `PROCESSO` a partir da **Etapa 0**.

> Carregue também a memória nas suas próprias memórias do projeto, pra não perder contexto entre sessões.

---

## O que é o OLLI (1 parágrafo)
Plataforma para **prestadores de serviço** (começa em ar-condicionado/HVAC, expande pra todos). É o **copiloto de campo**: diagnostica erro (base de 602 códigos + IA), monta orçamento, envia link pro cliente aprovar, cobra, organiza agenda/OS/clientes. Dono: **Igor (GR TECH Refrigeração)**, técnico de campo. Vira **SaaS** (planos). Tema escuro "cockpit". Assistente de IA "OLLI" em 5 personas.

## Decisões já tomadas (NÃO re-discutir)
- **Lançamento VERTICAL, arquitetura HORIZONTAL:** HVAC é a cabeça de praia; o núcleo (orçamento/cliente/agenda/OS/link/cobrança) é genérico pra qualquer prestador. Expandir segmentos só depois de dominar HVAC.
- **Veredito do Conselho:** NÃO construir o plano todo de uma vez. Primeira fatia = `código de erro → diagnóstico IA → orçamento → link do cliente`. Adiar: Stripe, painel master, OLLI Voz, PWA, agenda, equipe.
- **Canal de validação:** a família do Igor (todos têm empresa de ar-condicionado) testa de graça primeiro.
- **Travas:** cache de IA por código+marca desde o dia 1 (margem + fallback); builds curtos/commits frequentes; foco (regra de corte: se não fecha diagnóstico→orçamento→pagamento, vai pro backlog).
- **Repo único:** a base é `app/olli-orcamentos`. O backend Supabase do Codex (`backend/`) e o painel web (`web/`) foram aproveitados.

## Estado atual da CONSTRUÇÃO
✅ App RN/Expo funcional: orçamento (wizard 4 etapas), PDF, catálogo (serviços/produtos), clientes, recibo, backup na nuvem (Supabase, vivo).
✅ Tema **escuro "cockpit"** aplicado (tokens do design).
✅ **Home cockpit** (KPIs reais, lembrete OLLI de parados, ações, mascote IA).
✅ Mascote `OlliMascot`, logo `OlliLogo`, componentes Olli* (input/botão/card/header).
✅ Máscaras BR, parsing de moeda, numeração sem colisão, restore atômico, fonte Plus Jakarta.
✅ **602 códigos de erro exportados** em `app/olli-orcamentos/assets/codigos_erro.json` (pronto p/ importar).
✅ Backend Supabase: 9 tabelas + RLS (em `backend/`).
⬜ Falta (ver PROCESSO): tela de códigos de erro, diagnóstico IA, link do cliente, agenda, OS, OLLI Voz, painel web, PWA, Stripe.

## Backend já configurado (Supabase — VIVO)
- Projeto: `OLLI ORCAMENTOS` · ref `yiaeplqinnnnniyvwtls` · URL `https://yiaeplqinnnnniyvwtls.supabase.co`
- anon key (pública) está em `app/olli-orcamentos/src/config.ts`.
- Tabelas: empresa, clientes, servicos, produtos, orcamentos, recibos, modelos, depoimentos, contadores, backups (todas com RLS por usuário).

## Pendências do Igor (chaves de API, por etapa)
- API key **Anthropic/Claude** (diagnóstico IA — Etapa 2)
- **Cloudflare** + domínio **Hostinger** (link do cliente — Etapa 3)
- **Stripe** (planos — Etapa 6)

## Estrutura deste pacote
```
HANDOFF_LEIA_PRIMEIRO.md      <- este arquivo
PLANO_MESTRE_OLLI.md          <- visão/estratégia/arquitetura
PROCESSO_OLLI_0_a_100.md      <- execução passo a passo (11 etapas)
council-report-olli-estrategia.md
contexto_memoria/             <- a MEMÓRIA do projeto (cérebro acumulado)
app/olli-orcamentos/          <- o app (sem node_modules; rode npm install)
pesquisa/                     <- 4 docs de campo + base 602 códigos (.xlsx + .json)
design/                       <- design handoff (HTML hi-fi das 12 telas)
backend/                      <- migrations Supabase (schema)
web/                          <- painel web (esqueleto PWA)
```

## Stack / ambiente
Expo SDK 56 · React Native 0.85 · TypeScript · Supabase · expo-print · Plus Jakarta Sans + Spectral.
⚠️ Build Windows: caminhos longos quebram (`MAX_PATH`) — usar `cmd /c rmdir /s /q "\\?\<path>"` p/ limpar; emulador FECHADO durante build (RAM). Numa máquina melhor / cloud build (EAS) isso some.

---
*Nada se perde. Abra, leia a memória, rode o app, siga o PROCESSO. Bora terminar do 0 ao 100.*
