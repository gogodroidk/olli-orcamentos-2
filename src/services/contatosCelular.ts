/**
 * CONTATOS DO CELULAR — leitura nativa (expo-contacts, SDK 57).
 *
 * SDK 57: a API ANTIGA (`getContactsAsync`, `presentContactPickerAsync`…) LANÇA
 * ERRO em runtime. Aqui só entra a API nova (`Contact.getAllDetails`,
 * `Contact.presentPicker`, `Contact.hasAny`); a permissão sai de
 * `expo-contacts/legacy`, que a doc mantém para isso.
 *
 * O app só LÊ: `WRITE_CONTACTS` fica bloqueado em app.json (blockedPermissions).
 * A permissão é pedida no MOMENTO do uso, depois de a tela explicar em 1 frase.
 * Nada é gravado aqui — os contatos viram prévia e só entram como cliente quando
 * o prestador marca e confirma (LGPD: só quem ele escolhe vira cliente).
 *
 * `expo-contacts` é carregado sob demanda (como o FileSystem em ImportarScreen):
 * nada de módulo nativo no boot, e a web não quebra.
 */
import { Platform } from 'react-native';
import {
	detalhesParaContatos,
	type DetalhesContatoCelular,
	type EscolhaContato,
	type LeituraContatos,
} from './contatosCelularNucleo';

export type { EscolhaContato, LeituraContatos } from './contatosCelularNucleo';

type ModuloContatos = typeof import('expo-contacts');
type ModuloLegacy = typeof import('expo-contacts/legacy');

function modulo(): ModuloContatos {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require('expo-contacts') as ModuloContatos;
}

function legacy(): ModuloLegacy {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require('expo-contacts/legacy') as ModuloLegacy;
}

const disponivel = () => Platform.OS === 'android' || Platform.OS === 'ios';

/** Pede (ou confirma) a leitura de contatos. `true` só com permissão concedida. */
async function garantirLeitura(): Promise<{ ok: true } | { ok: false; podePedirDeNovo: boolean }> {
	const { getPermissionsAsync, requestPermissionsAsync } = legacy();
	const atual = await getPermissionsAsync();
	if (atual.granted) return { ok: true };
	if (atual.status !== 'undetermined' && atual.canAskAgain === false) return { ok: false, podePedirDeNovo: false };
	const pedida = await requestPermissionsAsync();
	if (pedida.granted) return { ok: true };
	return { ok: false, podePedirDeNovo: pedida.canAskAgain !== false };
}

/** Lê a agenda inteira (nome + telefone) para a prévia de importação. */
export async function lerContatosDoCelular(): Promise<LeituraContatos> {
	if (!disponivel()) return { estado: 'indisponivel' };
	try {
		const permissao = await garantirLeitura();
		if (!permissao.ok) return { estado: 'negada', podePedirDeNovo: permissao.podePedirDeNovo };
		const { Contact, ContactField } = modulo();
		if (!(await Contact.hasAny())) return { estado: 'vazio' };
		const detalhes = await Contact.getAllDetails(
			[ContactField.FULL_NAME, ContactField.GIVEN_NAME, ContactField.FAMILY_NAME, ContactField.PHONES] as const,
		) as unknown as DetalhesContatoCelular[];
		const contatos = detalhesParaContatos(detalhes);
		return contatos.length ? { estado: 'ok', contatos } : { estado: 'vazio' };
	} catch (e) {
		return { estado: 'erro', mensagem: e instanceof Error && e.message ? e.message : 'Não consegui ler os contatos agora.' };
	}
}

/**
 * Seletor NATIVO de um contato — não pede permissão de agenda (o sistema mostra a
 * própria lista e só entrega o contato escolhido). É o caminho de quem negou a
 * leitura completa e o do botão "Puxar dos contatos" no orçamento.
 */
export async function escolherUmContato(): Promise<EscolhaContato> {
	if (!disponivel()) return { estado: 'indisponivel' };
	try {
		const { Contact, ContactField } = modulo();
		const contato = await Contact.presentPicker();
		if (!contato) return { estado: 'cancelado' };
		const detalhes = await contato.getDetails(
			[ContactField.FULL_NAME, ContactField.GIVEN_NAME, ContactField.FAMILY_NAME, ContactField.PHONES] as const,
		) as unknown as DetalhesContatoCelular;
		const [unico] = detalhesParaContatos([detalhes]);
		if (!unico) return { estado: 'erro', mensagem: 'Esse contato não tem nome nem telefone.' };
		return { estado: 'ok', nome: unico.nome, telefones: unico.telefones };
	} catch (e) {
		return { estado: 'erro', mensagem: e instanceof Error && e.message ? e.message : 'Não consegui abrir seus contatos agora.' };
	}
}
