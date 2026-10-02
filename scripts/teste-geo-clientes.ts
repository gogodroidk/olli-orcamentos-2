/**
 * Teste da Onda I1 "coordenada e IBGE dos clientes + visita externa".
 *
 *     node scripts/teste-geo-clientes.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que quebra aqui, e quebra CALADO:
 *  (a) "Não sei" virando "não tem": Nominatim/ViaCEP fora do ar não pode tirar o
 *      cliente da fila do backfill como se o endereço não existisse (bloco 4/6);
 *  (b) política do Nominatim: User-Agent próprio, 1 req/s, teto global
 *      fail-closed, cache — quem desrespeita é bloqueado por IP e o recurso morre
 *      para todos (bloco 5);
 *  (c) ponto velho no endereço novo: trocar o CEP tem de matar o ponto antigo no
 *      aparelho (`geoAposEdicao`), na nuvem (trigger, bloco 8 em PGlite) e no
 *      backfill (PATCH condicional, bloco 6);
 *  (d) "externa" nunca vira "interna" por falta de resposta (bloco 2).
 *
 * Exercita os módulos REAIS (`src/utils/geoCliente.ts`, `src/services/verticais.ts`,
 * `worker/src/geoClientes.js`, `src/services/cep.ts` com stubs de config/supabase) e a
 * migration num Postgres embutido. Nenhuma rede, nenhuma chave.
 */
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import {
  ATRIBUICAO_OSM,
  coordenadaValida,
  enderecoGeocodificavel,
  extrairNumeroEndereco,
  geoAposEdicao,
  geoParaColunas,
  lerGeoDaLinha,
  logradouroDoEndereco,
  mudancaDeEndereco,
  normalizarIbge,
  precisaGeocodificar,
  precisaoPorRankNominatim,
} from '../src/utils/geoCliente.ts';
import { externaParaSqlite, lerExterna, sugerirVisitaExterna, VERTICAIS } from '../src/services/verticais.ts';
import {
  NOMINATIM_INTERVALO_MS,
  NOMINATIM_USER_AGENT,
  criarNominatim,
  geocodificarEndereco,
  handleGeo,
  lerRespostaNominatim,
  limparEstadoGeo,
  modoGeoBackfill,
  processarGeoClientes,
  // @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
} from '../worker/src/geoClientes.js';
// @ts-expect-error
import { limparCacheCep as limparCacheCepWorker } from '../worker/src/brasil.js';

