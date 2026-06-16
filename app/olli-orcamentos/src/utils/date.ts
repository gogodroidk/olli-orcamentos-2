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

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function parseDateBR(br: string): string {
  // DD/MM/AAAA → ISO
  const [d, m, y] = br.split('/');
  if (!d || !m || !y) return br;
  return `${y}-${m}-${d}`;
}

export function formatDateBR(iso: string): string {
  if (!iso) return '';
  if (iso.includes('/')) return iso; // already BR
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
