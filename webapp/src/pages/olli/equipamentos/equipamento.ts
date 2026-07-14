/**
 * EQUIPAMENTOS — traduções e rótulos compartilhados pela lista e pelo formulário.
 *
 * A tabela LOCAL do app se chama `equipamentos`; a REMOTA, `assets` (o `contrato.ts`
 * já traduz o nome). Aqui mora só o que as duas telas precisam em comum:
 * linha do Supabase → objeto de domínio, e os rótulos de exibição.
 *
 * ⚠️ `linhaParaEquipamento` é o espelho de `rowToEquipamentoCloud`
 * (`src/services/cloudSync.ts`, ~linha 455). Ele existe por um motivo específico:
 * EDITAR um equipamento é um UPSERT da linha INTEIRA. Se a tela montasse o objeto
 * só com os campos do formulário, o upsert apagaria `fotos`, `localId`, `qrToken` e
 * `qrRevogadoEm` — que o técnico preencheu no celular. Reidratamos a linha inteira,
 * fazemos merge por cima, e devolvemos tudo.
 */
import type { CategoriaHvac, CriticidadeEquipamento, Equipamento, SituacaoEquipamento } from "@dominio";
import { CATEGORIAS_HVAC } from "@dominio";

/** A linha da tabela `assets` como o Supabase a devolve (snake_case). */
export interface LinhaAsset {
	id: string;
	cliente_id: string | null;
	local_id: string | null;
	codigo_interno: string | null;
	patrimonio: string | null;
	fabricante: string | null;
	modelo: string | null;
	numero_serie: string | null;
	categoria: string | null;
	capacidade_btu: number | null;
	tensao: string | null;
	refrigerante: string | null;
	localizacao: string | null;
	situacao: string | null;
	criticidade: string | null;
	qr_token: string | null;
	qr_revogado_em: string | null;
	fotos: string[] | string | null;
	criado_em: string | null;
	atualizado_em: string | null;
	excluido_em: string | null;
}

/** `fotos` chega como array (jsonb) na nuvem — tolera string JSON por segurança. */
function arrOuParse(v: string[] | string | null): string[] {
	if (Array.isArray(v)) return v;
	if (typeof v === "string" && v.trim()) {
		try {
			const p = JSON.parse(v);
			return Array.isArray(p) ? p : [];
		} catch {
			return [];
		}
	}
	return [];
}

/** Linha `assets` → `Equipamento`. Espelho de `rowToEquipamentoCloud` do app. */
export function linhaParaEquipamento(row: LinhaAsset): Equipamento {
	const agora = new Date().toISOString();
	return {
		id: row.id,
		clienteId: row.cliente_id ?? undefined,
		localId: row.local_id ?? undefined,
		codigoInterno: row.codigo_interno ?? undefined,
		patrimonio: row.patrimonio ?? undefined,
		fabricante: row.fabricante ?? undefined,
		modelo: row.modelo ?? undefined,
		numeroSerie: row.numero_serie ?? undefined,
		categoria: row.categoria ?? undefined,
		capacidadeBtu: row.capacidade_btu ?? undefined,
		tensao: row.tensao ?? undefined,
		refrigerante: row.refrigerante ?? undefined,
		localizacao: row.localizacao ?? undefined,
		situacao: (row.situacao ?? "ativo") as SituacaoEquipamento,
		criticidade: (row.criticidade ?? undefined) as CriticidadeEquipamento | undefined,
		// Token do QR: vem do banco (DEFAULT). A web só PRESERVA — nunca gera.
		qrToken: row.qr_token ?? "",
		qrRevogadoEm: row.qr_revogado_em ?? undefined,
		fotos: arrOuParse(row.fotos),
		criadoEm: row.criado_em ?? agora,
		atualizadoEm: row.atualizado_em ?? row.criado_em ?? agora,
		excluidoEm: row.excluido_em ?? undefined,
	};
}

/* ────────────────────────────────  Rótulos  ────────────────────────────────── */

/** Rótulo da categoria. `categoria` é TEXTO LIVRE no banco: se não for do catálogo,
 *  mostramos o valor cru em vez de "—" (esconder o que está gravado seria mentir). */
export function rotuloCategoria(id?: string): string {
	if (!id) return "";
	return CATEGORIAS_HVAC.find((c) => c.id === id)?.label ?? id;
}

/** "9.000 BTU" — vazio quando ausente/inválido. Espelha `formatarBtu` do app. */
export function formatarBtu(v?: number): string {
	if (typeof v !== "number" || Number.isNaN(v) || v <= 0) return "";
	return `${v.toLocaleString("pt-BR")} BTU`;
}

/**
 * Nome de exibição: fabricante + modelo; senão a categoria; senão "Equipamento".
 * Cópia de `nomeEquipamento` (EquipamentosDesktopScreen.tsx:91) — o mesmo ativo tem
 * que se chamar a mesma coisa no celular e no painel.
 */
export function nomeEquipamento(e: Equipamento): string {
	return [e.fabricante, e.modelo].filter(Boolean).join(" ") || rotuloCategoria(e.categoria) || "Equipamento";
}

/** Linha secundária: "Split · 9.000 BTU". Cópia de `subEquipamento` do app. */
export function subEquipamento(e: Equipamento): string {
	return [rotuloCategoria(e.categoria), formatarBtu(e.capacidadeBtu)].filter(Boolean).join(" · ");
}

/** Criticidade — mesmos rótulos de `criarCriticidades` (EquipamentosDesktopScreen.tsx:62). */
export const CRITICIDADES: { id: CriticidadeEquipamento; label: string }[] = [
	{ id: "baixa", label: "Baixa" },
	{ id: "media", label: "Média" },
	{ id: "alta", label: "Alta" },
	{ id: "critica", label: "Crítica" },
];

export const CATEGORIAS: { id: CategoriaHvac; label: string }[] = CATEGORIAS_HVAC.map((c) => ({
	id: c.id,
	label: c.label,
}));

/**
 * Sugestões de tensão e refrigerante.
 *
 * ⚠️ SÃO SUGESTÕES, NÃO UMA LISTA FECHADA — e a grafia é a do APP, de propósito.
 * As duas colunas são TEXTO LIVRE (`tensao text`, `refrigerante text` na migration),
 * e o app do celular grava o que o técnico digita, com os exemplos "220V, 380V
 * trifásico" e "R410A, R32" (EquipamentoScreen.tsx:1063-1064).
 *
 * Se o painel gravasse "220" e "R-410A", a MESMA tensão e o MESMO gás passariam a
 * existir com duas grafias na mesma coluna — e qualquer contagem por gás (que é
 * exatamente o que o PMOC exige) contaria errado. Por isso: campo livre + sugestões
 * escritas como o celular escreve.
 */
export const TENSOES_SUGERIDAS = ["110V", "220V", "380V trifásico"];
export const REFRIGERANTES_SUGERIDOS = ["R410A", "R32", "R22", "R134A"];
