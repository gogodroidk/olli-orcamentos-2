# Auditoria de segurança — 2026-09-10

## Resultado da rodada

### Revalidação de 2026-09-11 (staging `sbpkutknpywezeagioon`)

- As migrations `financial_integrity_guards`, `validate_financial_constraints`
  e `document_storage_key` foram aplicadas somente no staging. Os CHECKs de
  status/valor estão validados, as consultas de legado encontraram zero linha
  incompatível e o trigger `recibos_validar_financeiro` está ativo.
- O trigger valida valor positivo/forma informada e trava a linha do orçamento
  antes de somar recebimentos, fechando a corrida de duas gravações concorrentes
  na camada atual de recibos. O ledger dedicado e comprovante auditável seguem
  como evolução posterior, não são fingidos por esta proteção.
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
  antes de seguir para a integração.

- OSV Scanner 2.4.0: **0 vulnerabilidades** nos locks do app (`package-lock.json`), Worker (`worker/package-lock.json`) e painel (`webapp/pnpm-lock.yaml`). Foram corrigidos `sharp` 0.35.2 → 0.35.4 e `js-yaml` 4.3.1 → 4.3.2.
- Gitleaks 8.30.1: 9 achados históricos, todos classificados como chave pública Supabase anon/JWT ou fixture pública. Não apareceu service-role key, Stripe secret, Resend key, Cloudflare token ou credencial privada no escopo atual. O histórico não foi reescrito automaticamente.
- Supabase staging: migration `20260910143000_fix_ia_quota_lint` corrigiu os casts das RPCs, a referência de conflito da cota diária e a variável morta; `db lint` agora retorna **No schema errors found**. Produção não foi tocada.
- Worker staging: smoke remoto passou health, CORS, method gates, shell administrativo e `sideEffects: none`.

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
