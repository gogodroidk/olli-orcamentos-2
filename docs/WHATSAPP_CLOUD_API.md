# WhatsApp Cloud API — multi-número (worker `olli-diagnostico`)

> Preço: a seção CUSTO mais abaixo descreve a regra lida em 07/10/2026. Desde 01/10/2026 a Meta cobra a mensagem de serviço depois de 1.000 grátis por número no mês, e cobra utilidade também dentro da janela de 24 h. A conta vigente da Central está em `src/services/atendimentoCusto.ts`, travada por `scripts/teste-atendimento-custo.ts`. Não use o "grátis" desta página para orçar esse produto.



Código: `worker/src/whatsappCloud.js` · regras de envio: `supabase/migrations/20261007110000_whatsapp_cloud_multinumero.sql`
· testes: `worker/scripts/teste-whatsapp-cloud.js` (18) e `scripts/teste-whatsapp-cloud-sql.ts` (66, Postgres real).
Opt-out já existente: `docs/WHATSAPP_NAO_CONTATAR.md` (`whatsapp_nao_contatar`).

## URLs (host do worker: `diagnostico.olliorcamentos.online`)
| Rota | Quem chama | Autenticação |
|---|---|---|
| `GET  /whatsapp/webhook` | Meta (verificação) | `hub.verify_token` = Vault `wa_verify_token` |
| `POST /whatsapp/webhook` | Meta (mensagens/status) | `X-Hub-Signature-256` = HMAC do corpo com o app secret (Vault `wa_app_secret`) |
| `POST /whatsapp/enviar` | atendimento (Bruno) | `Authorization: Bearer` = Vault `wa_envio_token` |
| `GET  /whatsapp/fila` · `POST /whatsapp/fila/atualizar` | atendimento | idem |
| `POST /whatsapp/aprovar` | **só humano** (OK do 1º contato) | Bearer = Vault `wa_aprovacao_token` (≠ do envio) |

Callback URL no app Meta (id 869290166155166 → WhatsApp → Configuration): `https://diagnostico.olliorcamentos.online/whatsapp/webhook`,
campo assinado **messages**. Segredo ausente no Vault = rota responde **503** (desligada, nunca aberta).

## O que o MAESTRO precisa fazer (nada disso está feito)
1. **Aplicar a migration** (zona de produção — só com aviso): `20261007110000_whatsapp_cloud_multinumero.sql`. Aditiva; cria `wa_numeros`
   (com o número `1162487800287754`, WABA `2107349913458786`, marca OLLI, **`ativo = false`**), `wa_contatos`, `wa_entrada`, `wa_envios` e as funções.
2. **Gravar 5 segredos no Vault** (SQL Editor/MCP; nunca no repo — o worker está em 64/64 variáveis, por isso Vault):
   ```sql
   select vault.create_secret('<verify token que você inventar>',  'wa_verify_token',    'WhatsApp webhook');
   select vault.create_secret('<APP SECRET do app Meta 869290166155166>', 'wa_app_secret', 'WhatsApp webhook');
   select vault.create_secret('<token longo aleatório, ≥ 32 car.>', 'wa_envio_token',     'WhatsApp rotas internas');
   select vault.create_secret('<OUTRO token longo, só de humano>',  'wa_aprovacao_token', 'WhatsApp OK humano');
   select vault.create_secret('<META_SYSTEM_USER_TOKEN>',           'wa_access_token',    'WhatsApp Cloud API');
   ```
   Trocar: `select vault.update_secret(id, '<novo>') from vault.secrets where name = '<nome>';`
3. **Deploy do worker** (`env -u CLOUDFLARE_API_TOKEN npx wrangler deploy`; sem variável nova).
4. **Registrar o webhook** na Meta (URL acima + `wa_verify_token`) e assinar `messages`. A Meta chama o GET: tem de dar 200.
5. **Ligar o número** quando a Meta mostrar CONNECTED: `update public.wa_numeros set ativo = true where phone_number_id = '1162487800287754';`
6. Teste de ponta a ponta com o **seu** número: escrever para o número OLLI → aparece em `GET /whatsapp/fila`.

