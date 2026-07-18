import { lazyComRetry } from "@/components/lazy/carregar-chunk";

const Pages = import.meta.glob("/src/pages/**/*.tsx");
const lazyComponentCache = new Map<string, React.LazyExoticComponent<any>>();

export const loadComponentFromPath = (path: string) => {
	const pathArr = path.split("/");
	pathArr.unshift("/src");

	if (!pathArr.includes(".tsx")) {
		return pathArr.push("index.tsx");
	}
	return Pages[pathArr.join("/")];
};

export const Component = (path = "", props?: any): React.ReactNode => {
	if (!path) return null;

	let importFn = Pages[`/src${path}.tsx`];
	if (!importFn) importFn = Pages[`/src${path}/index.tsx`];
	if (!importFn) {
		console.warn("Component not found for path:", path);
		return null;
	}

	let Element = lazyComponentCache.get(path);
	if (!Element) {
		// `lazyComRetry` e não `lazy`: cada tela do painel é um arquivo separado que
		// baixa na hora do clique. No 4G da rua isso falha de vez em quando, e sem a
		// reentrega a tela simplesmente não abre. Ver components/lazy/carregar-chunk.
		Element = lazyComRetry(importFn as any);
		lazyComponentCache.set(path, Element);
	}
	return <Element {...props} />;
};
