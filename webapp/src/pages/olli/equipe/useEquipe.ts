/**
 * EQUIPE — leitura da própria organização e dos membros dela.
 *
 * Fonte: `organizacao_membros` (RLS já limita às linhas da MINHA org). Quando a
 * view `organizacao_membros_perfil` existe, ela também traz nome/e-mail — mesmo
 * caminho (view primeiro, tabela como plano B) usado no app mobile
 * (src/services/equipe.ts:listarMembros) e na tela de Ordens de Serviço
 * (useTecnicos.ts).
 *
 * ⚠️ ERRO ≠ "SEM EQUIPE". Uma consulta que falhou LANÇA — a tela mostra "não
 * consegui carregar" com "Tentar de novo". Lista vazia só existe quando a
 * consulta deu certo e a conta é pessoal (sem organização).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type Papel = "owner" | "admin" | "gestor" | "tecnico";

export const PAPEL_LABEL: Record<Papel, string> = {
	owner: "Dono",
	admin: "Administrador",
	gestor: "Gestor",
	tecnico: "Técnico",
};

/** Peso para ordenar: dono e admins primeiro, depois gestor/técnico por nome. */
const PESO_PAPEL: Record<Papel, number> = { owner: 0, admin: 1, gestor: 2, tecnico: 3 };

export interface MembroEquipe {
	userId: string;
	papel: Papel;
	ativo: boolean;
	criadoEm?: string;
	nome?: string;
	email?: string;
	/** Sou eu mesmo — para não mostrar ações contra a própria conta, se um dia houver. */
	souEu: boolean;
}

export interface MinhaEquipe {
	/** `null` = conta pessoal de verdade (consultou e não há organização). */
	orgId: string | null;
	orgNome: string | null;
	membros: MembroEquipe[];
}

function normalizarPapel(v: unknown): Papel {
	return v === "owner" || v === "admin" || v === "gestor" || v === "tecnico" ? v : "tecnico";
}

interface LinhaMembro {
	user_id: string;
	papel: string | null;
	ativo: boolean | null;
	criado_em?: string | null;
	nome?: string | null;
	email?: string | null;
}

function paraMembro(r: LinhaMembro, meuId: string): MembroEquipe {
	return {
		userId: r.user_id,
		papel: normalizarPapel(r.papel),
		ativo: r.ativo !== false,
		criadoEm: typeof r.criado_em === "string" ? r.criado_em : undefined,
		nome: r.nome?.trim() || undefined,
		email: r.email?.trim() || undefined,
		souEu: r.user_id === meuId,
	};
}

function ordenar(membros: MembroEquipe[]): MembroEquipe[] {
	return [...membros].sort((a, b) => {
		const pa = PESO_PAPEL[a.papel] ?? 9;
		const pb = PESO_PAPEL[b.papel] ?? 9;
		if (pa !== pb) return pa - pb;
		const na = a.nome || a.email || "";
		const nb = b.nome || b.email || "";
		return na.localeCompare(nb, "pt-BR");
	});
}

export function useEquipe() {
	return useQuery({
		queryKey: ["olli", "equipe", "minha-equipe"],
		queryFn: async (): Promise<MinhaEquipe> => {
			const { data: sessao, error: erroSessao } = await supabase.auth.getUser();
			if (erroSessao) throw erroSessao;
			const meuId = sessao.user?.id;
			if (!meuId) throw new Error("Sua sessão expirou. Entre de novo para ver a equipe.");

			// `limit(1)` (não `maybeSingle`): o schema garante UNIQUE(org_id,user_id),
			// não UNIQUE(user_id) — estar em duas orgs faria o maybeSingle ERRAR.
			const { data: minhas, error } = await supabase
				.from("organizacao_membros")
				.select("org_id")
				.eq("user_id", meuId)
				.eq("ativo", true)
				.limit(1);
			if (error) throw error;

			const orgId = (minhas?.[0] as { org_id?: string } | undefined)?.org_id;
			// Consultou e não é membro de nada = conta pessoal. Vazio DE VERDADE.
			if (!orgId) return { orgId: null, orgNome: null, membros: [] };

			let orgNome: string | null = null;
			const org = await supabase.from("organizacoes").select("nome").eq("id", orgId).limit(1);
			if (!org.error && Array.isArray(org.data) && org.data[0]) {
				orgNome = (org.data[0] as { nome?: string }).nome?.trim() || null;
			}

			// Caminho rico: a view traz nome/e-mail. Opcional no schema — se não
			// existir, o PostgREST devolve erro de relação e caímos na tabela.
			const view = await supabase
				.from("organizacao_membros_perfil")
				.select("user_id, papel, ativo, criado_em, nome, email")
				.eq("org_id", orgId);
			if (!view.error && Array.isArray(view.data)) {
				return {
					orgId,
					orgNome,
					membros: ordenar((view.data as LinhaMembro[]).map((r) => paraMembro(r, meuId))),
				};
			}

			const { data, error: erroTabela } = await supabase
				.from("organizacao_membros")
				.select("user_id, papel, ativo, criado_em")
				.eq("org_id", orgId);
			if (erroTabela) throw erroTabela;
			return {
				orgId,
				orgNome,
				membros: ordenar((data as LinhaMembro[] | null)?.map((r) => paraMembro(r, meuId)) ?? []),
			};
		},
		staleTime: 60_000,
	});
}
