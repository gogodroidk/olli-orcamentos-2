/**
 * Teste de aceite (Onda I0): "reabrir depois de 30 dias offline".
 *
 *     node scripts/teste-sessao-30-dias-offline.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O QUE ELE PROVA, COM A BIBLIOTECA DE VERDADE. Não simula o Supabase: monta um
 * `GoTrueClient` real (@supabase/auth-js, a mesma versão do app) com storage em
 * memória e um `fetch` falso, guarda uma sessão cujo token venceu há 30 dias e
 * reabre o app sem internet. Antes da correção, o `getSession()` devolvia
 * `session: null` e o app mandava o técnico para a tela Entrar. Agora:
 *
 *   1. sem rede há 30 dias → a sessão continua no aparelho e o boot a usa
 *      (`guardada_offline`): o app abre em modo avião, com os dados locais;
 *   2. a rede volta → a renovação acontece e a sessão vem do servidor;
 *   3. a conta foi desconectada no servidor → a biblioteca apaga a sessão e o
 *      boot cai na porta (`nenhuma`) — offline não vira passe livre;
 *   4. servidor fora (503) → mesmo caso do 1 (erro repetível);
 *   5. e as guardas de arquivo: App.tsx não expulsa no INITIAL_SESSION sem
 *      conferir a sessão guardada; o sync continua exigindo sessão RENOVADA.
 *
 * O relógio é adiantado 31 s a cada chamada de rede para o auth-js desistir das
 * novas tentativas na hora (sem isso cada cenário offline dormiria ~25 s).
 */
import { readFileSync } from 'node:fs';
import { GoTrueClient } from '@supabase/auth-js';
import { decidirSessaoNoBoot, erroDeRenovacaoEhDeRede, interpretarSessaoGuardada } from '../src/services/sessaoOffline.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  if (Object.is(real, esperado)) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${String(esperado)}\n        recebido: ${String(real)}`);
  }
}

// ─── Relógio controlável (o auth-js decide expiração e novas tentativas por ele) ──
const relogioReal = Date.now;
let salto = 0;
Date.now = () => relogioReal() + salto;

// O auth-js loga cada tentativa de rede falha com console.error; silencia só
// as linhas dele para o relatório do teste continuar legível.
const consoleErrorReal = console.error;
console.error = (...args: unknown[]) => {
  const primeiro = args[0];
  if (primeiro instanceof Error || (typeof primeiro === 'string' && primeiro.includes('Network request failed'))) return;
  consoleErrorReal(...args);
};

const CHAVE = 'sb-teste-auth-token';
const USUARIO = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-08-01T00:00:00Z',
};

function sessaoVencidaHa(dias: number) {
  const agoraS = Math.floor(Date.now() / 1000);
  return {
    access_token: 'a.b.c',
    refresh_token: 'refresh-antigo',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: agoraS - dias * 86400,
    user: USUARIO,
  };
}

type ModoRede = 'offline' | 'ok' | 'revogada' | 'servidor_fora';

