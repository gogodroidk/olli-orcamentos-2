import { QueryClientProvider } from "@tanstack/react-query";
import { Helmet, HelmetProvider } from "react-helmet-async";
import Logo from "@/assets/icons/ic-logo-badge.svg";
import { MotionLazy } from "./components/animate/motion-lazy";
import { RouteLoadingProgress } from "./components/loading";
import Toast from "./components/toast";
import { GLOBAL_CONFIG } from "./global-config";
import { queryClient } from "./store/queryClient";
import { ThemeProvider } from "./theme/theme-provider";
import { useAuthSync } from "./store/userStore";

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
