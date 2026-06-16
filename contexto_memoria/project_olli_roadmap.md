---
name: project-olli-roadmap
description: "Plano mestre de evolução do OLLI Orçamentos — banco de dados, concorrentes, diferenciais, fases"
metadata: 
  node_type: memory
  type: project
  originSessionId: b38e5d95-9e9b-4e00-9db5-2d7962cbad70
---

# Plano Mestre OLLI Orçamentos (definido 2026-06-10)

Relaciona com [[project-olli-build-status]] e [[user-grtech-profile]].

## Banco de dados
- HOJE: SQLite local no aparelho (`olli_orcamentos.db`). 100% offline. RISCO CRÍTICO: perde tudo se perder o celular.
- DECIDIDO: arquitetura local-first com nuvem **Supabase** (Postgres + Auth + Storage). Mantém SQLite local + espelha na nuvem. Supabase escolhido sobre Firebase por: SQL relacional, preço previsível, row-level security (essencial p/ SaaS), open-source.
- Sync sugerido: PowerSync ou Legend-State. Para Fase 1, backup/restore por snapshot JSON é suficiente (mais simples que sync por linha).

## Concorrentes (pesquisa de mercado)
- BR: Agenda Boa (R$12,90/mês), Produttivo, Orçamento Perfeito, Infor+, Orçamento PRO (o copiado). TODOS fazem só PDF+WhatsApp. NENHUM tem IA, link de aprovação ou Pix integrado — essa é a brecha.
- Gringos (padrão-ouro): Jobber (US$25+, orçamento bom/melhor/premium = +30% ticket), Housecall Pro (US$59-299, orçamento→fatura 1 toque, IA, +25% fechamento), ServiceTitan (enterprise).

## Diferenciais "ninguém tem igual"
1. IA monta orçamento por FOTO do equipamento (identifica modelo→sugere serviço+peças do catálogo) ou por VOZ. Usar API Claude/Anthropic.
2. Link web de aprovação + assinatura online.
3. Pix integrado (sinal pago na hora via Mercado Pago).
4. Follow-up automático de orçamento parado.

## Roadmap por fases
- FASE 1 (CÓDIGO PRONTO 2026-06-10, aguardando credenciais Supabase): login + backup/restore por snapshot. Arquivos: src/config.ts (colar URL+anon key), src/services/supabase.ts, src/services/backup.ts, src/screens/ContaScreen.tsx, exportAllData/importAllData no database.ts, atalho no MeuNegocio. Modelo de backup = snapshot JSON completo na tabela `backups` (não sync por linha). SQL da tabela: backups(user_id uuid PK ref auth.users, data jsonb, updated_at) + RLS auth.uid()=user_id. Falta: Igor criar projeto Supabase, rodar SQL, colar 2 chaves em config.ts, rebuildar APK. Assinatura na tela ainda pendente.
- FASE 2: link web aprovação + Pix + lembrete automático + orçamento 3 opções.
- FASE 3: IA orçamento por foto/voz + dashboard com previsão.
- FASE 4: SaaS multi-usuário + painel web + planos de assinatura.

## Monetização (SaaS futuro)
Grátis (5 orç/mês) → PRO R$29,90/mês → PRO+IA R$49,90/mês. Posicionamento: "único app que monta o orçamento por foto".

## Stack alvo
RN+Expo (temos) · SQLite local (temos) · Supabase nuvem · PowerSync/Legend-State sync · API Claude p/ IA · Mercado Pago/Pix.
