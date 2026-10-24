/**
 * GATE DO CORTE DO GRÁTIS (P0-09): copy e banco precisam concordar ao minuto.
 *
 *   node scripts/corte-gratis-confere.ts                       # imprime o UPDATE e o SELECT de conferência
 *   node scripts/corte-gratis-confere.ts --corte "<valor lido do banco>"   # exit 0 só se bate com a constante
 *
 * Regra do pacote (Entregas Claude/OLLI/2026-10-24-pacote-corte-gratis): `CORTE_GRATIS_DATA` = D+1 e o banco recebe
 * `corte = 'D+1 00:00 -03'` (Brasília, sem horário de verão desde 2019). Se não bater, NÃO publica.
 * Nunca executa SQL: só imprime e compara. Quem roda o UPDATE é o TECH, com ordem do Igor.
 */
import { CORTE_GRATIS_DATA } from '../src/services/planosBase.ts';

const FUSO = 'America/Sao_Paulo';

/** `AAAA-MM-DD HH:MM:SS` do instante no fuso de Brasília. `null` = valor que não é data. */
export function emBrasilia(valor: string): string | null {
  const ms = Date.parse(valor);
  if (!Number.isFinite(ms)) return null;
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
}

export type Conferencia = { ok: boolean; motivo: string };

/** O `corte` do banco bate com a constante da copy? (constante null ⇒ banco tem de estar null/vazio) */
export function corteConfere(corteBanco: string | null | undefined, constante: string | null): Conferencia {
  const vazio = corteBanco === null || corteBanco === undefined || corteBanco === '' || corteBanco === 'null';
  if (constante === null) {
    return vazio ? { ok: true, motivo: 'desligado nos dois lados (copy "ilimitado" é verdade)' } : { ok: false, motivo: 'banco tem corte mas a copy ainda diz ilimitado' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(constante)) return { ok: false, motivo: `CORTE_GRATIS_DATA inválida: ${constante}` };
  if (vazio) return { ok: false, motivo: 'a copy já anuncia o corte mas o banco está sem corte (null)' };
  const local = emBrasilia(String(corteBanco));
  if (!local) return { ok: false, motivo: `corte do banco ilegível: ${corteBanco}` };
  const esperado = `${constante} 00:00:00`;
  return local === esperado
    ? { ok: true, motivo: `corte do banco = ${esperado} (Brasília) = CORTE_GRATIS_DATA` }
    : { ok: false, motivo: `corte do banco em Brasília é ${local}, a constante pede ${esperado}` };
}

/** SQL de ligar/desligar e de conferir, a partir da constante. */
export function sqlDoCorte(constante: string | null): { atualizar: string; conferir: string } {
  if (constante === null) {
    return {
      atualizar: 'update public.limite_gratis_config set corte = null, atualizado_em = now();',
      conferir: 'select corte from public.limite_gratis_config;  -- esperado: corte = null',
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(constante)) throw new Error(`CORTE_GRATIS_DATA inválida: ${constante}`);
  return {
    atualizar: `update public.limite_gratis_config set corte = timestamptz '${constante} 00:00:00-03', atualizado_em = now();`,
    conferir:
      `select corte, (corte at time zone 'America/Sao_Paulo') = timestamp '${constante} 00:00:00' as confere ` +
      `from public.limite_gratis_config;  -- esperado: confere = true; passe o valor de corte em --corte para este script`,
  };
}

// CLI (não roda quando importado pelo teste)
if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--corte');
  if (i >= 0) {
    const r = corteConfere(process.argv[i + 1], CORTE_GRATIS_DATA);
    console.log(`${r.ok ? 'CONFERE' : 'NÃO CONFERE — NÃO PUBLICAR'}: ${r.motivo}`);
    process.exit(r.ok ? 0 : 1);
  }
  const s = sqlDoCorte(CORTE_GRATIS_DATA);
  console.log(`CORTE_GRATIS_DATA = ${CORTE_GRATIS_DATA ?? 'null (desligado)'}\n\n-- passo do banco (SÓ com "pode subir" do Igor):\n${s.atualizar}\n\n-- conferência:\n${s.conferir}`);
}
