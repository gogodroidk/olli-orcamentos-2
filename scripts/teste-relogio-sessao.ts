/**
 * Teste do RELÓGIO ERRADO — sessão, refresh, carimbo da empresa e backup.
 *
 *     node scripts/teste-relogio-sessao.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Rejeição da Play de 02/10/2026: o aparelho do revisor estava 21 dias adiantado.
 * Todo token parecia vencido (86 refreshes em 7 min), um 429 apagaria a sessão,
 * o carimbo da empresa vencia a nuvem e o backup semanal girava cópias boas.
 * Este teste roda o auth-js DE VERDADE (o mesmo 2.108 do app) contra um servidor
 * falso, com o `Date.now` do aparelho deslocado em +21 dias e em -2 h.
 */
import { GoTrueClient } from '@supabase/auth-js';
import { AuthStorageSeguro, type RelogioSessao } from '../src/services/authStorageCore.ts';
import {
  ajustarSessaoParaGravar,
  lerClaimsJwt,
  prepararSessaoParaLeitura,
  CAMPO_MARCA_RELOGIO,
  CAMPO_EXPIRA_SERVIDOR,
} from '../src/services/sessaoRelogio.ts';
import {
  criarFetchResiliente,
  ehRefreshDeSessao,
  falhaDeRefreshMataSessao,
  ESPERA_APOS_FALHA_REFRESH_MS,
} from '../src/services/refreshResiliente.ts';
import {
  _zerarRelogioParaTeste,
  agoraDoServidorMs,
  assinarRelogio,
  defasagemRelogioMs,
  registrarDefasagem,
  registrarHoraDoServidor,
  relogioDoAparelhoErrado,
} from '../src/services/relogioServidor.ts';
import { decidirPushEmpresa } from '../src/services/carimboEmpresa.ts';
import { decidirBackupSemanal, horasDesdeCarimboLocal } from '../src/services/rotacaoBackup.ts';

let falhas = 0;
let oks = 0;
function checar(cond: boolean, msg: string, detalhe?: unknown) {
  if (cond) { oks += 1; console.log(`  ok   ${msg}`); }
  else { falhas += 1; console.log(`  FALHA ${msg}${detalhe === undefined ? '' : ` — ${JSON.stringify(detalhe)}`}`); }
}

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const MARGEM_AUTH_JS_MS = 90_000;

// ─── JWT e sessão falsos (só iat/exp importam; assinatura não é conferida) ─────
const b64url = (texto: string) => Buffer.from(texto, 'utf8').toString('base64url');
let contadorToken = 0;
function jwt(iatSeg: number, vidaSeg = 3600): string {
  contadorToken += 1;
  const cabecalho = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({
    iat: iatSeg, exp: iatSeg + vidaSeg, sub: 'u1', role: 'authenticated',
    user_metadata: { full_name: 'João da Silva Ç' }, n: contadorToken,
  }));
  return `${cabecalho}.${corpo}.assinatura`;
}
/** Sessão como o GoTrue devolve: `expires_at` no relógio DO SERVIDOR. */
function sessaoDoServidor(servidorMs: number, refresh = `r${contadorToken + 1}`) {
  const iat = Math.floor(servidorMs / 1000);
  return {
    access_token: jwt(iat),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: iat + 3600,
    refresh_token: refresh,
    user: { id: 'u1', aud: 'authenticated', email: 'revisor@exemplo.com' },
  };
}
/** O teste do auth-js: vencida se faltar menos de 90 s no relógio do aparelho. */
const pareceVencida = (valor: string | null, agoraAparelho: number) => {
  if (!valor) return true;
  const s = JSON.parse(valor) as { expires_at: number };
  return s.expires_at * 1000 - agoraAparelho < MARGEM_AUTH_JS_MS;
};

class Memoria {
  dados = new Map<string, string>();
  async getItem(k: string) { return this.dados.get(k) ?? null; }
  async setItem(k: string, v: string) { this.dados.set(k, v); }
  async removeItem(k: string) { this.dados.delete(k); }
  async getItemAsync(k: string) { return this.getItem(k); }
  async setItemAsync(k: string, v: string) { return this.setItem(k, v); }
  async deleteItemAsync(k: string) { return this.removeItem(k); }
}

