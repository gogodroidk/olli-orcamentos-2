/**
 * Teste unitario do gate diario de IA.
 *
 * Mocka o fetch do Supabase para provar: fail-closed, payload minimo, SHA-256
 * estavel, idempotencia por request_id, separacao das familias e traducao dos
 * dois limites. Nao toca producao.
 *
 * Executar: node scripts/teste-ia-quota.ts
 */
// @ts-expect-error — o Worker e JS puro; Node executa este teste por type stripping.
import {
  FAMILIAS_COTA_IA,
  criarGateTentativasOpenRouter,
  gerarRequestIdIA,
  reservaCotaDoErro,
  reservarCotaIA,
} from '../worker/src/iaQuota.js';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

function verdadeiro(nome: string, condicao: boolean): void {
  checar(nome, condicao, true);
}

const env = {
  SUPABASE_URL: 'https://projeto-falso.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-somente-no-worker',
};
const USER_ID = '123e4567-e89b-42d3-a456-426614174000';
const DIA = '2026-08-17';

type Chamada = { url: string; init: RequestInit; payload: Record<string, unknown> };
const chamadas: Chamada[] = [];
const vistos = new Set<string>();
let respostaForcada: unknown = null;
let statusForcado = 200;
let lancarRede = false;

function resposta(estado: string, payload: Record<string, any>) {
  const usados = Math.max(vistos.size, Number(payload.p_unidades));
  return [{
    estado,
    dia: DIA,
    usados_global: usados,
    usados_usuario: usados,
    limite_global: payload.p_limite_global,
    limite_usuario: payload.p_limite_usuario,
    unidades: payload.p_unidades,
  }];
}

(globalThis as any).fetch = async (url: string, init: RequestInit) => {
  if (lancarRede) throw new Error('rede fora');
  const payload = JSON.parse(String(init.body));
  chamadas.push({ url, init, payload });

  if (statusForcado !== 200) {
    return { ok: false, status: statusForcado, json: async () => ({ erro: 'nao vazar' }) } as Response;
  }
  if (respostaForcada !== null) {
    return { ok: true, status: 200, json: async () => respostaForcada } as unknown as Response;
  }

  const chave = `${payload.p_familia}:${payload.p_user}:${payload.p_request_id}`;
  if (vistos.has(chave)) {
    return { ok: true, status: 200, json: async () => resposta('ja_reservado', payload) } as unknown as Response;
  }
  vistos.add(chave);
  return { ok: true, status: 200, json: async () => resposta('permitido', payload) } as unknown as Response;
};

console.log('\n1) request_id SHA-256 e estavel para rota+corpo canonico');
const corpoA = { prompt: 'orcamento cliente 123', opcoes: { json: true, idioma: 'pt-BR' } };
const corpoB = { opcoes: { idioma: 'pt-BR', json: true }, prompt: 'orcamento cliente 123' };
const idA = await gerarRequestIdIA('/chat', corpoA);
const idB = await gerarRequestIdIA('/chat', corpoB);
const idOutraRota = await gerarRequestIdIA('/diagnostico', corpoA);
checar('hash tem 64 hex', /^[a-f0-9]{64}$/.test(idA), true);
checar('ordem das chaves nao altera hash', idB, idA);
verdadeiro('rota faz parte do hash', idOutraRota !== idA);

console.log('\n2) primeira reserva envia payload minimo e permite');
const primeira = await reservarCotaIA(env, {
  userId: USER_ID,
  familia: FAMILIAS_COTA_IA.OPENROUTER,
  rota: '/chat',
  corpo: corpoA,
  limiteGlobal: 1000,
  limiteUsuario: 30,
});
checar('estado permitido autoriza', primeira.permitido, true);
checar('estado preservado', primeira.estado, 'permitido');
checar('requestId devolvido ao chamador', primeira.requestId, idA);
checar('endpoint RPC exato', chamadas[0].url,
  'https://projeto-falso.supabase.co/rest/v1/rpc/reservar_cota_ia_diaria');
checar('metodo POST', chamadas[0].init.method, 'POST');
checar('payload RPC', chamadas[0].payload, {
  p_user: USER_ID,
  p_familia: 'openrouter',
  p_request_id: idA,
  p_limite_global: 1000,
  p_limite_usuario: 30,
  p_unidades: 1,
});
verdadeiro('prompt/audio nunca vao no payload da RPC',
  !JSON.stringify(chamadas[0].payload).includes('orcamento cliente 123'));
checar('service role no apikey', (chamadas[0].init.headers as any).apikey,
  env.SUPABASE_SERVICE_ROLE_KEY);

console.log('\n3) retry gera o mesmo request_id e NAO autoriza outro dispatch');
const repetida = await reservarCotaIA(env, {
  userId: USER_ID,
  familia: 'openrouter',
  rota: '/chat',
  corpo: corpoB,
  limiteGlobal: 1000,
  limiteUsuario: 30,
});
checar('retry nao autoriza chamar o upstream de novo', repetida.permitido, false);
checar('retry explicitamente idempotente', repetida.estado, 'ja_reservado');
checar('mesmo request id enviado', chamadas[1].payload.p_request_id, idA);

