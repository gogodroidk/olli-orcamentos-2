import {
  DATASET_POLICY_VERSION,
  DATASET_RETENTION_MAX_DAYS,
  projetarRegistroDataset,
  validarManifestoDataset,
} from '../worker/src/datasetPolicy.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

console.log('\nIA OLLI — manifesto de dataset governado');
const base = {
  purpose: 'ai_training',
  tenantScope: 'tenant-sintetico-01',
  fields: ['orcamentos.status', 'orcamentos.valor_total', 'orcamentos.criado_em'],
  retentionDays: 30,
  createdAt: '2026-08-31T12:00:00Z',
  expiresAt: '2026-09-30T12:00:00Z',
  consent: { mode: 'opt_in', version: 'consent.v1', capturedAt: '2026-08-31T12:01:00Z' },
  pseudonymization: { method: 'hmac_v1', version: 'pseudonym.v1' },
  deletionPlan: { derived: true, embeddings: true, backups: true, models: true },
  killSwitch: true,
  approval: 'human',
  minimumRows: 20,
};
const valido = validarManifestoDataset(base);
checar('manifesto mínimo válido', valido.ok === true && valido.manifesto?.version === DATASET_POLICY_VERSION);
checar('campos permitidos preservados', valido.manifesto?.fields.join(',') === 'orcamentos.status,orcamentos.valor_total,orcamentos.criado_em');
checar('retenção respeita teto', valido.manifesto?.retentionDays === 30 && DATASET_RETENTION_MAX_DAYS === 90);
checar('manifesto congelado', (() => { try { (valido.manifesto as any).purpose = 'outro'; return false; } catch { return true; } })());

const registro = projetarRegistroDataset(valido.manifesto, {
  'orcamentos.status': 'aprovado',
  'orcamentos.valor_total': 100,
  'orcamentos.criado_em': '2026-08-31',
  'clientes.nome': 'não deve entrar',
  prompt: 'não deve entrar',
});
checar('projeção usa apenas o manifesto', Object.keys(registro).sort().join(',') === 'orcamentos.criado_em,orcamentos.status,orcamentos.valor_total');
checar('projeção não carrega prompt/PII extra', !('prompt' in registro) && !('clientes.nome' in registro));

const proibido = validarManifestoDataset({ ...base, fields: ['orcamentos.status', 'clientes.nome', 'clientes.telefone', 'ia.prompt'] });
checar('campo proibido bloqueia manifesto', proibido.ok === false && proibido.erros.some((x) => x.startsWith('campo_proibido')));
const semConsent = validarManifestoDataset({ ...base, consent: { mode: 'opt_out', version: 'v1', capturedAt: '2026-08-31T12:01:00Z' } });
checar('sem opt-in versionado bloqueia', semConsent.ok === false && semConsent.erros.includes('opt_in_versionado_obrigatorio'));
const semPurge = validarManifestoDataset({ ...base, deletionPlan: { derived: true } });
checar('purge incompleto bloqueia', semPurge.ok === false && semPurge.erros.includes('purge_propagado_obrigatorio'));
const semKillSwitch = validarManifestoDataset({ ...base, killSwitch: false });
checar('sem kill switch bloqueia', semKillSwitch.ok === false && semKillSwitch.erros.includes('kill_switch_obrigatorio'));
const semAprovacao = validarManifestoDataset({ ...base, approval: 'automatic' });
checar('sem aprovação humana bloqueia', semAprovacao.ok === false && semAprovacao.erros.includes('aprovacao_humana_obrigatoria'));
const escopoTotal = validarManifestoDataset({ ...base, tenantScope: 'all' });
checar('escopo global bloqueia', escopoTotal.ok === false && escopoTotal.erros.includes('escopo_tenant_obrigatorio_e_limitado'));
const retencaoAlta = validarManifestoDataset({ ...base, retentionDays: 91 });
checar('retenção acima de 90 dias bloqueia', retencaoAlta.ok === false && retencaoAlta.erros.includes('retencao_fora_do_limite:90'));
const expiracaoPassada = validarManifestoDataset({ ...base, expiresAt: '2026-08-30T12:00:00Z' });
checar('expiração não futura bloqueia', expiracaoPassada.ok === false && expiracaoPassada.erros.includes('expires_at_nao_futuro'));
const expiracaoLonga = validarManifestoDataset({ ...base, expiresAt: '2026-12-01T12:00:00Z' });
checar('expiração além da retenção bloqueia', expiracaoLonga.ok === false && expiracaoLonga.erros.includes('expires_at_excede_retencao'));
const minimoBaixo = validarManifestoDataset({ ...base, minimumRows: 3 });
checar('amostra pequena bloqueia', minimoBaixo.ok === false && minimoBaixo.erros.includes('minimo_registros_insuficiente'));

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
