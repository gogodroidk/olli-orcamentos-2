import { ambienteRefDoNavegador, vincularIndicacaoPendente as vincular } from "@indicacaoRef";

/**
 * Vínculo da indicação ("colega indica colega") no painel. A landing guarda o `?ref=`
 * (`web/src/lib/indicacaoRef.ts`, onde mora a regra e o teste); aqui só entra a URL do worker.
 * Nunca lança, nunca bloqueia o login; no máximo uma tentativa por carga de página.
 */
export * from "@indicacaoRef";

const WORKER = ((import.meta.env.VITE_DIAGNOSTICO_URL as string | undefined) ?? "https://diagnostico.olliorcamentos.online").replace(/\/+$/, "");

export async function vincularIndicacaoPendente(sessao: { access_token?: string | null } | null | undefined): Promise<void> {
	await vincular(sessao?.access_token, { worker: WORKER, ambiente: ambienteRefDoNavegador(), agoraMs: Date.now() });
}
