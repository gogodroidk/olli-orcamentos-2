/**
 * Teste dos arquivos que o `app.json` promete existir.
 *
 *     node scripts/teste-assets-app.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * POR QUE ISTO EXISTE (21/07/2026): 27 arquivos de `assets/` sumiram do disco
 * desta árvore — `icon.png`, `splash-icon.png`, os ícones adaptativos do
 * Android, `codigos_erro.json` e as 8 capturas da Play. Estavam rastreados pelo
 * git, então `git status` sabia; ninguém olhou. A causa nunca foi identificada.
 *
 * O que torna essa falha cara não é sumir — é sumir CALADO. O `tsc` não lê
 * `app.json`. O `expo-doctor` não confere se o caminho aponta para um arquivo
 * vivo. O gradle segue em frente e entrega um APK com o ícone padrão do Expo:
 * você só descobre quando o app já está no celular, com a marca errada, ou
 * quando a Play recusa a submissão.
 *
 * O teste não tenta adivinhar QUAIS assets deveriam existir — ele lê os
 * caminhos DO PRÓPRIO `app.json` e cobra cada um. Assim ele acompanha sozinho
 * quem acrescentar um ícone novo amanhã, e não vira uma lista para envelhecer.
 *
 * ARQUIVO VAZIO OU TRUNCADO TAMBÉM É FALHA. Na mesma leva apareceram pacotes
 * de `node_modules` com a pasta presente e o conteúdo pela metade — a corrupção
 * desta máquina apaga POR DENTRO. "O caminho existe" seria uma verificação que
 * passa exatamente no caso que queremos pegar, então conferimos os bytes
 * iniciais: PNG tem assinatura fixa, JSON tem que parsear.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');

let falhas = 0;
let passes = 0;

function checar(nome: string, condicao: boolean, detalhe = ''): void {
  if (condicao) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`);
  }
}

/**
 * Varre o `app.json` inteiro atrás de qualquer string que pareça caminho de
 * asset local. Deliberadamente recursivo e cego à forma do objeto: a estrutura
 * do `app.json` muda entre versões do Expo (o `splash` virou plugin no SDK 52+,
 * os ícones adaptativos moraram em dois lugares diferentes), e uma lista de
 * chaves fixas silenciaria justamente quando a estrutura mudasse.
 */
function caminhosDeAsset(valor: unknown, ondeEstou: string, achados: Map<string, string>): void {
  if (typeof valor === 'string') {
    if (valor.startsWith('./assets/') || valor.startsWith('assets/')) {
      achados.set(valor, ondeEstou);
    }
    return;
  }
  if (Array.isArray(valor)) {
    valor.forEach((item, i) => caminhosDeAsset(item, `${ondeEstou}[${i}]`, achados));
    return;
  }
  if (valor && typeof valor === 'object') {
    for (const [chave, sub] of Object.entries(valor)) {
      caminhosDeAsset(sub, ondeEstou ? `${ondeEstou}.${chave}` : chave, achados);
    }
  }
}

console.log('\n1) o app.json em si está legível');
let appJson: unknown;
try {
  appJson = JSON.parse(readFileSync(join(RAIZ, 'app.json'), 'utf8'));
  checar('app.json parseia', true);
} catch (e) {
  checar('app.json parseia', false, String(e));
  console.log(`\nFALHOU: ${passes} ok, ${falhas} falha(s)\n`);
  process.exit(1);
}

const achados = new Map<string, string>();
caminhosDeAsset(appJson, '', achados);

console.log(`\n2) os ${achados.size} caminhos que o app.json promete`);
// Se este número cair para zero, algo quebrou na varredura e o teste passaria
// vazio — "não achei nada para conferir" jamais pode ser lido como "está tudo
// certo". É a mesma regra dos 3 estados que vale no resto do produto.
checar('a varredura achou caminhos (senão o teste é decorativo)', achados.size > 0, `achados: ${achados.size}`);

