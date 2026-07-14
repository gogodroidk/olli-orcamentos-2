/**
 * LEITURA DOS RECIBOS — e a coluna que não se pode ler.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠️ `recibos.data_recebimento` ESTÁ CORROMPIDA NO BANCO. NÃO LEIA DELA.
 * ═══════════════════════════════════════════════════════════════════════════════
 * O app do celular joga a string 'DD/MM/AAAA' do blob DIRETO nessa coluna, que é
 * `timestamptz`. O Postgres do projeto está em DateStyle=ISO,MDY, então "10/07/2026"
 * (10 de julho) foi gravado como 7 de OUTUBRO — dia e mês trocados. Toda linha antiga
 * está assim. Ler a coluna e mostrar na tela entregaria ao dono uma data errada num
 * documento financeiro, com cara de verdade.
 *
 * A VERDADE É O BLOB (`dados.dataRecebimento`, em DD/MM/AAAA). É de lá que a tela lê.
 * (Escrever é outra história: `contrato.ts` já converte para ISO ao gravar a coluna —
 * o que a gente grava daqui pra frente fica certo.)
 *
 * O blob também é a única fonte dos `itens` — as colunas nem os têm.
 */
import type { Orcamento, Recibo } from "@dominio";
import { useOlliList } from "@/olli/data";

/**
 * Linha da tabela `recibos`. As colunas de cima são ESPELHOS; `dados` é o objeto de
 * domínio inteiro. `data_recebimento` está aqui só para deixar registrado que existe
 * — e que ninguém deve tocá-la (ver cabeçalho).
 */
export interface LinhaRecibo {
	id: string;
	numero: string | null;
	orcamento_id: string | null;
	cliente_id: string | null;
	cliente_nome: string | null;
	valor_recebido: number | null;
	forma_pagamento: string | null;
	/** ⚠️ CORROMPIDA. Nunca use. Existe para documentar o perigo. */
	data_recebimento: string | null;
	dados: Recibo | null;
	criado_em: string;
}

/** Linha da tabela `orcamentos` — de novo, `dados` é a verdade (os itens vivem lá). */
export interface LinhaOrcamento {
	id: string;
	numero: string | null;
	cliente_nome: string | null;
	status: string | null;
	valor_total: number | null;
	dados: Orcamento | null;
	criado_em: string;
}

/**
 * O objeto de domínio da linha. `null` quando o blob não veio (não deveria acontecer
 * — `dados` é NOT NULL) — e nesse caso a tela mostra a linha em modo degradado, com
 * as ações travadas. O que ela NÃO faz é reconstruir um Recibo a partir das colunas:
 * viria sem `itens` e com a data errada, e um salvar por cima apagaria o resto.
 */
export function reciboDaLinha(l: LinhaRecibo): Recibo | null {
	const b = l.dados;
	return b && typeof b === "object" && typeof b.id === "string" ? b : null;
}

export function orcamentoDaLinha(l: LinhaOrcamento): Orcamento | null {
	const b = l.dados;
	return b && typeof b === "object" && typeof b.id === "string" ? b : null;
}

/** Todos os recibos ativos (a lixeira já sai fora no `useOlliList`), mais novos primeiro. */
export function useRecibos() {
	return useOlliList<LinhaRecibo>("recibos", { orderBy: "criado_em", ascending: false });
}

/** Todos os orçamentos ativos — para o seletor "receber de um orçamento". */
export function useOrcamentos() {
	return useOlliList<LinhaOrcamento>("orcamentos", { orderBy: "criado_em", ascending: false });
}

/** Status em que um orçamento normalmente é pago. Os demais só aparecem sob "Mostrar todos". */
export const STATUS_RECEBIVEIS = new Set(["aprovado", "convertido"]);

/**
 * Quanto já foi recebido de um orçamento — a soma dos OUTROS recibos ligados a ele.
 *
 * `exceto` é o recibo em edição: sem isso, editar um recibo de R$500 contaria os
 * próprios R$500 como "já recebido" e a tela diria que ainda falta o dobro.
 *
 * Soma pelo BLOB (`valorRecebido`), que é a fonte da verdade — a coluna é espelho.
 */
export function somaRecebida(recibos: Recibo[], orcamentoId: string, exceto?: string): number {
	const total = recibos
		.filter((r) => r.orcamentoId === orcamentoId && r.id !== exceto)
		.reduce((s, r) => s + (Number.isFinite(r.valorRecebido) ? r.valorRecebido : 0), 0);
	return Math.round(total * 100) / 100;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 2.480,50". Um formatador só, para lista e formulário não divergirem. */
export function reais(v: number | null | undefined): string {
	return BRL.format(Number.isFinite(v as number) ? (v as number) : 0);
}
