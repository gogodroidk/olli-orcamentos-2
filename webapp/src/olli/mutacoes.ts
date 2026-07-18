/**
 * GRAVAÇÃO (criar / editar / excluir) — a camada que faltava no painel.
 *
 * Três travas, todas por um motivo já sofrido neste projeto:
 *
 * 1. CONTRATO — grava pelo `PARA_LINHA` de `contrato.ts` (espelho do app), então o
 *    blob `dados` sai completo e o app do celular consegue ler o que o painel criou.
 *
 * 2. TENANT — se quem grava é um MEMBRO NÃO-DONO, a linha nasce no tenant do DONO.
 *    E se não der pra SABER o papel (rede caiu, RLS negou), a gravação é BLOQUEADA
 *    em vez de "chutar dono": chutar errado faz o registro nascer invisível para a
 *    empresa e sumir em silêncio. Erro nunca vira suposição.
 *
 * 3. SOFT DELETE — excluir é carimbar `excluidoEm` (no blob) + `excluido_em` (coluna).
 *    Apagar de verdade ressuscitaria o registro no próximo sync do celular.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
	agora,
	CONFLITO,
	type DominioPorTabela,
	PARA_LINHA,
	TABELAS_DO_TENANT_DO_DONO,
	type TabelaOlli,
	tabelaRemota,
} from "./contrato";

/* ─────────────────────────  1. Contexto de escrita (tenant)  ───────────────── */

export interface ContextoDeEscrita {
	/** `null` = conta pessoal / dono → grava no próprio tenant (default `auth.uid()`). */
	ownerUserId: string | null;
	papel: string;
}

/**
 * Descobre em QUAL tenant este usuário deve gravar.
 *
 * Regra idêntica à do app (`cloudSync.ts`): membro com papel != 'owner' grava no
 * tenant do dono da organização. Sem membresia = conta pessoal = próprio tenant.
 *
 * A query pode falhar — e nesse caso o hook fica em `isError`. Quem grava é
 * obrigado a checar (ver `useSalvar`): sem resposta, não grava.
 */
export function useContextoDeEscrita() {
	return useQuery({
		queryKey: ["olli", "contexto-escrita"],
		queryFn: async (): Promise<ContextoDeEscrita> => {
			const { data: sessao } = await supabase.auth.getUser();
			const meuId = sessao.user?.id;
			if (!meuId) throw new Error("Sessão não encontrada.");

			// RLS já restringe as linhas às minhas. NÃO usamos `maybeSingle`: um usuário
			// pode ser membro de DUAS organizações, e aí `maybeSingle` lançaria erro e
			// BLOQUEARIA toda gravação dele. Pegamos a membresia mais ANTIGA (determinístico,
			// igual ao app). Conta pessoal (sem organização) simplesmente não tem linha.
			const { data: membros, error } = await supabase
				.from("organizacao_membros")
				.select("org_id, papel, ativo")
				.eq("user_id", meuId)
				.eq("ativo", true)
				.order("criado_em", { ascending: true })
				.limit(1);
			if (error) throw error;
			const membro = membros?.[0];

			if (!membro || membro.papel === "owner") {
				return { ownerUserId: null, papel: membro?.papel ?? "pessoal" };
			}

			const { data: org, error: erroOrg } = await supabase
				.from("organizacoes")
				.select("owner_user_id")
				.eq("id", membro.org_id)
				.maybeSingle();
			if (erroOrg) throw erroOrg;
			if (!org?.owner_user_id) {
				// Sou membro não-dono mas não achei o dono: gravar aqui criaria a linha
				// no MEU tenant e a empresa nunca a veria. Falhar alto é o certo.
				throw new Error("Não foi possível identificar o dono da sua organização.");
			}
			return { ownerUserId: org.owner_user_id as string, papel: membro.papel as string };
		},
		staleTime: 5 * 60_000,
		retry: 1,
	});
}

/* ─────────────────────────────  2. Numeração  ──────────────────────────────── */

