/**
 * ORÇAR MAIS RÁPIDO (item 2.11) — regras puras do editor e as duas consultas novas.
 *
 *     node scripts/teste-orcar-rapido.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Trava:
 *  1) o caminho em 3 passos (Cliente → Itens → Revisar) com "Ajustar" voltando
 *     para a revisão, o passo inicial (cliente já ligado abre em Itens) e o
 *     progresso da barra;
 *  2) o motivo do botão apagado (mesma regra do antigo canAdvance, agora escrita);
 *  3) adicionar do catálogo (soma 1 se já está; linha nova senão) e as sugestões
 *     "Você mais usa" (sem o que já está no orçamento, só com uso > 0);
 *  4) "Repetir o último orçamento": ids novos, preços daquele orçamento, desconto e
 *     textos comerciais; NADA da visita antiga (laudo, fotos, datas, assinatura);
 *  5) as consultas SQL num SQLite de verdade (node:sqlite): mais usados ignora
 *     lixeira e tipo errado; último orçamento é por clienteId, com itens, fora o atual;
 *  6) no fonte: total animado (ContadorAnimado), transição em Reanimated (sem o
 *     `Animated` do RN) e rodapé que não some inteiro com o teclado fora do Cliente.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  PASSOS_VISIVEIS,
  adicionarDoCatalogo,
  direcaoDaTroca,
  idsDeCortesia,
  indiceVisivel,
  motivoBloqueio,
  passoAnterior,
  passoInicial,
  progressoDoPasso,
  proximoPasso,
  quantidadeNoOrcamento,
  repetirDoUltimo,
  rotuloDoBotaoPrincipal,
  sugestoesParaAdicionar,
} from '../src/utils/orcarRapido.ts';
import {
  SQL_ULTIMO_ORCAMENTO_DO_CLIENTE,
  sqlCatalogoMaisUsados,
} from '../src/database/consultasSql.ts';
import type { ItemOrcamento, Orcamento, ServicoItem } from '../src/types/index.ts';

let passos = 0;
function caso(nome: string, fn: () => void) {
  fn();
  passos++;
  console.log(`  ok  ${nome}`);
}

function item(p: Partial<ItemOrcamento>): ItemOrcamento {
  return { id: 'i', tipo: 'servico', catalogoId: '', nome: 'Item', preco: 100, quantidade: 1, unidade: 'un', subtotal: 100, ...p };
}

function servico(p: Partial<ServicoItem>): ServicoItem {
  return { id: 's', nome: 'Serviço', preco: 100, unidade: 'un', criadoEm: '2026-01-01T00:00:00.000Z', ...p };
}

function orc(p: Partial<Orcamento>): Orcamento {
  return {
    id: 'o', numero: '1', clienteId: 'cli', clienteNome: 'Ana', clienteTelefone: '', itens: [],
    subtotalServicos: 0, subtotalProdutos: 0, subtotal: 0, desconto: 0, descontoTipo: 'valor',
    valorTotal: 0, status: 'rascunho', dataEmissao: '2026-10-01',
    formasPagamento: {} as Orcamento['formasPagamento'],
    exibirAssinatura: false, solicitarAssinaturaCliente: false, exibirAprovacao: true, exibirRecusa: true,
    criadoEm: '2026-10-01T10:00:00.000Z', atualizadoEm: '2026-10-01T10:00:00.000Z',
    ...p,
  };
}

let seq = 0;
const gerarId = () => `novo-${++seq}`;

console.log('\n1) caminho em 3 passos');
caso('indicador tem 3 passos: Cliente, Itens, Revisar', () => {
  assert.deepEqual([...PASSOS_VISIVEIS], ['Cliente', 'Itens', 'Revisar']);
});
caso('próximo: cliente → itens → revisar → salvar; ajustar → revisar', () => {
  assert.equal(proximoPasso('cliente'), 'itens');
  assert.equal(proximoPasso('itens'), 'revisar');
  assert.equal(proximoPasso('revisar'), null);
  assert.equal(proximoPasso('ajustar'), 'revisar');
});
caso('voltar: ajustar → revisar → itens → cliente → sair', () => {
  assert.equal(passoAnterior('ajustar'), 'revisar');
  assert.equal(passoAnterior('revisar'), 'itens');
  assert.equal(passoAnterior('itens'), 'cliente');
  assert.equal(passoAnterior('cliente'), null);
});
caso('"Ajustar" acende "Revisar" no indicador e enche a barra', () => {
  assert.equal(indiceVisivel('ajustar'), 2);
  assert.equal(progressoDoPasso('ajustar'), 1);
  assert.equal(progressoDoPasso('cliente'), 1 / 3);
  assert.equal(progressoDoPasso('itens'), 2 / 3);
});
caso('direção do deslize: avançar entra pela direita, voltar pela esquerda', () => {
  assert.equal(direcaoDaTroca('cliente', 'itens'), 1);
  assert.equal(direcaoDaTroca('revisar', 'itens'), -1);
  assert.equal(direcaoDaTroca('revisar', 'ajustar'), 1);
  assert.equal(direcaoDaTroca('ajustar', 'revisar'), -1);
});
caso('passo inicial: criando com cliente ligado abre em Itens; edição e resto no Cliente', () => {
  assert.equal(passoInicial({ edicao: false, clienteLigado: true }), 'itens');
  assert.equal(passoInicial({ edicao: false, clienteLigado: false }), 'cliente');
  assert.equal(passoInicial({ edicao: true, clienteLigado: true }), 'cliente');
});
caso('rótulo do botão diz o que acontece', () => {
  assert.equal(rotuloDoBotaoPrincipal('cliente', false), 'Escolher itens');
  assert.equal(rotuloDoBotaoPrincipal('itens', false), 'Revisar');
  assert.equal(rotuloDoBotaoPrincipal('ajustar', false), 'Pronto');
  assert.equal(rotuloDoBotaoPrincipal('revisar', false), 'Salvar orçamento');
  assert.equal(rotuloDoBotaoPrincipal('revisar', true), 'Salvar alterações');
});

console.log('\n2) motivo do botão apagado');
caso('cliente sem nome trava; com nome libera', () => {
  assert.match(motivoBloqueio('cliente', { clienteNome: '  ', itens: [] }, new Set()) ?? '', /cliente/);
  assert.equal(motivoBloqueio('cliente', { clienteNome: 'Ana', itens: [] }, new Set()), null);
});
caso('itens: lista vazia trava', () => {
  assert.equal(motivoBloqueio('itens', { clienteNome: 'Ana', itens: [] }, new Set()), 'Adicione pelo menos 1 item.');
});
caso('item R$ 0,00 sem confirmação trava (com o nome); confirmado libera', () => {
  const itens = [item({ id: 'z', nome: 'Visita', preco: 0, subtotal: 0 })];
  assert.match(motivoBloqueio('itens', { clienteNome: 'Ana', itens }, new Set()) ?? '', /"Visita" está sem valor/);
  assert.equal(motivoBloqueio('itens', { clienteNome: 'Ana', itens }, new Set(['z'])), null);
  assert.match(motivoBloqueio('revisar', { clienteNome: 'Ana', itens }, new Set()) ?? '', /sem valor/);
});
caso('dois itens sem valor viram contagem', () => {
  const itens = [item({ id: 'a', preco: 0 }), item({ id: 'b', preco: 0 })];
  assert.match(motivoBloqueio('itens', { clienteNome: 'Ana', itens }, new Set()) ?? '', /^2 itens/);
});
caso('ajustar nunca trava (os detalhes são opcionais)', () => {
  assert.equal(motivoBloqueio('ajustar', { clienteNome: 'Ana', itens: [] }, new Set()), null);
});

console.log('\n3) catálogo e "Você mais usa"');
caso('item novo entra com 1 e devolve o id novo', () => {
  const r = adicionarDoCatalogo([], servico({ id: 's1', preco: 99.9 }), 'servico', gerarId);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].catalogoId, 's1');
  assert.equal(r.itens[0].quantidade, 1);
  assert.equal(r.itens[0].subtotal, 99.9);
  assert.equal(r.novoId, r.itens[0].id);
});
caso('item que já está soma 1 (sem linha nova, sem novoId)', () => {
  const base = [item({ id: 'x', catalogoId: 's1', preco: 10.1, quantidade: 2, subtotal: 20.2 })];
  const r = adicionarDoCatalogo(base, servico({ id: 's1', preco: 10.1 }), 'servico', gerarId);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].quantidade, 3);
  assert.equal(r.itens[0].subtotal, 30.3);
  assert.equal(r.novoId, undefined);
});
caso('mesmo catalogoId mas OUTRO tipo é outra linha', () => {
  const base = [item({ id: 'x', catalogoId: 's1', tipo: 'produto' })];
  const r = adicionarDoCatalogo(base, servico({ id: 's1' }), 'servico', gerarId);
  assert.equal(r.itens.length, 2);
});
caso('quantidade no orçamento soma as linhas do mesmo item', () => {
  const itens = [item({ catalogoId: 's1', quantidade: 2 }), item({ catalogoId: 's1', quantidade: 1.5 }), item({ catalogoId: 's2' })];
  assert.equal(quantidadeNoOrcamento(itens, 's1', 'servico'), 3.5);
  assert.equal(quantidadeNoOrcamento(itens, 's1', 'produto'), 0);
});
caso('sugestões: tira o que já está no orçamento, ignora uso 0 e corta no limite', () => {
  const lista = [
    { item: { id: 'a' }, uso: 9 }, { item: { id: 'b' }, uso: 5 }, { item: { id: 'c' }, uso: 3 },
    { item: { id: 'd' }, uso: 0 }, { item: { id: 'e' }, uso: 2 },
  ];
  const itens = [item({ catalogoId: 'b' })];
  assert.deepEqual(sugestoesParaAdicionar(lista, itens, 'servico', 2).map(s => s.item.id), ['a', 'c']);
  assert.deepEqual(sugestoesParaAdicionar(lista, itens, 'servico', 10).map(s => s.item.id), ['a', 'c', 'e']);
  // O "b" do orçamento é serviço: na aba produto ele ainda é sugestão.
  assert.deepEqual(sugestoesParaAdicionar(lista, itens, 'produto', 10).map(s => s.item.id), ['a', 'b', 'c', 'e']);
});

console.log('\n4) repetir o último orçamento do cliente');
caso('itens com ids NOVOS e os preços daquele orçamento', () => {
  const origem = orc({
    itens: [item({ id: 'velho-1', catalogoId: 's1', preco: 150, quantidade: 2, subtotal: 300 }), item({ id: 'velho-2', preco: 0, subtotal: 0 })],
  });
  const r = repetirDoUltimo(origem, gerarId);
  assert.equal(r.itens?.length, 2);
  assert.ok(r.itens?.every(i => !i.id.startsWith('velho')), 'ids novos');
  assert.equal(r.itens?.[0].preco, 150);
  assert.equal(r.itens?.[0].subtotal, 300);
  assert.deepEqual(idsDeCortesia(r.itens ?? [], 'enviado'), [r.itens?.[1].id]);
});
caso('item R$ 0,00 de RASCUNHO não vira cortesia sozinho (rascunho não pede a confirmação)', () => {
  const origem = orc({ status: 'rascunho', itens: [item({ id: 'v1', preco: 0, subtotal: 0 })] });
  const r = repetirDoUltimo(origem, gerarId);
  assert.deepEqual(idsDeCortesia(r.itens ?? [], origem.status), []);
  assert.deepEqual(idsDeCortesia(r.itens ?? [], undefined), []);
});
caso('vem desconto e textos comerciais preenchidos', () => {
  const r = repetirDoUltimo(orc({
    desconto: 10, descontoTipo: 'percentual',
    condicoesPagamento: '50% na aprovação', condicoesContratuais: 'Material incluso', garantia: '90 dias',
  }), gerarId);
  assert.equal(r.desconto, 10);
  assert.equal(r.descontoTipo, 'percentual');
  assert.equal(r.condicoesPagamento, '50% na aprovação');
  assert.equal(r.condicoesContratuais, 'Material incluso');
  assert.equal(r.garantia, '90 dias');
});
caso('texto vazio no anterior NÃO apaga o padrão do atual', () => {
  const r = repetirDoUltimo(orc({ condicoesPagamento: '  ', garantia: undefined }), gerarId);
  assert.equal('condicoesPagamento' in r, false);
  assert.equal('garantia' in r, false);
});
caso('nada da visita antiga: laudo, fotos, datas, assinatura, status, número, cliente', () => {
  const origem = orc({
    laudoTecnico: 'compressor queimado', fotosServico: ['file://a.jpg'], informacoesAdicionais: 'portão azul',
    dataVisitaTecnica: '01/09/2026', agendamentoServico: '02/09/2026', validadeOrcamento: '15/09/2026',
    assinaturaClienteUri: 'data:x', assinaturaContratoUri: 'data:y', status: 'aprovado', numero: '00926',
    clienteNome: 'Outro', clienteId: 'outro',
  });
  const r = repetirDoUltimo(origem, gerarId) as Record<string, unknown>;
  for (const campo of [
    'laudoTecnico', 'fotosServico', 'informacoesAdicionais', 'dataVisitaTecnica', 'agendamentoServico',
    'validadeOrcamento', 'assinaturaClienteUri', 'assinaturaContratoUri', 'status', 'numero', 'clienteNome', 'clienteId', 'id',
  ]) {
    assert.equal(campo in r, false, `${campo} não pode vir do anterior`);
  }
});
caso('desconto inválido vira 0', () => {
  assert.equal(repetirDoUltimo(orc({ desconto: Number.NaN }), gerarId).desconto, 0);
  assert.equal(repetirDoUltimo(orc({ desconto: -5 }), gerarId).desconto, 0);
});

console.log('\n5) consultas no SQLite de verdade');
{
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE servicos (id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, preco REAL, unidade TEXT, criado_em TEXT, excluido_em TEXT);
    CREATE TABLE orcamentos (id TEXT PRIMARY KEY, numero TEXT, data TEXT NOT NULL);
  `);
  const s = db.prepare('INSERT INTO servicos (id, nome, preco, excluido_em) VALUES (?, ?, ?, ?)');
  s.run('s1', 'Limpeza', 200, null);
  s.run('s2', 'Ávore de cobre', 50, null); // acento: ordena como "avore"
  s.run('s3', 'Nunca usado', 10, null);
  s.run('s4', 'Na lixeira', 10, '2026-01-01T00:00:00.000Z');
  s.run('s5', 'Bomba', 80, null);
  const it = (catalogoId: string, tipo = 'servico') => item({ id: `${catalogoId}-${Math.random()}`, catalogoId, tipo: tipo as 'servico' });
  const o = db.prepare('INSERT INTO orcamentos (id, numero, data) VALUES (?, ?, ?)');
  o.run('o1', '1', JSON.stringify(orc({ id: 'o1', clienteId: 'ana', criadoEm: '2026-09-01T00:00:00.000Z', itens: [it('s1'), it('s2'), it('s4')] })));
  o.run('o2', '2', JSON.stringify(orc({ id: 'o2', clienteId: 'ana', criadoEm: '2026-09-10T00:00:00.000Z', itens: [it('s1'), it('s5', 'produto')] })));
  o.run('o3', '3', JSON.stringify(orc({ id: 'o3', clienteId: 'ana', criadoEm: '2026-09-20T00:00:00.000Z', itens: [it('s2')], excluidoEm: '2026-09-21T00:00:00.000Z' })));
  o.run('o4', '4', JSON.stringify(orc({ id: 'o4', clienteId: 'ana', criadoEm: '2026-09-25T00:00:00.000Z', itens: [] })));
  o.run('o5', '5', JSON.stringify(orc({ id: 'o5', clienteId: 'bia', criadoEm: '2026-09-30T00:00:00.000Z', itens: [it('s5')] })));

  caso('mais usados: só uso > 0, sem lixeira, sem tipo errado, por uso e nome', () => {
    const ids = (db.prepare(sqlCatalogoMaisUsados('servicos')).all(10) as { id: string; uso: number }[]);
    // s1: 2 (o1, o2); s2: 1 (o3 está na lixeira); s5: 1 (o5; o de o2 é produto); s4 excluído; s3 nunca usado.
    assert.deepEqual(ids.map(r => `${r.id}:${r.uso}`), ['s1:2', 's2:1', 's5:1']);
  });
  caso('mais usados respeita o limite', () => {
    assert.equal((db.prepare(sqlCatalogoMaisUsados('servicos')).all(1) as unknown[]).length, 1);
  });
  caso('último do cliente: o mais novo COM itens, ativo (o4 vazio e o3 na lixeira ficam fora)', () => {
    const r = db.prepare(SQL_ULTIMO_ORCAMENTO_DO_CLIENTE).get('ana', '') as { data: string } | undefined;
    assert.equal(JSON.parse(r?.data ?? '{}').id, 'o2');
  });
  caso('último do cliente ignora o orçamento atual', () => {
    const r = db.prepare(SQL_ULTIMO_ORCAMENTO_DO_CLIENTE).get('ana', 'o2') as { data: string } | undefined;
    assert.equal(JSON.parse(r?.data ?? '{}').id, 'o1');
  });
  caso('é pelo clienteId: outro cliente não aparece; cliente sem orçamento dá nada', () => {
    const bia = db.prepare(SQL_ULTIMO_ORCAMENTO_DO_CLIENTE).get('bia', '') as { data: string } | undefined;
    assert.equal(JSON.parse(bia?.data ?? '{}').id, 'o5');
    assert.equal(db.prepare(SQL_ULTIMO_ORCAMENTO_DO_CLIENTE).get('ninguem', ''), undefined);
  });
  db.close();
}

console.log('\n6) fonte da tela');
{
  const tela = readFileSync('src/screens/NovoOrcamentoScreen.tsx', 'utf8');
  const itens = readFileSync('src/steps/Step2Itens.tsx', 'utf8');
  caso('total animado no rodapé e no passo Itens (ContadorAnimado)', () => {
    assert.match(tela, /<ContadorAnimado valor=\{orc\.valorTotal\}/);
    assert.match(itens, /<ContadorAnimado valor=\{orc\.valorTotal\}/);
  });
  caso('transição de passo em Reanimated, sem o Animated do react-native', () => {
    assert.match(tela, /from 'react-native-reanimated'/);
    const importRn = tela.match(/import \{([^}]*)\} from 'react-native';/)?.[1] ?? '';
    assert.equal(/\bAnimated\b/.test(importRn), false);
    assert.match(tela, /useReduzirMovimento\(\)/);
  });
  caso('teclado: rodapé compacto fora do passo Cliente (não some inteiro)', () => {
    assert.match(tela, /rodapeCompacto = tecladoAberto && passo !== 'cliente'/);
  });
  caso('erro nunca vira vazio: sugestões, busca e "repetir" têm estado de erro', () => {
    assert.match(itens, /estado: 'erro'/);
    assert.match(itens, /setEstadoBusca\('erro'\)/);
    assert.match(tela, /setUltimoDoCliente\(\{ estado: 'erro' \}\)/);
  });
}

console.log(`\n${passos} casos passaram.`);
