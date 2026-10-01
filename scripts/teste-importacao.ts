/**
 * IMPORTAÇÃO "TROQUE EM 5 MINUTOS" — contatos, planilha e foto de orçamento antigo.
 *
 *     node scripts/teste-importacao.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - CSV (`;` `,` TAB, BOM), texto UTF-8 x Windows-1252 (Excel BR) sem TextDecoder;
 *  - vCard 2.1/3.0 (QUOTED-PRINTABLE com quebra suave, linha dobrada, N/FN/ORG/ADR,
 *    celular preferido primeiro);
 *  - XLSX de verdade (montado com o próprio fflate): strings compartilhadas, rich
 *    text, inline, número de telefone, célula pulada, ordem das abas do workbook;
 *  - formato decidido pelo conteúdo, com erro que diz o que fazer (PDF, XLS antigo);
 *  - modelos de colunas (OLLI, Google Contatos) e mapeamento por apelido;
 *  - prévia por linha: novo / duplicado (cadastro ou arquivo) / erro com número da linha;
 *  - cadastro ilegível (`null`) trava a gravação (3 estados);
 *  - gravação item a item: falha de um não derruba os outros, erro de prévia nunca grava;
 *  - a tela, a rota, a entrada em Clientes e o painel usam ESTA fonte.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
import type { Cliente, ProdutoItem, ServicoItem } from '../src/types/index.ts';
import {
	base64ParaBytes,
	decodificarTexto,
	detectarModelo,
	gravarImportacao,
	lerTelefone,
	lerUnidade,
	linhasDaFoto,
	linhasParaObjetos,
	MAPEAMENTO_FIXO,
	mapeamentoInicial,
	modeloPorId,
	MODELOS_COLUNAS,
	montarPrevia,
	parseCsv,
	parseVcf,
	prepararLinhas,
	previaConferida,
	resumoRelatorio,
	selecaoInicialImportacao,
	totaisPrevia,
	type DependenciasImportacao,
	type ExistentesImportacao,
} from '../src/services/importacao.ts';
import { lerArquivoImportacao, lerXlsx } from '../src/services/importacaoArquivo.ts';

let falhas = 0;
let passes = 0;
async function ok(nome: string, fn: () => void | Promise<void>): Promise<void> {
	try { await fn(); passes++; console.log(`  ok   ${nome}`); }
	catch (e) { falhas++; console.error(`  FALHA ${nome}\n        ${e instanceof Error ? e.message : String(e)}`); }
}

const enc = (s: string) => new TextEncoder().encode(s);
const CRIADO = '2026-10-01T10:00:00.000Z';
const vazio: ExistentesImportacao = { clientes: [], produtos: [], servicos: [] };

console.log('\n1) texto, CSV e base64');
await ok('CSV com ; e aspas, BOM e CRLF', () => {
	const linhas = parseCsv('﻿Nome;Obs\r\n"Silva; Ana";"diz ""oi"""\r\n');
	assert.deepEqual(linhas, [['Nome', 'Obs'], ['Silva; Ana', 'diz "oi"']]);
});
await ok('CSV com vírgula (Google) e com TAB (colado da planilha)', () => {
	assert.deepEqual(parseCsv('a,b\n1,2')[1], ['1', '2']);
	assert.deepEqual(parseCsv('a\tb\tc\n1\t2\t3')[1], ['1', '2', '3']);
});
await ok('UTF-8 com BOM e Windows-1252 do Excel brasileiro', () => {
	assert.equal(decodificarTexto(Uint8Array.from([0xef, 0xbb, 0xbf, ...enc('João')])), 'João');
	// "João;Ação €" em Windows-1252
	assert.equal(decodificarTexto(Uint8Array.from([0x4a, 0x6f, 0xe3, 0x6f, 0x3b, 0x41, 0xe7, 0xe3, 0x6f, 0x20, 0x80])), 'João;Ação €');
});
await ok('base64 → bytes igual ao Buffer (com quebra de linha)', () => {
	const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) % 256);
	const b64 = Buffer.from(bytes).toString('base64').replace(/(.{76})/g, '$1\n');
	assert.deepEqual([...base64ParaBytes(b64)], [...bytes]);
});

console.log('\n2) vCard (contatos do celular)');
await ok('vCard 3.0: FN, celular preferido primeiro, ADR e linha dobrada', () => {
	const vcf = [
		'BEGIN:VCARD', 'VERSION:3.0', 'FN:Maria da Silva', 'N:Silva;Maria;da;;',
		'TEL;TYPE=HOME:1133334444', 'TEL;TYPE=CELL:+55 11 98888-7777',
		'ADR;TYPE=HOME:;Apto 12;Rua das Flores\\, 100;São Paulo;SP;01001-000;Brasil',
		'NOTE:linha comprida', ' continuação', 'END:VCARD',
	].join('\r\n');
	const [c] = parseVcf(vcf);
	assert.equal(c?.nome, 'Maria da Silva');
	assert.deepEqual(c?.telefones, ['+55 11 98888-7777', '1133334444']);
	assert.equal(c?.endereco, 'Rua das Flores, 100, Apto 12');
	assert.equal(c?.cidade, 'São Paulo');
	assert.equal(c?.cep, '01001-000');
});
await ok('vCard 2.1 do Android: QUOTED-PRINTABLE UTF-8 com quebra suave', () => {
	const vcf = [
		'BEGIN:VCARD', 'VERSION:2.1',
		'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Concei=C3=A7=C3=A3o;Jo=C3=A3o;;;',
		'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jo=C3=A3o Concei=C3=A7=',
		'=C3=A3o', 'TEL;CELL:11 97777-6666', 'END:VCARD',
		'BEGIN:VCARD', 'VERSION:2.1', 'N:Pereira;Ana;;;', 'TEL;HOME:3333-4444', 'END:VCARD',
		'BEGIN:VCARD', 'VERSION:3.0', 'ORG:Condomínio Aurora', 'TEL:1140041234', 'END:VCARD',
	].join('\n');
	const contatos = parseVcf(vcf);
	assert.equal(contatos.length, 3);
	assert.equal(contatos[0]?.nome, 'João Conceição');
	assert.equal(contatos[1]?.nome, 'Ana Pereira', 'sem FN usa o N (nome + sobrenome)');
	assert.equal(contatos[2]?.nome, 'Condomínio Aurora', 'sem nome usa a empresa');
});

console.log('\n3) XLSX real (zip montado com fflate)');
function xlsx(abas: Array<{ arquivo: string; nome: string; xml: string; oculta?: boolean }>, shared: string[]): Uint8Array {
	const sheets = abas.map((a, i) => `<sheet name="${a.nome}" sheetId="${i + 1}"${a.oculta ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('');
	const rels = abas.map((a, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${a.arquivo}"/>`).join('');
	const sst = shared.map((s) => (s.startsWith('<') ? `<si>${s}</si>` : `<si><t xml:space="preserve">${s}</t></si>`)).join('');
	const arquivos: Record<string, Uint8Array> = {
		'[Content_Types].xml': enc('<?xml version="1.0"?><Types/>'),
		'xl/workbook.xml': enc(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`),
		'xl/_rels/workbook.xml.rels': enc(`<?xml version="1.0"?><Relationships>${rels}</Relationships>`),
		'xl/sharedStrings.xml': enc(`<?xml version="1.0"?><sst count="${shared.length}">${sst}</sst>`),
	};
	for (const a of abas) arquivos[`xl/worksheets/${a.arquivo}`] = enc(`<?xml version="1.0"?><worksheet><cols><col min="1" max="3"/></cols><sheetData>${a.xml}</sheetData></worksheet>`);
	return zipSync(arquivos);
}
const abaClientes = [
	'<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>',
	'<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>11999990000</v></c><c r="D2" t="inlineStr"><is><t>São Paulo &amp; região</t></is></c></row>',
	'<row r="3"/>',
	'<row r="4"><c r="A4" t="s"><v>4</v></c><c r="B4" t="str"><v>(21) 3333-4444</v></c><c r="C4" s="1"/></row>',
].join('');
await ok('primeira aba na ORDEM do workbook, strings compartilhadas, inline, número e célula pulada', () => {
	const bytes = xlsx([
		{ arquivo: 'sheet2.xml', nome: 'Clientes', xml: abaClientes },
		{ arquivo: 'sheet1.xml', nome: 'Outra', xml: '<row r="1"><c r="A1" t="inlineStr"><is><t>errada</t></is></c></row>' },
	], ['Nome', 'Celular', 'Cidade', 'Ana &lt;Rocha&gt;', '<r><t>Bruno </t></r><r><rPr><b/></rPr><t>Lima</t></r><rPh><t>ブルノ</t></rPh>']);
	const linhas = lerXlsx(bytes);
	assert.deepEqual(linhas, [
		['Nome', 'Celular', '', 'Cidade'],
		['Ana <Rocha>', '11999990000', '', 'São Paulo & região'],
		['Bruno Lima', '(21) 3333-4444', ''],
	]);
	const lido = lerArquivoImportacao('clientes.xlsx', bytes);
	assert.equal(lido.formato, 'xlsx');
	assert.equal(lido.linhas[0]?.Celular, '11999990000');
});
await ok('aba oculta é pulada', () => {
	const bytes = xlsx([
		{ arquivo: 'sheet1.xml', nome: 'Oculta', oculta: true, xml: '<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row>' },
		{ arquivo: 'sheet2.xml', nome: 'Visivel', xml: abaClientes },
	], ['Nome', 'Celular', 'Cidade', 'Ana', 'Bruno']);
	assert.equal(lerXlsx(bytes)[0]?.[0], 'Nome');
});
await ok('formato pelo conteúdo: PDF, XLS antigo e binário viram erro com o que fazer', () => {
	assert.throws(() => lerArquivoImportacao('a.pdf', enc('%PDF-1.7 ...')), /Foto de orçamento antigo/);
	assert.throws(() => lerArquivoImportacao('a.xls', Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2])), /XLSX ou CSV/);
	assert.throws(() => lerArquivoImportacao('x.bin', Uint8Array.from([1, 2, 3, 0, 5, 6, 7])), /Formato não reconhecido/);
	assert.throws(() => lerArquivoImportacao('vazio.csv', new Uint8Array()), /vazio/);
	assert.throws(() => lerArquivoImportacao('zip.zip', zipSync({ 'a.txt': enc('oi') })), /não é uma planilha/);
});
await ok('vCard e CSV Windows-1252 detectados sem depender do nome', () => {
	const vcf = lerArquivoImportacao('contatos', enc('BEGIN:VCARD\nFN:Ana\nTEL:11999990000\nEND:VCARD'));
	assert.equal(vcf.formato, 'vcf');
	assert.deepEqual(vcf.linhas[0], { Nome: 'Ana', Telefone: '11999990000', Endereço: '', Cidade: '', UF: '', CEP: '' });
	const csv = lerArquivoImportacao('export', Uint8Array.from([...enc('Nome;Cidade\r\nJo'), 0xe3, ...enc('o;S'), 0xe3, ...enc('o Paulo')]));
	assert.deepEqual(csv.linhas, [{ Nome: 'João', Cidade: 'São Paulo' }]);
});

console.log('\n4) modelos de colunas e mapeamento');
await ok('Google Contatos: detectado, nome montado de nome + sobrenome, telefone/endereço mapeados', () => {
	const linhas = linhasParaObjetos(parseCsv('First Name,Middle Name,Last Name,Phone 1 - Label,Phone 1 - Value,Address 1 - Street,Address 1 - City,Address 1 - Region,Address 1 - Postal Code\nCarla,,Mendes,Mobile,+55 31 99876-5432,Rua A 10,Belo Horizonte,Minas Gerais,30140-071'));
	const modelo = detectarModelo(Object.keys(linhas[0] ?? {}));
	assert.equal(modelo?.id, 'google_contatos');
	const preparadas = prepararLinhas(linhas, modelo);
	const mapa = mapeamentoInicial('clientes', Object.keys(preparadas[0] ?? {}), modelo);
	assert.equal(mapa.nome, 'Nome (montado)');
	assert.equal(mapa.telefone, 'Phone 1 - Value');
	const [l] = montarPrevia('clientes', preparadas, mapa, vazio);
	assert.equal(l?.nome, 'Carla Mendes');
	assert.equal(l?.acao, 'novo');
	assert.deepEqual(l?.registro, { nome: 'Carla Mendes', telefone: '(31) 99876-5432', endereco: 'Rua A 10', cidade: 'Belo Horizonte', estado: 'MG', cep: '30140-071' });
});
await ok('CSV exportado pelo OLLI é reconhecido; planilha genérica cai nos apelidos', () => {
	assert.equal(detectarModelo(['nome', 'telefone', 'cpf', 'cnpj', 'endereco', 'cidade', 'estado', 'cep'])?.id, 'olli');
	assert.equal(detectarModelo(['Cliente', 'WhatsApp']), null);
	const mapa = mapeamentoInicial('clientes', ['Cliente', 'WhatsApp', 'Endereço', 'Nº', 'Bairro', 'Município', 'Estado', 'CEP', 'CPF/CNPJ']);
	assert.deepEqual(
		[mapa.nome, mapa.telefone, mapa.endereco, mapa.numero, mapa.bairro, mapa.cidade, mapa.estado, mapa.cep, mapa.cpf],
		['Cliente', 'WhatsApp', 'Endereço', 'Nº', 'Bairro', 'Município', 'Estado', 'CEP', 'CPF/CNPJ'],
	);
	const servicos = mapeamentoInicial('servicos', ['Serviço', 'Valor', 'Unid.']);
	assert.deepEqual([servicos.nome, servicos.preco, servicos.unidade], ['Serviço', 'Valor', 'Unid.']);
});
await ok('concorrente sem exportação conferida é honesto (não conferido, sem colunas inventadas)', () => {
	for (const id of ['profissa', 'climabot', 'refrimaq']) {
		const m = modeloPorId(id);
		assert.ok(m, id);
		assert.equal(m.conferido, false);
		assert.equal(m.assinatura.length, 0);
		assert.equal(m.colunas, undefined);
		assert.match(m.nota, /Ainda não conferimos/);
	}
	assert.ok(MODELOS_COLUNAS.some((m) => m.id === 'generica'));
});

console.log('\n5) prévia de clientes');
const existentes: ExistentesImportacao = {
	clientes: [
		{ id: 'c1', nome: 'Maria Souza', telefone: '(11) 99999-0000' },
		{ id: 'c2', nome: 'Posto Central', telefone: '', cnpj: '11.222.333/0001-81' },
		{ id: 'c3', nome: 'Excluída', telefone: '21988887777', excluidoEm: CRIADO },
	],
	produtos: [{ id: 'p1', nome: 'Gás R410A', marca: 'Chemours', modelo: '11kg', unidade: 'kg' }],
	servicos: [{ id: 's1', nome: 'Limpeza de split', unidade: 'un' }],
};
const csvClientes = [
	'Nome;Telefone;CPF;CNPJ;Endereço;Número;Bairro;Cidade;UF;CEP',
	';11 95555-4444;;;;;;;;',
	'Maria Souza Filha;+55 (11) 99999-0000;;;;;;;;',
	'Posto Central Ltda;;;11222333000181;;;;;;',
	'Carlos;97777-6666;;;;;;;;',
	'Dona Rita;011 3456-7890;123.456.789-00;;Rua B;45;Centro;Campinas;São Paulo;13010-100',
	'Dona Rita;(11) 3456-7890;;;;;;;;',
	'Lucas;21988887777;529.982.247-25;;;;;;XX;123',
].join('\n');
const linhasClientes = linhasParaObjetos(parseCsv(csvClientes));
const mapaClientes = mapeamentoInicial('clientes', Object.keys(linhasClientes[0] ?? {}));
await ok('linha com número do arquivo; sem nome e telefone sem DDD viram erro com motivo', () => {
	const p = montarPrevia('clientes', linhasClientes, mapaClientes, existentes);
	assert.equal(p[0]?.rotulo, 'Linha 2');
	assert.equal(p[0]?.acao, 'erro');
	assert.match(p[0]?.motivo ?? '', /Sem nome/);
	assert.equal(p[3]?.acao, 'erro');
	assert.match(p[3]?.motivo ?? '', /sem DDD/);
});
await ok('DDD padrão completa telefone sem DDD', () => {
	const p = montarPrevia('clientes', linhasClientes, mapaClientes, existentes, { dddPadrao: '19' });
	assert.equal(p[3]?.acao, 'novo');
	assert.equal((p[3]?.registro as { telefone: string }).telefone, '(19) 97777-6666');
});
await ok('duplicado no cadastro por telefone (+55) e por CNPJ; excluído não conta', () => {
	const p = montarPrevia('clientes', linhasClientes, mapaClientes, existentes);
	assert.equal(p[1]?.acao, 'duplicado');
	assert.match(p[1]?.motivo ?? '', /Maria Souza/);
	assert.equal(p[2]?.acao, 'duplicado');
	assert.match(p[2]?.motivo ?? '', /Posto Central/);
	assert.equal(p[6]?.acao, 'novo', 'o cliente na lixeira não bloqueia');
});
await ok('repetido no próprio arquivo; endereço, UF por extenso, CEP e documento normalizados', () => {
	const p = montarPrevia('clientes', linhasClientes, mapaClientes, existentes);
	assert.equal(p[4]?.acao, 'novo');
	assert.deepEqual(p[4]?.registro, { nome: 'Dona Rita', telefone: '(11) 3456-7890', endereco: 'Rua B, 45 - Centro', cidade: 'Campinas', estado: 'SP', cep: '13010-100' });
	assert.ok(p[4]?.avisos.some((a) => /Documento inválido/.test(a)), 'CPF com dígito errado avisa e não entra');
	assert.equal(p[5]?.acao, 'duplicado');
	assert.match(p[5]?.motivo ?? '', /Repetido no arquivo \(Linha 6/);
	assert.equal((p[6]?.registro as { cpf?: string }).cpf, '529.982.247-25');
	assert.ok(p[6]?.avisos.some((a) => /UF desconhecida/.test(a)));
	assert.ok(p[6]?.avisos.some((a) => /CEP inválido/.test(a)));
	assert.deepEqual(totaisPrevia(p), { novo: 2, duplicado: 3, erro: 2 });
});
await ok('telefone: vários na célula, 0 de operadora, inválido explícito', () => {
	assert.deepEqual(lerTelefone('123 / (11) 98888-0000'), { ok: true, digitos: '11988880000', formatado: '(11) 98888-0000' });
	assert.equal((lerTelefone('0 21 3333 4444') as { digitos: string }).digitos, '2133334444');
	assert.equal(lerTelefone('12').ok, false);
	assert.deepEqual(lerTelefone(''), { ok: true, digitos: '', formatado: '' });
});
await ok('cadastro ilegível (null) NÃO é "sem duplicado": a prévia não fica conferida', () => {
	const naoLido: ExistentesImportacao = { clientes: null, produtos: [], servicos: [] };
	assert.equal(previaConferida(['cliente'], naoLido), false);
	assert.equal(previaConferida(['produto', 'servico'], naoLido), true);
	assert.equal(previaConferida(['cliente'], existentes), true);
});

console.log('\n6) prévia de catálogo');
await ok('produto: preço BR, unidade normalizada, duplicado por nome+marca+modelo, preço inválido = erro', () => {
	const linhas = linhasParaObjetos(parseCsv([
		'Produto;Marca;Modelo;Unidade;Preço;Custo',
		'Gás R410A;Chemours;11kg;KG;R$ 1.234,56;900',
		'Gás R410A;Chemours;5kg;kg;650;abc',
		'Tubo de cobre;;;M;45,9;',
		'Suporte;;;galão;80;',
		'Fita;;;un;;',
		'Fita PVC;;;un;-3;',
	].join('\n')));
	const p = montarPrevia('produtos', linhas, mapeamentoInicial('produtos', Object.keys(linhas[0] ?? {})), existentes);
	assert.equal(p[0]?.acao, 'duplicado');
	assert.equal(p[1]?.acao, 'novo');
	assert.ok(p[1]?.avisos.some((a) => /Custo inválido/.test(a)));
	assert.deepEqual(p[2]?.registro, { nome: 'Tubo de cobre', preco: 45.9, unidade: 'm' });
	assert.equal((p[3]?.registro as { unidade: string }).unidade, 'un');
	assert.ok(p[3]?.avisos.some((a) => /não existe no OLLI/.test(a)));
	assert.equal(p[4]?.acao, 'erro');
	assert.match(p[4]?.motivo ?? '', /Sem preço/);
	assert.equal(p[5]?.acao, 'erro');
	assert.equal(lerUnidade('m2'), 'm²');
	assert.equal(lerUnidade('Litros'), 'L');
});
await ok('serviço: duplicado por nome + unidade', () => {
	const linhas = [{ Nome: 'Limpeza de Split', Preço: '180' }, { Nome: 'Limpeza de split', Unidade: 'h', Preço: '90' }];
	const p = montarPrevia('servicos', linhas, MAPEAMENTO_FIXO.servicos, existentes);
	assert.equal(p[0]?.acao, 'duplicado');
	assert.equal(p[1]?.acao, 'novo');
});

console.log('\n7) foto de orçamento antigo (prévia do Autopilot)');
await ok('itens do orçamento viram serviço/produto; cliente do orçamento entra; sem preço = R$ 0 com aviso', () => {
	const linhas = linhasDaFoto({
		clientes: [],
		produtos: [{ tipo: 'produto', nome: 'Capacitor 35uF', descricao: '', unidade: 'un', precoSugerido: 45 }],
		servicos: [],
		orcamento: {
			clienteNome: 'Sr. Antônio',
			itens: [
				{ tipo: 'item', nome: 'Capacitor 35uF', descricao: '', unidade: 'un', precoSugerido: 45 },
				{ tipo: 'item', nome: 'Visita técnica', descricao: '', unidade: 'un', precoSugerido: 120 },
				{ tipo: 'item', nome: 'Gás R410A', descricao: '', unidade: 'kg', precoSugerido: 0 },
			],
		},
	}, ['Gás R410A']);
	assert.deepEqual(linhas.clientes, [{ Nome: 'Sr. Antônio', Telefone: '' }]);
	assert.deepEqual(linhas.servicos.map((l) => l.Nome), ['Visita técnica']);
	assert.deepEqual(linhas.produtos.map((l) => l.Nome), ['Capacitor 35uF', 'Gás R410A']);
	const p = montarPrevia('produtos', linhas.produtos, MAPEAMENTO_FIXO.produtos, vazio, { rotulo: 'item', precoObrigatorio: false });
	assert.equal(p[1]?.rotulo, 'Item 2');
	assert.equal(p[1]?.acao, 'novo');
	assert.equal((p[1]?.registro as { preco: number }).preco, 0);
	assert.ok(p[1]?.avisos.some((a) => /Sem preço/.test(a)));
});

console.log('\n8) seleção e gravação');
await ok('contatos começam desmarcados; planilha/foto marcam só os novos', () => {
	const p = montarPrevia('clientes', linhasClientes, mapaClientes, existentes);
	assert.equal(selecaoInicialImportacao(p, 'contatos').size, 0);
	assert.deepEqual([...selecaoInicialImportacao(p, 'planilha')], p.filter((l) => l.acao === 'novo').map((l) => l.chave));
});
function deps(over: Partial<DependenciasImportacao> = {}) {
	const salvos = { clientes: [] as Cliente[], produtos: [] as ProdutoItem[], servicos: [] as ServicoItem[] };
	let n = 0;
	const progresso: Array<[number, number]> = [];
	const d: DependenciasImportacao = {
		saveCliente: async (c) => { salvos.clientes.push(c); },
		saveProduto: async (p) => { salvos.produtos.push(p); },
		saveServico: async (s) => { salvos.servicos.push(s); },
		gerarId: () => `id-${++n}`, agora: () => CRIADO,
		permissoes: { clientes: true, catalogo: true },
		aoProgredir: (f, t) => progresso.push([f, t]),
		...over,
	};
	return { d, salvos, progresso };
}
await ok('grava só os marcados; linha com erro nunca grava; falha de um não derruba os outros', async () => {
	const p = montarPrevia('clientes', linhasClientes, mapaClientes, existentes);
	const marcados = new Set([p[0]!.chave, p[4]!.chave, p[6]!.chave, p[1]!.chave]);
	const { d, salvos, progresso } = deps({
		saveCliente: async (c) => { if (c.nome === 'Lucas') throw new Error('disco cheio'); salvos.clientes.push(c); },
	});
	const r = await gravarImportacao(p, marcados, d);
	assert.equal(r.gravados, 2, 'Dona Rita + o duplicado que o usuário marcou de propósito');
	assert.equal(r.falhas, 2);
	assert.equal(salvos.clientes.length, 2);
	assert.deepEqual(salvos.clientes[0], { nome: 'Maria Souza Filha', telefone: '(11) 99999-0000', id: 'id-1', criadoEm: CRIADO });
	const erroLinha = r.itens.find((i) => i.rotulo === 'Linha 2');
	assert.ok(erroLinha && !erroLinha.ok && /Sem nome/.test(erroLinha.erro));
	const lucas = r.itens.find((i) => i.nome === 'Lucas');
	assert.ok(lucas && !lucas.ok && /disco cheio/.test(lucas.erro));
	assert.deepEqual(progresso.at(-1), [4, 4]);
	assert.equal(resumoRelatorio(r), '2 registros importados · 2 com erro');
});
await ok('serviço não leva marca/modelo; papel sem catálogo vira erro explícito', async () => {
	const p = montarPrevia('servicos', [{ Nome: 'Instalação', Preço: '350' }], MAPEAMENTO_FIXO.servicos, vazio);
	const { d, salvos } = deps();
	const r = await gravarImportacao(p, new Set([p[0]!.chave]), d);
	assert.equal(r.gravados, 1);
	assert.deepEqual(salvos.servicos[0], { nome: 'Instalação', preco: 350, unidade: 'un', id: 'id-1', criadoEm: CRIADO });
	const sem = deps({ permissoes: { clientes: true, catalogo: false } });
	const r2 = await gravarImportacao(p, new Set([p[0]!.chave]), sem.d);
	assert.equal(r2.gravados, 0);
	assert.equal(sem.salvos.servicos.length, 0);
	assert.ok(!r2.itens[0]?.ok && /não permite cadastrar serviço/.test(r2.itens[0]?.ok === false ? r2.itens[0].erro : ''));
});

console.log('\n9) contrato com a tela, a navegação e o painel');
const ler = (p: string) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
await ok('a tela usa a prévia e os saves do banco (sync), nunca grava sem conferir', async () => {
	const tela = await ler('src/screens/ImportarScreen.tsx');
	for (const trecho of ['gravarImportacao(previa, selecionados', 'saveCliente, saveProduto, saveServico', 'previaConferida(', 'prepararPreviaAutopilot(', "selecaoInicialImportacao(previa", 'lerArquivoImportacao(', 'linhasDaFoto(']) {
		assert.ok(tela.includes(trecho), `ImportarScreen deveria conter ${trecho}`);
	}
	assert.match(tela, /disabled=\{!conferida \|\| gravando/);
});
await ok('rota Importar registrada, com link /importar, e entrada em Clientes', async () => {
	const navegador = await ler('src/navigation/AppNavigator.tsx');
	assert.match(navegador, /Importar: undefined;/);
	assert.match(navegador, /<Stack\.Screen name="Importar" component=\{ImportarCentro\} \/>/);
	assert.match(await ler('src/navigation/linking.ts'), /Importar: 'importar'/);
	assert.match(await ler('src/screens/ClientesScreen.tsx'), /nav\.navigate\('Importar'\)/);
});
await ok('painel reexporta a MESMA fonte; fflate declarado como dependência direta', async () => {
	assert.match(await ler('webapp/src/olli/importacao/parser.ts'), /from "\.\.\/\.\.\/\.\.\/\.\.\/src\/services\/importacao\.ts"/);
	const dados = await ler('webapp/src/pages/olli/dados/index.tsx');
	assert.match(dados, /CAMPOS_IMPORTACAO/);
	assert.match(dados, /detectarModelo\(/);
	const pkg = JSON.parse(await ler('package.json')) as { dependencies: Record<string, string> };
	assert.ok(pkg.dependencies.fflate, 'fflate precisa ser dependência direta (o leitor de XLSX importa)');
});

console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
