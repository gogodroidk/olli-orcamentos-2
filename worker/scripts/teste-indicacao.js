/**
 * Indicação no worker — rotas /indicacao/*, com fetch simulado (Supabase fake).
 *
 *     node worker/scripts/teste-indicacao.js   (da raiz ou de worker/)
 * Exit 0 = passou; 1 = falhou.
 *
 * Prende: JWT obrigatório (id vem do token, nunca do corpo); método por rota; "não sei" =
 * 503 (nunca 200 vazio); recompensa desligada (flag desligada) não promete nada;
 * código validado antes de ir ao banco; evento só com valores da lista; o indicado não
 * descobre quem o indicou.
 */
import { handleIndicacao, normalizarCodigo, LINK_BASE } from '../src/indicacao.js';
import { INDICACAO_MESES_PRO, INDICACAO_TETO_PREMIADAS, INDICACAO_TETO_DIARIO } from '../src/indicacao.js';

let ok = 0;
let falhas = 0;
function checar(nome, condicao, detalhe = '') {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

const USER = { id: '11111111-1111-4111-8111-111111111111' };
const env = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  CONTA_RL: { limit: async () => ({ success: true }) },
};

// ─── Supabase fake ───────────────────────────────────────────
let chamadas = [];
let rpcs = {};
let authOk = true;
let eventoOk = true;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  chamadas.push({ url: u, init });
  if (u.endsWith('/auth/v1/user')) {
    return authOk ? new Response(JSON.stringify(USER), { status: 200 }) : new Response('{}', { status: 401 });
  }
  const m = u.match(/\/rest\/v1\/rpc\/(\w+)$/);
  if (m) {
    const r = rpcs[m[1]];
    if (r === undefined || r === 'erro') return new Response('{}', { status: 500 });
    return new Response(JSON.stringify(r), { status: 200 });
  }
  if (u.endsWith('/rest/v1/indicacao_eventos')) return new Response('', { status: eventoOk ? 201 : 500 });
  return new Response('{}', { status: 404 });
};

