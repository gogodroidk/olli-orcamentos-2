import {
  MONETIZATION_OFFER_GATES,
  MONETIZATION_OFFER_STAGES,
  MONETIZATION_OFFER_VARIANTS,
  MONETIZATION_OFFER_VERSION,
  criarOfertaExperimento,
} from '../worker/src/monetizationOfferExperiment.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log('  ok   ' + nome); ok++; }
  else { console.error('  FALHA ' + nome); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nMonetização OLLI — fixture local Controle A / Variante B');

const assignment = (variant = 'control', overrides: Record<string, unknown> = {}) => ({
  authority: 'server_experiment_assignment',
  experimentId: 'pro-value-v1',
  variant,
  ...overrides,
});
const activation = (overrides: Record<string, unknown> = {}) => ({
  stage: 'post_value',
  quotesCreated: 3,
  pdfsShared: 0,
  attemptedProFeature: false,
  ...overrides,
});
const readiness = (valor = false, overrides: Record<string, unknown> = {}) => ({
  cashSandboxVerified: valor,
  signedWebhookVerified: valor,
  serverEntitlementVerified: valor,
  trialLedgerVerified: valor,
  downgradeVerified: valor,
  eventsVerified: valor,
  ...overrides,
});
const oferta = (overrides: Record<string, unknown> = {}) => criarOfertaExperimento({
  tenantId: 'tenant-01',
  assignment: assignment(),
  activation: activation(),
  readiness: readiness(),
  ...overrides,
} as any);

checar('versão do fixture é explícita', MONETIZATION_OFFER_VERSION === '2026-09-01.v1');
checar('duas variantes e somente duas', MONETIZATION_OFFER_VARIANTS.join(',') === 'control,contextual_trial');
checar('estágios críticos e pós-valor são fechados', MONETIZATION_OFFER_STAGES.includes('signup') && MONETIZATION_OFFER_STAGES.includes('post_value'));
checar('seis gates técnicos são declarados', MONETIZATION_OFFER_GATES.length === 6 && MONETIZATION_OFFER_GATES.includes('downgradeVerified'));

const controle = oferta();
checar('Controle A usa preview passivo', controle.canRender && controle.variant === 'control' && controle.surface === 'passive_pro_preview');
checar('Controle A não promete trial', controle.trialDays === 0 && !controle.authoritativeEndDateRequiredAfterOptIn);
checar('Controle A pode existir sem fingir gates de caixa', controle.missingGates.length === 6 && controle.canRender);
checar('toda oferta preserva o núcleo gratuito', controle.fallbackPlan === 'free' && !controle.coreFlowInterrupted);
checar('saída e copy são imutáveis', Object.isFrozen(controle) && Object.isFrozen(controle.copy) && Object.isFrozen(controle.missingGates));

const coreStages = ['signup', 'onboarding', 'first_quote', 'quote_editing', 'pdf_export', 'whatsapp_share'];
checar('cadastro/onboarding/orçamento/PDF/WhatsApp nunca são interrompidos', coreStages.every((stage) => {
  const result = oferta({ activation: activation({ stage, quotesCreated: 10, pdfsShared: 5, attemptedProFeature: true }) });
  return !result.canRender && result.reason === 'core_flow_protected' && !result.coreFlowInterrupted;
}));
const semMarco = oferta({ activation: activation({ quotesCreated: 2, pdfsShared: 0, attemptedProFeature: false }) });
checar('sem marco de valor não há oferta', !semMarco.canRender && semMarco.reason === 'activation_milestone_missing');
checar('terceiro orçamento habilita o marco', controle.milestone === 'third_quote_created');
const primeiroPdf = oferta({ activation: activation({ quotesCreated: 1, pdfsShared: 1 }) });
checar('primeiro PDF é marco de valor', primeiroPdf.canRender && primeiroPdf.milestone === 'first_pdf_shared');
const tentativaPro = oferta({ activation: activation({ quotesCreated: 1, attemptedProFeature: true, stage: 'pro_feature_attempt' }) });
checar('tentativa explícita de recurso Pro é contextual', tentativaPro.canRender && tentativaPro.milestone === 'pro_feature_attempt');

const trialBloqueado = oferta({ assignment: assignment('contextual_trial') });
checar('Variante B falha fechado sem gates', !trialBloqueado.canRender && trialBloqueado.reason === 'technical_gates_incomplete');
checar('lista todos os gates ausentes', trialBloqueado.missingGates.length === MONETIZATION_OFFER_GATES.length);
const gateParcial = oferta({
  assignment: assignment('contextual_trial'),
  readiness: readiness(true, { downgradeVerified: false }),
});
checar('um único gate ausente ainda bloqueia', !gateParcial.canRender && gateParcial.missingGates.join(',') === 'downgradeVerified');
const trialPronto = oferta({
  assignment: assignment('contextual_trial'),
  readiness: readiness(true),
});
checar('Variante B só abre com todos os gates sintéticos', trialPronto.canRender && trialPronto.missingGates.length === 0);
checar('trial é opt-in de 14 dias sem cartão', trialPronto.trialDays === 14 && !trialPronto.requiresCard);
checar('trial não renova nem cobra automaticamente', !trialPronto.autoRenews && trialPronto.copy.disclosure.includes('sem cobrança automática'));
checar('copy oferece continuar no gratuito', trialPronto.copy.secondaryAction === 'Continuar no gratuito' && trialPronto.fallbackPlan === 'free');
checar('copy preserva dados no downgrade', trialPronto.copy.disclosure.includes('seus dados permanecem'));
checar('data final autoritativa é obrigatória após opt-in', trialPronto.authoritativeEndDateRequiredAfterOptIn);
checar('copy não usa urgência falsa', !/última chance|só hoje|agora ou nunca|vagas limitadas/i.test(JSON.stringify(trialPronto.copy)));
checar('copy não promete recurso ilimitado', !/ilimitad/i.test(JSON.stringify(trialPronto.copy)));
checar('saída não expõe preço, provider ou PII', !('price' in trialPronto) && !('provider' in trialPronto) && !('email' in trialPronto) && !('name' in trialPronto));
checar('copy é texto plano sem HTML', !/[<>]/.test(JSON.stringify(trialPronto.copy)));

checar('assignment do cliente é rejeitado', erroCodigo(() => oferta({ assignment: assignment('control', { authority: 'client_assignment' }) })) === 'assignment_nao_autoritativo');
checar('variante desconhecida é rejeitada', erroCodigo(() => oferta({ assignment: assignment('hard_paywall') })) === 'variant_invalida');
checar('PII/campo extra na ativação é rejeitado', erroCodigo(() => oferta({ activation: { ...activation(), email: 'x@y.test' } })) === 'activation_campos_invalidos');
checar('provider/campo extra nos gates é rejeitado', erroCodigo(() => oferta({ readiness: { ...readiness(), provider: 'stripe' } })) === 'readiness_campos_invalidos');
checar('gate não booleano é rejeitado', erroCodigo(() => oferta({ readiness: readiness(false, { eventsVerified: 'sim' }) })) === 'readiness_gate_invalido');
checar('contador negativo é rejeitado', erroCodigo(() => oferta({ activation: activation({ quotesCreated: -1 }) })) === 'quotes_created_invalido');
checar('contador fracionário é rejeitado', erroCodigo(() => oferta({ activation: activation({ pdfsShared: 0.5 }) })) === 'pdfs_shared_invalido');
checar('tenant ausente é rejeitado', erroCodigo(() => criarOfertaExperimento({ tenantId: '', assignment: assignment(), activation: activation(), readiness: readiness() })) === 'tenant_obrigatorio');

const repetidoA = oferta({ assignment: assignment('contextual_trial'), readiness: readiness(true) });
const repetidoB = oferta({ assignment: assignment('contextual_trial'), readiness: readiness(true) });
checar('mesma entrada gera fixture determinístico', JSON.stringify(repetidoA) === JSON.stringify(repetidoB));

if (falhas) {
  console.error('\nFALHOU: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(1);
}
console.log('\nPASSOU: ' + ok + ' ok, 0 falhas');
