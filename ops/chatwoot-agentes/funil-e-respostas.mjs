#!/usr/bin/env node
// Etiquetas do funil e respostas prontas de vendedor (CQ-CHATWOOT-100). Idempotente: só cria o que falta, não apaga nada.
// Funil (já existiam, mantidas porque o robô e as campanhas gravam estas chaves):
//   novo = funil-novo · em conversa = funil-em-conversa · orçamento = funil-orcamento-enviado · pagou = funil-pagou (nova)
//   perdido = funil-perdido · parar-contato = parar-contato
// Respostas "v-*": voz de vendedor (D-2233: pergunta aberta, sem "responda SAIR", sem "quer continuar?";
// D-2333: nunca diz que é pessoa). Preços só os publicados/aprovados: Pro R$ 39, Empresa R$ 99 (OLLI);
// Site Pronto R$ 997 e Atendente com IA R$ 197/mês (OLLI Serviços, D-2408 e resposta pronta sa-site/sa-atendente).
import { api, carregarCredenciais } from './lib.mjs';
import { motivosDeBarrar } from './travas.mjs';

carregarCredenciais();
const TOK = process.env.CHATWOOT_TOKEN_ADMIN;
const ETIQUETAS = [
  { title: 'funil-pagou', description: '[Etapa] Pagou (Pix/cartão confirmado). Funil: novo → em conversa → orçamento → pagou | perdido', color: '#2E7D5B', show_on_sidebar: true },
];
const RESPOSTAS = [
  ['v-oi-olli', 'Oi! Aqui é da OLLI. Me conta: que tipo de serviço você faz e como você manda orçamento hoje?'],
  ['v-retomar', 'Oi! Passando pra retomar nossa conversa. Em que pé ficou aí? O que falta pra você fechar o próximo orçamento pelo app?'],
  ['v-travou', 'Me conta qual parte travou. Se preferir, me manda o serviço e os valores que você quer colocar, que eu monto junto com você.'],
  ['v-pro', 'O Pro sai R$ 39 por mês: o orçamento vai sem o selo "Feito com OLLI", com follow-up automático, link com pagamento na hora e o termômetro do orçamento. Pelo que você me contou, qual desses mais pesa no seu dia a dia?'],
  ['v-empresa', 'O plano Empresa sai R$ 99 por mês: tudo do Pro, mais vários técnicos com permissões, PMOC e contratos de manutenção. Quantas pessoas trabalham com você hoje?'],
  ['v-pagar', 'O pagamento é pelo navegador, na tela Planos de https://olliorcamentos.online (Pix ou cartão). Assim que cair, o Pro já libera na sua conta. Qualquer coisa que travar no caminho, me fala aqui.'],
  ['v-objecao-caro', 'Entendo. Pensa assim: se o app te ajudar a fechar um serviço a mais no mês, ele já se pagou várias vezes. Quanto custa, em média, um serviço seu?'],
  ['v-objecao-depois', 'Tranquilo. O que precisa acontecer pra fazer sentido pra você? Me fala que eu te ajudo a ver se o app resolve.'],
  ['v-ia', 'Sou o assistente virtual da OLLI. Posso te ajudar com o app, com o orçamento ou com o plano. O que você precisa agora?'],
  ['v-servicos-site', 'O Site Pronto sai R$ 997: site de 1 página com botão de WhatsApp, e você só paga depois de aprovar no ar. Que serviços e que região você quer que apareçam no site?'],
  ['v-servicos-atendente', 'O Atendente com IA no WhatsApp sai R$ 197 por mês: responde seu cliente na hora, a qualquer hora, e te passa quem quer fechar. Hoje, quem responde quando você está no serviço?'],
  ['v-passar-equipe', 'Boa pergunta. Vou confirmar com a equipe e te respondo por aqui ainda hoje.'],
];

for (const r of RESPOSTAS) { const m = motivosDeBarrar(r[1]); if (m.length) throw new Error(`resposta ${r[0]} barrada: ${m.join('; ')}`); }

const labels = (await api(TOK, '/labels')).payload.map((l) => l.title);
for (const e of ETIQUETAS) {
  if (labels.includes(e.title)) { console.log(`etiqueta ${e.title}: já existe`); continue; }
  await api(TOK, '/labels', 'POST', e);
  console.log(`etiqueta ${e.title}: criada`);
}
const atuais = await api(TOK, '/canned_responses');
let novas = 0;
for (const [short_code, content] of RESPOSTAS) {
  const ja = atuais.find((c) => c.short_code === short_code);
  if (ja) { if (ja.content !== content) await api(TOK, `/canned_responses/${ja.id}`, 'PATCH', { canned_response: { content } }); continue; }
  await api(TOK, '/canned_responses', 'POST', { canned_response: { short_code, content } });
  novas++;
}
const comSair = (await api(TOK, '/canned_responses')).filter((c) => /responda\s+sair|digite\s+sair|n[aã]o te chamo mais/i.test(c.content));
console.log(`respostas prontas: ${novas} novas; com "responda SAIR"/"não te chamo mais": ${comSair.length}`);
const funil = ['funil-novo', 'funil-em-conversa', 'funil-orcamento-enviado', 'funil-pagou', 'funil-perdido', 'parar-contato'];
const agora = (await api(TOK, '/labels')).payload.map((l) => l.title);
console.log(`funil completo: ${funil.every((f) => agora.includes(f)) ? 'sim' : 'NÃO'} (${funil.join(' → ')})`);
