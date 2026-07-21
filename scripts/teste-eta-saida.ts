/**
 * Teste do POST /eta/saida — "a que horas eu preciso SAIR pra chegar às 15h".
 *
 *     node scripts/teste-eta-saida.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * POR QUE ESTE ARQUIVO EXISTE — três coisas podem quebrar aqui, e as três
 * quebram CALADAS:
 *
 *  (a) **Um ETA otimista chutado.** Se o worker devolver um número que não veio
 *      da Routes API, o prestador sai atrasado e o app diz que está tudo certo.
 *      Isso é pior que não ter a função: ele confiou. Os testes de "três
 *      estados" abaixo existem só para prender isso — `ok:true` SEM duração da
 *      Google não pode existir em nenhum caminho.
 *
 *  (b) **"Não sei" virando "não tem".** Geocoding fora do ar e endereço que não
 *      existe são estados DIFERENTES: o primeiro é esperar, o segundo é corrigir
 *      o endereço. Confundir os dois manda o prestador editar um endereço que
 *      estava certo — o bug recorrente `olli-gate-erro-vira-vazio`.
 *
 *  (c) **Rate limit que some.** Já aconteceu neste repo: um build por Git apagou
 *      os 5 limiters em produção e ninguém percebeu, porque "sem limiter" e
 *      "dentro do limite" são indistinguíveis para quem chama. Aqui isso não é
 *      uma API grátis — é a Routes API, US$10 por 1.000 no SKU Pro. Sem vigia,
 *      20 req/min sustentadas = ~864.000 chamadas/mês ≈ US$ 8.600.
 *
 * Exercita o módulo REAL do worker (worker/src/etaSaida.js) com a resposta do
 * Google MOCKADA — nenhuma chamada paga, nenhuma chave, roda offline. Mais uma
 * camada de asserção sobre o FONTE, no molde de teste-denuncia-ia.ts, para o que
 * só dá para provar lendo (ordem do rate limit, fail-closed).
 */
