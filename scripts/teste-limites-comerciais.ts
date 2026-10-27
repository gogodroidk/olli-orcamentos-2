import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preautorizarUsoIa } from '../worker/src/creditos.js';
import * as limites from '../src/services/limitesComerciais.ts';
import {
  interpretarReservaEnvio,
  interpretarEstadoOferta,
  interpretarInicioTrial,
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

// LIMITE DO GRÁTIS em conta nova (P0-09): cota_esgotada com permitido:false é a ÚNICA recusa.
// O app respeita (a Visualizar para o ENVIO e mostra o aviso); orçamento segue salvo.
const esgotada = interpretarReservaEnvio({
  permitido: false, plano_efetivo: 'gratis', usados: 5, restantes: 0, limite_envios: 5, contabilizado_agora: false,
  trial_elegivel: true, motivo: 'cota_esgotada', requer_confirmacao: false, reserva_token: null,
});
assert.equal(esgotada.permitido, false, 'cota_esgotada recusa o envio');
assert.equal(esgotada.motivo, 'cota_esgotada');
assert.equal(esgotada.limiteEnvios, 5);
assert.equal(esgotada.reservaToken, null);
assert.equal(esgotada.requerConfirmacao, false);
// Só vale com os DOIS sinais: permitido:true + motivo cota_esgotada, ou lixo, nunca recusa.
assert.equal(interpretarReservaEnvio({ permitido: true, motivo: 'cota_esgotada' }).permitido, true, 'sinal contraditório não barra');
assert.equal(interpretarReservaEnvio({ permitido: false, motivo: 'qualquer_outro' }).permitido, true, 'recusa desconhecida não barra (falha aberta)');
assert.equal(interpretarReservaEnvio({ permitido: false }).permitido, true, 'recusa sem motivo não barra');
assert.equal(interpretarReservaEnvio(null).permitido, true, 'resposta nula não barra');
// A tela que envia trata a recusa (senão o servidor barra e o app ignora).
const visualizar = ler('../src/screens/VisualizarOrcamentoScreen.tsx');
assert.match(visualizar, /if \(!reserva\.permitido\)/, 'autorizarEntrega precisa tratar permitido === false');
// Painel web: os DOIS pontos de envio (PDF e WhatsApp) respeitam a recusa — o servidor barra e o painel não pode ignorar.
const painelPdf = ler('../webapp/src/pages/olli/orcamentos/index.tsx');
const painelWhats = ler('../webapp/src/pages/olli/orcamentos/useEnviarWhatsApp.tsx');
assert.match(painelPdf, /if \(!reserva\.permitido\)/, 'painel PDF trata permitido === false');
assert.match(painelWhats, /if \(!reserva\.permitido\)/, 'painel WhatsApp trata permitido === false');
assert.match(ler('../webapp/src/olli/cota-envios.ts'), /export function avisoLimiteEnvios/, 'painel tem o aviso do limite');
assert.doesNotMatch(ler('../webapp/src/olli/cota-envios.ts').match(/avisoLimiteEnvios[\s\S]{0,400}/)?.[0] ?? '', /bloquead/i, 'aviso do painel sem a palavra bloqueado');
assert.doesNotMatch(visualizar.match(/Limite do mês atingido[\s\S]{0,40}/)?.[0] ?? '', /bloquead/i, 'aviso sem a palavra bloqueado');

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
  plano_efetivo: 'gratis', limite_conta_nova: true, limite_envios: 5, envios_usados: 7, envios_restantes: 0,
  trial_estado: 'ended', trial_termina_em: null, trial_dias: 14,
  requires_card: false, auto_renews: false, data_disposition: 'preserve',
});
assert.ok(ofertaGratisAntiga, 'oferta do servidor antigo continua legível');
assert.equal(ofertaGratisAntiga.enviosUsados, 7);
// P0-09: quando o servidor MANDA o teto (conta nova do Grátis com o corte ligado), o app o lê; o app nunca inventa teto.
assert.equal(ofertaGratisAntiga.limiteEnvios, 5);
assert.equal(ofertaGratisAntiga.enviosRestantes, 0);
const semTeto = interpretarEstadoOferta({
  plano_efetivo: 'gratis', limite_envios: null, envios_usados: 40, envios_restantes: null,
  trial_estado: 'ended', trial_termina_em: null, trial_dias: 14,
  requires_card: false, auto_renews: false, data_disposition: 'preserve',
});
assert.equal(semTeto?.limiteEnvios, null, 'conta antiga / corte desligado: sem teto');
assert.equal(semTeto?.enviosRestantes, null);
const teto = (extra: Record<string, unknown>) => interpretarEstadoOferta({
  plano_efetivo: 'gratis', limite_conta_nova: true, limite_envios: 5, envios_usados: 3, envios_restantes: 2,
  trial_estado: 'ended', trial_termina_em: null, trial_dias: 14,
  requires_card: false, auto_renews: false, data_disposition: 'preserve', ...extra,
});
assert.equal(teto({ limite_envios: 0 })?.limiteEnvios, null, 'teto 0 é lixo: sem teto');
// SERVIDOR ANTIGO: manda limite_envios=5 para todo Grátis SEM o sinal limite_conta_nova → o app ignora (nada de 'X de 5' falso).
assert.equal(teto({ limite_conta_nova: undefined })?.limiteEnvios, null, 'sem o sinal do servidor novo: sem teto');
assert.equal(teto({ limite_conta_nova: false })?.limiteEnvios, null, 'sinal falso: sem teto');
assert.deepEqual(limites.contadorEnvios(teto({ limite_conta_nova: undefined, envios_usados: 4 })), { mostrar: false }, 'servidor antigo nunca gera contador');
assert.equal(teto({ limite_envios: '5' })?.limiteEnvios, null, 'teto em texto é lixo: sem teto');
assert.equal(teto({ plano_efetivo: 'pro' })?.limiteEnvios, null, 'Pro nunca tem teto');
assert.equal(teto({ envios_restantes: -1 })?.enviosRestantes, null, 'restantes negativo é lixo');

