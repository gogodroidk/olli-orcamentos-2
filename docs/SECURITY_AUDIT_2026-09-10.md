# Auditoria de segurança — 2026-09-10

## Resultado da rodada

### Revalidação de 2026-09-11 (staging `sbpkutknpywezeagioon`)

- As migrations `financial_integrity_guards`, `validate_financial_constraints`
  e `document_storage_key` foram aplicadas somente no staging. Os CHECKs de
  status/valor estão validados, as consultas de legado encontraram zero linha
  incompatível e o trigger `recibos_validar_financeiro` está ativo.
- O trigger valida valor positivo/forma informada e trava a linha do orçamento
  antes de somar recebimentos, fechando a corrida de duas gravações concorrentes
  na camada atual de recibos. O ledger dedicado agora também está aplicado no
  staging, com comprovante auditável e estorno separado do recibo.
- `arquivo_chave` estável foi adicionado ao registro/versão local e remoto; o
  PDF nativo calcula SHA-256, tenta upload privado e mantém `file://` como
  fallback explícito. URL assinada é regenerada pela chave e não é tratada como
  permanente.
- O chat mobile agora tem modo **Preparar alteração**: o Worker retorna uma
  prévia persistida e o app oferece confirmar/cancelar/desfazer por endpoints
  separados. O token fica em memória; exclusão, pagamento, senha e permissões
  continuam fora da allowlist.
- O detalhe/lista mobile esconde recibo e dados financeiros de papéis sem
  `ver_valores_agregados`; o estado financeiro permanece independente do status
  comercial e não desaparece quando uma proposta quitada é encerrada.
- O staging agora tem `public.pagamentos`: ledger por evento com chave de
  idempotência, saldo serializado por orçamento, comprovante (chave/hash/mime/
  tamanho), estorno auditável e grants explícitos sem DELETE para clientes.
  Mobile/web marcam `ledgerStatus=pendente` quando a rede falha e não confundem
  esse estado com confirmação remota.
- A trigger do ledger foi exercitada em transação temporária: INSERT válido passa;
  INSERT como `estornado`, edição de valor e DELETE falham; somente a transição
  para estorno com ator/motivo/data passa. A borda de `OLD` no INSERT foi corrigida
  antes de seguir para a integração. A migration de vínculo permite somente
  `recibo_id` NULL→id do mesmo tenant, é idempotente e rejeita segundo vínculo;
  o teste transacional deixou zero resíduos no staging.
- A sincronização local/web registra `ledgerReciboVinculado` e retenta o vínculo
  depois do upsert do recibo. Falhas transitórias permanecem pendentes; nenhuma
  tentativa altera valor, estado ou comprovante já lançado.
- A importação de CSV/XLSX/JSON no painel mantém um snapshot anterior por linha e
  executa compensação em ordem reversa. Inclusões são soft-delete na lixeira;
  falha de compensação não é escondida como sucesso.
- O Worker staging expõe `/ia/importacao/preview` com JWT, rate-limit/cota,
  limite de texto/itens, fontes HTTPS e JSON Schema estrito. O retorno é somente
  prévia não persistida (`requiresReview=true`); não há busca externa nem escrita
  automática.
- O editor da Central usa a RPC `editar_documento_rascunho` (`SECURITY INVOKER`),
  que cria versão e atualiza o ponteiro atomicamente. Estados enviados, assinados
  e arquivados são congelados e não podem ser sobrescritos.
- A policy PMOC/ativos foi revisada para menor privilégio: técnico não apaga
  cabeçalhos do tenant; somente dono/admin/gestor podem excluir, e tokens/versões
  históricas não possuem DELETE para `authenticated`. O comportamento foi provado
  em staging com um técnico sintético e `ROLLBACK`.
- O alinhamento de patches do Expo 57 foi concluído com o instalador oficial;
  `expo-doctor` passa 20/20 e a API de notificações usa `granted` conforme os
  typings atuais.
- O painel web não deixa mais `arquivo_chave` privado sem ação: valida bucket e
  caminho e gera URL assinada de 15 minutos. O texto do editor tem teto de
  200.000 caracteres, além do limite de 1 MiB imposto pela RPC.
- O verifier PKCE do scaffold de Google Agenda usa `expo-crypto.getRandomValues`;
  o recurso continua desligado até a arquitetura de redirect HTTPS ser aprovada.
- A migration `20260911141612_remove_duplicate_ia_quota_indexes` remove apenas
  índices UNIQUE redundantes das tabelas de cota IA; as constraints primárias
  continuam sendo a autoridade de unicidade. O advisor de performance ainda
  lista policies permissivas múltiplas em tabelas legadas, sem novo alerta de
  segurança causado pelas mudanças desta rodada.

- OSV Scanner 2.4.0: **0 vulnerabilidades** nos locks do app (`package-lock.json`), Worker (`worker/package-lock.json`) e painel (`webapp/pnpm-lock.yaml`). Foram corrigidos `sharp` 0.35.2 → 0.35.4 e `js-yaml` 4.3.1 → 4.3.2.
- Gitleaks 8.30.1: 9 achados históricos, todos classificados como chave pública Supabase anon/JWT ou fixture pública. Não apareceu service-role key, Stripe secret, Resend key, Cloudflare token ou credencial privada no escopo atual. O histórico não foi reescrito automaticamente.
- Supabase staging: migration `20260910143000_fix_ia_quota_lint` corrigiu os casts das RPCs, a referência de conflito da cota diária e a variável morta; `db lint` agora retorna **No schema errors found**. Produção não foi tocada.
- Worker staging: smoke remoto passou health, CORS, method gates, shell administrativo e `sideEffects: none`.
- Revalidação final: `supabase db lint --linked` retornou **No schema errors
  found**; a policy QA de PMOC terminou com `ROLLBACK` e consulta posterior
  confirmou zero resíduo. Os advisors continuam mostrando somente os sete
  `SECURITY DEFINER` históricos e as policies permissivas legadas já listadas;
  não apareceu alerta novo nas migrations desta rodada.

## Controles confirmados no código

- IA operacional usa escopos/campos allowlisted, tenant resolvido no servidor, RBAC, diff, token de confirmação, auditoria e rollback.
- A biblioteca de documentos usa versões append-only, FK composta de tenant/pai, triggers de ownership/congelamento e não expõe DELETE direto para clientes autenticados.
- O bucket `olli-documentos` não aceita mais update/delete de usuários autenticados; o ciclo de artefato fica separado de logos/fotos.
- O sync de documentos usa guard de `atualizado_em` tanto no push em lote quanto na escrita unitária, evitando regressão por aparelho stale.
- Os grants do Data API foram explicitamente reduzidos: anon não tem acesso; authenticated só lê/cria/atualiza o registro e lê/cria versões; DELETE de usuário permanece ausente.
- Ações destrutivas em massa são recusadas pelo chat; upload e futura ingestão devem continuar isolados e limitados.
- Produção continua `acceptedReal=false`; não há promoção automática, secrets de produção nem cobrança real nesta rodada.

## Ações futuras obrigatórias

1. Revisar a origem histórica das chaves anon/JWT e remover `.env` antigo do histórico somente com decisão explícita e plano de rotação.
2. Reexecutar Gitleaks/OSV no gate de release e anexar os relatórios ao artefato da versão.
3. Antes de produção, repetir RLS/tenant, IA, upload, rate/cost limit, backup/rollback e smoke pós-deploy.
4. Adicionar o job isolado para PDF/foto antes de habilitar ingestão IA fora de
   CSV/XLSX/JSON; manter revisão humana e sem escrita automática.
