/**
 * CALCULADORA DO OFÍCIO → ITEM DO ORÇAMENTO COM A QUANTIDADE (CQ-LISTA-24)
 *
 *     node scripts/teste-calculo-vira-item.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Trava: (1) as calculadoras de material (massa, grama, mudas, selador) entregam
 * quantidade + unidade no item; (2) a quantidade bate com o número mostrado ao
 * prestador; (3) nenhum item traz preço (vem da tabela dele); (4) quantidade
 * inválida é descartada; (5) a tela usa a função (não monta o item na mão).
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { CALCULOS, prefillDoItemCalculo } from '../src/services/calculosOficio.ts';

const calc = (id: string) => {
  const c = CALCULOS.find((x) => x.id === id);
  assert.ok(c, `calculadora ${id} existe`);
  return c;
};
const valoresPadrao = (id: string, extra: Record<string, string>) => {
  const v: Record<string, string> = {};
  for (const campo of calc(id).campos) if (campo.default !== undefined) v[campo.key] = String(campo.default);
  return { ...v, ...extra };
};

// 1+2) massa: 40 m² × 2 demãos × 1 kg/m² = 80 kg
{
  const r = calc('massa').calcular(valoresPadrao('massa', { area: '40' }));
  assert.equal(r.itemOrcamento?.quantidade, 80);
  assert.equal(r.itemOrcamento?.unidade, 'kg');
  assert.match(r.itemOrcamento!.descricao, /80 kg/);
}
// grama: 100 m² / 0,5 × 1,08 = 216 placas
{
  const r = calc('grama').calcular(valoresPadrao('grama', { area: '100' }));
  assert.equal(r.itemOrcamento?.quantidade, 216);
  assert.equal(r.itemOrcamento?.unidade, 'placa');
}
// mudas: 20 m / 0,4 + 1 = 51 × 1,05 = 53,55 → 54
{
  const r = calc('mudas_cerca_viva').calcular(valoresPadrao('mudas_cerca_viva', { comprimento: '20' }));
  assert.equal(r.itemOrcamento?.quantidade, 54);
}
// selador: 360 m² / 40 × 1 × 1,1 = 9,9 L → 1 lata de 18 L
{
  const r = calc('rendimento_selador').calcular(valoresPadrao('rendimento_selador', { area: '360' }));
  assert.equal(r.itemOrcamento?.quantidade, 1);
  assert.equal(r.itemOrcamento?.unidade, 'un');
}

// 3) nenhum item de calculadora carrega preço
for (const c of CALCULOS) {
  const r = c.calcular(valoresPadrao(c.id, {}));
  const item = r.itemOrcamento as Record<string, unknown> | undefined;
  if (item) for (const k of ['preco', 'precoUnitario', 'precoSugerido', 'valor']) assert.ok(!(k in item), `${c.id} não põe ${k}`);
}

// 4) quantidade inválida some; válida passa; sem quantidade = comportamento antigo
const base = { nome: 'X', descricao: 'd' };
assert.deepEqual(prefillDoItemCalculo(base), { tipo: 'produto', nome: 'X', descricao: 'd' });
for (const q of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.ok(!('quantidade' in prefillDoItemCalculo({ ...base, quantidade: q, unidade: 'kg' })), `q=${q} descartada`);
}
assert.deepEqual(prefillDoItemCalculo({ ...base, quantidade: 5, unidade: 'kg' }), { tipo: 'produto', nome: 'X', descricao: 'd', quantidade: 5, unidade: 'kg' });

// 5) a tela usa a função
assert.match(readFileSync(new URL('../src/screens/FerramentasOficioScreen.tsx', import.meta.url), 'utf8'), /prefillDoItemCalculo\(item\)/);

console.log('ok — calculadora → item com quantidade');
