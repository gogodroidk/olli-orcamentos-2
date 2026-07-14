/**
 * A EQUIPE — quem pode ser atribuído a uma Ordem de Serviço.
 *
 * Fonte: `organizacao_membros` (a RLS já limita às linhas da minha org). Quando a
 * view `organizacao_membros_perfil` existe, ela traz nome/e-mail — é o mesmo
 * caminho (view primeiro, tabela como plano B) que o app usa em
 * `src/services/equipe.ts:listarMembros`.
 *
 * ⚠️ ERRO ≠ "SEM EQUIPE" (bug crônico da casa). `listarMembros` do app engole a
 * falha e devolve `[]`; aqui NÃO: uma consulta que falhou LANÇA, e a tela mostra
 * "não consegui carregar a equipe" com "Tentar de novo". Se colapsássemos erro em
 * lista vazia, o formulário diria "você não tem equipe" para quem tem cinco
 * técnicos — e a OS seria salva sem responsável.
 *
 * Lista vazia só existe quando a consulta DEU CERTO e não há ninguém (conta
 * pessoal, sem organização).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Membro {
	userId: string;
	/** Já resolvido para exibição E para gravar em `tecnicoNome` (o celular lê essa string). */
	nome: string;
	papel: string;
}

/** Papel legível — o mesmo vocabulário da tela de Equipe do app. */
export const PAPEL_ROTULO: Record<string, string> = {
	owner: "Dono",
	admin: "Administrador",
	gestor: "Gestor",
	tecnico: "Técnico",
};

/** Técnicos primeiro (são os que executam), depois o resto — dentro de cada grupo, por nome. */
const PESO_PAPEL: Record<string, number> = { tecnico: 0, gestor: 1, admin: 2, owner: 3 };

interface LinhaMembro {
	user_id: string;
	papel: string | null;
	nome?: string | null;
	email?: string | null;
}

function paraMembro(r: LinhaMembro): Membro {
	// Sem nome nem e-mail, ainda assim é preciso um rótulo estável: `tecnicoNome` vai
	// para a tela do celular, e "undefined" lá é pior do que "Membro 3f2a…".
	const nome = r.nome?.trim() || r.email?.trim() || `Membro ${r.user_id.slice(0, 8)}`;
	return { userId: r.user_id, nome, papel: r.papel ?? "tecnico" };
}

function ordenar(membros: Membro[]): Membro[] {
	return [...membros].sort((a, b) => {
		const pa = PESO_PAPEL[a.papel] ?? 9;
		const pb = PESO_PAPEL[b.papel] ?? 9;
		return pa !== pb ? pa - pb : a.nome.localeCompare(b.nome, "pt-BR");
	});
}

export function useTecnicos() {
	return useQuery({
		queryKey: ["olli", "equipe", "membros-ativos"],
		queryFn: async (): Promise<Membro[]> => {
			const { data: sessao, error: erroSessao } = await supabase.auth.getUser();
			if (erroSessao) throw erroSessao;
			const meuId = sessao.user?.id;
			if (!meuId) throw new Error("Sua sessão expirou. Entre de novo.");

			// `limit(1)` (e não `maybeSingle`): o schema garante UNIQUE(org_id,user_id),
			// não UNIQUE(user_id) — estar em duas orgs faria o maybeSingle ERRAR, e o
			// erro viraria "sem equipe". Mesma escolha do app (equipe.ts).
			const { data: minhas, error } = await supabase
				.from("organizacao_membros")
				.select("org_id")
				.eq("user_id", meuId)
				.eq("ativo", true)
				.limit(1);
			if (error) throw error;

			const orgId = (minhas?.[0] as { org_id?: string } | undefined)?.org_id;
			// Consultou e não é membro de nada = conta pessoal. Vazio DE VERDADE.
			if (!orgId) return [];

			// Caminho rico: a view traz nome/e-mail. Ela é opcional no schema — se não
			// existir, o PostgREST devolve erro de relação, e aí caímos na tabela. Só
			// esse fallback é silencioso; a falha da TABELA (abaixo) lança.
			const view = await supabase
				.from("organizacao_membros_perfil")
				.select("user_id, papel, ativo, nome, email")
				.eq("org_id", orgId)
				.eq("ativo", true);
			if (!view.error && Array.isArray(view.data)) {
				return ordenar((view.data as LinhaMembro[]).map(paraMembro));
			}

			const { data, error: erroTabela } = await supabase
				.from("organizacao_membros")
				.select("user_id, papel, ativo")
				.eq("org_id", orgId)
				.eq("ativo", true);
			if (erroTabela) throw erroTabela;
			return ordenar((data as LinhaMembro[] | null)?.map(paraMembro) ?? []);
		},
		staleTime: 5 * 60_000,
	});
}