// CONTA ANTIGA no limite (D+30): o sinal próprio `limite_conta_antiga` liga o teto/contador; o aviso vem em `aviso_limite_antigas`.
assert.equal(teto({ limite_conta_nova: false, limite_conta_antiga: true })?.limiteEnvios, 5, 'antiga limitada: teto lido');
assert.equal(teto({ limite_conta_nova: undefined, limite_conta_antiga: false })?.limiteEnvios, null, 'antiga ainda não limitada: sem teto');
assert.deepEqual(
  limites.contadorEnvios(teto({ limite_conta_nova: false, limite_conta_antiga: true, envios_usados: 4, envios_restantes: 1 })),
  limites.contadorEnvios(teto({ envios_usados: 4, envios_restantes: 1 })),
  'antiga limitada tem o mesmo contador da nova',
);
const semAviso = teto({ limite_conta_nova: false });
assert.equal(semAviso?.avisoLimiteAntigas, null, 'sem aviso do servidor: null');
const comAviso = (extra: Record<string, unknown> = {}) => teto({
  limite_conta_nova: false, limite_envios: null, envios_restantes: null, envios_usados: 3,
  aviso_limite_antigas: { a_partir_de: '2026-11-24T03:00:00+00:00', usados_30d: 7 }, ...extra,
});
assert.deepEqual(comAviso()?.avisoLimiteAntigas, { aPartirDe: '2026-11-24T03:00:00+00:00', usados30d: 7, cienciaRegistrada: false });
assert.equal(
  comAviso({ aviso_limite_antigas: { a_partir_de: '2026-11-24T03:00:00Z', usados_30d: 7, ciencia_registrada: true } })?.avisoLimiteAntigas?.cienciaRegistrada,
  true, 'ciência já gravada no servidor',
);
assert.equal(comAviso({ aviso_limite_antigas: { a_partir_de: 'lixo', usados_30d: 7 } })?.avisoLimiteAntigas, null, 'data lixo: sem aviso');
assert.equal(comAviso({ aviso_limite_antigas: { a_partir_de: '2026-11-24T03:00:00Z', usados_30d: -1 } })?.avisoLimiteAntigas, null, 'N negativo: sem aviso');
assert.equal(comAviso({ plano_efetivo: 'pro' })?.avisoLimiteAntigas, null, 'Pro não recebe aviso');
const agoraD = new Date('2026-10-24T18:00:00Z');
assert.deepEqual(limites.avisoAntigas(null, 5, agoraD), { mostrar: false }, 'oferta que não carregou: nada');
assert.deepEqual(limites.avisoAntigas(semAviso, 5, agoraD), { mostrar: false }, 'sem sinal do servidor: nada');
const av = limites.avisoAntigas(comAviso(), 5, agoraD);
assert.ok(av.mostrar);
assert.equal(av.dataBR, '24/11/2026', 'D+30 00:00 -03 = 03:00Z cai no dia 24 em Brasília');
assert.equal(av.texto, 'A partir de 24/11/2026 o Grátis passa a permitir até 5 envios por mês. Você usou 7 nos últimos 30 dias.');
assert.equal(av.chave, 'olli:aviso_limite_antigas:2026-11-24T03:00:00+00:00');
assert.match((limites.avisoAntigas(comAviso({ aviso_limite_antigas: { a_partir_de: '2026-11-24T03:00:00Z', usados_30d: 1 } }), 5, agoraD) as { texto: string }).texto, /Você usou 1 nos últimos/);
assert.deepEqual(limites.avisoAntigas(comAviso(), 5, new Date('2026-11-24T03:00:00Z')), { mostrar: false }, 'depois do início do limite o banner some');
// As telas ligam o banner pelo hook de 3 estados.
assert.match(ler('../src/hooks/useAvisoLimiteAntigas.ts'), /estado: 'indisponivel'/, 'hook do aviso tem o estado indisponível');
assert.match(ler('../src/hooks/useAvisoLimiteAntigas.ts'), /registrarCienciaLimiteGratis\(aviso\.chave, 'app'\)/, 'hook grava a ciência ao mostrar o aviso');
for (const [nome, caminho] of [['Planos', '../src/screens/PlanosScreen.tsx'], ['Conta', '../src/screens/ContaScreen.tsx']] as const) {
  assert.match(ler(caminho), /useAvisoLimiteAntigas\(\)/, `${nome} usa o hook do aviso`);
  assert.match(ler(caminho), /<AvisoLimiteAntigas /, `${nome} desenha o aviso`);
}

