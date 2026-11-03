/** Gate do corte do Grátis: a comparação copy × banco e o SQL gerado. node scripts/teste-corte-gratis-confere.ts */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { corteAntigasConfere, corteConfere, emBrasilia, sqlDoCorte } from './corte-gratis-confere.ts';
import { CORTE_GRATIS_DATA } from '../src/services/planosBase.ts';

let ok = 0;
const caso = (n: string) => {
  ok++;
  console.log(`  ok  ${n}`);
};

// A constante real pode ser null (hoje) ou D+1 (dia do corte): o gate vale nos dois estados, então este teste NÃO a fixa.
assert.ok(CORTE_GRATIS_DATA === null || /^\d{4}-\d{2}-\d{2}$/.test(CORTE_GRATIS_DATA), 'a constante é null ou AAAA-MM-DD');
caso('a constante da copy é null ou AAAA-MM-DD');

assert.equal(emBrasilia('2026-10-26T03:00:00Z'), '2026-10-26 00:00:00');
assert.equal(emBrasilia('2026-10-26 00:00:00-03'), '2026-10-26 00:00:00');
assert.equal(emBrasilia('2026-10-25T23:59:59-03:00'), '2026-10-25 23:59:59');
assert.equal(emBrasilia('lixo'), null);
caso('emBrasilia converte UTC e offsets para o relógio de Brasília');

// desligado
assert.equal(corteConfere(null, null).ok, true);
assert.equal(corteConfere('', null).ok, true);
assert.equal(corteConfere('2026-10-26 00:00:00-03', null).ok, false, 'banco com corte e copy ilimitado: não publica');
// ligado
const D1 = '2026-10-26';
assert.equal(corteConfere('2026-10-26 00:00:00-03', D1).ok, true);
assert.equal(corteConfere('2026-10-26T03:00:00+00:00', D1).ok, true, 'mesmo instante em UTC');
assert.equal(corteConfere('2026-10-26 03:00:00+00', D1).ok, true, 'formato do Postgres');
assert.equal(corteConfere('2026-10-26 00:00:00+00', D1).ok, false, 'UTC meia-noite = 21h do dia anterior em Brasília');
assert.equal(corteConfere('2026-10-27 00:00:00-03', D1).ok, false, 'um dia depois');
assert.equal(corteConfere('2026-10-26 12:00:00-03', D1).ok, false, 'meio-dia (ex.: now() do dia) não é 00:00');
assert.equal(corteConfere(null, D1).ok, false, 'copy anuncia e o banco está sem corte');
assert.equal(corteConfere('2026-10-26 00:00:00-03', '26/10/2026').ok, false, 'constante em formato errado');
assert.equal(corteConfere('lixo', D1).ok, false);
caso('corteConfere: aceita só D 00:00 em Brasília; recusa UTC meia-noite, outro dia, meio-dia, null e lixo');

{
  const s = sqlDoCorte(D1);
  assert.match(s.atualizar, /timestamptz '2026-10-26 00:00:00-03'/);
  assert.match(s.conferir, /at time zone 'America\/Sao_Paulo'\) = timestamp '2026-10-26 00:00:00'/);
  assert.match(sqlDoCorte(null).atualizar, /set corte = null, atualizado_em = now\(\);\nupdate public\.limite_gratis_config set corte_antigas = null/, 'desligar zera os dois cortes em comandos separados');
  assert.match(sqlDoCorte(null).conferir, /corte_antigas/);
  assert.throws(() => sqlDoCorte('26/10/2026'));
  caso('SQL gerado: UPDATE com -03 explícito e SELECT de conferência em Brasília; desligar = null');
}

// corte_antigas: mesma regra, e o gate pega divergência só nas antigas
assert.equal(corteAntigasConfere(null, null).ok, true);
assert.equal(corteAntigasConfere('2026-11-25 00:00:00-03', null).ok, false, 'antigas ligadas no banco com copy sem data');
assert.equal(corteAntigasConfere('2026-11-25 00:00:00-03', '2026-11-25').ok, true);
assert.equal(corteAntigasConfere('2026-11-26 00:00:00-03', '2026-11-25').ok, false, 'um dia depois');
assert.equal(corteAntigasConfere(null, '2026-11-25').ok, false, 'copy anuncia data às antigas e o banco está sem');
assert.match(corteAntigasConfere(null, '2026-11-25').motivo, /^\[antigas\]/);
caso('corteAntigasConfere: mesma regra do corte das novas, com prefixo [antigas] na mensagem');

