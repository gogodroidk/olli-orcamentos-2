#!/usr/bin/env node
/**
 * Gate de lint com CATRACA. Roda no `preflight` e no job `lint` do CI.
 *
 *     npm run lint           → reprova só se apareceu erro NOVO
 *     npm run lint:base      → regrava a base (depois de consertar erros antigos)
 *
 * ─── POR QUE CATRACA, E NÃO "ZERO ERRO" ────────────────────────────────────
 * Em 29/09/2026 o Biome (regras recomendadas) acha 173 erros no app e 58 no
 * painel — todos anteriores ao gate. Exigir zero agora deixaria o CI vermelho
 * até alguém reescrever 100 hooks do React de uma vez; desligar as regras
 * esconderia os erros novos junto com os velhos. A catraca congela o que já
 * existe em `scripts/lint-base.json` (contagem por arquivo × regra) e reprova
 * qualquer contagem que SUBA. Consertar erro antigo nunca reprova: o gate só
 * avisa que a base pode apertar.
 *
 * A contagem é por arquivo × regra, não por linha: linha muda a cada edição e
 * transformaria a base em ruído. O custo é aceito — trocar um erro antigo por
 * um novo da MESMA regra no MESMO arquivo passa despercebido.
 *
 * ─── FAIL-CLOSED ───────────────────────────────────────────────────────────
 * "O Biome não rodou" não é "o Biome não achou nada" (o bug da casa: o erro
 * vira vazio). Saída 1 sem nenhum diagnóstico, qualquer outra saída diferente
 * de 0/1, ou alvo que some da base → reprova.
 *
 * Só erros entram na conta. Avisos (`useImportType`, `noImplicitAnyLet`…) ficam
 * para quem quiser rodar `npx biome lint` à mão.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ARQUIVO_BASE = join(RAIZ, 'scripts', 'lint-base.json');

/**
 * Onde o Biome roda. Cada alvo usa o `biome.json` da própria pasta: o painel
 * já tinha o seu (tabs, aspas duplas); o app ganhou um na raiz, só com lint.
 */
export const ALVOS = [
  { nome: 'app', pasta: '.' },
  { nome: 'painel', pasta: 'webapp' },
];

/**
 * Lê a saída `--reporter=github` do Biome. Uma linha por diagnóstico:
 *   ::error title=lint/x/y,file=src/a.ts,line=3,endLine=3,col=1,endColumn=9::mensagem
 * Barra invertida vira barra: a base tem de ser a mesma no Windows e no CI.
 */
export function lerDiagnosticos(saida) {
  const diagnosticos = [];
  for (const linha of saida.split(/\r?\n/)) {
    const m = /^::error title=([^,]+),file=(.+?),line=(\d+),.*?::(.*)$/.exec(linha);
    if (!m) continue;
    diagnosticos.push({ regra: m[1], arquivo: m[2].replace(/\\/g, '/'), linha: Number(m[3]), mensagem: m[4] });
  }
  return diagnosticos;
}

/** `{ arquivo: { regra: n } }`, com chaves ordenadas para a base não oscilar. */
export function contar(diagnosticos) {
  const contagem = {};
  for (const { arquivo, regra } of diagnosticos) {
    contagem[arquivo] ??= {};
    contagem[arquivo][regra] = (contagem[arquivo][regra] ?? 0) + 1;
  }
  const ordenado = {};
  for (const arquivo of Object.keys(contagem).sort()) {
    ordenado[arquivo] = {};
    for (const regra of Object.keys(contagem[arquivo]).sort()) ordenado[arquivo][regra] = contagem[arquivo][regra];
  }
  return ordenado;
}

/**
 * Compara a contagem atual com a base. `novos` reprova; `melhoras` só avisa.
 * Arquivo ou regra ausente da base vale 0 — arquivo novo nasce limpo.
 */
