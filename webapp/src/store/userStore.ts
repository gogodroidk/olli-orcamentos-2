import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { UserInfo, UserToken } from "#/entity";
import { StorageEnum } from "#/enum";
import type { SignInReq } from "@/api/services/userService";
import { supabase } from "@/lib/supabase";
import { resetBrandColor } from "@/olli/branding";
import { queryClient } from "./queryClient";

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
			return "Senha fraca. Use pelo menos 6 caracteres, com letras e números.";
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

	actions: {
		setUserInfo: (userInfo: UserInfo) => void;
		setUserToken: (token: UserToken) => void;
		clearUserInfoAndToken: () => void;
	};
};

const useUserStore = create<UserStore>()(
	persist(
		(set) => ({
			userInfo: {},
			userToken: {},
			actions: {
				setUserInfo: (userInfo) => {
					set({ userInfo });
				},
				setUserToken: (userToken) => {
					set({ userToken });
				},
				clearUserInfoAndToken() {
					set({ userInfo: {}, userToken: {} });
				},
			},
		}),
		{
			name: "userStore", // name of the item in the storage (must be unique)
			storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
			partialize: (state) => ({
				[StorageEnum.UserInfo]: state.userInfo,
				[StorageEnum.UserToken]: state.userToken,
			}),
		},
	),
);

export const useUserInfo = () => useUserStore((state) => state.userInfo);
export const useUserToken = () => useUserStore((state) => state.userToken);
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
				avatar: user?.user_metadata?.avatar_url || undefined,
			} as UserInfo);
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
			await supabase.auth.signOut();
		} finally {
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
	const { setUserToken, setUserInfo, clearUserInfoAndToken } = useUserActions();
	useEffect(() => {
		let active = true;
		const hydrate = (session: { access_token: string; refresh_token: string; user: any } | null) => {
			if (!session) return;
			setUserToken({ accessToken: session.access_token, refreshToken: session.refresh_token });
			setUserInfo({
				id: session.user?.id ?? "",
				email: session.user?.email ?? "",
				username: session.user?.email ?? "",
				avatar: session.user?.user_metadata?.avatar_url || undefined,
			} as UserInfo);
		};
		supabase.auth.getSession().then(({ data }) => {
			if (active) hydrate(data.session);
		});
		const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
			if (event === "SIGNED_OUT" || !session) {
				clearUserInfoAndToken();
				// Volta a cor da marca pro padrão OLLI: sem isto, uma sessão que
				// termina por expiração/token revogado (não pelo botão Sair) deixa
				// o white-label do tenant anterior pintado até o próximo login.
				resetBrandColor();
				// Limpa o cache do React Query também aqui (não só no logout manual
				// de account-dropdown.tsx): sem isto, uma sessão que termina por
				// expiração/revogação de token (em vez do botão Sair) deixava dado
				// em cache de um tenant vazar pro próximo login nesta mesma aba.
				// `queryClient` é o singleton de store/queryClient.ts — resolve sem
				// depender do QueryClientProvider (useAuthSync roda antes dele).
				queryClient.clear();
			} else hydrate(session);
		});
		return () => {
			active = false;
			sub.subscription.unsubscribe();
		};
	}, []);
}

export default useUserStore;