const T0 = Date.parse('2026-10-02T06:40:42Z'); // hora do servidor no login do revisor

// ═══ 1) Regra pura da sessão ═══════════════════════════════════════════════════
console.log('\n1) gravação e leitura da sessão com o relógio errado');
{
  checar(lerClaimsJwt(jwt(100))?.iat === 100, 'lê iat/exp de JWT com nome acentuado no payload');
  checar(lerClaimsJwt('nao-e-jwt') === null && lerClaimsJwt(undefined) === null, 'JWT ilegível = null (não lança)');

  // +21 dias
  const servidor = sessaoDoServidor(T0);
  const aparelho = T0 + 21 * DIA;
  const bruto = JSON.stringify(servidor);
  checar(pareceVencida(bruto, aparelho), 'SEM a correção, o token chega "vencido" no aparelho +21 dias (a rajada)');
  const gravada = ajustarSessaoParaGravar(bruto, aparelho);
  const s = JSON.parse(gravada.valor);
  checar(gravada.defasagemMedidaSeg === 21 * 24 * 3600, '+21 dias: defasagem medida pelo iat', gravada.defasagemMedidaSeg);
  checar(s.expires_at === servidor.expires_at + 21 * 24 * 3600, '+21 dias: expires_at levado ao relógio do aparelho');
  checar(s[CAMPO_EXPIRA_SERVIDOR] === servidor.expires_at, 'o exp real do servidor fica guardado');
  checar(!pareceVencida(gravada.valor, aparelho), '+21 dias: o token recém-chegado NÃO parece vencido');
  checar(!pareceVencida(gravada.valor, aparelho + 55 * MIN), '…e vale ~1 h no relógio do aparelho');
  checar(pareceVencida(gravada.valor, aparelho + 59 * MIN), '…e vence junto com o do servidor (sem ganho de validade)');

  const regravada = ajustarSessaoParaGravar(gravada.valor, aparelho + 40 * MIN);
  checar(regravada.valor === gravada.valor && regravada.defasagemMedidaSeg === null, 'sessão já ajustada não é reajustada quando o auth-js grava de novo');

  // leitura: sem medida nova, mantém; relógio acertado, volta ao do servidor
  checar(prepararSessaoParaLeitura(gravada.valor, aparelho + 10 * MIN, null) === gravada.valor, 'leitura sem medida nova devolve o valor intacto');
  const acertado = JSON.parse(prepararSessaoParaLeitura(gravada.valor, T0 + 5 * MIN, 0));
  checar(acertado.expires_at === servidor.expires_at, 'pessoa acertou o relógio (medida = 0): o prazo volta ao do servidor');
  const recuou = JSON.parse(prepararSessaoParaLeitura(gravada.valor, T0 + 5 * MIN, null));
  checar(recuou.expires_at === servidor.expires_at, 'relógio recuou e ainda não há medida: não confia na defasagem velha');

  // -2 h
  const atrasado = T0 - 2 * HORA;
  const brutoAtras = JSON.stringify(sessaoDoServidor(T0));
  checar(!pareceVencida(brutoAtras, atrasado + 2.5 * HORA), 'SEM a correção, no aparelho -2 h o token "valeria" 3 h (o servidor recusa depois de 1 h)');
  const atras = ajustarSessaoParaGravar(brutoAtras, atrasado);
  checar(atras.defasagemMedidaSeg === -7200, '-2 h: defasagem negativa medida', atras.defasagemMedidaSeg);
  checar(!pareceVencida(atras.valor, atrasado + 50 * MIN) && pareceVencida(atras.valor, atrasado + 59 * MIN), '-2 h: vence em ~1 h no relógio do aparelho, junto com o servidor');

  // relógio certo
  const certo = ajustarSessaoParaGravar(JSON.stringify(sessaoDoServidor(T0)), T0 + 2_000);
  checar(JSON.parse(certo.valor).expires_at === Math.floor(T0 / 1000) + 3600, 'relógio certo (2 s): prazo do servidor intacto');

  // sessão antiga (versão anterior, sem marca)
  const legada = JSON.stringify(sessaoDoServidor(T0));
  const lida = prepararSessaoParaLeitura(legada, T0 + 50 * MIN, null);
  const lidaObj = JSON.parse(lida);
  checar(lidaObj.expires_at === JSON.parse(legada).expires_at && lidaObj[CAMPO_MARCA_RELOGIO]?.defasagemSeg === null, 'sessão de versão anterior: ganha a marca "não sei" e o prazo não muda');
  const regravadaLegada = ajustarSessaoParaGravar(lida, T0 + 50 * MIN);
  checar(JSON.parse(regravadaLegada.valor).expires_at === JSON.parse(legada).expires_at, '…e regravá-la NÃO estica o prazo pela idade do token (50 min)');

  // piso de 30 s
  const agora = T0 + 21 * DIA;
  const curta = { ...sessaoDoServidor(T0), access_token: jwt(Math.floor(T0 / 1000), 60) };
  curta.expires_at = Math.floor(T0 / 1000) + 60;
  const curtaGravada = ajustarSessaoParaGravar(JSON.stringify(curta), agora).valor;
  checar(!pareceVencida(prepararSessaoParaLeitura(curtaGravada, agora + 10_000, null), agora + 10_000), 'piso de 30 s: sessão gravada há 10 s nunca é lida como vencida');
  checar(pareceVencida(prepararSessaoParaLeitura(curtaGravada, agora + 31_000, null), agora + 31_000), 'depois de 30 s o piso sai e o prazo real manda');

  // valores que não são sessão
  for (const valor of ['abc', '{"x":1}', JSON.stringify({ access_token: 'a'.repeat(50), refresh_token: 'r', expires_at: 1 }), '']) {
    checar(ajustarSessaoParaGravar(valor, agora).valor === valor && prepararSessaoParaLeitura(valor, agora, 0) === valor, `valor que não é sessão passa intacto (${valor.slice(0, 12) || 'vazio'})`);
  }
}

