/**
 * OLLI — dados públicos brasileiros que o prestador não deveria ter que digitar.
 *
 *   GET /cep/<8 dígitos>  → endereço do cliente a partir do CEP
 *   GET /feriados/<ano>   → feriados nacionais do ano (SEM rede — calculado aqui)
 *
 * Cluster K2. As duas rotas passam nos três critérios do brief: não dependem de
 * conta nova do dono (upstream grátis e sem chave / cálculo local), servem o
 * prestador brasileiro de campo, e degradam sem rede sem virar beco sem saída.
 *
 * ─── POR QUE O CEP SAIU DO APARELHO E VEIO PARA O WORKER ───────────────────
 * Hoje `src/services/cep.ts` chama o ViaCEP direto do aparelho e devolve
 * `null` para TUDO: CEP que não existe, ViaCEP fora do ar, rede caída, JSON
 * quebrado. O comentário do próprio arquivo assume ("Falha silenciosa"). É o
 * bug recorrente `olli-gate-erro-vira-vazio` na sua forma mais barata de
 * cometer: "não sei" chega na tela como "não tem".
 *
 * A diferença importa na mão do prestador. "Esse CEP não existe" pede que ele
 * confira o número com o cliente. "Não consegui consultar agora" pede que ele
 * digite e siga. Mandar a primeira mensagem quando a verdade é a segunda faz
 * ele ligar para o cliente por nada, na frente do cliente.
 *
 * ─── A DESCOBERTA QUE DESENHOU ESTE ARQUIVO ────────────────────────────────
 * Verificado ao vivo em 2026-07-18 (comando no teste, valores no doc do
 * cluster): a BrasilAPI CEP v2 responde **404 com o mesmo corpo** para as duas
 * situações que este endpoint mais precisa distinguir:
 *
 *     GET /api/cep/v2/00000000  → 404
 *     {"name":"CepPromiseError","type":"service_error",
 *      "message":"Todos os serviços de CEP retornaram erro.", "errors":[...]}
 *
 * Esse corpo é literalmente "todos os provedores falharam". Ele aparece tanto
 * quando o CEP não existe quanto quando os quatro upstreams estão fora — e não
 * há campo que separe os dois casos. Ou seja: **um 404 da BrasilAPI não é
 * prova de que o CEP não existe.** Traduzir aquele 404 direto em "CEP
 * inexistente" seria importar o bug da casa de dentro do fornecedor.
 *
 * Daí a regra dura daqui: `nao_encontrado` só sai quando o **ViaCEP** disser,
 * com a marca dele (`{"erro":"true"}`, HTTP 200 — verificado ao vivo). Se o
 * ViaCEP não respondeu, o estado é `indisponivel`. Nunca inventamos ausência.
 *
 * ─── TRÊS ESTADOS (regra P0 da casa) ───────────────────────────────────────
 *   { ok:true,  estado:'ok', endereco, fonte, cache }
 *   { ok:false, estado:'nao_encontrado' }  → 404. Confirmado pelo ViaCEP. Ação: conferir o número.
 *   { ok:false, estado:'invalido' }        → 400. Não são 8 dígitos. Ação: corrigir o campo.
 *   { ok:false, estado:'indisponivel' }    → 200/401/429. Ação: digitar à mão e seguir.
 * "Não sei" nunca vira "não tem", e nada disso vira sucesso.
 *
 * ─── CUSTO E CACHE ─────────────────────────────────────────────────────────
 * Os dois upstreams são GRÁTIS e sem chave (BrasilAPI, ViaCEP). O que se
 * economiza aqui não é fatura — é cota de fair-use de projeto comunitário e
 * latência na mão de quem está em pé, de luva, numa rede ruim.
 *
 * O cache é em MEMÓRIA DO ISOLATE, e a escolha é deliberada:
 *  - **Não** dá para usar a CDN da Cloudflare: a rota é autenticada, e request
 *    com header `Authorization` faz a Cloudflare pular o cache de borda. Um
 *    `Cache-Control` aqui seria enfeite.
 *  - **Não** dá para usar tabela no Supabase como o `cnpj_cache`: precisaria de
 *    migration, e esta onda não aplica migration. Mais importante: endpoint que
 *    só funciona depois que alguém roda SQL é endpoint que nasce quebrado.
 *  - Sobra o mapa do isolate — grátis, imediato, e o pior caso é um miss.
 * Duas garantias verificáveis (as duas viram asserção no teste, contando
 * chamadas ao fetch): o MESMO CEP consultado duas vezes no mesmo isolate custa
 * **1** chamada upstream, não 2; e um CEP inexistente consultado dez vezes
 * custa **2** chamadas (BrasilAPI + ViaCEP), não 20 — o negativo também é
 * cacheado, por menos tempo. `indisponivel` NUNCA é cacheado: guardar o erro é
 * transformar uma falha de 3 segundos numa falha de 30 dias.
 *
 * ─── E OS FERIADOS? NENHUMA REDE. ──────────────────────────────────────────
 * A BrasilAPI tem `/api/feriados/v1/<ano>` e a tentação é fazer proxy. Não
 * fizemos, por dois motivos que se somam:
 *
 * 1. **Feriado nacional é calculável.** As datas fixas estão em lei e as móveis
 *    são todas deslocamento da Páscoa, que é aritmética fechada desde 1582.
 *    Uma agenda de campo que precisa de rede para saber que 7 de setembro é
 *    feriado é uma agenda que falha justamente no caminho, sem sinal.
 * 2. **A resposta da BrasilAPI está errada para o nosso uso.** Verificado ao
 *    vivo: ela devolve Carnaval e Corpus Christi como `"type":"national"`, e
 *    ainda lista a Páscoa. Pela Portaria MGI nº 11.460/2025 (calendário oficial
 *    de 2026) Carnaval e Corpus Christi são **ponto facultativo**, não feriado
 *    nacional, e a Páscoa não está no calendário — é domingo.
 *
 * Então aqui a distinção é explícita, porque para o prestador ela é operacional
 * e não jurídica: `nacional` = quase tudo fecha; `facultativo` = depende, mas
 * marcar visita é arriscado. Conferido contra o calendário oficial de 2026:
 * Sexta-feira Santa 03/04 (nacional), Carnaval 16-17/02 e Corpus Christi 04/06
 * (facultativos) — os três batem com o cálculo deste arquivo.
 *
 * ⚠️ HONESTIDADE OBRIGATÓRIA: feriado **municipal** não está aqui e não tem
 * como estar (não existe base nacional confiável — são 5.570 calendários). E é
 * justo o que mais atrapalha o prestador: o aniversário da cidade esvazia a
 * agenda dele. Por isso a resposta carrega `municipaisIncluidos: false` — para
 * a tela poder dizer "não incluí os feriados da sua cidade" em vez de deixar o
 * app parecer mais esperto do que é.
 */

