# EXECUTION_LOG — OLLI Orçamentos

> O que já foi ENTREGUE, com evidência (commit ou arquivo). Atualizar ao fim de cada onda.
> Última atualização: 2026-07-08.

## Ciclo v1–v8 (pré-roadmap atual)

| Versão | Commit | Entrega | Evidência |
| --- | --- | --- | --- |
| Blindagem | `526d6ec` | Rate limit no worker, sync com guard de timestamp, schema versionado, RLS otimizada (padrão `(select auth.uid())`) | migrations `20260615`/`20260624`, `worker/src` |
| Revisão adversarial | `fcf9cc6` | Restore de backup recupera de verdade, timestamps robustos | `src/services/backup.ts` |
| v1 "perfeição" | `ab24ce2` | 110+ correções tela a tela, sync blindado, APK/iOS prontos | diff do commit |
| v2 | `56e1a2e` | Stripe ponta a ponta (checkout, portal, webhook fonte da verdade) + backup automático versionado + customização da marca | `worker/src/stripe.js`, `src/services/autoBackup.ts` |
| v3 | `15f245e` | Login obrigatório + Google (web), motion system (motion.ts, OlliPressable, AnimatedEntrance), templates PDF, cor extraída da logo, voz nativa | `src/theme/motion.ts`, `src/utils/pdfGenerator.ts` |
| v3.5 | `7a4536b` | Radar de clientes sumidos + relatório do dia falado | `src/services/radarClientes.ts`, `relatorioDia.ts` |
| v4 | `46dbd65` | Plataforma web DESKTOP real: sidebar, dashboard, tabelas, agenda semanal, URLs reais | `src/screens/desktop/*`, `src/components/web/` |
| fix crítico | `f551ad8` | APK v6 crashava no boot (fast-png + TextDecoder latin1 no Hermes) — regra: testar APK no emulador `olli_phone` antes de entregar | memória `olli-hermes-emulador.md` |
| v5 | `9f85d7a` | Base HVAC 698 códigos de erro + `hvac_chunks` (IA aterrada em manuais), 40 correções de especialistas | `src/screens/CodigosErroScreen.tsx` |
| v6 | `fefd4cc` | Microfone na nuvem (Gemini), tela de erros v2, Google Agenda por flag, rota no Maps via deep-link | `src/services/vozNuvem.ts`, `googleAgenda.ts`, `rotas.ts` |
| fix raiz mic | `0fed0ef` | expo-image-picker com `microphonePermission:false` apagava RECORD_AUDIO do manifest | `app.json` |
| v7/v8 | `6f10453`, `c51d53c` | Bumps de versionCode | — |

## Onda 1 — Monetização (CONCLUÍDA)

Commit: `03ec66d` — "Onda 1 (monetizacao) + correcoes do gate: freemium que converte, Stripe 12x/Empresa".

- `usePlano()` — hook central de plano com cache AsyncStorage (evita piscar muro Pro no cold start). Evidência: `src/hooks/usePlano.ts`.
- `<GatePro>` — gate visual com preview real + CTA "Ver planos" + analytics `gate_visto`/`gate_cta`. Evidência: `src/components/GatePro.tsx`.
- `RECURSOS_POR_PLANO` — mapa único de entitlements em `src/services/planos.ts` (hoje `Set<Recurso>`; evoluir para chaves com limites — ver `PLAN_ENTITLEMENTS.md`).
- Cota de IA no grátis: 3 usos/mês, contador local (`IA_USOS_GRATIS_MES`, `olli.ia.usos.mes`), mensagem calorosa ao esgotar.
- Stripe: `pro mensal`, `pro anual`, `pro_12x` (mode=payment, `installments` habilitado no request, acesso 12 meses via `processar12x`), `empresa mensal/anual`. Webhook = fonte da verdade; `LOOKUP_PARA_PLANO` em `worker/src/stripe.js` (linhas 30–33, 268–316, 480+).
- PlanosScreen com 3 modos de preço; Empresa assinável (CTA checkout), WhatsApp secundário.
- Gates aplicados: relatórios (teaser borrado), radar (1 grátis + contagem), voz/chat (contador "2 de 3"), relatório do dia.
- Regra respeitada: criar orçamento/recibo/cliente/agenda NUNCA gateado.

Pendência humana da Onda 1: habilitar "installments" no dashboard Stripe + criar Prices com lookup_keys (`olli_pro_12x`, `olli_empresa_mensal`, `olli_empresa_anual`). Código pronto.

## Onda 2 — Multi-tenant (EM ANDAMENTO, não commitado)

Arquivos no working tree (git status):

- `supabase/migrations/20260707_multitenant.sql` (710 linhas, idempotente, **NÃO aplicada ainda**): `organizacoes`, `organizacao_membros`, `convites`, `localizacoes_equipe`, `acessos_equipe`; funções `eh_membro_ativo`/`eh_gestao`/`eh_admin_org`/`donos_visiveis()` (SECURITY DEFINER, search_path=''); policies reescritas nas 7 tabelas de dados (SELECT via `donos_visiveis()`, escrita de equipe só em `orcamentos`/`agendamentos` com `criado_por`); funções `criar_organizacao()` e `aceitar_convite(token)`; blocos de teste T1–T7 comentados no fim do arquivo.
- Decisão arquitetural documentada em `docs/multi-tenant.md`: org é CAMADA sobre dados do owner (sem big-bang para org_id); `tipo_conta` é derivado.
- `worker/src/equipe.js` (392 linhas): convites com token + página web do convite + deep link `olli://convite/<token>`.
- UI: `EquipeScreen`, `EquipeAoVivoScreen`, `ConviteScreen`; hooks `usePermissao`, `useTipoConta`; serviços `equipe.ts`, `localizacaoEquipe.ts` (captura nativa atrás de flag até a Onda do APK).

Falta para fechar a Onda 2 (gate de saída):
1. Aplicar migration via `mcp__supabase__apply_migration` após revisão.
2. Executar a matriz RLS completa (ver `RLS_MATRIX.md`) com 2+ JWTs reais — obrigatório antes do merge.
3. Backfill: organização individual para usuários existentes (ver DECISIONS D-09).
4. Push do técnico em nome do owner no `cloudSync`/`equipe.ts` (`user_id = owner` + `criado_por = eu`).
5. Commit + typecheck limpo.

## Bloqueios externos ativos

Ver `KNOWN_BLOCKERS.md`.