## Regras de envio (uma só fonte: `wa_autorizar_envio`, atômica por número)
Recusa (HTTP 409; `aguarde` = 429 com `Retry-After`) quando: número desligado/inexistente · pessoa na lista **não contatar** (SAIR/pare/cancelar
recebidos entram sozinhos) · **primeiro contato** (a pessoa nunca escreveu) sem OK humano via `/whatsapp/aprovar` · **fora da janela de 24 h**
só `template` · intervalo mínimo entre templates (padrão 180 s, `intervalo_envio_s` por número, 30–900) · teto diário de templates (padrão 40).
Quem envia deve espalhar entre 2–5 min (o banco garante o piso). Envio que **falhou** na Meta não consome ritmo nem teto.
Pedir para sair: o texto casa no **começo** (`sair`, `pare`, `parar`, `stop`, `cancelar`, `descadastrar`, `remover`, `não quero…`) — na dúvida, sai
(custo de um falso positivo = reativar à mão; custo de ignorar um SAIR = denúncia e número bloqueado).

Exemplo (texto, dentro da janela): `POST /whatsapp/enviar` `{ "marca": "OLLI", "para": "(11) 98765-4321", "tipo": "texto", "texto": "Olá!" }`
Template: `{ "marca": "OLLI", "para": "...", "tipo": "template", "template": "nome_aprovado", "idioma": "pt_BR", "componentes": [...] }`
OK humano: `POST /whatsapp/aprovar` `{ "marca": "OLLI", "telefone": "...", "por": "Igor" }`.

## Adicionar o 2º número (amanhã)
`insert into public.wa_numeros (phone_number_id, waba_id, marca, segredo_token) values ('<id>', '<waba>', '<marca>', 'wa_access_token');` e `ativo = true`.
Token próprio por número: criar outro segredo no Vault e apontar `segredo_token`. O app secret é do **app** (um só enquanto for o mesmo app).

## CUSTO — o que a Meta cobra (fonte: developers.facebook.com/docs/whatsapp/pricing, lida em 07/10/2026; vale desde 01/07/2025)
- Cobrança é **por mensagem de template ENTREGUE**, por categoria (marketing/utilidade/autenticação) e país do destinatário. Valor em BRL: ver o painel da Meta (a página de preços não traz o número; **não assumi nenhum**).
- **Grátis:** qualquer mensagem que não seja template (texto, imagem…) dentro da janela de 24 h aberta pela PESSOA; template de **utilidade** dentro da janela; e **72 h de janela grátis (qualquer tipo)** quando a pessoa chega por anúncio Click-to-WhatsApp ou botão de Página e você responde em até 24 h.
- **Pago:** template de marketing fora da janela; utilidade fora da janela; autenticação.
- **Regra do projeto:** NENHUM template de marketing sai sem custo dito e OK do Igor. `teto_diario_templates` (padrão 40) é teto de segurança, não meta; para o piloto, baixar para o que o Igor autorizar (`update public.wa_numeros set teto_diario_templates = N …`).
- Consequência de desenho: a abordagem barata é a PESSOA escrever primeiro (anúncio Click-to-WhatsApp → 72 h grátis, e o webhook traz o objeto `referral` com o anúncio de origem). Hoje `wa_autorizar_envio` usa 24 h; estender para 72 h quando houver `referral` + guardar o anúncio de origem é a próxima evolução (não feita).

