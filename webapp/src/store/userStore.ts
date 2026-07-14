import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { type SignInReq } from "@/api/services/userService";
import { supabase } from "@/lib/supabase";

import { toast } from "sonner";
import type { UserInfo, UserToken } from "#/entity";
import { StorageEnum } from "#/enum";

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

export default useUserStore;
