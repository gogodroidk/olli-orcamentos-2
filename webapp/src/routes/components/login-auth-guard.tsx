import { useAuthHydrated, useUserToken } from "@/store/userStore";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useRouter } from "../hooks";

type Props = {
	children: React.ReactNode;
};
export default function LoginAuthGuard({ children }: Props) {
	const router = useRouter();
	const { accessToken } = useUserToken();
	const authHydrated = useAuthHydrated();

	const check = useCallback(() => {
		if (authHydrated && !accessToken) {
			router.replace("/auth/login");
		}
	}, [router, accessToken, authHydrated]);

	useEffect(() => {
		check();
	}, [check]);

	// Não renderiza a tela protegida enquanto o Supabase ainda recupera a sessão
	// persistida; isso evita o falso logout/redirect no reload do painel e deixa
	// claro que o painel esta verificando, em vez de mostrar uma tela vazia.
	if (!authHydrated) {
		return (
			<div className="grid min-h-svh place-items-center bg-background" role="status" aria-live="polite">
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<Loader2 className="size-5 animate-spin" aria-hidden />
					Verificando sua sessão…
				</div>
			</div>
		);
	}
	if (!accessToken) return null;
	return <>{children}</>;
}
