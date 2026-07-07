/**
 * Diálogos para as telas DESKTOP (web-only): o Alert do react-native-web é
 * um no-op (`static alert() {}`), então confirmação de exclusão nunca abria
 * e erros falhavam em silêncio (achado do gate v4). Estas telas só montam na
 * web ≥1024px, então window.alert/confirm são seguros e nativos do navegador.
 */
export function avisar(titulo: string, mensagem?: string): void {
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(mensagem ? `${titulo}\n\n${mensagem}` : titulo);
  }
}

export function confirmar(titulo: string, mensagem?: string): boolean {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(mensagem ? `${titulo}\n\n${mensagem}` : titulo);
  }
  return false; // sem window (nunca no fluxo real): não destrói nada
}
