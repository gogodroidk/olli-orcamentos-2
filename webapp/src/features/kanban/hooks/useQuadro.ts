/**
 * O QUADRO DE VERDADE — dado real do Supabase, escrita real no Supabase.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
 * ═══════════════════════════════════════════════════════════════════════════════
 * O quadro antigo era um store Zustand com orçamentos inventados: arrastar não
 * gravava nada e o F5 desfazia tudo. Um quadro que finge salvar é PIOR do que não
 * ter quadro — o dono move "Aprovado" e acha que o funil andou.
 *
 * Três regras não-negociáveis na hora de mudar o status:
 *
 * 1. RELEIA O BLOB ANTES DE ESCREVER. `orcamentos.dados` (jsonb) guarda o objeto
 *    de domínio INTEIRO — itens, fotos, assinaturas, sinal. A lista do quadro tem
 *    `staleTime` de 30s: se o técnico mexeu no orçamento pelo celular há 1 minuto e
 *    nós gravássemos o blob do CACHE, o trabalho dele seria sobrescrito (lost
 *    update). Por isso relemos a linha por `id` na hora do clique.
 *
 * 2. GRAVE O OBJETO INTEIRO, NÃO A COLUNA. Um `update({status})` só na coluna-espelho
 *    deixaria o blob com o status VELHO — e o celular lê o blob. O app mostraria
 *    "Enviado" para sempre num orçamento que o painel aprovou. Aqui: carrega o blob,
 *    troca o `status`, carimba `atualizadoEm` e manda o objeto completo pelo
 *    `useSalvar` (que passa pelo `contrato.ts` e reescreve blob + espelhos juntos).
 *
 * 3. SEM BLOB, NÃO GRAVA. Se a linha vier sem `dados`, montar um Orcamento do zero
 *    a partir das 6 colunas do quadro apagaria itens/fotos/assinatura. Preferimos
 *    falhar alto, explicando, a corromper o documento do cliente.
 *
 * O update é OTIMISTA (o card pula de coluna na hora) com ROLLBACK POR CARD — se o
 * servidor recusar, aquele card volta para a coluna de origem e o erro aparece.
 */

import type { Orcamento, StatusOrcamento } from "@dominio";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useOlliList } from "@/olli/data";
import { agoraIso } from "@/olli/datas";
import { useSalvar } from "@/olli/mutacoes";
import { type Cartao, type LinhaOrcamento, montarColunas, rotuloDoStatus } from "../utils/colunas";

/**
 * Opções da lista. Constante de módulo DE PROPÓSITO: é a mesma referência que vira
 * a `queryKey` no `useOlliList`, então o cache que lemos/escrevemos aqui é
 * exatamente o que a tela está mostrando. Recriar esse objeto a cada render criaria
 * uma chave nova e o update otimista escreveria num cache que ninguém lê.
 */
const OPCOES_LISTA = { orderBy: "atualizado_em", ascending: false };
const CHAVE_LISTA = ["olli", "orcamentos", OPCOES_LISTA];

function mensagemDoErro(e: unknown): string {
	if (e instanceof Error && e.message) return e.message;
	if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
	return "Erro desconhecido ao falar com o servidor.";
}

