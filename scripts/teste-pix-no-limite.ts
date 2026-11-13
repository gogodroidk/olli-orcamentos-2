/**
 * Limite do Grátis -> oferta do Pro por Pix em 1 toque (app e painel).
 *
 *     node scripts/teste-pix-no-limite.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Tranca: (1) o rótulo vem da tabela única de preços ("Assinar o Pro — R$ 39/mês"), sem
 * desconto nem urgência; (2) o toast do limite no app e no painel carrega a ação que
 * abre o Pix do Pro; (3) a tela de Planos (app e painel) consome o pedido `pix=pro`;
 * (4) loja sem compra externa não recebe oferta de Pix.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARAM_PIX_NO_LIMITE, VALOR_PIX_NO_LIMITE, rotuloAssinarProNoLimite } from '../src/services/limitesComerciais.ts';
import { PRECO_PRO, reais } from '../src/services/precosPlanos.ts';

const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

assert.equal(rotuloAssinarProNoLimite(), `Assinar o Pro — ${reais(PRECO_PRO.mensalCentavos)}/mês`);
assert.equal(rotuloAssinarProNoLimite(), 'Assinar o Pro — R$ 39/mês', 'Pro mensal = R$ 39');
assert.doesNotMatch(rotuloAssinarProNoLimite(), /desconto|grátis|última|só hoje|%|agora ou/i, 'sem urgência nem desconto');
assert.equal(PARAM_PIX_NO_LIMITE, 'pix');
assert.equal(VALOR_PIX_NO_LIMITE, 'pro');

// App: toast do limite com ação -> Planos { pix: 'pro' }, só onde a compra externa é permitida.
const visualizar = ler('../src/screens/VisualizarOrcamentoScreen.tsx');
const blocoApp = visualizar.match(/Limite do mês atingido[\s\S]{0,700}/)?.[0] ?? '';
assert.match(blocoApp, /rotuloAssinarProNoLimite\(\)/, 'app: botão com o rótulo único');
assert.match(blocoApp, /nav\.navigate\('Planos', \{ pix: 'pro' \}\)/, 'app: abre Planos já pedindo o Pix do Pro');
assert.match(visualizar, /COMPRA_NO_APP && !BUILD_PLAY_SEM_COMPRA_EXTERNA/, 'app: sem oferta de Pix na Play sem compra externa');

// App: a tela de Planos gera o Pix do Pro mensal sozinha, só com tudo confirmado.
const planosApp = ler('../src/screens/PlanosScreen.tsx');
assert.match(planosApp, /pedePixDoLimite/, 'Planos (app) lê o pedido do limite');
assert.match(planosApp, /!pixLigado \|\| !acoesPlanoDisponiveis \|\| carregandoPlano \|\| !pixPendenteLido/, 'Planos (app) espera Pix ligado, plano e Pix pendente lidos');
assert.match(planosApp, /void pagarComPix\(pro\)/, 'Planos (app) reaproveita o fluxo de Pix existente');
assert.match(ler('../src/navigation/AppNavigator.tsx'), /pix: 'pro'/, 'rota Planos aceita { pix: "pro" }');

// Painel: ação do toast (WhatsApp e PDF) e tela de Planos abrindo o Pix do Pro.
const cota = ler('../webapp/src/olli/cota-envios.ts');
assert.match(cota, /ROTA_PIX_PRO_NO_LIMITE = `\/planos\?\$\{PARAM_PIX_NO_LIMITE\}=\$\{VALOR_PIX_NO_LIMITE\}`/, 'painel: rota /planos?pix=pro');
assert.match(ler('../webapp/src/pages/olli/orcamentos/useEnviarWhatsApp.tsx'), /acaoAssinarProNoLimite/, 'painel: WhatsApp com ação');
assert.match(ler('../webapp/src/pages/olli/orcamentos/index.tsx'), /acaoAssinarProNoLimite/, 'painel: PDF com ação');
const planosWeb = ler('../webapp/src/pages/olli/planos/index.tsx');
assert.match(planosWeb, /get\(PARAM_PIX_NO_LIMITE\) === VALOR_PIX_NO_LIMITE/, 'Planos (painel) lê ?pix=pro');
assert.match(planosWeb, /setPixAberto\(\{ plano: "pro", periodo: "mensal" \}\)/, 'Planos (painel) abre o Pix do Pro mensal');
assert.match(planosWeb, /!pedidoPixLimite \|\| !pixLigado/, 'Planos (painel) só abre com o Pix confirmado ligado');

console.log('teste-pix-no-limite: ok');
