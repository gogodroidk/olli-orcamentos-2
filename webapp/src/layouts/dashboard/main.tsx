import { Suspense } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ChunkBoundary } from "@/components/lazy/chunk-boundary";
import { LineLoading } from "@/components/loading";
import Page403 from "@/pages/sys/error/Page403";
import { useSettings } from "@/store/settingStore";
import { cn } from "@/utils";
import { flattenTrees } from "@/utils/tree";
import { frontendNavData } from "./nav/nav-data/nav-data-frontend";

/**
 * find auth by path
 * @param path
 * @returns
 */
function findAuthByPath(path: string): string[] {
	const foundItem = allItems.find((item) => item.path === path);
	return foundItem?.auth || [];
}

// Sem cópia, de propósito — e NÃO troque por `structuredClone`.
//
// O `clone` do ramda que estava aqui só servia para trazer a biblioteca inteira
// para o boot. A cópia nunca teve função: `allItems` é lido (achar a permissão da
// rota atual) e ninguém escreve em `frontendNavData`.
//
// O `structuredClone` seria a troca óbvia e QUEBRA O PAINEL INTEIRO: os itens do
// menu carregam `icon: <Home size={24} />`, que é elemento React — o algoritmo
// de clone estruturado lança DataCloneError em símbolo/função, e isso acontece no
// escopo do módulo, ou seja, tela branca antes de qualquer render.
const allItems = frontendNavData.reduce((acc: any[], group) => {
	return [...acc, ...flattenTrees(group.items)];
}, []);

const Main = () => {
	const { themeStretch } = useSettings();

	const { pathname } = useLocation();
	const currentNavAuth = findAuthByPath(pathname);

	return (
		<AuthGuard checkAny={currentNavAuth} fallback={<Page403 />}>
			<main
				data-slot="slash-layout-main"
				className={cn(
					"flex-auto w-full flex flex-col",
					"transition-[max-width] duration-300 ease-in-out",
					"px-4 sm:px-6 py-4 sm:py-6 md:px-8 mx-auto",
					{
						"max-w-full": themeStretch,
						"xl:max-w-screen-xl": !themeStretch,
					},
				)}
				style={{
					willChange: "max-width",
				}}
			>
				{/*
				 * A fronteira fica FORA do Suspense (ela precisa ver a rejeição do lazy) e
				 * leva `key={pathname}`: sem isso, uma tela que falhou deixaria a mensagem
				 * de erro colada na tela seguinte — o dono clicaria em "Clientes" e
				 * continuaria vendo o aviso de "Orçamentos".
				 */}
				<ChunkBoundary key={pathname} oQue="esta tela">
					<Suspense fallback={<LineLoading />}>
						<Outlet />
						<ScrollRestoration />
					</Suspense>
				</ChunkBoundary>
			</main>
		</AuthGuard>
	);
};

export default Main;
