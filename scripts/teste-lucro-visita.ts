/**
 * Teste do Lucro Real da Visita e da baixa leve de material (Onda I4).
 *
 *     node scripts/teste-lucro-visita.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Roda o comportamento REAL de `src/services/lucroVisita.ts` e
 * `src/utils/materiaisOS.ts` (puros): preço − material − deslocamento estimado −
 * comissão; e a regra da casa — faltou dado = "incompleto" com a lista do que
 * falta, NUNCA lucro inventado. Prova também os encaixes nas telas (gate Pro,
 * permissão de valores, migration e sync da coluna nova).
 */
import { readFileSync } from 'node:fs';
import {
  calcularLucroVisita,
  kmIdaEVolta,
  mesDeBrasilia,
  reais,
  resumirMes,
  textoIncompleto,
  textoLucro,
  type VisitaDoMes,
} from '../src/services/lucroVisita.ts';
import { lerMateriais, materiaisParaTexto, textoMaterial } from '../src/utils/materiaisOS.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const BASE = { lat: -23.55, lon: -46.63 };
/** ~10 km ao norte em linha reta. */
const CLIENTE = { lat: -23.55 + 0.0899, lon: -46.63 };
const NEGOCIO = { custoKm: 1, comissaoPercentual: 10, base: BASE };

console.log('\n1) conta completa');
{
  const km = kmIdaEVolta(BASE, CLIENTE);
  checar('km = linha reta × 1,4 × 2 (ida e volta)', km, 28);
  const r = calcularLucroVisita({
    valor: 450,
    materiais: [
      { id: 'a', nome: 'Gás R-410A', quantidade: 0.5, unidade: 'kg', custoUnitario: 100 },
      { id: 'b', nome: 'Suporte', quantidade: 1, unidade: 'un', custoUnitario: 70 },
    ],
    cliente: CLIENTE,
    negocio: NEGOCIO,
  });
  checar('estado completo', r.estado, 'completo');
  if (r.estado === 'completo') {
    checar('material pela baixa', [r.material, r.fonteMaterial], [120, 'baixa']);
    checar('deslocamento = 28 km × R$ 1', [r.deslocamento, r.km], [28, 28]);
    checar('comissão 10%', r.comissao, 45);
    checar('sobrou = 450 − 120 − 28 − 45', r.sobrou, 257);
    checar('margem', Math.round((r.margem ?? 0) * 100), 57);
    checar('texto derivado da conta', textoLucro(r),
      'Você cobrou R$ 450,00. Material R$ 120,00, deslocamento R$ 28,00 (28 km, estimativa), comissão R$ 45,00. Sobrou R$ 257,00 (57%).');
  }
}

console.log('\n2) material pelo orçamento quando não há baixa');
{
  const custos: Record<string, number> = { p1: 30 };
  const r = calcularLucroVisita({
    valor: 300,
    itensOrcamento: [
      { tipo: 'servico', catalogoId: 's1', nome: 'Instalação', quantidade: 1 },
      { tipo: 'produto', catalogoId: 'p1', nome: 'Suporte', quantidade: 2 },
    ],
    custoProduto: (id) => custos[id],
    cliente: CLIENTE,
    negocio: { ...NEGOCIO, custoKm: 0, comissaoPercentual: undefined },
  });
  checar('serviço não vira material; produto × custo do catálogo', r.estado === 'completo' ? [r.material, r.fonteMaterial] : r, [60, 'orcamento']);
  checar('custo por km 0 = deslocamento não contado (sem pedir coordenada)', r.estado === 'completo' ? [r.deslocamento, r.km] : r, [0, null]);
  checar('sem comissão configurada = 0', r.estado === 'completo' ? r.comissao : r, 0);
  if (r.estado === 'completo') checar('texto diz que não contou o deslocamento', textoLucro(r).includes('deslocamento não contado'), true);
}