// ═══ 2) Storage de verdade + auth-js de verdade: quantos refreshes? ══════════
console.log('\n2) auth-js 2.108 real, 15 min com getSession a cada 2 s');

const dateNowOriginal = Date.now;
const setTimeoutOriginal = globalThis.setTimeout;

async function simular(defasagemMs: number, minutos: number, semCorrecao = false): Promise<{ refreshes: number; tokenVencidoNoServidor: number; deslogou: boolean }> {
  _zerarRelogioParaTeste();
  let servidorAgora = T0;
  Date.now = () => servidorAgora + defasagemMs;
  let refreshes = 0;
  let tokenVencidoNoServidor = 0;
  const servidor = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes('grant_type=refresh_token')) {
      refreshes += 1;
      return new Response(JSON.stringify(sessaoDoServidor(servidorAgora, `r-${refreshes}`)), {
        status: 200, headers: { 'content-type': 'application/json', date: new Date(servidorAgora).toUTCString() },
      });
    }
    return new Response('{}', { status: 404 });
  };
  const relogio: RelogioSessao = {
    agora: () => Date.now(),
    defasagemAtualMs: () => defasagemRelogioMs(),
    aoMedirDefasagem: (seg, agora) => registrarDefasagem(seg * 1000, 'jwt', agora),
  };
  const storage = semCorrecao ? new Memoria() : new AuthStorageSeguro(new Memoria(), new Memoria(), relogio);
  const chave = 'sb-teste-auth-token';
  // Login: o auth-js grava a sessão recém-emitida (é este setItem que ajusta).
  await storage.setItem(chave, JSON.stringify(sessaoDoServidor(servidorAgora, 'r-login')));
  const cliente = new GoTrueClient({
    url: 'http://olli.test/auth/v1',
    storageKey: chave,
    storage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: semCorrecao ? servidor : criarFetchResiliente(servidor, { agora: () => Date.now(), aoReceberDataServidor: registrarHoraDoServidor }),
  });
  let deslogou = false;
  cliente.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') deslogou = true; });
  for (let t = 0; t < minutos * 60_000; t += 2_000) {
    servidorAgora = T0 + t;
    const { data } = await cliente.getSession();
    const token = data.session?.access_token;
    const claims = lerClaimsJwt(token);
    // O servidor recusa token com exp no passado (relógio dele).
    if (!claims || claims.exp * 1000 <= servidorAgora) tokenVencidoNoServidor += 1;
  }
  Date.now = dateNowOriginal;
  return { refreshes, tokenVencidoNoServidor, deslogou };
}

