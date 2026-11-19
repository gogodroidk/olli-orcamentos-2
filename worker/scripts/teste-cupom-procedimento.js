/**
 * Procedimento do admin (docs/CUPOM_ADMIN_PROCEDIMENTO.md) exercitado de verdade: o teste LÊ o documento,
 * confere que cada rota citada existe em admin.js e roda os corpos JSON documentados nos validadores reais.
 *     node worker/scripts/teste-cupom-procedimento.js
 */
import { readFileSync } from 'node:fs';
import { criarCupom, desativarCupom, resolverDiferenca, rotaListarCupons, rotaListarDiferencas } from '../src/adminCupom.js';

let ok = 0; let falhas = 0;
function checar(nome, c, d = '') { if (c) { console.log(`  ok   ${nome}`); ok++; } else { console.error(`  FALHA ${nome}${d ? `\n        ${d}` : ''}`); falhas++; } }

const raiz = new URL('../../', import.meta.url);
const doc = readFileSync(new URL('docs/CUPOM_ADMIN_PROCEDIMENTO.md', raiz), 'utf8');
const admin = readFileSync(new URL('worker/src/admin.js', raiz), 'utf8');
const bloco = (nome) => { const m = doc.match(new RegExp('```json:' + nome + '\\n([\\s\\S]*?)```')); return m ? JSON.parse(m[1]) : null; };

const rotas = [...doc.matchAll(/`(GET|POST) (\/admin\/api\/cupons[^`\s]*)`/g)].map((m) => [m[1], m[2]]);
checar('o documento cita as 5 rotas do admin', rotas.length >= 5, JSON.stringify(rotas));
for (const [metodo, rota] of rotas) {
  checar(`rota documentada existe em admin.js: ${metodo} ${rota}`, admin.includes(`m === '${metodo}' && p === '${rota}'`));
}
checar('as rotas do admin exigem administrador + AAL2', ['/admin/api/cupons', '/admin/api/cupons/criar', '/admin/api/cupons/desativar', '/admin/api/cupons/diferencas', '/admin/api/cupons/diferencas/resolver']
  .every((r) => new RegExp(`p === '${r}'\\) \\{\\s*return exigir\\(user, 'admin', \\{ aal2: true \\}\\)`).test(admin)));

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
const user = { id: 'a1', papel: 'admin' };
const chamadas = [];
const fetchImpl = async (url, init) => {
  const nome = String(url).split('/rpc/')[1]; chamadas.push({ nome, body: init && init.body ? JSON.parse(init.body) : null });
  const resp = { cupom_criar: { status: 'ok', codigo: 'ANA10' }, cupom_desativar: true, cupom_atribuicao: [], cupom_diferencas_listar: [], cupom_diferenca_resolver: true }[nome];
  return new Response(JSON.stringify(resp), { status: resp === undefined ? 500 : 200 });
};
const auditar = async () => true;

const criar = bloco('criar');
checar('corpo de criar está no documento', !!criar && criar.codigo === 'ANA10');
let r = await criarCupom(env, user, criar, { auditar, fetchImpl });
checar('o corpo documentado de CRIAR é aceito (200)', r.status === 200 && chamadas.at(-1).nome === 'cupom_criar' && chamadas.at(-1).body.p_usos_max === 50 && chamadas.at(-1).body.p_dias === 30, await r.clone().text());
checar('o documento declara os limites que o código impõe (500 usos, 90 dias)', /1 a 500/.test(doc) && /1 a 90 dias/.test(doc));
r = await rotaListarCupons(env, { fetchImpl });
checar('listar (passo 2) responde 200', r.status === 200);
const desativar = bloco('desativar');
r = await desativarCupom(env, user, desativar, { auditar, fetchImpl });
checar('o corpo documentado de DESATIVAR é aceito (200)', r.status === 200 && (await r.json()).desativado === true);
r = await rotaListarDiferencas(env, { fetchImpl });
checar('listar diferenças responde 200', r.status === 200);
const resolver = bloco('resolver');
r = await resolverDiferenca(env, user, resolver, { auditar, fetchImpl });
checar('o corpo documentado de BAIXA da diferença é aceito (200)', r.status === 200 && chamadas.at(-1).body.p_cobranca_id === 'bill_123');
checar('o documento diz que a atribuição não guarda dado pessoal do parceiro', /nenhum dado pessoal/.test(doc) && /só código \+ conta/.test(doc));
checar('o documento avisa que criar código não liga o recurso', /nascem desligados/.test(doc));

checar('o documento diz que a diferença é perda da OLLI e que NUNCA se estorna', /perda da OLLI/.test(doc) && /NUNCA estorno/.test(doc) && !/devolv/i.test(doc));

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
