/**
 * Texto "Vale até hoje/amanhã às HH:MM" do Pix do plano. Sempre derivado do
 * `expiresAt` que o gateway devolveu: sem data válida (ou já vencida) devolve
 * `null` e a tela omite a linha — nunca inventa prazo.
 */
export function textoValidadePix(expiresAt: string | null | undefined, agora: Date = new Date()): string | null {
  if (!expiresAt) return null;
  const fim = new Date(expiresAt);
  if (Number.isNaN(fim.getTime()) || fim.getTime() <= agora.getTime()) return null;
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(fim) - dia(agora)) / 86_400_000);
  const hora = `${String(fim.getHours()).padStart(2, '0')}:${String(fim.getMinutes()).padStart(2, '0')}`;
  if (dias === 0) return `Vale até hoje às ${hora}`;
  if (dias === 1) return `Vale até amanhã às ${hora}`;
  const data = `${String(fim.getDate()).padStart(2, '0')}/${String(fim.getMonth() + 1).padStart(2, '0')}`;
  return `Vale até ${data} às ${hora}`;
}
