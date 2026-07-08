# TARGET_ARCHITECTURE — arquitetura-alvo do OLLI

> **O que é:** o desenho enxuto para onde o OLLI evolui. Não descreve o que existe
> hoje (isso é `FEATURE_MATRIX.md`); descreve as **fronteiras** que toda onda nova
> respeita. Complementa `TECHNOLOGY_RADAR.md` (o quê/quando adotar) e
> `INTEGRATION_BACKLOG.md` (portas/providers). Atualizado 2026-07-08.
>
> **Stack fixa:** Expo SDK 56 / RN 0.85 / TS estrito · SQLite local offline-first ·
> Supabase (`yiaeplqinnnnniyvwtls`) Auth+Postgres+RLS multi-tenant
> (`donos_visiveis()` SECURITY DEFINER)+Storage · Cloudflare Workers · tema escuro · PT-BR.

---

## 1. Os 4 núcleos

Todo código do produto pertence a exatamente um núcleo. Uma feature que cruza
núcleos cruza por **evento/porta**, nunca por import direto de tela para tela.

| Núcleo | Responsabilidade | O que vive nele | Regra dominante |
| --- | --- | --- | --- |
| **CAMPO** | O técnico executa e prova | OS, agenda do técnico, checklist, fotos/evidências, leituras, execução PMOC (fases 2–3), scanner QR, localização de equipe | **Offline-first inegociável.** Tudo funciona sem rede e sincroniza depois. Nenhuma adoção pode degradar isso. |
| **COMERCIAL** | O dinheiro entra | Cliente/CRM, orçamento+versões, portal do cliente (aprovar/recusar+trilha), pagamento+recibo, e-mail transacional, cobrança do cliente-final (Asaas), leads/funil | **Documento enviado é imutável** (versão congelada + hash). Aprovação tem trilha (visualizado/aprovado com IP/contexto). |
| **GESTÃO** | O dono decide | Dashboard/KPIs, financeiro operacional, contratos+planos PMOC (planejamento, fases 4–8), relatórios, equipe/papéis, fiscal (futuro) | Só **lê** dados dos outros núcleos via consultas/agregações; nunca é dona do dado operacional. |
| **PLATAFORMA** | Tudo acima fica de pé | Auth+multi-tenant (RLS/`donos_visiveis()`), sync SQLite↔Supabase, planos/entitlements (Stripe), portas+adaptadores, outbox+Queues+Workflows, observabilidade (Sentry/PostHog), feature flags, worker público (`/o/`, `/q/`) | **Invisível ao usuário.** Não tem tela própria além de conta/plano. Muda sem quebrar os outros três. |

## 2. A regra dos adaptadores (fronteira externa)

```
UI → caso de uso → PORTA (src/services/ports/*) → adaptador → API externa
```

- **Nenhuma tela chama API externa direto.** As 12+ portas já existem declaradas
  em `src/services/ports/` (`PaymentProvider`, `SubscriptionProvider`,
  `EmailProvider`, `AiProvider`, `AnalyticsProvider`, …). Nova integração = novo
  adaptador atrás de porta existente ou nova porta no mesmo padrão.
- **Toda porta devolve `ResultadoPorta<T>`** (`ports/comum.ts`): falha esperada
  não lança; o caso de uso sempre tem fallback (deep-link, cache local, registro
  manual). Se o provider cair, a UX degrada com elegância — nunca trava.
- **Segredo nunca no cliente.** Stripe, Resend, Asaas, Nuvem Fiscal, chaves
  Google, DSN de escrita: só no worker/backend. No app, no máximo chaves públicas
  `EXPO_PUBLIC_*` de leitura.
- **Trocar de provider = trocar 1 adaptador.** Reavaliação passa pela matriz
  ≥75/100 do radar + ADR. Sem ADR, sem troca.
- **AGPL/GPL (OCA, ERPNext, Twenty, Documenso, Formbricks): referência de domínio
  ou serviço externo via API.** Código deles nunca entra no repo.

## 3. Assíncrono: outbox + Queues + Workflows

Nada lento ou falível fica no caminho do clique. Padrão único:

```
transação de negócio grava no Postgres + linha na tabela `outbox` (mesma transação)
  → publicador leva ao Cloudflare Queues
  → consumidor idempotente processa (e-mail, PDF, push, conciliação)
  → sucesso marca a linha; falha reencadeia com backoff; DLQ visível
```

- **Webhook (Stripe/Asaas) é PERSISTIDO antes de processado.** O endpoint
  verifica assinatura, grava o evento cru numa tabela `webhook_events`
  (payload + assinatura + recebido_em) e responde 200. O processamento real é um
  consumidor da fila lendo dessa tabela — reprocessável, auditável, idempotente
  por `event_id`. Um bug no processamento nunca perde um pagamento.
