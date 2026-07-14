/**
 * CONTRATO DE ESCRITA — espelho fiel de `src/services/cloudSync.ts` (o app do celular).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LEIA ANTES DE MEXER
 * ═══════════════════════════════════════════════════════════════════════════════
 * O painel web e o app do celular gravam nas MESMAS tabelas. E o formato não é
 * "uma coluna por campo": nas tabelas com `dados` (jsonb) — `orcamentos`,
 * `recibos`, `empresa` — a coluna `dados` guarda o **objeto de domínio INTEIRO**
 * (em camelCase), e as colunas de cima (`status`, `valor_total`, …) são apenas
 * ESPELHOS para índice/listagem.
 *
 * Consequência prática: se o painel gravar só as colunas e esquecer o blob, o app
 * do celular lê um orçamento **sem itens** — dado do cliente corrompido. Por isso
 * cada `toRow` aqui é uma cópia literal do `toRow` de lá, e os tipos vêm de
 * `@dominio` (= os tipos do próprio app), não de uma cópia local: se o app mudar
 * um campo, isto aqui **para de compilar** em vez de gravar lixo em silêncio.
 *
 * Fonte da verdade: `src/services/cloudSync.ts`.
 */
import type {
	Agendamento,
	Cliente,
	Equipamento,
	Orcamento,
	OrdemServico,
	ProdutoItem,
	Recibo,
	ServicoItem,
} from "@dominio";
import { brParaIso } from "./datas";

/** Tabelas que o painel sabe gravar. Nome = tabela LOCAL do app. */
export type TabelaOlli =
	| "clientes"
	| "produtos"
	| "servicos"
	| "orcamentos"
	| "recibos"
	| "agendamentos"
	| "ordens_servico"
	| "equipamentos";

/** Nome da tabela no Supabase, quando difere do nome local. */
const TABELA_REMOTA: Partial<Record<TabelaOlli, string>> = {
	equipamentos: "assets",
};

export function tabelaRemota(t: TabelaOlli): string {
	return TABELA_REMOTA[t] ?? t;
}

/** Coluna de conflito do upsert. Todas as tabelas do painel são por `id`. */
export const CONFLITO: Record<TabelaOlli, string> = {
	clientes: "id",
	produtos: "id",
	servicos: "id",
	orcamentos: "id",
	recibos: "id",
	agendamentos: "id",
	ordens_servico: "id",
	equipamentos: "id",
};

/**
 * Tabelas em que um MEMBRO NÃO-DONO grava no tenant do DONO (`user_id = ownerUserId`).
 *
 * Sem isto, o orçamento que o técnico cria nasce com o `user_id` DELE e **o dono
 * nunca o vê** — some em silêncio. `criado_por` (default `auth.uid()`) preserva a
 * autoria. Lista idêntica à do app (cloudSync.ts): `empresa`, `servicos`,
 * `produtos` e `recibos` ficam de FORA — escrita só do dono.
 */
export const TABELAS_DO_TENANT_DO_DONO: ReadonlySet<TabelaOlli> = new Set<TabelaOlli>([
	"clientes",
	"orcamentos",
	"agendamentos",
	"ordens_servico",
	"equipamentos",
]);

/** ID do app = uuid v4 (`src/utils/id.ts`). No navegador, `crypto.randomUUID()` gera o mesmo formato. */
export function novoId(): string {
	return crypto.randomUUID();
}

export function agora(): string {
	return new Date().toISOString();
}

/* ────────────────────────  toRow — cópia literal do app  ──────────────────── */

function clienteToRow(c: Cliente): Record<string, unknown> {
	return {
		id: c.id,
		nome: c.nome,
		telefone: c.telefone ?? null,
		cpf: c.cpf ?? null,
		cnpj: c.cnpj ?? null,
		endereco: c.endereco ?? null,
		complemento: c.complemento ?? null,
		estado: c.estado ?? null,
		cidade: c.cidade ?? null,
		cep: c.cep ?? null,
		criado_em: c.criadoEm,
		excluido_em: c.excluidoEm ?? null,
		atualizado_em: c.atualizadoEm ?? c.criadoEm,
	};
}

function produtoToRow(p: ProdutoItem): Record<string, unknown> {
	return {
		id: p.id,
		nome: p.nome,
		descricao: p.descricao ?? null,
		preco: p.preco,
		custo: p.custo ?? null,
		marca: p.marca ?? null,
		modelo: p.modelo ?? null,
		unidade: p.unidade ?? null,
		foto_uri: p.fotoUri ?? null,
		criado_em: p.criadoEm,
		excluido_em: p.excluidoEm ?? null,
		atualizado_em: p.atualizadoEm ?? p.criadoEm,
	};
}

function servicoToRow(s: ServicoItem): Record<string, unknown> {
	return {
		id: s.id,
		nome: s.nome,
		descricao: s.descricao ?? null,
		preco: s.preco,
		custo: s.custo ?? null,
		unidade: s.unidade ?? null,
		foto_uri: s.fotoUri ?? null,
		criado_em: s.criadoEm,
		excluido_em: s.excluidoEm ?? null,
		atualizado_em: s.atualizadoEm ?? s.criadoEm,
	};
}

function orcamentoToRow(o: Orcamento): Record<string, unknown> {
	return {
		id: o.id,
		numero: o.numero,
		cliente_id: o.clienteId ?? null,
		cliente_nome: o.clienteNome ?? null,
		status: o.status,
		subtotal: o.subtotal ?? null,
		desconto: o.desconto ?? null,
		valor_total: o.valorTotal ?? null,
		data_emissao: o.dataEmissao ?? null,
		// O BLOB é a verdade — o app lê os itens daqui, não das colunas.
		dados: o,
		criado_em: o.criadoEm,
		atualizado_em: o.atualizadoEm,
		excluido_em: o.excluidoEm ?? null,
	};
}

