/**
 * Todo evento que o painel manda para `registrar_atividade_usuario` tem de estar na allowlist da migration MAIS
 * NOVA que redefine a função. Sem isto, evento novo morre calado no banco ('evento_invalido') e o funil fica cego
 * (foi o caso de "viu Planos" até 28/10).
 *     node scripts/teste-funil-allowlist.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const store = readFileSync(new URL('webapp/src/store/userStore.ts', raiz), 'utf8');
const tipo = store.slice(store.indexOf('export type EtapaAtivacao'), store.indexOf(';', store.indexOf('export type EtapaAtivacao')));
const eventosPainel = [...tipo.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
assert.ok(eventosPainel.length >= 10, 'leu os eventos do painel');

const dir = new URL('supabase/migrations/', raiz);
const ultima = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .filter((f) => /create or replace function public\.registrar_atividade_usuario/i.test(readFileSync(new URL(f, dir), 'utf8'))).at(-1);
assert.ok(ultima, 'existe migration que define a função');
const sql = readFileSync(new URL(ultima!, dir), 'utf8');
const bloco = sql.slice(sql.indexOf('not in ('), sql.indexOf(')', sql.indexOf('not in (')));
const permitidos = new Set([...bloco.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
const faltando = eventosPainel.filter((e) => !permitidos.has(e));
assert.deepEqual(faltando, [], `eventos do painel fora da allowlist de ${ultima}`);
for (const e of ['planos_visto', 'plano_pagar_clicado']) assert.ok(permitidos.has(e), `${e} medido`);
const planos = readFileSync(new URL('webapp/src/pages/olli/planos/index.tsx', raiz), 'utf8');
assert.match(planos, /registrarEtapaAtivacao\("planos_visto"\)/, 'tela de Planos registra a visita');
assert.equal((planos.match(/registrarEtapaAtivacao\("plano_pagar_clicado"\)/g) || []).length, 2, 'cartão e Pix registram o clique');
console.log(`teste-funil-allowlist: OK (${eventosPainel.length} eventos, allowlist de ${ultima})`);
