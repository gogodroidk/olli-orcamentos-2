/**
 * Datas do documento para EXIBIR em pt-BR (DD/MM/AAAA), venham de onde vierem.
 *
 * O editor do app grava DD/MM/AAAA, mas o mesmo campo chega como AAAA-MM-DD ou como
 * timestamp do Postgres ("2026-05-12T16:14:14.684482+00:00") quando o orçamento
 * passou pelo painel ou pelo sync. Antes a tela mostrava o valor cru.
 *
 * Regra de exibição (nunca some com o dado):
 *   - DD/MM/AAAA, AAAA-MM-DD e timestamp ISO viram DD/MM/AAAA;
 *   - timestamp vira o dia no fuso do aparelho (não o dia em UTC, que à noite no
 *     Brasil já é o seguinte);
 *   - texto que não é data reconhecível volta como veio (aparado), em vez de virar
 *     vazio: esconder o que o prestador digitou seria pior que mostrá-lo cru.
 *
 * TypeScript puro (sem React Native): roda nos testes em Node.
 */

const BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const SO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}/;

function diaReal(d: number, m: number, y: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function br(d: number, m: number, y: number): string {
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function formatarDataBR(valor: string | null | undefined): string {
  const bruto = (valor ?? '').trim();
  if (!bruto) return '';

  const emBr = BR.exec(bruto);
  if (emBr) {
    const [d, m, y] = [Number(emBr[1]), Number(emBr[2]), Number(emBr[3])];
    return diaReal(d, m, y) ? br(d, m, y) : bruto;
  }

  const soDia = SO_DIA.exec(bruto);
  if (soDia) {
    const [y, m, d] = [Number(soDia[1]), Number(soDia[2]), Number(soDia[3])];
    return diaReal(d, m, y) ? br(d, m, y) : bruto;
  }

  const ts = TIMESTAMP.exec(bruto);
  if (ts) {
    // O Postgres manda microssegundos (6 casas); nem todo motor JS aceita mais
    // que 3. Corta para milissegundos e troca o espaço por "T" antes de ler.
    const normalizado = bruto.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
    const instante = new Date(normalizado);
    if (Number.isFinite(instante.getTime())) {
      return br(instante.getDate(), instante.getMonth() + 1, instante.getFullYear());
    }
    // Instante ilegível: ainda dá para mostrar o dia escrito na própria string.
    const [y, m, d] = [Number(ts[1]), Number(ts[2]), Number(ts[3])];
    if (diaReal(d, m, y)) return br(d, m, y);
  }

  return bruto;
}
