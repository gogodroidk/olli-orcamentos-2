/**
 * Diálogos para as telas DESKTOP (web-only). Usavam window.alert/confirm crus
 * — no-op-feio fora do tema (achado P1-10 do gate de design system). Agora
 * delegam para <DialogoDesktopHost> (src/components/DialogoDesktopHost.tsx),
 * montado uma vez no topo do App: cores da marca, respeita "reduzir
 * movimento" e resolve foco/acessibilidade via Modal do RN.
 *
 * `avisar` continua FIRE-AND-FORGET (void) — a assinatura NÃO mudou, então as
 * dezenas de chamadas existentes continuam compilando e funcionando sem tocar
 * em uma linha delas.
 *
 * `confirmar` agora é ASSÍNCRONO (Promise<boolean>, era boolean síncrono): um
 * diálogo React não tem como responder de forma síncrona. ATENÇÃO — isto é
 * uma mudança de contrato que o `tsc` NÃO pega sozinho: `if (confirmar(...))`
 * sem `await` vira `if (Promise)`, que é SEMPRE truthy, e a ação (excluir
 * cliente/OS/orçamento) roda sem confirmação nenhuma. TODO chamador precisa
 * ser `await confirmar(...)` dentro de um handler `async` — os chamadores
 * existentes já foram auditados e convertidos nesta mudança.
 */
import { enfileirarAviso, enfileirarConfirmacao } from '../../components/DialogoDesktopHost';

export function avisar(titulo: string, mensagem?: string): void {
  enfileirarAviso(titulo, mensagem);
}

export function confirmar(titulo: string, mensagem?: string): Promise<boolean> {
  return enfileirarConfirmacao(titulo, mensagem);
}
