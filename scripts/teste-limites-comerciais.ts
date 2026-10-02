import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preautorizarUsoIa } from '../worker/src/creditos.js';
import * as limites from '../src/services/limitesComerciais.ts';
import {
  interpretarReservaEnvio,
  interpretarEstadoOferta,
  interpretarInicioTrial,
  mensagemBloqueioEnvio,
  envioSemRegistro,
  TRIAL_PRO_DIAS,
} from '../src/services/limitesComerciais.ts';
import * as entitlements from '../src/services/entitlements.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const sql = ler('../supabase/migrations/20260905053000_cota_orcamentos_trial_pro.sql');
const sqlEntitlementSeguro = ler('../supabase/migrations/20260914115639_harden_billing_entitlement_status.sql');
const mobile = ler('../src/screens/VisualizarOrcamentoScreen.tsx');
const planosMobile = ler('../src/services/planos.ts');
const web = ler('../webapp/src/pages/olli/orcamentos/index.tsx');
const eventosWorker = ler('../worker/src/monetizationEvents.js');
const creditosWorker = ler('../worker/src/creditos.js');

// Grátis ILIMITADO (decisão do dono, 01/10/2026): a constante da cota SAIU da fonte.
// Se alguém a recriar, qualquer tela voltaria a poder escrever "até N orçamentos".
assert.equal('ORCAMENTOS_ENVIADOS_GRATIS_MES' in limites, false, 'a cota do Grátis não existe mais na fonte');
assert.equal('ORCAMENTOS_ENVIADOS_GRATIS_MES' in entitlements, false, 'nem reexportada pelos entitlements');
assert.equal(TRIAL_PRO_DIAS, 14, 'o trial aprovado tem 14 dias');

const reservada = interpretarReservaEnvio({
  permitido: true,
  plano_efetivo: 'gratis',
  usados: 1,
  restantes: 4,
  contabilizado_agora: true,
  trial_elegivel: false,
  motivo: 'dentro_da_cota',
  requer_confirmacao: true,
  reserva_token: '12345678-1234-1234-1234-123456789abc',
});
assert.equal(reservada.permitido, true);
assert.equal(reservada.requerConfirmacao, true);
assert.equal(reservada.reservaToken, '12345678-1234-1234-1234-123456789abc');
assert.equal(reservada.usados, 1);
assert.equal('restantes' in reservada, false, 'o app novo não carrega "restantes"');
assert.equal('limite' in reservada, false, 'o app novo não carrega "limite"');

// O 6º, o 10º, o 50º envio do mês: o servidor novo responde dentro_da_cota com
// restantes null, e o app envia.
for (const usados of [6, 10, 50]) {
  const r = interpretarReservaEnvio({
    permitido: true, plano_efetivo: 'gratis', usados, restantes: null, contabilizado_agora: true,
    trial_elegivel: false, motivo: 'dentro_da_cota', requer_confirmacao: true,
    reserva_token: '12345678-1234-1234-1234-123456789abc',
  });
  assert.equal(r.permitido, true, `envio nº ${usados} do mês é permitido`);
  assert.equal(r.usados, usados);
}

// Servidor ANTIGO (migration 20261002150000 ainda não aplicada) dizendo cota_esgotada:
// a cota não existe mais no produto — o envio segue, só sem registro.
const antigo = interpretarReservaEnvio({
  permitido: false, plano_efetivo: 'gratis', usados: 5, restantes: 0, contabilizado_agora: false,
  trial_elegivel: true, motivo: 'cota_esgotada', requer_confirmacao: false, reserva_token: null,
});
assert.equal(antigo.permitido, true, 'cota_esgotada do servidor antigo não barra mais o envio');
assert.equal(antigo.motivo, 'sem_registro');
assert.equal(antigo.reservaToken, null, 'sem registro, sem token: não há o que confirmar');
assert.equal(antigo.trialElegivel, false, 'falha de registro não inventa elegibilidade');

