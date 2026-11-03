/**
 * Edição da OS e o que faltava na criação manual (D1438-G05).
 *
 *     node scripts/teste-os-edicao.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - cliente e título obrigatórios, com corte de espaço e teto de tamanho;
 *  - descrição e observações vazias APAGAM; texto longo demais não passa;
 *  - 31/02 e 29/02/2026 não viram data; 29/02/2024 passa;
 *  - dia sem hora = sentinela 12:00:01Z (a tela não inventa horário);
 *  - dia + hora vira o instante local, conferido pelos componentes do calendário;
 *  - hora sem dia, 25h e 14:60 não passam; H:mm passa;
 *  - valor 0 apaga; negativo e NaN não passam; 10,5 fica 10,5;
 *  - o patch não traz status (checklist, foto, técnico e garantia ficam de fora);
 *  - a tela do celular e o painel desktop chamam editarDadosOS no botão "Editar ordem".
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { ehDiaSemHora } from '../src/utils/ordemServicoDoOrcamento.ts';
import {
  ERRO_HORA_INVALIDA,
  LIMITE_DESCRICAO,
  LIMITE_OBSERVACOES,
  LIMITE_TITULO,
  partesDaDataAgendada,
  validarDadosOS,
  type EntradaDadosOS,
  type PatchDadosOS,
} from '../src/utils/ordemServicoEdicao.ts';

let verificacoes = 0;
function ok(nome: string, fn: () => void) {
  fn();
  verificacoes += 1;
  console.log(`  ok   ${nome}`);
}

function dados(extra: EntradaDadosOS = {}): EntradaDadosOS {
  return { clienteNome: 'Ana', titulo: 'Troca do filtro', ...extra };
}

function patchDe(extra: EntradaDadosOS = {}): PatchDadosOS {
  const r = validarDadosOS(dados(extra));
  assert.equal(r.ok, true, 'esperava dados válidos');
  if (!r.ok) throw new Error('inesperado');
  return r.patch;
}

console.log('\nOS — validar dados');

ok('cliente e título vazios falham juntos', () => {
  const r = validarDadosOS({ clienteNome: '   ', titulo: '' });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.erros.cliente ?? '', /cliente/);
    assert.match(r.erros.titulo ?? '', /título/);
  }
});

ok('espaço nas pontas sai; o patch sempre traz as sete chaves e nunca o status', () => {
  const patch = patchDe({ clienteNome: '  Ana  ', titulo: '  Troca  ', clienteId: '   ' });
  assert.equal(patch.clienteNome, 'Ana');
  assert.equal(patch.titulo, 'Troca');
  assert.equal(patch.clienteId, undefined);
  assert.equal(patch.descricao, undefined);
  assert.equal(patch.observacoes, undefined);
  assert.equal(patch.dataAgendada, undefined);
  assert.equal(patch.valor, undefined);
  assert.deepEqual(
    Object.keys(patch).sort(),
    ['clienteId', 'clienteNome', 'dataAgendada', 'descricao', 'observacoes', 'titulo', 'valor'],
  );
  assert.equal('status' in patch, false);
});

ok('título no limite passa e um caractere a mais não', () => {
  assert.equal(validarDadosOS(dados({ titulo: 'a'.repeat(LIMITE_TITULO) })).ok, true);
  const ruim = validarDadosOS(dados({ titulo: 'a'.repeat(LIMITE_TITULO + 1) }));
  assert.equal(ruim.ok, false);
  if (!ruim.ok) assert.ok(ruim.erros.titulo);
});

ok('descrição vazia apaga; acima do limite não passa', () => {
  assert.equal(patchDe({ descricao: '   ' }).descricao, undefined);
  assert.equal(patchDe({ descricao: 'x'.repeat(LIMITE_DESCRICAO) }).descricao?.length, LIMITE_DESCRICAO);
  const ruim = validarDadosOS(dados({ descricao: 'x'.repeat(LIMITE_DESCRICAO + 1) }));
  assert.equal(ruim.ok, false);
  if (!ruim.ok) assert.ok(ruim.erros.descricao);
});

ok('observações acima do limite não passam', () => {
  assert.equal(patchDe({ observacoes: 'y'.repeat(LIMITE_OBSERVACOES) }).observacoes?.length, LIMITE_OBSERVACOES);
  const ruim = validarDadosOS(dados({ observacoes: 'y'.repeat(LIMITE_OBSERVACOES + 1) }));
  assert.equal(ruim.ok, false);
  if (!ruim.ok) assert.ok(ruim.erros.observacoes);
});

ok('31/02 e 29/02/2026 não viram data; 29/02/2024 passa na sentinela', () => {
  for (const data of ['31/02/2026', '29/02/2026', '27/10/26']) {
    const r = validarDadosOS(dados({ data }));
    assert.equal(r.ok, false, data);
    if (!r.ok) assert.equal(r.erros.data, 'Data inválida.');
  }
  const bissexto = patchDe({ data: '29/02/2024' });
  assert.equal(bissexto.dataAgendada, '2024-02-29T12:00:01.000Z');
  assert.equal(ehDiaSemHora(bissexto.dataAgendada), true);
});

ok('dia sem hora (BR ou AAAA-MM-DD) é a sentinela, sem horário inventado', () => {
  const br = patchDe({ data: '27/10/2026' });
  assert.equal(br.dataAgendada, '2026-10-27T12:00:01.000Z');
  assert.equal(ehDiaSemHora(br.dataAgendada), true);
  const iso = patchDe({ data: '2026-10-27', hora: '' });
  assert.equal(iso.dataAgendada, '2026-10-27T12:00:01.000Z');
});

ok('dia + hora vira o instante local; H:mm é aceito', () => {
  const marcado = patchDe({ data: '27/10/2026', hora: '14:30' });
  const d = new Date(marcado.dataAgendada ?? '');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 27);
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 30);
  const cedo = patchDe({ data: '2026-10-27', hora: '8:05' });
  const h = new Date(cedo.dataAgendada ?? '');
  assert.equal(h.getFullYear(), 2026);
  assert.equal(h.getMonth(), 9);
  assert.equal(h.getDate(), 27);
  assert.equal(h.getHours(), 8);
  assert.equal(h.getMinutes(), 5);
});

ok('hora sem dia, 25h e 14:60 não passam', () => {
  const semDia = validarDadosOS(dados({ hora: '14:30' }));
  assert.equal(semDia.ok, false);
  if (!semDia.ok) assert.equal(semDia.erros.data, 'Informe o dia da visita.');
  for (const hora of ['25:00', '14:60', '14:3']) {
    const r = validarDadosOS(dados({ data: '27/10/2026', hora }));
    assert.equal(r.ok, false, hora);
    if (!r.ok) assert.equal(r.erros.data, ERRO_HORA_INVALIDA);
  }
});

ok('valor 0 apaga, negativo e NaN não passam, 10.5 fica', () => {
  assert.equal(patchDe({ valor: 0 }).valor, undefined);
  assert.equal(patchDe({ valor: '' }).valor, undefined);
  assert.equal(patchDe({ valor: 10.5 }).valor, 10.5);
  for (const valor of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = validarDadosOS(dados({ valor }));
    assert.equal(r.ok, false, String(valor));
    if (!r.ok) assert.equal(r.erros.valor, 'Valor inválido.');
  }
});

ok('clienteId em branco apaga; o informado fica', () => {
  assert.equal(patchDe({ clienteId: '  cli-1  ' }).clienteId, 'cli-1');
  assert.equal(patchDe({ clienteId: null }).clienteId, undefined);
});

ok('partes do dia-sentinela não inventam hora e usam o calendário local', () => {
  const sentinela = '2026-10-27T12:00:01.000Z';
  const partes = partesDaDataAgendada(sentinela);
  const inst = new Date(sentinela);
  const p = (n: number) => String(n).padStart(2, '0');
  assert.equal(partes.hora, '');
  assert.equal(partes.data, `${p(inst.getDate())}/${p(inst.getMonth() + 1)}/${inst.getFullYear()}`);
  const local = new Date(2026, 9, 27, 14, 30);
  assert.deepEqual(partesDaDataAgendada(local.toISOString()), { data: '27/10/2026', hora: '14:30' });
  assert.deepEqual(partesDaDataAgendada('nao-e-data'), { data: '', hora: '' });
  assert.deepEqual(partesDaDataAgendada(undefined), { data: '', hora: '' });
});

console.log('\nOS — fiação na tela e no serviço');

function ler(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

function corpoFuncao(src: string, nome: string): string {
  const ini = src.indexOf(`export async function ${nome}`);
  assert.ok(ini >= 0, nome);
  const resto = src.slice(ini);
  const fim = resto.indexOf('\nexport ');
  const trecho = fim < 0 ? resto : resto.slice(0, fim);
  const fecha = trecho.lastIndexOf('\n}');
  return fecha < 0 ? trecho : trecho.slice(0, fecha + 2);
}

ok('editarDadosOS grava pelo patchOrdem e não mexe no status', () => {
  const corpo = corpoFuncao(ler('../src/services/ordemServico.ts'), 'editarDadosOS');
  assert.match(corpo, /return patchOrdem\(/);
  assert.equal(corpo.includes('status'), false);
  for (const chave of ['clienteId', 'clienteNome', 'titulo', 'descricao', 'observacoes', 'dataAgendada', 'valor']) {
    assert.ok(corpo.includes(chave), chave);
  }
});

ok('celular e painel têm o botão Editar ordem ligado ao serviço', () => {
  for (const arq of ['../src/screens/OrdemServicoScreen.tsx', '../src/screens/desktop/PainelOS.tsx']) {
    const src = ler(arq);
    assert.ok(src.includes('editarDadosOS'), arq);
    assert.ok(src.includes('Editar ordem'), arq);
  }
});

ok('criar OS manual usa o formulário com rascunho os-nova', () => {
  for (const arq of ['../src/screens/OrdemServicoScreen.tsx', '../src/screens/desktop/PainelNovaOS.tsx']) {
    const src = ler(arq);
    assert.ok(src.includes('FormularioDadosOS'), arq);
    assert.ok(src.includes('rascunhoEscopo="os-nova"'), arq);
  }
  const form = ler('../src/components/os/FormularioDadosOS.tsx');
  const n = form.match(/useRascunhoCampo\(escopo \? chaveRascunho\(escopo, '/g)?.length ?? 0;
  assert.ok(n >= 7, `rascunhos: ${n}`);
});

console.log(`\nPASSOU: ${verificacoes} verificações\n`);