/**
 * Extrai o SEQUENCIAL de um número de documento. O formato é
 * `<seq><aa>` (orçamento `00126` = seq 1 + ano 26) ou `REC-<seq><aa>`
 * (recibo `REC-00126`): o sequencial é TUDO menos os 2 últimos dígitos (o ano).
 * Devolve 0 para número ausente/legado sem o formato esperado.
 */
function extrairSequencia(numero: unknown): number {
	const bruto = String(numero ?? "").replace(/^REC-/i, "");
	const m = /(\d+)(\d{2})\s*$/.exec(bruto);
	return m ? Number(m[1]) : 0;
}

/**
 * Próximo número de ORÇAMENTO (`00126` = sequencial 3+ dígitos + ano 2 dígitos) ou
 * de RECIBO (`REC-00126`).
 *
 * Por que NÃO lemos mais a tabela `contadores`: aquele contador tem RLS owner-only
 * e é por-USUÁRIO — dono e membro (ou duas abas) mantinham contadores separados sobre
 * o MESMO conjunto e emitiam o MESMO número num documento que vai pro cliente. Além
 * disso o ciclo select→upsert não era atômico. Aqui derivamos o próximo do MAIOR
 * sequencial entre os documentos VISÍVEIS ao tenant — mesma técnica de `proximoNumeroOs`,
 * imune ao split-brain por-usuário e compartilhada por toda a equipe (o RLS já mostra
 * ao membro os documentos do dono).
 *
 * INCLUI a lixeira (sem filtro de `excluido_em`): um documento apagado NÃO pode liberar
 * o número, senão dois documentos diferentes acabariam com o mesmo `00126`.
 *
 * O APP FAZ O MESMO (desde `proximoNaSequencia` em `src/database/database.ts`). Isso
 * não era verdade: o celular numerava só pelo contador local, que não enxerga o
 * documento criado AQUI — o painel emitia o 004 por MAX+1 sem tocar em `contadores`,
 * e o celular, ainda no contador 3, emitia outro 004. Hoje o app tira o número de
 * `MAX(contador local, maior sequencial nos documentos) + 1`, sobre o SQLite que é
 * espelho desta base: mesma fonte (os documentos), com o contador só como piso
 * monotônico para o número já reservado num formulário aberto. A colisão que sobra é
 * a de dois criadores simultâneos com um deles offline — arbitrável só no banco (ver
 * `supabase/migrations/20260727_numero_unico_por_tenant.sql.pendente`, passo humano
 * — a extensão trava a aplicação automática, o próprio arquivo diz o porquê).
 *
 * Ordenamos por `criado_em` desc: como o sequencial só cresce, o documento mais recente
 * carrega o maior número — então, mesmo se o PostgREST capar a resposta em ~1000 linhas,
 * a página devolvida (as mais recentes) já contém o máximo real, sem duplicar.
 *
 * ⚠️ Chame só NA HORA DE SALVAR — nunca ao abrir o formulário.
 */
export async function proximoNumeroDocumento(chave: "orcamento" | "recibo"): Promise<string> {
	const tabela = chave === "orcamento" ? "orcamentos" : "recibos";

	// Teto de linhas do PostgREST (~1000). Ordenado por `criado_em` desc, as mais
	// recentes vêm primeiro — e o maior número está entre elas (sequencial monotônico).
	const { data, error } = await supabase
		.from(tabela)
		.select("numero")
		.order("criado_em", { ascending: false })
		.limit(1000);
	if (error) throw error;

	const maior = (data ?? []).reduce((max, linha) => {
		return Math.max(max, extrairSequencia((linha as { numero?: string }).numero));
	}, 0);

	const proximo = maior + 1;
	const ano = new Date().getFullYear().toString().slice(-2);
	const sufixo = `${String(proximo).padStart(3, "0")}${ano}`;
	return chave === "recibo" ? `REC-${sufixo}` : sufixo;
}

