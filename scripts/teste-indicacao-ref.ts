import {
  type AmbienteRef,
  capturarRef,
  CHAVE_REF,
  gravarRef,
  lerRef,
  lerRefDaUrl,
  limparRef,
  normalizarRef,
  reiniciarTentativaIndicacao,
  vincularIndicacaoPendente,
} from '../web/src/lib/indicacaoRef.ts';

console.log('\nIndicação — captura e vínculo do ?ref=');

let falhas = 0;
function checar(nome: string, ok: boolean): void {
  if (ok) console.log(`  ok   ${nome}`);
  else {
    falhas++;
    console.log(`  FALHA ${nome}`);
  }
}

const DIA = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 7, 12, 0, 0);

function criarAmbiente(host = 'olliorcamentos.online', protocolo = 'https:') {
  const estado = { local: null as string | null, cookies: new Map<string, string>(), gravados: [] as string[] };
  const amb: AmbienteRef = {
    host,
    protocolo,
    lerCookies: () => [...estado.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
    gravarCookie: (c) => {
      estado.gravados.push(c);
      const [par] = c.split(';');
      const i = par.indexOf('=');
      const nome = par.slice(0, i);
      if (/Max-Age=0(;|$)/.test(c)) estado.cookies.delete(nome);
      else estado.cookies.set(nome, par.slice(i + 1));
    },
    lerLocal: () => estado.local,
    gravarLocal: (v) => {
      estado.local = v;
    },
    apagarLocal: () => {
      estado.local = null;
    },
  };
  return { amb, estado };
}

// Normalização
checar('normaliza minúsculas e espaços', normalizarRef('  k7m2qx ') === 'K7M2QX');
checar('rejeita 5 chars', normalizarRef('K7M2Q') === null);
checar('rejeita 7 chars', normalizarRef('K7M2QXX') === null);
checar('rejeita símbolo', normalizarRef('K7M2Q-') === null);
checar('rejeita formato antigo ref:OLLI-', normalizarRef('ref:OLLI-ABC') === null);
checar('rejeita não-string', normalizarRef(undefined) === null && normalizarRef(123) === null);
checar('lê da URL', lerRefDaUrl('?utm_source=x&ref=k7m2qx') === 'K7M2QX');
checar('URL sem ref = null', lerRefDaUrl('?utm_source=x') === null && lerRefDaUrl('') === null);
checar('URL com ref inválido = null', lerRefDaUrl('?ref=<script>') === null);

// Sem ref não grava
{
  const { amb, estado } = criarAmbiente();
  checar('visita sem ref não grava', capturarRef(amb, '?utm_source=meta', T0) === null && estado.local === null && estado.gravados.length === 0);
}

// Grava, cookie com Domain, lê
{
  const { amb, estado } = criarAmbiente('www.olliorcamentos.online');
  checar('captura devolve código', capturarRef(amb, '?ref=k7m2qx', T0) === 'K7M2QX');
  checar('localStorage <COD>.<ts>', estado.local === `K7M2QX.${T0}`);
  const c = estado.gravados[0];
  checar('cookie olli_ref com Domain', c.startsWith(`${CHAVE_REF}=`) && c.includes('Domain=.olliorcamentos.online'));
  checar('cookie SameSite=Lax + Secure em https + 30d', c.includes('SameSite=Lax') && c.includes('; Secure') && c.includes(`Max-Age=${30 * 86400}`));
  checar('não mistura com olli_attr', !c.includes('olli_attr'));
  checar('lerRef acha', lerRef(amb, T0 + DIA) === 'K7M2QX');
  checar('vale em 29 dias', lerRef(amb, T0 + 29 * DIA) === 'K7M2QX');
  checar('expira após 30 dias', lerRef(amb, T0 + 31 * DIA) === null);
  limparRef(amb);
  checar('limpar apaga local e cookie', estado.local === null && estado.cookies.size === 0 && lerRef(amb, T0) === null);
}

// Só cookie (painel sem localStorage da landing) e só local
{
  const { amb, estado } = criarAmbiente();
  gravarRef(amb, 'ABC123', T0);
  estado.local = null;
  checar('lê só do cookie', lerRef(amb, T0) === 'ABC123');
  const b = criarAmbiente();
  b.estado.local = `ZZ99ZZ.${T0}`;
  checar('lê só do localStorage', lerRef(b.amb, T0) === 'ZZ99ZZ');
  const c = criarAmbiente();
  c.estado.local = 'lixo';
  checar('lixo no storage = null', lerRef(c.amb, T0) === null);
  const d = criarAmbiente();
  d.estado.local = `ABC123.${T0 + 5 * DIA}`;
  checar('timestamp do futuro = null', lerRef(d.amb, T0) === null);
}

// localhost: sem Domain nem Secure
{
  const { amb, estado } = criarAmbiente('localhost', 'http:');
  gravarRef(amb, 'ABC123', T0);
  checar('localhost sem Domain/Secure', !estado.gravados[0].includes('Domain=') && !estado.gravados[0].includes('Secure'));
  checar('gravarRef rejeita inválido', gravarRef(amb, 'x', T0) === false);
}

// Vínculo
function fetchFalso(status: number | 'rede') {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    if (status === 'rede') throw new TypeError('network');
    return new Response('{}', { status });
  }) as unknown as typeof fetch;
  return { chamadas, impl };
}

