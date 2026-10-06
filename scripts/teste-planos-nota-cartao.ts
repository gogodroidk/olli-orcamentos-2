/**
 * O painel avisa, ANTES do clique, que o cartão do checkout é Visa/Mastercard de crédito (06/10/2026).
 *
 *     node scripts/teste-planos-nota-cartao.ts
 *
 * Fonte: Stripe Brasil não aceita Elo, Hipercard, Amex nem débito nacional; Pix existe, sem recorrência
 * (support.stripe.com/questions/accepted-payment-methods-in-brazil, lida em 06/10/2026). Sem a nota, quem
 * tinha esses cartões só descobria na página do Stripe, sem saída.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { notaCartao } from '../webapp/src/pages/olli/planos/notaCartao.ts';

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, `FALHA: ${msg}`);
  checks++;
};

const comPix = notaCartao(true);
const semPix = notaCartao(false);
ok(/Visa ou Mastercard/.test(comPix) && /Visa ou Mastercard/.test(semPix), 'diz quais cartões aceita');
ok(/Elo/.test(comPix) && /Hipercard/.test(comPix) && /débito/.test(comPix), 'nomeia quem NÃO passa (Elo, Hipercard, débito)');
ok(/Pagar com Pix/.test(comPix), 'com Pix ligado, aponta o Pix como saída');
ok(!/Pix/.test(semPix), 'com Pix desligado NÃO promete Pix (nunca prometer o que está desligado)');
ok(!/aceitamos todos|qualquer cartão|todas as bandeiras/i.test(comPix + semPix), 'não promete bandeira que o Stripe não aceita');

const tela = readFileSync(new URL('../webapp/src/pages/olli/planos/index.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
ok(/\{notaCartao\(pixDisponivel\)\}/.test(tela), 'a nota aparece no cartão do plano');
const iPix = tela.indexOf('Pagar com Pix\n\t\t\t\t\t\t\t</Button>');
const iNota = tela.indexOf('{notaCartao(pixDisponivel)}');
ok(iNota > 0 && (iPix < 0 || iNota > iPix), 'a nota vem DEPOIS dos botões de pagar (explica as duas saídas)');
const fonte = readFileSync(new URL('../webapp/src/pages/olli/planos/notaCartao.ts', import.meta.url), 'utf8');
ok(/support\.stripe\.com\/questions\/accepted-payment-methods-in-brazil/.test(fonte) && /06\/10\/2026/.test(fonte), 'o texto carrega a fonte e a data (copy derivada da fonte)');

console.log(`PASSOU: ${checks} verificações — o painel avisa os cartões aceitos antes do clique.`);
