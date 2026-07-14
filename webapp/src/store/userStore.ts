import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { UserInfo, UserToken } from "#/entity";
import { StorageEnum } from "#/enum";
import type { SignInReq } from "@/api/services/userService";
import { supabase } from "@/lib/supabase";

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
			toast.error(err?.message ?? "Não foi possível entrar. Confira e-mail e senha.", {
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
			if (event === "SIGNED_OUT" || !session) clearUserInfoAndToken();
			else hydrate(session);
		});
		return () => {
			active = false;
			sub.subscription.unsubscribe();
		};
	}, []);
}

export default useUserStore;
