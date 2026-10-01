/**
 * Autopilot que CADASTRA (item 2.13).
 *
 *     node scripts/teste-autopilot-cadastra.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - checklist nasce marcado, exceto possível duplicado (telefone, nome
 *    normalizado ou repetido na prévia), que nasce desmarcado e avisado;
 *  - cadastro existente ilegível (`null`) = "não conferido", nunca "sem duplicado";
 *  - só os marcados são gravados, pelos saves injetados (os mesmos das telas);
 *  - erro por item: a falha de um não derruba os outros e nunca conta como sucesso;
 *  - papel sem permissão vira erro explícito, não gravação;
 *  - abrirOrcamento leva clienteId/clienteNome, tipo do item e precoSugerido;
 *  - a tela usa os saves do banco (sync) e navega com os parâmetros montados.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import type { AutopilotCandidato } from '../src/services/iaAutopilot.ts';
import type { Cliente, ProdutoItem, ServicoItem } from '../src/types/index.ts';
import {
  cadastrarSelecionados,
  montarCandidatosCadastro,
  montarParamsOrcamento,
  normalizarNome,
  resolverClienteOrcamento,
  resumoCadastro,
  selecaoInicial,
  type CadastroExistente,
  type DependenciasCadastro,
} from '../src/utils/autopilotCadastro.ts';

let falhas = 0;
let passes = 0;
async function ok(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); passes++; console.log(`  ok   ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHA ${nome}\n        ${e instanceof Error ? e.message : String(e)}`); }
}

function cand(tipo: AutopilotCandidato['tipo'], nome: string, extra: Partial<AutopilotCandidato> = {}): AutopilotCandidato {
  return { tipo, nome, descricao: '', unidade: 'un', quantidade: 1, precoSugerido: 0, confianca: 0.9, evidencia: '', ...extra };
}

const CRIADO = '2026-10-01T10:00:00.000Z';
const existentes: CadastroExistente = {
  clientes: [
    { id: 'cli-maria', nome: 'Maria Souza', telefone: '(11) 99999-0000', criadoEm: CRIADO },
    { id: 'cli-joao', nome: 'João Pereira', telefone: '', criadoEm: CRIADO },
    { id: 'cli-lixo', nome: 'Carlos Lixeira', telefone: '21988887777', criadoEm: CRIADO, excluidoEm: CRIADO },
  ] as Cliente[],
  produtos: [{ id: 'prod-gas', nome: 'Gás R410A', preco: 90, unidade: 'kg', criadoEm: CRIADO }] as ProdutoItem[],
  servicos: [{ id: 'serv-limp', nome: 'Limpeza de Split', preco: 250, unidade: 'un', criadoEm: CRIADO }] as ServicoItem[],
};

const previa = {
  clientes: [
    cand('cliente', 'Maria S.', { telefone: '11 99999-0000' }),     // dup telefone
    cand('cliente', 'joao pereira', { telefone: '' }),               // dup nome (acento/caixa)
    cand('cliente', 'Ana Lima', { telefone: '11 98888-1111' }),      // novo
    cand('cliente', 'Ana  Lima', { telefone: '' }),                  // repetida na prévia
    cand('cliente', 'Carlos Lixeira', { telefone: '21988887777' }),  // só existe na lixeira → novo
  ],
  produtos: [cand('produto', 'Gas r410a', { precoSugerido: 95, unidade: 'kg' }), cand('produto', 'Tubo de cobre 1/4', { precoSugerido: 42.5, unidade: 'm' })],
  servicos: [cand('servico', 'LIMPEZA DE SPLIT'), cand('servico', 'Instalação de split 12k', { precoSugerido: 600 })],
};

console.log('\nAutopilot cadastra — checklist, duplicado, gravação e Orçar');

const candidatos = montarCandidatosCadastro(previa, existentes);
const porNome = (nome: string, tipo?: string) => {
  const c = candidatos.find((x) => x.nome === nome && (!tipo || x.tipo === tipo));
  assert.ok(c, `candidato ${nome} não encontrado`);
  return c;
};

await ok('normalizarNome ignora acento, caixa e espaços', () => {
  assert.equal(normalizarNome('  João   PEREIRA '), 'joao pereira');
  assert.equal(normalizarNome('Gás R-410A'), 'gas r 410a');
});

await ok('um candidato por item da prévia, na ordem clientes → produtos → serviços', () => {
  assert.equal(candidatos.length, 9);
  assert.deepEqual(candidatos.map((c) => c.tipo), ['cliente', 'cliente', 'cliente', 'cliente', 'cliente', 'produto', 'produto', 'servico', 'servico']);
  assert.equal(new Set(candidatos.map((c) => c.chave)).size, 9);
});

await ok('duplicado por telefone usa encontrarClientesDuplicados', () => {
  const d = porNome('Maria S.').duplicado;
  assert.deepEqual(d, { origem: 'cadastro', id: 'cli-maria', nome: 'Maria Souza', motivo: 'telefone' });
});

await ok('duplicado por nome normalizado (cliente, produto e serviço)', () => {
  assert.deepEqual(porNome('joao pereira').duplicado, { origem: 'cadastro', id: 'cli-joao', nome: 'João Pereira', motivo: 'nome' });
  assert.equal(porNome('Gas r410a').duplicado?.origem, 'cadastro');
  assert.equal(porNome('LIMPEZA DE SPLIT').duplicado?.origem, 'cadastro');
});

await ok('repetido dentro da própria prévia também é avisado', () => {
  assert.deepEqual(porNome('Ana  Lima').duplicado, { origem: 'previa', nome: 'Ana Lima', motivo: 'nome' });
  assert.equal(porNome('Ana Lima').duplicado, null);
});

await ok('cliente na lixeira não conta como duplicado', () => {
  assert.equal(porNome('Carlos Lixeira').duplicado, null);
});

await ok('seleção inicial: tudo marcado, menos os possíveis duplicados', () => {
  const sel = selecaoInicial(candidatos);
  assert.deepEqual(
    candidatos.filter((c) => sel.has(c.chave)).map((c) => c.nome).sort(),
    ['Ana Lima', 'Carlos Lixeira', 'Instalação de split 12k', 'Tubo de cobre 1/4'].sort(),
  );
});

await ok('leitura que falhou = não conferido (3º estado), nunca "sem duplicado"', () => {
  const lista = montarCandidatosCadastro(previa, { clientes: null, produtos: existentes.produtos, servicos: null });
  assert.ok(lista.filter((c) => c.tipo === 'cliente').every((c) => !c.conferido));
  assert.ok(lista.filter((c) => c.tipo === 'produto').every((c) => c.conferido));
  assert.ok(lista.filter((c) => c.tipo === 'servico').every((c) => !c.conferido));
  assert.equal(montarCandidatosCadastro(previa, existentes).every((c) => c.conferido), true);
});

function fakeDeps(opts: { falharNome?: string; permissoes?: DependenciasCadastro['permissoes'] } = {}) {
  const gravados: { tabela: string; registro: Record<string, unknown> }[] = [];
  let seq = 0;
  const gravar = (tabela: string) => async (registro: { nome: string }) => {
    if (registro.nome === opts.falharNome) throw new Error('database is locked');
    gravados.push({ tabela, registro: registro as Record<string, unknown> });
  };
  const deps: DependenciasCadastro = {
    saveCliente: gravar('clientes'), saveProduto: gravar('produtos'), saveServico: gravar('servicos'),
    gerarId: () => `id-${++seq}`, agora: () => CRIADO,
    permissoes: opts.permissoes ?? { clientes: true, catalogo: true },
  };
  return { deps, gravados };
}

await ok('grava só os marcados, pelos saves certos, com os campos da prévia', async () => {
  const { deps, gravados } = fakeDeps();
  const r = await cadastrarSelecionados(candidatos, selecaoInicial(candidatos), deps);
  assert.equal(r.cadastrados, 4);
  assert.equal(r.falhas, 0);
  assert.deepEqual(gravados.map((g) => `${g.tabela}:${g.registro.nome}`), [
    'clientes:Ana Lima', 'clientes:Carlos Lixeira', 'produtos:Tubo de cobre 1/4', 'servicos:Instalação de split 12k',
  ]);
  const tubo = gravados.find((g) => g.registro.nome === 'Tubo de cobre 1/4')!.registro;
  assert.equal(tubo.preco, 42.5);
  assert.equal(tubo.unidade, 'm');
  assert.equal(tubo.criadoEm, CRIADO);
  assert.equal(gravados[0].registro.telefone, '11 98888-1111');
  assert.ok(r.itens.every((i) => i.ok && i.id.startsWith('id-')));
  assert.equal(resumoCadastro(r), '4 itens cadastrados');
});

await ok('erro de um item não vira sucesso e não derruba os outros', async () => {
  const { deps, gravados } = fakeDeps({ falharNome: 'Tubo de cobre 1/4' });
  const r = await cadastrarSelecionados(candidatos, selecaoInicial(candidatos), deps);
  assert.equal(r.cadastrados, 3);
  assert.equal(r.falhas, 1);
  const falha = r.itens.find((i) => !i.ok);
  assert.ok(falha && !falha.ok && falha.erro.includes('database is locked'));
  assert.equal(gravados.length, 3);
  assert.equal(resumoCadastro(r), '3 itens cadastrados · 1 com erro');
});

await ok('telefone incompleto é erro explícito do item (não grava sem telefone)', async () => {
  const lista = montarCandidatosCadastro({ clientes: [cand('cliente', 'Zé', { telefone: '9999-1234' })], produtos: [], servicos: [] }, existentes);
  const { deps, gravados } = fakeDeps();
  const r = await cadastrarSelecionados(lista, selecaoInicial(lista), deps);
  assert.equal(r.falhas, 1);
  assert.equal(gravados.length, 0);
  assert.match((r.itens[0] as { erro: string }).erro, /Telefone incompleto/);
});

await ok('papel sem permissão de catálogo: erro por item, cliente segue gravando', async () => {
  const { deps, gravados } = fakeDeps({ permissoes: { clientes: true, catalogo: false } });
  const r = await cadastrarSelecionados(candidatos, selecaoInicial(candidatos), deps);
  assert.equal(r.cadastrados, 2);
  assert.equal(r.falhas, 2);
  assert.ok(gravados.every((g) => g.tabela === 'clientes'));
  assert.ok(r.itens.filter((i) => !i.ok).every((i) => !i.ok && /papel/.test(i.erro)));
});

await ok('duplicado marcado à mão é gravado (aviso não bloqueia)', async () => {
  const { deps, gravados } = fakeDeps();
  const r = await cadastrarSelecionados(candidatos, new Set([porNome('Maria S.').chave]), deps);
  assert.equal(r.cadastrados, 1);
  assert.equal(gravados[0].registro.nome, 'Maria S.');
});

await ok('nada marcado = nada gravado e resumo honesto', async () => {
  const { deps, gravados } = fakeDeps();
  const r = await cadastrarSelecionados(candidatos, new Set(), deps);
  assert.equal(gravados.length, 0);
  assert.equal(resumoCadastro(r), 'Nenhum item marcado para cadastrar.');
});

await ok('resolverCliente: id do cliente cadastrado agora', () => {
  const ana = porNome('Ana Lima');
  const c = resolverClienteOrcamento({ clienteNome: 'Ana Lima' }, candidatos, new Map([[ana.chave, 'id-novo']]), existentes.clientes);
  assert.deepEqual(c, { id: 'id-novo', nome: 'Ana Lima' });
});

await ok('resolverCliente: duplicado aponta para o cadastro existente', () => {
  const c = resolverClienteOrcamento({ clienteNome: 'JOAO PEREIRA' }, candidatos, new Map(), existentes.clientes);
  assert.deepEqual(c, { id: 'cli-joao', nome: 'João Pereira' });
});

await ok('resolverCliente: telefone igual com nome diferente NÃO liga ao cadastro de outra pessoa', () => {
  // "Maria S." tem o telefone de "Maria Souza": pode ser outra pessoa (marido/esposa).
  const c = resolverClienteOrcamento({ clienteNome: 'Maria S.' }, candidatos, new Map(), existentes.clientes);
  assert.deepEqual(c, { nome: 'Maria S.' });
});

await ok('resolverCliente: sem cadastro segue só o nome; sem nome = null', () => {
  assert.deepEqual(resolverClienteOrcamento({ clienteNome: 'Ana Lima' }, candidatos, new Map(), existentes.clientes), { nome: 'Ana Lima' });
  assert.equal(resolverClienteOrcamento({ clienteNome: '' }, candidatos, new Map(), existentes.clientes), null);
  const unico = montarCandidatosCadastro({ clientes: [cand('cliente', 'Bia')], produtos: [], servicos: [] }, existentes);
  assert.deepEqual(resolverClienteOrcamento({ clienteNome: '' }, unico, new Map(), existentes.clientes), { nome: 'Bia' });
});

await ok('montarParamsOrcamento: precoSugerido, tipo inferido, clienteId e clienteNome', () => {
  const params = montarParamsOrcamento({
    itens: [
      cand('item', 'Instalação de split 12k', { precoSugerido: 600, quantidade: 2, descricao: ' com suporte ' }),
      cand('item', 'Tubo de cobre 1/4', { precoSugerido: 42.5, quantidade: 3, unidade: 'm' }),
      cand('item', 'Gás R410A', { precoSugerido: 0, unidade: 'kg' }),
      cand('item', '   '),
    ],
    nomesProdutos: ['Tubo de cobre 1/4', 'Gás R410A'],
    cliente: { id: 'cli-joao', nome: 'João Pereira' },
  });
  assert.ok(params);
  assert.equal(params.clienteId, 'cli-joao');
  assert.equal(params.clienteNome, 'João Pereira');
  assert.deepEqual(params.prefillItems, [
    { tipo: 'servico', nome: 'Instalação de split 12k', quantidade: 2, unidade: 'un', descricao: 'com suporte', precoSugerido: 600 },
    { tipo: 'produto', nome: 'Tubo de cobre 1/4', quantidade: 3, unidade: 'm', precoSugerido: 42.5 },
    { tipo: 'produto', nome: 'Gás R410A', quantidade: 1, unidade: 'kg' },
  ]);
});

await ok('montarParamsOrcamento: cliente sem id leva só clienteNome; vazio total = null', () => {
  const params = montarParamsOrcamento({ itens: [], nomesProdutos: [], cliente: { nome: 'Ana Lima' } });
  assert.deepEqual(params, { prefillItems: [], clienteNome: 'Ana Lima' });
  assert.equal(montarParamsOrcamento({ itens: [], nomesProdutos: [], cliente: null }), null);
});

const tela = await readFile(new URL('../src/screens/AutopilotScreen.tsx', import.meta.url), 'utf8');
const novo = await readFile(new URL('../src/screens/NovoOrcamentoScreen.tsx', import.meta.url), 'utf8');
const nav = await readFile(new URL('../src/navigation/AppNavigator.tsx', import.meta.url), 'utf8');

await ok('tela grava pelos saves do banco (mesmos das telas de cadastro → sync)', () => {
  assert.match(tela, /import \{[^}]*saveCliente[^}]*saveProduto[^}]*saveServico[^}]*\} from '\.\.\/database\/database'/);
  assert.ok(tela.includes('cadastrarSelecionados(candidatosCadastro, selecionados'));
  assert.ok(tela.includes('Cadastrar selecionados'));
  assert.ok(!tela.includes('saveOrcamento'));
});

await ok('tela mostra aviso de duplicado, resultado e erro por item', () => {
  assert.ok(tela.includes('textoDuplicado(c.duplicado)'));
  assert.ok(tela.includes('resumoCadastro(resultadoCadastro)'));
  assert.ok(tela.includes('errosPorChave.get(c.chave)'));
  assert.ok(tela.includes('accessibilityRole="checkbox"'));
});

await ok('tela trava toque duplo e não marca a prévia nova com resultado da antiga', () => {
  assert.ok(tela.includes('cadastrandoRef.current'));
  assert.ok(tela.includes('if (geracao !== geracaoRef.current) return;'));
  assert.ok(tela.includes('onPress={limpar} disabled={cadastrando}'));
});

await ok('normalização sem caractere combinante literal no fonte', async () => {
  const fonte = await readFile(new URL('../src/utils/autopilotCadastro.ts', import.meta.url), 'utf8');
  assert.ok(!/[̀-ͯ]/.test(fonte), 'diacrítico literal no fonte (some num salvamento com encoding errado)');
  assert.equal(normalizarNome('  JOÃO   Pêreira! '), 'joao pereira');
});

await ok('abrirOrcamento navega com os parâmetros montados', () => {
  assert.ok(tela.includes("nav.navigate('NovoOrcamento', paramsOrcamento)"));
  assert.ok(tela.includes('montarParamsOrcamento('));
  assert.ok(nav.includes('clienteNome?: string; prefillItem?: PrefillItem'));
  assert.ok(novo.includes('prefillClienteNome') && novo.includes('clienteNome: nomeAvulso'));
});

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