function reciboToRow(r: Recibo): Record<string, unknown> {
	return {
		id: r.id,
		numero: r.numero,
		orcamento_id: r.orcamentoId ?? null,
		cliente_id: r.clienteId ?? null,
		cliente_nome: r.clienteNome ?? null,
		valor_recebido: r.valorRecebido ?? null,
		forma_pagamento: r.formaPagamento ?? null,

		// ⚠️ AQUI O PAINEL DIVERGE DO APP DE PROPÓSITO — e é a única divergência.
		// `r.dataRecebimento` é 'DD/MM/AAAA' (formato do blob). O app manda essa
		// string CRUA para esta coluna, que é `timestamptz`, e o Postgres (DateStyle
		// ISO,MDY) lê como MM/DD: "10/07/2026" vira 7 de OUTUBRO, e dia > 12 faz o
		// upsert INTEIRO falhar — o recibo nunca sobe (bug vivo, confirmado no banco).
		// Convertemos para ISO. O BLOB abaixo continua em DD/MM/AAAA: é o que o app lê.
		data_recebimento: brParaIso(r.dataRecebimento),

		dados: r,
		criado_em: r.criadoEm,
		excluido_em: r.excluidoEm ?? null,
		atualizado_em: r.atualizadoEm ?? r.criadoEm,
	};
}

function agendamentoToRow(a: Agendamento): Record<string, unknown> {
	return {
		id: a.id,
		cliente_id: a.clienteId ?? null,
		cliente_nome: a.clienteNome,
		titulo: a.titulo,
		tipo: a.tipo,
		inicio: a.inicio,
		fim: a.fim ?? null,
		endereco: a.endereco ?? null,
		status: a.status,
		orcamento_id: a.orcamentoId ?? null,
		observacao: a.observacao ?? null,
		criado_em: a.criadoEm,
		atualizado_em: a.atualizadoEm,
		excluido_em: a.excluidoEm ?? null,
	};
}

function ordemServicoToRow(o: OrdemServico): Record<string, unknown> {
	return {
		id: o.id,
		numero: o.numero ?? null,
		orcamento_id: o.orcamentoId ?? null,
		cliente_id: o.clienteId ?? null,
		cliente_nome: o.clienteNome ?? null,
		titulo: o.titulo ?? null,
		descricao: o.descricao ?? null,
		status: o.status,
		tecnico_id: o.tecnicoId ?? null,
		tecnico_nome: o.tecnicoNome ?? null,
		data_agendada: o.dataAgendada ?? null,
		checklist: o.checklist ?? [],
		fotos: o.fotos ?? [],
		observacoes: o.observacoes ?? null,
		valor: o.valor ?? null,
		criado_em: o.criadoEm,
		atualizado_em: o.atualizadoEm,
		excluido_em: o.excluidoEm ?? null,
	};
}

function equipamentoToRow(e: Equipamento): Record<string, unknown> {
	const row: Record<string, unknown> = {
		id: e.id,
		cliente_id: e.clienteId ?? null,
		local_id: e.localId ?? null,
		codigo_interno: e.codigoInterno ?? null,
		patrimonio: e.patrimonio ?? null,
		fabricante: e.fabricante ?? null,
		modelo: e.modelo ?? null,
		numero_serie: e.numeroSerie ?? null,
		categoria: e.categoria ?? null,
		capacidade_btu: e.capacidadeBtu ?? null,
		tensao: e.tensao ?? null,
		refrigerante: e.refrigerante ?? null,
		localizacao: e.localizacao ?? null,
		situacao: e.situacao,
		criticidade: e.criticidade ?? null,
		fotos: e.fotos ?? [],
		criado_em: e.criadoEm,
		atualizado_em: e.atualizadoEm,
		excluido_em: e.excluidoEm ?? null,
	};
	if (e.qrToken) row.qr_token = e.qrToken;
	// `qr_revogado_em` é MONOTÔNICO (só se revoga, nunca se desrevoga): omitir quando
	// vazio impede que um upsert nosso ZERE uma revogação feita no celular — o que
	// reativaria um QR revogado. Regra copiada do app; não "simplificar".
	if (e.qrRevogadoEm) row.qr_revogado_em = e.qrRevogadoEm;
	return row;
}

/** Despachante: objeto de domínio → linha do Supabase. */
// biome-ignore lint/suspicious/noExplicitAny: cada entrada é tipada no uso (ver salvar()).
export const PARA_LINHA: Record<TabelaOlli, (obj: any) => Record<string, unknown>> = {
	clientes: clienteToRow,
	produtos: produtoToRow,
	servicos: servicoToRow,
	orcamentos: orcamentoToRow,
	recibos: reciboToRow,
	agendamentos: agendamentoToRow,
	ordens_servico: ordemServicoToRow,
	equipamentos: equipamentoToRow,
};

/** Mapa tabela → tipo do objeto de domínio (usado para tipar `salvar`). */
export interface DominioPorTabela {
	clientes: Cliente;
	produtos: ProdutoItem;
	servicos: ServicoItem;
	orcamentos: Orcamento;
	recibos: Recibo;
	agendamentos: Agendamento;
	ordens_servico: OrdemServico;
	equipamentos: Equipamento;
}