import { checarLimite, deixaPassar } from './rateLimit.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

/** "Não consegui consultar." NUNCA acompanha endereço, e NUNCA vira `nao_encontrado`. */
export function respIndisponivel(erro, status = 200) {
  return json({ ok: false, estado: 'indisponivel', erro }, status);
}

// ═══════════════════════════════════════════════════════════════════════════
// CEP
// ═══════════════════════════════════════════════════════════════════════════

/** Endereço não muda de lugar; o que muda é o loteamento novo. 30 dias, igual ao cnpj_cache. */
export const CEP_TTL_OK_MS = 30 * 24 * 3600 * 1000;

/**
 * CEP inexistente fica MUITO menos tempo em cache que CEP achado. Um CEP que
 * não existe hoje pode existir no mês que vem (loteamento novo ganha faixa), e
 * o custo de errar para o lado da ausência é o prestador achar que o endereço
 * do cliente é inválido. 24h só serve para segurar o dedo tremido que repete a
 * mesma consulta seguidas vezes.
 */
export const CEP_TTL_NAO_MS = 24 * 3600 * 1000;

/** Teto do mapa do isolate. Estourou, limpa tudo (mesma política crua do userCache). */
export const CEP_CACHE_MAX = 500;

/** Rede ruim é o normal deste público: melhor falhar em 4s e liberar a digitação. */
export const CEP_TIMEOUT_MS = 4000;

const cacheCep = new Map(); // '01001000' -> { exp, corpo, status }