console.log('\n4) familias sao independentes mesmo com request_id igual');
const whisper = await reservarCotaIA(env, {
  userId: USER_ID,
  familia: FAMILIAS_COTA_IA.WHISPER,
  requestId: idA,
  limiteGlobal: 10_000,
  limiteUsuario: 1_000,
  unidades: 94,
});
checar('Whisper ganha reserva propria', whisper.estado, 'permitido');
checar('familia Whisper no payload', chamadas[2].payload.p_familia, 'whisper');
checar('Whisper reserva neuronios, nao apenas 1 request', chamadas[2].payload.p_unidades, 94);

console.log('\n5) limites negam, mas retornam estado conhecido');
respostaForcada = [{
  estado: 'limite_global', dia: DIA, usados_global: 1000, usados_usuario: 12,
  limite_global: 1000, limite_usuario: 30,
  unidades: 1,
}];
const globalCheio = await reservarCotaIA(env, {
  userId: USER_ID, familia: 'openrouter', requestId: `${idA.slice(0, 63)}1`,
  limiteGlobal: 1000, limiteUsuario: 30,
});
checar('limite global bloqueia', { permitido: globalCheio.permitido, estado: globalCheio.estado },
  { permitido: false, estado: 'limite_global' });

respostaForcada = [{
  estado: 'limite_usuario', dia: DIA, usados_global: 90, usados_usuario: 30,
  limite_global: 1000, limite_usuario: 30,
  unidades: 1,
}];
const usuarioCheio = await reservarCotaIA(env, {
  userId: USER_ID, familia: 'openrouter', requestId: `${idA.slice(0, 63)}2`,
  limiteGlobal: 1000, limiteUsuario: 30,
});
checar('limite de usuario bloqueia', { permitido: usuarioCheio.permitido, estado: usuarioCheio.estado },
  { permitido: false, estado: 'limite_usuario' });

console.log('\n6) toda incerteza e fail-closed');
const antesInvalidos = chamadas.length;
checar('sem configuracao', await reservarCotaIA({} as any, {
  userId: USER_ID, familia: 'openrouter', requestId: idA, limiteGlobal: 10, limiteUsuario: 2,
}), { permitido: false, estado: 'indisponivel' });
checar('UUID invalido', await reservarCotaIA(env, {
  userId: 'nao-uuid', familia: 'openrouter', requestId: idA, limiteGlobal: 10, limiteUsuario: 2,
}), { permitido: false, estado: 'indisponivel' });
checar('familia invalida', await reservarCotaIA(env, {
  userId: USER_ID, familia: 'gemini', requestId: idA, limiteGlobal: 10, limiteUsuario: 2,
}), { permitido: false, estado: 'indisponivel' });
checar('limite usuario maior que global', await reservarCotaIA(env, {
  userId: USER_ID, familia: 'openrouter', requestId: idA, limiteGlobal: 2, limiteUsuario: 3,
}), { permitido: false, estado: 'indisponivel' });
checar('Whisper sem neuronios estimados fecha o gate', await reservarCotaIA(env, {
  userId: USER_ID, familia: 'whisper', requestId: idA, limiteGlobal: 10_000, limiteUsuario: 1_000,
}), { permitido: false, estado: 'indisponivel' });
checar('entradas invalidas nem chamam o banco', chamadas.length, antesInvalidos);

statusForcado = 500;
respostaForcada = null;
checar('HTTP 500 bloqueia', await reservarCotaIA(env, {
  userId: USER_ID, familia: 'openrouter', requestId: `${idA.slice(0, 63)}3`,
  limiteGlobal: 10, limiteUsuario: 2,
}), { permitido: false, estado: 'indisponivel' });

statusForcado = 200;
respostaForcada = [{ estado: 'talvez', dia: DIA, usados_global: 0, usados_usuario: 0,
  limite_global: 10, limite_usuario: 2, unidades: 1 }];
checar('estado desconhecido bloqueia', await reservarCotaIA(env, {
  userId: USER_ID, familia: 'openrouter', requestId: `${idA.slice(0, 63)}4`,
  limiteGlobal: 10, limiteUsuario: 2,
}), { permitido: false, estado: 'indisponivel' });

respostaForcada = [{ estado: 'permitido', dia: DIA, usados_global: 1, usados_usuario: 1,
  limite_global: 999, limite_usuario: 2, unidades: 1 }];
checar('limites divergentes bloqueiam', await reservarCotaIA(env, {
  userId: USER_ID, familia: 'openrouter', requestId: `${idA.slice(0, 63)}5`,
  limiteGlobal: 10, limiteUsuario: 2,
}), { permitido: false, estado: 'indisponivel' });

