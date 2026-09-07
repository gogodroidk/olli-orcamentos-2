# Fila de continuação do Plano Mestre OLLI 0→100

Atualizado em: **2026-09-07**
Repositório canônico: `C:\OLLI_REL`  
Branch de execução: `Codex/piloto-p0`

## Regra de verdade

Esta fila complementa — e não reescreve — a fila histórica do piloto. Um item só
recebe `DONE` quando o respectivo DoD tem evidência verificável. `DONE_LOCAL`
significa implementação e prova local concluídas, mas não substitui sandbox,
dispositivo real, coorte, parecer profissional ou autorização de publicação.

## Sequência executável

| ID | Pacote | Estado | Definition of Done |
| --- | --- | --- | --- |
| C0 | Consolidar a árvore herdada | DONE_LOCAL | branch própria, temporários ignorados, ZIP conferido, zero segredo detectado, dependências alinhadas, auditoria sem vulnerabilidade conhecida, preflight de release verde e commit local |
| C1 | PWA instalável e offline mínimo seguro | DONE_LOCAL | manifest instalável, service worker controlado, shell e artefatos locais disponíveis offline sem cachear sessão/dados privados, atualização previsível e QA automatizado em Chromium |
| C1A | Reconciliar o pedido de 04/09 com o plano mestre | DONE_LOCAL | matriz requisito→estado→decisão→DoD cobrindo landing, segmentos, aquisição, planos/trial, onboarding, orçamentos, financeiro, equipe, configurações, IA, integrações e legibilidade por agentes |
| C2 | Onboarding e perfil obrigatório | DONE_LOCAL | contrato compartilhado exige telefone e identidade mínima antes do uso operacional; app sem “Pular”, painel com guard fail-closed, fluxo segmentado, retorno seguro, consentimento de marketing separado e evidência em `ACEITE_C2_ONBOARDING_PERFIL_2026-09-05.md` |
| C3 | Oferta, trial e limites comerciais | DONE_LOCAL | contrato único de planos, limite Grátis de 5 envios confirmados/mês, trial Pro opt-in de 14 dias sem cartão/renovação automática, reserva em duas fases, downgrade sem perda e evidência em `ACEITE_C3_OFERTA_TRIAL_LIMITES_2026-09-05.md`; billing real ainda separado por gate |
| C4 | Landing, verticais e descoberta por humanos/agentes | DONE_LOCAL | home coerente com o produto inteiro, páginas por segmento + `/para/prestador-de-servico/`, telas reais mobile/web corretamente rotuladas, trust pages, JSON-LD, `llms.txt`, sitemap/robots e 404/redirect corrigidos; evidência em `ACEITE_C4_LANDING_VERTICAIS_AGENTES_2026-09-05.md`; WAF/WebMCP e reexecução externa continuam gates |
| C5 | Orçamentos, estados e financeiro operacional | DONE_LOCAL | editar/revisar/duplicar sem destruir histórico, quadro com estados aprovado/convertido/perdido, recibo como prova de pagamento, contas a receber, recebido no mês, taxa de aprovação, radar de cobrança e métricas explicáveis por tenant; evidência em `ACEITE_C5_ORCAMENTOS_FINANCEIRO_2026-09-05.md`; conciliação bancária e comprovante remoto ficam no C7 |
| C6 | Configurações, identidade e equipe | DONE_LOCAL | conta pessoal com nome/e-mail/foto/senha, identidade visual em Meu negócio, tema descobrível, equipe autenticada com owner/admin e papéis granulares; evidência em `ACEITE_C6_CONFIG_EQUIPE_2026-09-05.md`; convites/trocas reais continuam gate externo |
| C7 | Integrações e central do prestador | BLOCKED_EXTERNAL | central oficial INSS/NFS-e/Sebrae, agenda/notificações/fallback e arquitetura por portas validados localmente; staging Supabase isolado recebeu baseline + 41 migrations, Storage privado foi comprovado e Worker staging está publicado em modo fail-closed (`WELCOME_DISPATCH_MODE=off`); OAuth/Resend/WhatsApp Cloud/fiscal, secrets de teste e smoke autenticado ainda aguardam escopos externos; evidência em `ACEITE_C7_INTEGRACOES_RECURSOS_2026-09-05.md` e `ops/staging/MIGRATION_CHECKPOINT.md` |
| C8 | IA operacional segura | DONE_LOCAL | chat gera somente rascunho estruturado; alvo único, RBAC, allowlist, token de confirmação, diff antes/depois, compare-before, journal, retenção de 30 dias e desfazer foram ligados no painel + Worker + migration; testes e build verdes. Migration e Worker staging estão aplicados manualmente; canário autenticado, secrets e reconciliação da history permanecem no gate C11; evidência em `ACEITE_C8_IA_SEGURA_2026-09-05.md` |
| C9 | Motor de precificação e packs de ofício | DONE_LOCAL | custo/hora, deslocamento, materiais, impostos, margem e packs elétrica/hidráulica/pintura/dedetização/jardinagem com memória explicável; evidência em `ACEITE_C9_PRECIFICACAO_PACKS_2026-09-05.md` |
| C10 | HVAC/PMOC e documentos avançados | DONE_LOCAL | ativos, visitas, checklist, evidências, contratos e versões imutáveis; alegações regulatórias condicionadas a parecer profissional; evidência em `ACEITE_C10_HVAC_PMOC_2026-09-05.md` |
| C11 | Hardening e release | BLOCKED_EXTERNAL | base local revalidada com preflight e CI verde, builds web/webapp, QA PWA, Worker dry-run, Gitleaks atual zero, contraste e Expo Doctor 20/20; promoção permanente foi versionada e staging passou o smoke público; histórico de migrations manual, secrets externos, smoke autenticado/RLS/Storage, revisão independente, observabilidade/restore, Cloudflare Git Connect, dispositivos, publicação e aceite do dono continuam gates externos; evidência em `ACEITE_C11_HARDENING_RELEASE_2026-09-05.md` e `ops/staging/MIGRATION_CHECKPOINT.md` |

## Gates que não podem ser simulados

- uso de credenciais, destinatários ou dados reais;
- migrations ou escrita em produção;
- cobrança, transferência ou checkout real;
- contato com clientes ou coortes sem consentimento;
- assinatura, distribuição, indexação ou publicação;
- parecer jurídico, contábil, regulatório ou de responsável técnico;
- revisão independente e aceite em dispositivos/navegadores definidos.

Esses gates não cancelam os pacotes locais anteriores: cada pacote deve ser levado
até `DONE_LOCAL` antes de a fila parar por dependência externa real.
