/**
 *     node scripts/teste-pix-validade.ts
 * Exit 0 = passou; 1 = falhou. Aviso de validade do Pix do plano (modal).
 */
import { readFileSync } from 'node:fs';
import { lerPixPendente, paraGuardar } from '../src/utils/pixPendente.ts';
import { textoValidadePix } from '../src/utils/pixValidade.ts';
import { ARTIGO_ARREPENDIMENTO, DIAS_ARREPENDIMENTO, textoArrependimentoCurto } from '../src/content/legal/arrependimento.ts';
import { PRECO_PRO, PRECO_EMPRESA } from '../src/services/precosPlanos.ts';
import { PLANO_PIX } from '../worker/src/mercadopago.js';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}`);
  if (!cond) falhas++;
};
const local = (y: number, m: number, d: number, h: number, mi: number) => new Date(y, m - 1, d, h, mi);

const agora = local(2026, 10, 23, 15, 30);
ok('mesmo dia -> hoje', textoValidadePix(local(2026, 10, 23, 22, 5).toISOString(), agora) === 'Vale até hoje às 22:05');
ok('dia seguinte -> amanhã', textoValidadePix(local(2026, 10, 24, 15, 30).toISOString(), agora) === 'Vale até amanhã às 15:30');
const noite = local(2026, 10, 23, 23, 50);
ok('virada de dia: 23:50 + 24h -> amanhã', textoValidadePix(local(2026, 10, 24, 23, 50).toISOString(), noite) === 'Vale até amanhã às 23:50');
ok('virada de mês -> amanhã', textoValidadePix(local(2026, 11, 1, 9, 0).toISOString(), local(2026, 10, 31, 20, 0)) === 'Vale até amanhã às 09:00');
ok('2+ dias -> data', textoValidadePix(local(2026, 10, 26, 8, 7).toISOString(), agora) === 'Vale até 26/10 às 08:07');
ok('null -> omite', textoValidadePix(null, agora) === null);
ok('undefined -> omite', textoValidadePix(undefined, agora) === null);
ok('lixo -> omite', textoValidadePix('amanhã', agora) === null);
ok('já vencido -> omite', textoValidadePix(local(2026, 10, 23, 15, 0).toISOString(), agora) === null);

const modal = readFileSync(new URL('../src/components/PixPlanoModal.tsx', import.meta.url), 'utf8');
ok('modal usa textoValidadePix(cobranca.expiresAt)', /textoValidadePix\(cobranca\.expiresAt\)/.test(modal));
ok('sem "24 h" fixo no modal', !/24\s*h/i.test(modal));
ok('sem promessa de e-mail 7 dias no modal', !/7 dias/.test(modal));
// P0-08: "Pagar depois" só fecha a tela (a cobrança segue valendo); não gera Pix novo nem cancela nada.
ok('botão "Pagar depois" existe e chama aoFechar', /label="Pagar depois"[^>]*onPress=\{aoFechar\}/.test(modal));

// "Pagar depois" (spec CPO 23/10): Planos reabre o MESMO Pix guardado no aparelho, nunca gera outro.
{
  const U1 = 'user-1';
  const c = { id: 'pix_char_1', brCode: '000201...', brCodeBase64: '', expiresAt: local(2026, 10, 24, 15, 30).toISOString(), plano: { id: 'pro_mensal' as const, nome: 'OLLI Pro · 1 mês', meses: 1, valor: 39 } };
  const g = paraGuardar(c, U1);
  ok('pendente: guarda com a conta e relê igual', !!g && JSON.stringify(lerPixPendente(JSON.parse(JSON.stringify(g)), U1, agora)) === JSON.stringify(c));
  ok('pendente: outra conta no aparelho não vê', lerPixPendente(g, 'user-2', agora) === null);
  ok('pendente: vencido (ou a 1 min de vencer) some', lerPixPendente(g, U1, local(2026, 10, 24, 15, 29)) === null && lerPixPendente(g, U1, local(2026, 10, 24, 15, 31)) === null);
  ok('pendente: sem validade não guarda', paraGuardar({ ...c, expiresAt: null }, U1) === null);
  ok('pendente: lixo e versão errada = null', lerPixPendente('x', U1, agora) === null && lerPixPendente({ ...g, v: 2 }, U1, agora) === null && lerPixPendente({ ...g, cobranca: { ...c, plano: { ...c.plano, id: 'gold' } } }, U1, agora) === null);
  const planos = readFileSync(new URL('../src/screens/PlanosScreen.tsx', import.meta.url), 'utf8');
  ok('Planos: cartão "Ver código" reabre a cobrança guardada (setCobrancaPix(pixPendente)), sem criarPixPlano', /onPress=\{\(\) => setCobrancaPix\(pixPendente\)\}/.test(planos));
  ok('Planos: Pix pago some do aparelho', /esquecerPixPendente\(\)/.test(planos) && /st\?\.pago/.test(planos));
}


// Parecer do Dr. Paulo (24/10): a tela do Pix cita o arrependimento (CDC art. 49) e o preço vem da fonte.
const termos = readFileSync(new URL('../src/content/legal/termos.ts', import.meta.url), 'utf8');
ok('arrependimento: fonte única (7 dias, art. 49) usada nos Termos e na tela do Pix', DIAS_ARREPENDIMENTO === 7 && /art\. 49/.test(ARTIGO_ARREPENDIMENTO) && /DIAS_ARREPENDIMENTO/.test(termos) && !/em até 7 dias corridos/.test(termos) && /textoArrependimentoCurto\(\)/.test(modal));
ok('texto curto cita os 7 dias e o art. 49', /7 dias corridos/.test(textoArrependimentoCurto()) && /art\. 49/.test(textoArrependimentoCurto()));
const cent = (v: number) => Math.round(v * 100);
ok('preço do Pix = preço da fonte (precosPlanos): mensal e anual, Pro e Empresa', cent(PLANO_PIX.pro_mensal.valor) === PRECO_PRO.mensalCentavos && cent(PLANO_PIX.pro_anual.valor) === PRECO_PRO.anualCentavos && cent(PLANO_PIX.empresa_mensal.valor) === PRECO_EMPRESA.mensalCentavos && cent(PLANO_PIX.empresa_anual.valor) === PRECO_EMPRESA.anualCentavos);
ok('o modal mostra o valor da cobrança (servidor), sem número de preço digitado', /formatCurrency\(cobranca\.plano\.valor\)/.test(modal) && !/R\$\s?\d/.test(modal));

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log('tudo ok');
