# Auditoria completa do projeto OLLI Orçamentos — 2026-09-06

## Escopo e regra de verdade

Esta auditoria confronta a intenção de produto em
`docs/IDEIAS_PRODUTO_OLLI_ORCAMENTOS_2026-09-06.md` com o código, os testes,
as migrations, os aceites C1–C11, o inventário externo e o estado Git do
checkout canônico `C:\OLLI_REL`, branch `Codex/piloto-p0`.

O arquivo de ideias é referência de produto, não instrução técnica. A fonte
executora atual é `docs/PILOTO/FILA_0_A_100_CONTINUACAO.md`; o estado transversal
machine-readable é `docs/PILOTO/TRANSVERSAL_READINESS.json`; os aceites em
`docs/PILOTO/ACEITE_*.md` são evidência local por pacote.

Documentos em `docs/ONDA_*`, `docs/ENXAME`, ledgers, auditorias antigas e
pesquisas continuam preservados como histórico, decisões e evidência de
rollback. Eles não substituem a fila atual nem autorizam produção.

## Resultado executivo

**Estado local:** aprovado para desenvolvimento/revisão, com a base local
validada e os pacotes C1–C6 e C8–C10 em `DONE_LOCAL`.

**Estado de integração/release:** não aceito como produção. C7 e C11 permanecem
`BLOCKED_EXTERNAL` porque ainda faltam staging isolado, migrations live,
canário remoto, coorte/consentimento, dispositivos, observabilidade/restore,
revisão independente e autorização de publicação.

**Conclusão:** não encontrei uma falha local que justifique apagar código ou
documentação histórica. O único artefato descartável criado durante esta
auditoria foi o `graphify-out/` temporário; ele foi removido depois da leitura.

## Matriz requisito → evidência atual

| Frente | Estado | Evidência atual | O que ainda não está provado |
|---|---|---|---|
| C0 — árvore, dependências e baseline | `DONE_LOCAL` | branch canônica, preflight, testes e inventário | commit/push/release externa |
| C1 — PWA/offline seguro | `DONE_LOCAL` | `test:pwa`, assets, manifesto, QA PWA | instalação física, upgrade, rollback e distribuição |
| C1A — reconciliação das ideias do proprietário | `DONE_LOCAL` | `docs/PROMPTS_E_IDEIAS_DO_USUARIO_OLLI_2026-09-06.md` e este relatório | aceite real de cada gate |
| C2 — onboarding/perfil obrigatório | `DONE_LOCAL` | `ACEITE_C2_ONBOARDING_PERFIL_2026-09-05.md`, `test:perfil-operacional`, `test:cep-telas` | sessão real/coorte e envio de boas-vindas fora do simulador |
| C3 — Grátis, Pro, limites e trial | `DONE_LOCAL` | limite de 5 envios confirmados/mês, trial opt-in de 14 dias sem cartão, `test:limites-comerciais`, `test:monetization-*` | decisão comercial final e lifecycle de billing em sandbox |
| C4 — landing, verticais e agentes | `DONE_LOCAL` | 25 páginas Astro, páginas por ofício, SEO/JSON-LD/`llms.txt`, `test:landing-c4` | deploy público atualizado, WAF/WebMCP e medição externa |
| C5 — orçamentos/estados/financeiro | `DONE_LOCAL` | revisão sem sobrescrever histórico, quadro, recibo e radar, `test:c5-orcamentos-financeiro` | conciliação bancária e comprovante remoto |
| C6 — conta, identidade e equipe | `DONE_LOCAL` | telefone/senha/empresa/tema/equipe, `test:c6-config-equipe` | convite/troca e dados reais em ambiente aceito |
| C7 — integrações e central | `BLOCKED_EXTERNAL` | recursos oficiais, adapters, Storage privado e contratos locais | OAuth, Storage aplicado, Resend webhook real, WhatsApp/fiscal e agenda real |
| C8 — IA operacional segura | `DONE_LOCAL` | allowlist, alvo único, RBAC, confirmação, diff, journal e retenção, `test:c8-ia-segura` | migration, deploy do Worker e canário remoto |
| C9 — precificação/packs | `DONE_LOCAL` | custo/hora, deslocamento, imposto, margem e packs, `test:c9-precificacao` | calibração com dados/coorte reais |
| C10 — HVAC/PMOC | `DONE_LOCAL` | ativos, QR, evidências, versões e ordens, `test:c10-hvac-pmoc` | parecer profissional/regulatório e operação de campo |
| C11 — hardening/release | `BLOCKED_EXTERNAL` | preflight, builds, dry-run Worker, Semgrep, Gitleaks, contraste e readiness | staging, migrations live, restore, canário, Git/Cloudflare e publicação |

## Verificações executadas nesta auditoria

- `npm run preflight` sem `--silent`: **passou**; typecheck, suíte raiz,
  contraste, Expo Doctor **20/20** e configuração de release.
- A suíte agregada confirmou **177 verificações** e os testes C3–C10, RLS,
  quota, auth-policy, Storage, Resend, notificações, admin e monetização.
- `pnpm run build` em `webapp`: **passou**, 3.272 módulos transformados; os
  avisos são apenas sobre chunks dinâmicos que também são importados
  estaticamente.
