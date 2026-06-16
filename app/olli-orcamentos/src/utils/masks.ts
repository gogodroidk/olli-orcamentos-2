// Máscaras e formatação para o padrão brasileiro.
// Todas as funções recebem o texto cru e devolvem o texto formatado.

function onlyDigits(v: string): string {
  return (v ?? '').replace(/\D/g, '');
}

/** (11) 95875-8030 — aceita fixo (10 díg) e celular (11 díg) */
export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.replace(/(\d{0,2})/, '($1');
  if (d.length <= 6) return d.replace(/(\d{2})(\d{0,4})/, '($1) $2');
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

/** 000.000.000-00 */
export function maskCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/** 00.000.000/0001-00 */
export function maskCNPJ(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Detecta automaticamente: ≤11 díg = CPF, senão CNPJ */
export function maskCpfCnpj(value: string): string {
  const d = onlyDigits(value);
  return d.length <= 11 ? maskCPF(value) : maskCNPJ(value);
}

/** 00000-000 */
export function maskCEP(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

/** DD/MM/AAAA com validação suave de limites de dia/mês */
export function maskDate(value: string): string {
  let d = onlyDigits(value).slice(0, 8);
  if (d.length >= 1) {
    // limita dia 01-31
    if (d.length >= 2) {
      let dd = parseInt(d.slice(0, 2), 10);
      if (dd > 31) dd = 31;
      if (dd === 0) dd = 1;
      d = String(dd).padStart(2, '0') + d.slice(2);
    }
    // limita mês 01-12
    if (d.length >= 4) {
      let mm = parseInt(d.slice(2, 4), 10);
      if (mm > 12) mm = 12;
      if (mm === 0) mm = 1;
      d = d.slice(0, 2) + String(mm).padStart(2, '0') + d.slice(4);
    }
  }
  if (d.length <= 2) return d;
  if (d.length <= 4) return d.replace(/(\d{2})(\d{1,2})/, '$1/$2');
  return d.replace(/(\d{2})(\d{2})(\d{1,4})/, '$1/$2/$3');
}

/**
 * Máscara de moeda enquanto digita: os dígitos preenchem da direita
 * para a esquerda (centavos primeiro). Ex: digitar "1","2","5","0"
 * vira "12,50" e depois "125,00". Retorna { masked, value }.
 */
export function maskCurrencyInput(value: string): { masked: string; value: number } {
  const digits = onlyDigits(value);
  if (!digits) return { masked: '', value: 0 };
  const cents = parseInt(digits, 10);
  const num = cents / 100;
  const masked = num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return { masked, value: num };
}

/** Converte um número já conhecido para a string da máscara (sem R$). */
export function currencyToMask(num: number): string {
  if (!num) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Valida CPF pelos dígitos verificadores. */
export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(cpf[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === parseInt(cpf[10], 10);
}

/** ISO (AAAA-MM-DD) -> DD/MM/AAAA, ou retorna o que já estiver em BR. */
export function isoToBR(iso?: string): string {
  if (!iso) return '';
  if (iso.includes('/')) return iso;
  const [y, m, d] = iso.split('T')[0].split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** DD/MM/AAAA -> ISO (AAAA-MM-DD). Retorna '' se incompleto. */
export function brToISO(br?: string): string {
  if (!br) return '';
  const d = onlyDigits(br);
  if (d.length !== 8) return '';
  return `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}
