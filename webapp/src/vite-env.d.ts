/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Lista de Orçamentos vazia guiada (CQ-ATIVA-1O-ORCAMENTO). Só "1"/"true" liga; padrão desligado. */
	readonly VITE_ATIVA_1O_ORCAMENTO?: string;
	/** Default route path for the application */
	readonly VITE_APP_DEFAULT_ROUTE: string;
	/** Public path for static assets */
	readonly VITE_APP_PUBLIC_PATH: string;
	/** Base URL for API endpoints */
	readonly VITE_APP_API_BASE_URL: string;
	/** Routing mode: frontend routing or backend routing */
	readonly VITE_APP_ROUTER_MODE: "frontend" | "backend";
	/**
	 * D1438-G20. Só "1" mostra o protótipo de áudio na tela de Planos.
	 * Ausente no build publicado.
	 */
	readonly VITE_PLANOS_AUDIO_IA?: string;
	/** "on" mostra o rascunho de precificação com IA. Qualquer outro valor deixa desligado. */
	readonly VITE_PRECIFICACAO_IA?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
