import {
	classificarErroOAuth,
	type MotivoErroOAuth,
	mensagemErroOAuth,
	novaTentativaOAuth,
	type ProvedorOAuth,
	urlSemParametrosOAuth,
} from "@oauth-retorno";
import { useEffect } from "react";
import { toast } from "sonner";
import { registrarFunilAuth, retornoOAuthInicial, supabase } from "@/lib/supabase";
import { consumirIntencaoOAuth, destinoDepoisDoLogin } from "@/olli/plano-intent";

/** Correlação iniciado → resultado do funil (gravada em OAuthButtons antes do redirect). */
export const CHAVE_TENTATIVA_OAUTH = "olli:oauth-tentativa";

// Módulo, não estado: o StrictMode monta a tela duas vezes em dev e a tela de login
// pode remontar depois do hydrate — o retorno do OAuth é tratado UMA vez por carga.
let retornoTratado = false;
let destinoCalculado: { valor: string | null } | null = null;

function lerTentativa(): { tentativa: string; provedor: ProvedorOAuth } {
	try {
		const cru = window.sessionStorage.getItem(CHAVE_TENTATIVA_OAUTH);
		window.sessionStorage.removeItem(CHAVE_TENTATIVA_OAUTH);
		const dado = cru ? (JSON.parse(cru) as { tentativa?: unknown; provedor?: unknown }) : null;
		const provedor: ProvedorOAuth = dado?.provedor === "apple" ? "apple" : "google";
		if (typeof dado?.tentativa === "string" && dado.tentativa.length <= 64)
			return { tentativa: dado.tentativa, provedor };
		return { tentativa: novaTentativaOAuth(), provedor };
	} catch {
		// Volta noutra aba/navegador (sem sessionStorage): tentativa nova, sem correlação.
		return { tentativa: novaTentativaOAuth(), provedor: "google" };
	}
}

function limparUrl() {
	try {
		window.history.replaceState(window.history.state, "", urlSemParametrosOAuth(window.location.href));
	} catch {
		// sem History API: a URL fica suja, mas nada quebra
	}
}

/**
 * Para onde ir depois de um login social que DEU CERTO: a página do plano, se a
 * pessoa veio de um CTA de preço (intenção guardada antes do redirect), senão null.
 * Calculado uma vez por carga — consumir a intenção é destrutivo.
 */
export function destinoDepoisDoOAuth(): string | null {
	if (!destinoCalculado) {
		const voltouDoOAuth = retornoOAuthInicial.tipo === "codigo";
		const intencao = voltouDoOAuth ? consumirIntencaoOAuth(window.sessionStorage) : null;
		destinoCalculado = { valor: destinoDepoisDoLogin(intencao) };
	}
	return destinoCalculado.valor;
}

/**
 * Fecha o ciclo do login social na tela de login. Antes, três finais eram MUDOS:
 *  - erro do Google/GoTrue na URL (`?error=...`): ignorado, tela de login de novo;
 *  - `?code=` que o supabase-js não consegue trocar (code_verifier noutro
 *    navegador, code vencido): a sessão simplesmente não aparecia;
 *  - `?code=` que caía aqui vindo da landing (redirect fora da allowlist).
 * Agora cada um vira um aviso em pt-BR dizendo o que fazer, e o funil registra
 * `oauth_sessao_criada` ou `oauth_erro` com um motivo fechado (sem PII).
 */
export function useRetornoOAuth() {
	useEffect(() => {
		if (retornoTratado) return;
		retornoTratado = true;
		const retorno = retornoOAuthInicial;
		if (retorno.tipo === "nenhum") return;

		const { tentativa, provedor } = lerTentativa();
		const avisar = (motivo: MotivoErroOAuth) => {
			void registrarFunilAuth("oauth_erro", { plataforma: "web", provedor, tentativa, motivo });
			toast.error(mensagemErroOAuth(motivo, provedor), { position: "top-center", duration: 12000 });
		};

		if (retorno.tipo === "erro") {
			avisar(retorno.motivo);
			limparUrl();
			return;
		}

		// `initialize()` devolve o resultado da inicialização automática (a troca do
		// code já disparada no construtor) — não troca de novo.
		supabase.auth
			.initialize()
			.then(async ({ error }) => {
				const { data } = await supabase.auth.getSession();
				if (data.session) {
					void registrarFunilAuth("oauth_sessao_criada", { plataforma: "web", provedor, tentativa });
				} else {
					// Sem erro e sem sessão = o supabase-js nem tentou: não havia
					// code_verifier neste navegador (o login começou em outro lugar).
					avisar(error ? classificarErroOAuth(error.code, error.message) : "navegador_trocado");
				}
			})
			.catch(() => avisar("desconhecido"))
			.finally(limparUrl);
	}, []);
}
