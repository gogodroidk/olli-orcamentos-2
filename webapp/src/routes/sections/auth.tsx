import { Suspense, lazy } from "react";
import { Outlet } from "react-router";
import type { RouteObject } from "react-router";

const LoginPage = lazy(() => import("@/pages/sys/login"));
const NovaSenhaPage = lazy(() => import("@/pages/sys/login/nova-senha"));
const ConfirmarPage = lazy(() => import("@/pages/sys/login/confirmar"));
const authCustom: RouteObject[] = [
	{
		path: "login",
		element: <LoginPage />,
	},
	// Destino de TODO link de e-mail de acesso (contrato: ?token_hash=&type=&next=).
	{
		path: "confirm",
		element: <ConfirmarPage />,
	},
	// Último passo do "esqueci a senha" (link confirmado ou código de 6 dígitos).
	{
		path: "nova-senha",
		element: <NovaSenhaPage />,
	},
];

export const authRoutes: RouteObject[] = [
	{
		path: "auth",
		element: (
			<Suspense>
				<Outlet />
			</Suspense>
		),
		children: [...authCustom],
	},
	// Caminho ANTIGO, fora do prefixo "auth": e-mails de recuperação enviados antes
	// do /auth/confirm apontam o redirectTo pra `/nova-senha`. Continua vivo até
	// esses links vencerem (e não custa nada manter).
	{
		path: "nova-senha",
		element: (
			<Suspense>
				<NovaSenhaPage />
			</Suspense>
		),
	},
];