console.log('\n3) faltou dado → incompleto, nunca lucro inventado');
{
  const r = calcularLucroVisita({
    valor: 300,
    itensOrcamento: [
      { tipo: 'produto', catalogoId: 'p1', nome: 'Suporte', quantidade: 1 },
      { tipo: 'produto', catalogoId: 'p2', nome: 'Cobre', quantidade: 3 },
    ],
    custoProduto: () => undefined,
    cliente: null,
    negocio: { base: null },
  });
  checar('estado incompleto', r.estado, 'incompleto');
  if (r.estado === 'incompleto') {
    checar('lista do que falta', r.faltas.map((f) => f.tipo), ['custo_material', 'custo_km']);
    checar('texto curto', textoIncompleto(r.faltas), 'Falta o custo de 2 itens e mais 1 dado para calcular o lucro.');
  }
  const semNada = calcularLucroVisita({ valor: 200, negocio: NEGOCIO, cliente: CLIENTE });
  checar('sem baixa e sem orçamento = material não informado (não R$ 0)',
    semNada.estado === 'incompleto' ? semNada.faltas.map((f) => f.tipo) : semNada, ['material_nao_informado']);
  const semLocal = calcularLucroVisita({ valor: 200, materiais: [], negocio: { custoKm: 1 }, cliente: { lat: null, lon: null } });
  checar('custo por km > 0 sem base nem cliente = falta os dois',
    semLocal.estado === 'incompleto' ? semLocal.faltas.map((f) => f.tipo) : semLocal, ['base', 'local_cliente']);
  // Ponto só pela CIDADE = centro do município: base e cliente na mesma cidade
  // dariam "0 km" (deslocamento inventado). Conta como falta.
  const soCidade = calcularLucroVisita({
    valor: 200,
    materiais: [],
    negocio: { custoKm: 1, base: { lat: -23.55, lon: -46.63, geoPrecisao: 'cidade' } },
    cliente: { lat: -23.55, lon: -46.63, geoPrecisao: 'cidade' },
  });
  checar('ponto só pela cidade não vira 0 km: falta base e local do cliente',
    soCidade.estado === 'incompleto' ? soCidade.faltas.map((f) => f.tipo) : soCidade, ['base', 'local_cliente']);
  const pelocep = calcularLucroVisita({
    valor: 200,
    materiais: [],
    negocio: { custoKm: 1, base: { lat: -23.55, lon: -46.63, geoPrecisao: 'cep' } },
    cliente: { lat: -23.56, lon: -46.64, geoPrecisao: 'rua' },
  });
  checar('ponto pelo CEP/rua calcula', pelocep.estado, 'completo');
  const semValor = calcularLucroVisita({ valor: undefined, materiais: [], negocio: { custoKm: 0 } });
  checar('sem preço = falta o valor', semValor.estado === 'incompleto' ? semValor.faltas.map((f) => f.tipo) : semValor, ['valor']);
  const baixaSemCusto = calcularLucroVisita({
    valor: 100,
    materiais: [{ id: 'x', nome: 'Fita', quantidade: 1, unidade: 'un' }],
    negocio: { custoKm: 0 },
  });
  checar('baixa sem custo = falta o custo daquele item',
    baixaSemCusto.estado === 'incompleto' ? baixaSemCusto.faltas : baixaSemCusto, [{ tipo: 'custo_material', itens: ['Fita'] }]);
  const naoUsei = calcularLucroVisita({ valor: 100, materiais: [], negocio: { custoKm: 0 } });
  checar('"não usei material" ([]) = material R$ 0 de verdade', naoUsei.estado === 'completo' ? naoUsei.sobrou : naoUsei, 100);
}

console.log('\n4) prejuízo e o mês');
{
  const r = calcularLucroVisita({
    valor: 100,
    materiais: [{ id: 'a', nome: 'Compressor', quantidade: 1, unidade: 'un', custoUnitario: 180 }],
    negocio: { custoKm: 0 },
  });
  checar('prejuízo aparece negativo', r.estado === 'completo' ? r.sobrou : r, -80);
  checar('reais() com sinal e milhar', [reais(-80), reais(1234.5)], ['−R$ 80,00', 'R$ 1.234,50']);
  const v = (id: string, resultado: VisitaDoMes['resultado']): VisitaDoMes =>
    ({ id, titulo: id, clienteNome: id, quando: '2026-10-05T12:00:00Z', resultado, origem: 'os' });
  const ok = (valor: number, custo: number) =>
    calcularLucroVisita({ valor, materiais: [{ id: 'm', nome: 'm', quantidade: 1, unidade: 'un', custoUnitario: custo }], negocio: { custoKm: 0 } });
  const mes = resumirMes([
    v('a', ok(500, 100)),
    v('b', ok(300, 50)),
    v('c', ok(100, 180)),
    v('d', calcularLucroVisita({ valor: 900, negocio: { custoKm: 0 } })),
  ]);
  checar('soma só as completas', [mes.sobrou, mes.cobrado, mes.completas], [570, 900, 3]);
  checar('incompletas contadas à parte', mes.incompletas.map((x) => x.id), ['d']);
  checar('melhores e prejuízo', [mes.melhores.map((x) => x.id), mes.prejuizo.map((x) => x.id)], [['a', 'b'], ['c']]);
  checar('mês de Brasília (00:30 UTC do dia 1 ainda é o mês anterior)', [mesDeBrasilia('2026-11-01T02:30:00Z'), mesDeBrasilia('2026-11-01T03:30:00Z')], ['2026-10', '2026-11']);
}