respostaForcada = [{ estado: 'permitido', dia: DIA, usados_global: 11, usados_usuario: 1,
  limite_global: 10, limite_usuario: 2, unidades: 1 }];
checar('permitido acima do teto bloqueia', await reservarCotaIA(env, {
  userId: USER_ID, familia: 'openrouter', requestId: `${idA.slice(0, 63)}7`,
  limiteGlobal: 10, limiteUsuario: 2,
}), { permitido: false, estado: 'indisponivel' });

lancarRede = true;
respostaForcada = null;
checar('excecao de rede bloqueia', await reservarCotaIA(env, {
  userId: USER_ID, familia: 'openrouter', requestId: `${idA.slice(0, 63)}6`,
  limiteGlobal: 10, limiteUsuario: 2,
}), { permitido: false, estado: 'indisponivel' });

console.log('\n7) o modulo nao registra prompt, PII ou erros brutos');
const fs = await import('node:fs/promises');
const fonte = await fs.readFile(new URL('../worker/src/iaQuota.js', import.meta.url), 'utf8');
checar('sem console/log no modulo', /console\.|\bprompt\s*[:=]/.test(fonte), false);

console.log('\n7b) gate de fallback reserva cada tentativa e falha fechado');
lancarRede = false;
statusForcado = 200;
respostaForcada = [{ estado: 'permitido', dia: DIA, usados_global: 1, usados_usuario: 1,
  limite_global: 40, limite_usuario: 10, unidades: 1 }];
const chamadasAntesGate = chamadas.length;
const gate = criarGateTentativasOpenRouter({
  ...env,
  OPENROUTER_GLOBAL_DAILY_LIMIT: '40',
  OPENROUTER_USER_DAILY_LIMIT: '10',
}, USER_ID);
await gate();
await gate();
checar('duas tentativas fazem duas reservas distintas', chamadas.length - chamadasAntesGate, 2);
verdadeiro('cada tentativa usa request_id UUID diferente',
  chamadas[chamadas.length - 1].payload.p_request_id !== chamadas[chamadas.length - 2].payload.p_request_id);

respostaForcada = [{ estado: 'limite_usuario', dia: DIA, usados_global: 5, usados_usuario: 10,
  limite_global: 40, limite_usuario: 10, unidades: 1 }];
let erroGate = null;
try {
  await gate();
} catch (erro) {
  erroGate = erro;
}
checar('limite vira erro tipado antes do fetch do modelo', erroGate?.name, 'CotaIAError');
checar('resultado saneado pode ser traduzido pelo roteador', reservaCotaDoErro(erroGate)?.estado, 'limite_usuario');

console.log('\n8) contrato estatico da migration: locks e acesso fechados');
const sql = await fs.readFile(
  new URL('../supabase/migrations/20260817_openrouter_quota_diaria.sql', import.meta.url), 'utf8');
const lockGlobal = sql.indexOf('select g.usados');
const lockUsuario = sql.indexOf('select u.usados');
verdadeiro('lock global existe e vem antes do lock do usuario',
  lockGlobal >= 0 && lockUsuario > lockGlobal);
verdadeiro('UPSERTs usam constraints nomeadas e evitam ambiguidade 42702 do RETURNS TABLE',
  sql.includes('on conflict on constraint ia_cota_global_diaria_pk do nothing') &&
  sql.includes('on conflict on constraint ia_cota_usuario_diaria_pk do nothing') &&
  !/on conflict \(dia, familia(?:, user_id)?\) do nothing/i.test(sql));
checar('tres tabelas com FORCE RLS', (sql.match(/force row level security/gi) ?? []).length, 3);
verdadeiro('RPC revogada de PUBLIC/anon/authenticated',
  /revoke all on function public\.reservar_cota_ia_diaria[\s\S]*?from public, anon, authenticated, service_role;/i.test(sql));
verdadeiro('somente service_role recebe EXECUTE',
  /grant execute on function public\.reservar_cota_ia_diaria[\s\S]*?to service_role;/i.test(sql));
for (const estado of ['permitido', 'ja_reservado', 'limite_global', 'limite_usuario']) {
  verdadeiro(`migration contem estado ${estado}`, sql.includes(`'${estado}'`));
}
verdadeiro('cota mensal serializa usuario/periodo/acao antes do COUNT',
  sql.indexOf('pg_advisory_xact_lock') >= 0 &&
  sql.indexOf('pg_advisory_xact_lock') < sql.indexOf('select pg_catalog.count(*)'));
verdadeiro('lock mensal deriva de usuario, periodo e acao',
  /hashtextextended\([\s\S]*?p_user::text[\s\S]*?v_periodo[\s\S]*?v_acao/i.test(sql));
verdadeiro('RPC mensal continua exclusiva da service_role',
  /revoke all on function public\.consumir_cota_ia[\s\S]*?from public, anon, authenticated, service_role;[\s\S]*?grant execute on function public\.consumir_cota_ia[\s\S]*?to service_role;/i.test(sql));

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