/**
 * Próximo número de ORDEM DE SERVIÇO — `OS-0001`.
 *
 * A OS NÃO usa `contadores`: o app deriva do MAIOR sufixo numérico já existente em
 * `ordens_servico`, **incluindo as excluídas**. Se ignorássemos a lixeira, uma OS
 * apagada liberaria o número e duas OS diferentes acabariam com o mesmo `OS-0007`
 * — em documento que vai pro cliente.
 *
 * Mesma técnica de `proximoNumeroDocumento`: sem `.order()`/`.limit()`, o PostgREST
 * corta a resposta em ~1000 linhas e, passado esse volume de OS, o "maior sufixo"
 * calculado sobre um recorte arbitrário fica menor que o real — duas OS nascem com
 * o mesmo número. Ordenamos por `criado_em` desc (o sequencial só cresce, então a
 * OS mais recente carrega o maior número) e limitamos a 1000: mesmo cortada, a
 * página devolvida já contém o máximo real.
 */
export async function proximoNumeroOs(): Promise<string> {
	const { data, error } = await supabase
		.from("ordens_servico")
		.select("numero")
		.order("criado_em", { ascending: false })
		.limit(1000);
	if (error) throw error;

	const maior = (data ?? []).reduce((max, linha) => {
		const m = /(\d+)\s*$/.exec(String((linha as { numero?: string }).numero ?? ""));
		return m ? Math.max(max, Number(m[1])) : max;
	}, 0);

	return `OS-${String(maior + 1).padStart(4, "0")}`;
}

/* ───────────────────────────  3. Salvar e excluir  ─────────────────────────── */

/** Invalida tudo que a tela possa estar mostrando daquela tabela. */
function useInvalidar() {
	const qc = useQueryClient();
	return (tabela: TabelaOlli) => {
		const remota = tabelaRemota(tabela);
		qc.invalidateQueries({ queryKey: ["olli", remota] });
		qc.invalidateQueries({ queryKey: ["olli-count", remota] });
		qc.invalidateQueries({ queryKey: ["olli", "resumo"] });
	};
}

/**
 * Cria OU atualiza (upsert por `id`). O objeto recebido é o de DOMÍNIO completo —
 * é ele que vai para o blob `dados`, não um subconjunto.
 */
export function useSalvar<T extends TabelaOlli>(tabela: T) {
	const invalidar = useInvalidar();
	const contexto = useContextoDeEscrita();

	return useMutation({
		mutationFn: async (objeto: DominioPorTabela[T]) => {
			// TRAVA DO TENANT: sem saber o papel, não grava (ver cabeçalho do arquivo).
			if (contexto.isLoading) throw new Error("Carregando seu perfil… tente de novo em um instante.");
			if (contexto.isError || !contexto.data) {
				throw new Error(
					"Não consegui confirmar a qual empresa este registro pertence. Recarregue a página e tente de novo.",
				);
			}

			const linha = PARA_LINHA[tabela](objeto);
			const { ownerUserId } = contexto.data;
			if (ownerUserId && TABELAS_DO_TENANT_DO_DONO.has(tabela)) {
				linha.user_id = ownerUserId;
			}

			const { error } = await supabase.from(tabelaRemota(tabela)).upsert(linha, { onConflict: CONFLITO[tabela] });
			if (error) throw error;
			return objeto;
		},
		onSuccess: () => invalidar(tabela),
	});
}

/**
 * Exclui (soft delete). Carimba `excluidoEm` DENTRO do objeto e reaproveita o
 * `salvar` — assim a coluna-espelho `excluido_em` e o blob ficam coerentes. Se
 * gravássemos só a coluna, o app do celular (que lê o blob) continuaria mostrando
 * o registro como ativo.
 */
export function useExcluir<T extends TabelaOlli>(tabela: T) {
	const salvar = useSalvar(tabela);
	return useMutation({
		mutationFn: async (objeto: DominioPorTabela[T]) => {
			const carimbado = { ...objeto, excluidoEm: agora(), atualizadoEm: agora() } as DominioPorTabela[T];
			return salvar.mutateAsync(carimbado);
		},
	});
}
