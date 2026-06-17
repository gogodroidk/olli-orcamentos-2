const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Converte ISO para Date sem o salto de fuso em datas "só dia" (AAAA-MM-DD). */
function toLocalDate(iso: string): Date {
  if (DATE_ONLY.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  if (iso.includes('/')) return iso; // já está em BR
  const d = toLocalDate(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = toLocalDate(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatDateForDisplay(iso: string | undefined): string {
  if (!iso) return 'Data não informada';
  return formatDate(iso);
}

export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Data de hoje (AAAA-MM-DD) no fuso LOCAL. Não derivar de toISOString()
 * (que é UTC): à noite no Brasil (UTC-3) o dia UTC já virou o seguinte.
 */
export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Confere se (d/m/y) é uma data de calendário real (rejeita 31/02, 30/02, 31/04…). */
function isRealDate(d: number, m: number, y: number): boolean {
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function parseDateBR(br: string): string {
  // DD/MM/AAAA → ISO. Exige ano de 4 dígitos e dia-do-mês válido.
  const [d, m, y] = (br || '').split('/');
  if (!d || !m || !y) return '';
  if (y.length !== 4) return '';
  const dd = Number(d);
  const mm = Number(m);
  const yy = Number(y);
  if (!isRealDate(dd, mm, yy)) return '';
  return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function formatDateBR(iso: string): string {
  if (!iso) return '';
  if (iso.includes('/')) return iso; // already BR
  // Tolera timestamp ISO (AAAA-MM-DDTHH:mm…): usa só a parte da data.
  const [y, m, d] = iso.split('T')[0].split('-');
  if (!y || !m || !d) return '';
  // Só formata se a data ISO representar um dia de calendário real.
  if (!isRealDate(Number(d), Number(m), Number(y))) return '';
  return `${d}/${m}/${y}`;
}
