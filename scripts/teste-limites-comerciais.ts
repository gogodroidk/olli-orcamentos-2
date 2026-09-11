import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preautorizarUsoIa } from '../worker/src/creditos.js';
import {
  interpretarReservaEnvio,
  interpretarEstadoOferta,
  interpretarInicioTrial,
  mensagemBloqueioEnvio,
  ORCAMENTOS_ENVIADOS_GRATIS_MES,
  reservaIndisponivel,
  TRIAL_PRO_DIAS,
} from '../src/services/limitesComerciais.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const sql = ler('../supabase/migrations/20260905053000_cota_orcamentos_trial_pro.sql');
const mobile = ler('../src/screens/VisualizarOrcamentoScreen.tsx');
const planosMobile = ler('../src/services/planos.ts');
const web = ler('../webapp/src/pages/olli/orcamentos/index.tsx');
const eventosWorker = ler('../worker/src/monetizationEvents.js');
const creditosWorker = ler('../worker/src/creditos.js');

assert.equal(ORCAMENTOS_ENVIADOS_GRATIS_MES, 5, 'a cota do Grátis precisa ser explícita e única');
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
assert.equal(reservada.restantes, 4);

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
assert.equal(pago.limite, null);
assert.equal(pago.restantes, null);

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
  reservaIndisponivel(),
  'reserva sem token deve falhar fechada',
);
assert.equal(
  interpretarReservaEnvio({ permitido: 'sim', motivo: 'dentro_da_cota' }).permitido,
  false,
  'payload inesperado não pode inventar autorização',
);
assert.match(mensagemBloqueioEnvio({ ...reservaIndisponivel(), motivo: 'cota_esgotada' }), /5 orçamentos/);
assert.match(mensagemBloqueioEnvio({ ...reservaIndisponivel(), motivo: 'cota_esgotada' }), /14 dias/);

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

assert.match(mobile, /reservarEnvioOrcamento\(orc\.id, canal\)/, 'app deve autorizar antes de entregar');
assert.match(mobile, /cancelarReservaEnvioOrcamento/, 'app deve cancelar reserva se a entrega falhar');
assert.match(web, /reservarEnvioOrcamento\(linha\.id, "pdf"\)/, 'painel web deve aplicar a mesma cota');
assert.match(web, /confirmarEnvioOrcamento/, 'painel web só deve consumir após abrir o PDF');
assert.match(eventosWorker, /MONETIZATION_TRIAL_DAYS\s*=\s*14/, 'contrato do worker precisa concordar com a oferta');
assert.match(creditosWorker, /rpc\/plano_comercial_para_usuario/, 'IA do Worker precisa reconhecer trial autoritativo');
assert.match(creditosWorker, /if \(trial\.ok\)/, 'RPC ausente deve degradar para a cota atual, sem derrubar o rollout');
assert.match(
  planosMobile,
  /export async function getPlanoCacheado[\s\S]*?return cacheValido\(cache\) \? cache\.plano : null;/,
  'cache frio não pode reabrir trial Pro expirado',
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

console.log('OK — cota mensal, reserva em duas fases e trial Pro opt-in validados.');