- `npm run build` em `web`: **passou**, 25 páginas estáticas, incluindo home,
  planos, ajuda e todas as rotas de ofício.
- `npm run check` em `worker`: **passou**, dry-run de 902,05 KiB (201,54 KiB
  gzip), sem publicação.
- `git diff --check`: sem erro material; somente avisos de normalização LF/CRLF
  do checkout Windows.
- Semgrep nos arquivos alterados de segurança/integração: **zero achados**.
- Gitleaks no histórico: **8 achados `jwt` históricos**, todos anon/publicáveis
  em commits antigos de configuração Supabase; nenhum segredo novo foi
  encontrado nesta rodada. `web/.env` não existe atualmente, e os arquivos
  atuais usam variáveis de ambiente.
- O grafo estrutural de código foi gerado uma vez para esta auditoria: 11.360
  nós, 27.681 relações e 513 comunidades. A extração semântica de 313
  documentos não foi executada porque não há chave LLM configurada; o grafo foi
  usado como mapa estrutural, não como prova semântica dos documentos. O output
  temporário foi removido após a análise.

## Achados de arquitetura e manutenção

O grafo identificou como nós centrais o tema (`useEstilos`, `useCores`), banco
local (`getDb`), sincronização (`cloudSync`), Worker/`fetch`, planos e telas de
orçamento. Também encontrou ciclos de importação em navegação, banco/ritual e
alguns módulos do painel. Eles são riscos de manutenção/performance, não
falhas funcionais provadas; não foram refatorados nesta auditoria para evitar
alterar comportamento aprovado.

O relatório histórico `docs/AUDITORIA_ABA_POR_ABA.md` contém achados antigos,
inclusive a senha demo e problemas de contraste já tratados em ondas
posteriores. A fonte atual confirma que o login lê `VITE_DEMO_PASSWORD` do
ambiente e que a senha literal foi removida dos documentos. O risco residual
da conta demo é operacional: rotação/remoção da conta no Supabase continua uma
ação humana, não algo a ser simulado pelo agente.

## Documentos: classificação e decisão de retenção

### Fonte canônica atual — manter

- `docs/PILOTO/FILA_0_A_100_CONTINUACAO.md`
- `docs/PILOTO/TRANSVERSAL_READINESS.json`
- `docs/PILOTO/ACEITE_C1_*.md` até `ACEITE_C11_*.md`
- `docs/PILOTO/INVENTARIO_EXTERNOS_2026-09-05.md`
- `docs/IDEIAS_PRODUTO_OLLI_ORCAMENTOS_2026-09-06.md`
- `docs/PROMPTS_E_IDEIAS_DO_USUARIO_OLLI_2026-09-06.md`
- `docs/AUDITORIA_GERAL.md` e `docs/INTEGRATION_BACKLOG.md`

### Histórico necessário — manter, mas não usar como estado atual

- `docs/PILOTO/LEDGER*.md`, `RUN_STATE.json`, `NEXT_PROMPT.md` e
  `AUTOMACAO_5H.md`;
- `docs/ONDA_1`, `docs/ONDA_2`, `docs/ONDA_3`;
- `docs/ENXAME`, pesquisas, ADRs e snapshots;
- `docs/AUDITORIA_ABA_POR_ABA.md`, `docs/REAUDITORIA_PAINEL.md` e
  `docs/WEB_REBUILD_BRIEF.md`;
- `docs/ABACATEPAY.md` e `docs/ENXAME/PAGAMENTOS_ROTEAMENTO.md`, porque
  registram por que o gateway foi removido. O próprio D6 histórico determina
  não apagar esse material.

### Artefatos que não devem virar runtime

- drafts `LOCAL_ONLY` de notifications/supressão;
- migrations `.pendente` de índice de numeração;
- snapshots, ledgers e relatórios de canário;
- qualquer `.env`, sessão, cofre, token ou backup bruto.

Nenhum desses itens foi apagado: eles documentam limites e rollback. O único
artefato temporário desta auditoria (`graphify-out/`) foi removido.

## Decisões ainda abertas

1. criar/fornecer staging Supabase isolado antes de aplicar as migrations novas;
2. fechar a fonte autoritativa de entitlement e executar lifecycle de billing em
   sandbox;
3. autorizar coorte de e-mail e webhook Resend real, sempre começando em hold;
4. aprovar persistência/notificações e testar aparelhos/navegadores reais;
5. executar sessão AAL2 real, finalidade e coorte para dados administrativos;
6. decidir build assinado, instalação, atualização, rollback e distribuição do
   APK/PWA;
7. decidir se a conta demo será removida/rotacionada pelo proprietário.

## Veredito

O trabalho dos últimos dias não está perdido nem desorganizado: os pacotes
atuais têm código, testes e aceites correspondentes. A maior parte das ideias
do proprietário foi transformada em contratos e comportamento local. O que
resta não é uma coleção de telas “soltas”; são gates externos concretos que não
podem ser substituídos por green checks locais.

Não há exclusão adicional segura a fazer sem destruir histórico, rollback ou
proveniência. O próximo avanço real depende de uma autorização/ambiente externo,
não de apagar documentos antigos.