let falhas = 0;
let passes = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`);
  }
}
const js = (v: unknown) => JSON.stringify(v);

function respJson(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

// ─── Corpos no formato REAL dos serviços ───────────────────────────────────
const BRASILAPI_SE_SEM_COORD = {
  cep: '01310100', state: 'SP', city: 'São Paulo', neighborhood: 'Bela Vista', street: 'Avenida Paulista',
  service: 'open-cep', location: { type: 'Point', coordinates: {} },
};
const BRASILAPI_COM_COORD = {
  ...BRASILAPI_SE_SEM_COORD,
  location: { type: 'Point', coordinates: { longitude: '-46.6544', latitude: '-23.5629' } },
};
const VIACEP_PAULISTA = {
  cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP', ibge: '3550308',
};
const NOMINATIM_CASA = [{ lat: '-23.5614', lon: '-46.6559', place_rank: 30, addresstype: 'building' }];
const NOMINATIM_RUA = [{ lat: '-23.5630', lon: '-46.6540', place_rank: 26, addresstype: 'road' }];
const NOMINATIM_CIDADE = [{ lat: '-23.5506', lon: '-46.6333', place_rank: 16, addresstype: 'city' }];
const MUNICIPIOS_SP = [{ nome: 'SÃO PAULO', codigo_ibge: '3550308' }, { nome: 'CAMPINAS', codigo_ibge: '3509502' }];

type Rota = (url: URL, init?: RequestInit) => Response | Promise<Response>;
interface Mocks {
  brasilapiCep?: Rota;
  viacep?: Rota;
  municipios?: Rota;
  nominatim?: Rota;
  supabase?: Rota;
}
interface Chamada { url: string; host: string; init?: RequestInit }

function montarFetch(m: Mocks) {
  const chamadas: Chamada[] = [];
  const f = async (entrada: unknown, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(entrada));
    chamadas.push({ url: url.toString(), host: url.host, init });
    const nao = () => respJson({ erro: 'sem mock' }, 599);
    if (url.host === 'brasilapi.com.br' && url.pathname.startsWith('/api/cep/v2/')) return (m.brasilapiCep ?? nao)(url, init);
    if (url.host === 'brasilapi.com.br' && url.pathname.startsWith('/api/ibge/municipios/')) return (m.municipios ?? nao)(url, init);
    if (url.host === 'viacep.com.br') return (m.viacep ?? nao)(url, init);
    if (url.host === 'nominatim.openstreetmap.org') return (m.nominatim ?? nao)(url, init);
    if (url.host === 'supa.example.co') return (m.supabase ?? nao)(url, init);
    return nao();
  };
  return { f, chamadas, de: (host: string) => chamadas.filter((c) => c.host === host) };
}

/** Limitador global falso (binding de rate limit do Workers). */
function limitador(permitir = true) {
  const chaves: string[] = [];
  return { chaves, limit: async ({ key }: { key: string }) => { chaves.push(key); return { success: permitir }; } };
}

/** Relógio falso: `dormir` avança o relógio em vez de esperar. */
function relogio(inicio = Date.parse('2026-10-02T10:00:00-03:00')) {
  let t = inicio;
  const esperas: number[] = [];
  return { agora: () => t, dormir: async (ms: number) => { esperas.push(ms); t += ms; }, esperas, avancar: (ms: number) => { t += ms; } };
}

function reset() {
  limparEstadoGeo();
  limparCacheCepWorker();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) geoCliente.ts — regras puras');
{
  checar('coordenada válida', js(coordenadaValida('-23.5', -46.6)) === js({ lat: -23.5, lon: -46.6 }));
  checar('0,0 não é coordenada', coordenadaValida(0, 0) === null);
  checar('meia coordenada não é coordenada', coordenadaValida(-23.5, null) === null && coordenadaValida('', -46) === null);
  checar('fora do planeta não é coordenada', coordenadaValida(91, 0) === null && coordenadaValida(0, 181) === null);
  checar('IBGE só com 7 dígitos', normalizarIbge(3550308) === '3550308' && normalizarIbge('355030') === null && normalizarIbge('') === null);

  checar('linha completa vira geo', js(lerGeoDaLinha({ lat: -23.5, lon: -46.6, ibge: '3550308', geo_precisao: 'cep' })) === js({ lat: -23.5, lon: -46.6, geoPrecisao: 'cep', ibge: '3550308' }));
  checar('ponto sem precisão = sem ponto (IBGE fica)', js(lerGeoDaLinha({ lat: -23.5, lon: -46.6, ibge: '3550308', geo_precisao: null })) === js({ ibge: '3550308' }));
  checar('precisão inventada = sem ponto', js(lerGeoDaLinha({ lat: -23.5, lon: -46.6, geo_precisao: 'satelite' })) === js({}));
  checar('geoParaColunas manda null no que não sabe', js(geoParaColunas({ ibge: '3550308' })) === js({ lat: null, lon: null, ibge: '3550308', geo_precisao: null }));

  checar('número depois da vírgula', extrairNumeroEndereco('Av. Paulista, 1000 - ap 12') === '1000');
  checar('"Rua 25 de Março, 120" pega 120, não 25', extrairNumeroEndereco('Rua 25 de Março, 120') === '120');
  checar('"nº 45"', extrairNumeroEndereco('Rua X, nº 45') === '45');
  checar('número no fim sem vírgula', extrairNumeroEndereco('Rua das Flores 77') === '77');
  checar('"Rua 25 de Março" sem número = null', extrairNumeroEndereco('Rua 25 de Março') === null);
  checar('"s/n" = null', extrairNumeroEndereco('Rua X, s/n') === null);
  checar('logradouro sem número/complemento', logradouroDoEndereco('Av. Paulista, 1000 - ap 12') === 'Av. Paulista' && logradouroDoEndereco('Rua das Flores 77') === 'Rua das Flores');

  checar('rank 30 = número; 26 = rua; 16 = cidade; 8 = nada',
    precisaoPorRankNominatim(30) === 'numero' && precisaoPorRankNominatim(26) === 'rua' &&
    precisaoPorRankNominatim(16) === 'cidade' && precisaoPorRankNominatim(8) === null);

  const antes = { cep: '01310-100', endereco: 'Av. Paulista, 1000', cidade: 'São Paulo', estado: 'SP', lat: -23.56, lon: -46.65, ibge: '3550308', geoPrecisao: 'numero' as const };
  checar('mesmo endereço (máscara/acento/caixa) não muda nada',
    js(mudancaDeEndereco(antes, { cep: '01310100', endereco: 'av. paulista, 1000', cidade: 'Sao Paulo', estado: 'sp' })) === js({ coordenada: false, municipio: false }));
  checar('mesmo endereço mantém a geo gravada', js(geoAposEdicao(antes, { ...antes })) === js({ ibge: '3550308', lat: -23.56, lon: -46.65, geoPrecisao: 'numero' }));
  checar('trocou só o número: perde o ponto, mantém o IBGE', js(geoAposEdicao(antes, { ...antes, endereco: 'Av. Paulista, 2000' })) === js({ ibge: '3550308' }));
  checar('trocou o CEP: perde tudo', js(geoAposEdicao(antes, { ...antes, cep: '20040-020' })) === js({}));
  checar('cliente novo: nenhuma geo', js(geoAposEdicao(null, antes)) === js({}));

  checar('geocodificável com CEP ou cidade+UF', enderecoGeocodificavel({ cep: '01310100' }) && enderecoGeocodificavel({ cidade: 'Campinas', estado: 'SP' }));
  checar('não geocodificável sem nada', !enderecoGeocodificavel({ endereco: 'Rua X, 10' }) && !enderecoGeocodificavel({ cidade: 'Campinas' }));
  checar('precisa geocodificar só quando falta o ponto', precisaGeocodificar({ cep: '01310100' }) && !precisaGeocodificar({ cep: '01310100', lat: -23, lon: -46, geoPrecisao: 'cep' }));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n2) visita externa — sugestão pelo ofício e "não sei" ≠ "não"');
{
  checar('instalação de ar sugere externa (condensadora)', sugerirVisitaExterna({ tipoVisitaId: 'refrigeracao_instalacao' }) === true);
  checar('jardinagem e piscina sugerem externa', sugerirVisitaExterna({ tipoVisitaId: 'jardinagem_poda' }) === true && sugerirVisitaExterna({ tipoVisitaId: 'piscina_manutencao' }) === true);
  checar('limpeza de split NÃO sugere nada (undefined, não false)', sugerirVisitaExterna({ tipoVisitaId: 'refrigeracao_limpeza' }) === undefined);
  checar('título "Pintura da fachada" sugere externa', sugerirVisitaExterna({ titulo: 'Pintura da fachada' }) === true);
  checar('"Dedetização externa" sugere externa', sugerirVisitaExterna({ titulo: 'Dedetização externa' }) === true);
  checar('"Troca do TELHADO" (caixa/acento) sugere externa', sugerirVisitaExterna({ titulo: 'Troca do TELHADO' }) === true);
  checar('"Limpeza de split" não sugere', sugerirVisitaExterna({ titulo: 'Limpeza de split' }) === undefined);
  checar('nunca devolve false', [
    sugerirVisitaExterna({}), sugerirVisitaExterna({ titulo: 'sala' }), sugerirVisitaExterna({ tipoVisitaId: 'eletrica_manutencao' }),
  ].every((v) => v === undefined));
  const ids = new Set(VERTICAIS.flatMap((v) => v.tiposVisita.map((t) => t.id)));
  checar('todo tipo marcado externa existe no catálogo', VERTICAIS.every((v) => v.tiposVisita.every((t) => !t.externa || ids.has(t.id))));
  checar('SQLite: true→1, false→0, undefined→NULL', externaParaSqlite(true) === 1 && externaParaSqlite(false) === 0 && externaParaSqlite(undefined) === null);
  checar('leitura: 1/0/true/false', lerExterna(1) === true && lerExterna('0') === false && lerExterna(true) === true && lerExterna(false) === false);
  checar('leitura: NULL/lixo = não informado (undefined), nunca false', lerExterna(null) === undefined && lerExterna(2) === undefined && lerExterna('talvez') === undefined);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3) Nominatim — leitura da resposta');
{
  checar('casa', js(lerRespostaNominatim(NOMINATIM_CASA)) === js({ lat: -23.5614, lon: -46.6559, precisao: 'numero' }));
  checar('lista vazia = não achou (null)', lerRespostaNominatim([]) === null);
  checar('corpo que não é lista = ilegível (undefined, vira indisponível)', lerRespostaNominatim({ error: 'x' }) === undefined);
  checar('ponto fora do Brasil = não achou', lerRespostaNominatim([{ lat: '38.7', lon: '-9.1', place_rank: 16 }]) === null);
  checar('estado inteiro (rank 8) não é endereço', lerRespostaNominatim([{ lat: '-23', lon: '-46', place_rank: 8 }]) === null);
}

const ENV_OK = () => ({ NOMINATIM_RL: limitador(true) });

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n4) geocodificarEndereco — quatro estados');
{
  // 4a: BrasilAPI trouxe o ponto do CEP → Nominatim nem é chamado.
  reset();
  {
    const m = montarFetch({ brasilapiCep: () => respJson(BRASILAPI_COM_COORD), viacep: () => respJson(VIACEP_PAULISTA) });
    const rel = relogio();
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, agora: rel.agora, dormir: rel.dormir, cache: null, orcamento: { restante: 2 } });
    const r = await geocodificarEndereco({ cep: '01310-100', endereco: 'Av. Paulista, 1000' }, { fetchFn: m.f, nominatim: nom });
    checar('ponto do CEP pela BrasilAPI, precisão cep', r.estado === 'ok' && r.precisao === 'cep' && r.fonte === 'brasilapi' && r.lat === -23.5629, js(r));
    checar('IBGE pelo ViaCEP', r.ibge === '3550308');
    checar('Nominatim não foi chamado', m.de('nominatim.openstreetmap.org').length === 0);
  }

  // 4b: sem ponto no CEP → Nominatim com número → casa.
  reset();
  {
    const m = montarFetch({
      brasilapiCep: () => respJson(BRASILAPI_SE_SEM_COORD),
      viacep: () => respJson(VIACEP_PAULISTA),
      nominatim: () => respJson(NOMINATIM_CASA),
    });
    const rel = relogio();
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, agora: rel.agora, dormir: rel.dormir, cache: null, orcamento: { restante: 2 } });
    const r = await geocodificarEndereco({ cep: '01310100', endereco: 'Avenida Paulista, 1000' }, { fetchFn: m.f, nominatim: nom });
    checar('achou a casa (numero) pelo Nominatim', r.estado === 'ok' && r.precisao === 'numero' && r.fonte === 'nominatim', js(r));
    const n = m.de('nominatim.openstreetmap.org');
    checar('1 consulta ao Nominatim', n.length === 1, String(n.length));
    const u = new URL(n[0].url);
    checar('consulta estruturada: street com número, cidade e estado por extenso',
      u.searchParams.get('street') === '1000 Avenida Paulista' && u.searchParams.get('city') === 'São Paulo' && u.searchParams.get('state') === 'São Paulo', u.toString());
    checar('jsonv2, limit 1, só Brasil', u.searchParams.get('format') === 'jsonv2' && u.searchParams.get('limit') === '1' && u.searchParams.get('countrycodes') === 'br');
    const ua = (n[0].init?.headers as Record<string, string>)['User-Agent'];
    checar('User-Agent próprio com contato (política do Nominatim)', ua === NOMINATIM_USER_AGENT && /olliorcamentos/.test(ua) && /@/.test(ua), ua);
  }

  // 4c: rua não achada → cidade (precisão cidade, mesmo com rank "melhor").
  reset();
  {
    let i = 0;
    const m = montarFetch({
      brasilapiCep: () => respJson({}, 404),
      viacep: () => respJson(VIACEP_PAULISTA),
      nominatim: () => respJson(i++ === 0 ? [] : [{ ...NOMINATIM_CIDADE[0], place_rank: 20 }]),
    });
    const rel = relogio();
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, agora: rel.agora, dormir: rel.dormir, cache: null, orcamento: { restante: 2 } });
    const r = await geocodificarEndereco({ cep: '01310100', endereco: 'Rua Inexistente, 5' }, { fetchFn: m.f, nominatim: nom });
    checar('caiu para a cidade, com precisão "cidade"', r.estado === 'ok' && r.precisao === 'cidade', js(r));
    checar('a 2ª consulta esperou o intervalo de 1 req/s', rel.esperas.length === 1 && rel.esperas[0] >= 1000, js(rel.esperas));
  }

  // 4d: Nominatim fora do ar → indisponivel (NÃO sem_resultado), com o IBGE que já veio.
  reset();
  {
    const m = montarFetch({ brasilapiCep: () => respJson({}, 404), viacep: () => respJson(VIACEP_PAULISTA), nominatim: () => respJson({}, 503) });
    const rel = relogio();
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, agora: rel.agora, dormir: rel.dormir, cache: null, orcamento: { restante: 2 } });
    const r = await geocodificarEndereco({ cep: '01310100', endereco: 'Av. Paulista, 1000' }, { fetchFn: m.f, nominatim: nom });
    checar('Nominatim 503 = indisponivel (não "sem resultado")', r.estado === 'indisponivel', js(r));
    checar('o IBGE que chegou não se perde', r.ibge === '3550308');
    checar('rua falhou: não gasta a consulta da cidade à toa', m.de('nominatim.openstreetmap.org').length === 1);
  }

  // 4e: todos responderam, ninguém achou → sem_resultado.
  reset();
  {
    const m = montarFetch({ brasilapiCep: () => respJson({}, 404), viacep: () => respJson(VIACEP_PAULISTA), nominatim: () => respJson([]) });
    const rel = relogio();
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, agora: rel.agora, dormir: rel.dormir, cache: null, orcamento: { restante: 2 } });
    const r = await geocodificarEndereco({ cep: '01310100', endereco: 'Av. Paulista, 1000' }, { fetchFn: m.f, nominatim: nom });
    checar('sem_resultado só quando todos responderam', r.estado === 'sem_resultado' && r.ibge === '3550308', js(r));
  }

  // 4f: CEP inexistente (ViaCEP diz) e sem cidade digitada → sem_resultado.
  reset();
  {
    const m = montarFetch({ brasilapiCep: () => respJson({}, 404), viacep: () => respJson({ erro: 'true' }) });
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, cache: null, orcamento: { restante: 2 } });
    const r = await geocodificarEndereco({ cep: '99999999' }, { fetchFn: m.f, nominatim: nom });
    checar('CEP que não existe, sem cidade: sem_resultado', r.estado === 'sem_resultado', js(r));
  }

  // 4g: ViaCEP calado e sem cidade digitada → indisponivel.
  reset();
  {
    const m = montarFetch({ brasilapiCep: () => respJson({}, 404), viacep: () => respJson({}, 502) });
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, cache: null, orcamento: { restante: 2 } });
    const r = await geocodificarEndereco({ cep: '01310100' }, { fetchFn: m.f, nominatim: nom });
    checar('sem ViaCEP e sem cidade: indisponivel', r.estado === 'indisponivel', js(r));
  }

  // 4h: sem CEP → IBGE pela lista de municípios da BrasilAPI.
  reset();
  {
    const m = montarFetch({ municipios: () => respJson(MUNICIPIOS_SP), nominatim: () => respJson(NOMINATIM_CIDADE) });
    const rel = relogio();
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, agora: rel.agora, dormir: rel.dormir, cache: null, orcamento: { restante: 2 } });
    const r = await geocodificarEndereco({ cidade: 'Campinas', uf: 'sp' }, { fetchFn: m.f, nominatim: nom });
    checar('IBGE pelo nome da cidade (BrasilAPI IBGE)', r.estado === 'ok' && r.ibge === '3509502', js(r));
    const r2 = await geocodificarEndereco({ cidade: 'São Paulo', uf: 'SP' }, { fetchFn: m.f, nominatim: nom });
    checar('lista de municípios fica em cache (1 chamada para 2 cidades da UF)', r2.ibge === '3550308' && m.de('brasilapi.com.br').length === 1);
  }

  checar('sem CEP e sem cidade+UF: invalido', (await geocodificarEndereco({ endereco: 'Rua X, 1' }, { fetchFn: async () => respJson({}), nominatim: async () => ({ estado: 'vazio' }) })).estado === 'invalido');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n5) política do Nominatim: teto global, fila, orçamento, cache, recuo');
{
  reset();
  {
    const m = montarFetch({ nominatim: () => respJson(NOMINATIM_RUA) });
    const nom = criarNominatim({ env: {}, fetchFn: m.f, cache: null, orcamento: { restante: 5 } });
    const r = await nom({ street: 'Rua A', city: 'Campinas', state: 'São Paulo' });
    checar('SEM binding de teto global: não chama (fail-closed)', r.estado === 'indisponivel' && r.motivo === 'sem_limitador' && m.chamadas.length === 0, js(r));
  }
  reset();
  {
    const m = montarFetch({ nominatim: () => respJson(NOMINATIM_RUA) });
    const lim = limitador(false);
    const nom = criarNominatim({ env: { NOMINATIM_RL: lim }, fetchFn: m.f, cache: null, orcamento: { restante: 5 } });
    const r = await nom({ street: 'Rua A', city: 'Campinas', state: 'São Paulo' });
    checar('teto global estourado: não chama', r.estado === 'indisponivel' && r.motivo === 'teto_global' && m.chamadas.length === 0);
    checar('chave do teto é GLOBAL (não por usuário)', lim.chaves[0] === 'nominatim-global');
  }
  reset();
  {
    const m = montarFetch({ nominatim: () => respJson(NOMINATIM_RUA) });
    const rel = relogio();
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, agora: rel.agora, dormir: rel.dormir, cache: null, orcamento: { restante: 3 } });
    const instantes: number[] = [];
    for (const rua of ['Rua A', 'Rua B', 'Rua C']) {
      await nom({ street: rua, city: 'Campinas', state: 'São Paulo' });
      instantes.push(rel.agora());
    }
    const gaps = instantes.slice(1).map((t, i) => t - instantes[i]);
    checar(`3 consultas seguidas respeitam ${NOMINATIM_INTERVALO_MS} ms entre si`, gaps.every((g) => g >= NOMINATIM_INTERVALO_MS), js(gaps));
    const quarta = await nom({ street: 'Rua D', city: 'Campinas', state: 'São Paulo' });
    checar('orçamento da rodada esgotado: para de chamar', quarta.estado === 'indisponivel' && quarta.motivo === 'cota_da_rodada' && m.chamadas.length === 3);
    const repetida = await nom({ street: 'rua a', city: 'CAMPINAS', state: 'São Paulo' });
    checar('mesma consulta (caixa diferente) sai do cache, sem rede e sem orçamento', repetida.estado === 'ok' && m.chamadas.length === 3);
  }
  reset();
  {
    let status = 503;
    const m = montarFetch({ nominatim: () => (status === 503 ? respJson({}, 503) : respJson(NOMINATIM_CIDADE)) });
    const rel = relogio();
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, agora: rel.agora, dormir: rel.dormir, cache: null, orcamento: { restante: 10 } });
    await nom({ city: 'Campinas', state: 'São Paulo' });
    status = 200;
    const depois = await nom({ city: 'Campinas', state: 'São Paulo' });
    checar('falha NÃO vai para o cache (a próxima tenta de novo)', m.chamadas.length === 2 && depois.estado === 'ok', js(depois));
  }
  reset();
  {
    const m = montarFetch({ nominatim: () => respJson({}, 429) });
    const rel = relogio();
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, agora: rel.agora, dormir: rel.dormir, cache: null, orcamento: { restante: 10 } });
    await nom({ city: 'Campinas', state: 'São Paulo' });
    const r = await nom({ city: 'Jundiaí', state: 'São Paulo' });
    checar('429 do Nominatim = recuo (não insiste)', r.estado === 'indisponivel' && r.motivo === 'recuo' && m.chamadas.length === 1, js(r));
    rel.avancar(11 * 60 * 1000);
    await nom({ city: 'Jundiaí', state: 'São Paulo' });
    checar('passado o recuo, volta a consultar', m.chamadas.length === 2);
  }
  reset();
  {
    // Pedidos SIMULTÂNEOS (dois /geo no mesmo isolate): cada um reserva o seu
    // horário de saída e dorme no PRÓPRIO contexto — nada de encadear o fetch numa
    // promessa criada por outro pedido (no Workers isso roda I/O no contexto alheio).
    // Relógio parado: cada espera registra o horário-ALVO de saída daquele pedido.
    const t0 = Date.parse('2026-10-02T10:00:00-03:00');
    const saidas: number[] = [];
    const m = montarFetch({ nominatim: () => respJson(NOMINATIM_RUA) });
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, agora: () => t0, dormir: async (ms: number) => { saidas.push(ms); }, cache: null, orcamento: { restante: 3 } });
    const rs = await Promise.all(['Rua E', 'Rua F', 'Rua G'].map((rua) => nom({ street: rua, city: 'Campinas', state: 'São Paulo' })));
    checar('simultâneos: todos respondem e saem com horários reservados em sequência',
      rs.every((r) => r.estado === 'ok') && m.chamadas.length === 3 && js(saidas) === js([NOMINATIM_INTERVALO_MS, 2 * NOMINATIM_INTERVALO_MS]), js(saidas));
    const fonteGeo = readFileSync('worker/src/geoClientes.js', 'utf8');
    checar('sem promessa compartilhada entre pedidos (fila por horário, não por .then)', !/filaNominatim/.test(fonteGeo));
  }
  reset();
  {
    const m = montarFetch({ nominatim: () => respJson({}, 429) });
    const rel = relogio();
    const nom = criarNominatim({ env: ENV_OK(), fetchFn: m.f, agora: rel.agora, dormir: rel.dormir, cache: null, orcamento: { restante: 3 } });
    const rs = await Promise.all(['Rua H', 'Rua I'].map((rua) => nom({ street: rua, city: 'Campinas', state: 'São Paulo' })));
    checar('simultâneos: 429 do primeiro faz o que esperava desistir (recuo)',
      m.chamadas.length === 1 && rs[1].estado === 'indisponivel' && (rs[1] as { motivo?: string }).motivo === 'recuo', js(rs));
  }
  const fonte = readFileSync('worker/src/geoClientes.js', 'utf8');
  checar('nada de Google Geocoding no geo do cliente', !/googleapis|maps\.google/.test(fonte));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n6) POST /geo');
{
  const pedir = (corpo: unknown) => new Request('https://w.example/geo', { method: 'POST', body: JSON.stringify(corpo), headers: { Authorization: 'Bearer x' } });
  const user = async () => ({ id: 'u1' });

  reset();
  const semLogin = await handleGeo(pedir({ cep: '01310100' }), {}, { getUser: async () => null });
  checar('sem login: 401 indisponivel', semLogin.status === 401 && (await semLogin.json()).estado === 'indisponivel');

  reset();
  const vazio = await handleGeo(pedir({ endereco: 'Rua X, 1' }), {}, { getUser: user });
  checar('sem CEP e sem cidade+UF: 400 invalido', vazio.status === 400 && (await vazio.json()).estado === 'invalido');

  reset();
  {
    const m = montarFetch({ brasilapiCep: () => respJson(BRASILAPI_SE_SEM_COORD), viacep: () => respJson(VIACEP_PAULISTA), nominatim: () => respJson(NOMINATIM_CASA) });
    const rel = relogio();
    const r = await handleGeo(pedir({ cep: '01310-100', endereco: 'Av. Paulista, 1000', cidade: 'São Paulo', uf: 'SP' }), ENV_OK(), { getUser: user, fetch: m.f, agora: rel.agora, dormir: rel.dormir, cache: null });
    const d = await r.json();
    checar('ok: ponto, precisão, IBGE e fonte', r.status === 200 && d.ok === true && d.estado === 'ok' && d.precisao === 'numero' && d.ibge === '3550308' && d.fonte === 'nominatim', js(d));
    checar('ok do Nominatim leva a atribuição ODbL', d.atribuicao === ATRIBUICAO_OSM);
  }

  reset();
  {
    const m = montarFetch({ brasilapiCep: () => respJson({}, 404), viacep: () => respJson(VIACEP_PAULISTA), nominatim: () => respJson({}, 500) });
    const rel = relogio();
    const r = await handleGeo(pedir({ cep: '01310100', endereco: 'Av. Paulista, 1000' }), ENV_OK(), { getUser: user, fetch: m.f, agora: rel.agora, dormir: rel.dormir, cache: null });
    const d = await r.json();
    checar('serviço calado: indisponivel com o IBGE parcial (nunca sem_resultado)', d.ok === false && d.estado === 'indisponivel' && d.ibge === '3550308', js(d));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n7) backfill em fila (cron)');
{
  const ENV_BASE = { SUPABASE_URL: 'https://supa.example.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-chave-de-teste-123' };

  reset();
  {
    const m = montarFetch({});
    const r = await processarGeoClientes({ ...ENV_BASE }, { fetchImpl: m.f });
    checar('modo padrão = off: não toca rede nenhuma', r.mode === 'off' && r.motivo === 'desligado' && m.chamadas.length === 0);
    checar('só "production" liga', modoGeoBackfill({ GEO_BACKFILL_MODE: 'on' }) === 'off' && modoGeoBackfill({ GEO_BACKFILL_MODE: 'Production' }) === 'production');
  }

  reset();
  {
    const fila = [
      { id: 'c1', user_id: 'u1', cep: '01310-100', endereco: 'Av. Paulista, 1000', cidade: 'São Paulo', estado: 'SP', lat: null, lon: null, ibge: null, geo_precisao: null },
      { id: 'c2', user_id: 'u1', cep: null, endereco: null, cidade: null, estado: null, lat: null, lon: null, ibge: null, geo_precisao: null },
      { id: 'c3', user_id: 'u2', cep: '01310100', endereco: null, cidade: 'São Paulo', estado: 'SP', lat: -23.5, lon: -46.6, ibge: null, geo_precisao: 'cidade' },
      { id: 'c4', user_id: 'u2', cep: '01310100', endereco: 'Av. Paulista, 50', cidade: 'São Paulo', estado: 'SP', lat: null, lon: null, ibge: null, geo_precisao: null },
    ];
    const patches: { url: URL; body: any }[] = [];
    let get: URL | null = null;
    const m = montarFetch({
      brasilapiCep: () => respJson(BRASILAPI_SE_SEM_COORD),
      viacep: () => respJson(VIACEP_PAULISTA),
      nominatim: () => respJson(NOMINATIM_CASA),
      supabase: async (url, init) => {
        if ((init?.method ?? 'GET') === 'GET') {
          get = url;
          return respJson(fila);
        }
        const body = JSON.parse(String(init?.body));
        patches.push({ url, body });
        // c4: o prestador trocou o endereço no meio da rodada → PATCH não casa nada.
        return respJson(url.searchParams.get('id') === 'eq.c4' ? [] : [{ id: url.searchParams.get('id')?.slice(3) }]);
      },
    });
    const rel = relogio();
    const r = await processarGeoClientes(
      { ...ENV_BASE, GEO_BACKFILL_MODE: 'production', NOMINATIM_RL: limitador(true) },
      { fetchImpl: m.f, agora: rel.agora, dormir: rel.dormir, cache: null },
    );
    const g = get as URL | null;
    checar('fila: ativos, nunca procurados, sem ponto OU sem IBGE',
      !!g && g.searchParams.get('excluido_em') === 'is.null' && g.searchParams.get('geo_tentado_em') === 'is.null' && g.searchParams.get('or') === '(lat.is.null,ibge.is.null)', g?.toString());
    checar('lote limitado (padrão 5)', g?.searchParams.get('limit') === '5');
    const p1 = patches.find((p) => p.url.searchParams.get('id') === 'eq.c1');
    checar('c1: grava ponto, precisão, IBGE e tira da fila', !!p1 && p1.body.geo_precisao === 'numero' && p1.body.ibge === '3550308' && typeof p1.body.geo_tentado_em === 'string' && typeof p1.body.lat === 'number', js(p1?.body));
    checar('c1: PATCH condicional ao endereço lido (+ tenant)',
      !!p1 && p1.url.searchParams.get('user_id') === 'eq.u1' && p1.url.searchParams.get('cep') === 'eq.01310-100' &&
      p1.url.searchParams.get('endereco') === 'eq.Av. Paulista, 1000' && p1.url.searchParams.get('estado') === 'eq.SP', p1?.url.toString());
    checar('c1: NÃO mexe no relógio de sync (atualizado_em)', !!p1 && !('atualizado_em' in p1.body));
    const p2 = patches.find((p) => p.url.searchParams.get('id') === 'eq.c2');
    checar('c2 sem endereço: só sai da fila (nada inventado)', !!p2 && js(Object.keys(p2.body)) === js(['geo_tentado_em']) && p2.url.searchParams.get('cep') === 'is.null');
    const p3 = patches.find((p) => p.url.searchParams.get('id') === 'eq.c3');
    checar('c3 já tinha ponto: completa só o IBGE, sem reescrever o ponto', !!p3 && p3.body.ibge === '3550308' && !('lat' in p3.body), js(p3?.body));
    checar('contagem: endereço mudou no meio = não grava', r.enderecoMudou === 1 && r.gravados === 2 && r.semEndereco === 1, js(r));
    checar('Nominatim: 2 consultas (c1 e c4), c3 não consultou', m.de('nominatim.openstreetmap.org').length === 2);
  }

  reset();
  {
    const fila = [
      { id: 'a', user_id: 'u1', cep: '01310100', endereco: 'Av. Paulista, 1', cidade: 'São Paulo', estado: 'SP', lat: null, lon: null, ibge: null, geo_precisao: null },
      { id: 'b', user_id: 'u1', cep: '01310100', endereco: 'Av. Paulista, 2', cidade: 'São Paulo', estado: 'SP', lat: null, lon: null, ibge: null, geo_precisao: null },
    ];
    const patches: any[] = [];
    const m = montarFetch({
      brasilapiCep: () => respJson({}, 404),
      viacep: () => respJson(VIACEP_PAULISTA),
      nominatim: () => respJson({}, 503),
      supabase: async (url, init) => {
        if ((init?.method ?? 'GET') === 'GET') return respJson(fila);
        patches.push(JSON.parse(String(init?.body)));
        return respJson([{ id: 'x' }]);
      },
    });
    const rel = relogio();
    const r = await processarGeoClientes(
      { ...ENV_BASE, GEO_BACKFILL_MODE: 'production', NOMINATIM_RL: limitador(true) },
      { fetchImpl: m.f, agora: rel.agora, dormir: rel.dormir, cache: null },
    );
    checar('serviço calado: rodada para no 1º (não queima o resto)', r.interrompido === true && m.de('nominatim.openstreetmap.org').length === 1, js(r));
    checar('serviço calado: NÃO tira da fila (sem geo_tentado_em), mas guarda o IBGE que veio',
      patches.length === 1 && !('geo_tentado_em' in patches[0]) && patches[0].ibge === '3550308', js(patches));
  }

  reset();
  {
    const m = montarFetch({ supabase: () => respJson({ code: '42703', message: 'column clientes.lat does not exist' }, 400) });
    const r = await processarGeoClientes({ ...ENV_BASE, GEO_BACKFILL_MODE: 'production', NOMINATIM_RL: limitador(true) }, { fetchImpl: m.f });
    checar('ligado sem a migration: falha registrada (nunca "nada a fazer")', r.motivo === 'falhou' && r.codigo === 'supabase_400', js(r));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n8) migration 20261002100000 num Postgres (PGlite)');
{
  const MIGRATION = readFileSync('supabase/migrations/20261002100000_clientes_geo_visita_externa.sql', 'utf8');
  const pg = new PGlite();
  await pg.exec(`
    create role anon nologin; create role authenticated nologin;
    create table public.clientes (
      id text primary key, user_id uuid not null, nome text not null, telefone text, endereco text, cidade text,
      estado text, cep text, criado_em timestamptz not null default now(), excluido_em timestamptz,
      atualizado_em timestamptz not null default '2026-01-01T00:00:00Z'
    );
    create table public.agendamentos (id text primary key, user_id uuid not null, titulo text not null);
  `);
  await pg.exec(MIGRATION);
  await pg.exec(MIGRATION);
  checar('aplica duas vezes (idempotente)', true);

  const U = '00000000-0000-4000-8000-000000000001';
  await pg.exec(`insert into public.agendamentos (id, user_id, titulo) values ('v1', '${U}', 't')`);
  const ag = await pg.query<{ externa: boolean | null }>(`select externa from public.agendamentos where id = 'v1'`);
  checar('agendamentos.externa nasce NULL (não informado), nunca false', ag.rows[0]?.externa === null);

  const barra = async (sql: string) => {
    try {
      await pg.exec(sql);
      return false;
    } catch {
      return true;
    }
  };
  checar('CHECK: meia coordenada', await barra(`insert into public.clientes (id, user_id, nome, lat, geo_precisao) values ('x1', '${U}', 'n', -23, 'cep')`));
  checar('CHECK: 0,0', await barra(`insert into public.clientes (id, user_id, nome, lat, lon, geo_precisao) values ('x2', '${U}', 'n', 0, 0, 'cep')`));
  checar('CHECK: ponto sem precisão', await barra(`insert into public.clientes (id, user_id, nome, lat, lon) values ('x3', '${U}', 'n', -23, -46)`));
  checar('CHECK: precisão inventada', await barra(`insert into public.clientes (id, user_id, nome, lat, lon, geo_precisao) values ('x4', '${U}', 'n', -23, -46, 'satelite')`));
  checar('CHECK: IBGE fora do formato', await barra(`insert into public.clientes (id, user_id, nome, ibge) values ('x5', '${U}', 'n', '355030')`));

  await pg.exec(`
    insert into public.clientes (id, user_id, nome, endereco, cidade, estado, cep, lat, lon, ibge, geo_precisao, geo_tentado_em) values
      ('c1', '${U}', 'Ana', 'Av. Paulista, 1000', 'São Paulo', 'SP', '01310-100', -23.56, -46.65, '3550308', 'numero', now()),
      ('c2', '${U}', 'Bia', 'Av. Paulista, 1000', 'São Paulo', 'SP', '01310-100', -23.56, -46.65, '3550308', 'numero', now()),
      ('c3', '${U}', 'Caio', 'Av. Paulista, 1000', 'São Paulo', 'SP', '01310-100', -23.56, -46.65, '3550308', 'numero', now()),
      ('c4', '${U}', 'Davi', 'Av. Paulista, 1000', 'São Paulo', 'SP', '01310-100', -23.56, -46.65, '3550308', 'numero', now());
  `);
  const ler = async (id: string) =>
    (await pg.query<any>(`select lat, lon, ibge, geo_precisao, geo_tentado_em, atualizado_em from public.clientes where id = '${id}'`)).rows[0];

  await pg.exec(`update public.clientes set nome = 'Ana Maria', cep = '01310100', estado = 'sp' where id = 'c1'`);
  const c1 = await ler('c1');
  checar('trigger: só nome/máscara/caixa mudou → geo intacta', c1.lat !== null && c1.ibge === '3550308' && c1.geo_tentado_em !== null, js(c1));

  await pg.exec(`update public.clientes set endereco = 'Av. Paulista, 2000' where id = 'c2'`);
  const c2 = await ler('c2');
  checar('trigger: trocou só o número → ponto e fila zerados, IBGE fica', c2.lat === null && c2.geo_precisao === null && c2.geo_tentado_em === null && c2.ibge === '3550308', js(c2));

  await pg.exec(`update public.clientes set cep = '20040-020', cidade = 'Rio de Janeiro', estado = 'RJ' where id = 'c3'`);
  const c3 = await ler('c3');
  checar('trigger: trocou CEP/cidade → ponto, IBGE e fila zerados', c3.lat === null && c3.ibge === null && c3.geo_tentado_em === null, js(c3));
  checar('trigger: NÃO mexe no atualizado_em (relógio de sync do app)', new Date(c3.atualizado_em).toISOString() === '2026-01-01T00:00:00.000Z');

  await pg.exec(`update public.clientes set cep = '20040-020', cidade = 'Rio de Janeiro', estado = 'RJ', lat = -22.9, lon = -43.17, geo_precisao = 'cep', ibge = '3304557' where id = 'c4'`);
  const c4 = await ler('c4');
  checar('trigger: endereço novo COM ponto novo (o app geocodificou) → o novo vence', Number(c4.lat) === -22.9 && c4.ibge === '3304557', js(c4));

  const fila = await pg.query<{ id: string }>(`select id from public.clientes where (lat is null or ibge is null) and geo_tentado_em is null and excluido_em is null order by id`);
  checar('fila: quem mudou de endereço sem ponto novo volta; quem veio com ponto e IBGE novos, não',
    js(fila.rows.map((r) => r.id)) === js(['c2', 'c3']), js(fila.rows));
  await pg.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n9) app: cep.ts lê a resposta do /geo nos quatro estados');
{
  const STUBS: Record<string, string> = {
    config: 'export const DIAGNOSTICO_URL = "";',
    supabase: 'export const supabase = null;',
  };
  registerHooks({
    resolve(especificador, contexto, proximo) {
      if (contexto.parentURL?.endsWith('/src/services/cep.ts')) {
        if (especificador === '../config') return { url: 'olli-stub:config', shortCircuit: true };
        if (especificador === './supabase') return { url: 'olli-stub:supabase', shortCircuit: true };
      }
      return proximo(especificador, contexto);
    },
    load(url, contexto, proximo) {
      if (url.startsWith('olli-stub:')) return { format: 'module', source: STUBS[url.slice('olli-stub:'.length)], shortCircuit: true };
      return proximo(url, contexto);
    },
  });
  const cep = await import('../src/services/cep.ts');
  const ok = cep.lerRespostaGeo({ ok: true, estado: 'ok', lat: -23.5, lon: -46.6, precisao: 'rua', ibge: '3550308', fonte: 'nominatim', atribuicao: ATRIBUICAO_OSM });
  checar('ok vira ponto + IBGE + atribuição', ok.estado === 'ok' && ok.precisao === 'rua' && ok.ibge === '3550308' && ok.atribuicao === ATRIBUICAO_OSM, js(ok));
  checar('"ok" sem ponto legível é indisponivel, não sucesso', cep.lerRespostaGeo({ ok: true, estado: 'ok', lat: 0, lon: 0, precisao: 'rua' }).estado === 'indisponivel');
  checar('sem_resultado preserva o IBGE', js(cep.lerRespostaGeo({ ok: false, estado: 'sem_resultado', ibge: '3550308' })) === js({ estado: 'sem_resultado', ibge: '3550308' }));
  checar('corpo fora do contrato = indisponivel (nunca sem_resultado)', cep.lerRespostaGeo(null).estado === 'indisponivel' && cep.lerRespostaGeo({ estado: 'qualquer' }).estado === 'indisponivel');
  checar('sem worker configurado: indisponivel (o backfill cobre)', (await cep.geocodificarEndereco({ cep: '01310100' })).estado === 'indisponivel');
  checar('sem endereço: invalido', (await cep.geocodificarEndereco({ endereco: 'Rua X, 1' })).estado === 'invalido');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n10) espelhos: SQLite local, cloudSync, agenda, worker e wrangler');
{
  const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const db = semComentario(readFileSync('src/database/database.ts', 'utf8'));
  // ">= 9", não "=== 9": migrações locais posteriores (ex.: v10, OS ligada ao
  // equipamento) sobem a versão sem desfazer o bloco v<9 conferido logo abaixo.
  checar('SQLite: SCHEMA_VERSION 9 ou depois', Number(/const SCHEMA_VERSION = (\d+);/.exec(db)?.[1] ?? 0) >= 9);
  checar('SQLite: v<9 acrescenta lat/lon/ibge/geo_precisao e agendamentos.externa',
    /if \(v < 9\)/.test(db) && /\['lat', 'REAL'\], \['lon', 'REAL'\], \['ibge', 'TEXT'\], \['geo_precisao', 'TEXT'\]/.test(db) &&
    /addColumnIfMissing\(database, 'agendamentos', 'externa', 'INTEGER'\)/.test(db));
  checar('SQLite: CREATE TABLE já nasce com as colunas', /geo_precisao TEXT\r?\n\s*\);/.test(db) && /externa INTEGER\r?\n\s*\);/.test(db));
  checar('saveCliente: geo decidida pelo que está gravado (geoAposEdicao)', /geoAposEdicao\(anterior, cliente\)/.test(db));
  checar('saveCliente: geocodifica DEPOIS de gravar, em segundo plano', db.indexOf("mirrorPush('clientes', salvo)") < db.indexOf('void geocodificarClienteSalvo(salvo)'));
  const geoSalvo = db.slice(db.indexOf('async function geocodificarClienteSalvo'));
  checar('geo do salvar: UPDATE condicional ao endereço e sem carimbar atualizado_em',
    /IFNULL\(cep, ''\) = \? AND IFNULL\(endereco, ''\)/.test(geoSalvo) && !/atualizado_em\s*=/.test(geoSalvo.slice(0, geoSalvo.indexOf('mirrorPush'))));

  const sync = semComentario(readFileSync('src/services/cloudSync.ts', 'utf8'));
  checar('push de cliente: geo só quando sabe (nunca null por cima do backfill)', /if \(g\.lat !== null && g\.lon !== null && g\.geo_precisao !== null\)/.test(sync) && /if \(g\.ibge !== null\) row\.ibge = g\.ibge;/.test(sync));
  checar('push de cliente: servidor sem a migration → reenvia sem as colunas geo', /table === 'clientes' && !clientesSemColunasGeo && erroDeColunaDesconhecida\(error\)/.test(sync));
  checar('push de agenda: externa é o 1º degrau da escada', sync.indexOf('!agendaSemColunaExterna && erroDeColunaDesconhecida') > 0 &&
    sync.indexOf('!agendaSemColunaExterna && erroDeColunaDesconhecida') < sync.indexOf('!agendaSemColunasExcecoes && erroDeColunaDesconhecida'));
  checar('pull de cliente: preserva a geo local quando a nuvem não sabe e o endereço é o mesmo', /mudancaDeEndereco\(local, c\)/.test(sync) && /geo\.lat === null && geoLocal\.lat !== null/.test(sync));
  checar('pull de agenda: sem a coluna, preserva a externa local', /if \(agendaSemColunaExterna\) \{/.test(sync));

  const agenda = semComentario(readFileSync('src/services/agenda.ts', 'utf8'));
  checar('agenda: salvar grava externa (0/1/NULL)', /contrato_id, excecoes, ordem_servico_id, externa\)/.test(agenda) && /externaParaSqlite\(a\.externa\)/.test(agenda));
  checar('agenda: formulário que não conhece o campo NÃO apaga a externa gravada', /if \(!\('externa' in entrada\)\)/.test(agenda));

  const idx = readFileSync('worker/src/index.js', 'utf8');
  checar('worker: rota POST /geo ligada', /url\.pathname === '\/geo' && request\.method === 'POST'/.test(idx));
  checar('worker: backfill no cron', /ctx\.waitUntil\(processarGeoClientes\(env\)\)/.test(idx));
  checar('worker: GET / diz se o backfill está ligado', /geo_backfill: modoGeoBackfill\(env\) === 'production' \? 'on' : 'off'/.test(idx));

  const wr = readFileSync('worker/wrangler.jsonc', 'utf8');
  // A migration 20261002100000 foi aplicada em produção em 01/10/2026: prod liga, staging segue desligado.
  checar('wrangler: backfill LIGADO em prod (migration aplicada) e DESLIGADO no staging',
    (wr.match(/"GEO_BACKFILL_MODE": "production"/g) || []).length === 1 &&
    (wr.match(/"GEO_BACKFILL_MODE": "off"/g) || []).length === 1);
  checar('wrangler: teto global do Nominatim em prod e staging, abaixo de 1 req/s',
    /"NOMINATIM_RL", "namespace_id": "1045", "simple": \{ "limit": 50, "period": 60 \}/.test(wr) &&
    /"NOMINATIM_RL", "namespace_id": "2045", "simple": \{ "limit": 50, "period": 60 \}/.test(wr));
  const ids = [...wr.matchAll(/"namespace_id": "(\d+)"/g)].map((m) => m[1]);
  checar('wrangler: nenhum namespace_id de rate limit repetido', ids.length === new Set(ids).size, js(ids));
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
