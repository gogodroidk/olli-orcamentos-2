/**
 * Gate "sem segredos no repositório" (auditoria 29/09, item 7).
 *
 *     node scripts/teste-sem-segredos.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O bug que este teste tranca: a senha da conta demo (plano Empresa até 2036)
 * ficou em texto puro num .md, num repo que já foi público — e a limpeza
 * anterior "tirou dos 2 .md" mas esqueceu o terceiro, que ainda a citava ao
 * dizer que ela tinha sido removida. Revisão humana não pega isso; um grep pega.
 *
 * Varre SÓ o que está versionado (`git ls-files`), porque é o que vai pro
 * GitHub. Três estados, de propósito: se o git não responder, o teste FALHA —
 * "não consegui listar" não pode virar "não achei nada" (bug "erro vira vazio").
 *
 * Fixture de teste é permitida quando é CLARAMENTE falsa: o próprio valor diz
 * que é falso (`abc_prod_chave_falsa`, `re_synthetic_never_real`, ...). Uma
 * chave com cara de real não passa só por estar dentro de scripts/teste-*.
 * Segredo de verdade vai para o cofre local (credenciais-locais.env) ou para
 * `wrangler secret put` — no doc, escreva "(no cofre local)".
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

let falhas = 0;
let passes = 0;

function checar(nome: string, ok: boolean, detalhe = ''): void {
  if (ok) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`);
  }
}

// ── Padrões ──────────────────────────────────────────────────────────────────
// Cada um exige o CORPO do segredo (não só o prefixo): `APP_USR-...` e
// `(sk_live_...)` em doc explicando onde pegar a chave são legítimos.
type Padrao = { nome: string; re: RegExp; permitido?: (trecho: string) => boolean };

/** JWT do Supabase com role `anon` é público por natureza (vai no bundle). Qualquer outro — service_role ou ilegível — reprova. */
function jwtEhAnon(trecho: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(trecho.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return payload?.role === 'anon';
  } catch {
    return false; // não sei o que é → trata como segredo (fail-closed)
  }
}

