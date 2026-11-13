# HANDOFF — CQ-WA-ROBO-GRATIS (D-1991)

Quem mexeu por último: Claude (Opus 5.5), 12/11/2026. Branch `claude/cq-wa-robo-gratis` (base origin/main 9dfa38c9).
Sem deploy, sem migration aplicada, sem mensagem enviada.

## O que já existia (não foi recriado)
`worker/src/whatsappCloud.js` (07/10/2026) já fazia os itens 1–3:
- `GET  /whatsapp/webhook` — verificação (hub.verify_token → hub.challenge).
- `POST /whatsapp/webhook` — valida `X-Hub-Signature-256` com o app secret ANTES de ler; grava em `wa_entrada` (RLS ligada).
- `POST /whatsapp/enviar`, `GET /whatsapp/fila`, `POST /whatsapp/fila/atualizar`, `POST /whatsapp/aprovar` — rotas internas.
- SAIR → `nao_contatar`; janela 24 h, teto e 1º contato com OK humano decididos no banco (`wa_autorizar_envio`).

## O que este PR adiciona (item 4)
- Boas-vindas automática na PRIMEIRA mensagem de um telefone para aquele número:
  "Olá! Recebemos sua mensagem. Aqui é o assistente automático do atendimento e eu sou uma IA. Uma pessoa da equipe vai continuar a conversa por aqui. Se não quiser mais mensagens, responda SAIR."
  (constante `FRASE_BOAS_VINDAS` em `worker/src/passagemHumano.js`).
- Não sai se: pediu SAIR, mensagem é preço/contrato/reclamação/dado/incerteza (vai pra fila humana), duplicata, número inativo, fora da janela/teto (banco recusa).
- Migration NOVA, NÃO aplicada: `supabase/migrations/20261112090000_wa_boas_vindas.sql` (redefine `wa_registrar_entradas`; nenhuma tabela nova).
- Testes: `node worker/scripts/teste-whatsapp-cloud.js` → 30 casos (3 novos). `bash scripts/ci-local.sh worker lint` → VERDE.

## Variáveis (nomes, nunca valores)
Cloudflare (worker, já existem): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
Supabase Vault (`select vault.create_secret('<valor>', '<nome>', 'WhatsApp');` no SQL Editor):
- `wa_verify_token` — você inventa; o mesmo vai no campo "Verify token" do painel Meta.
- `wa_app_secret` — Meta > App > Configurações > Básico > Chave secreta do app.
- `wa_access_token` — token de usuário do sistema (Business Manager) com `whatsapp_business_messaging`.
- `wa_envio_token`, `wa_aprovacao_token` — você inventa (diferentes), para as rotas internas.
Linha em `public.wa_numeros` (phone_number_id, waba_id, marca, ativo=true) do número de TESTE.

## Teste em número de teste (Igor)
1. developers.facebook.com → criar app tipo Business → adicionar produto WhatsApp → usar o número de teste grátis da Meta (NÃO o 8030).
2. Cadastrar seu celular como destinatário de teste no painel.
3. Gravar os segredos do Vault acima; aplicar a migration 20261112090000 (depois das anteriores) no Supabase.
4. Inserir a linha do número de teste em `wa_numeros` com `ativo = true`.
5. Deploy manual do worker (`wrangler deploy` em `worker/`, nunca por Git).
6. Painel Meta → WhatsApp → Configuração → Webhook: URL `https://<worker>/whatsapp/webhook`, verify token = `wa_verify_token`; assinar o campo `messages`.
7. Do seu celular, mandar "oi" para o número de teste → deve chegar a boas-vindas; mandar "SAIR" → nada mais sai e entra em `nao_contatar`.
8. Conferir `wa_entrada` / `wa_envios` no Supabase.

## Próximo passo
ESTADO: BLOQUEADO — criar app Meta, número de teste, segredos no Vault, aplicar migration e deploy dependem do Igor.
