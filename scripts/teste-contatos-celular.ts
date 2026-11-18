/**
 * IMPORTAR DOS CONTATOS DO CELULAR (D-2245) — núcleo puro, sem expo.
 *
 *     node scripts/teste-contatos-celular.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - detalhes do sistema → ContatoVcf (nome completo ou nome+sobrenome, ordem pt-BR,
 *    sem nome e sem telefone some, sem nome com telefone fica para a prévia acusar);
 *  - o mesmo número escrito de formas diferentes (+55, parênteses, 0 na frente) não duplica no contato;
 *  - telefone normalizado BR contra a base: +55 11 99999-0000 == (11) 99999-0000 == 011999990000;
 *  - duplicado contra o cadastro, repetido na própria lista e contato novo, na prévia de verdade;
 *  - contato sem DDD só entra com o DDD padrão (nunca vira número torto);
 *  - "Puxar dos contatos": primeiro telefone VÁLIDO, '' quando nenhum serve (nunca número torto);
 *  - resumo "X criados, Y já existiam" com singular/plural;
 *  - a tela, a rota, o app.json (WRITE bloqueado, plugin) e o Step1Cliente usam esta fonte.
 */
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import {
	contatosParaLinhas,
	lerTelefone,
	MAPEAMENTO_FIXO,
	montarPrevia,
	type ExistentesImportacao,
} from '../src/services/importacao.ts';
import {
	detalhesParaContatos,
	resumoImportacaoContatos,
	telefoneDoContato,
} from '../src/services/contatosCelularNucleo.ts';

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>) {
	try {
		await fn();
		console.log(`  ok  ${nome}`);
	} catch (e) {
		falhas += 1;
		console.error(`FALHA ${nome}\n      ${e instanceof Error ? e.message : String(e)}`);
	}
}

const existentesCom = (clientes: ExistentesImportacao['clientes']): ExistentesImportacao => ({ clientes, produtos: null, servicos: null });
const cliente = (id: string, nome: string, telefone: string) => ({ id, nome, telefone });

await caso('nome completo; senão nome + sobrenome; ordem pt-BR', () => {
	const r = detalhesParaContatos([
		{ id: '1', fullName: 'Zeca Pagodinho', phones: [{ number: '(21) 98888-1111' }] },
		{ id: '2', givenName: 'Ágata', familyName: 'Souza', phones: [{ number: '(11) 97777-2222' }] },
		{ id: '3', fullName: '  Bia   Lima ', phones: [{ number: '11 96666 3333' }] },
	]);
	assert.deepEqual(r.map((c) => c.nome), ['Ágata Souza', 'Bia Lima', 'Zeca Pagodinho']);
});

await caso('sem nome e sem telefone some; sem nome COM telefone fica (a prévia acusa)', () => {
	const r = detalhesParaContatos([
		{ id: '1' },
		{ id: '2', fullName: '   ', phones: [] },
		{ id: '3', phones: [{ number: '(11) 95555-4444' }] },
		{ id: '4', fullName: 'Só Nome' },
	]);
	assert.equal(r.length, 2);
	assert.ok(r.some((c) => c.nome === '' && c.telefones.length === 1));
	assert.ok(r.some((c) => c.nome === 'Só Nome' && c.telefones.length === 0));
	const previa = montarPrevia('clientes', contatosParaLinhas(r), MAPEAMENTO_FIXO.clientes, existentesCom([]), { rotulo: 'contato' });
	const semNome = previa.find((l) => l.acao === 'erro');
	assert.ok(semNome, 'contato sem nome vira erro na prévia, não some em silêncio');
	assert.match(semNome.motivo, /Sem nome/);
});

await caso('o mesmo número escrito de formas diferentes não duplica dentro do contato', () => {
	const [c] = detalhesParaContatos([{
		fullName: 'Maria',
		phones: [{ number: '+55 11 99999-0000' }, { number: '(11) 99999-0000' }, { number: '011 99999-0000' }, { number: '(11) 3333-4444' }],
	}]);
	assert.equal(c?.telefones.length, 2);
});

await caso('normalizador BR: +55, parênteses e 0 na frente dão os mesmos dígitos', () => {
	for (const bruto of ['+55 11 99999-0000', '(11) 99999-0000', '011 99999-0000', '5511999990000', '11999990000']) {
		const r = lerTelefone(bruto);
		assert.ok(r.ok && r.digitos === '11999990000', `${bruto} → ${JSON.stringify(r)}`);
	}
	assert.equal(lerTelefone('99999-0000').ok, false, 'sem DDD não vira número torto');
	const comDdd = lerTelefone('99999-0000', '21');
	assert.ok(comDdd.ok && comDdd.digitos === '21999990000');
});

