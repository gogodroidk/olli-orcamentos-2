import { createContext, type PropsWithChildren, useContext, useMemo, useState } from "react";

export enum LoginStateEnum {
	LOGIN = 0,
	REGISTER = 1,
	RESET_PASSWORD = 2,
	MOBILE = 3,
	QR_CODE = 4,
}

interface LoginStateContextType {
	loginState: LoginStateEnum;
	setLoginState: (loginState: LoginStateEnum) => void;
	backToLogin: () => void;
}
const LoginStateContext = createContext<LoginStateContextType>({
	loginState: LoginStateEnum.LOGIN,
	setLoginState: () => {},
	backToLogin: () => {},
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
	return LoginStateEnum.LOGIN;
}

export function LoginProvider({ children }: PropsWithChildren) {
	const [loginState, setLoginState] = useState(estadoInicial);

	function backToLogin() {
		setLoginState(LoginStateEnum.LOGIN);
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	const value: LoginStateContextType = useMemo(() => ({ loginState, setLoginState, backToLogin }), [loginState]);

	return <LoginStateContext.Provider value={value}>{children}</LoginStateContext.Provider>;
}
