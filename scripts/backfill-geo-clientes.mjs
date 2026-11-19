/**
 * Backfill do ponto no mapa dos clientes antigos (CQ-MAPA-LEVA2).
 *
 *   node scripts/backfill-geo-clientes.mjs                      ENSAIO (padrão): só conta
 *   node scripts/backfill-geo-clientes.mjs --aplicar            grava lat/lon/geo_precisao
 *   node scripts/backfill-geo-clientes.mjs --reverter <arq>     volta a nulo o que um --aplicar gravou
 *
 * Variáveis de ambiente (nunca impressas): SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 *
 * Regras:
 *  - Só linhas ativas com lat E lon NULOS e com CEP ou cidade+UF.
 *  - Reusa o geocodificador do worker (`worker/src/geoClientes.js`): BrasilAPI CEP,
 *    ViaCEP/IBGE e Nominatim, com a política de 1 req/s do OSM (intervalo de 1,1 s).
 *  - NUNCA sobrescreve: o PATCH leva `lat=is.null&lon=is.null`; ponto que apareceu
 *    no meio do caminho (cliente editado) não é tocado.
 *  - Só lat, lon e geo_precisao são gravados (nada de ibge, nada de atualizado_em).
 *  - Lotes de 20 com pausa; "indisponivel" de serviço encerra o script (não insiste).
 *  - Rollback: arquivo JSONL com {id, lat, lon, precisao} de CADA linha gravada,
 *    escrito ANTES do PATCH. `--reverter` só zera a linha se o ponto ainda é o que
 *    o script gravou.
 *  - Log só com contagens: nunca nome, endereço, coordenada nem id.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { criarNominatim, geocodificarEndereco } from '../worker/src/geoClientes.js';
import { enderecoGeocodificavel } from '../src/utils/geoCliente.ts';

export const TAMANHO_LOTE = 20;
export const PAUSA_LOTE_MS = 5000;
const PAGINA = 1000;
const COLUNAS = 'id,cep,endereco,cidade,estado,lat,lon';

const dormirReal = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cliente REST mínimo do Supabase (PostgREST). A chave nunca sai daqui. */
export function criarRest(url, chave, fetchImpl = fetch) {
  const base = String(url).replace(/\/+$/, '');
  return async function rest(caminho, { method = 'GET', body, prefer } = {}) {
    const headers = { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const r = await fetchImpl(`${base}/rest/v1/${caminho}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw new Error(`supabase_${r.status}`);
    return r.status === 204 ? null : r.json();
  };
}

/** Todas as linhas ativas sem ponto (lat OU lon nulo conta como sem ponto, mas só lat E lon nulos são tocados). */
export async function listarSemPonto(rest) {
  const todas = [];
  for (let de = 0; ; de += PAGINA) {
    const pagina = await rest(
      `clientes?select=${COLUNAS}&excluido_em=is.null&lat=is.null&lon=is.null&order=id.asc&limit=${PAGINA}&offset=${de}`,
    );
    if (!Array.isArray(pagina)) throw new Error('lista_invalida');
    todas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return todas;
}

export function contar(linhas) {
  const geocodificaveis = linhas.filter((l) => enderecoGeocodificavel({ cep: l.cep, cidade: l.cidade, estado: l.estado }));
  return { semPonto: linhas.length, geocodificaveis: geocodificaveis.length, semDadoParaGeocodificar: linhas.length - geocodificaveis.length };
}

/**
 * Núcleo testável. `geocodificar(linha)` devolve { estado, lat, lon, precisao }.
 * Em ensaio nada é chamado nem gravado.
 */
export async function rodarBackfill({ rest, geocodificar, aplicar = false, arquivoRollback = null, dormir = dormirReal, pausaMs = PAUSA_LOTE_MS, tamanhoLote = TAMANHO_LOTE, log = () => {} }) {
  const linhas = await listarSemPonto(rest);
  const total = contar(linhas);
  const saida = { modo: aplicar ? 'aplicar' : 'ensaio', ...total, gravados: 0, semResultado: 0, jaTinhaPonto: 0, interrompido: false };
  if (!aplicar) return saida;
  if (!arquivoRollback) throw new Error('arquivo_rollback_obrigatorio');

  const fila = linhas.filter((l) => enderecoGeocodificavel({ cep: l.cep, cidade: l.cidade, estado: l.estado }));
  for (let i = 0; i < fila.length; i += tamanhoLote) {
    if (i > 0) await dormir(pausaMs);
    for (const l of fila.slice(i, i + tamanhoLote)) {
      const res = await geocodificar(l);
      if (res.estado === 'indisponivel') { saida.interrompido = true; return saida; }
      if (res.estado !== 'ok') { saida.semResultado += 1; continue; }
      // Rollback ANTES do PATCH: se o PATCH gravar e o processo cair, o id já está anotado.
      appendFileSync(arquivoRollback, `${JSON.stringify({ id: l.id, lat: res.lat, lon: res.lon, precisao: res.precisao })}\n`);
      const r = await rest(`clientes?id=eq.${encodeURIComponent(l.id)}&lat=is.null&lon=is.null&select=id`, {
        method: 'PATCH',
        body: { lat: res.lat, lon: res.lon, geo_precisao: res.precisao },
        prefer: 'return=representation',
      });
      if (Array.isArray(r) && r.length) saida.gravados += 1;
      else saida.jaTinhaPonto += 1;
    }
    log({ lote: Math.floor(i / tamanhoLote) + 1, gravados: saida.gravados, semResultado: saida.semResultado });
  }
  return saida;
}

/** Volta a nulo o que o arquivo lista, só onde o ponto ainda é o gravado pelo script. */
export async function reverter({ rest, arquivo }) {
  const linhas = readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((t) => JSON.parse(t));
  let revertidos = 0;
  for (const e of linhas) {
    const r = await rest(
      `clientes?id=eq.${encodeURIComponent(e.id)}&lat=eq.${e.lat}&lon=eq.${e.lon}&select=id`,
      { method: 'PATCH', body: { lat: null, lon: null, geo_precisao: null }, prefer: 'return=representation' },
    );
    if (Array.isArray(r) && r.length) revertidos += 1;
  }
  return { listados: linhas.length, revertidos, mudouDepois: linhas.length - revertidos };
}

function geocodificadorReal(fetchImpl = fetch) {
  // O script já espaça as consultas (1,1 s) e roda sozinho: o teto global do worker
  // (binding da Cloudflare) é substituído por um limitador local que sempre passa.
  const env = { NOMINATIM_RL: { limit: async () => ({ success: true }) } };
  const nominatim = criarNominatim({ env, fetchFn: fetchImpl, cache: null, orcamento: { restante: Number.MAX_SAFE_INTEGER } });
  return (l) => geocodificarEndereco({ cep: l.cep, endereco: l.endereco, cidade: l.cidade, uf: l.estado }, { fetchFn: fetchImpl, nominatim });
}

async function main(argv) {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
    return 2;
  }
  const rest = criarRest(url, chave);
  const i = argv.indexOf('--reverter');
  if (i >= 0) {
    if (!argv[i + 1]) { console.error('Use --reverter <arquivo>.'); return 2; }
    console.log(JSON.stringify(await reverter({ rest, arquivo: argv[i + 1] })));
    return 0;
  }
  const aplicar = argv.includes('--aplicar');
  const arquivoRollback = aplicar ? `rollback-geo-clientes-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl` : null;
  if (arquivoRollback) writeFileSync(arquivoRollback, '');
  const saida = await rodarBackfill({
    rest, aplicar, arquivoRollback,
    geocodificar: geocodificadorReal(),
    log: (l) => console.log(JSON.stringify(l)),
  });
  console.log(JSON.stringify(saida));
  if (!aplicar) console.log('ENSAIO: nada foi gravado. Use --aplicar para gravar.');
  else console.log(`Rollback: ${arquivoRollback} (node scripts/backfill-geo-clientes.mjs --reverter ${arquivoRollback})`);
  return saida.interrompido ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(`falhou: ${e?.message ?? 'erro'}`); process.exitCode = 1; });
}
