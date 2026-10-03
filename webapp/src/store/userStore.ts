import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import type { UserInfo, UserToken } from "#/entity";
import type { SignInReq } from "@/api/services/userService";
import { supabase } from "@/lib/supabase";
import { esquecerValoresVistos } from "@/components/animate/memoria-visto";
import { registrarNovaContaSocial } from "@/lib/marketing";
import { limparIndicioDeSessao, marcarIndicioDeSessao } from "@/lib/session-hint";
import { resetBrandColor } from "@/olli/branding";
import { queryClient } from "./queryClient";
import { SENHA_MINIMA } from "@auth-policy";

const atividadeRegistrada = new Set<string>();

// Versoes anteriores duplicavam access/refresh token em `userStore`, alem da
// copia autoritativa do supabase-js. Remova apenas o espelho legado: a sessao
// real (`sb-<ref>-auth-token`) continua intacta e sera hidratada abaixo.
if (typeof window !== "undefined") window.localStorage.removeItem("userStore");

async function registrarAtividade(
	evento: "login" | "app_open",
	session: { user?: { id?: string | null }; expires_at?: number | null } | null,
) {
	const userId = session?.user?.id;
	if (!userId) return;
	const sessao = evento === "login" ? String(session.expires_at ?? Date.now()) : "boot";
	const chave = `${userId}:${evento}:${sessao}`;
	if (atividadeRegistrada.has(chave)) return;
	const { error } = await supabase.rpc("registrar_atividade_usuario", {
		p_evento: evento,
		p_plataforma: "web",
	});
	if (!error) atividadeRegistrada.add(chave);
}

/**
 * Traduz os códigos de erro do Supabase Auth (AuthApiError.code) para pt-BR.
 * Sem isto o usuário via a mensagem crua em inglês do GoTrue
 * ("Invalid login credentials"). Fallback: a mensagem original do Supabase
 * (melhor que nada quando o código não está mapeado).
 */
export function mapAuthErrorMessage(err: unknown): string {
	const code = (err as { code?: string } | null | undefined)?.code;
	const fallback =
		(err as { message?: string } | null | undefined)?.message ?? "Não foi possível concluir. Tente de novo.";
	switch (code) {
		case "invalid_credentials":
			return "E-mail ou senha incorretos.";
		case "email_not_confirmed":
			return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
		case "over_request_rate_limit":
		case "over_email_send_rate_limit":
			return "Muitas tentativas. Aguarde um instante e tente de novo.";
		case "user_already_exists":
		case "email_exists":
		case "identity_already_exists":
			return "Já existe uma conta com este e-mail.";
		case "weak_password":
			return `Senha fraca. Use pelo menos ${SENHA_MINIMA} caracteres, com letras e números.`;
		case "user_banned":
			return "Esta conta está temporariamente bloqueada.";
		case "email_address_invalid":
		case "validation_failed":
		case "bad_json":
			return "E-mail inválido.";
		case "signup_disabled":
			return "Cadastro por e-mail está desativado no momento.";
		default:
			return fallback;
	}
}

type UserStore = {
	userInfo: Partial<UserInfo>;
	userToken: UserToken;
	authHydrated: boolean;

	actions: {
		setUserInfo: (userInfo: UserInfo) => void;
		setUserToken: (token: UserToken) => void;
		setAuthHydrated: (hydrated: boolean) => void;
		clearUserInfoAndToken: () => void;
	};
};

const useUserStore = create<UserStore>()((set) => ({
	userInfo: {},
	userToken: {},
	authHydrated: false,
	actions: {
		setUserInfo: (userInfo) => {
			set({ userInfo });
		},
		setUserToken: (userToken) => {
			set({ userToken });
		},
		setAuthHydrated: (authHydrated) => {
			set({ authHydrated });
		},
		clearUserInfoAndToken() {
			set({ userInfo: {}, userToken: {} });
		},
	},
}));

export const useUserInfo = () => useUserStore((state) => state.userInfo);
export const useUserToken = () => useUserStore((state) => state.userToken);
export const useAuthHydrated = () => useUserStore((state) => state.authHydrated);
export const useUserPermissions = () => useUserStore((state) => state.userInfo.permissions || []);
export const useUserRoles = () => useUserStore((state) => state.userInfo.roles || []);
export const useUserActions = () => useUserStore((state) => state.actions);

