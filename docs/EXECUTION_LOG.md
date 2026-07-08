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

## Onda 2 — Multi-tenant / Modo Empresa (CONCLUÍDA)

Commits: `34db77b` (schema + fluxo empresa) — migrations `20260707_multitenant.sql` + `20260708_multitenant_fixes.sql` **aplicadas em produção**.

- Org como CAMADA sobre os dados do owner (sem big-bang para `org_id`): `donos_visiveis()` SECURITY DEFINER retorna {self} ∪ {owners de orgs onde sou membro ativo}. Usuário sozinho = single-tenant idêntico. Doc: `docs/multi-tenant.md`.
- Tabelas: `organizacoes`, `organizacao_membros` (papéis owner/admin/gestor/tecnico), `convites` (token + expiração), `localizacoes_equipe`, `acessos_equipe`. `criado_por` em `orcamentos`/`agendamentos`.
- Trigger `bloquear_troca_user_id()` (user_id imutável) + `aceitar_convite` não rebaixa owner + valida e-mail do convite.
- `worker/src/equipe.js`: convite server-side (JWT owner/admin) + página pública do convite.
- **RLS testada com 2 contas reais** (isolamento, exfiltração bloqueada). 4 HIGH do gate corrigidos e re-verificados.

## Integração da pesquisa V3 + PMOC (CONCLUÍDA)

Commit: `478ca6a`. Análise das 3 pesquisas → plano executável, sem instalar nada por impulso.

- `docs/TECHNOLOGY_RADAR.md` (veredito nosso por ferramenta), `docs/INTEGRATION_BACKLOG.md`, `docs/TARGET_ARCHITECTURE.md`.
- `src/services/ports/` — 13 interfaces de adaptador (Payment/Email/Maps/Fiscal/AI/…), 100% declarativas e aditivas (UI → caso de uso → porta → adaptador).
- `docs/PMOC_MODULE.md` + `supabase/migrations/20260709_pmoc_fundacao.sql` (esqueleto **NÃO-aplicado**): vertical HVAC/PMOC como track pós-ciclo-comercial.
- `KNOWN_BLOCKERS.md`: +B7 Sentry, B8 PostHog, B9 Gotenberg, B10 Asaas, B11 Nuvem Fiscal.

## Onda 3 — Ciclo comercial (CONCLUÍDA)

Commit: `a8e617c`. Migrations `20260708_portal_trilha.sql` + `20260708_versoes.sql` **aplicadas + testadas (RLS 4/4)**; worker deployado (`v 14e3ebd6`, smoke ok).

- **Portal do cliente v2** (`worker/src/link.js`): recusar com MOTIVO; TRILHA append-only (`eventos_orcamento_publico`) visualizado/aprovado/recusado com `ip_hash` (SHA-256 salgado, nunca o IP cru) — LGPD; GET carimba `visualizado_em`. Trilha owner-only, imutável (42501).
- **Versões** (`database.ts`, `clienteLink.ts`): regra de ouro 13.5 — editar proposta enviada congela a versão anterior. Fingerprint por **lista de exclusão** + stringify canônico (cobre formas de pagamento/PIX/fotos/subtotais). Numeração resiliente a merge (renumera no 23505, de-dup).
- **Status expandido** 6→10; filtros/pizza derivados de fonte única. Radar de parados passa a contar `visualizado`/`em_negociacao`.
- **Pagamento + recibo** (`pagamentos.ts`): estado financeiro derivado dos recibos + badge (aguardando/pago/recibo emitido); "Registrar pagamento" no aprovado; recibo pré-preenchido sem duplicar número.
- **Gate Fable**: 13 achados → 10 confirmados (1 HIGH + 3 MEDIUM + 6 LOW). HIGH (fingerprint incompleto — coração da feature) + 3 MEDIUM + 5 LOW aplicados; 1 LOW adiado (limpeza de versões órfãs na nuvem, protegido por RLS — follow-up).

## Bloqueios externos ativos

Ver `KNOWN_BLOCKERS.md`.
