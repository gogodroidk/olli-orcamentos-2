import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avaliarJanela, proximaLoja, proximaProducao } from './janela-release.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(raiz, 'scripts', 'janela-release.mjs');

function ler(caminho: string): string {
  return readFileSync(caminho, 'utf8').replace(/\r\n/g, '\n');
}

function em(
  isoUtc: string,
  alvo = 'producao',
  extra: { hotfix?: boolean | string; motivo?: string; changelog?: string } = {},
) {
  return avaliarJanela({ agora: new Date(isoUtc), alvo, ...extra });
}

const nota = { changelog: 'corrige o envio do recibo' };

const abre = em('2026-10-27T08:30:00Z', 'producao', nota);
assert.equal(abre.permitido, true);
assert.equal(abre.codigo, 'DENTRO');

const umMinutoAntes = em('2026-10-27T08:29:00Z', 'producao', nota);
assert.equal(umMinutoAntes.permitido, false);

const ultimoMinuto = em('2026-10-27T10:29:00Z', 'producao', nota);
assert.equal(ultimoMinuto.permitido, true);

const fecha = em('2026-10-27T10:30:00Z', 'producao', nota);
assert.equal(fecha.permitido, false);
assert.match(fecha.mensagem, /sexta 2026-10-30 05:30/);

const sexta = em('2026-10-30T09:00:00Z', 'producao', nota);
assert.equal(sexta.permitido, true);

const quarta = em('2026-11-04T18:00:00Z', 'producao', nota);
assert.equal(quarta.permitido, false);
assert.equal(quarta.codigo, 'FORA');
assert.match(quarta.mensagem, /sexta 2026-11-06 05:30/);

const antes = em('2026-10-20T09:00:00Z', 'producao', nota);
assert.equal(antes.permitido, false);
assert.equal(antes.codigo, 'ANTES_DA_PRIMEIRA');
assert.match(antes.mensagem, /terça 2026-10-27 05:30/);

const semNota = em('2026-10-27T08:30:00Z');
assert.equal(semNota.codigo, 'SEM_CHANGELOG');
assert.equal(semNota.permitido, false);

const cinco = em('2026-10-27T08:30:00Z', 'producao', {
  changelog: 'um|dois|tres|quatro|cinco',
});
assert.equal(cinco.permitido, true);
assert.match(cinco.mensagem, /5 linha/);

const seis = em('2026-10-27T08:30:00Z', 'producao', {
  changelog: 'um|dois|tres|quatro|cinco|seis',
});
assert.equal(seis.permitido, false);
assert.equal(seis.codigo, 'CHANGELOG_INVALIDO');

const segredo = em('2026-10-27T08:30:00Z', 'producao', { changelog: 'token=abc123' });
assert.equal(segredo.permitido, false);
assert.equal(segredo.mensagem.includes('abc123'), false);

const hotfix = em('2026-11-04T18:00:00Z', 'producao', {
  hotfix: '1',
  motivo: 'login do webhook caiu',
});
assert.equal(hotfix.permitido, true);
assert.equal(hotfix.codigo, 'HOTFIX');
assert.equal(hotfix.categoria, 'login');
assert.match(hotfix.mensagem, /Nenhuma mensagem foi enviada/);

const pix = em('2026-11-04T18:00:00Z', 'producao', { hotfix: true, motivo: 'PIX fora do ar' });
assert.equal(pix.categoria, 'pix');

const seguranca = em('2026-11-04T18:00:00Z', 'producao', {
  hotfix: 'sim',
  motivo: 'falha de segurança no webhook',
});
assert.equal(seguranca.categoria, 'seguranca');

const feature = em('2026-10-27T08:30:00Z', 'producao', {
  hotfix: 'true',
  motivo: 'subir feature nova',
  changelog: 'uma linha',
});
assert.equal(feature.permitido, false);
assert.equal(feature.codigo, 'HOTFIX_RECUSADO');

const motivoSegredo = em('2026-11-04T18:00:00Z', 'producao', {
  hotfix: '1',
  motivo: 'login token=abc123',
});
assert.equal(motivoSegredo.permitido, false);
assert.equal(motivoSegredo.mensagem.includes('abc123'), false);

const staging = em('2026-11-04T18:00:00Z', 'staging');
assert.equal(staging.permitido, true);
assert.equal(staging.codigo, 'STAGING');