for (const [caminho, onde] of achados) {
  const absoluto = join(RAIZ, caminho.replace(/^\.\//, ''));
  let bytes: Buffer | null = null;
  try {
    bytes = readFileSync(absoluto);
  } catch {
    bytes = null;
  }

  if (!bytes) {
    checar(`${caminho} existe`, false, `referenciado em ${onde} — arquivo ausente em ${absoluto}`);
    continue;
  }

  checar(`${caminho} existe e não está vazio`, bytes.length > 0, `referenciado em ${onde}`);

  // Conteúdo, não só tamanho: a corrupção desta máquina deixou arquivos com a
  // casca e sem o miolo.
  if (caminho.endsWith('.png')) {
    const assinaturaPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    checar(
      `${caminho} é PNG de verdade`,
      bytes.subarray(0, 8).equals(assinaturaPng),
      `primeiros bytes: ${bytes.subarray(0, 8).toString('hex')}`,
    );
  } else if (caminho.endsWith('.json')) {
    let ok = false;
    try {
      JSON.parse(bytes.toString('utf8'));
      ok = true;
    } catch { /* ok segue false */ }
    checar(`${caminho} é JSON válido`, ok);
  }
}

/**
 * 3) os assets citados DENTRO do código.
 *
 * O `app.json` não é a única porta: `database.ts` faz
 * `require('../../assets/codigos_erro.json')` — 365 KB de catálogo de códigos de
 * erro, carregado sob demanda. Nenhum gate atual enxerga esse caminho: o `tsc`
 * não segue `require`, o `expo-doctor` não lê o corpo dos arquivos, e o próprio
 * `require` só é executado quando o usuário abre a busca por código, já com o
 * app instalado. Foi um dos 27 arquivos que sumiram.
 */
console.log('\n3) assets citados no código-fonte de src/');
const arquivosFonte: string[] = [];
function varrer(dir: string): void {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, item.name);
    if (item.isDirectory()) varrer(caminho);
    else if (/\.tsx?$/.test(item.name)) arquivosFonte.push(caminho);
  }
}
varrer(join(RAIZ, 'src'));

const citados = new Map<string, string>(); // caminho absoluto -> quem cita
for (const arquivo of arquivosFonte) {
  const texto = readFileSync(arquivo, 'utf8');
  // Só literais de import/require: um `assets/...` solto em comentário não é
  // dependência de execução, e cobrar por ele daria falha falsa.
  for (const m of texto.matchAll(/(?:require|from)\s*\(?\s*['"]([^'"]*assets\/[^'"]+)['"]/g)) {
    citados.set(resolve(arquivo, '..', m[1]), arquivo.slice(RAIZ.length + 1));
  }
}

checar('a varredura de src/ achou citações (senão o teste é decorativo)', citados.size > 0, `achados: ${citados.size}`);
for (const [absoluto, quemCita] of citados) {
  let bytes: Buffer | null = null;
  try {
    bytes = readFileSync(absoluto);
  } catch {
    bytes = null;
  }
  const curto = absoluto.slice(RAIZ.length + 1).replace(/\\/g, '/');
  if (!bytes) {
    checar(`${curto} existe`, false, `citado em ${quemCita}`);
    continue;
  }
  checar(`${curto} existe e não está vazio`, bytes.length > 0, `citado em ${quemCita}`);
  if (absoluto.endsWith('.json')) {
    let itens: number | null = null;
    try {
      const dados = JSON.parse(bytes.toString('utf8'));
      itens = Array.isArray(dados) ? dados.length : -1;
    } catch { /* itens segue null */ }
    checar(`${curto} é JSON válido`, itens !== null);
    // Um array VAZIO passa em "existe" e em "é JSON válido" e ainda assim deixa
    // o app sem catálogo — exatamente o ramo silencioso que database.ts:590
    // agora denuncia. Se é array, tem que trazer conteúdo.
    if (itens !== null && itens >= 0) {
      checar(`${curto} não é um array vazio`, itens > 0, `itens: ${itens}`);
    }
  }
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
