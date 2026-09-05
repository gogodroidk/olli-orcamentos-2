# Self-prompt — OLLI 0→100

Atualizado em: **2026-09-04T19:50:26-03:00**  
Estado: **BLOQUEADO-HUMANO — 100% do backlog autônomo/local concluído; programa total ainda não aceito**

## Estado canônico

- Repositório: `C:\OLLI_REL`.
- `RUN_STATE.status=blocked`, nenhuma lease/tarefa/allowlist ativa.
- `TRANSVERSAL_READINESS.program100Percent=false`.
- Executor e vigia: `PAUSED`.
- Todos os itens do backlog autônomo estão `done_local_only` ou operacionalmente encerrados.
- `acceptedReal=false` em todas as frentes transversais.
- Não abrir uma nova tarefa só porque chegou outro pulso de continuidade; primeiro exigir mudança material em um gate.

## Últimas entregas locais

1. Supressão de e-mail: contrato puro e draft SQL fora de migrations, com HMAC fingerprint, tenant/usuário, CAS, replay e purge; `43/43`.
2. J3.1 shadow: IDs únicos, timestamp UTC canônico, cronologia, proteção contra Symbol e imutabilidade sem efeito lateral; `8/8`, kernel com 99,07% de linhas; revisão independente sem P0/P1.
3. Persistência de notificações: draft fail-closed de sete tabelas, sem token bruto, RLS forçada, retenção de 90 dias e purge paginado; `25/25` e 40 statements parseados.
4. Admin: `/admin/api/user` exige AAL2 antes da primeira consulta service-role e o RBAC de detalhe admite suporte/financeiro/admin/owner com datasets mínimos; governança `24/24`, dados `21/21` e dry-run do Worker aprovados.
5. Release: configuração Expo/EAS, identidade, perfis e assets auditados; `16/16`, release config e Expo config aprovados. PWA ainda não instalável (`display=browser`, sem service worker); nenhum build/loja/aparelho executado.
6. Billing: mapa Stripe/Mercado Pago/Apple IAP, proposta de fonte autoritativa servidor e roteiro sandbox de 12 passos; `230/230` asserções locais.

## Estado operacional de e-mail já comprovado

- Supabase `yiaeplqinnnnniyvwtls`: migrations de outbox/tenant/runtime aplicadas.
- Worker `olli-diagnostico`: versão `794daafb-bd92-4e10-8745-e28de6a6f4db`, cron de um minuto.
- `WELCOME_DISPATCH_MODE=simulator`, lote máximo 1; linhas normais permanecem `hold`.
- Único canário: `delivered@resend.dev`, `claimed=1`, `sent=1`, `failed=0`, uma tentativa, provider ID presente e zero resíduo sintético.
- Isto prova aceitação técnica da API no simulador, não rollout nem entrega para usuário real.

## Gates humanos/externos remanescentes

### 1. E-mail real

Identidade técnica e simulador foram comprovados. Falta aprovar coorte nominal interna/consentida, base transacional, supressão integrada ao runtime, limites de bounce/complaint e rollback para `hold`. Não trocar nenhuma linha para `dispatch_scope=production` sem isso.

### 2. Persistência e aceite de notificações

O draft SQL deve ser promovido para migration somente com revisão de RPCs atômicas, retenção/base legal e rollback. Depois escolher aparelhos, testar permissão negada/aceita/revogada, token inválido e múltiplos aparelhos. Web Push exige VAPID, service worker e navegadores aprovados.

### 3. Admin com dados reais

O gate local de AAL2 está pronto. Falta uma sessão AAL2 real, finalidade, base legal, papéis/campos, retenção, auditoria persistida e coorte autorizada antes de consultar/exportar dados reais ou publicar o Worker.

### 4. Billing

O proprietário deve aprovar uma decisão:

- recomendada: providers são origens de eventos e o snapshot servidor reconciliado é a única fonte de entitlement; Stripe=cartão, Mercado Pago=Pix/legado, Apple IAP=iOS;
- simplificada: Stripe é o único provider de plano no web/Android permitido, `/mp/plano/pix` deixa de vender período de plano com compatibilidade do legado, e Apple IAP continua separado no iOS.

Depois, autorizar uma conta sandbox específica para checkout, webhook assinado, replay, evento fora de ordem, segundo ciclo, falha, cancelamento e downgrade. Nenhuma cobrança real.

### 5. PWA/APK/lojas

Antes do APK/AAB final: decidir se a PWA será implementada, escolher conta/canal/aparelhos, autorizar custo de build, consultar versão remota, gerar artefato assinado, registrar SHA-256, instalar, testar upgrade/dados/rollback e só então submeter ao canal interno/fechado aprovado. A regra continua sendo um único APK final.

## Regra de retomada

Somente reabrir o executor quando houver pelo menos um destes insumos explícitos e verificáveis:

- decisão de arquitetura de billing + autorização sandbox;
- aprovação de migration de notificações + ambiente/rollback;
- aparelhos e identidade Web Push/Push escolhidos;
- finalidade/coorte administrativa + sessão AAL2;
- coorte real de e-mail consentida;
- conta/canal/aparelhos e autorização de build/distribuição.

Ao reabrir, gerar novos `run_id` e `handoff_id`, renovar a lease, registrar `INICIO`, usar allowlist mínima, executar preflight e parar no primeiro desvio. Credencial, pagamento, publicação, contato, dados reais ou ação destrutiva continuam gates separados; uma autorização não libera as outras.