function req(path, { method = 'GET', body, token = 't' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(`https://w.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const rodar = (r) => handleIndicacao(r, env, new URL(r.url));
const rpcChamado = (nome) => chamadas.find((c) => c.url.endsWith(`/rpc/${nome}`));
const reset = () => { chamadas = []; rpcs = {}; authOk = true; eventoOk = true; };

console.log('normalizarCodigo');
checar('aceita 6 alfanum maiúsculos', normalizarCodigo('K7M2QX') === 'K7M2QX');
checar('minúsculo e espaço viram válidos', normalizarCodigo(' k7m2qx ') === 'K7M2QX');
checar('rejeita tamanho errado', normalizarCodigo('K7M2Q') === null && normalizarCodigo('K7M2QXZ') === null);
checar('rejeita símbolo e não-string', normalizarCodigo('K7M2Q-') === null && normalizarCodigo(null) === null && normalizarCodigo({}) === null);
checar('rejeita injeção', normalizarCodigo("A'; drop--") === null);

console.log('autenticação e método');
reset();
let r = await rodar(req('/indicacao/meu', { token: null }));
checar('sem token = 401', r.status === 401);
authOk = false;
r = await rodar(req('/indicacao/meu'));
checar('token inválido = 401 e nenhuma RPC', r.status === 401 && !rpcChamado('indicacao_codigo'));
reset();
r = await rodar(req('/indicacao/meu', { method: 'POST', body: {} }));
checar('POST em /meu = 405', r.status === 405);
r = await rodar(req('/indicacao/vincular'));
checar('GET em /vincular = 405', r.status === 405);
r = await rodar(req('/indicacao/nada'));
checar('rota desconhecida = 404', r.status === 404);
r = await rodar(new Request('https://w.test/indicacao/meu', { method: 'OPTIONS' }));
checar('OPTIONS = 204', r.status === 204);

console.log('GET /indicacao/meu');
reset();
rpcs = { indicacao_codigo: 'K7M2QX', indicacao_resumo: { recompensadas: 1, teto: INDICACAO_TETO_PREMIADAS } };
r = await rodar(req('/indicacao/meu'));
let j = await r.json();
checar('devolve código e link', r.status === 200 && j.codigo === 'K7M2QX' && j.link === `${LINK_BASE}K7M2QX`, JSON.stringify(j));
checar('id da RPC vem do JWT', JSON.parse(rpcChamado('indicacao_codigo').init.body).p_user === USER.id);
checar('flag desligada (padrão): meses 0, sem contador, teto da constante', j.meses === 0 && j.resumo === null && j.teto === INDICACAO_TETO_PREMIADAS, JSON.stringify(j));
checar('resumo pede o teto da constante', JSON.parse(rpcChamado('indicacao_resumo').init.body).p_teto === INDICACAO_TETO_PREMIADAS);
env.INDICACAO_RECOMPENSA_ATIVA = '1';
reset();
rpcs = { indicacao_codigo: 'K7M2QX', indicacao_resumo: { recompensadas: 1, teto: INDICACAO_TETO_PREMIADAS } };
j = await (await rodar(req('/indicacao/meu'))).json();
checar('flag ligada: meses = constante e resumo repassado', j.meses === INDICACAO_MESES_PRO && j.resumo?.recompensadas === 1, JSON.stringify(j));
delete env.INDICACAO_RECOMPENSA_ATIVA;
env.INDICACAO_RECOMPENSA_ATIVA = 'true';
reset();
rpcs = { indicacao_codigo: 'K7M2QX', indicacao_resumo: { recompensadas: 1 } };
j = await (await rodar(req('/indicacao/meu'))).json();
checar("só o valor exato '1' liga (nada de 'true' solto)", j.meses === 0);
delete env.INDICACAO_RECOMPENSA_ATIVA;
reset();
rpcs = { indicacao_codigo: 'erro' };
r = await rodar(req('/indicacao/meu'));
checar('RPC fora do ar = 503 (não 200 vazio)', r.status === 503);
reset();
rpcs = { indicacao_codigo: 'lixo!', indicacao_resumo: 'erro' };
r = await rodar(req('/indicacao/meu'));
checar('código malformado vindo do banco = 503', r.status === 503);
reset();
rpcs = { indicacao_codigo: 'K7M2QX', indicacao_resumo: 'erro' };
j = await (await rodar(req('/indicacao/meu'))).json();
checar('resumo fora do ar: código vale, resumo null (não 0)', j.ok === true && j.resumo === null);

console.log('POST /indicacao/vincular');
reset();
rpcs = { indicacao_vincular: 'vinculado' };
r = await rodar(req('/indicacao/vincular', { method: 'POST', body: { codigo: 'k7m2qx', p_indicado: 'outro-usuario' } }));
j = await r.json();
const corpoRpc = JSON.parse(rpcChamado('indicacao_vincular').init.body);
checar('vincula com código normalizado e usuário do JWT', j.status === 'vinculado' && corpoRpc.p_codigo === 'K7M2QX' && corpoRpc.p_indicado === USER.id, JSON.stringify(corpoRpc));
reset();
r = await rodar(req('/indicacao/vincular', { method: 'POST', body: { codigo: "x'; --" } }));
checar('código inválido = 400 sem tocar no banco', r.status === 400 && !rpcChamado('indicacao_vincular'));
r = await rodar(req('/indicacao/vincular', { method: 'POST', body: {} }));
checar('sem código = 400', r.status === 400);
reset();
rpcs = { indicacao_vincular: 'conta_antiga' };
r = await rodar(req('/indicacao/vincular', { method: 'POST', body: { codigo: 'K7M2QX' } }));
j = await r.json();
checar('status de negócio volta 200 (cliente limpa o código guardado)', r.status === 200 && j.status === 'conta_antiga');
reset();
r = await rodar(req('/indicacao/vincular', { method: 'POST', body: { codigo: 'K7M2QX' } }));
checar('RPC fora = 503', r.status === 503);
reset();
const grande = new Request('https://w.test/indicacao/vincular', {
  method: 'POST', headers: { Authorization: 'Bearer t', 'content-length': '999999' }, body: '{}',
});
r = await rodar(grande);
checar('corpo gigante = 413', r.status === 413);

console.log('POST /indicacao/verificar');
reset();
rpcs = { indicacao_recompensar: { status: 'sem_orcamento_real' } };
j = await (await rodar(req('/indicacao/verificar', { method: 'POST' }))).json();
checar('repassa o status', j.status === 'sem_orcamento_real' && j.meses === 0);
const chamada = JSON.parse(rpcChamado('indicacao_recompensar').init.body);
checar('desligada: manda p_meses 0 (banco não decide nada)', chamada.p_indicado === USER.id && chamada.p_meses === 0);
env.INDICACAO_RECOMPENSA_ATIVA = '1';
reset();
rpcs = { indicacao_recompensar: { status: 'teto_diario' } };
await rodar(req('/indicacao/verificar', { method: 'POST' }));
const lig = JSON.parse(rpcChamado('indicacao_recompensar').init.body);
checar('ligada: valor e tetos vêm das constantes', lig.p_meses === INDICACAO_MESES_PRO && lig.p_teto === INDICACAO_TETO_PREMIADAS && lig.p_teto_dia === INDICACAO_TETO_DIARIO, JSON.stringify(lig));
delete env.INDICACAO_RECOMPENSA_ATIVA;
reset();
rpcs = { indicacao_recompensar: { status: 'recompensado', meses: 1, indicador_id: 'segredo-do-indicador' } };
j = await (await rodar(req('/indicacao/verificar', { method: 'POST' }))).json();
checar('recompensado devolve meses', j.status === 'recompensado' && j.meses === 1);
checar('NÃO vaza indicador_id ao indicado', !JSON.stringify(j).includes('segredo-do-indicador'));
reset();
rpcs = { indicacao_recompensar: 'erro' };
r = await rodar(req('/indicacao/verificar', { method: 'POST' }));
checar('RPC fora = 503', r.status === 503);
reset();
rpcs = { indicacao_recompensar: 'texto-solto' };
r = await rodar(req('/indicacao/verificar', { method: 'POST' }));
checar('resposta malformada = 503', r.status === 503);

console.log('POST /indicacao/evento');
reset();
r = await rodar(req('/indicacao/evento', { method: 'POST', body: { evento: 'cartao_visto', momento: 'apos_envio' } }));
const ins = chamadas.find((c) => c.url.endsWith('/indicacao_eventos'));
checar('grava com user do JWT', r.status === 200 && JSON.parse(ins.init.body).user_id === USER.id);
checar('evento sem canal grava canal null', JSON.parse(ins.init.body).canal === null);
reset();
r = await rodar(req('/indicacao/evento', { method: 'POST', body: { evento: 'compartilhada', momento: 'painel', canal: 'whatsapp' } }));
checar('compartilhada com canal', r.status === 200);
for (const [nome, corpo] of [
  ['evento fora da lista', { evento: 'hack', momento: 'painel' }],
  ['momento fora da lista', { evento: 'cartao_visto', momento: 'x' }],
  ['canal fora da lista', { evento: 'compartilhada', momento: 'painel', canal: 'sms' }],
]) {
  reset();
  r = await rodar(req('/indicacao/evento', { method: 'POST', body: corpo }));
  checar(`${nome} = 400 sem gravar`, r.status === 400 && !chamadas.some((c) => c.url.endsWith('/indicacao_eventos')));
}
reset();
eventoOk = false;
r = await rodar(req('/indicacao/evento', { method: 'POST', body: { evento: 'cartao_visto', momento: 'painel' } }));
checar('banco recusou = 503', r.status === 503);

console.log('limite de uso');
reset();
const negado = { ...env, CONTA_RL: { limit: async () => ({ success: false }) } };
const rq = req('/indicacao/meu');
r = await handleIndicacao(rq, negado, new URL(rq.url));
checar('rate limit negado = 429', r.status === 429);

console.log(`\n${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