/** Só para teste: o mapa é do módulo, e teste que herda cache do vizinho não prova nada. */
export function limparCacheCep() {
  cacheCep.clear();
}

/**
 * 8 dígitos ou nada. Aceita máscara ("01001-000") porque o campo do app tem
 * máscara. Devolve `null` quando não dá — e `null` aqui é `invalido`, que é um
 * estado diferente de `nao_encontrado`.
 */
export function normalizarCep(bruto) {
  const so = String(bruto ?? '').replace(/\D/g, '');
  return so.length === 8 ? so : null;
}

/**
 * Coordenada do CEP, quando o upstream mandar.
 *
 * A BrasilAPI v2 promete `location.coordinates.{latitude,longitude}` — e nas 5
 * consultas reais feitas em 2026-07-18 (Sé/SP, Centro/RJ, Centro/BH,
 * Centro/Floripa, Sarandi/PR) veio `"coordinates": {}` em TODAS. Ou seja: a
 * coordenada existe no contrato e quase nunca no dado.
 *
 * Consequência de projeto, e é a razão de esta função existir separada: o ETA
 * **não pode** ser desenhado contando com ela. Quando vier, é economia de uma
 * chamada paga de Geocoding; quando não vier, o campo simplesmente não aparece.
 * Nunca `0`, nunca `null` disfarçado de coordenada — 0,0 é um ponto no Atlântico.
 * Aceita número ou string (a API documenta string).
 */
