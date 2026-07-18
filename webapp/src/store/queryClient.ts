import { QueryClient } from "@tanstack/react-query";

/**
 * O QueryClient vive num módulo próprio, de propósito.
 *
 * Antes ele era `new QueryClient()` dentro do JSX de App.tsx: a cada re-render
 * nascia um cliente NOVO, e com ele um cache novo. Efeito prático quando o
 * painel passou a gravar: o usuário salvava um cliente, o `invalidateQueries`
 * marcava o cache antigo — que já tinha sido jogado fora — e a lista NÃO
 * atualizava. O registro estava salvo no banco, mas a tela dizia que não.
 * Cache tem que sobreviver ao render.
 *
 * Por que um módulo separado (e não só exportar de App.tsx): userStore.ts
 * (useAuthSync) precisa chamar `queryClient.clear()` no branch SIGNED_OUT do
 * onAuthStateChange — inclusive quando a sessão termina por expiração/
 * revogação, não só pelo botão Sair — para não vazar cache de um tenant para
 * o próximo login na mesma aba. useAuthSync roda dentro de App() antes do
 * QueryClientProvider ser renderizado, então useQueryClient() não resolve ali;
 * e importar o cliente de App.tsx a partir de userStore.ts arriscaria um
 * import circular. Um singleton isolado resolve os dois lados sem ciclo.
 */
export const queryClient = new QueryClient();
