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
} from '../src/services/contatosCelularNucleo.ts';
import { numeroWhatsAppBR } from '../src/utils/telefoneWhatsapp.ts';
import { TRANCA_GRATIS_D2267, temAcessoRecurso } from '../src/services/entitlements.ts';
import { telefonePuxadoDe } from '../src/utils/telefonePuxado.ts';

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

await caso('dedupe usa a régua do WhatsApp (numeroWhatsAppBR): +55, 0 na frente e máscara são o mesmo cliente', () => {
	const formas = ['+55 (11) 99999-0000', '011 99999-0000', '11999990000', '(11) 99999-0000', '5511999990000'];
	for (const f of formas) assert.equal(numeroWhatsAppBR(f), '5511999990000', f);
	// Cliente antigo gravado com +55: a prévia reconhece como duplicado (só dígitos crus não reconheciam).
	const base = existentesCom([cliente('c1', 'Dona Rita', '+55 11 99999-0000')]);
	const contatos = detalhesParaContatos([{ fullName: 'Rita Contato', phones: [{ number: '(11) 99999-0000' }] }]);
	const previa = montarPrevia('clientes', contatosParaLinhas(contatos), MAPEAMENTO_FIXO.clientes, base, { rotulo: 'contato' });
	assert.equal(previa[0]?.acao, 'duplicado');
	// Número que NÃO é BR válido nunca casa com outro inválido (null === null não vale).
	const base2 = existentesCom([cliente('c2', 'Fulano', '123')]);
	const p2 = montarPrevia('clientes', contatosParaLinhas(detalhesParaContatos([{ fullName: 'Beltrano', phones: [{ number: '(11) 99999-0000' }] }])), MAPEAMENTO_FIXO.clientes, base2, { rotulo: 'contato' });
	assert.equal(p2[0]?.acao, 'novo');
});

await caso('Puxar dos contatos: cada resultado do seletor vira ok | cancelado | erro com instrução', () => {
	const ok = telefonePuxadoDe({ tipo: 'ok', contato: { nome: 'Ana', telefone: '(11) 99999-0000', email: '' } });
	assert.deepEqual(ok, { estado: 'ok', nome: 'Ana', telefone: '(11) 99999-0000' });
	assert.deepEqual(telefonePuxadoDe({ tipo: 'cancelado' }), { estado: 'cancelado' });
	for (const r of [
		{ tipo: 'sem_dados', contato: { nome: 'Beto', telefone: '', email: '' } },
		{ tipo: 'sem_dados', contato: null },
		{ tipo: 'negado' }, { tipo: 'indisponivel' }, { tipo: 'erro' },
	] as const) {
		const v = telefonePuxadoDe(r);
		assert.equal(v.estado, 'erro', r.tipo);
		assert.ok(v.estado === 'erro' && v.mensagem.length > 20, 'erro sempre diz o que fazer, nunca fica mudo');
	}
	const semFone = telefonePuxadoDe({ tipo: 'sem_dados', contato: { nome: 'Beto', telefone: '', email: '' } });
	assert.ok(semFone.estado === 'erro' && semFone.mensagem.includes('Beto'));
});

await caso('resumo "X criados, Y já existiam"', () => {
	assert.equal(resumoImportacaoContatos(3, 2), '3 criados, 2 já existiam');
	assert.equal(resumoImportacaoContatos(1, 1), '1 criado, 1 já existia');
	assert.equal(resumoImportacaoContatos(0, 0), '0 criados, 0 já existiam');
	assert.equal(resumoImportacaoContatos(2, 1, 1), '2 criados, 1 já existia · 1 com erro');
});

