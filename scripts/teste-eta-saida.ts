/**
 * Teste do POST /eta e POST /eta/saida do worker — versão GRÁTIS (Onda I2).
 *
 *     node scripts/teste-eta-saida.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * Até 30/09/2026 estas rotas pagavam a Routes/Geocoding API do Google. O billing
 * foi desligado e o dono proibiu pagar: agora respondem com a MESMA estimativa
 * que o app faz no aparelho (`src/services/etaEstimado.ts`). O que este arquivo
 * prende, e que quebraria calado:
 *
 *  (a) **Uma chamada ao Google voltando.** Nenhum `fetch` acontece nas duas rotas
 *      (o mock explode em qualquer URL), e o fonte não fala com googleapis.
 *  (b) **Um número sem rótulo.** Todo sucesso diz `comTransito:false`,
 *      `estimado:true` e "estimativa, sem trânsito". Nunca "com trânsito".
 *  (c) **"Não sei" virando "não tem".** Endereço em TEXTO (o APK antigo manda) é
 *      `indisponivel/geocodificacao_desligada` — serviço desligado, não endereço
 *      errado; ponto faltando é `endereco_insuficiente` dizendo QUAL.
 *
 * Exercita o módulo REAL do worker com `fetch` proibido. Roda offline.
 */
import { readFileSync } from 'node:fs';
import {
  coordOk,
  handleEtaAgora,
  handleEtaSaida,
  handleGeocodificarDesligado,
  haversineKm,
  lerChegada,
  lerPonto,
  MAX_BODY_BYTES,
} from '../worker/src/etaSaida.js';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

// Qualquer fetch é falha: estas rotas não podem falar com terceiro nenhum.
let fetchesFeitos = 0;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (url: unknown) => {
  fetchesFeitos++;
  throw new Error('fetch proibido no teste: ' + String(url));
}) as typeof fetch;

const AGORA = Date.parse('2026-10-07T13:00:00Z'); // quarta, 10h em Brasília
const SP = { lat: -23.5505, lng: -46.6333 };
const SANTO_ANDRE = { lat: -23.6639, lng: -46.5383 };
const BRASILIA = { lat: -15.7939, lng: -47.8828 };

type Opcoes = { semUsuario?: boolean; limite?: 'ok' | 'negado' | 'mudo' };

function env(opts: Opcoes) {
  const limite = opts.limite ?? 'ok';
  return {
    ETA_RL: limite === 'mudo' ? undefined : { limit: async () => ({ success: limite === 'ok' }) },
  };
}