// P2 da revisão: valor SEM fuso é recusado (dependeria do TZ da máquina); número solto e data pura também
assert.equal(emBrasilia('2026-10-26 00:00:00'), null);
assert.equal(emBrasilia('2026-10-26'), null);
assert.equal(emBrasilia('0'), null);
assert.equal(corteConfere('2026-10-26 00:00:00', '2026-10-26').ok, false, 'sem fuso não confere');
assert.equal(corteConfere('2026-10-26 00:00:00-03', '2026-10-26').ok, true);
assert.equal(corteConfere('2026-10-26 00:00:00-0300', '2026-10-26').ok, true, 'offset sem dois-pontos');
caso('valor sem fuso, data pura e número solto são recusados; offsets -03 / -03:00 / -0300 aceitos');

// P1 da revisão: o CLI NUNCA pode ficar mudo com exit 0 — inclusive em pasta com espaço e acento.
{
  const base = mkdtempSync(join(tmpdir(), 'corte conf '));
  const pasta = join(base, 'pasta com espaço e acentuação', 'scripts');
  mkdirSync(pasta, { recursive: true });
  mkdirSync(join(base, 'pasta com espaço e acentuação', 'src', 'services'), { recursive: true });
  copyFileSync(new URL('./corte-gratis-confere.ts', import.meta.url), join(pasta, 'corte-gratis-confere.ts'));
  // stub: o que se testa aqui é o GUARD/CLI em caminho com espaço, não a copy (planosBase real importa outros módulos)
  writeFileSync(join(pasta, '..', 'src', 'services', 'planosBase.ts'), "export const CORTE_GRATIS_DATA: string | null = '2026-10-26';\n");
  writeFileSync(join(pasta, '..', 'package.json'), '{"type":"module"}');
  const roda = (...a: string[]) => spawnSync(process.execPath, [join(pasta, 'corte-gratis-confere.ts'), ...a], { encoding: 'utf8' });
  const sem = roda();
  assert.match(sem.stdout, /CORTE_GRATIS_DATA =/, 'sem argumento imprime o plano mesmo em pasta com espaço');
  const confere = roda('--corte', '2026-10-26 00:00:00-03', '--corte-antigas', 'null');
  assert.equal(confere.status, 0);
  assert.match(confere.stdout, /^CONFERE/);
  const nao = roda('--corte', '2000-01-01 00:00:00-03', '--corte-antigas', 'null');
  assert.equal(nao.status, 1);
  assert.match(nao.stdout, /NÃO CONFERE/);
  const semValor = roda('--corte');
  assert.equal(semValor.status, 2, '--corte sem valor: exit 2, nunca 0');
  assert.match(semValor.stderr, /NÃO CONFERE/);
  const antigasLigadasSemCopy = roda('--corte', '2026-10-26 00:00:00-03', '--corte-antigas', '2026-11-25 00:00:00-03');
  assert.equal(antigasLigadasSemCopy.status, 1, 'banco limita as antigas mas a copy não anuncia: não confere');
  // 2º stub: copy já anuncia data às antigas (CORTE_ANTIGAS_DATA preenchida). Cobre os exit codes novos do CLI.
  writeFileSync(join(pasta, '..', 'src', 'services', 'planosBase.ts'), "export const CORTE_GRATIS_DATA: string | null = '2026-10-26';\nexport const CORTE_ANTIGAS_DATA: string | null = '2026-11-25';\n");
  const semAntigas = roda('--corte', '2026-10-26 00:00:00-03', '--corte-antigas', 'null');
  assert.equal(semAntigas.status, 1, 'copy anuncia data às antigas e o banco está sem corte_antigas: não confere');
  assert.match(semAntigas.stdout, /\[antigas\]/);
  const duploOk = roda('--corte', '2026-10-26 00:00:00-03', '--corte-antigas', '2026-11-25 00:00:00-03');
  assert.equal(duploOk.status, 0);
  assert.match(duploOk.stdout, /^CONFERE/);
  const antigasErrada = roda('--corte', '2026-10-26 00:00:00-03', '--corte-antigas', '2026-11-26 00:00:00-03');
  assert.equal(antigasErrada.status, 1);
  const antigasSemValor = roda('--corte', '2026-10-26 00:00:00-03', '--corte-antigas');
  assert.equal(antigasSemValor.status, 2);
  void execFileSync;
  // sem --corte-antigas o gate NUNCA passa (nem com a constante das antigas null): exit 2
  const semAntigasFlag = roda('--corte', '2026-10-26 00:00:00-03');
  assert.equal(semAntigasFlag.status, 2, '--corte sem --corte-antigas: exit 2, nunca 0');
  assert.match(semAntigasFlag.stderr, /--corte-antigas ausente/);
  const sozinho = roda('--corte-antigas', '2026-11-25 00:00:00-03');
  assert.equal(sozinho.status, 2, '--corte-antigas sem --corte: exit 2, nunca 0');
  assert.match(sozinho.stderr, /exige --corte/);
  caso('CLI em pasta com espaço/acento: imprime, confere (exit 0), não confere (exit 1) e --corte sem valor (exit 2); nunca mudo com exit 0');
}

console.log(`\nteste-corte-gratis-confere: ${ok} casos OK`);