const PADROES: Padrao[] = [
  // A senha da demo começa pelo nome da empresa; o padrão pega qualquer token
  // `GrTech…` sem soletrá-la aqui (o e-mail `demo@grtech.com.br` não casa: `.` ≠ `\w`).
  { nome: 'senha da conta demo', re: /\bGrTech\w{4,}/g },
  // `senha: "..."`, `"password": "..."`, `**Senha:** "..."` — a chave colada no `:`/`=`.
  // Atributo de form (`type="password"`, `placeholder="sua senha"`) não casa.
  { nome: 'senha literal em texto', re: /\b(?:senha|password|passwd)\b["'*]*\s*[:=]\**\s*[`'"][^`'"\s]{6,}[`'"]/gi },
  { nome: 'Stripe secret/restricted key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { nome: 'Stripe webhook secret (whsec_)', re: /\bwhsec_[A-Za-z0-9+/=]{20,}/g },
  { nome: 'Mercado Pago access token', re: /\b(?:APP_USR|TEST)-\d{6,}-\d{6}-[0-9a-f]{20,}-\d{4,}/g },
  { nome: 'AbacatePay API key', re: /\babc_(?:prod|dev)_[A-Za-z0-9_]{12,}/g },
  { nome: 'Resend API key (re_)', re: /\bre_[A-Za-z0-9_]{20,}/g },
  { nome: 'OpenRouter API key', re: /\bsk-or-v1-[A-Za-z0-9]{20,}/g },
  { nome: 'Supabase access token (sbp_)', re: /\bsbp_[A-Za-z0-9]{30,}/g },
  { nome: 'JWT (service_role/assinado)', re: /\beyJhbGci[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, permitido: jwtEhAnon },
  { nome: 'GitHub token', re: /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/g },
  { nome: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { nome: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}/g },
  { nome: 'chave privada PEM', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----\s*[A-Za-z0-9+/]{40,}/g },
];

/** O valor se declara falso — é fixture, não segredo. */
const MARCA_DE_FALSO = /falsa|falso|fake|invalid|synthetic|never_real|nunca_real|exemplo|example|dummy|placeholder|xxxx|local_pass/i;

/**
 * Arquivos inteiros de fixture. Só entra aqui o que é mock de template sem
 * ligação com conta real — cada linha com o motivo.
 */
const ARQUIVOS_FIXTURE: { prefixo: string; motivo: string }[] = [
  { prefixo: 'webapp/src/_mock/', motivo: 'usuários fictícios do template Slash (MSW), não existem no Supabase' },
];

const EXTENSOES_BINARIAS = /\.(png|jpe?g|gif|webp|avif|ico|icns|bmp|pdf|ttf|otf|woff2?|eot|mp3|mp4|m4a|wav|ogg|webm|mov|zip|gz|tgz|7z|jar|apk|aab|keystore|jks|p12|glb|gltf|bin|wasm|riv|psd|xcf|db|sqlite)$/i;
const LIMITE_BYTES = 5 * 1024 * 1024;

type Achado = { arquivo: string; linha: number; padrao: string; trecho: string };

/** Mostra só o começo: o relatório do gate não pode virar o vazamento. */
function mascarar(s: string): string {
  return s.length <= 10 ? `${s.slice(0, 3)}…` : `${s.slice(0, 8)}…(${s.length} chars)`;
}

function varrerTexto(arquivo: string, texto: string): Achado[] {
  const achados: Achado[] = [];
  for (const p of PADROES) {
    p.re.lastIndex = 0;
    for (const m of texto.matchAll(p.re)) {
      const trecho = m[0];
      if (MARCA_DE_FALSO.test(trecho)) continue;
      if (p.permitido?.(trecho)) continue;
      const linha = texto.slice(0, m.index ?? 0).split('\n').length;
      achados.push({ arquivo, linha, padrao: p.nome, trecho: mascarar(trecho) });
    }
  }
  return achados;
}

// ── 1) O detector funciona? (sem isso, "0 achados" não prova nada) ──────────
// Os segredos de prova são montados em runtime: se estivessem literais aqui,
// este arquivo seria um vazamento de mentira em toda varredura.
console.log('\n1) o detector pega o que deve e solta fixture falsa');
const j = (...partes: string[]) => partes.join('');
const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => j('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', '.', b64u({ iss: 'supabase', role, ref: 'x'.repeat(20) }), '.', 'a'.repeat(43));
const devePegar: [string, string][] = [
  ['senha da demo', j('a senha é GrTech', 'Qwe9999')],
  ['senha literal', j('senha: "', 'Abc12345', '"')],
  ['senha em markdown', j('**Senha:** `', 'Abc12345', '`')],
  ['stripe live', j('sk_', 'live_', 'A1b2C3d4E5f6G7h8I9j0')],
  ['whsec', j('whsec_', 'Q'.repeat(32))],
  ['mercado pago', j('APP_', 'USR-1234567890123456-092912-', 'ab12'.repeat(8), '-123456789')],
  ['abacatepay', j('abc_', 'prod_', 'Zk3Lm9Pq2Rs8Tv4W')],
  ['resend', j('re_', 'Ab12Cd34_EfGh56Ij78KlMn90OpQr')],
  ['openrouter', j('sk-or-', 'v1-', 'f'.repeat(64))],
  ['supabase pat', j('sbp_', '0a1b'.repeat(10))],
  ['jwt service_role', jwt('service_role')],
  ['pem', j('-----BEGIN PRIVATE ', 'KEY-----\n', 'MIGH'.repeat(20))],
];
for (const [nome, amostra] of devePegar) {
  checar(`pega ${nome}`, varrerTexto('amostra', amostra).length >= 1, `achados: ${varrerTexto('amostra', amostra).length}`);
}
const deveSoltar: [string, string][] = [
  ['fixture abacate falsa', j("ABACATEPAY_API_KEY: 'abc_", "prod_chave_falsa'")],
  ['fixture resend sintética', j("apiKey: 're_", "synthetic_never_real'")],
  ['doc com prefixo sem corpo', j('copiar o Access Token (`APP_', 'USR-...`) e o (sk_', 'live_...)')],
  ['JWT anon (público)', jwt('anon')],
  ['PEM montado em runtime', j('`-----BEGIN PRIVATE ', 'KEY-----\\n${pemB64}\\n`')],
  ['código que lê senha do form', 'password: values.password'],
  ['atributo de input', '<input id="senha" type="password" autoComplete="new-password" placeholder="sua senha"/>'],
  ['doc que aponta pro cofre', 'senha (no cofre local)'],
  ['e-mail da conta demo', 'conta demo (`demo@grtech.com.br`)'],
];
for (const [nome, amostra] of deveSoltar) {
  checar(`solta ${nome}`, varrerTexto('amostra', amostra).length === 0, JSON.stringify(varrerTexto('amostra', amostra)));
}

// ── 2) Lista o que está versionado — fail-closed ────────────────────────────
console.log('\n2) lista os arquivos versionados');
let arquivos: string[] | null = null;
try {
  const saida = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  arquivos = saida.split('\0').filter(Boolean);
} catch (e) {
  checar('git ls-files respondeu', false, `não consegui listar (${(e as Error).message}) — sem lista não dá para dizer que está limpo`);
}
if (arquivos) checar(`git ls-files listou arquivos (${arquivos.length})`, arquivos.length > 100, 'lista suspeita de vazia');

// ── 3) Varre ─────────────────────────────────────────────────────────────────
if (arquivos && arquivos.length > 100) {
  console.log('\n3) nenhum segredo em arquivo versionado');
  const achados: Achado[] = [];
  let lidos = 0;
  for (const arquivo of arquivos) {
    if (EXTENSOES_BINARIAS.test(arquivo)) continue;
    if (ARQUIVOS_FIXTURE.some((f) => arquivo.startsWith(f.prefixo))) continue;
    const caminho = join(RAIZ, arquivo);
    let buf: Buffer;
    try {
      if (statSync(caminho).size > LIMITE_BYTES) continue;
      buf = readFileSync(caminho);
    } catch {
      continue; // versionado mas apagado no working tree (ex.: deleção não commitada)
    }
    if (buf.subarray(0, 8000).includes(0)) continue; // binário sem extensão conhecida
    lidos++;
    achados.push(...varrerTexto(arquivo, buf.toString('utf8')));
  }
  checar(`leu arquivos de texto (${lidos})`, lidos > 100);
  checar(
    'zero segredos',
    achados.length === 0,
    achados.map((a) => `${a.arquivo}:${a.linha}  [${a.padrao}]  ${a.trecho}`).join('\n        ') +
      '\n        → troque o valor por "(no cofre local)" e guarde-o em credenciais-locais.env / wrangler secret.',
  );
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