import { readFileSync } from 'node:fs';
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import {
  handleEtaSaida,
  haversineKm,
  folgaPadraoMin,
  folgaEscolhida,
  segundosDe,
  lerChegada,
  departureTimeMs,
  calcularSaida,
  normalizarEndereco,
  chaveTrajeto,
  MAX_DISTANCIA_KM,
  ESTIMATIVA_INICIAL_MIN,
  // @ts-expect-error
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

// ─── Cenário fixo ──────────────────────────────────────────────────────────
// Sexta-feira, 18/07/2026, 10h da manhã no horário de Brasília. A visita é às
// 15h. É exatamente o caso do documento: calcular de manhã o trânsito de uma
// saída da tarde.
const AGORA = Date.parse('2026-07-18T10:00:00-03:00');
const VISITA_15H = '2026-07-18T15:00:00-03:00';
const CHAVE = 'CHAVE-SECRETA-QUE-NUNCA-PODE-SAIR-DO-WORKER';

const SP = { lat: -23.5505, lng: -46.6333 };        // Sé, São Paulo
const SANTO_ANDRE = { lat: -23.6639, lng: -46.5383 }; // ~16 km em linha reta

type Chamada = { url: string; init: any };

function respJson(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Resposta típica da Routes API: 32min12s com trânsito, 27min sem, 18,4 km. */
function rotaOk(duracao = '1932s', estatica: string | null = '1620s', metros: number | null = 18_400) {
  const rota: Record<string, unknown> = { duration: duracao, distanceMeters: metros };
  if (estatica) rota.staticDuration = estatica;
  return () => respJson({ routes: [rota] });
}

function geocodeOk(lat: number, lng: number, formatado = 'Endereço Resolvido, SP') {
  return () => respJson({ status: 'OK', results: [{ geometry: { location: { lat, lng } }, formatted_address: formatado }] });
}

type Mocks = {
  rotas?: () => Response;
  geocode?: (url: string) => Response;
  supabase?: (url: string, init: any) => Response;
};

function montarFetch(m: Mocks) {
  const chamadas: Chamada[] = [];
  const f = async (url: unknown, init?: unknown): Promise<Response> => {
    const u = String(url);
    chamadas.push({ url: u, init });
    if (u.includes('routes.googleapis.com')) {
      return m.rotas ? m.rotas() : respJson({}, 500);
    }
    if (u.includes('maps.googleapis.com/maps/api/geocode')) {
      return m.geocode ? m.geocode(u) : respJson({}, 500);
    }
    if (u.includes('/rest/v1/')) {
      return m.supabase ? m.supabase(u, init) : respJson([]);
    }
    throw new Error('URL inesperada no mock: ' + u);
  };
  return { f, chamadas };
}

/** Guarda TODO corpo de resposta produzido no teste, para a varredura de vazamento no fim. */
const corposVistos: string[] = [];

type Opcoes = { env?: Record<string, unknown>; agora?: number; semUsuario?: boolean };

async function chamar(corpo: unknown, mocks: Mocks = {}, opts: Opcoes = {}) {
  const { f, chamadas } = montarFetch(mocks);
  const env = {
    OLLI_ROUTES_API_KEY: CHAVE,
    ETA_RL: { limit: async () => ({ success: true }) },
    ...(opts.env || {}),
  };
  const request = new Request('https://olli-diagnostico/eta/saida', {
    method: 'POST',
    headers: { Authorization: 'Bearer token-de-teste', 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const resp: Response = await handleEtaSaida(request, env, {
    fetch: f,
    agora: () => (opts.agora ?? AGORA),
    getUser: async () => (opts.semUsuario ? null : { id: 'usuario-de-teste' }),
  });
  const texto = await resp.text();
  corposVistos.push(texto);
  return { status: resp.status, corpo: JSON.parse(texto) as any, chamadas, texto };
}

const pediuRotas = (c: Chamada[]) => c.filter((x) => x.url.includes('routes.googleapis.com')).length;
const pediuGeocode = (c: Chamada[]) => c.filter((x) => x.url.includes('/maps/api/geocode')).length;
const corpoRotas = (c: Chamada[]) => JSON.parse(String(c.find((x) => x.url.includes('routes.googleapis.com'))!.init.body));
const mascaraRotas = (c: Chamada[]) => String(c.find((x) => x.url.includes('routes.googleapis.com'))!.init.headers['X-Goog-FieldMask']);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) helpers puros — a aritmética da hora de sair');

checar('folga de uma viagem de 40 min = 5 min (o piso)', folgaPadraoMin(40 * 60), 5);
checar('folga de uma viagem de 90 min = 11 min (12%)', folgaPadraoMin(90 * 60), 11);
checar('folga do corpo é respeitada quando é um número são', folgaEscolhida(8, 40 * 60), 8);
checar('folga negativa cai no padrão (não vira "saia depois de chegar")', folgaEscolhida(-30, 40 * 60), 5);
checar('folga absurda cai no padrão', folgaEscolhida(9999, 40 * 60), 5);
checar('folga NaN cai no padrão', folgaEscolhida(Number.NaN, 40 * 60), 5);

checar('"1932s" vira 1932 segundos', segundosDe('1932s'), 1932);
// Um parse frouxo (parseInt) devolveria 0 para lixo, e 0 vira "chegou na hora".
checar('duração ilegível vira null, NUNCA 0', segundosDe('mais ou menos'), null);
checar('duração sem sufixo s vira null', segundosDe('1932'), null);
checar('duração ausente vira null', segundosDe(undefined), null);

console.log('\n2) o horário de chegada: ambíguo é recusado, não adivinhado');
checar('ISO com offset é aceito', lerChegada(VISITA_15H, AGORA).ok, true);
// "2026-07-18T15:00:00" pode ser 15h em qualquer fuso do planeta. Adivinhar aqui
// é errar a hora de sair por horas — melhor recusar.
checar('ISO SEM fuso é recusado', lerChegada('2026-07-18T15:00:00', AGORA).erro, 'chegar_em_sem_fuso');
checar('horário no passado é recusado', lerChegada('2026-07-18T09:00:00-03:00', AGORA).erro, 'chegar_em_passado');
checar('horário daqui a 3 meses é recusado', lerChegada('2026-10-18T15:00:00-03:00', AGORA).erro, 'chegar_em_distante');
checar('texto que não é data é recusado', lerChegada('amanhã cedo', AGORA).erro, 'chegar_em_sem_fuso');
checar('ausente é recusado', lerChegada(undefined, AGORA).erro, 'chegar_em_ausente');

console.log('\n3) departureTime NUNCA no passado (o Google rejeita fora do modo TRANSIT)');
{
  // Visita daqui a 10 min: chegarEm − 45 min de estimativa dá um horário que já passou.
  const daquiA10 = AGORA + 10 * 60_000;
  const dt = departureTimeMs({ chegarEmMs: daquiA10, estimativaSeg: ESTIMATIVA_INICIAL_MIN * 60, folgaMin: 5, agoraMs: AGORA });
  checar('saída calculada no passado é grudada em "agora"', dt >= AGORA, true);
  const normal = departureTimeMs({ chegarEmMs: AGORA + 5 * 3600_000, estimativaSeg: 45 * 60, folgaMin: 5, agoraMs: AGORA });
  checar('saída no futuro é preservada', normal, AGORA + 5 * 3600_000 - 45 * 60_000 - 5 * 60_000);
}

console.log('\n4) calcularSaida — "já devia ter saído" é informação, não erro');
{
  const s = calcularSaida({ duracaoSeg: 30 * 60, chegarEmMs: AGORA + 10 * 60_000, folgaMin: 5, agoraMs: AGORA });
  checar('atrasado quando a viagem não cabe no tempo que sobra', s.atrasado, true);
  checar('saindo agora, chega em 30 min', s.sairAgoraChegaEmMs, AGORA + 30 * 60_000);
  const ok = calcularSaida({ duracaoSeg: 30 * 60, chegarEmMs: AGORA + 5 * 3600_000, folgaMin: 5, agoraMs: AGORA });
  checar('não atrasado quando sobra tempo', ok.atrasado, false);
}

console.log('\n5) cache: mesmo par origem→destino, mesmo balde — hora e tipo de dia separam');
{
  const base = { origem: SP, destino: SANTO_ANDRE, offsetMin: -180, modo: 'confirmacao' };
  const sexta14h = chaveTrajeto({ ...base, partidaMs: Date.parse('2026-07-17T14:20:00-03:00') });
  const sexta14hDeNovo = chaveTrajeto({ ...base, partidaMs: Date.parse('2026-07-17T14:47:00-03:00') });
  const sexta18h = chaveTrajeto({ ...base, partidaMs: Date.parse('2026-07-17T18:20:00-03:00') });
  const sabado14h = chaveTrajeto({ ...base, partidaMs: Date.parse('2026-07-18T14:20:00-03:00') });
  checar('mesma hora e mesmo dia útil = mesma chave (é aqui que o dinheiro é economizado)', sexta14h === sexta14hDeNovo, true);
  checar('18h não reusa o trânsito das 14h', sexta14h === sexta18h, false);
  checar('sábado não reusa o trânsito de sexta', sexta14h === sabado14h, false);
  checar('planejamento e confirmação não se misturam (SKU e TTL diferentes)',
    chaveTrajeto({ ...base, partidaMs: AGORA }) === chaveTrajeto({ ...base, modo: 'planejamento', partidaMs: AGORA }), false);
  checar('acento e caixa não geram geocoding duplicado',
    normalizarEndereco('Av. São João, 100') === normalizarEndereco('AV.  SAO JOAO , 100'), true);
}

console.log('\n6) haversine é sanidade OFFLINE, nunca ETA');
checar('Sé → Santo André ≈ 16 km em linha reta', Math.round(haversineKm(SP, SANTO_ANDRE)), 16);
checar('São Paulo → Recife passa do teto de plausibilidade',
  haversineKm(SP, { lat: -8.0476, lng: -34.877 }) > MAX_DISTANCIA_KM, true);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n7) O CAMINHO FELIZ — o número vem da Google, e a hora de sair é derivada dele');
{
  const r = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' },
    { rotas: rotaOk() },
  );
  checar('estado ok', r.corpo.estado, 'ok');
  checar('1932s → 32 minutos', r.corpo.minutos, 32);
  checar('staticDuration vira "sem trânsito" (27 min)', r.corpo.minutosSemTransito, 27);
  checar('18.400 m → 18.4 km', r.corpo.distanciaKm, 18.4);
  checar('folga de 32 min de viagem = 5 min', r.corpo.folgaMin, 5);
  // 15:00 − 32min12s − 5min = 14:22:48 → em UTC (-03:00) = 17:22:48Z
  checar('sairEm = chegada − duração − folga', r.corpo.sairEm, new Date(Date.parse(VISITA_15H) - 1932_000 - 300_000).toISOString());
  checar('não está atrasado (são 10h, sai 14h22)', r.corpo.atrasado, false);
  checar('comTransito', r.corpo.comTransito, true);
  checar('SKU declarado na resposta (Pro = US$10/1k)', r.corpo.sku, 'pro');
  // ETA sem carimbo de hora é uma mentira em potência: se o número tem 6 horas,
  // o prestador merece saber que tem 6 horas.
  checar('traz carimbo de quando foi calculado', r.corpo.calculadoEm, new Date(AGORA).toISOString());
  checar('diz que NÃO veio de cache', r.corpo.cache, false);
  checar('gastou exatamente 1 chamada paga', pediuRotas(r.chamadas), 1);
  checar('coordenada pronta não gasta geocoding', pediuGeocode(r.chamadas), 0);
}

console.log('\n8) O CAMPO QUE FALTAVA: departureTime — o trânsito da SAÍDA, não o de agora');
{
  const r = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' },
    { rotas: rotaOk() },
  );
  const b = corpoRotas(r.chamadas);
  checar('confirmação manda departureTime', typeof b.departureTime, 'string');
  // Sem este campo o Google devolve o trânsito de AGORA (10h) para uma saída às
  // 14h20. É o erro que o /eta atual comete e ninguém percebe.
  // A 1ª iteração usa a estimativa cega de 45 min (não há cache) e a folga dela.
  // Uma 2ª iteração custaria o dobro para ganhar ~3 min — não vale.
  const folgaDoChute = folgaPadraoMin(ESTIMATIVA_INICIAL_MIN * 60);
  checar('departureTime é a saída estimada, não "agora"', b.departureTime,
    new Date(Date.parse(VISITA_15H) - (ESTIMATIVA_INICIAL_MIN + folgaDoChute) * 60_000).toISOString());
  checar('departureTime está no futuro (Google rejeita passado em DRIVE)', Date.parse(b.departureTime) > AGORA, true);
  checar('modo de viagem é DRIVE', b.travelMode, 'DRIVE');
}

console.log('\n9) SKU: quem escolhe é o call site, e a escolha aparece na requisição');
{
  const conf = await chamar({ origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' }, { rotas: rotaOk() });
  checar('confirmação usa TRAFFIC_AWARE (SKU Pro, US$10/1k)', corpoRotas(conf.chamadas).routingPreference, 'TRAFFIC_AWARE');

  const plan = await chamar({ origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'planejamento' }, { rotas: rotaOk('1620s', null) });
  checar('planejamento usa TRAFFIC_UNAWARE (SKU Essentials, US$5/1k, 2x a franquia)',
    corpoRotas(plan.chamadas).routingPreference, 'TRAFFIC_UNAWARE');
  // TRAFFIC_UNAWARE ignora departureTime; mandar assim mesmo é feature a mais
  // numa requisição que queremos manter no SKU barato.
  checar('planejamento NÃO manda departureTime', 'departureTime' in corpoRotas(plan.chamadas), false);
  checar('planejamento não pede staticDuration', mascaraRotas(plan.chamadas).includes('staticDuration'), false);
  checar('planejamento se declara sem trânsito (a UI tem que rotular assim)', plan.corpo.comTransito, false);
  checar('planejamento declara SKU essentials', plan.corpo.sku, 'essentials');
  checar('sem staticDuration, minutosSemTransito é null (não é copiado do outro campo)', plan.corpo.minutosSemTransito, null);

  // `modo` é obrigatório de propósito: um default esconderia a decisão de custo.
  const semModo = await chamar({ origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H }, { rotas: rotaOk() });
  checar('sem modo => recusa', semModo.corpo.estado, 'indisponivel');
  checar('sem modo => erro nomeado', semModo.corpo.erro, 'modo_invalido');
  checar('sem modo => NÃO gastou chamada paga', pediuRotas(semModo.chamadas), 0);
}

console.log('\n10) ESTADO 2 — "não consegui calcular". Nunca acompanha número.');
for (const [nome, mocks, erroEsperado] of [
  ['Routes API fora (502)', { rotas: () => respJson({}, 502) }, 'rota_indisponivel'],
  ['Routes API sem rota no corpo', { rotas: () => respJson({ routes: [] }) }, 'sem_rota'],
  ['Routes API devolveu duração ilegível', { rotas: () => respJson({ routes: [{ duration: 'logo ali' }] }) }, 'sem_rota'],
  ['rede caiu no meio', { rotas: () => { throw new Error('offline'); } }, 'eta_falhou'],
] as const) {
  const r = await chamar({ origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' }, mocks as Mocks);
  checar(`${nome} => estado indisponivel`, r.corpo.estado, 'indisponivel');
  checar(`${nome} => erro nomeado`, r.corpo.erro, erroEsperado);
  checar(`${nome} => ok:false`, r.corpo.ok, false);
  // O ponto do teste inteiro: o app não pode receber um horário de saída junto
  // com uma falha. Um "saia às 14h20" chutado faz ele chegar atrasado.
  checar(`${nome} => SEM minutos`, 'minutos' in r.corpo, false);
  checar(`${nome} => SEM sairEm`, 'sairEm' in r.corpo, false);
}

console.log('\n11) ESTADO 3 — "endereço insuficiente" ≠ "não consegui". São ações diferentes.');
{
  // ZERO_RESULTS é o Google DIZENDO que não existe. Ação: corrigir o endereço.
  const zero = await chamar(
    { origem: SP, destino: 'rua que nao existe em lugar nenhum 9999', chegarEm: VISITA_15H, modo: 'confirmacao' },
    { geocode: () => respJson({ status: 'ZERO_RESULTS', results: [] }), rotas: rotaOk() },
  );
  checar('ZERO_RESULTS => endereco_insuficiente', zero.corpo.estado, 'endereco_insuficiente');
  checar('diz QUAL endereço está ruim', zero.corpo.qual, 'destino');
  checar('não gastou a chamada de rota', pediuRotas(zero.chamadas), 0);

  // Geocoding FORA DO AR é "não sei". Mandar o prestador corrigir um endereço
  // que estava certo é o bug `olli-gate-erro-vira-vazio` de cabeça pra baixo.
  const fora = await chamar(
    { origem: SP, destino: 'Rua Qualquer, 100, Santo André', chegarEm: VISITA_15H, modo: 'confirmacao' },
    { geocode: () => respJson({}, 500), rotas: rotaOk() },
  );
  checar('Geocoding fora do ar => indisponivel (NÃO "endereço ruim")', fora.corpo.estado, 'indisponivel');
  checar('erro nomeado', fora.corpo.erro, 'geocode_indisponivel');
  checar('não gastou a chamada de rota', pediuRotas(fora.chamadas), 0);

  // O caso REAL e mais provável de todos, e o mais fácil de errar: a Geocoding
  // API responde HTTP **200** com um status de falha no corpo. Cota estourada,
  // chave bloqueada e erro interno do Google chegam assim. Tratar isso como
  // "endereço não existe" manda o prestador reescrever um endereço que estava
  // certo — e no dia em que a conta estourar, manda isso para TODO MUNDO ao
  // mesmo tempo. (Este bloco nasceu de uma mutação que sobreviveu ao teste.)
  for (const status of ['OVER_QUERY_LIMIT', 'REQUEST_DENIED', 'UNKNOWN_ERROR', 'INVALID_REQUEST'] as const) {
    const r = await chamar(
      { origem: SP, destino: 'Rua Qualquer, 100, Santo André', chegarEm: VISITA_15H, modo: 'confirmacao' },
      { geocode: () => respJson({ status, results: [] }), rotas: rotaOk() },
    );
    checar(`Geocoding HTTP 200 com status ${status} => indisponivel, NÃO "endereço ruim"`, r.corpo.estado, 'indisponivel');
    checar(`${status} => não gastou a chamada de rota`, pediuRotas(r.chamadas), 0);
  }

  const vazio = await chamar({ origem: SP, destino: '  ', chegarEm: VISITA_15H, modo: 'confirmacao' }, { rotas: rotaOk() });
  checar('endereço vazio => endereco_insuficiente', vazio.corpo.estado, 'endereco_insuficiente');
  checar('endereço vazio não vira chamada de geocoding', pediuGeocode(vazio.chamadas), 0);

  const ambos = await chamar(
    { origem: 'nada aqui 1', destino: 'nada aqui 2', chegarEm: VISITA_15H, modo: 'confirmacao' },
    { geocode: () => respJson({ status: 'ZERO_RESULTS', results: [] }), rotas: rotaOk() },
  );
  checar('os dois ruins => qual:"ambos"', ambos.corpo.qual, 'ambos');
}

console.log('\n12) endereço geocodificado no estado errado não vira "saia às 3h da manhã"');
{
  // "Rua São João" existe em 300 cidades. Se o geocoding trouxer Recife em vez
  // de São Paulo, a resposta honesta é "não entendi o endereço" — não um
  // horário de saída de madrugada apresentado com cara de certeza.
  const r = await chamar(
    { origem: SP, destino: { lat: -8.0476, lng: -34.877 }, chegarEm: VISITA_15H, modo: 'confirmacao' },
    { rotas: rotaOk() },
  );
  checar('2.100 km entre duas visitas => endereco_insuficiente', r.corpo.estado, 'endereco_insuficiente');
  checar('detalhe explica o motivo', r.corpo.detalhe, 'distancia_implausivel');
  checar('a checagem é OFFLINE: não gastou chamada paga para descobrir', pediuRotas(r.chamadas), 0);
}

console.log('\n13) RATE LIMIT — fail-closed, e ANTES de qualquer centavo');
{
  const estourado = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' },
    { rotas: rotaOk() },
    { env: { ETA_RL: { limit: async () => ({ success: false }) } } },
  );
  checar('limite estourado => 429', estourado.status, 429);
  checar('limite estourado => estado indisponivel', estourado.corpo.estado, 'indisponivel');
  checar('limite estourado => NÃO chamou a Google', pediuRotas(estourado.chamadas), 0);

  // O incidente real: o binding sumiu num build e ninguém percebeu.
  const semBinding = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' },
    { rotas: rotaOk() },
    { env: { ETA_RL: undefined } },
  );
  checar('binding ausente => NEGA (fail-closed: limiter mudo não é permissão)', semBinding.corpo.ok, false);
  checar('binding ausente => erro nomeado, não genérico', semBinding.corpo.erro, 'limite_indisponivel');
  checar('binding ausente => ZERO chamadas pagas', pediuRotas(semBinding.chamadas), 0);

  const quebrado = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' },
    { rotas: rotaOk() },
    { env: { ETA_RL: { limit: async () => { throw new Error('limiter fora'); } } } },
  );
  checar('limiter que lança => NEGA', quebrado.corpo.ok, false);
  checar('limiter que lança => ZERO chamadas pagas', pediuRotas(quebrado.chamadas), 0);

  // Rate limit depois do geocoding seria rate limit nenhum: geocoding também é pago.
  const semGeo = pediuGeocode(semBinding.chamadas);
  checar('binding ausente => nem geocoding foi chamado', semGeo, 0);
}

console.log('\n14) portaria: sem login e sem chave, ninguém passa');
{
  const anon = await chamar({ origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' }, { rotas: rotaOk() }, { semUsuario: true });
  checar('sem usuário => 401', anon.status, 401);
  checar('sem usuário => ZERO chamadas pagas', pediuRotas(anon.chamadas), 0);

  const semChave = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' },
    { rotas: rotaOk() },
    { env: { OLLI_ROUTES_API_KEY: undefined } },
  );
  checar('sem chave => indisponivel (não finge que calculou)', semChave.corpo.estado, 'indisponivel');
  checar('sem chave => erro nomeado', semChave.corpo.erro, 'eta_nao_configurado');
  checar('sem chave => SEM minutos', 'minutos' in semChave.corpo, false);
}

console.log('\n15) CACHE — o corte de custo. E ele NUNCA mente sobre a idade do número.');
{
  const envSb = {
    SUPABASE_URL: 'https://projeto.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-de-teste',
  };
  const linhaCache = (idadeMs: number) => [{
    duracao_seg: 1500,
    distancia_m: 12_000,
    atualizado_em: new Date(Date.now() - idadeMs).toISOString(),
  }];

  const fresco = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' },
    { rotas: rotaOk(), supabase: (u) => respJson(u.includes('eta_cache') ? linhaCache(60_000) : []) },
    { env: envSb },
  );
  checar('cache fresco => acerto', fresco.corpo.cache, true);
  checar('cache fresco => 25 min vindos do cache', fresco.corpo.minutos, 25);
  checar('cache fresco => ZERO chamadas pagas (é isso que economiza)', pediuRotas(fresco.chamadas), 0);
  // O carimbo é do cálculo ORIGINAL. Apresentar número de uma hora atrás com a
  // hora de agora é a versão sofisticada de "erro vira vazio".
  checar('cache => carimbo é do cálculo original, não de agora', fresco.corpo.calculadoEm === new Date(AGORA).toISOString(), false);

  const velho = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' },
    { rotas: rotaOk(), supabase: (u) => respJson(u.includes('eta_cache') ? linhaCache(45 * 60_000) : []) },
    { env: envSb },
  );
  // Trânsito de 45 min atrás não é trânsito de agora. TTL curto na confirmação.
  checar('cache velho na confirmação => ignora e paga', velho.corpo.cache, false);
  checar('cache velho => chamou a Google', pediuRotas(velho.chamadas), 1);
  checar('cache velho => 32 min da Google, não 25 do cache', velho.corpo.minutos, 32);

  const mesmaLinhaNoPlanejamento = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'planejamento' },
    { rotas: rotaOk('1620s', null), supabase: (u) => respJson(u.includes('eta_cache') ? linhaCache(45 * 60_000) : []) },
    { env: envSb },
  );
  // Duração sem trânsito é a via em fluxo livre: só muda com obra. TTL de 30 dias.
  checar('a MESMA idade é aceitável no planejamento (TTL de 30 dias)', mesmaLinhaNoPlanejamento.corpo.cache, true);
  checar('planejamento com cache => ZERO chamadas pagas', pediuRotas(mesmaLinhaNoPlanejamento.chamadas), 0);

  // O caso que o TTL de 7 dias errava por um triz: cliente visitado TODA SEMANA
  // — o padrão de ouro do público. É exatamente o trajeto que mais se repete.
  const semanal = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'planejamento' },
    { rotas: rotaOk('1620s', null), supabase: (u) => respJson(u.includes('eta_cache') ? linhaCache(8 * 24 * 3600_000) : []) },
    { env: envSb },
  );
  checar('cliente semanal (8 dias) ainda acerta o cache', semanal.corpo.cache, true);
  checar('cliente semanal => ZERO chamadas pagas', pediuRotas(semanal.chamadas), 0);

  // Cache quebrado nunca pode derrubar a rota — nem inventar um número.
  const sbFora = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' },
    { rotas: rotaOk(), supabase: () => respJson({ erro: 'tabela nao existe' }, 404) },
    { env: envSb },
  );
  checar('cache fora do ar => segue e paga (nunca derruba a rota)', sbFora.corpo.estado, 'ok');
  checar('cache fora do ar => número veio da Google', sbFora.corpo.minutos, 32);

  const sbLixo = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' },
    { rotas: rotaOk(), supabase: (u) => respJson(u.includes('eta_cache') ? [{ duracao_seg: 'muito', atualizado_em: new Date().toISOString() }] : []) },
    { env: envSb },
  );
  checar('linha de cache corrompida não vira ETA', sbLixo.corpo.minutos, 32);
  checar('linha de cache corrompida => pagou pra ter número de verdade', pediuRotas(sbLixo.chamadas), 1);
}

