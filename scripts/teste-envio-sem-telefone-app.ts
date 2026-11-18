/**
 * ENVIO DO ORÇAMENTO SEM TELEFONE (app) — o envio não pode morrer num aviso.
 *
 *     node scripts/teste-envio-sem-telefone-app.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O DEFEITO (18/11, Z-186): sem `clienteTelefone`, "Enviar no WhatsApp" mostrava
 * "Cadastre o WhatsApp de X para enviar por aqui" e PARAVA. 6 de 9 contas novas que
 * ficaram só em rascunho tinham TODOS os orçamentos sem telefone. Agora o app pergunta
 * e abre o WhatsApp com a mensagem pronta para a pessoa escolher o contato.
 */
import { readFileSync } from 'node:fs';
import { linkApiWhatsApp, linkWaMe } from '../src/utils/telefoneWhatsapp.ts';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};

const tela = readFileSync(new URL('../src/screens/VisualizarOrcamentoScreen.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ini = tela.indexOf('async function handleWhatsAppAgora()');
const corpo = tela.slice(ini, tela.indexOf('\n  }\n', ini));
ok('o aviso sem saída sumiu do envio', !corpo.includes('para enviar por aqui'));
ok('sem número, pergunta "Escolher no WhatsApp"', /if \(!telefone\) \{[\s\S]*?confirmar\(\{[\s\S]*?rotuloConfirmar: 'Escolher no WhatsApp'/.test(corpo));
ok('só desiste se a pessoa recusar', /if \(!seguir\) return;/.test(corpo));
ok('a pergunta vem ANTES do registro do envio (nada é contado se recusar)', corpo.indexOf("rotuloConfirmar: 'Escolher no WhatsApp'") < corpo.indexOf("autorizarEntrega('whatsapp')"));
ok('o WhatsApp abre com o telefone (vazio = seletor de contato)', corpo.includes('await abrirWhatsApp(telefone, mensagem)'));
ok('import do confirmar', /import \{ confirmar, toast \} from '\.\.\/components\/feedback';/.test(tela));
ok('sem número, link abre o seletor (wa.me/?text=)', linkWaMe('', 'Oi') === 'https://wa.me/?text=Oi' && linkApiWhatsApp('', 'Oi') === 'https://wa.me/?text=Oi');

console.log(falhas ? `\n${falhas} falha(s)` : '\nPASSOU');
process.exit(falhas ? 1 : 0);
