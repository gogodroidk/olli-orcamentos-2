/**
 * NÚMERO DE WHATSAPP — a regra única (`src/utils/telefoneWhatsapp.ts`).
 *
 *     node scripts/teste-numero-whatsapp.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O DEFEITO: quatro cópias da mesma regra, e a do app (`abrirWhatsApp`) decidia pelo
 * PREFIXO: `numero.startsWith('55') ? numero : '55' + numero`. Quem tem DDD 55 (RS)
 * — "(55) 99876-5432" — começa com 55, então saía SEM o código do país e o WhatsApp
 * abria conversa com um número que não é o do cliente. Sem telefone, abria `wa.me/55`
 * (número inválido). Nada disso dá erro na tela: a mensagem vai para o lugar errado.
 *
 *  1. Regra por QUANTIDADE de dígitos: DDD 55, "0 + DDD", "+55", fixo, vazio, lixo.
 *  2. Links: com número abre a conversa; sem número abre o seletor (`wa.me/?text=`).
 *  3. O worker usa a MESMA função (reexporta, não copia).
 *  4. App, shim web, painel e worker não têm mais regra própria (leitura do código —
 *     telas TSX e o react-native não carregam no node).
 */
import { readFileSync } from 'node:fs';
import { linkApiWhatsApp, linkWaMe, numeroWhatsAppBR } from '../src/utils/telefoneWhatsapp.ts';
import * as doWorker from '../worker/src/telefoneWhatsapp.js';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  if (Object.is(real, esperado)) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${String(esperado)}\n        recebido: ${String(real)}`);
  }
}

console.log('\n1. Regra do número');
const casos: [string, unknown, string | null][] = [
  // DDD 55 (RS) — o bug: começa com 55 mas NÃO tem o código do país.
  ['DDD 55 celular "(55) 99876-5432"', '(55) 99876-5432', '5555998765432'],
  ['DDD 55 fixo "55 3221-1234"', '55 3221-1234', '555532211234'],
  ['DDD 55 já com país "+55 55 99876-5432"', '+55 55 99876-5432', '5555998765432'],
  ['DDD 55 com 0 "055 99876-5432"', '055 99876-5432', '5555998765432'],
  // Os formatos comuns.
  ['celular SP "(11) 98765-4321"', '(11) 98765-4321', '5511987654321'],
  ['"+55 (11) 98765-4321"', '+55 (11) 98765-4321', '5511987654321'],
  ['"5511987654321" (já com país)', '5511987654321', '5511987654321'],
  ['"0 11 98765-4321" (discagem nacional)', '0 11 98765-4321', '5511987654321'],
  ['"0 21 11 98765-4321" (com operadora)', '0 21 11 98765-4321', '5511987654321'],
  ['"0021 11 98765-4321" (operadora com 00)', '0021 11 98765-4321', '5511987654321'],
  ['"00 55 11 98765-4321" (internacional)', '00 55 11 98765-4321', '5511987654321'],
  ['fixo "(11) 3333-4444"', '(11) 3333-4444', '551133334444'],
  ['fixo com país "+55 11 3333-4444"', '+55 11 3333-4444', '551133334444'],
  ['suporte do app "11941727487"', '11941727487', '5511941727487'],
  // O que NÃO é número brasileiro vira null (o chamador abre o seletor de contato).
  ['vazio', '', null],
  ['null', null, null],
  ['undefined', undefined, null],
  ['só letras', 'sem telefone', null],
  ['curto "98765-4321" (sem DDD)', '98765-4321', null],
  ['longo demais', '55119876543210', null],
  ['DDD com zero "(10) 98765-4321"', '(10) 98765-4321', null],
  ['celular de 11 dígitos sem o 9 "(11) 88765-4321"', '(11) 88765-4321', null],
  ['fixo começando em 0 "(11) 0333-4444"', '(11) 0333-4444', null],
  ['americano "+1 415 555 0100"', '+1 415 555 0100', null],
];
for (const [nome, entrada, esperado] of casos) checar(nome, numeroWhatsAppBR(entrada), esperado);

// Idempotente: normalizar de novo o que já saiu normalizado não muda nada (o app
// passa o número já tratado para o montador de link).
for (const [nome, entrada] of casos) {
  const n = numeroWhatsAppBR(entrada);
  if (n) checar(`idempotente: ${nome}`, numeroWhatsAppBR(n), n);
}

console.log('\n2. Links');
checar('wa.me com número', linkWaMe('(55) 99876-5432', 'Olá, tudo bem?'), 'https://wa.me/5555998765432?text=Ol%C3%A1%2C%20tudo%20bem%3F');
checar('wa.me sem número abre o seletor (nunca wa.me/55)', linkWaMe('', 'Oi'), 'https://wa.me/?text=Oi');
checar('wa.me com número inválido abre o seletor', linkWaMe('123', 'Oi'), 'https://wa.me/?text=Oi');
checar(
  'Android: api.whatsapp.com/send com número',
  linkApiWhatsApp('11 98765-4321', 'Oi & tchau'),
  'https://api.whatsapp.com/send?phone=5511987654321&text=Oi%20%26%20tchau',
);
checar('Android sem número cai no seletor', linkApiWhatsApp(undefined, 'Oi'), 'https://wa.me/?text=Oi');

console.log('\n3. Worker usa a MESMA função');
checar('numeroWhatsAppBR do worker é a do app', doWorker.numeroWhatsAppBR, numeroWhatsAppBR);
checar('linkWaMe do worker é a do app', doWorker.linkWaMe, linkWaMe);

console.log('\n4. Ninguém mantém regra própria');
const ler = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const app = ler('src/utils/exportarDocumento.ts');
checar('app: abrirWhatsApp usa numeroWhatsAppBR', /numeroWhatsAppBR\(telefone\)/.test(app), true);
checar('app: sem canOpenURL no Android (api.whatsapp.com direto)', /Platform\.OS === 'android'[\s\S]{0,120}linkApiWhatsApp/.test(app), true);
const shim = ler('webapp/src/shims/exportarDocumento.web.ts');
checar('shim web: usa linkWaMe da regra única', /from "\.\.\/\.\.\/\.\.\/src\/utils\/telefoneWhatsapp"/.test(shim) && /linkWaMe\(telefone, mensagem\)/.test(shim), true);
const fin = ler('webapp/src/pages/olli/inicio/financeiro.ts');
checar('painel: numeroWhatsapp é a regra única', /export const numeroWhatsapp\b[^;]{0,80}= numeroWhatsAppBR;/.test(fin), true);
const pmoc = ler('worker/src/pmoc.js');
const link = ler('worker/src/link.js');
checar('PMOC usa a regra única', /from '\.\/telefoneWhatsapp\.js'/.test(pmoc) && /numeroWhatsAppBR\(/.test(pmoc), true);
checar('link público usa a regra única', /from '\.\/telefoneWhatsapp\.js'/.test(link) && /numeroWhatsAppBR\(/.test(link), true);
// O padrão do bug, em qualquer lugar: decidir o 55 pelo prefixo.
const prefixo = /startsWith\(['"]55['"]\)\s*\?/;
for (const [nome, fonte] of [['app', app], ['shim', shim], ['painel', fin], ['pmoc', pmoc], ['link', link]] as const) {
  checar(`${nome}: sem "startsWith('55') ?" (regra pelo prefixo)`, prefixo.test(fonte), false);
}

console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