await caso('prévia: já existe na base (qualquer formato), repetido na lista e novo', () => {
	const contatos = detalhesParaContatos([
		{ fullName: 'Ana Já Cadastrada', phones: [{ number: '+55 (11) 99999-0000' }] },
		{ fullName: 'Bruno Novo', phones: [{ number: '(21) 98888-7777' }] },
		{ fullName: 'Bruno Novo Repetido', phones: [{ number: '21 98888-7777' }] },
	]);
	const base = existentesCom([cliente('c1', 'Ana Silva', '(11) 99999-0000')]);
	const previa = montarPrevia('clientes', contatosParaLinhas(contatos), MAPEAMENTO_FIXO.clientes, base, { rotulo: 'contato' });
	const por = Object.fromEntries(previa.map((l) => [l.nome, l.acao]));
	assert.equal(por['Ana Já Cadastrada'], 'duplicado');
	assert.equal(por['Bruno Novo'], 'novo');
	assert.equal(por['Bruno Novo Repetido'], 'duplicado');
	assert.match(previa.find((l) => l.nome === 'Ana Já Cadastrada')?.motivo ?? '', /Já existe/);
});

await caso('cadastro ilegível (null) não vira "sem duplicado": a tela usa previaConferida', async () => {
	const fonte = await readFile(new URL('../src/screens/ImportarScreen.tsx', import.meta.url), 'utf8');
	assert.match(fonte, /previaConferida/);
	assert.match(fonte, /existentes === 'carregando'/);
});

await caso('Puxar dos contatos: primeiro telefone válido; nenhum serve → vazio', () => {
	assert.equal(telefoneDoContato(['123', '+55 11 99999-0000', '(21) 98888-7777']), '(11) 99999-0000');
	assert.equal(telefoneDoContato(['99999-0000']), '', 'sem DDD não é número que o WhatsApp aceite');
	assert.equal(telefoneDoContato(['99999-0000'], '31'), '(31) 99999-0000');
	assert.equal(telefoneDoContato([]), '');
	assert.equal(telefoneDoContato(['abc']), '');
});

await caso('resumo "X criados, Y já existiam"', () => {
	assert.equal(resumoImportacaoContatos(3, 2), '3 criados, 2 já existiam');
	assert.equal(resumoImportacaoContatos(1, 1), '1 criado, 1 já existia');
	assert.equal(resumoImportacaoContatos(0, 0), '0 criados, 0 já existiam');
	assert.equal(resumoImportacaoContatos(2, 1, 1), '2 criados, 1 já existia · 1 com erro');
});

await caso('app.json: plugin com texto em português e WRITE_CONTACTS bloqueado', async () => {
	const app = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8')).expo;
	assert.ok(app.android.blockedPermissions.includes('android.permission.WRITE_CONTACTS'));
	assert.ok(!(app.android.permissions ?? []).includes('android.permission.WRITE_CONTACTS'));
	const plugin = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-contacts');
	assert.ok(plugin, 'plugin expo-contacts declarado');
	assert.match(plugin[1].contactsPermission, /nome e telefone/);
	assert.doesNotMatch(plugin[1].contactsPermission, /Allow \$\(PRODUCT_NAME\)/);
});

await caso('telas: Clientes e Importar abrem a porta de contatos; Step1 puxa só o telefone; API antiga nunca', async () => {
	const ler = (p: string) => readFile(new URL(`../src/${p}`, import.meta.url), 'utf8');
	const [clientes, importar, step1, nativoBruto, nav] = await Promise.all([
		ler('screens/ClientesScreen.tsx'), ler('screens/ImportarScreen.tsx'), ler('steps/Step1Cliente.tsx'),
		ler('services/contatosCelular.ts'), ler('navigation/AppNavigator.tsx'),
	]);
	// Só o CÓDIGO conta (o cabeçalho do arquivo cita a API antiga para avisar contra ela).
	const nativo = nativoBruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
	assert.match(clientes, /navigate\('Importar', \{ origem: 'contatos' \}\)/);
	assert.match(nav, /Importar: \{ origem\?: 'contatos' \}/);
	assert.match(importar, /lerContatosDoCelular/);
	assert.match(importar, /escolherUmContato/);
	assert.match(importar, /Ler meus contatos/);
	assert.match(step1, /Puxar dos contatos/);
	assert.match(step1, /onChange\(\{ clienteTelefone: telefone \}\)/);
	// SDK 57: a API antiga lança em runtime. Só a nova (+ permissão pelo /legacy).
	for (const velha of ['getContactsAsync', 'presentContactPickerAsync', 'addContactAsync', 'writeContactToFileAsync']) {
		assert.ok(!nativo.includes(velha), `não pode usar ${velha}`);
	}
	assert.match(nativo, /Contact\.getAllDetails/);
	assert.match(nativo, /Contact\.presentPicker/);
	assert.match(nativo, /expo-contacts\/legacy/);
	// Só lê: nenhuma escrita de contato no app.
	for (const escrita of ['Contact.create', 'createWithForm', 'presentCreateForm', '.delete(', '.update(', '.patch(']) {
		assert.ok(!nativo.includes(escrita), `app só lê contatos: ${escrita}`);
	}
});

if (falhas) {
	console.error(`\n${falhas} caso(s) falharam.`);
	process.exit(1);
}
console.log('\nContatos do celular: tudo certo.');
