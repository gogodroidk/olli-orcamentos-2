import assert from 'node:assert/strict';
import { calcularPrecoServico, PACKS_OFICIO } from '../src/services/precificacao.ts';

const resultado = calcularPrecoServico({ custoMateriais: 100, horas: 2, valorHora: 80, deslocamento: 20, impostoPct: 10, margemPct: 20 });
assert.ok(resultado);
assert.equal(resultado.custoDireto, 280);
assert.ok(resultado.precoSugerido > resultado.custoDireto);
assert.equal(resultado.memoria.length, 4);
assert.equal(calcularPrecoServico({ custoMateriais: 0, horas: 0, valorHora: 0 }), null);
assert.equal(calcularPrecoServico({ custoMateriais: 100, horas: 1, valorHora: 50, impostoPct: 80, margemPct: 20 }), null);
for (const vertical of ['eletrica', 'hidraulica', 'pintura', 'dedetizacao', 'jardinagem']) {
  assert.ok(PACKS_OFICIO.some((pack) => pack.vertical === vertical), `pack ausente: ${vertical}`);
}

console.log('OK — preço explicável por custo/hora/deslocamento/imposto/margem e packs validados.');
