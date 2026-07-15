/**
 * ORDENS DE SERVIÇO — linha do Supabase ⇄ objeto de domínio.
 *
 * `ordens_servico` NÃO tem blob `dados`: aqui as colunas SÃO a verdade (diferente
 * de orçamentos/recibos). Ainda assim o painel trabalha com o objeto de DOMÍNIO
 * (`OrdemServico` de `@dominio`) e grava pelo `contrato.ts` — o mesmo caminho do
 * app. Este arquivo é só o mapeamento de VOLTA (linha → domínio), espelho de
 * `rowToOrdemServico` (`src/database/database.ts`, ~linha 1390).
 *
 * `checklist` e `fotos` são jsonb: o PostgREST devolve array pronto. O SQLite do
 * celular guarda como TEXTO json — então aceito os dois formatos, porque a mesma
 * linha pode ter sido escrita por qualquer um dos dois e uma lista corrompida não
 * pode derrubar a listagem inteira.
 */
import type { ItemChecklist, OrdemServico, StatusOS } from "@dominio";
import { supabase } from "@/lib/supabase";

/** Linha crua de `public.ordens_servico` (só as colunas do contrato). */
export interface LinhaOs {
	id: string;
	numero: string | null;
	orcamento_id: string | null;
	cliente_id: string | null;
	cliente_nome: string | null;
	titulo: string | null;
	descricao: string | null;
	status: string;
	tecnico_id: string | null;
	tecnico_nome: string | null;
	data_agendada: string | null;
	checklist: unknown;
	fotos: unknown;
	observacoes: string | null;
	valor: number | null;
	criado_em: string;
	atualizado_em: string;
	excluido_em: string | null;
}

/** Todos os status válidos — derivado do tipo, para validar o que vem do banco. */
const STATUS_VALIDOS: ReadonlySet<string> = new Set<StatusOS>([
	"aberta",
	"agendada",
	"em_execucao",
	"pausada",
	"concluida",
	"cancelada",
]);

/** Status desconhecido (banco novo, app velho) cai em `aberta` em vez de quebrar a tela. */
function paraStatus(v: unknown): StatusOS {
	const s = String(v ?? "");
	return (STATUS_VALIDOS.has(s) ? s : "aberta") as StatusOS;
}

/** jsonb (array) OU texto json (SQLite) → array. Lista ilegível vira vazia, nunca exceção. */
function paraLista(v: unknown): unknown[] {
	if (Array.isArray(v)) return v;
	if (typeof v === "string" && v.trim()) {
		try {
			const parsed = JSON.parse(v);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}
	return [];
}

/** Só itens com a FORMA que o celular sabe ler ({id, texto, feito}). O resto é descartado. */
export function paraChecklist(v: unknown): ItemChecklist[] {
	return paraLista(v).flatMap((item) => {
		if (typeof item !== "object" || item === null) return [];
		const i = item as Partial<ItemChecklist>;
		if (typeof i.id !== "string" || typeof i.texto !== "string") return [];
		return [{ id: i.id, texto: i.texto, feito: i.feito === true }];
	});
}

/** `fotos` são URIs (strings) tiradas no celular. O painel só as CONTA — não faz upload. */
export function paraFotos(v: unknown): string[] {
	return paraLista(v).filter((f): f is string => typeof f === "string");
}

/** Linha → `OrdemServico`. Ausência é `undefined` (o app OMITE a chave; nunca grava null). */
export function linhaParaOs(r: LinhaOs): OrdemServico {
	return {
		id: r.id,
		numero: r.numero ?? "",
		orcamentoId: r.orcamento_id ?? undefined,
		clienteId: r.cliente_id ?? undefined,
		clienteNome: r.cliente_nome ?? "",
		titulo: r.titulo ?? "",
		descricao: r.descricao ?? undefined,
		status: paraStatus(r.status),
		tecnicoId: r.tecnico_id ?? undefined,
		tecnicoNome: r.tecnico_nome ?? undefined,
		dataAgendada: r.data_agendada ?? undefined,
		checklist: paraChecklist(r.checklist),
		fotos: paraFotos(r.fotos),
		observacoes: r.observacoes ?? undefined,
		valor: r.valor ?? undefined,
		criadoEm: r.criado_em,
		atualizadoEm: r.atualizado_em,
		excluidoEm: r.excluido_em ?? undefined,
	};
}

/**
 * Relê a OS DIRETO do banco, na hora de salvar.
 *
 * Sem isto, o painel gravaria o objeto que carregou quando a lista foi montada —
 * e o técnico que tirou 4 fotos e marcou o checklist NO CELULAR nesse meio-tempo
 * perderia tudo, porque o upsert do painel escreve as colunas `fotos`/`checklist`
 * inteiras. Lendo fresco e mesclando SÓ os campos do formulário, o que o painel
 * não edita (fotos, orçamento de origem, excluidoEm) sobrevive.
 *
 * Falha de leitura LANÇA — gravar sem saber o estado atual é o que apaga dado.
 */
export async function carregarOsFresca(id: string): Promise<OrdemServico> {
	const { data, error } = await supabase.from("ordens_servico").select("*").eq("id", id).maybeSingle();
	if (error) throw error;
	if (!data) throw new Error("Esta ordem de serviço não existe mais. Atualize a página.");
	return linhaParaOs(data as LinhaOs);
}