{
  const rajada = await simular(21 * DIA, 15, true);
  checar(rajada.refreshes > 300, `PROVA do bug: sem a correção, +21 dias = ${rajada.refreshes} refreshes em 15 min (1 por getSession)`, rajada);

  const adiantado = await simular(21 * DIA, 15);
  checar(adiantado.refreshes <= 1, `+21 dias: ${adiantado.refreshes} refresh(es) em 15 min (antes: ~1 a cada 2-5 s)`, adiantado);
  checar(adiantado.tokenVencidoNoServidor === 0, '+21 dias: nenhuma requisição sai com token vencido no servidor', adiantado);
  checar(!adiantado.deslogou, '+21 dias: sessão não cai');
  checar(relogioDoAparelhoErrado(), '+21 dias: o aviso "Data e hora do celular erradas" liga');

  const longo = await simular(21 * DIA, 125);
  checar(longo.refreshes >= 2 && longo.refreshes <= 3, `+21 dias por ~2 h: renova ~1 vez por hora (${longo.refreshes})`, longo);
  checar(longo.tokenVencidoNoServidor === 0, '+21 dias por ~2 h: nenhum token vencido enviado', longo);

  const atrasado = await simular(-2 * HORA, 125);
  checar(atrasado.refreshes >= 2 && atrasado.refreshes <= 3, `-2 h por ~2 h: renova ~1 vez por hora (${atrasado.refreshes})`, atrasado);
  checar(atrasado.tokenVencidoNoServidor === 0, '-2 h: nenhum token vencido enviado (sem a correção, 1 h inteira de 401)', atrasado);

  const certo = await simular(0, 15);
  checar(certo.refreshes === 0 && !certo.deslogou, 'relógio certo: 0 refresh em 15 min', certo);
  checar(!relogioDoAparelhoErrado(), 'relógio certo: sem aviso');
}

// ═══ 3) 429 / 5xx / rede NUNCA viram logout; credencial morta desloga ═════════
console.log('\n3) refresh recusado: só a credencial morta desloga');
async function refreshComResposta(resposta: () => Response, usarResiliente: boolean) {
  Date.now = dateNowOriginal;
  // O auth-js espera 200, 400, 800… ms entre tentativas de erro de rede; aqui
  // o tempo não importa, só o resultado.
  globalThis.setTimeout = ((fn: () => void) => setTimeoutOriginal(fn, 0)) as typeof setTimeout;
  const chave = 'sb-teste-auth-token';
  const storage = new Memoria();
  const vencida = { ...sessaoDoServidor(Date.now() - 2 * HORA, 'r-velho') };
  await storage.setItem(chave, JSON.stringify(vencida));
  let chamadasAoServidor = 0;
  const base = async () => { chamadasAoServidor += 1; return resposta(); };
  const cliente = new GoTrueClient({
    url: 'http://olli.test/auth/v1', storageKey: chave, storage,
    autoRefreshToken: false, persistSession: true, detectSessionInUrl: false,
    fetch: usarResiliente ? criarFetchResiliente(base) : base,
  });
  let deslogou = false;
  cliente.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') deslogou = true; });
  const erroOriginal = console.error;
  console.error = () => {};
  try {
    await cliente.getSession();
  } finally {
    console.error = erroOriginal;
    globalThis.setTimeout = setTimeoutOriginal;
  }
  return { deslogou, guardada: await storage.getItem(chave), chamadasAoServidor };
}
const json = (status: number, corpo: unknown, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } });

