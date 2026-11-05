import { useAuthHydrated, useUserToken } from "@/store/userStore";
import { Skeleton } from "@/ui/skeleton";
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
			<div className="grid min-h-svh place-items-center bg-background px-6" role="status" aria-live="polite">
				<div className="flex w-full max-w-xs flex-col items-center gap-4">
					<Skeleton className="h-2.5 w-40 rounded-full" />
					<p className="text-sm text-muted-foreground">Verificando sua sessão…</p>
				</div>
			</div>
		);
	}
	if (!accessToken) return null;
	return <>{children}</>;
}