export function comparar(base, atual) {
  const novos = [];
  const melhoras = [];
  const arquivos = new Set([...Object.keys(base ?? {}), ...Object.keys(atual ?? {})]);
  for (const arquivo of [...arquivos].sort()) {
    const regras = new Set([...Object.keys(base?.[arquivo] ?? {}), ...Object.keys(atual?.[arquivo] ?? {})]);
    for (const regra of [...regras].sort()) {
      const antes = base?.[arquivo]?.[regra] ?? 0;
      const agora = atual?.[arquivo]?.[regra] ?? 0;
      if (agora > antes) novos.push({ arquivo, regra, antes, agora });
      else if (agora < antes) melhoras.push({ arquivo, regra, antes, agora });
    }
  }
  return { novos, melhoras };
}

/**
 * Roda o Biome da raiz (`@biomejs/biome`, versão cravada igual à do painel)
 * dentro da pasta do alvo. Devolve os diagnósticos ou LANÇA — nunca `[]` por
 * engano.
 */
function rodarBiome(pasta) {
  const bin = createRequire(join(RAIZ, 'package.json')).resolve('@biomejs/biome/bin/biome');
  const args = [bin, 'lint', '--reporter=github', '--diagnostic-level=error', '--max-diagnostics=none'];
  let saida;
  try {
    saida = execFileSync(process.execPath, args, {
      cwd: join(RAIZ, pasta),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (erro) {
    if (erro.status !== 1) {
      throw new Error(`Biome não rodou em ${pasta} (saída ${erro.status}): ${String(erro.stderr ?? erro.message).slice(0, 800)}`);
    }
    saida = String(erro.stdout ?? '');
    if (lerDiagnosticos(saida).length === 0) {
      throw new Error(`Biome saiu com 1 em ${pasta} sem diagnóstico legível: ${String(erro.stderr ?? '').slice(0, 800)}`);
    }
  }
  return lerDiagnosticos(saida);
}

function principal() {
  const atualizar = process.argv.includes('--atualizar-base');
  const atual = {};
  const diagnosticos = {};
  for (const { nome, pasta } of ALVOS) {
    diagnosticos[nome] = rodarBiome(pasta);
    atual[nome] = contar(diagnosticos[nome]);
  }

  if (atualizar) {
    const conteudo = {
      _leia: 'Gerado por `npm run lint:base`. Erros do Biome que já existiam, por arquivo × regra. O gate reprova se alguma contagem subir; não edite à mão.',
      ...atual,
    };
    writeFileSync(ARQUIVO_BASE, `${JSON.stringify(conteudo, null, 2)}\n`);
    for (const { nome } of ALVOS) console.log(`  ${nome}: ${diagnosticos[nome].length} erro(s) congelados na base`);
    console.log(`\nBase regravada em scripts/lint-base.json.`);
    return 0;
  }

  const base = JSON.parse(readFileSync(ARQUIVO_BASE, 'utf8'));
  let falhas = 0;
  for (const { nome } of ALVOS) {
    if (!base[nome]) {
      // Alvo sem base = catraca sem trava. Não é "zero erro", é "não sei".
      console.error(`  FALHA  ${nome}: ausente de scripts/lint-base.json — rode \`npm run lint:base\``);
      falhas++;
      continue;
    }
    const { novos, melhoras } = comparar(base[nome], atual[nome]);
    console.log(`  ${nome}: ${diagnosticos[nome].length} erro(s) no total, ${novos.length} regressão(ões)`);
    for (const { arquivo, regra, antes, agora } of novos) {
      falhas++;
      const pasta = ALVOS.find((a) => a.nome === nome).pasta;
      console.error(`  FALHA  ${join(pasta, arquivo).replace(/\\/g, '/')}  ${regra}: ${antes} → ${agora}`);
      for (const d of diagnosticos[nome].filter((x) => x.arquivo === arquivo && x.regra === regra)) {
        console.error(`           linha ${d.linha}: ${d.mensagem}`);
      }
    }
    if (melhoras.length) {
      console.log(`  ${nome}: ${melhoras.length} contagem(ns) caíram — rode \`npm run lint:base\` para apertar a catraca.`);
    }
  }

  console.log(falhas === 0 ? '\nPASSOU: lint sem erro novo\n' : `\nFALHOU: ${falhas} erro(s) novo(s) de lint\n`);
  return falhas === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal();
}