// Contador "X de 5": só conta nova do Grátis (teto do servidor), só a partir do 3º envio; nunca inventa.
const { contadorEnvios, CONTADOR_ENVIOS_A_PARTIR_DE } = limites;
assert.equal(CONTADOR_ENVIOS_A_PARTIR_DE, 3);
assert.deepEqual(contadorEnvios(null), { mostrar: false }, 'oferta que não carregou: nada');
assert.deepEqual(contadorEnvios(semTeto), { mostrar: false }, 'conta antiga (limite nulo): nada, mesmo com 40 envios');
assert.deepEqual(contadorEnvios(teto({ envios_usados: 2, envios_restantes: 3 })), { mostrar: false }, 'antes do 3º envio: nada');
assert.deepEqual(contadorEnvios(teto({ plano_efetivo: 'pro' })), { mostrar: false }, 'Pro: nada');
const tres = contadorEnvios(teto({}));
assert.equal(tres.mostrar, true);
if (tres.mostrar) {
  assert.equal(tres.texto, '3 de 5 envios do Grátis usados neste mês.');
  assert.equal(tres.esgotado, false);
  assert.equal(tres.restantes, 2);
}
const cinco = contadorEnvios(teto({ envios_usados: 5, envios_restantes: 0 }));
assert.equal(cinco.mostrar && cinco.esgotado, true);
assert.match(cinco.mostrar ? cinco.texto : '', /Você usou os 5 envios do Grátis deste mês\. Eles voltam no próximo mês\./);
assert.doesNotMatch(cinco.mostrar ? cinco.texto : '', /bloquead/i, 'sem a palavra bloqueado');
// Passou do teto por reserva/corrida: não mostra "7 de 5".
const sete = contadorEnvios(teto({ envios_usados: 7, envios_restantes: 0 }));
assert.equal(sete.mostrar && sete.usados, 5, 'usados é limitado ao teto');
// As 3 telas ligam o contador pelo hook de 3 estados.
for (const [nome, caminho] of [['Visualizar', '../src/screens/VisualizarOrcamentoScreen.tsx'], ['Home', '../src/screens/HomeScreen.tsx']] as const) {
  assert.match(ler(caminho), /useContadorEnvios\(\)/, `${nome} usa o hook do contador`);
  assert.match(ler(caminho), /<ContadorEnvios /, `${nome} desenha o contador`);
}
assert.match(ler('../src/screens/PlanosScreen.tsx'), /<ContadorEnvios estado=\{oferta \?/, 'Planos desenha o contador a partir da oferta');
assert.match(ler('../src/hooks/useContadorEnvios.ts'), /estado: 'indisponivel'/, 'hook tem o estado indisponível (erro nunca vira vazio)');
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
// O ramo de recusa ("Cota mensal utilizada") saiu do detalhe em 02/10/2026, e com
// ele a copy de bloqueio: o tipo de `permitido` agora é o literal `true`.
assert.equal('mensagemBloqueioEnvio' in limites, false, 'nenhuma copy de bloqueio de envio sobrou');
assert.doesNotMatch(mobile, /Cota mensal utilizada|mensagemBloqueioEnvio|verificar a cota/, 'o detalhe não volta ao texto antigo de cota (a recusa nova é só o limite de conta nova)');

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
