/**
 * "BOM DIA DA OLLI": SINAIS COMERCIAIS SÓ PARA QUEM CUIDA DO COMERCIAL.
 *
 *     node scripts/teste-bom-dia-papel.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O "Bom dia" tinha dois sinais lidos da base local INTEIRA: "R$ X parados em N
 * orçamentos aprovados" (`orcamentosParaCobrar`) e o cliente na hora da
 * manutenção (`clientesParaReconquistar`). O `Orcamento` não tem responsável,
 * então não dá para recortar "os do técnico" — o recorte é por papel
 * (`utils/bomDiaSinais.ts`). Este teste trava:
 *  1) a régua: técnico e papel desconhecido não ouvem cobrança nem pós-venda;
 *     dono, admin, gestor e conta pessoal ouvem os dois;
 *  2) a manchete: sinal `fora` some, `erro` nunca vira "nada a cobrar" (só cede
 *     a vez), a copy é a mesma que o ritual já mandava;
 *  3) o ritual: os radares só são LIDOS atrás da régua, e falha vira `erro`.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  mancheteComercial,
  sinaisComerciaisPermitidos,
  type ItemCobranca,
  type ItemPosVenda,
  type SinalComercial,
} from '../src/utils/bomDiaSinais.ts';
import { formatCurrency } from '../src/utils/currency.ts';

let passos = 0;
function caso(nome: string, fn: () => void) {
  fn();
  passos++;
  console.log(`  ok  ${nome}`);
}

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

type Conta = Parameters<typeof sinaisComerciaisPermitidos>[0];
const empresa = (papel: 'owner' | 'admin' | 'gestor' | 'tecnico'): Conta => ({
  tipo: 'empresa',
  org: { papel },
  resolvido: true,
});
const PESSOAL: Conta = { tipo: 'pessoal', org: null, resolvido: true };
// "Não sei": o tipo padrão é 'pessoal' (o mais permissivo) — é aqui que um técnico
// seria promovido a dono se o gate olhasse só o tipo.
const DESCONHECIDO: Conta = { tipo: 'pessoal', org: null, resolvido: false };
const TECNICO_SEM_CONFIRMAR: Conta = { tipo: 'empresa', org: { papel: 'tecnico' }, resolvido: false };

const FORA = { status: 'fora' } as const;
const ERRO = { status: 'erro' } as const;
const ok = <T,>(itens: T[]): SinalComercial<T> => ({ status: 'ok', itens });
const COBRANCA = ok<ItemCobranca>([{ valor: 1000 }, { valor: 500.5 }]);
const POS_VENDA = ok<ItemPosVenda>([
  { cliente: { nome: 'Dona Marta' }, mesesSemContato: 7 },
  { cliente: { nome: 'Seu Jorge' }, mesesSemContato: 9 },
]);
const CORPO_COBRANCA = `${formatCurrency(1500.5)} parados em 2 orçamentos aprovados — cobre com 1 toque`;
const CORPO_POS_VENDA = 'Dona Marta: último serviço há 7 meses — hora de lembrar da manutenção';

console.log('"Bom dia da OLLI": sinais comerciais respeitam o papel');

caso('régua: técnico não ouve cobrança nem pós-venda', () => {
  assert.deepEqual(sinaisComerciaisPermitidos(empresa('tecnico')), { cobranca: false, posVenda: false });
});

caso('régua: papel desconhecido não ouve nada (nunca vira dono)', () => {
  assert.deepEqual(sinaisComerciaisPermitidos(DESCONHECIDO), { cobranca: false, posVenda: false });
  assert.deepEqual(sinaisComerciaisPermitidos(TECNICO_SEM_CONFIRMAR), { cobranca: false, posVenda: false });
});

caso('régua: dono, admin, gestor e conta pessoal ouvem os dois', () => {
  for (const conta of [empresa('owner'), empresa('admin'), empresa('gestor'), PESSOAL]) {
    assert.deepEqual(sinaisComerciaisPermitidos(conta), { cobranca: true, posVenda: true }, JSON.stringify(conta));
  }
});

caso('manchete: técnico (os dois fora) = silêncio', () => {
  assert.equal(mancheteComercial(FORA, FORA), null);
});

caso('manchete: dinheiro parado vem antes do pós-venda, com a copy de sempre', () => {
  assert.equal(mancheteComercial(COBRANCA, POS_VENDA), CORPO_COBRANCA);
  assert.equal(
    mancheteComercial(ok<ItemCobranca>([{ valor: 80 }]), FORA),
    `${formatCurrency(80)} parado em 1 orçamento aprovado — cobre com 1 toque`,
  );
});

caso('manchete: sem dinheiro parado, cai para o cliente mais atrasado', () => {
  assert.equal(mancheteComercial(ok<ItemCobranca>([]), POS_VENDA), CORPO_POS_VENDA);
  assert.equal(
    mancheteComercial(FORA, ok<ItemPosVenda>([{ cliente: { nome: 'Ana' }, mesesSemContato: 1 }])),
    'Ana: último serviço há 1 mês — hora de lembrar da manutenção',
  );
});

caso('manchete: erro na cobrança não vira "nada a cobrar" — só cede a vez', () => {
  assert.equal(mancheteComercial(ERRO, POS_VENDA), CORPO_POS_VENDA);
  assert.equal(mancheteComercial(ERRO, FORA), null);
  assert.equal(mancheteComercial(ERRO, ERRO), null);
  assert.equal(mancheteComercial(COBRANCA, ERRO), CORPO_COBRANCA);
});

caso('manchete: listas lidas e vazias = silêncio (nunca "bom dia sem novidades")', () => {
  assert.equal(mancheteComercial(ok<ItemCobranca>([]), ok<ItemPosVenda>([])), null);
});

caso('ritual: os radares só são lidos atrás da régua do papel', () => {
  const src = ler('src/services/ritualDiario.ts');
  const corpo = src.slice(src.indexOf('async function montarBomDia('), src.indexOf('function horarioFecharHojeOuNull('));
  assert.ok(corpo.length > 0, 'montarBomDia sumiu');
  const regua = corpo.indexOf('const sinais = sinaisComerciaisPermitidos(await lerTipoContaAtual());');
  assert.ok(regua >= 0, 'sem régua de papel no "Bom dia"');
  assert.match(corpo, /sinais\.cobranca \? lerSinal\(orcamentosParaCobrar\) : Promise\.resolve\(FORA\)/);
  assert.match(corpo, /sinais\.posVenda \? lerSinal\(clientesParaReconquistar\) : Promise\.resolve\(FORA\)/);
  assert.ok(corpo.indexOf('lerSinal(orcamentosParaCobrar)') > regua, 'radar lido antes da régua');
  // Nenhuma chamada solta aos radares (fora da régua) no arquivo inteiro.
  assert.equal(src.match(/orcamentosParaCobrar\(\)/g), null, 'chamada direta a orcamentosParaCobrar()');
  assert.equal(src.match(/clientesParaReconquistar\(\)/g), null, 'chamada direta a clientesParaReconquistar()');
  assert.match(corpo, /const corpo = mancheteComercial\(cobranca, radar\);/);
});

caso('ritual: falha de leitura de um radar vira erro, nunca lista vazia', () => {
  const src = ler('src/services/ritualDiario.ts');
  const ler_ = src.slice(src.indexOf('async function lerSinal<T>('));
  assert.ok(ler_.length > 0, 'lerSinal sumiu');
  assert.match(ler_, /catch \{\s*return \{ status: 'erro' \};/);
  assert.doesNotMatch(src, /\.catch\(\(\) => \[\]\)/, 'erro virando [] no ritual');
});

console.log(`\n${passos} casos ok`);
