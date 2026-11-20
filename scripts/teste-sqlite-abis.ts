/**
 * expo-sqlite TEM QUE TRAZER A BIBLIOTECA NATIVA DE TODAS AS ABIs (achado do BUILD, 20/11/2026).
 *
 *     node scripts/teste-sqlite-abis.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O `expo-sqlite@57.0.5` saiu com o AAR pré-compilado SÓ com `jni/arm64-v8a/libexpo-sqlite.so`; o 57.0.4 (o do 1.2.2,
 * que está na Play) traz arm64-v8a, armeabi-v7a, x86 e x86_64. Com a 57.0.5, o AAB 1.3.0 saiu com a lib só em
 * 64-bit ARM: em aparelho de sistema 32-bit (armeabi-v7a, comum em entrada) e em x86/x86_64 o banco não abre
 * (`UnsatisfiedLinkError: library "libexpo-sqlite.so" not found`) e o app nem passa do login.
 * Sem erro de compilação, sem aviso: só aparece rodando num aparelho dessa ABI.
 *
 *  1. package.json fixa o expo-sqlite numa versão EXATA (sem ^ nem ~): atualização é decisão, não acidente.
 *  2. O package-lock concorda com o package.json.
 *  3. Se o pacote está instalado (node_modules), o AAR dele tem a lib das 4 ABIs. Sem node_modules ou sem `unzip`
 *     (máquina de CI enxuta), este passo avisa e não reprova; o 1 e o 2 valem sempre.
 *
 * Ao subir a versão do expo-sqlite: rode este teste com a versão nova instalada ANTES de mudar o pin.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
const raiz = new URL('../', import.meta.url).pathname;
const json = (p: string) => JSON.parse(readFileSync(join(raiz, p), 'utf8'));

const ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];

const pkg = json('package.json');
const pedida: string = pkg.dependencies?.['expo-sqlite'] ?? '';
ok(`package.json fixa o expo-sqlite numa versão exata (está "${pedida}")`, /^\d+\.\d+\.\d+$/.test(pedida));

const lock = json('package-lock.json');
const noLock: string = lock.packages?.['node_modules/expo-sqlite']?.version ?? '';
ok(`package-lock concorda (${noLock})`, noLock === pedida);
ok('a dependência declarada na raiz do lock concorda', lock.packages?.['']?.dependencies?.['expo-sqlite'] === pedida);

const pasta = join(raiz, 'node_modules/expo-sqlite/local-maven-repo');
let aar: string | null = null;
try {
  if (existsSync(pasta)) {
    const alvo = join(pasta, 'host/exp/exponent/expo.modules.sqlite');
    for (const v of readdirSync(alvo)) {
      const f = join(alvo, v, `expo.modules.sqlite-${v}.aar`);
      if (existsSync(f)) aar = f;
    }
  }
} catch {
  aar = null;
}

if (!aar) {
  console.log('aviso: expo-sqlite não está em node_modules (ou sem AAR pré-compilado); passo das ABIs não rodou');
} else {
  let listagem = '';
  try {
    listagem = execFileSync('unzip', ['-Z1', aar], { encoding: 'utf8' });
  } catch {
    listagem = '';
  }
  if (!listagem) {
    console.log('aviso: sem `unzip` para abrir o AAR; passo das ABIs não rodou');
  } else {
    const versaoInstalada = JSON.parse(readFileSync(join(raiz, 'node_modules/expo-sqlite/package.json'), 'utf8')).version;
    ok(`node_modules tem a versão pedida (${versaoInstalada})`, versaoInstalada === pedida);
    for (const abi of ABIS) {
      ok(`AAR do expo-sqlite tem libexpo-sqlite.so para ${abi}`, listagem.split('\n').includes(`jni/${abi}/libexpo-sqlite.so`));
    }
  }
}

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
