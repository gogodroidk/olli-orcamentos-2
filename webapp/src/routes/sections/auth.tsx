import { Suspense, lazy } from "react";
import { Outlet } from "react-router";
import type { RouteObject } from "react-router";

const LoginPage = lazy(() => import("@/pages/sys/login"));
const NovaSenhaPage = lazy(() => import("@/pages/sys/login/nova-senha"));
const authCustom: RouteObject[] = [
	{
		path: "login",
		element: <LoginPage />,
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
	// Fora do prefixo "auth": o e-mail de recuperação de senha (reset-form.tsx)
	// aponta o redirectTo direto pra `/nova-senha` (ver comentário no componente).
	{
		path: "nova-senha",
		element: (
			<Suspense>
				<NovaSenhaPage />
			</Suspense>
		),
	},
];
