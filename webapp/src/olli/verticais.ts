import { useCallback } from "react";
import { useMinhaEmpresa } from "./data";

/**
 * verticais.ts (painel) — o GATE de personalização por ofício, mesma regra do
 * app do celular (`useVerticais` em `src/hooks/useVerticais.ts` +
 * `src/services/verticais.ts`/`verticalSegmento.ts`, ver docs/SISTEMA_SUPERIOR.md).
 * Copiado aqui VERBATIM (sem importar `../src`) pelo MESMO motivo do
 * `pages/olli/ferramentas/calculos.ts`: o painel não depende do módulo do
 * celular em tempo de execução — só dos TIPOS, via o bridge `@dominio`.
 *
 * BACKWARD-COMPAT deliberado: empresa SEM ofício definido (`verticais` e
 * `segmento` ausentes no blob `empresa.dados`) vê TUDO — o gate só ESCONDE
 * quem escolheu outro ofício. O ofício se define em "Meu negócio", no app do
 * celular (o painel ainda não expõe esse campo — ver o comentário no topo de
 * `pages/olli/meu-negocio/index.tsx`).
 *
 * 3 ESTADOS: enquanto `empresa` ainda carrega ou a leitura falhou, tratamos
 * como "sem ofício definido" (mostra) — "não sei" nunca vira "não tem" aqui:
 * o gate só FECHA quando SABE, com certeza, que o ofício é outro.
 */

export type VerticalId = "refrigeracao" | "eletrica" | "hidraulica" | "pintura" | "dedetizacao" | "jardinagem" | "geral";
type Segmento = "ar-condicionado" | "eletrica" | "hidraulica" | "pintura" | "outro";

/** Segmento (os 5 chips legados de "Meu negócio") → VerticalId (o ofício que dirige o gate). */
const SEGMENTO_PARA_VERTICAL: Record<Segmento, VerticalId> = {
	"ar-condicionado": "refrigeracao",
	eletrica: "eletrica",
	hidraulica: "hidraulica",
	pintura: "pintura",
	outro: "geral",
};

interface DadosEmpresaVertical {
	verticais?: VerticalId[];
	segmento?: Segmento;
}

/** Verticais efetivos da empresa: os explícitos, senão DERIVADOS do `segmento` legado. */
function verticaisEfetivos(dados: DadosEmpresaVertical | null | undefined): VerticalId[] | undefined {
	if (dados?.verticais && dados.verticais.length > 0) return dados.verticais;
	if (dados?.segmento) return [SEGMENTO_PARA_VERTICAL[dados.segmento]];
	return undefined;
}

/** A empresa deve VER as telas/itens da vertical `id`? `undefined`/vazio = mostra tudo. */
function empresaMostraVertical(verticais: VerticalId[] | undefined, id: VerticalId): boolean {
	if (!verticais || verticais.length === 0) return true;
	return verticais.includes(id);
}

export interface EstadoVerticalPainel {
	/** `true` até a 1ª leitura da empresa chegar. */
	carregando: boolean;
	/** `true` se a leitura da empresa falhou (o gate segue aberto mesmo assim). */
	comErro: boolean;
	/** A empresa deve ver a vertical `id`? Enquanto carrega/erro, sempre `true`. */
	mostraVertical: (id: VerticalId) => boolean;
}

/** Gate de vertical do painel — lê a MESMA linha `empresa` de `useMinhaEmpresa` (cache compartilhado). */
export function useVerticaisPainel(): EstadoVerticalPainel {
	const empresaQ = useMinhaEmpresa();
	const carregando = empresaQ.isLoading;
	const comErro = empresaQ.isError;
	const linha = empresaQ.data as { dados?: DadosEmpresaVertical | null } | null | undefined;

	// Enquanto carrega ou deu erro, o gate nunca ESCONDE por falta de certeza (3 estados).
	const verticais = carregando || comErro ? undefined : verticaisEfetivos(linha?.dados);

	const mostraVertical = useCallback((id: VerticalId) => empresaMostraVertical(verticais, id), [verticais]);

	return { carregando, comErro, mostraVertical };
}
