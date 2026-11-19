/**
 * Backfill de ponto dos clientes (CQ-MAPA-LEVA2).
 *
 *     node scripts/teste-backfill-geo-clientes.ts
 *
 * REST falso em memória. Prova: ensaio não escreve nem geocodifica; só grava
 * quem tem lat/lon nulos e CEP ou cidade+UF; nunca sobrescreve; rollback volta a nulo.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rodarBackfill, reverter } from './backfill-geo-clientes.mjs';

type Linha = { id: string; cep: string | null; endereco: string | null; cidade: string | null; estado: string | null; lat: number | null; lon: number | null; geo_precisao?: string | null; excluido_em?: string | null };

function banco(linhas: Linha[]) {
  const chamadas: string[] = [];
  const rest = async (caminho: string, o: { method?: string; body?: Record<string, unknown> } = {}) => {
    chamadas.push(`${o.method ?? 'GET'} ${caminho}`);
    const id = /id=eq\.([^&]+)/.exec(caminho)?.[1];
    if (!o.method || o.method === 'GET') {
      return linhas.filter((l) => !l.excluido_em && l.lat === null && l.lon === null).map((l) => ({ ...l }));
    }
    const exigeNulo = caminho.includes('lat=is.null&lon=is.null');
    const latEq = /lat=eq\.([^&]+)/.exec(caminho)?.[1];
    const alvo = linhas.filter((l) => l.id === id && (!exigeNulo || (l.lat === null && l.lon === null)) && (latEq === undefined || String(l.lat) === latEq));
    for (const l of alvo) Object.assign(l, o.body);
    return alvo.map((l) => ({ id: l.id }));
  };
  return { rest, chamadas };
}

const mk = (id: string, p: Partial<Linha> = {}): Linha => ({ id, cep: null, endereco: null, cidade: 'Campinas', estado: 'SP', lat: null, lon: null, ...p });
const ok = async () => ({ estado: 'ok', lat: -22.9, lon: -47.06, precisao: 'cidade' });
const dir = mkdtempSync(join(tmpdir(), 'bf-'));

// 1. Ensaio: conta, não geocodifica, não escreve.
{
  const b = banco([mk('a'), mk('b', { cep: '13010000', cidade: null, estado: null }), mk('c', { cidade: null, estado: null }), mk('d', { lat: -1, lon: -1 }), mk('e', { excluido_em: 'x' })]);
  let geo = 0;
  const r = await rodarBackfill({ rest: b.rest, geocodificar: async () => { geo += 1; return ok(); } });
  assert.equal(r.modo, 'ensaio');
  assert.equal(r.semPonto, 3);
  assert.equal(r.geocodificaveis, 2);
  assert.equal(r.gravados, 0);
  assert.equal(geo, 0);
  assert.ok(b.chamadas.every((c) => c.startsWith('GET')), 'ensaio só lê');
}

// 2. Aplicar: grava só geocodificáveis; rollback anotado; sem dado fica nulo.
const arq = join(dir, 'rb.jsonl');
writeFileSync(arq, '');
const linhas = [mk('a'), mk('b', { cep: '13010000', cidade: null, estado: null }), mk('c', { cidade: null, estado: null }), mk('d', { lat: -1, lon: -1 })];
const b2 = banco(linhas);
const pausas: number[] = [];
const r2 = await rodarBackfill({ rest: b2.rest, geocodificar: ok, aplicar: true, arquivoRollback: arq, dormir: async (ms: number) => { pausas.push(ms); }, tamanhoLote: 1 });
assert.equal(r2.gravados, 2);
assert.equal(linhas[0].lat, -22.9);
assert.equal(linhas[2].lat, null, 'sem CEP nem cidade+UF não é tocado');
assert.deepEqual([linhas[3].lat, linhas[3].lon], [-1, -1], 'ponto existente intacto');
assert.equal(pausas.length, 1, 'pausa entre lotes');
const anotados = readFileSync(arq, 'utf8').trim().split('\n').map((t) => JSON.parse(t).id);
assert.deepEqual(anotados, ['a', 'b']);

// 3. Nunca sobrescreve: ponto surgiu entre a leitura e o PATCH.
{
  const l = [mk('x')];
  const b = banco(l);
  const a2 = join(dir, 'rb2.jsonl'); writeFileSync(a2, '');
  const r = await rodarBackfill({ rest: b.rest, arquivoRollback: a2, aplicar: true, geocodificar: async () => { l[0].lat = -5; l[0].lon = -5; return ok(); } });
  assert.equal(r.gravados, 0);
  assert.equal(r.jaTinhaPonto, 1);
  assert.equal(l[0].lat, -5);
}

// 4. Serviço indisponível encerra sem gravar mais.
{
  const l = [mk('x'), mk('y')];
  const a3 = join(dir, 'rb3.jsonl'); writeFileSync(a3, '');
  const r = await rodarBackfill({ rest: banco(l).rest, arquivoRollback: a3, aplicar: true, geocodificar: async () => ({ estado: 'indisponivel' }) });
  assert.equal(r.interrompido, true);
  assert.equal(l[0].lat, null);
}

// 5. Aplicar sem arquivo de rollback é recusado.
await assert.rejects(() => rodarBackfill({ rest: b2.rest, geocodificar: ok, aplicar: true }), /arquivo_rollback_obrigatorio/);

// 6. Rollback volta a nulo, mas não desfaz o que o usuário mudou depois.
linhas[1].lat = -9; linhas[1].lon = -9; // usuário editou b depois
const rv = await reverter({ rest: b2.rest, arquivo: arq });
assert.equal(rv.revertidos, 1);
assert.equal(linhas[0].lat, null);
assert.equal(linhas[1].lat, -9);
assert.ok(existsSync(arq));

console.log('teste-backfill-geo-clientes: ok');