await caso('app.json: só LEITURA — WRITE_CONTACTS bloqueado, READ liberado, plugin com texto em português', async () => {
	const app = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8')).expo;
	const bloqueadas: string[] = app.android.blockedPermissions ?? [];
	assert.ok(bloqueadas.includes('android.permission.WRITE_CONTACTS'), 'WRITE_CONTACTS tem que ficar bloqueado');
	assert.ok(!bloqueadas.includes('android.permission.READ_CONTACTS'), 'READ_CONTACTS é a única permissão de agenda do app');
	assert.ok(!(app.android.permissions ?? []).some((p: string) => /WRITE_CONTACTS/.test(p)));
	const plugin = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-contacts');
	assert.ok(plugin, 'plugin expo-contacts declarado (ele que escreve NSContactsUsageDescription no iOS)');
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
	assert.match(importar, /puxarTelefoneDosContatos/);
	// Mesmo ponto do #383: o envio por WhatsApp oferece puxar do contato, grava no orçamento E no cliente.
	const visualizar = (await ler('screens/VisualizarOrcamentoScreen.tsx')).replace(/\r\n/g, '\n');
	const ini = visualizar.indexOf('async function handleWhatsAppAgora()');
	const corpo = visualizar.slice(ini, visualizar.indexOf('\n  }\n', ini));
	assert.match(corpo, /puxarTelefoneDosContatos\(\)/);
	assert.match(corpo, /saveOrcamento\(atualizado\)/);
	assert.match(corpo, /gravarTelefoneNoCliente\(orc\.clienteId, r\.telefone\)/);
	assert.ok(corpo.indexOf('puxarTelefoneDosContatos()') < corpo.indexOf("autorizarEntrega('whatsapp')"), 'puxar vem antes de registrar o envio');
	assert.ok(corpo.indexOf("rotuloConfirmar: 'Puxar dos contatos'") < corpo.indexOf("rotuloConfirmar: 'Escolher no WhatsApp'"), 'a saída do #383 continua depois');
	assert.match(importar, /Ler meus contatos/);
	assert.match(step1, /Puxar dos contatos/);
	assert.match(step1, /onChange\(\{ clienteTelefone: r\.telefone \}\)/);
	assert.match(step1, /gravarTelefoneNoCliente\(orc\.clienteId, r\.telefone\)/);
	// SDK 57: a API antiga lança em runtime. Só a nova (+ permissão pelo /legacy).
	for (const velha of ['getContactsAsync', 'presentContactPickerAsync', 'addContactAsync', 'writeContactToFileAsync']) {
		assert.ok(!nativo.includes(velha), `não pode usar ${velha}`);
	}
	assert.match(nativo, /Contact\.getAllDetails/);
	assert.match(await ler('services/contatoAgenda.ts'), /Contact\.presentPicker/);
	assert.match(nativo, /expo-contacts\/legacy/);
	// Só lê: nenhuma escrita de contato no app.
	for (const escrita of ['Contact.create', 'createWithForm', 'presentCreateForm', '.delete(', '.update(', '.patch(']) {
		assert.ok(!nativo.includes(escrita), `app só lê contatos: ${escrita}`);
	}
});

await caso('aviso destacado ANTES do pedido de permissão (Play): frase exata, na tela, antes do botão', async () => {
	const FRASE = 'O OLLI vai ler seus contatos só para você escolher quais virar clientes. Nada é enviado sem você escolher.';
	const tela = (await readFile(new URL('../src/screens/ImportarScreen.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
	assert.equal(tela.split(FRASE).length - 1, 1, 'a frase aparece uma vez, exata');
	assert.ok(tela.indexOf(FRASE) < tela.indexOf("label={lendo ? 'Lendo…' : 'Ler meus contatos'}"), 'a frase vem antes do botão que dispara a permissão');
	assert.ok(!tela.includes('Nada é salvo sem você marcar'), 'frase antiga não pode voltar');
});

await caso('D-2267: importar em lote passa pelo entitlement importar_lote (carência até 26/11); puxar 1 telefone segue Grátis', async () => {
	const ler = (p: string) => readFile(new URL(`../src/${p}`, import.meta.url), 'utf8');
	const [importar, clientes, step1, visualizar, puxar] = await Promise.all([
		ler('screens/ImportarScreen.tsx'), ler('screens/ClientesScreen.tsx'), ler('steps/Step1Cliente.tsx'),
		ler('screens/VisualizarOrcamentoScreen.tsx'), ler('services/puxarTelefoneDosContatos.ts'),
	]);
	assert.match(importar, /<TelaRecursoPlano recurso="importar_lote"/);
	assert.match(clientes, /useRecursoPlano\('importar_lote'\)/);
	assert.match(clientes, /lock-outline/, 'trancado, o atalho aparece com cadeado');
	for (const [nome, fonte] of [['Step1Cliente', step1], ['VisualizarOrcamento', visualizar], ['puxarTelefone', puxar]] as const) {
		assert.ok(!fonte.includes('importar_lote'), `${nome} (puxar 1 telefone) NÃO tranca`);
	}
	const antes = Date.parse(TRANCA_GRATIS_D2267) - 1000;
	const depois = Date.parse(TRANCA_GRATIS_D2267) + 1000;
	assert.equal(temAcessoRecurso('gratis', 'importar_lote', antes), true, 'Grátis na carência importa');
	assert.equal(temAcessoRecurso('gratis', 'importar_lote', depois), false, 'Grátis depois da carência: cadeado');
	assert.equal(temAcessoRecurso('pro', 'importar_lote', depois), true);
	assert.equal(temAcessoRecurso('empresa', 'importar_lote', depois), true);
});

if (falhas) {
	console.error(`\n${falhas} caso(s) falharam.`);
	process.exit(1);
}
console.log('\nContatos do celular: tudo certo.');