async function chamar(handler: typeof handleEtaSaida, rota: string, corpo: unknown, opts: Opcoes = {}) {
  const request = new Request('https://olli-diagnostico' + rota, {
    method: 'POST',
    headers: { Authorization: 'Bearer token-de-teste', 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const resp: Response = await handler(request, env(opts), {
    agora: () => AGORA,
    getUser: async () => (opts.semUsuario ? null : { id: 'usuario-de-teste' }),
  });
  return { status: resp.status, corpo: (await resp.json()) as any };
}

const saida = (corpo: unknown, opts?: Opcoes) => chamar(handleEtaSaida, '/eta/saida', corpo, opts);
const agora = (corpo: unknown, opts?: Opcoes) => chamar(handleEtaAgora, '/eta', corpo, opts);
const chegar15h = '2026-10-07T15:00:00-03:00';

console.log('\n1) helpers puros');
checar('coordenada boa', coordOk(SP), true);
checar('0,0 não é coordenada', coordOk({ lat: 0, lng: 0 }), false);
checar('latitude fora do planeta', coordOk({ lat: 91, lng: 0 }), false);
checar('SP → Santo André ~ 16 km de reta', Math.round(haversineKm(SP, SANTO_ANDRE)), 16);
checar('chegada sem fuso é recusada', lerChegada('2026-10-07T15:00:00', AGORA), { ok: false, erro: 'chegar_em_sem_fuso' });
checar('chegada no passado', lerChegada('2026-10-07T09:00:00-03:00', AGORA), { ok: false, erro: 'chegar_em_passado' });
checar('chegada a mais de 14 dias', lerChegada('2026-11-07T09:00:00-03:00', AGORA), { ok: false, erro: 'chegar_em_distante' });
checar('texto vira "sem coordenada", não ponto chutado', lerPonto('Rua X, 123, São Paulo/SP'), { ok: false, erro: 'texto_sem_coordenada' });
checar('vazio é vazio', lerPonto(''), { ok: false, erro: 'vazio' });

console.log('\n2) /eta/saida — estimativa com rótulo honesto');
{
  const r = await saida({ origem: SP, destino: SANTO_ANDRE, chegarEm: chegar15h, modo: 'confirmacao' });
  checar('200 ok', [r.status, r.corpo.ok, r.corpo.estado], [200, true, 'ok']);
  checar('nunca diz que tem trânsito', r.corpo.comTransito, false);
  checar('diz que é estimativa', [r.corpo.estimado, r.corpo.rotulo], [true, 'estimativa, sem trânsito']);
  checar('minutos inteiros e plausíveis (16 km de reta à tarde)', r.corpo.minutos > 20 && r.corpo.minutos < 120, true);
  checar('folga >= 8 min', r.corpo.folgaMin >= 8, true);
  const sair = Date.parse(r.corpo.sairEm);
  checar('sair = chegar − viagem − folga', sair, Date.parse(chegar15h) - (r.corpo.minutos + r.corpo.folgaMin) * 60_000);
  checar('não atrasado (são 10h, visita às 15h)', r.corpo.atrasado, false);
  checar('carimbo de quando foi calculado', r.corpo.calculadoEm, new Date(AGORA).toISOString());
}
{
  const r = await saida({ origem: SP, destino: SANTO_ANDRE, chegarEm: '2026-10-07T10:20:00-03:00' });
  checar('visita daqui a 20 min → atrasado com a chegada real', [r.corpo.estado, r.corpo.atrasado, typeof r.corpo.sairAgoraChegaEm], ['ok', true, 'string']);
}

console.log('\n3) os estados de falha — nunca com número');
{
  const r = await saida({ origem: 'Rua A, 10, São Paulo/SP', destino: SANTO_ANDRE, chegarEm: chegar15h });
  checar('texto (APK antigo) → indisponivel, serviço desligado', [r.corpo.estado, r.corpo.erro, 'minutos' in r.corpo], ['indisponivel', 'geocodificacao_desligada', false]);
  const sem = await saida({ origem: SP, chegarEm: chegar15h });
  checar('sem destino → endereco_insuficiente(destino)', [sem.corpo.estado, sem.corpo.qual], ['endereco_insuficiente', 'destino']);
  const nenhum = await saida({ chegarEm: chegar15h });
  checar('sem nada → ambos', nenhum.corpo.qual, 'ambos');
  const longe = await saida({ origem: SP, destino: { lat: -3.1, lng: -60.0 }, chegarEm: chegar15h });
  checar('2.700 km → distância implausível (endereço errado)', [longe.corpo.estado, longe.corpo.detalhe], ['endereco_insuficiente', 'distancia_implausivel']);
  const semFuso = await saida({ origem: SP, destino: SANTO_ANDRE, chegarEm: '2026-10-07T15:00:00' });
  checar('chegada sem fuso → 400', [semFuso.status, semFuso.corpo.erro], [400, 'chegar_em_sem_fuso']);
  const anonimo = await saida({ origem: SP, destino: SANTO_ANDRE, chegarEm: chegar15h }, { semUsuario: true });
  checar('sem login → 401', anonimo.status, 401);
  const negado = await saida({ origem: SP, destino: SANTO_ANDRE, chegarEm: chegar15h }, { limite: 'negado' });
  checar('rate limit estourado → 429 sem número', [negado.status, 'minutos' in negado.corpo], [429, false]);
  const mudo = await saida({ origem: SP, destino: SANTO_ANDRE, chegarEm: chegar15h }, { limite: 'mudo' });
  checar('limiter ausente não derruba uma conta grátis (sensivel:false)', mudo.corpo.estado, 'ok');
}

console.log('\n4) /eta — "saindo agora"');
{
  const r = await agora({ origem: SP, destino: SANTO_ANDRE });
  checar('ok com rótulo', [r.corpo.ok, r.corpo.comTransito, r.corpo.estimado, r.corpo.rotulo], [true, false, true, 'estimativa, sem trânsito']);
  checar('distância de rua > reta', r.corpo.distanciaKm > 16, true);
  const ruim = await agora({ origem: SP });
  checar('sem destino → 400', [ruim.status, ruim.corpo.ok], [400, false]);
  const longe = await agora({ origem: SP, destino: BRASILIA });
  checar('900 km → distancia_implausivel', longe.corpo.erro, 'distancia_implausivel');
}

console.log('\n5) /geocodificar — desligado com o motivo');
{
  const r = handleGeocodificarDesligado();
  const corpo = (await r.json()) as any;
  checar('não devolve ponto, diz por quê', [corpo.ok, corpo.erro, 'lat' in corpo], [false, 'geocodificacao_desligada', false]);
}

console.log('\n6) corpo grande barrado antes de ler');
{
  const req = new Request('https://olli-diagnostico/eta/saida', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Length': String(MAX_BODY_BYTES * 10) },
    body: '{}',
  });
  const resp: Response = await handleEtaSaida(req, env({}), { getUser: async () => ({ id: 'u' }) });
  checar('Content-Length acima do teto → 413', resp.status, 413);
}

console.log('\n7) NENHUM terceiro, NENHUMA chave');
checar('nenhum fetch aconteceu em todas as chamadas acima', fetchesFeitos, 0);
{
  const src = readFileSync(new URL('../worker/src/etaSaida.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  checar('o fonte não fala com o Google', /googleapis\.com|OLLI_ROUTES_API_KEY|computeRoutes/.test(src), false);
  checar('usa a régua única do app (etaEstimado.ts)', src.includes("from '../../src/services/etaEstimado.ts'"), true);
  const index = readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');
  checar('index.js não chama mais a Geocoding do Google', /maps\.googleapis\.com\/maps\/api\/geocode/.test(index), false);
}

globalThis.fetch = fetchOriginal;
console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