## Privacidade (LGPD) e logs
- Telefone, nome do perfil e texto de quem escreve ficam **só** em `wa_entrada`/`wa_contatos` (RLS ligada, sem policy, revogado de anon/authenticated).
- Logs do worker levam só contagens e rótulos — **nunca** telefone, nome, texto, token ou corpo de erro da Meta (teste tranca isso).
- **Retenção (parecer LEGAL 07/10/2026): rotina diária no ar no código** — `public.wa_retencao_limpar()` chamada pelo worker às 06:19 UTC
  (`worker/src/whatsappRetencao.js`). Apaga `wa_entrada` resolvida/saiu após 180 dias, `wa_entrada` parada (novo/em_atendimento) e `wa_envios`
  após 12 meses e `wa_contatos` sem nenhuma linha após 12 meses; a lista de supressão (SAIR) não é tocada. Sem rotina rodando, **não ligar** `ativo=true`.
- **SAIR ampliado (parecer item 3a):** além de palavras soltas (sair, pare, stop…), mensagens curtas (≤ 160 caracteres) como "me tira dessa lista",
  "não me mande mais", "chega de mensagem", "pare de me enviar", "bloqueei", "não tenho interesse", "apague meus dados" viram opt-out. Mensagem longa
  é conversa: **regra humana (3b)** — o Bruno lê toda resposta em `novo` e, se parecer recusa, marca `saiu` à mão com `registrar_nao_contatar_whatsapp`.
- **Ainda fora (recomendações do parecer):** `wa_apagar_titular(telefone)` (art. 18), resposta automática de 1 linha ao SAIR dentro da janela, anti-replay do webhook.
- **Antes de `ativo=true`:** (1) parágrafo de política de privacidade (texto do jurídico, OK do Igor); (2) esta rotina rodando em produção (worker publicado + migration aplicada); (3) regex ampliada (feita aqui) + regra humana do Bruno.
- A política de privacidade já promete o opt-out; confirmar com o Dr. Paulo o texto sobre "mensagens recebidas pelo WhatsApp" antes de ligar.

## Limites conhecidos
- Mensagens de mídia (imagem/áudio) entram na fila só como tipo (sem baixar o arquivo). Fica para quando houver necessidade.
- Resposta automática de confirmação ao SAIR não é enviada (evita mensagem automática fora de template); o Bruno vê "saiu" na fila.
- Termos 4.7 da Meta (vigentes 23/09/2026): IA como produto principal é proibida; aqui a fila é de atendimento humano.

## PRÉ-REQUISITOS DO 2º TENANT (adiados de propósito — revisão do #181, 07/10/2026)
Hoje há UMA empresa (a holding OLLI) e o atendimento é humano e interno; os itens abaixo só importam quando um **segundo dono/marca**
passar a usar as mesmas rotas. Antes disso, NÃO abrir o serviço a terceiros:
1. **Isolamento por tenant do `wa_envio_token` e da fila:** hoje 1 token serve a todos os números (`/whatsapp/fila` lista todas as marcas;
   `/whatsapp/enviar` aceita qualquer `phone_number_id`/`marca` ativo). Precisa de token por número/marca (ou JWT com marca) e filtro por marca na fila.
2. **Recuperação de envio `reservado`:** se o worker morrer entre `wa_autorizar_envio` e `wa_concluir_envio`, a linha fica `reservado` e conta no
   ritmo/teto para sempre. Precisa de TTL (ex.: `reservado` há > 10 min vira `falhou` com `codigo_falha = 'expirou'`) — cron do banco ou na própria `wa_autorizar_envio`.
3. **HMAC sobre bytes crus:** a assinatura é calculada sobre o corpo decodificado em texto UTF-8 (`lerCorpoLimitado`); como a Meta assina os bytes, um
   corpo com sequência inválida pode divergir. Hoje o payload da Meta é JSON UTF-8 válido, então não falha; ler `ArrayBuffer` e validar sobre os bytes elimina o risco.
4. **Janela anti-replay do webhook:** a assinatura não carrega timestamp; um POST antigo capturado e reenviado passa. A gravação é idempotente por
   `wa_message_id` (reenvio não duplica), mas statuses antigos poderiam "rebaixar" — a função já não rebaixa estado. Avaliar descartar `timestamp` muito antigo.