{
  const semCorrecao = await refreshComResposta(json(429, { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }), false);
  checar(semCorrecao.deslogou && semCorrecao.guardada === null, 'PROVA do bug: sem a correção, um 429 apaga a sessão e emite SIGNED_OUT', semCorrecao);

  const com429 = await refreshComResposta(json(429, { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }), true);
  checar(!com429.deslogou && com429.guardada !== null, '429 no refresh: sessão GUARDADA, sem SIGNED_OUT', com429);
  checar(com429.chamadasAoServidor === 1, '429: as novas tentativas do auth-js não martelam o servidor (espera ≥ 30 s)', com429.chamadasAoServidor);

  const com500 = await refreshComResposta(json(500, { msg: 'boom' }), true);
  checar(!com500.deslogou && com500.guardada !== null, '500 no refresh: sessão guardada', com500);

  const estranho = await refreshComResposta(() => new Response('<html>proxy</html>', { status: 418 }), true);
  checar(!estranho.deslogou && estranho.guardada !== null, 'resposta estranha ("não sei"): sessão guardada', estranho);

  const morta = await refreshComResposta(json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }), true);
  checar(morta.deslogou && morta.guardada === null, 'refresh_token_not_found: desloga (credencial morta)', morta);

  const grant = await refreshComResposta(json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' }), true);
  checar(grant.deslogou && grant.guardada === null, 'invalid_grant: desloga', grant);

  const rede = await refreshComResposta(() => { throw new TypeError('Network request failed'); }, true);
  checar(!rede.deslogou && rede.guardada !== null, 'sem rede: sessão guardada', rede);
}

{
  checar(ehRefreshDeSessao('https://x.supabase.co/auth/v1/token?grant_type=refresh_token'), 'reconhece a URL de refresh');
  checar(!ehRefreshDeSessao('https://x.supabase.co/auth/v1/token?grant_type=password'), 'login por senha não é refresh');
  checar(falhaDeRefreshMataSessao(400, '{"error_code":"refresh_token_already_used"}'), 'refresh token já usado = credencial morta');
  checar(!falhaDeRefreshMataSessao(429, '{"error":"invalid_grant"}'), '429 nunca é credencial morta, nem com invalid_grant no corpo');
  checar(!falhaDeRefreshMataSessao(400, '{"error_code":"validation_failed"}'), '400 desconhecido = "não sei"');

  // espera e Retry-After, com relógio controlado
  let agora = 1_000_000;
  let chamadas = 0;
  let proxima: () => Response = json(429, {}, { 'retry-after': '120' });
  const f = criarFetchResiliente(async () => { chamadas += 1; return proxima(); }, { agora: () => agora });
  const url = 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token';
  const r1 = await f(url);
  checar(r1.status === 503, '429 vira 503 para o auth-js');
  let bloqueado = false;
  agora += ESPERA_APOS_FALHA_REFRESH_MS + 1;
  try { await f(url); } catch (e) { bloqueado = e instanceof TypeError; }
  checar(bloqueado && chamadas === 1, 'Retry-After de 120 s é respeitado (31 s depois ainda espera, sem tocar o servidor)');
  agora += 120_000;
  proxima = json(200, sessaoDoServidor(agora));
  const r2 = await f(url);
  checar(r2.status === 200 && chamadas === 2, 'passada a espera, o refresh volta a sair');
  const outra = await criarFetchResiliente(async () => new Response('{}', { status: 429 }))('https://x.supabase.co/rest/v1/orcamentos');
  checar(outra.status === 429, 'requisição que não é refresh passa intacta');
}

// ═══ 4) Relógio do servidor (cabeçalho Date) ═══════════════════════════════════
console.log('\n4) medida do relógio e aviso');
{
  _zerarRelogioParaTeste();
  checar(defasagemRelogioMs() === null && agoraDoServidorMs() === null, 'sem medida = "não sei" (null), nunca 0');
  let avisos = 0;
  const parar = assinarRelogio(() => { avisos += 1; });
  const aparelho = T0 + 21 * DIA;
  registrarHoraDoServidor(new Date(T0).toUTCString(), aparelho);
  checar(Math.abs((defasagemRelogioMs() ?? 0) - 21 * DIA) < 1_000, 'cabeçalho Date mede +21 dias');
  checar(Math.abs((agoraDoServidorMs(aparelho) ?? 0) - T0) < 1_000, 'agoraDoServidorMs devolve a hora do servidor');
  checar(relogioDoAparelhoErrado(), 'mais de 5 min = aviso');
  registrarHoraDoServidor(new Date(T0).toUTCString(), aparelho + 200);
  checar(avisos === 1, 'medidas iguais não re-renderizam a tela (1 aviso só)', avisos);
  registrarHoraDoServidor('lixo', aparelho);
  registrarHoraDoServidor(null, aparelho);
  checar(Math.abs((defasagemRelogioMs() ?? 0) - 21 * DIA) < 1_000, 'cabeçalho ilegível/ausente não apaga a medida');
  registrarHoraDoServidor(new Date(T0).toUTCString(), T0 + 3 * MIN);
  checar(!relogioDoAparelhoErrado(), '3 min de diferença não avisa');
  parar();
  _zerarRelogioParaTeste();
}