export function lerCoordenada(loc) {
  const c = loc && loc.coordinates;
  if (!c || typeof c !== 'object') return null;
  const lat = Number(c.latitude);
  const lng = Number(c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null; // ilha nula: é ausência de dado, não endereço
  return { lat, lng };
}

/** Molda a resposta da BrasilAPI v2 no endereço do OLLI. `null` = veio algo que não é endereço. */
export function lerBrasilApiCep(d, cep) {
  if (!d || typeof d !== 'object') return null;
  const cidade = String(d.city || '').trim();
  const uf = String(d.state || '').trim().toUpperCase().slice(0, 2);
  // Sem cidade e UF não é endereço utilizável — e endereço pela metade preenche
  // o formulário com meia verdade, que é pior que campo vazio.
  if (!cidade || uf.length !== 2) return null;
  const endereco = {
    cep,
    logradouro: String(d.street || '').trim(),
    bairro: String(d.neighborhood || '').trim(),
    cidade,
    uf,
  };
  const coord = lerCoordenada(d.location);
  if (coord) {
    endereco.lat = coord.lat;
    endereco.lng = coord.lng;
  }
  return endereco;
}

/**
 * Lê o ViaCEP. Devolve o ESTADO, não só o dado — porque é o ViaCEP que tem
 * autoridade para dizer "não existe".
 *
 * `{"erro":"true"}` com HTTP 200 é a marca de inexistente (verificado ao vivo:
 * a chave vem como **string** `"true"`, não booleano — a doc antiga mostra
 * booleano, então os dois são aceitos; comparar com `=== true` deixaria passar
 * o inexistente como se fosse endereço vazio).
 */
export function lerViaCep(d, cep) {
  if (!d || typeof d !== 'object') return { estado: 'indisponivel' };
  if (d.erro === true || d.erro === 'true') return { estado: 'nao_encontrado' };
  const cidade = String(d.localidade || '').trim();
  const uf = String(d.uf || '').trim().toUpperCase().slice(0, 2);
  if (!cidade || uf.length !== 2) return { estado: 'indisponivel' };
  return {
    estado: 'ok',
    endereco: {
      cep,
      logradouro: String(d.logradouro || '').trim(),
      bairro: String(d.bairro || '').trim(),
      cidade,
      uf,
    },
  };
}

/** `AbortSignal.timeout` existe no Workers e no Node 18+; se não existir, segue sem timeout. */
function sinalDeTimeout(ms) {
  try {
    return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(ms)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * GET /cep/<8 dígitos> — autenticado.
 *
 * Ordem dos provedores, e o motivo de cada um:
 *  1. **BrasilAPI CEP v2** — agrega 4 bases (correios, viacep, widenet,
 *     open-cep), então acha CEP novo que o ViaCEP sozinho ainda não tem, e é a
 *     única que pode trazer coordenada. Mas o 404 dela é ambíguo (ver docblock).
 *  2. **ViaCEP** — segunda porta E árbitro. Só ele produz `nao_encontrado`.
 *
 * Se os dois falharem: `indisponivel`. O app mantém a digitação manual, que é
 * o que já acontece hoje — a diferença é que agora ele SABE que foi falha.
 *
 * @param {{fetch?:Function, agora?:Function, getUser?:Function}} [deps] — injeção para teste.
 */
export async function handleCep(request, env, cepBruto, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const agora = deps.agora ? deps.agora() : Date.now();
  const getUser = deps.getUser || getUserPadrao;

  const user = await getUser(request, env);
  if (!user) return respIndisponivel('nao_autorizado', 401);

  const cep = normalizarCep(cepBruto);
  // `invalido` ANTES do rate limit: recusar 8 dígitos malformados não consome
  // upstream nem cota de ninguém, e gastar balde de rate limit com erro de
  // digitação puniria justamente quem digitou errado e vai corrigir em seguida.
  if (!cep) return json({ ok: false, estado: 'invalido', erro: 'cep_invalido' }, 400);

  // Cache ANTES do rate limit: acerto de cache não toca a rede de ninguém, então
  // não faz sentido ele competir por balde. Sem isto, o prestador que revisita o
  // mesmo cliente cinco vezes seguidas leva 429 por consultas que custaram zero.
  const guardado = cacheCep.get(cep);
  if (guardado && guardado.exp > agora) {
    return json({ ...guardado.corpo, cache: true }, guardado.status);
  }

  // Rate limit por usuário ANTES de qualquer fetch. Os upstreams são grátis, mas
  // "grátis" tem fair-use e a BrasilAPI é projeto comunitário sem SLA — sem teto
  // aqui, o worker vira ferramenta de raspagem de base de CEP em nome do OLLI.
  // `sensivel:false` (limiter indisponível → segue), na política de rateLimit.js
  // para rota que não gasta dinheiro: derrubar o cadastro do cliente porque o
  // limitador piscou seria pior que o abuso que ele previne.
  const estadoLimite = await checarLimite(env.CEP_RL, user.id);
  if (!deixaPassar(estadoLimite, { sensivel: false })) {
    return respIndisponivel('muitas_requisicoes', 429);
  }

  const viaBrasil = await consultarBrasilApi(fetchFn, cep);
  if (viaBrasil.estado === 'ok') {
    return guardarEResponder(cep, { ok: true, estado: 'ok', endereco: viaBrasil.endereco, fonte: 'brasilapi' }, 200, CEP_TTL_OK_MS, agora);
  }

  // Chegou aqui: a BrasilAPI falhou OU devolveu 404 — e 404 dela NÃO prova
  // ausência (docblock). Quem tem autoridade para dizer "não existe" é o ViaCEP.
  const viaCep = await consultarViaCep(fetchFn, cep);
  if (viaCep.estado === 'ok') {
    return guardarEResponder(cep, { ok: true, estado: 'ok', endereco: viaCep.endereco, fonte: 'viacep' }, 200, CEP_TTL_OK_MS, agora);
  }
  if (viaCep.estado === 'nao_encontrado') {
    return guardarEResponder(cep, { ok: false, estado: 'nao_encontrado', cep }, 404, CEP_TTL_NAO_MS, agora);
  }

  // Os dois calaram. Isto é "não sei", e sai como "não sei".
  return respIndisponivel('cep_indisponivel');
}

/** Grava no cache do isolate e responde. `indisponivel` não passa por aqui — de propósito. */
function guardarEResponder(cep, corpo, status, ttl, agora) {
  if (cacheCep.size > CEP_CACHE_MAX) cacheCep.clear();
  cacheCep.set(cep, { exp: agora + ttl, corpo, status });
  return json({ ...corpo, cache: false }, status);
}

async function consultarBrasilApi(fetchFn, cep) {
  try {
    const r = await fetchFn(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
      headers: { Accept: 'application/json' },
      signal: sinalDeTimeout(CEP_TIMEOUT_MS),
    });
    // Todo não-200 (incluindo o 404 ambíguo) é "não consegui" para efeito de
    // decisão. Quem decide ausência é o ViaCEP, logo abaixo na cadeia.
    if (!r || !r.ok) return { estado: 'indisponivel' };
    const d = await r.json().catch(() => null);
    const endereco = lerBrasilApiCep(d, cep);
    return endereco ? { estado: 'ok', endereco } : { estado: 'indisponivel' };
  } catch {
    return { estado: 'indisponivel' };
  }
}

async function consultarViaCep(fetchFn, cep) {
  try {
    const r = await fetchFn(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: 'application/json' },
      signal: sinalDeTimeout(CEP_TIMEOUT_MS),
    });
    // 400 do ViaCEP = formato recusado. Como já validamos 8 dígitos antes, um
    // 400 aqui é problema do lado dele — e problema dele nunca vira "não existe".
    if (!r || !r.ok) return { estado: 'indisponivel' };
    const d = await r.json().catch(() => null);
    return lerViaCep(d, cep);
  } catch {
    return { estado: 'indisponivel' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FERIADOS — calculados, sem rede
// ═══════════════════════════════════════════════════════════════════════════

/** Mesmo intervalo que a BrasilAPI aceita, para não surpreender quem migrar. */
export const FERIADO_ANO_MIN = 1900;
export const FERIADO_ANO_MAX = 2199;

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/**
 * Feriados de data fixa. `desde` existe porque feriado nacional tem data de
 * nascimento em lei, e uma agenda que olha para trás precisa acertar o passado:
 * marcar 20/11/2022 como feriado nacional é reescrever a história do calendário
 * do prestador (e do relatório de atendimentos daquele mês).
 */
const FIXOS = [
  { mes: 1, dia: 1, nome: 'Confraternização Universal', tipo: 'nacional', desde: 1949 },
  { mes: 4, dia: 21, nome: 'Tiradentes', tipo: 'nacional', desde: 1949 },
  { mes: 5, dia: 1, nome: 'Dia do Trabalho', tipo: 'nacional', desde: 1949 },
  { mes: 9, dia: 7, nome: 'Independência do Brasil', tipo: 'nacional', desde: 1949 },
  // Lei 6.802/1980 — padroeira do Brasil.
  { mes: 10, dia: 12, nome: 'Nossa Senhora Aparecida', tipo: 'nacional', desde: 1980 },
  { mes: 11, dia: 2, nome: 'Finados', tipo: 'nacional', desde: 1949 },
  { mes: 11, dia: 15, nome: 'Proclamação da República', tipo: 'nacional', desde: 1949 },
  // Lei 14.759/2023: nacional a partir de 2024. Antes disso era estadual/municipal.
  { mes: 11, dia: 20, nome: 'Dia Nacional de Zumbi e da Consciência Negra', tipo: 'nacional', desde: 2024 },
  { mes: 12, dia: 25, nome: 'Natal', tipo: 'nacional', desde: 1949 },
];

/**
 * Feriados móveis, todos deslocamento da Páscoa. Os `offset` foram conferidos
 * contra o calendário oficial de 2026 (Portaria MGI nº 11.460/2025): Páscoa em
 * 05/04 → Carnaval 16 e 17/02, Cinzas 18/02, Sexta-feira Santa 03/04, Corpus
 * Christi 04/06. Bate nos cinco.
 *
 * A COLUNA `tipo` É A PARTE ÚTIL. Carnaval e Corpus Christi são ponto
 * facultativo, não feriado nacional — a BrasilAPI chama os dois de `national` e
 * erra. Para o prestador a diferença é concreta: em feriado nacional o cliente
 * quase certamente não vai receber ninguém; em facultativo, comércio abre,
 * indústria não, e vale perguntar antes de marcar.
 */
const MOVEIS = [
  { offset: -48, nome: 'Segunda-feira de Carnaval', tipo: 'facultativo' },
  { offset: -47, nome: 'Carnaval', tipo: 'facultativo' },
  { offset: -46, nome: 'Quarta-feira de Cinzas (até 14h)', tipo: 'facultativo' },
  { offset: -2, nome: 'Sexta-feira Santa', tipo: 'nacional' },
  { offset: 60, nome: 'Corpus Christi', tipo: 'facultativo' },
];

/**
 * Domingo de Páscoa (algoritmo gregoriano anônimo / Meeus-Jones-Butcher).
 * Aritmética fechada, sem tabela e sem rede — é o que permite esta rota
 * funcionar para qualquer ano sem depender de ninguém.
 * @returns {{mes:number, dia:number}} mês 1-12.
 */
export function domingoDePascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const bruto = h + l - 7 * m + 114;
  return { mes: Math.floor(bruto / 31), dia: (bruto % 31) + 1 };
}

/** 'AAAA-MM-DD' em UTC puro — nada de fuso, que é como uma data vira o dia anterior. */
function iso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Lista os feriados de um ano, ordenada por data. Função PURA: mesma entrada,
 * mesma saída, zero rede, zero relógio.
 */
export function feriadosDoAno(ano) {
  const pascoa = domingoDePascoa(ano);
  const pascoaMs = Date.UTC(ano, pascoa.mes - 1, pascoa.dia);

  const lista = [];
  for (const f of FIXOS) {
    if (ano < f.desde) continue; // ainda não era feriado nacional naquele ano
    lista.push({ ms: Date.UTC(ano, f.mes - 1, f.dia), nome: f.nome, tipo: f.tipo });
  }
  for (const m of MOVEIS) {
    lista.push({ ms: pascoaMs + m.offset * 86_400_000, nome: m.nome, tipo: m.tipo });
  }

  return lista
    .sort((x, y) => x.ms - y.ms)
    .map((x) => ({
      data: iso(x.ms),
      nome: x.nome,
      tipo: x.tipo,
      diaSemana: DIAS_SEMANA[new Date(x.ms).getUTCDay()],
    }));
}

/**
 * GET /feriados/<ano> — autenticado, e **zero chamadas de rede**.
 *
 * Sem rate limit de propósito, e isto é decisão, não esquecimento: a rota não
 * chama ninguém, não gasta cota de terceiro e não custa dinheiro. O único
 * recurso em jogo é CPU de um cálculo de microssegundos sobre ~14 itens, já
 * protegido por autenticação. Pôr um limitador aqui seria ritual — e ritual
 * ensina o time a tratar rate limit como carimbo em vez de proteção de custo.
 *
 * O app deve baixar o ano inteiro UMA vez e guardar. É a regra do documento de
 * APIs para dado que não muda, e é o que faz a agenda saber que segunda é
 * feriado mesmo com o celular sem sinal, no meio do atendimento.
 */
export async function handleFeriados(request, env, anoBruto, deps = {}) {
  const getUser = deps.getUser || getUserPadrao;
  const user = await getUser(request, env);
  if (!user) return respIndisponivel('nao_autorizado', 401);

  const ano = Number(String(anoBruto ?? '').trim());
  if (!Number.isInteger(ano) || ano < FERIADO_ANO_MIN || ano > FERIADO_ANO_MAX) {
    return json({ ok: false, estado: 'invalido', erro: 'ano_invalido', intervalo: [FERIADO_ANO_MIN, FERIADO_ANO_MAX] }, 400);
  }

  return json({
    ok: true,
    estado: 'ok',
    ano,
    feriados: feriadosDoAno(ano),
    fonte: 'calculo_local',
    // O app precisa poder dizer isto na tela. Sem este campo, a ausência do
    // feriado da cidade parece afirmação de que não existe nenhum.
    municipaisIncluidos: false,
    estaduaisIncluidos: false,
  });
}

// ─── Autenticação (mesma cópia local dos outros módulos do worker) ─────────
// Duplicada de etaSaida.js/index.js pelo mesmo motivo já documentado lá: manter
// este módulo importável sem arrastar @sentry/cloudflare, que só existe em
// worker/node_modules e quebraria o teste rodado pela raiz.

const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map();

async function getUserPadrao(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const cached = userCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.user;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    const user = u && u.id ? u : null;
    if (user) {
      if (userCache.size > 500) userCache.clear();
      userCache.set(token, { user, exp: Date.now() + USER_CACHE_TTL_MS });
    }
    return user;
  } catch {
    return null;
  }
}
