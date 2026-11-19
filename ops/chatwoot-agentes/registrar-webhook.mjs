#!/usr/bin/env node
// Cria o segredo do acordador (CHATWOOT_ACORDADOR_SEGREDO no arquivo de credenciais, chmod 600) e registra o webhook
// message_created da conta 2 apontando para o acordador. Idempotente. Nunca imprime o segredo.
//   node registrar-webhook.mjs [--remover | --reverter]
//   --reverter: tira conversation_updated e volta ao conjunto ORIGINAL (message_created). É o que o instalar-ficha.sh --desfazer chama.
//   PATCH manual equivalente (sem segredo): curl -X PATCH -H "api_access_token: $CHATWOOT_TOKEN_ADMIN" -H 'Content-Type: application/json' \
//     -d '{"webhook":{"subscriptions":["message_created"]}}' http://127.0.0.1:3010/api/v1/accounts/2/webhooks/<ID>
import { readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { CRED, api, carregarCredenciais } from './lib.mjs';

carregarCredenciais();
const TOK = process.env.CHATWOOT_TOKEN_ADMIN;
const HOST = process.env.ACORDADOR_HOST || '172.20.0.1';
const PORTA = process.env.ACORDADOR_PORTA || '3013';
let seg = process.env.CHATWOOT_ACORDADOR_SEGREDO;
if (!seg) {
  seg = randomBytes(18).toString('hex');
  const txt = readFileSync(CRED, 'utf8').replace(/\n*$/, '\n');
  const tmp = `${CRED}.tmp-${process.pid}`;
  writeFileSync(tmp, `${txt}CHATWOOT_ACORDADOR_SEGREDO=${seg}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, CRED);
  console.log('segredo novo gravado em CHATWOOT_ACORDADOR_SEGREDO');
}
const url = `http://${HOST}:${PORTA}/chatwoot/${seg}`;
const atuais = (await api(TOK, '/webhooks')).payload.webhooks;
const meu = atuais.find((w) => w.url === url);
const ORIGINAIS = ['message_created'];
if (process.argv.includes('--reverter')) {
  if (!meu) console.log('webhook não encontrado: nada a reverter');
  else if (meu.subscriptions.length === ORIGINAIS.length && ORIGINAIS.every((e) => meu.subscriptions.includes(e))) console.log(`webhook ${meu.id} já está no conjunto original (${ORIGINAIS.join(',')})`);
  else {
    await api(TOK, `/webhooks/${meu.id}`, 'PATCH', { webhook: { subscriptions: ORIGINAIS } });
    console.log(`webhook ${meu.id} revertido: agora ouve só ${ORIGINAIS.join(',')}`);
  }
} else if (process.argv.includes('--remover')) {
  if (meu) await api(TOK, `/webhooks/${meu.id}`, 'DELETE');
  console.log(meu ? `webhook ${meu.id} removido` : 'nada a remover');
} else if (meu) {
  // CQ-CENTRAL-FICHA: a etiqueta parar-contato posta na tela do Chatwoot chega como conversation_updated
  if (!meu.subscriptions.includes('conversation_updated')) {
    await api(TOK, `/webhooks/${meu.id}`, 'PATCH', { webhook: { subscriptions: [...new Set([...meu.subscriptions, 'conversation_updated'])] } });
    console.log(`webhook ${meu.id} atualizado: agora também ouve conversation_updated`);
  } else console.log(`webhook já existe (id ${meu.id}, ${meu.subscriptions.join(',')})`);
}
else {
  const r = await api(TOK, '/webhooks', 'POST', { webhook: { url, subscriptions: ['message_created', 'conversation_updated'], name: 'Acordador dos agentes' } });
  console.log(`webhook criado (id ${r.payload?.webhook?.id ?? r.id ?? '?'}) → http://${HOST}:${PORTA}/chatwoot/<segredo>`);
}