const pago = interpretarReservaEnvio({
  permitido: true,
  plano_efetivo: 'pro',
  usados: 0,
  restantes: null,
  contabilizado_agora: false,
  trial_elegivel: false,
  motivo: 'plano_pago',
  requer_confirmacao: false,
  reserva_token: null,
});
assert.equal(pago.motivo, 'plano_pago');
assert.equal(pago.planoEfetivo, 'pro');

const ofertaAtiva = interpretarEstadoOferta({
  plano_efetivo: 'pro',
  limite_envios: null,
  envios_usados: 2,
  envios_restantes: null,
  trial_estado: 'active',
  trial_termina_em: '2026-09-19T12:00:00.000Z',
  trial_dias: 14,
  requires_card: false,
  auto_renews: false,
  data_disposition: 'preserve',
});
assert.equal(ofertaAtiva?.planoEfetivo, 'pro', 'trial ativo precisa liberar o Pro');
assert.equal(ofertaAtiva?.trialEstado, 'active');
const ofertaGratisAntiga = interpretarEstadoOferta({
  plano_efetivo: 'gratis', limite_envios: 5, envios_usados: 7, envios_restantes: 0,
  trial_estado: 'ended', trial_termina_em: null, trial_dias: 14,
  requires_card: false, auto_renews: false, data_disposition: 'preserve',
});
assert.ok(ofertaGratisAntiga, 'oferta do servidor antigo continua legível');
assert.equal(ofertaGratisAntiga.enviosUsados, 7);
assert.equal('limiteEnvios' in ofertaGratisAntiga, false, 'o limite 5 do servidor antigo é ignorado');
assert.equal('enviosRestantes' in ofertaGratisAntiga, false);
assert.equal(
  interpretarEstadoOferta({ ...ofertaAtiva, trial_estado: 'active' }),
  null,
  'o parser deve rejeitar nomes de campo do cliente e exigir o contrato do servidor',
);
assert.equal(interpretarInicioTrial({
  iniciado: true,
  replay: false,
  termina_em: '2026-09-19T12:00:00.000Z',
  trial_dias: 14,
  requires_card: false,
  auto_renews: false,
  data_disposition: 'preserve',
})?.iniciado, true);

assert.deepEqual(
  interpretarReservaEnvio({ permitido: true, motivo: 'dentro_da_cota', requer_confirmacao: true }),
  envioSemRegistro(),
  'reserva sem token vira "sem registro" (envia, mas não confirma nem inicia teste)',
);
const estranho = interpretarReservaEnvio({ permitido: 'sim', motivo: 'dentro_da_cota', plano_efetivo: 'empresa' });
assert.equal(estranho.motivo, 'sem_registro', 'payload inesperado é nomeado, não escondido');
assert.equal(estranho.planoEfetivo, 'gratis', 'payload inesperado não inventa plano');
assert.equal(estranho.reservaToken, null, 'nem token');
assert.equal(envioSemRegistro().permitido, true, 'o Grátis é ilimitado: falha de registro nunca barra o envio');
assert.doesNotMatch(mensagemBloqueioEnvio(envioSemRegistro()), /\d+ orçamentos|cota|limite/i, 'nenhuma copy de cota sobrou');

