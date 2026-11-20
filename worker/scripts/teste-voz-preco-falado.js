/**
 * Trava das regras de preço da voz (QA 19/11, S20, app 1.2.2: "350 de mão de obra e 200 da peça" virou R$ 1.076).
 *
 *     node scripts/teste-voz-preco-falado.js   (de dentro de worker/)
 *
 * Causa (reproduzida no Llama de produção): com catálogo, o preço do catálogo vencia o preço falado; e "limpeza do
 * split por 250" voltava sem item (o modelo lia como fora do trabalho). A correção é de texto do prompt, então o
 * teste confere que as regras estão lá nos 3 caminhos (resposta única, /transcrever e conversa). A prova com o modelo
 * de verdade fica no PR (rodadas repetidas, antes e depois).
 */
import assert from 'node:assert/strict';
import { vozConversaSystem, vozPrompt, vozSystem } from '../src/voz.js';

const ORDEM = /Preço de cada item, nesta ordem: \(1\) se o técnico falou o valor DESSE item, use esse valor exato.*\(2\) se não falou, use o preço do catálogo.*\(3\) se não tiver nenhum dos dois, null/s;
let ok = 0;
const caso = (nome, fn) => { fn(); ok++; console.log('ok', nome); };

caso('resposta única: preço falado antes do catálogo', () => assert.match(vozPrompt('x', [{ nome: 'Limpeza', preco: 180 }]), ORDEM));
caso('/transcrever (mesmo vozPrompt com linha própria): mesma regra', () => assert.match(vozPrompt('', [], { linhaFala: 'Áudio anexo', exigirTexto: true }), ORDEM));
caso('conversa: mesma regra', () => {
  assert.match(vozConversaSystem('refrigeracao', false), ORDEM);
  assert.match(vozConversaSystem('refrigeracao', true), ORDEM);
});
caso('itens vazios só para pedido recusado ou outro assunto; serviço + valor curto é trabalho', () => {
  const s = vozSystem('refrigeracao');
  assert.match(s, /Só se a fala pedir algo recusado por essa regra ou for claramente de outro assunto/);
  assert.match(s, /"limpeza do split por 250"\) É trabalho do prestador: monte o item/);
  assert.match(s, /ESCOPO E SEGURANÇA/, 'a guarda de escopo continua no prompt');
});
caso('nunca inventar valor continua escrito', () => assert.match(vozConversaSystem('refrigeracao', false), /NUNCA invente um valor/));

console.log(`\n${ok} casos ok`);
