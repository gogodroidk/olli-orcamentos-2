import {
	buscaSemParametroConvite,
	extrairTokenConviteDaBusca,
	guardarConvitePendente,
	lerConvitePendente,
} from "@convite-google";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { caminhoCallbackAuth, destinoDepoisDoLogin, type IntencaoPlano, lerIntencaoPlano } from "@/olli/plano-intent";

export enum LoginStateEnum {
	LOGIN = 0,
	REGISTER = 1,
	RESET_PASSWORD = 2,
	/** Login sem senha: código de 6 dígitos no e-mail (codigo-form.tsx). */
	CODIGO = 3,
}

interface LoginStateContextType {
	loginState: LoginStateEnum;
	setLoginState: (loginState: LoginStateEnum) => void;
	backToLogin: () => void;
	intencaoPlano: IntencaoPlano | null;
	destinoPosLogin: string | null;
	callbackAuthPath: string;
	/** Token do convite de equipe guardado nesta aba. Vazio quando não há convite. */
	conviteToken: string | null;
	loginHintGoogle: string;
	setLoginHintGoogle: (email: string) => void;
}
const LoginStateContext = createContext<LoginStateContextType>({
	loginState: LoginStateEnum.LOGIN,
	setLoginState: () => {},
	backToLogin: () => {},
	intencaoPlano: null,
	destinoPosLogin: null,
	callbackAuthPath: "/auth/login",
	conviteToken: null,
	loginHintGoogle: "",
	setLoginHintGoogle: () => {},
});

export function useLoginStateContext() {
	const context = useContext(LoginStateContext);
	return context;
}

/**
 * Estado inicial da tela, lido da URL UMA vez.
 *
 * CC-01: todos os CTAs da landing ("Criar meu primeiro orçamento", "Teste grátis")
 * caíam na tela de LOGIN — o cadastro era um sub-estado sem deep-link, escondido
 * atrás de um link. Agora `/auth/login?modo=cadastro` (ou `?screen=register`) abre
 * direto no cadastro. Lê de `window.location.search` no inicializador do useState
 * (roda uma vez, no primeiro render) em vez de um hook de router, pra não depender
 * da ordem de montagem do Provider dentro da árvore de rotas.
 */
function estadoInicial(): LoginStateEnum {
	if (typeof window === "undefined") return LoginStateEnum.LOGIN;
	const p = new URLSearchParams(window.location.search);
	const modo = (p.get("modo") ?? p.get("screen") ?? "").toLowerCase();
	if (modo === "cadastro" || modo === "register" || modo === "signup") return LoginStateEnum.REGISTER;
	if (modo === "codigo") return LoginStateEnum.CODIGO;
	if (modo === "esqueci" || modo === "recuperar") return LoginStateEnum.RESET_PASSWORD;
	return LoginStateEnum.LOGIN;
}

/** Inverso de `estadoInicial`: o `?modo=` que cada tela escreve na URL (login = sem `modo`). */
const MODO_DA_TELA: Record<LoginStateEnum, string | null> = {
	[LoginStateEnum.LOGIN]: null,
	[LoginStateEnum.REGISTER]: "cadastro",
	[LoginStateEnum.RESET_PASSWORD]: "esqueci",
	[LoginStateEnum.CODIGO]: "codigo",
};

function conviteInicial(): string | null {
	if (typeof window === "undefined") return null;
	const daUrl = extrairTokenConviteDaBusca(window.location.search);
	if (daUrl) {
		guardarConvitePendente(window.sessionStorage, daUrl);
		return daUrl;
	}
	const guardado = lerConvitePendente(window.sessionStorage);
	return guardado || null;
}

export function LoginProvider({ children }: PropsWithChildren) {
	const [loginState, setLoginStateBruto] = useState(estadoInicial);
	const [intencaoPlano] = useState<IntencaoPlano | null>(() =>
		typeof window === "undefined" ? null : lerIntencaoPlano(window.location.search),
	);
	const [conviteToken] = useState<string | null>(conviteInicial);
	const [loginHintGoogle, setLoginHintGoogle] = useState("");

	useEffect(() => {
		if (!conviteToken || typeof window === "undefined") return;
		const sem = buscaSemParametroConvite(window.location.search);
		if (sem === (window.location.search || "")) return;
		window.history.replaceState(window.history.state, "", `${window.location.pathname}${sem}${window.location.hash}`);
	}, [conviteToken]);

	// D-2151 #4: a tela (entrar/cadastro/código/esqueci) agora vive na URL (`?modo=`), como o deep-link
	// do CC-01 já lia: dá para mandar o link do cadastro e o "voltar" do navegador volta ao login
	// em vez de sair do app. Os outros parâmetros (plano, convite) ficam intactos.
	useEffect(() => {
		if (typeof window === "undefined") return;
		const aoVoltar = () => setLoginStateBruto(estadoInicial());
		window.addEventListener("popstate", aoVoltar);
		return () => window.removeEventListener("popstate", aoVoltar);
	}, []);

	function setLoginState(novo: LoginStateEnum) {
		setLoginStateBruto(novo);
		if (typeof window === "undefined") return;
		const p = new URLSearchParams(window.location.search);
		p.delete("screen");
		const modo = MODO_DA_TELA[novo];
		if (modo) p.set("modo", modo);
		else p.delete("modo");
		const busca = p.toString() ? `?${p.toString()}` : "";
		if (busca === window.location.search) return;
		window.history.pushState(window.history.state, "", `${window.location.pathname}${busca}${window.location.hash}`);
	}

	function backToLogin() {
		setLoginState(LoginStateEnum.LOGIN);
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	const value: LoginStateContextType = useMemo(
		() => ({
			loginState,
			setLoginState,
			backToLogin,
			intencaoPlano,
			destinoPosLogin: conviteToken ? "/equipe/aceitar" : destinoDepoisDoLogin(intencaoPlano),
			callbackAuthPath: caminhoCallbackAuth(intencaoPlano),
			conviteToken,
			loginHintGoogle,
			setLoginHintGoogle,
		}),
		[loginState, intencaoPlano, conviteToken, loginHintGoogle],
	);

	return <LoginStateContext.Provider value={value}>{children}</LoginStateContext.Provider>;
}