// ═══ 5) Carimbo da empresa = hora do servidor ══════════════════════════════════
console.log('\n5) guarda de envio da empresa');
{
  const nuvem = { atualizadoEm: '2026-10-02T11:30:15Z', semCadastro: false };
  checar(decidirPushEmpresa('2026-10-23T06:44:00Z', nuvem) === 'nuvem_mais_nova', 'carimbo do aparelho +21 dias (versão antiga) NÃO autoriza empurrar a cópia velha');
  checar(decidirPushEmpresa('2026-10-02T11:30:15.000Z', nuvem) === 'pode_escrever', 'carimbo = atualizado_em do servidor: pode escrever');
  checar(decidirPushEmpresa('2026-10-02T11:30:15.400Z', nuvem) === 'pode_escrever', 'carimbo legado logo após o envio (latência) continua valendo');
  checar(decidirPushEmpresa('2026-10-01T09:00:00Z', nuvem) === 'nuvem_mais_nova', 'outro aparelho escreveu depois: a nuvem vence');
  checar(decidirPushEmpresa(null, nuvem) === 'nuvem_mais_nova', 'aparelho novo não sobrescreve cadastro existente');
  checar(decidirPushEmpresa(null, null) === 'pode_escrever', 'conta nova: pode criar');
  checar(decidirPushEmpresa('2026-10-23T06:44:00Z', { atualizadoEm: nuvem.atualizadoEm, semCadastro: true }) === 'pode_escrever', 'linha da nuvem sem cadastro pode ser completada (Onboarding)');
}

// ═══ 6) Backup: rotação pela hora do servidor ══════════════════════════════════
console.log('\n6) backup automático');
{
  const agora = T0 + 21 * DIA;
  checar(horasDesdeCarimboLocal(new Date(agora - 3 * HORA).toISOString(), agora) === 3, 'carimbo local: 3 h no mesmo relógio');
  checar(horasDesdeCarimboLocal(new Date(agora).toISOString(), T0) === null, 'carimbo "no futuro" (relógio acertado) é ignorado, não trava o backup por 21 dias');
  checar(horasDesdeCarimboLocal(null, agora) === null && horasDesdeCarimboLocal('x', agora) === null, 'carimbo ausente/ilegível = null');
  const diarioDeHoje = '2026-10-02T06:44:10Z'; // criado_em do servidor
  checar(decidirBackupSemanal(diarioDeHoje, '2026-09-29T10:00:00Z') === 'pular', 'semanal de 3 dias atrás (datas do servidor): não cria outro, mesmo com o celular +21 dias');
  checar(decidirBackupSemanal(diarioDeHoje, '2026-09-24T10:00:00Z') === 'criar', 'semanal de 8 dias: cria');
  checar(decidirBackupSemanal(diarioDeHoje, null) === 'criar', 'nunca houve semanal: cria');
  checar(decidirBackupSemanal(diarioDeHoje, undefined) === 'nao_sei', 'leitura do semanal falhou: não decide (nada é girado)');
  checar(decidirBackupSemanal(null, null) === 'nao_sei', 'sem a hora do servidor: não decide');
}

console.log(falhas ? `\nFALHOU: ${falhas} falha(s), ${oks} ok` : `\nPASSOU: ${oks} ok, 0 falha(s)`);
process.exit(falhas ? 1 : 0);