async function vincular() {
  {
    reiniciarTentativaIndicacao();
    const { amb, estado } = criarAmbiente();
    gravarRef(amb, 'K7M2QX', T0);
    const f = fetchFalso(200);
    await vincularIndicacaoPendente('jwt-x', { worker: 'https://w.test/', ambiente: amb, agoraMs: T0, fetchImpl: f.impl });
    checar('POST em /indicacao/vincular com Bearer e codigo',
      f.chamadas.length === 1 && f.chamadas[0].url === 'https://w.test/indicacao/vincular' &&
      (f.chamadas[0].init.headers as Record<string, string>).Authorization === 'Bearer jwt-x' &&
      f.chamadas[0].init.body === JSON.stringify({ codigo: 'K7M2QX' }));
    checar('200 limpa o ref', estado.local === null && estado.cookies.size === 0);
  }
  {
    reiniciarTentativaIndicacao();
    const { amb } = criarAmbiente();
    gravarRef(amb, 'K7M2QX', T0);
    const f = fetchFalso(503);
    await vincularIndicacaoPendente('jwt', { worker: 'https://w.test', ambiente: amb, agoraMs: T0, fetchImpl: f.impl });
    checar('503 mantém o ref', lerRef(amb, T0) === 'K7M2QX');
    await vincularIndicacaoPendente('jwt', { worker: 'https://w.test', ambiente: amb, agoraMs: T0, fetchImpl: f.impl });
    checar('uma tentativa só por carga', f.chamadas.length === 1);
  }
  {
    reiniciarTentativaIndicacao();
    const { amb } = criarAmbiente();
    gravarRef(amb, 'K7M2QX', T0);
    const f = fetchFalso('rede');
    await vincularIndicacaoPendente('jwt', { worker: 'https://w.test', ambiente: amb, agoraMs: T0, fetchImpl: f.impl });
    checar('falha de rede não lança e mantém', lerRef(amb, T0) === 'K7M2QX');
  }
  {
    reiniciarTentativaIndicacao();
    const { amb } = criarAmbiente();
    const f = fetchFalso(200);
    await vincularIndicacaoPendente('jwt', { worker: 'https://w.test', ambiente: amb, agoraMs: T0, fetchImpl: f.impl });
    checar('sem ref não chama o worker', f.chamadas.length === 0);
    gravarRef(amb, 'K7M2QX', T0);
    await vincularIndicacaoPendente(null, { worker: 'https://w.test', ambiente: amb, agoraMs: T0, fetchImpl: f.impl });
    checar('sem token não chama o worker', f.chamadas.length === 0);
  }
}

await vincular();

if (falhas > 0) {
  console.log(`\n${falhas} FALHA(S)`);
  process.exit(1);
}
console.log('\nPASSOU: normalização, expiração 30d, sem-ref não grava, cookie com Domain, limpar e vínculo.');