function montar(modo: ModoRede) {
  const memoria = new Map<string, string>();
  memoria.set(CHAVE, JSON.stringify(sessaoVencidaHa(30)));
  const storage = {
    getItem: async (k: string) => memoria.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      memoria.set(k, v);
    },
    removeItem: async (k: string) => {
      memoria.delete(k);
    },
  };
  const fetchFalso = async (): Promise<Response> => {
    salto += 31_000;
    if (modo === 'offline') throw new TypeError('Network request failed');
    if (modo === 'servidor_fora') return new Response('upstream', { status: 503 });
    if (modo === 'revogada') {
      return new Response(
        JSON.stringify({ code: 'refresh_token_not_found', error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({
        access_token: 'n.o.v',
        refresh_token: 'refresh-novo',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: USUARIO,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  const cliente = new GoTrueClient({
    url: 'http://127.0.0.1:9/auth/v1',
    storageKey: CHAVE,
    storage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: fetchFalso as unknown as typeof fetch,
  });
  return { cliente, memoria };
}

/** O que o boot do app faz (supabase.ts → sessaoComOrigem), com o cliente de teste. */
async function bootDoApp(modo: ModoRede) {
  const { cliente, memoria } = montar(modo);
  const { data, error } = await cliente.getSession();
  const decisao = decidirSessaoNoBoot(data.session, error, memoria.get(CHAVE) ?? null);
  return { data, error, decisao, memoria };
}

console.log('\n1) 30 dias sem internet: o app abre, sem pedir login');
{
  const r = await bootDoApp('offline');
  checar('o auth-js devolve session null (o bug de antes)', r.data.session, null);
  checar('…com erro de REDE (repetível)', erroDeRenovacaoEhDeRede(r.error), true);
  checar('…e a sessão continua guardada no aparelho', r.memoria.has(CHAVE), true);
  checar('o boot usa a sessão guardada', r.decisao.origem, 'guardada_offline');
  checar('…do mesmo usuário (abre a partição certa)', r.decisao.sessao?.user.id, USUARIO.id);
}

console.log('\n2) a rede volta: renova e a sessão vem do servidor');
{
  const r = await bootDoApp('ok');
  checar('getSession renovou', r.data.session?.refresh_token, 'refresh-novo');
  checar('origem = servidor', r.decisao.origem, 'servidor');
}

console.log('\n3) conta desconectada no servidor: cai na porta (offline não é passe livre)');
{
  const r = await bootDoApp('revogada');
  checar('erro NÃO é de rede', erroDeRenovacaoEhDeRede(r.error), false);
  checar('a biblioteca apagou a sessão guardada', r.memoria.has(CHAVE), false);
  checar('origem = nenhuma', r.decisao.origem, 'nenhuma');
  checar('sem sessão', r.decisao.sessao, null);
}

console.log('\n4) servidor fora do ar (503): igual a sem internet');
{
  const r = await bootDoApp('servidor_fora');
  checar('erro repetível', erroDeRenovacaoEhDeRede(r.error), true);
  checar('origem = guardada_offline', r.decisao.origem, 'guardada_offline');
}

console.log('\n5) regra pura: o que NÃO pode virar sessão');
{
  const erroRede = { name: 'AuthRetryableFetchError', status: 0 };
  checar('deslogado de verdade (sem erro) → nenhuma', decidirSessaoNoBoot(null, null, JSON.stringify(sessaoVencidaHa(1))).origem, 'nenhuma');
  checar('erro de rede sem nada guardado → nenhuma', decidirSessaoNoBoot(null, erroRede, null).origem, 'nenhuma');
  checar('erro de rede + storage corrompido → nenhuma', decidirSessaoNoBoot(null, erroRede, '{nao é json').origem, 'nenhuma');
  checar('erro de rede + sessão sem refresh_token → nenhuma',
    decidirSessaoNoBoot(null, erroRede, JSON.stringify({ ...sessaoVencidaHa(1), refresh_token: '' })).origem, 'nenhuma');
  checar('erro de rede + sessão sem user.id → nenhuma',
    decidirSessaoNoBoot(null, erroRede, JSON.stringify({ ...sessaoVencidaHa(1), user: {} })).origem, 'nenhuma');
  checar('formato antigo { currentSession } é lido',
    interpretarSessaoGuardada(JSON.stringify({ currentSession: sessaoVencidaHa(1), expiresAt: 1 }))?.user.id, USUARIO.id);
  checar('erro 400 (não repetível) → nenhuma', decidirSessaoNoBoot(null, { name: 'AuthApiError', status: 400 }, JSON.stringify(sessaoVencidaHa(1))).origem, 'nenhuma');
}

console.log('\n6) o app usa a regra nos lugares certos');
{
  const supa = readFileSync(new URL('../src/services/supabase.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const autoRefresh = readFileSync(new URL('../src/services/authAutoRefresh.ts', import.meta.url), 'utf8');
  const storage = readFileSync(new URL('../src/services/authStorage.ts', import.meta.url), 'utf8');
  checar('sessaoAtiva (porta do boot) passa pela decisão offline',
    /export async function sessaoAtiva[\s\S]{0,120}sessaoComOrigem\(\)/.test(supa), true);
  checar('getCurrentUser continua ESTRITO (sync nunca roda como anônimo)',
    /export async function getCurrentUser[\s\S]*?\n\}/.exec(supa)?.[0].includes('sessaoComOrigem') ?? true, false);
  checar('App.tsx confere a sessão guardada antes de expulsar no INITIAL_SESSION',
    /INITIAL_SESSION' && !session[\s\S]{0,400}sessaoAtiva\(\)[\s\S]{0,200}if \(!guardada/.test(app), true);
  checar('usuarioDaSessaoLocal lê a sessão guardada ANTES do getSession (sem os ~25 s de renovação offline por foto)',
    /export async function usuarioDaSessaoLocal[\s\S]{0,200}interpretarSessaoGuardada\(await lerSessaoGuardada\(\)\)[\s\S]{0,120}sessaoComOrigem\(\)/.test(supa), true);
  checar('refresh automático pausa fora do primeiro plano (não gasta bateria offline)',
    /else cliente\.auth\.stopAutoRefresh\(\)/.test(autoRefresh), true);
  checar('sessão nativa no Keystore/Keychain, sem prazo nosso',
    /SecureStore/.test(storage) && !/expir/i.test(storage), true);
}

Date.now = relogioReal;
console.error = consoleErrorReal;
console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas > 0) {
  console.error('FALHOU: sessão offline de 30 dias');
  process.exit(1);
}
console.log('PASSOU: reabrir depois de 30 dias offline não pede login; conta desconectada cai na porta.');