console.log('\n16) geocodificação por texto: 1 chamada, e o resultado fica em cache');
{
  const r = await chamar(
    { origem: 'Praça da Sé, São Paulo', destino: 'Paço Municipal, Santo André', chegarEm: VISITA_15H, modo: 'confirmacao' },
    { geocode: (u) => (u.includes('Sant') ? geocodeOk(SANTO_ANDRE.lat, SANTO_ANDRE.lng)() : geocodeOk(SP.lat, SP.lng)()), rotas: rotaOk() },
  );
  checar('dois endereços em texto => 2 geocodings', pediuGeocode(r.chamadas), 2);
  checar('e 1 rota', pediuRotas(r.chamadas), 1);
  checar('resultado ok', r.corpo.estado, 'ok');

  const doCache = await chamar(
    { origem: 'Praça da Sé, São Paulo', destino: SANTO_ANDRE, chegarEm: VISITA_15H, modo: 'confirmacao' },
    {
      rotas: rotaOk(),
      supabase: (u) => respJson(u.includes('geocode_cache')
        ? [{ lat: SP.lat, lng: SP.lng, formatado: 'Praça da Sé', atualizado_em: new Date().toISOString() }]
        : []),
    },
    { env: { SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srk' } },
  );
  checar('endereço já geocodificado antes => ZERO geocoding', pediuGeocode(doCache.chamadas), 0);
}

console.log('\n17) "você já devia ter saído" — verdade desconfortável, não erro');
{
  const daquiA10 = new Date(AGORA + 10 * 60_000).toISOString();
  const r = await chamar(
    { origem: SP, destino: SANTO_ANDRE, chegarEm: daquiA10, modo: 'confirmacao' },
    { rotas: rotaOk('1800s', '1800s', 12_000) },
  );
  checar('estado continua ok (o cálculo funcionou)', r.corpo.estado, 'ok');
  checar('atrasado:true', r.corpo.atrasado, true);
  checar('saindo agora chega 30 min depois', r.corpo.sairAgoraChegaEm, new Date(AGORA + 1800_000).toISOString());
  // O app precisa disso para dizer "saindo agora você chega 15h07, 22 min
  // atrasado — avisar o cliente?" em vez de esconder o atraso.
  checar('a chegada real é DEPOIS do horário marcado', Date.parse(r.corpo.sairAgoraChegaEm) > Date.parse(daquiA10), true);
}

console.log('\n18) A CHAVE NUNCA SAI DO WORKER');
{
  // Varredura sobre TODOS os corpos de resposta produzidos acima. Uma chave de
  // API paga num corpo de resposta é a chave no aparelho, e no log do proxy.
  const vazou = corposVistos.filter((c) => c.includes(CHAVE));
  checar(`nenhum dos ${corposVistos.length} corpos de resposta contém a chave`, vazou.length, 0);

  const src = readFileSync(new URL('../worker/src/etaSaida.js', import.meta.url), 'utf8');
  // A chave só pode aparecer (a) no guard de configuração e (b) montando URL do
  // Google. Qualquer outro uso é suspeito e merece revisão humana.
  const linhasComChave = src.split('\n').filter((l) => l.includes('OLLI_ROUTES_API_KEY') && !l.trim().startsWith('*'));
  const suspeitas = linhasComChave.filter((l) => !(l.includes('if (!env.OLLI_ROUTES_API_KEY)') || l.includes('googleapis.com') || l.includes("key=' + env.OLLI_ROUTES_API_KEY")));
  checar('a chave só é usada no guard e na URL do Google', suspeitas, []);
  checar('o app nunca recebe a chave: ela não é serializada em lugar nenhum', src.includes('chave: env.OLLI'), false);

  // O rate limit tem que vir ANTES do primeiro fetch pago. Se alguém mover a
  // checagem para depois, o teto vira decoração e a conta fica aberta.
  const iLimite = src.indexOf('deixaPassar(estado, { sensivel: true })');
  const iResolve = src.indexOf('resolverPonto(corpo.origem');
  checar('o fail-closed está escrito no fonte', iLimite > 0, true);
  checar('rate limit vem ANTES de resolver endereço (geocoding é pago)', iLimite < iResolve, true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
