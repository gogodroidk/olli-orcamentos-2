/**
 * CQ-CADEADO-CHECKOUT (D-2267): todo cadeado leva a um plano com preço certo e a um checkout coerente.
 *
 *     node scripts/teste-cadeado-checkout-d2267.ts
 * Exit 0 = passou; 1 = falhou.
 *
 *  1. Comparativos (landing estática, painel /planos, app) mostram a tabela do PLANO, sem a carência: o Grátis
 *     NÃO tem ✓ em recibos/agenda/OS/importação, nem antes de 26/11 (a landing congela no build; CDC).
 *  2. A carência continua valendo para o ACESSO (temAcessoRecurso) até a data.
 *  3. Preço do cadeado = fonte única (Pro R$ 39, Empresa R$ 99).
 *  4. Pix Automático só no Pro mensal (painel e app).
 */
import { readFileSync } from 'node:fs';
import {
  RECURSOS_COM_CARENCIA_GRATIS, TRANCA_GRATIS_D2267, disponibilidadeRecurso, planoIncluiRecurso, temAcessoRecurso,
} from '../src/services/entitlements.ts';
import { PRECO_EMPRESA, PRECO_PRO } from '../src/services/precosPlanos.ts';

let falhas = 0;
const ok = (nome: string, cond: boolean) => { console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}`); if (!cond) falhas++; };
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const antes = Date.parse(TRANCA_GRATIS_D2267) - 86_400_000;
for (const r of RECURSOS_COM_CARENCIA_GRATIS) {
  ok(`${r}: Grátis em carência ainda USA (acesso)`, temAcessoRecurso('gratis', r, antes));
  ok(`${r}: comparativo NÃO mostra ✓ no Grátis (tabela do plano)`, !planoIncluiRecurso('gratis', r) && disponibilidadeRecurso('gratis', r) === 'nao_incluido');
  ok(`${r}: Pro e Empresa incluem`, planoIncluiRecurso('pro', r) && planoIncluiRecurso('empresa', r));
}
ok('nota fiscal: Pro "em breve" (sem promessa de data)', disponibilidadeRecurso('pro', 'nota_fiscal') === 'em_breve');

ok('preço Pro R$ 39 / Empresa R$ 99 na fonte', PRECO_PRO.mensalCentavos === 3900 && PRECO_EMPRESA.mensalCentavos === 9900);

for (const f of ['web/src/data/recursos.ts', 'webapp/src/pages/olli/planos/index.tsx', 'webapp/src/pages/olli/planos/recursos.ts']) {
  ok(`${f} não usa temAcessoRecurso (carência) no comparativo`, !/temAcessoRecurso\s*[(,}]/.test(ler(f).replace(/\/\*[\s\S]*?\*\//g, '')));
}
ok('painel: Pix Automático só no Pro mensal', /pixAutomaticoDisponivel=\{pixAutoLigado && !pixAutoAtiva && p\.id === "pro" && periodo === "mensal"\}/.test(ler('webapp/src/pages/olli/planos/index.tsx')));
const app = ler('src/screens/PlanosScreen.tsx');
ok("app: Pix Automático só no Pro mensal (ação e card)", /p\.id !== 'pro' \|\| periodo !== 'mensal'\) return/.test(app) && /pixAutoLigado && !plano\.atual && plano\.id === 'pro' && periodo === 'mensal'/.test(app));

console.log(falhas ? `\nFALHOU: ${falhas}` : '\nPASSOU');
process.exit(falhas ? 1 : 0);
