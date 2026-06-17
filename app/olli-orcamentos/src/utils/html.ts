/**
 * Escapa dados do usuário antes de interpolar em HTML (PDF do orçamento/recibo,
 * que na web é escrito num iframe same-origin). Sem isso, um nome de cliente com
 * `<`, `>`, `&`, `"` quebra o layout e, na PWA, um `<script>`/`<img onerror>`
 * coladono campo pode EXECUTAR no contexto da página (XSS). Use em TODA
 * interpolação de string livre do usuário; NÃO use em valores controlados
 * (números já formatados, cor hexadecimal validada, SVG fixo).
 */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Valida uma cor hexadecimal (`#RGB` ou `#RRGGBB`). Retorna `fallback` se
 * inválida — evita injeção quando uma cor de marca configurável entra num
 * bloco `<style>`/atributo SVG.
 */
export function safeHexColor(s: unknown, fallback: string): string {
  const v = String(s ?? '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : fallback;
}