const alias = em('2026-10-27T08:30:00Z', 'production', nota);
assert.equal(alias.permitido, true);

const banana = em('2026-10-27T08:30:00Z', 'banana', nota);
assert.equal(banana.codigo, 'ALVO_DESCONHECIDO');

const loja = em('2026-10-29T18:00:00Z', 'loja', nota);
assert.equal(loja.permitido, true);
assert.equal(loja.codigo, 'LOJA');

const lojaMeiaNoite = em('2026-11-12T03:00:00Z', 'loja', nota);
assert.equal(lojaMeiaNoite.permitido, true);

const lojaQuaseFim = em('2026-11-13T02:59:00Z', 'loja', nota);
assert.equal(lojaQuaseFim.permitido, true);

const lojaSexta = em('2026-11-13T03:00:00Z', 'loja', nota);
assert.equal(lojaSexta.permitido, false);

const lojaFora = em('2026-11-05T18:00:00Z', 'loja', nota);
assert.equal(lojaFora.permitido, false);
assert.match(lojaFora.mensagem, /quinta 2026-11-12/);

assert.equal(proximaProducao(new Date('2026-10-27T07:00:00Z'))?.rotulo, 'terça 2026-10-27 05:30');
assert.equal(proximaProducao(new Date('2026-10-27T11:00:00Z'))?.rotulo, 'sexta 2026-10-30 05:30');
assert.equal(proximaProducao(new Date('2026-10-30T11:00:00Z'))?.rotulo, 'terça 2026-11-03 05:30');
assert.equal(proximaLoja(new Date('2026-11-05T18:00:00Z'))?.rotulo, 'quinta 2026-11-12');

const vivo = avaliarJanela({ agora: new Date(), alvo: 'producao', changelog: 'x' });
assert.equal(typeof vivo.permitido, 'boolean');
assert.match(vivo.mensagem, /^D-0636 /);

function cli(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { TZ: 'UTC', ...env },
  });
}

const foraCli = cli(['--alvo', 'producao', '--agora', '2026-11-04T18:00:00Z']);
assert.equal(foraCli.status, 2);
assert.match(foraCli.stdout, /sexta 2026-11-06 05:30/);

const dentroCli = cli(['--alvo', 'producao', '--agora', '2026-10-27T08:30:00Z', '--changelog', 'recibo ok']);
assert.equal(dentroCli.status, 0);
assert.match(dentroCli.stdout, /janela de produção aberta/);

const hotfixCli = cli(['--alvo', 'producao', '--agora', '2026-11-04T18:00:00Z'], {
  OLLI_HOTFIX: '1',
  OLLI_HOTFIX_MOTIVO: 'dados do recibo quebrados',
});
assert.equal(hotfixCli.status, 0);
assert.match(hotfixCli.stdout, /categoria=dados/);

const agoraRuim = cli(['--alvo', 'producao', '--agora', 'ontem']);
assert.equal(agoraRuim.status, 1);

const reparar = ler(join(raiz, 'worker', 'reparar.mjs'));
const chamada = reparar.indexOf('avaliarJanela(');
const leitura = reparar.indexOf('readFileSync(COFRE');
assert.ok(chamada > 0 && leitura > chamada);
assert.match(reparar, /if \(!DRY_RUN\) \{[^}]*avaliarJanela/s);
assert.match(reparar, /--forcar não fura a janela/);

const promo = ler(join(raiz, '.github', 'workflows', 'promotion.yml'));
const quality = promo.split('staging:')[0];
const production = promo.split('name: production-promotion')[1] || '';
assert.equal(quality.includes('janela-release'), false);
assert.match(production, /node scripts\/janela-release\.mjs --alvo producao/);

const pkg = JSON.parse(ler(join(raiz, 'package.json'))) as { scripts: Record<string, string> };
const workerPkg = JSON.parse(ler(join(raiz, 'worker', 'package.json'))) as { scripts: Record<string, string> };
assert.equal(
  pkg.scripts.deploy.startsWith('node scripts/janela-release.mjs --alvo producao && '),
  true,
);
assert.equal(pkg.scripts.preview.includes('janela-release'), false);
assert.equal(
  workerPkg.scripts.deploy.startsWith('node ../scripts/janela-release.mjs --alvo producao && '),
  true,
);
assert.equal(workerPkg.scripts.check.includes('janela-release'), false);

console.log('PASSOU: janela de release D-0636.');
