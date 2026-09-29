# Self-prompt — OLLI 0→100

Atualizado em: **2026-09-19**
Estado: **CONTINUIDADE CONTROLADA — base local + staging público comprovados; gates externos ainda abertos**

## Estado canônico

- Repositório: `C:\OLLI_REL`.
- `RUN_STATE.status=blocked`, nenhuma lease/tarefa/allowlist ativa.
- `TRANSVERSAL_READINESS.program100Percent=false`.
- Executor e vigia: `PAUSED`.
- Todos os itens do backlog autônomo estão `done_local_only` ou operacionalmente encerrados; staging foi criado e o Worker está fail-closed.
- `acceptedReal=false` em todas as frentes transversais.
- Não abrir uma nova tarefa só porque chegou outro pulso de continuidade; primeiro exigir mudança material em um gate.

## Últimas entregas locais

1. Supressão de e-mail: contrato puro e draft SQL fora de migrations, com HMAC fingerprint, tenant/usuário, CAS, replay e purge; `43/43`.
2. J3.1 shadow: IDs únicos, timestamp UTC canônico, cronologia, proteção contra Symbol e imutabilidade sem efeito lateral; `8/8`, kernel com 99,07% de linhas; revisão independente sem P0/P1.
3. Persistência de notificações: draft fail-closed de sete tabelas, sem token bruto, RLS forçada, retenção de 90 dias e purge paginado; `25/25` e 40 statements parseados.
4. Admin: `/admin/api/user` exige AAL2 antes da primeira consulta service-role e o RBAC de detalhe admite suporte/financeiro/admin/owner com datasets mínimos; governança `24/24`, dados `21/21` e dry-run do Worker aprovados.
5. Release: configuração Expo/EAS, identidade, perfis e assets auditados; `16/16`, release config e Expo config aprovados. APK debug foi compilado, instalado e aberto no `SM-G780F` (Android 13/API 33) com Metro via USB reverse; assinatura de release continua fail-closed. PWA ainda não instalável (`display=browser`, sem service worker); loja/AAB assinado não foram publicados.
6. Billing: mapa Stripe/Mercado Pago/Apple IAP, proposta de fonte autoritativa servidor e roteiro sandbox de 12 passos; `230/230` asserções locais.

## P0 imediato — orçamento organizado e aceite pelo cliente

Este requisito faz parte da próxima release executável e não deve ser tratado como ideia futura.

### Aprovação e recusa

- Remover do orçamento qualquer QR Code de Pix/pagamento enquanto o pagamento não estiver vinculado de ponta a ponta ao cliente, ao orçamento, ao provider e à conciliação do OLLI.
- Remover o QR Code usado para aprovação e substituí-lo por duas ações explícitas: **Aprovar orçamento** e **Recusar orçamento**.
- No aplicativo e no PDF, as ações devem abrir no navegador uma página pública segura referente somente àquele orçamento.
- Abrir o link não pode alterar o orçamento automaticamente. A página deve mostrar um resumo e exigir confirmação por `POST`, evitando aprovação acidental por pré-visualizadores, antivírus ou robôs de link.
- O link deve usar token opaco, não enumerável, com hash persistido, escopo de tenant/orçamento, expiração, revogação e comportamento idempotente. Não colocar dados pessoais nem IDs sequenciais na URL.
- A decisão confirmada deve sincronizar o status no OLLI, registrar data/hora e trilha mínima de auditoria, impedir decisão duplicada conflitante e mostrar ao cliente o estado final.
- Aprovação comercial e pagamento são fluxos distintos. Aprovar não cobra; pagamento só poderá aparecer depois, por uma integração funcional e conciliável.

### Separação de itens e valores

- Todo item novo precisa ter categoria explícita e validada.
- O orçamento deve renderizar seções separadas para **Serviços** e **Produtos, peças e equipamentos**.
- Serviços devem exibir descrição, quantidade/unidade aplicável, valor unitário e subtotal.
- Produtos, peças e equipamentos devem exibir descrição, subtipo, quantidade, unidade, valor unitário e subtotal.
- Exibir subtotal de serviços, subtotal de produtos/peças/equipamentos, descontos ou acréscimos identificados e total geral sem dupla contagem.
- Registros legados não podem ser silenciosamente classificados de maneira errada; devem usar uma migração compatível ou exigir revisão antes da nova emissão.

### Aceite obrigatório

- Provar o mesmo conteúdo e os mesmos totais no Android, web, visualização e PDF compartilhado.
- Testar aprovação, recusa, link expirado, link revogado, repetição da mesma decisão, tentativa de decisão conflitante e isolamento entre tenants.
- Testar orçamento somente com serviços, somente com produtos, misto, vazio, com desconto, com quantidade fracionada e com itens legados.
- Confirmar que nenhum QR Code de pagamento ou aprovação permanece nos geradores ativos antes da publicação.

## Estado operacional de e-mail já comprovado

- Supabase `yiaeplqinnnnniyvwtls` e o canário live abaixo são históricos; não usar como prova do staging atual.
- Supabase `OLLI-STAGING` (`sbpkutknpywezeagioon`) recebeu as 41 migrations de runtime manualmente.
- Worker `olli-diagnostico-staging` está em `workers.dev`, versão label `85ddf947`, cron configurado; o build automático `81e53bff-2918-4581-a274-905dc91ee866` terminou com sucesso.
- `WELCOME_DISPATCH_MODE=off` até secrets de teste existirem; linhas normais permanecem `hold`.
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

## Self-prompt da retomada atual

Com o gate do Cloudflare concluído, retomar nesta ordem: (1) provisionar secrets
de teste pelos fluxos oficiais sem imprimir valores; (2) reconciliar migration
history/rollback; (3) executar smoke autenticado de RLS/Storage com fixtures
sintéticas; (4) revisar com `security`/`reviewer`; (5) só então atualizar o
próximo gate. Se não houver autorização nova, não inventar atividade externa:
manter produção protegida e executar apenas validações read-only/autônomas.
