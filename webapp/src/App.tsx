import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Helmet, HelmetProvider } from "react-helmet-async";
import Logo from "@/assets/icons/ic-logo-badge.svg";
import { MotionLazy } from "./components/animate/motion-lazy";
import { RouteLoadingProgress } from "./components/loading";
import Toast from "./components/toast";
import { GLOBAL_CONFIG } from "./global-config";
import { ThemeProvider } from "./theme/theme-provider";
import { useAuthSync } from "./store/userStore";

/**
 * O QueryClient vive FORA do componente, de propósito.
 *
 * Antes ele era `new QueryClient()` dentro do JSX: a cada re-render nascia um
 * cliente NOVO, e com ele um cache novo. Efeito prático quando o painel passou a
 * gravar: o usuário salvava um cliente, o `invalidateQueries` marcava o cache
 * antigo — que já tinha sido jogado fora — e a lista NÃO atualizava. O registro
 * estava salvo no banco, mas a tela dizia que não. Cache tem que sobreviver ao
 * render.
 */
const queryClient = new QueryClient();

function App({ children }: { children: React.ReactNode }) {
	// Espelha a sessão do Supabase no userStore (OAuth + expiração de sessão).
	useAuthSync();
	return (
		<HelmetProvider>
			<QueryClientProvider client={queryClient}>
				<ThemeProvider>
					<Helmet>
						<title>{GLOBAL_CONFIG.appName}</title>
						<link rel="icon" href={Logo} />
					</Helmet>
					<Toast />
					<RouteLoadingProgress />
					<MotionLazy>{children}</MotionLazy>
				</ThemeProvider>
			</QueryClientProvider>
		</HelmetProvider>
	);
}

export default App;