console.log('\n5) baixa leve de material: 3 estados');
{
  checar('null/ilegível = não informado', [lerMateriais(null), lerMateriais('lixo'), lerMateriais(undefined)], [undefined, undefined, undefined]);
  checar('"[]" = não usei material', lerMateriais('[]'), []);
  checar('item sem nome ou sem quantidade é descartado; custo negativo some',
    lerMateriais([{ id: '1', nome: 'Cobre', quantidade: 2, unidade: 'm', custoUnitario: -3 }, { nome: '', quantidade: 1 }, { nome: 'X', quantidade: 0 }]),
    [{ id: '1', nome: 'Cobre', quantidade: 2, unidade: 'm' }]);
  checar('para o SQLite: undefined vira NULL, [] vira "[]"', [materiaisParaTexto(undefined), materiaisParaTexto([])], [null, '[]']);
  checar('texto do item', textoMaterial({ nome: 'Gás R-410A', quantidade: 0.6, unidade: 'kg' }), '0,6 kg de Gás R-410A');
}

console.log('\n6) encaixes (telas, sync, migration)');
{
  const ler = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const faixa = ler('../src/components/dinheiro/LucroVisitaFaixa.tsx');
  checar('faixa do lucro passa pelo gate Pro (relatorios)', faixa.includes("useRecursoPlano('relatorios')") && faixa.includes('RecursoTrancado'), true);
  const os = ler('../src/screens/OrdemServicoScreen.tsx');
  checar('OS: lucro só concluída e para quem vê valores', os.includes('concluida && podeVerValores') && os.includes("'ver_valores_agregados'"), true);
  checar('OS: bloco de material ligado', os.includes('<MaterialUsadoBloco'), true);
  const card = ler('../src/components/dinheiro/QuantoSobrouCard.tsx');
  checar('"Quanto sobrou" usa o gate de relatórios', card.includes("useRecursoPlano('relatorios')") && card.includes('CartaoRecursoPlano'), true);
  const home = ler('../src/screens/HomeScreen.tsx');
  checar('Painel mostra "Quanto sobrou" só com permissão de valores', /pode\('ver_valores_agregados'\)[^\n]*\n[^\n]*\n\s*<QuantoSobrouCard/.test(home), true);
  checar('Meu negócio tem os custos da visita', ler('../src/screens/MeuNegocioScreen.tsx').includes('<CustosVisitaCard'), true);
  const sync = ler('../src/services/cloudSync.ts');
  checar('sync: coluna materiais com recuo se a nuvem não tiver', sync.includes('osSemColunaMateriais') && sync.includes('materiaisParaTexto(o.materiais) ?? materiaisLocal'), true);
  const db = ler('../src/database/database.ts');
  // v11 = garantia da OS (I3), v12 = encerramento, v13 = materiais (I4).
  checar('SQLite: coluna materiais (schema v13)', /if \(v < 13\) \{\s*await addColumnIfMissing\(database, 'ordens_servico', 'materiais', 'TEXT'\);/.test(db) && Number(/const SCHEMA_VERSION = (\d+);/.exec(db)?.[1]) >= 13, true);
  const mig = ler('../supabase/migrations/20261003104000_os_materiais_baixa_leve.sql');
  checar('migration: jsonb nulo = não informado, check de array', mig.includes('add column if not exists materiais jsonb') && mig.includes("jsonb_typeof(materiais) = 'array'"), true);
  checar('nenhuma API paga de rota no lucro', /routes\.googleapis|maps\.googleapis|\/eta\/saida/.test(ler('../src/services/lucroVisita.ts') + ler('../src/services/lucroMes.ts')), false);
}

console.log(`\nteste-lucro-visita: ${passes} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