export const useSignIn = () => {
	const { setUserToken, setUserInfo } = useUserActions();

	/**
	 * Login REAL via Supabase (email + senha). O `username` do formulário é
	 * tratado como e-mail. O RLS do Postgres já protege os dados; aqui só
	 * guardamos o token da sessão (para o guard de rota) e o usuário básico.
	 * Papéis/plano/organização são resolvidos depois, na carga do app.
	 */
	const signIn = async (data: SignInReq) => {
		try {
			const { data: res, error } = await supabase.auth.signInWithPassword({
				email: data.username.trim(),
				password: data.password,
			});
			if (error) throw error;
			const session = res.session;
			const user = res.user;
			setUserToken({ accessToken: session?.access_token, refreshToken: session?.refresh_token });
			setUserInfo({
				id: user?.id ?? "",
				email: user?.email ?? "",
				username: user?.email ?? "",
				name: user?.user_metadata?.full_name || user?.user_metadata?.name || undefined,
				phone: user?.user_metadata?.phone || user?.phone || undefined,
				avatar: user?.user_metadata?.avatar_url || undefined,
			} as UserInfo);
			marcarIndicioDeSessao();
		} catch (err: any) {
			toast.error(mapAuthErrorMessage(err), {
				position: "top-center",
			});
			throw err;
		}
	};

	return signIn;
};

/** Encerra a sessão no Supabase e limpa o estado local. */
export const useSignOut = () => {
	const { clearUserInfoAndToken } = useUserActions();
	return async () => {
		try {
			// Sair deste navegador nao revoga o aplicativo nem outros aparelhos.
			await supabase.auth.signOut({ scope: "local" });
		} finally {
			limparIndicioDeSessao();
			// Os valores em reais que o Início guardou para "desde a sua última visita"
			// não ficam no navegador depois do "Sair" (computador compartilhado).
			esquecerValoresVistos();
			clearUserInfoAndToken();
		}
	};
};

/**
 * Sincroniza a sessão do Supabase com o userStore (usado no boot do app).
 *
 * Por que existe: o guard de rota olha o `userStore.accessToken`. Sem isto:
 *  - login social (Google/Apple) grava a sessão no supabase-js mas NÃO no store
 *    → o guard barra e o usuário nunca entra;
 *  - se a sessão do Supabase expira/é revogada, o token velho persistido no store
 *    mantém o guard "aberto" e toda query dá 401 → o usuário fica preso em telas
 *    de erro sem voltar pro login.
 * Aqui a gente hidrata do `getSession()` no boot e escuta `onAuthStateChange`
 * (SIGNED_OUT → limpa; SIGNED_IN/refresh → atualiza). Uma fonte de verdade só.
 */
export function useAuthSync() {
	const { setUserToken, setUserInfo, setAuthHydrated, clearUserInfoAndToken } = useUserActions();
	useEffect(() => {
		let active = true;
		const limparEstadoDaSessao = () => {
			limparIndicioDeSessao();
			clearUserInfoAndToken();
			resetBrandColor();
			queryClient.clear();
		};
		const hydrate = (session: { access_token: string; refresh_token: string; user: any } | null) => {
			if (!session) {
				limparEstadoDaSessao();
				return;
			}
			setUserToken({ accessToken: session.access_token, refreshToken: session.refresh_token });
			setUserInfo({
				id: session.user?.id ?? "",
				email: session.user?.email ?? "",
				username: session.user?.email ?? "",
				name: session.user?.user_metadata?.full_name || session.user?.user_metadata?.name || undefined,
				phone: session.user?.user_metadata?.phone || session.user?.phone || undefined,
				avatar: session.user?.user_metadata?.avatar_url || undefined,
			} as UserInfo);
			marcarIndicioDeSessao();
		};
		supabase.auth.getSession().then(({ data }) => {
			if (active) {
				hydrate(data.session);
				setAuthHydrated(true);
				void registrarAtividade("app_open", data.session);
			}
		}).catch(() => {
			// O guard sai do estado de espera mesmo quando a leitura local falha;
			// nesse caso accessToken permanece vazio e a rota protegida redireciona.
			if (active) {
				limparEstadoDaSessao();
				setAuthHydrated(true);
			}
		});
		const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
			setAuthHydrated(true);
			hydrate(session);
			// Chamadas Supabase iniciadas dentro do callback podem concorrer com
			// o lock interno do Auth. Adie a telemetria ate o evento terminar.
			if (session && event === "SIGNED_IN") {
				window.setTimeout(() => void registrarAtividade("login", session), 0);
			}
			// Origem do cadastro por Google/Apple (só age em conta criada há minutos). Fora
			// do callback: chamar o Supabase de dentro dele, com a sessão travada, trava.
			if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
				window.setTimeout(() => void registrarNovaContaSocial(session.user), 0);
			}
		});
		return () => {
			active = false;
			sub.subscription.unsubscribe();
		};
	}, []);
}

export default useUserStore;
