/**
 * Admin do cupom — criar/desativar/listar, com Supabase simulado.
 *     node worker/scripts/teste-admin-cupom.js
 * Prende: validação ANTES de auditar; auditoria antes de gravar (sem auditoria = 503 e nada gravado);
 * limites espelham a migration; a atribuição só traz código e contagens; "não sei" = 503.
 */
import { criarCupom, desativarCupom, rotaListarCupons, CUPOM_USOS_MAX, CUPOM_VALIDADE_DIAS_MAX } from '../src/adminCupom.js';
import { CUPOM_USOS_MAX as USOS_APP, CUPOM_VALIDADE_DIAS_MAX as DIAS_APP } from '../../src/services/limitesComerciais.ts';

let ok = 0; let falhas = 0;
function checar(nome, c, d = '') { if (c) { console.log(`  ok   ${nome}`); ok++; } else { console.error(`  FALHA ${nome}${d ? `\n        ${d}` : ''}`); falhas++; } }

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
const admin = { id: 'a1', papel: 'admin' };
let rpcs; let chamadas;
const fetchImpl = async (url, init) => {
  chamadas.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
  const nome = String(url).split('/rpc/')[1];
  const r = rpcs[nome];
  if (r === undefined || r === 'erro') return new Response('{}', { status: 500 });
  if (r === '404') return new Response('{}', { status: 404 });
  return new Response(JSON.stringify(r), { status: 200 });
};
let auditorias; let auditoriaOk;
const auditar = async (_e, _a, linha) => { auditorias.push(linha); return auditoriaOk; };
const reset = () => { rpcs = {}; chamadas = []; auditorias = []; auditoriaOk = true; };
const rpcFeita = (n) => chamadas.find((c) => c.url.endsWith(`/rpc/${n}`));
const corpo = (extra = {}) => ({ codigo: 'ana10', usosMax: 50, validadeDias: 30, motivo: 'campanha da Ana', ...extra });

checar('paridade: tetos iguais à constante do app', CUPOM_USOS_MAX === USOS_APP && CUPOM_VALIDADE_DIAS_MAX === DIAS_APP && USOS_APP === 500 && DIAS_APP === 90);

reset(); rpcs.cupom_criar = { status: 'ok', codigo: 'ANA10' };
let r = await criarCupom(env, admin, corpo(), { auditar, fetchImpl });
let j = await r.json();
checar('cria: 200, código normalizado, auditado ANTES e gravado', r.status === 200 && j.codigo === 'ANA10' && auditorias.length === 1 && auditorias[0].acao === 'cupom_criar' && rpcFeita('cupom_criar').body.p_codigo === 'ANA10');
checar('auditoria guarda só código/limites/motivo (sem dado pessoal)', Object.keys(auditorias[0].depois).sort().join() === 'codigo,usosMax,validadeDias');
for (const [nome, extra, erro] of [
  ['código curto', { codigo: 'ab' }, 'codigo_invalido'], ['código com símbolo', { codigo: "a';b" }, 'codigo_invalido'],
  ['usos 0', { usosMax: 0 }, 'usos_invalido'], ['usos 501', { usosMax: 501 }, 'usos_invalido'], ['usos fracionado', { usosMax: 2.5 }, 'usos_invalido'],
  ['validade 0', { validadeDias: 0 }, 'validade_invalida'], ['validade 91', { validadeDias: 91 }, 'validade_invalida'],
  ['sem motivo', { motivo: '' }, 'motivo_invalido'],
]) {
  reset();
  r = await criarCupom(env, admin, corpo(extra), { auditar, fetchImpl }); j = await r.json();
  checar(`${nome}: 400 ${erro}, nada auditado nem gravado`, r.status === 400 && j.erro === erro && !auditorias.length && !chamadas.length);
}
reset(); auditoriaOk = false;
r = await criarCupom(env, admin, corpo(), { auditar, fetchImpl });
checar('sem auditoria: 503 e NADA gravado', r.status === 503 && !chamadas.length);
reset(); rpcs.cupom_criar = { status: 'existe' };
r = await criarCupom(env, admin, corpo(), { auditar, fetchImpl });
checar('código repetido = 409', r.status === 409);
reset();
r = await criarCupom(env, admin, corpo(), { auditar, fetchImpl });
checar('banco fora = 503', r.status === 503);
reset(); rpcs.cupom_criar = '404';
r = await criarCupom(env, admin, corpo(), { auditar, fetchImpl }); j = await r.json();
checar('migration não aplicada = erro nomeado (cupom_sem_migration)', r.status === 503 && j.erro === 'cupom_sem_migration');

reset(); rpcs.cupom_desativar = true;
r = await desativarCupom(env, admin, { codigo: 'ana10', motivo: 'acabou a campanha' }, { auditar, fetchImpl }); j = await r.json();
checar('desativa: auditado e desativado', r.status === 200 && j.desativado === true && auditorias[0].acao === 'cupom_desativar');
reset();
r = await desativarCupom(env, admin, { codigo: 'ana10' }, { auditar, fetchImpl });
checar('desativar sem motivo = 400', r.status === 400 && !chamadas.length);

reset(); rpcs.cupom_atribuicao = [{ codigo: 'ANA10', usos_max: 50, valido_ate: '2026-12-19T00:00:00Z', ativo: true, reservados: 2, pagos: 1 }];
r = await rotaListarCupons(env, { fetchImpl }); j = await r.json();
checar('lista: código + contagens, nenhum campo pessoal', r.status === 200 && j.cupons[0].codigo === 'ANA10' && j.cupons[0].pagos === 1 && !('user_id' in j.cupons[0]) && !('email' in j.cupons[0]));
reset();
r = await rotaListarCupons(env, { fetchImpl });
checar('lista com banco fora = 503 (não sei ≠ lista vazia)', r.status === 503);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
