/**
 * Teste do roteamento de MÉTODO x EXISTÊNCIA no worker (achado A4 de
 * docs/ENXAME/POS_DEPLOY.md):
 * "404 é 'não existe' e 405 é 'existe, com outro verbo' — e o roteador tem que
 * decidir a EXISTÊNCIA antes do MÉTODO."
 *
 *     node scripts/teste-rotas-metodo.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * ─── O DEFEITO, MEDIDO EM PRODUÇÃO ─────────────────────────────────────────
 *     $ curl https://diagnostico.olliorcamentos.online/rota-que-nao-existe-teste
 *     405 {"ok":false,"erro":"metodo_nao_suportado"}
 *
 * O roteador de topo tinha um `if (request.method !== 'POST') return 405` como
 * rede final: qualquer GET que não casasse com nada acima virava "método
 * errado". Além de ser falso (não há verbo que faça aquele path funcionar), 405
 * é uma afirmação sobre um recurso EXISTENTE — respondê-lo a um path inventado
 * entrega a quem varre o serviço a informação de que ali existe alguma coisa.
 *
 * `mercadopago.js:744` e `abacate.js:270` já faziam certo (`ROUTES.has(p) ? 405
 * : 404`). O roteador de topo era o único que faltava.
 *
 * ─── POR QUE TESTAR `metodosDaRota` E NÃO O ROTEADOR INTEIRO ───────────────
 * `worker/src/index.js` importa @sentry/cloudflare, que só existe em
 * worker/node_modules e está fora do `npm ci` da raiz — a mesma razão pela qual
 * `voz.js`, `creditos.js` e `util.js` já são módulos-folha. A tabela mora em
 * util.js e é pura, então o teste a exercita de verdade; e a seção 3 lê o texto
 * de index.js para garantir que ela não se descole de quem a usa (o risco real
 * aqui não é a função errar, é alguém acrescentar uma rota e esquecer a tabela —
 * o que faria a rota nova responder 404 em produção).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { metodosDaRota } from '../worker/src/util.js';

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

const AQUI = dirname(fileURLToPath(import.meta.url));
const INDEX = readFileSync(join(AQUI, '..', 'worker', 'src', 'index.js'), 'utf8');

/**
 * Reproduz a decisão do roteador a partir da tabela — as MESMAS três linhas de
 * index.js, para poder afirmar o STATUS e o header `Allow`, não só a tabela.
 */
function decidir(pathname: string, metodo: string): { status: number; allow?: string } {
  const aceitos = metodosDaRota(pathname);
  if (!aceitos) return { status: 404 };
  if (!aceitos.split(', ').includes(metodo)) return { status: 405, allow: aceitos };
  return { status: 200 };
}

console.log('\n1) o defeito A4: path inexistente responde 404, com QUALQUER verbo');
// O ponto do achado. Antes, todos estes davam 405 (menos o POST, que dava 401
// depois de gastar uma validação de token à toa).
for (const metodo of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
  checar(`${metodo} /rota-que-nao-existe-teste → 404`, decidir('/rota-que-nao-existe-teste', metodo), { status: 404 });
}
checar('e 404 NÃO manda Allow (não há o que permitir)', decidir('/nada', 'GET').allow, undefined);
checar('path que só PARECE com uma rota real também é 404', decidir('/vozz', 'POST'), { status: 404 });
checar('prefixo incompleto não vira rota (/cep sem barra)', decidir('/cep', 'GET'), { status: 404 });

console.log('\n2) rota que EXISTE com verbo errado: 405 + Allow dizendo qual serve');
checar('GET /voz → 405 Allow: POST', decidir('/voz', 'GET'), { status: 405, allow: 'POST' });
checar('DELETE /transcrever → 405 Allow: POST', decidir('/transcrever', 'DELETE'), { status: 405, allow: 'POST' });
checar('POST /cep/01001000 → 405 Allow: GET', decidir('/cep/01001000', 'POST'), { status: 405, allow: 'GET' });
checar('POST /feriados/2026 → 405 Allow: GET', decidir('/feriados/2026', 'POST'), { status: 405, allow: 'GET' });
checar('PUT /eta → 405 Allow: POST', decidir('/eta', 'PUT'), { status: 405, allow: 'POST' });

console.log('\n3) o que deve PASSAR continua passando (nenhuma rota viva quebrou)');
// A regressão que este conserto poderia causar é pior que o defeito que ele
// corrige: uma rota real respondendo 404. Aqui está cada uma, com seu verbo.
const vivas: [string, string][] = [
  ['/', 'GET'],   // health público
  ['/', 'POST'],  // diagnóstico por IA — o mesmo path, dois usos
  ['/voz', 'POST'],
  ['/voz/conversa', 'POST'],
  ['/chat', 'POST'],
  ['/transcrever', 'POST'],
  ['/eta', 'POST'],
  ['/eta/saida', 'POST'],
  ['/geocodificar', 'POST'],
  ['/cep/01001000', 'GET'],
  ['/cnpj/33000167000101', 'GET'],
  ['/feriados/2026', 'GET'],
];
for (const [p, m] of vivas) {
  checar(`${m} ${p} passa`, decidir(p, m).status, 200);
}

console.log('\n4) a tabela não pode se descolar do roteador que a usa');
// O risco real não é a função errar: é alguém acrescentar uma rota em index.js e
// esquecer a tabela, e a rota nova nascer respondendo 404 em produção. Estas
// asserções leem index.js e cobram o pareamento.
{
  // As delegadas respondem o próprio 405 e retornam antes da tabela — por isso
  // não entram nela. Ficam listadas para o próximo leitor saber que a ausência é
  // decisão, não esquecimento. `/admin` aparece nas DUAS formas em index.js
  // (`=== '/admin'` para a tela e `startsWith('/admin/')` para a API), e foi
  // isto que a primeira versão desta seção deixou passar.
  const DELEGADAS_EXATAS = ['/admin'];
  const DELEGADAS = ['/admin/', '/stripe/', '/abacate/', '/mp/', '/equipe/', '/conta/', '/o/', '/q/'];

  // Rotas resolvidas no roteador de topo por igualdade de path.
  const exatas = new Set(
    [...INDEX.matchAll(/url\.pathname === '([^']+)'/g)].map((m) => m[1]),
  );
  for (const p of exatas) {
    if (DELEGADAS_EXATAS.includes(p)) {
      checar(`'${p}' é delegada (handleAdmin cuida do método) — fora da tabela, de propósito`, metodosDaRota(p), null);
    } else {
      checar(`index.js trata '${p}' e a tabela conhece`, metodosDaRota(p) !== null, true);
    }
  }

  const prefixos = [...INDEX.matchAll(/url\.pathname\.startsWith\('([^']+)'\)/g)].map((m) => m[1]);
  for (const p of new Set(prefixos)) {
    if (DELEGADAS.includes(p)) {
      checar(`'${p}' é delegada (responde o próprio 405) — fora da tabela, de propósito`, metodosDaRota(`${p}x`), null);
    } else {
      checar(`index.js trata a família '${p}' e a tabela conhece`, metodosDaRota(`${p}x`) !== null, true);
    }
  }

  // E o roteador tem que estar decidindo nesta ordem — existência, depois método.
  checar(
    'index.js responde nao_encontrado ANTES de metodo_nao_suportado',
    INDEX.indexOf("erro: 'nao_encontrado' }, 404") < INDEX.indexOf("erro: 'metodo_nao_suportado' }, 405"),
    true,
  );
  checar('e o 405 do roteador manda Allow', /metodo_nao_suportado' \}, 405, \{ Allow: metodosAceitos \}/.test(INDEX), true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
