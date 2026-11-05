/**
 * Portão da janela de release (D-0636).
 *
 * Produção sobe terça e sexta, 05:30 inclusive até 07:30 exclusive,
 * America/Sao_Paulo, a partir de 2026-10-27. Entre janelas o lote acumula.
 * App de loja: quinta inteira, de 14 em 14 dias, a partir de 2026-10-29.
 * Staging fica livre qualquer dia (D-0635: testa primeiro na área de testes).
 * Hotfix, em qualquer hora: OLLI_HOTFIX=1 e motivo com pix, login, dados
 * ou seguranca. Este módulo não publica e não envia mensagem.
 *
 *   node scripts/janela-release.mjs --alvo producao
 *   node scripts/janela-release.mjs --alvo loja
 *   node scripts/janela-release.mjs --alvo staging
 *   OLLI_CHANGELOG="linha 1|linha 2" node scripts/janela-release.mjs --alvo producao
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FUSO = 'America/Sao_Paulo';
export const PRIMEIRA_PRODUCAO = '2026-10-27';
export const ANCORA_LOJA = '2026-10-29';
export const INTERVALO_LOJA_DIAS = 14;
export const INICIO_MIN = 5 * 60 + 30;
export const FIM_MIN = 7 * 60 + 30;

const DIAS_PRODUCAO = new Set(['Tue', 'Fri']);
const NOME_DIA = {
  Sun: 'domingo',
  Mon: 'segunda',
  Tue: 'terça',
  Wed: 'quarta',
  Thu: 'quinta',
  Fri: 'sexta',
  Sat: 'sábado',
};
const SEGREDO =
  /(?:api[_-]?key|secret|token|senha|password)\s*[:=]|whsec_|sk_live|sk_test|rk_live|ghp_|github_pat|sb_secret|service_role/i;

export function partesSp(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const bag = {};
  for (const parte of fmt.formatToParts(date)) bag[parte.type] = parte.value;
  let hora = Number(bag.hour);
  if (hora === 24) hora = 0;
  return {
    weekday: bag.weekday,
    iso: `${bag.year}-${bag.month}-${bag.day}`,
    minutos: hora * 60 + Number(bag.minute),
  };
}

function somarDias(iso, dias) {
  const ms = Date.parse(`${iso}T00:00:00Z`) + dias * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function diasCivis(deIso, paraIso) {
  const ms = Date.parse(`${paraIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export function emJanelaProducao(partes) {
  return (
    partes.iso >= PRIMEIRA_PRODUCAO &&
    DIAS_PRODUCAO.has(partes.weekday) &&
    partes.minutos >= INICIO_MIN &&
    partes.minutos < FIM_MIN
  );
}

export function emDiaLoja(partes) {
  if (partes.weekday !== 'Thu') return false;
  const dias = diasCivis(ANCORA_LOJA, partes.iso);
  return dias >= 0 && dias % INTERVALO_LOJA_DIAS === 0;
}

export function proximaProducao(agora) {
  const atual = partesSp(agora);
  let cursor = Date.parse(`${atual.iso}T08:30:00Z`);
  if (atual.minutos >= INICIO_MIN) cursor += 86400000;
  for (let i = 0; i < 14; i++) {
    const partes = partesSp(new Date(cursor));
    if (partes.iso >= PRIMEIRA_PRODUCAO && DIAS_PRODUCAO.has(partes.weekday)) {
      return { iso: partes.iso, rotulo: `${NOME_DIA[partes.weekday]} ${partes.iso} 05:30` };
    }
    cursor += 86400000;
  }
  return null;
}

export function proximaLoja(agora) {
  const atual = partesSp(agora);
  let iso = atual.iso;
  for (let i = 0; i < 21; i++) {
    const partes = partesSp(new Date(Date.parse(`${iso}T15:00:00Z`)));
    if (emDiaLoja(partes)) return { iso: partes.iso, rotulo: `quinta ${partes.iso}` };
    iso = somarDias(iso, 1);
  }
  return null;
}

export function linhasChangelog(texto) {
  return String(texto || '')
    .split(/\r?\n|\|/)
    .map((linha) => linha.trim())
    .filter(Boolean);
}

function pareceSegredo(texto) {
  return SEGREDO.test(String(texto || ''));
}

function hotfixLigado(hotfix) {
  if (hotfix === true) return true;
  const valor = String(hotfix ?? '').trim().toLowerCase();
  return valor === '1' || valor === 'true' || valor === 'sim';
}

function categoriaDe(motivo) {
  const texto = String(motivo || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  if (/\bpix\b/.test(texto)) return 'pix';
  if (/\blogin\b/.test(texto)) return 'login';
  if (/\bdados\b/.test(texto)) return 'dados';
  if (/\bseguranca\b/.test(texto)) return 'seguranca';
  return null;
}

function alvoNormalizado(alvo) {
  const nome = String(alvo || '').trim().toLowerCase();
  if (nome === 'producao' || nome === 'produção' || nome === 'production') return 'producao';
  if (nome === 'loja' || nome === 'store' || nome === 'eas') return 'loja';
  if (nome === 'staging' || nome === 'teste' || nome === 'testes') return 'staging';
  return '';
}

function decidir(parcial) {
  return {
    permitido: false,
    hotfix: false,
    categoria: null,
    proxima: null,
    codigo: 'FORA',
    mensagem: '',
    ...parcial,
  };
}

function validarChangelog(texto) {
  if (pareceSegredo(texto)) {
    return decidir({
      codigo: 'CHANGELOG_INVALIDO',
      mensagem: 'D-0636 recusado: o changelog parece carregar segredo. Reescreva sem chave, token ou senha.',
    });
  }
  const linhas = linhasChangelog(texto);
  if (linhas.length < 1) {
    return decidir({
      codigo: 'SEM_CHANGELOG',
      mensagem:
        'D-0636 recusado: falta o changelog de 1 a 5 linhas em OLLI_CHANGELOG ou --changelog. Separe com | ou com quebra de linha.',
    });
  }
  if (linhas.length > 5) {
    return decidir({
      codigo: 'CHANGELOG_INVALIDO',
      mensagem: `D-0636 recusado: o changelog tem ${linhas.length} linhas. O teto é 5.`,
    });
  }
  if (linhas.some((linha) => linha.length > 200)) {
    return decidir({
      codigo: 'CHANGELOG_INVALIDO',
      mensagem: 'D-0636 recusado: cada linha do changelog cabe em 200 caracteres.',
    });
  }
  return { ok: true, linhas };
}

function textoChangelog(linhas) {
  return linhas.map((linha) => ` - ${linha}`).join('\n');
}

export function avaliarJanela({
  agora = new Date(),
  alvo = 'producao',
  hotfix = false,
  motivo = '',
  changelog = '',
} = {}) {
  const nome = alvoNormalizado(alvo);
  if (!nome) {
    return decidir({
      codigo: 'ALVO_DESCONHECIDO',
      mensagem: 'D-0636 recusado: use o alvo producao, loja ou staging.',
    });
  }
  if (nome === 'staging') {
    return decidir({
      permitido: true,
      codigo: 'STAGING',
      mensagem: 'D-0636 permitido: staging fica livre qualquer dia. Produção continua na janela.',
    });
  }

  if (hotfixLigado(hotfix)) {
    if (pareceSegredo(motivo)) {
      return decidir({
        codigo: 'HOTFIX_RECUSADO',
        mensagem: 'D-0636 recusado: o motivo do hotfix parece carregar segredo. Reescreva sem chave, token ou senha.',
      });
    }
    const categoria = categoriaDe(motivo);
    if (!categoria) {
      return decidir({
        codigo: 'HOTFIX_RECUSADO',
        mensagem:
          'D-0636 recusado: OLLI_HOTFIX está ligado e o motivo não cita pix, login, dados ou seguranca. Sem o motivo, o portão não abre.',
      });
    }
    return decidir({
      permitido: true,
      hotfix: true,
      categoria,
      codigo: 'HOTFIX',
      mensagem: `D-0636 permitido: hotfix categoria=${categoria}. Registro local. Nenhuma mensagem foi enviada.`,
    });
  }

  const partes = partesSp(agora);
  if (nome === 'loja') {
    if (!emDiaLoja(partes)) {
      const proxima = proximaLoja(agora);
      const quando = proxima ? ` Próxima: ${proxima.rotulo}.` : '';
      return decidir({
        codigo: 'FORA',
        proxima: proxima ? proxima.rotulo : null,
        mensagem: `D-0636 recusado: app de loja sobe na quinta, a cada 14 dias, desde ${ANCORA_LOJA}, o dia inteiro em ${FUSO}.${quando}`,
      });
    }
    const changelogLoja = validarChangelog(changelog);
    if (!changelogLoja.ok) return changelogLoja;
    return decidir({
      permitido: true,
      codigo: 'LOJA',
      mensagem: `D-0636 permitido: quinta de loja ${partes.iso}. Changelog com ${changelogLoja.linhas.length} linha(s).\n${textoChangelog(changelogLoja.linhas)}`,
    });
  }

  if (!emJanelaProducao(partes)) {
    const proxima = proximaProducao(agora);
    const quando = proxima ? ` Próxima janela: ${proxima.rotulo} (${FUSO}).` : '';
    const cedo = partes.iso < PRIMEIRA_PRODUCAO ? ` A primeira janela é terça ${PRIMEIRA_PRODUCAO} 05:30.` : '';
    return decidir({
      codigo: partes.iso < PRIMEIRA_PRODUCAO ? 'ANTES_DA_PRIMEIRA' : 'FORA',
      proxima: proxima ? proxima.rotulo : null,
      mensagem: `D-0636 recusado: produção sobe terça e sexta, 05:30 até 07:30, ${FUSO}.${cedo}${quando} Hotfix: OLLI_HOTFIX=1 e OLLI_HOTFIX_MOTIVO com pix, login, dados ou seguranca.`,
    });
  }

  const changelogProd = validarChangelog(changelog);
  if (!changelogProd.ok) return changelogProd;
  return decidir({
    permitido: true,
    codigo: 'DENTRO',
    mensagem: `D-0636 permitido: janela de produção aberta (${NOME_DIA[partes.weekday]} ${partes.iso}). Changelog com ${changelogProd.linhas.length} linha(s).\n${textoChangelog(changelogProd.linhas)}`,
  });
}

function lerArg(nome) {
  const indice = process.argv.indexOf(nome);
  if (indice < 0) return undefined;
  return process.argv[indice + 1];
}

const ehCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (ehCli) {
  const agoraArg = lerArg('--agora');
  const agora = agoraArg ? new Date(agoraArg) : new Date();
  if (Number.isNaN(agora.getTime())) {
    console.error('D-0636: --agora inválido. Use um instante ISO, por exemplo 2026-10-27T08:30:00Z.');
    process.exit(1);
  }
  const changelog = [process.env.OLLI_CHANGELOG || '', lerArg('--changelog') || ''].filter(Boolean).join('\n');
  const decisao = avaliarJanela({
    agora,
    alvo: lerArg('--alvo') || 'producao',
    hotfix: process.env.OLLI_HOTFIX,
    motivo: process.env.OLLI_HOTFIX_MOTIVO || '',
    changelog,
  });
  console.log(decisao.mensagem);
  process.exit(decisao.permitido ? 0 : 2);
}
