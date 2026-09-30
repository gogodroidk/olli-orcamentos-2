import { QueryClientProvider } from "@tanstack/react-query";
import { MotionLazy } from "./components/animate/motion-lazy";
import { RouteLoadingProgress } from "./components/loading";
import Toast from "./components/toast";
import { queryClient } from "./store/queryClient";
import { ThemeProvider } from "./theme/theme-provider";
import { useAuthSync } from "./store/userStore";

function App({ children }: { children: React.ReactNode }) {
	// Espelha a sessão do Supabase no userStore (OAuth + expiração de sessão).
	useAuthSync();
	// Sem <HelmetProvider>/<Helmet> desde 30/09/2026: o react-helmet-async não
	// aplicava nada sob o React 19 (a aba nunca mudou de título) e custava ~27 KB
	// no JS da primeira tela. Título da aba: hooks/use-titulo-da-aba.ts. Ícone:
	// o <link rel="icon"> do index.html.
	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider>
				<Toast />
				<RouteLoadingProgress />
				<MotionLazy>{children}</MotionLazy>
			</ThemeProvider>
		</QueryClientProvider>
	);
}

export default App;
