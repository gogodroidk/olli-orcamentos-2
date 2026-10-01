/**
 * COMPARATIVO DE RECURSOS — quem entrega o quê, lido do MESMO mapa que o app e o worker.
 *
 * As colunas de "incluído / não incluído" NÃO são digitadas à mão: elas perguntam ao
 * `temAcessoRecurso` de `src/services/entitlements.ts` (via ponte `@entitlements`), a
 * mesma função que decide o acesso de verdade no produto. As LINHAS também não: a ordem
 * é `RECURSOS_EM_ORDEM`, o rótulo é o da tabela única `src/services/planosBase.ts` e o
 * "(em breve)" é `RECURSOS_EM_BREVE`. Se o Pro ganhar um recurso, a linha aparece aqui
 * sozinha — sem ninguém reescrever de memória (o erro que já vendeu recurso inexistente
 * neste projeto).
 */
import {
	IA_USOS_GRATIS_MES,
	type PlanoId,
	RECURSOS_EM_BREVE,
	RECURSOS_EM_ORDEM,
	type Recurso,
	temAcessoRecurso,
} from "@entitlements";
import { ROTULO_RECURSO } from "../../../../../src/services/planosBase";

export { IA_USOS_GRATIS_MES, temAcessoRecurso };
export type { PlanoId, Recurso };

/** Uma linha do comparativo: um recurso do mapa de entitlements + seu rótulo na tela. */
export interface LinhaRecurso {
	recurso: Recurso;
	rotulo: string;
	/** O plano concede, o produto ainda não entrega — não vendemos como pronto. */
	emBreve?: boolean;
}

/** As linhas pagas, na ordem da fonte. A cobertura por plano é resolvida em runtime. */
export const LINHAS_RECURSOS: readonly LinhaRecurso[] = RECURSOS_EM_ORDEM.map((recurso) => ({
	recurso,
	rotulo: ROTULO_RECURSO[recurso].titulo,
	...(RECURSOS_EM_BREVE.has(recurso) ? { emBreve: true } : {}),
}));

/** A ordem das colunas do comparativo. */
export const PLANOS_COMPARADOS: readonly PlanoId[] = ["gratis", "pro", "empresa"];