- **Idempotência por construção:** PK `text` gerada no app + upsert; consumidor
  checa `processado_em` antes de agir. Reentrega da fila é esperada, não exceção.
- **Cloudflare Workflows** para processos duráveis com espera humana
  ("aprovado → congelar versão → aguardar pagamento → criar OS → notificar"):
  POC na Onda 3, produção na onda de OS. Cada passo lê a fonte da verdade
  (Postgres), nunca carrega estado de negócio no próprio workflow.

## 4. Fontes da verdade (uma por domínio, nunca duas)

| Domínio | Fonte da verdade | Todo o resto é… |
| --- | --- | --- |
| Dados empresariais (clientes, orçamentos, OS, contratos, PMOC) | **Supabase/Postgres** (RLS decide quem vê) | réplica/cache |
| Operação no aparelho | **SQLite local** = réplica operacional offline-first; sync próprio (`cloudSync.ts`), tombstones/`updated_at` | — (PowerSync só via POC+ADR-0001) |
| Assinatura SaaS do prestador (plano OLLI) | **Stripe** — webhook é a verdade; `assinaturas` no Postgres é projeção; cache local com 7 dias de graça | projeção |
| Cobrança do prestador ao cliente-final dele | **Asaas** (Onda 9b) — papel distinto do Stripe, nunca se misturam | projeção/conciliação |
| Documento enviado (orçamento congelado, recibo, relatório PMOC) | **Objeto versionado + hash** (`*_versions` imutáveis por trigger; PDF autoritativo com hash quando Gotenberg entrar) | preview |
| Emissão fiscal (futuro) | Provider fiscal (Nuvem Fiscal) via `FiscalProvider` | espelho de status |
| Evento externo recebido | **`webhook_events` persistido** antes de qualquer processamento | derivação |

Corolários: SQLite nunca "ganha" de versão assinada/aprovada (imutabilidade é
trigger de banco, não gentileza do app). Sheets/exportações **exportam**, nunca
são banco. Analytics (PostHog) e erro (Sentry) recebem só IDs pseudonimizados —
nunca CPF/CNPJ/telefone/endereço/valor.

## 5. O que fica atrás de feature flag

Flags saem dos booleanos `EXPO_PUBLIC_*` soltos e passam a **PostHog feature
flags** (rollout por org, kill-switch remoto) assim que a janela de estabilidade
fiar o PostHog. Regra: flag esconde a entrada; **nunca** existe botão "em breve".

| Atrás de flag | Por quê | Sai da flag quando |
| --- | --- | --- |
| Sentry session/replay e PostHog session replay | privacidade/custo — liga mascarado, por amostragem | política de scrubbing validada |
| Cloudflare Workflows nos processos de negócio | POC → produção gradual | ADR-0003 aprovada com evidência |
| Gotenberg (PDF servidor) | depende de host Docker (B9); local continua fallback | hash/paridade visual validados |
| Cobrança Asaas | sandbox→prod, org a org | conciliação provada na Onda 9b |
| Login Google Android + Google Calendar | bloqueio humano B3 (OAuth/SHA-1) | B3 resolvido + APK final |
| Mapa embutido / rotas Google | bloqueio B4 (billing); deep-link é o padrão | B4 decidido + quota/alerta configurados |
| Push remoto (FCM) | exige o prebuild único (D-10) | Onda 13 |
| Módulo PMOC inteiro | track separado pós-OS; UI só aparece pra org que ativar | fase a fase (PMOC 1→8) |
| Templates PDF novos / remoção de marca OLLI | entitlement por plano (`quotes.remove_olli_brand`), não flag técnica | — (é gate de plano permanente) |

## 6. Regras transversais que nenhuma onda revoga

1. **Ciclo comercial primeiro.** Nada de APK, vertical ou integração de luxo
   antes do ciclo cliente→orçamento→aprovação→pagamento→recibo perfeito e testado.
2. **Offline é diferencial de marca**, não contingência (peso 10 na matriz do radar).
3. **Zero stub, zero "em breve".** Ou está vivo atrás de porta/flag, ou não aparece.
4. **LGPD por padrão:** pseudonimização em analytics/IA/erros; `ip_hash` nunca IP
   cru; scrubbing no Sentry (`sendDefaultPii` off).
5. **O OLLI nunca declara conformidade legal automática** (PMOC: aprovação é
   técnica do responsável habilitado; referências normativas são dados versionados).
6. **Decisão grande = ADR** (`docs/ADRS/`, gatilhos na §5 do radar).
