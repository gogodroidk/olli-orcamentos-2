/**
 * Lista de orçamentos — filtros e ordem (D-1438 G04).
 *
 * A regra mora em src/utils/listaOrcamentos.ts e o SQLite do aparelho cola
 * o mesmo ORDER BY e o mesmo corte de data/valor. Este script roda os dois
 * no Node, sem banco de produção.
 *
 *     node scripts/teste-lista-orcamentos.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  ORDEM_PADRAO,
  alternarCampoOrdem,
  aplicarListaOrcamentos,
  clausulasPeriodoValor,
  lerValorFiltro,
  limitesInstante,
  ordemPelaChave,
  ordemSqlLista,
  passaPeriodo,
  type ItemListaOrcamento,
} from '../src/utils/listaOrcamentos.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

let checks = 0;
const eq = (atual: unknown, esperado: unknown, msg: string) => {
  assert.deepEqual(atual, esperado, msg);
  checks++;
};

const ORDEM_ANTIGA = "json_extract(data, '$.criadoEm') DESC, numero DESC";

eq(ordemSqlLista(), ORDEM_ANTIGA, 'sem ordem explícita continua mais recente primeiro');
eq(ordemSqlLista(undefined), ORDEM_ANTIGA, 'undefined não muda a ordem de sempre');
eq(ordemSqlLista(ORDEM_PADRAO), ORDEM_ANTIGA, 'padrão data desc é o SQL antigo');
eq(ordemSqlLista({ campo: 'data', direcao: 'asc' }), "json_extract(data, '$.criadoEm') ASC, numero DESC", 'mais antigos');
eq(
  ordemSqlLista({ campo: "valor; DROP TABLE orcamentos", direcao: 'asc; DROP TABLE orcamentos' }),
  ORDEM_ANTIGA,
  'campo ou direção fora da lista não entra no SQL',
);
assert.equal(ordemSqlLista({ campo: 'valor', direcao: 'asc' }).includes('DROP'), false);
assert.equal(ordemSqlLista({ campo: 'cliente', direcao: 'asc' }).startsWith('REPLACE('), true);
checks += 2;

eq(lerValorFiltro(''), { invalido: false }, 'valor vazio não limita');
eq(lerValorFiltro('  '), { invalido: false }, 'espaço não limita');
eq(lerValorFiltro('1500'), { valor: 1500, invalido: false }, 'inteiro');
eq(lerValorFiltro('1.500,50'), { valor: 1500.5, invalido: false }, 'milhar brasileiro');
eq(lerValorFiltro('R$ 1.500'), { valor: 1500, invalido: false }, 'com cifrão e milhar');
eq(lerValorFiltro('1500.50'), { valor: 1500.5, invalido: false }, 'decimal com ponto');
eq(lerValorFiltro('abc'), { invalido: true }, 'texto não é número');
eq(lerValorFiltro('-5'), { invalido: true }, 'negativo não entra');

const agora = new Date(2026, 10, 3, 15, 30, 0);
const hoje = limitesInstante('hoje', agora);
const sete = limitesInstante('7d', agora);
const trinta = limitesInstante('30d', agora);
const mes = limitesInstante('mes', agora);
assert.ok(hoje && sete && trinta && mes);
eq(hoje.inicio.getTime(), new Date(2026, 10, 3).getTime(), 'hoje começa à meia-noite local');
eq(hoje.fim.getTime(), new Date(2026, 10, 4).getTime(), 'hoje termina na meia-noite de amanhã');
eq(sete.inicio.getTime(), new Date(2026, 9, 28).getTime(), '7 dias incluem hoje e os 6 anteriores');
eq(trinta.inicio.getTime(), new Date(2026, 9, 5).getTime(), '30 dias incluem hoje');
eq(mes.inicio.getTime(), new Date(2026, 10, 1).getTime(), 'mês começa no dia 1');
eq(mes.fim.getTime(), new Date(2026, 11, 1).getTime(), 'mês vai até o dia 1 do mês seguinte');

eq(passaPeriodo('2026-11-03T00:00:00+00:00', 'hoje', agora, 'texto'), true, 'emissão de hoje no texto entra');
eq(passaPeriodo('2026-11-02', 'hoje', agora, 'texto'), false, 'emissão de ontem no texto fica de fora');
eq(passaPeriodo('2026-11-20', 'mes', agora, 'texto'), true, 'emissão futura neste mês entra');
eq(passaPeriodo('2026-12-01', 'mes', agora, 'texto'), false, 'mês que vem fica de fora');
eq(passaPeriodo(null, 'hoje', agora, 'texto'), false, 'sem data não passa no corte');
eq(passaPeriodo(hoje.inicio.toISOString(), 'hoje', agora, 'instante'), true, 'instante na meia-noite entra');
eq(passaPeriodo(new Date(hoje.inicio.getTime() - 1).toISOString(), 'hoje', agora, 'instante'), false, '1 ms antes fica de fora');

const itens: ItemListaOrcamento[] = [
  { id: 'a', clienteNome: 'José', numero: '0002', valorTotal: 100, criadoEm: '2026-11-03', status: 'enviado', clienteId: 'jose' },
  { id: 'b', clienteNome: 'Ana', numero: '0003', valorTotal: 300, criadoEm: '2026-11-01', status: 'rascunho', clienteId: 'ana' },
  { id: 'c', clienteNome: 'Ágata', numero: '0001', valorTotal: 300, criadoEm: '2026-10-01', status: 'convertido', clienteId: 'agata' },
  { id: 'd', clienteNome: 'Bruno', numero: '0004', valorTotal: 0, criadoEm: '', status: 'aprovado', clienteId: 'bruno' },
];

eq(
  aplicarListaOrcamentos(itens, { ordem: { campo: 'cliente', direcao: 'asc' }, modoData: 'texto', agora }).map((i) => i.id),
  ['c', 'b', 'd', 'a'],
  'cliente A–Z ignora acento: Ágata, Ana, Bruno, José',
);
eq(
  aplicarListaOrcamentos(itens, { ordem: { campo: 'valor', direcao: 'desc' }, modoData: 'texto', agora }).map((i) => i.id),
  ['b', 'c', 'a', 'd'],
  'maior valor; empate desempata pelo número maior',
);
eq(
  aplicarListaOrcamentos(itens, { ordem: { campo: 'status', direcao: 'asc' }, modoData: 'texto', agora }).map((i) => i.status),
  ['rascunho', 'enviado', 'aprovado', 'convertido'],
  'status segue o funil, não o alfabeto',
);
eq(
  aplicarListaOrcamentos(itens, { ordem: { campo: 'data', direcao: 'desc' }, modoData: 'texto', agora, periodo: 'mes' }).map((i) => i.id),
  ['a', 'b'],
  'este mês + mais recentes: novembro, emissão futura do dia 3 na frente',
);
eq(
  aplicarListaOrcamentos(itens, { busca: 'jose', modoData: 'texto', agora }).map((i) => i.id),
  ['a'],
  'busca sem acento acha José',
);
eq(
  aplicarListaOrcamentos(itens, { busca: '0001', modoData: 'texto', agora }).map((i) => i.id),
  ['c'],
  'busca pelo número',
);
eq(
  aplicarListaOrcamentos(itens, { busca: '00/03', modoData: 'texto', agora }).map((i) => i.id),
  ['b'],
  'busca tira a barra do número',
);
eq(
  aplicarListaOrcamentos(itens, { valorMin: 500, valorMax: 100, modoData: 'texto', agora }).map((i) => i.id),
  ['a', 'b', 'c'],
  'mínimo maior que o máximo inverte a faixa (100 a 500)',
);
eq(
  aplicarListaOrcamentos(itens, { valorInvalido: true, modoData: 'texto', agora }).map((i) => i.id),
  [],
  'valor ilegível não finge que não tem filtro',
);
eq(
  aplicarListaOrcamentos(itens, { clienteId: 'ana', modoData: 'texto', agora }).map((i) => i.id),
  ['b'],
  'filtro do cliente da ficha',
);
eq(
  aplicarListaOrcamentos(itens, { ordem: { campo: 'data', direcao: 'asc' }, modoData: 'texto', agora }).map((i) => i.id),
  ['c', 'b', 'a', 'd'],
  'sem data fica no fim mesmo na ordem crescente',
);

eq(alternarCampoOrdem(ORDEM_PADRAO, 'data').direcao, 'asc', 'tocar de novo na data inverte');
eq(alternarCampoOrdem(ORDEM_PADRAO, 'cliente'), { campo: 'cliente', direcao: 'asc' }, 'cliente começa em A–Z');
eq(alternarCampoOrdem(ORDEM_PADRAO, 'valor'), { campo: 'valor', direcao: 'desc' }, 'valor começa pelo maior');
eq(ordemPelaChave('lixo'), ORDEM_PADRAO, 'chave desconhecida volta ao padrão');

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE orcamentos (id TEXT PRIMARY KEY, numero TEXT, data TEXT)');
const inserir = sqlite.prepare('INSERT INTO orcamentos (id, numero, data) VALUES (?, ?, ?)');
function gravar(id: string, numero: string, blob: Record<string, unknown>) {
  inserir.run(id, numero, JSON.stringify(blob));
}

const dentro = hoje.inicio.toISOString();
const antes = new Date(hoje.inicio.getTime() - 1).toISOString();
const quaseFim = new Date(hoje.fim.getTime() - 1).toISOString();
const depois = hoje.fim.toISOString();
gravar('hoje-ini', '0010', { criadoEm: dentro, valorTotal: 10, clienteNome: 'Ágata', status: 'rascunho', excluidoEm: null });
gravar('ontem', '0009', { criadoEm: antes, valorTotal: 999, clienteNome: 'José', status: 'enviado' });
gravar('hoje-fim', '0011', { criadoEm: quaseFim, valorTotal: 50, clienteNome: 'Ana', status: 'aprovado' });
gravar('amanha', '0012', { criadoEm: depois, valorTotal: 80, clienteNome: 'Bruno', status: 'convertido' });
gravar('lixo', '0013', { criadoEm: dentro, valorTotal: 80, clienteNome: 'Lixo', status: 'rascunho', excluidoEm: '2026-11-03T00:00:00.000Z' });

function consultar(
  filtro: Parameters<typeof clausulasPeriodoValor>[0],
  ordem?: { campo?: string; direcao?: string },
  limite = 50,
  offset = 0,
): string[] {
  const extra = clausulasPeriodoValor(filtro);
  const where = ["json_extract(data, '$.excluidoEm') IS NULL", extra.sql].filter(Boolean).join(' AND ');
  const rows = sqlite.prepare(
    `SELECT id FROM orcamentos WHERE ${where} ORDER BY ${ordemSqlLista(ordem)} LIMIT ? OFFSET ?`,
  ).all(...extra.params, limite, offset) as { id: string }[];
  return rows.map((r) => r.id);
}

eq(
  consultar({ periodo: 'hoje', agora }, { campo: 'valor', direcao: 'desc' }),
  ['hoje-fim', 'hoje-ini'],
  'SQL: hoje pelo instante local, lixeira fora, maior valor primeiro',
);
eq(
  consultar({ periodo: 'hoje', agora, valorMin: 40 }),
  ['hoje-fim'],
  'SQL: valor mínimo junto com o período',
);
eq(
  consultar({ periodo: 'hoje', agora, valorMin: 500, valorMax: 20 }),
  ['hoje-fim'],
  'SQL: faixa invertida (20 a 500) deixa o de 50 e tira o de 10',
);
eq(consultar({ valorInvalido: true }), [], 'SQL: valor ilegível devolve lista vazia');
eq(
  consultar({}, { campo: 'cliente', direcao: 'asc' }),
  ['hoje-ini', 'hoje-fim', 'amanha', 'ontem'],
  'SQL: cliente A–Z sem acento (Ágata, Ana, Bruno, José)',
);
eq(
  consultar({}, { campo: 'valor', direcao: 'desc' }, 1, 1),
  ['amanha'],
  'SQL: a segunda página obedece a mesma ordem, não a ordem de criação',
);

const banco = ler('../src/database/database.ts');
const tela = ler('../src/screens/OrcamentosScreen.tsx');
const desktop = ler('../src/screens/desktop/OrcamentosDesktopScreen.tsx');
const painel = ler('../webapp/src/pages/olli/orcamentos/index.tsx');
assert.match(banco, /clausulasPeriodoValor\(filtro\)/);
assert.match(banco, /ordemSqlLista\(filtro\.ordem\)/);
assert.match(tela, /PERIODOS_LISTA/);
assert.match(tela, /ORDENS_LISTA/);
assert.match(tela, /lerValorFiltro/);
assert.match(desktop, /PERIODOS_LISTA/);
assert.match(desktop, /instanteNoPeriodo/);
assert.match(desktop, /passaValor/);
assert.match(painel, /aplicarListaOrcamentos/);
assert.match(painel, /PERIODOS_LISTA/);
assert.match(painel, /aria-label="Ordenar a lista"/);
assert.match(painel, /aria-label="Filtrar por data"/);
assert.match(painel, /aria-label="Valor mínimo"/);
checks += 13;

console.log(`PASSOU: ${checks} verificações — filtros e ordem da lista de orçamentos.`);
