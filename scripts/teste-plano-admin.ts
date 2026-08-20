import { derivarPlanoEfetivo } from '../src/services/planoEfetivo.ts';
import { derivarEntitlement } from '../worker/src/entitlement.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, atual: unknown, esperado: unknown) {
  if (JSON.stringify(atual) === JSON.stringify(esperado)) {
    console.log(`  ok   ${nome}`);
    ok++;
  } else {
    console.error(`  FALHA ${nome}:`, atual, '!=', esperado);
    falhas++;
  }
}

const AGORA = Date.parse('2026-08-20T12:00:00.000Z');
const FUTURO = '2026-09-20T12:00:00.000Z';
const PASSADO = '2026-07-20T12:00:00.000Z';

console.log('\nPlano administrativo — sobreposição segura');

const casos = [
  ['grátis puro', { plano: 'pro', status: 'canceled', current_period_end: PASSADO }, 'gratis'],
  ['Pro pago', { plano: 'pro', status: 'active', current_period_end: FUTURO }, 'pro'],
  ['Pro manual sem assinatura', {
    plano: 'pro', status: 'canceled', current_period_end: PASSADO,
    admin_plano_override: 'pro', admin_override_ativo: true, admin_override_ate: FUTURO,
  }, 'pro'],
  ['manual vencido não vale', {
    plano: 'pro', status: 'canceled', current_period_end: PASSADO,
    admin_plano_override: 'empresa', admin_override_ativo: true, admin_override_ate: PASSADO,
  }, 'gratis'],
  ['manual revogado não vale', {
    plano: 'pro', status: 'canceled', current_period_end: PASSADO,
    admin_plano_override: 'empresa', admin_override_ativo: false, admin_override_ate: FUTURO,
  }, 'gratis'],
  ['Empresa paga não é rebaixada por Pro manual', {
    plano: 'empresa', status: 'active', current_period_end: FUTURO,
    admin_plano_override: 'pro', admin_override_ativo: true, admin_override_ate: FUTURO,
  }, 'empresa'],
  ['Pro pago pode receber Empresa manual', {
    plano: 'pro', status: 'active', current_period_end: FUTURO,
    admin_plano_override: 'empresa', admin_override_ativo: true, admin_override_ate: FUTURO,
  }, 'empresa'],
] as const;

for (const [nome, linha, esperado] of casos) {
  const app = derivarPlanoEfetivo(linha, AGORA).planoEfetivo;
  const worker = derivarEntitlement(linha, AGORA).plano;
  checar(`${nome} (app)`, app, esperado);
  checar(`${nome} (worker)`, worker, esperado);
  checar(`${nome} — app/worker iguais`, app, worker);
}

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