assert.match(sql, /primary key \(tenant_id, periodo, orcamento_id\)/i, 'idempotência deve ser por tenant/mês/orçamento');
assert.match(sql, /pg_advisory_xact_lock/i, 'a cota precisa de trava transacional');
assert.match(sql, /auth\.uid\(\)/i, 'a identidade precisa vir da sessão');
assert.match(sql, /tenant_ambiguo/i, 'mais de uma organização deve falhar fechada');
assert.match(sql, /estado\s+text not null default 'reservado'/i, 'entrega precisa reservar antes de confirmar');
assert.match(sql, /reserva_expira_em/i, 'reserva abandonada precisa expirar');
assert.match(sql, /confirmar_envio_orcamento_gratis/i, 'sucesso precisa confirmar o consumo');
assert.match(sql, /cancelar_reserva_envio_orcamento_gratis/i, 'falha precisa liberar a reserva');
assert.match(sql, /interval '14 days'/i, 'janela autoritativa do trial deve ter 14 dias');
assert.match(sql, /'requires_card', false/i, 'trial não pede cartão');
assert.match(sql, /'auto_renews', false/i, 'trial não pode cobrar automaticamente');
assert.doesNotMatch(sql, /delete\s+from\s+public\.(orcamentos|clientes|produtos)/i, 'downgrade não apaga dados do produto');
assert.match(sql, /revoke all on table public\.trials_comerciais from public, anon, authenticated/i);
assert.match(sql, /grant execute on function public\.iniciar_trial_pro\(text\) to authenticated/i);
assert.match(sql, /grant execute on function public\.plano_comercial_para_usuario\(uuid\) to service_role/i);
assert.match(sql, /revoke all on function public\.plano_comercial_para_usuario\(uuid\) from public, anon, authenticated/i);
assert.match(sqlEntitlementSeguro, /status in \('active', 'trialing'\)/i, 'entitlement pago aceita somente status fechados');
assert.doesNotMatch(sqlEntitlementSeguro, /status in \([^)]*past_due/i, 'past_due sem política não libera plano');
assert.match(sqlEntitlementSeguro, /current_period_end is not null/i, 'vigência paga precisa existir');
assert.match(sqlEntitlementSeguro, /current_period_end > p_agora/i, 'vigência paga precisa estar no futuro');
assert.match(sqlEntitlementSeguro, /revoke all on function public\.plano_comercial_efetivo/i, 'função privilegiada não fica pública');

assert.match(mobile, /reservarEnvioOrcamento\(orc\.id, canal\)/, 'app deve autorizar antes de entregar');
assert.match(mobile, /cancelarReservaEnvioOrcamento/, 'app deve cancelar reserva se a entrega falhar');
assert.match(web, /reservarEnvioOrcamento\(linha\.id, "pdf"\)/, 'painel web registra o envio (teste automático do Pro)');
assert.doesNotMatch(web, /cotaEsgotada|mensagemBloqueioEnvio/, 'painel web não barra mais o PDF por cota');
assert.match(web, /confirmarEnvioOrcamento/, 'painel web só deve consumir após abrir o PDF');
assert.match(eventosWorker, /MONETIZATION_TRIAL_DAYS\s*=\s*14/, 'contrato do worker precisa concordar com a oferta');
assert.match(creditosWorker, /rpc\/plano_comercial_para_usuario/, 'IA do Worker precisa reconhecer trial autoritativo');
assert.match(creditosWorker, /if \(trial\.ok\)/, 'RPC ausente deve degradar para a cota atual, sem derrubar o rollout');
assert.match(
  planosMobile,
  /export async function getPlanoCacheado[\s\S]*?getCurrentUser\(\)[\s\S]*?planoCacheValido\(cache, user\.id\)/,
  'cache frio exige a sessão atual e valida o dono antes de reabrir plano',
);

const fetchOriginal = globalThis.fetch;
const chamadas: string[] = [];
try {
  globalThis.fetch = (async (entrada: string | URL | Request) => {
    const url = String(entrada);
    chamadas.push(url);
    if (url.includes('/rest/v1/assinaturas?')) return new Response('[]', { status: 200 });
    if (url.endsWith('/rest/v1/rpc/plano_comercial_para_usuario')) {
      return new Response(JSON.stringify('pro'), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`consulta inesperada: ${url}`);
  }) as typeof fetch;
  assert.deepEqual(
    await preautorizarUsoIa(
      { SUPABASE_URL: 'https://teste.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'chave-falsa-de-teste' },
      { id: '11111111-1111-4111-8111-111111111111' },
    ),
    { permitido: true },
    'trial Pro autoritativo deve liberar a IA antes de tocar em cota ou crédito',
  );
  assert.equal(chamadas.some((url) => url.includes('/ia_uso_gratis')), false, 'trial ativo não consome cota grátis');
} finally {
  globalThis.fetch = fetchOriginal;
}

console.log('OK — Grátis ilimitado, registro de envio em duas fases e trial Pro validados.');
