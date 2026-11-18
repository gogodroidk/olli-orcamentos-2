/**
 * CONTATOS DO CELULAR → clientes — núcleo PURO (sem expo, sem React Native).
 *
 * Fica separado de `contatosCelular.ts` para o teste rodar em Node puro
 * (`node scripts/teste-contatos-celular.ts`). Aqui só entra regra: transformar o
 * que o sistema de contatos devolve no mesmo formato do .vcf (`ContatoVcf`), de
 * modo que a prévia de `importacao.ts` faça o resto (telefone normalizado BR,
 * duplicado contra a base, duplicado dentro da própria lista, relatório).
 *
 * Nada aqui grava cliente: quem grava é `gravarImportacao`, depois de o usuário
 * conferir e marcar a prévia.
 */
import { lerTelefone, type ContatoVcf } from './importacao.ts';

/** O que `Contact.getAllDetails([FULL_NAME, GIVEN_NAME, FAMILY_NAME, PHONES])` devolve (só o que lemos). */
export type DetalhesContatoCelular = {
	id?: string | null;
	fullName?: string | null;
	givenName?: string | null;
	familyName?: string | null;
	phones?: Array<{ number?: string | null }> | null;
};

/** Lista grande de agenda: o teto é o mesmo de `LIMITE_LINHAS` do arquivo. */
export const MAX_CONTATOS_LIDOS = 5_000;

const limpar = (v: string | null | undefined): string => (v ?? '').replace(/\s+/g, ' ').trim();

function nomeDe(d: DetalhesContatoCelular): string {
	const completo = limpar(d.fullName);
	if (completo) return completo;
	return limpar([d.givenName, d.familyName].filter(Boolean).join(' '));
}

/**
 * Telefones do contato, sem repetir o mesmo número escrito de formas diferentes
 * (`+55 11 99999-0000` e `(11) 99999-0000`). O que não for número válido de BR
 * continua na lista (a prévia mostra o motivo), só não duplica por dígitos.
 */
function telefonesDe(d: DetalhesContatoCelular): string[] {
	const vistos = new Set<string>();
	const saida: string[] = [];
	for (const t of d.phones ?? []) {
		const bruto = limpar(t.number);
		if (!bruto) continue;
		const lido = lerTelefone(bruto);
		const chave = lido.ok && lido.digitos ? lido.digitos : bruto.replace(/\D/g, '') || bruto;
		if (vistos.has(chave)) continue;
		vistos.add(chave);
		saida.push(bruto);
	}
	return saida;
}

/**
 * Detalhes do sistema → `ContatoVcf[]`, ordenado por nome (pt-BR).
 * Contato sem nome e sem telefone some (não há o que importar); sem nome mas com
 * telefone fica, e a prévia o marca como erro "Sem nome" — nunca é descartado em silêncio.
 */
export function detalhesParaContatos(detalhes: DetalhesContatoCelular[]): ContatoVcf[] {
	const contatos: ContatoVcf[] = [];
	for (const d of detalhes.slice(0, MAX_CONTATOS_LIDOS)) {
		const nome = nomeDe(d);
		const telefones = telefonesDe(d);
		if (!nome && !telefones.length) continue;
		contatos.push({ nome, telefones, endereco: '', cidade: '', estado: '', cep: '', empresa: '' });
	}
	return contatos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

/**
 * Primeiro telefone BR válido do contato, já formatado — para "Puxar dos contatos"
 * no orçamento sem telefone. `''` = o contato não tem número que o WhatsApp aceite
 * (quem chama mostra o aviso; nunca devolve um número torto).
 */
export function telefoneDoContato(telefones: string[], dddPadrao?: string): string {
	for (const t of telefones) {
		const lido = lerTelefone(t, dddPadrao);
		if (lido.ok && lido.digitos) return lido.formatado;
	}
	return '';
}

/** Resultado da leitura: 5 estados, nenhum deles é "lista vazia" disfarçando erro. */
export type LeituraContatos =
	| { estado: 'ok'; contatos: ContatoVcf[] }
	| { estado: 'vazio' }
	| { estado: 'negada'; podePedirDeNovo: boolean }
	| { estado: 'indisponivel' }
	| { estado: 'erro'; mensagem: string };

/** Escolha de UM contato (seletor nativo). */
export type EscolhaContato =
	| { estado: 'ok'; nome: string; telefones: string[] }
	| { estado: 'cancelado' }
	| { estado: 'indisponivel' }
	| { estado: 'erro'; mensagem: string };

/**
 * Resumo do fim da importação pelos contatos: "3 criados, 2 já existiam".
 * `jaExistiam` = linhas que a prévia marcou como duplicado (já no cadastro ou repetidas
 * na própria lista) — não foram gravadas de novo.
 */
export function resumoImportacaoContatos(gravados: number, jaExistiam: number, falhas = 0): string {
	const criados = `${gravados} ${gravados === 1 ? 'criado' : 'criados'}`;
	const existiam = `${jaExistiam} ${jaExistiam === 1 ? 'já existia' : 'já existiam'}`;
	return falhas > 0 ? `${criados}, ${existiam} · ${falhas} com erro` : `${criados}, ${existiam}`;
}