export function useQuadro() {
	const qc = useQueryClient();
	const lista = useOlliList<LinhaOrcamento>("orcamentos", OPCOES_LISTA);
	const salvar = useSalvar("orcamentos");

	/** Ids com gravação em voo — o card fica travado (não some, não vira placeholder). */
	const [emVoo, setEmVoo] = useState<ReadonlySet<string>>(() => new Set());
	/** Último erro de movimentação, para o aviso fixo no topo (o toast some sozinho). */
	const [erro, setErro] = useState<string | null>(null);

	const colunas = useMemo(() => montarColunas(lista.data ?? []), [lista.data]);
	const total = lista.data?.length ?? 0;

	/** Mexe UM card no cache. Rollback por card (e não snapshot do quadro inteiro)
	 *  para que uma falha aqui não desfaça outra movimentação bem-sucedida ao lado. */
	const remendar = useCallback(
		(id: string, patch: Partial<LinhaOrcamento>) => {
			qc.setQueryData<LinhaOrcamento[]>(CHAVE_LISTA, (velho) =>
				velho ? velho.map((l) => (l.id === id ? { ...l, ...patch } : l)) : velho,
			);
		},
		[qc],
	);

	const mutacao = useMutation({
		mutationFn: async ({ cartao, novoStatus }: { cartao: Cartao; novoStatus: StatusOrcamento }) => {
			// 1. RELÊ O BLOB FRESCO (ver regra 1 no cabeçalho).
			const { data, error } = await supabase.from("orcamentos").select("dados").eq("id", cartao.id).maybeSingle();
			if (error) throw error;

			const blob = data?.dados as Orcamento | null | undefined;
			if (!blob || typeof blob !== "object") {
				// Regra 3: erro NUNCA vira suposição.
				throw new Error(
					"Este orçamento está sem os dados completos no servidor. Abra-o no aplicativo e salve uma vez antes de mudar o status por aqui.",
				);
			}

			// 2. OBJETO INTEIRO: blob completo + status novo + carimbo.
			const atualizado: Orcamento = { ...blob, status: novoStatus, atualizadoEm: agoraIso() };
			await salvar.mutateAsync(atualizado);
			return atualizado;
		},
	});

	/**
	 * Move um card. Otimista: o card pula de coluna antes da rede responder; se der
	 * erro, volta para onde estava e o motivo aparece (banner + toast).
	 */
	const mover = useCallback(
		async (cartao: Cartao, novoStatus: StatusOrcamento) => {
			if (cartao.status === novoStatus || emVoo.has(cartao.id)) return;

			const anterior: Partial<LinhaOrcamento> = {
				status: cartao.linha.status,
				atualizado_em: cartao.linha.atualizado_em,
				dados: cartao.linha.dados,
			};

			// Um refetch em voo poderia aterrissar DEPOIS do nosso patch e ressuscitar o
			// status velho — cancelar antes é o que impede o card de "voltar sozinho".
			await qc.cancelQueries({ queryKey: CHAVE_LISTA });

			const carimbo = agoraIso();
			remendar(cartao.id, {
				status: novoStatus,
				atualizado_em: carimbo,
				dados: cartao.linha.dados ? { ...cartao.linha.dados, status: novoStatus, atualizadoEm: carimbo } : null,
			});
			setEmVoo((s) => new Set(s).add(cartao.id));
			setErro(null);

			try {
				await mutacao.mutateAsync({ cartao, novoStatus });
				// Sucesso: o `useSalvar` invalida a lista e o refetch traz a verdade do
				// servidor por cima do nosso palpite. Nada a "confirmar" aqui.
				toast.success(`${cartao.numero} → ${rotuloDoStatus(novoStatus)}`);
			} catch (e) {
				const msg = mensagemDoErro(e);
				if (qc.getQueryData<LinhaOrcamento[]>(CHAVE_LISTA)) remendar(cartao.id, anterior);
				else qc.invalidateQueries({ queryKey: CHAVE_LISTA });
				setErro(`Não consegui mover o orçamento ${cartao.numero}. ${msg}`);
				toast.error("Não consegui mover o orçamento", { description: msg });
			} finally {
				setEmVoo((s) => {
					const n = new Set(s);
					n.delete(cartao.id);
					return n;
				});
			}
		},
		[emVoo, mutacao, qc, remendar],
	);

	return {
		colunas,
		total,
		isLoading: lista.isLoading,
		isError: lista.isError,
		error: lista.error,
		refetch: lista.refetch,
		mover,
		emVoo,
		erro,
		limparErro: useCallback(() => setErro(null), []),
	};
}
