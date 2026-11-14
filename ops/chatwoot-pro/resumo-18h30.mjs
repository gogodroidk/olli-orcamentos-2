// Resumo do dia da Central ZAP para o Igor, em dia útil às 18h30.
// Sem --enviar, só imprime. Não manda WhatsApp e não lê segredo: a API entra pelo cw-api.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CAIXAS = {
  2: 'GR Tech',
  3: 'Segundo Andar',
  4: 'OLLI',
  5: 'Pessoal',
};
const NEGOCIO = new Set([2, 3, 4]);
const PASSOU_HUMANO = new Set([
  'pediu-humano', 'reclamacao', 'cobranca', 'lgpd', 'sem-fonte',
  'venda-grande', 'fora-da-tabela', 'cliente-antigo', 'sinalizar',
]);

export function diaSp(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

function seg(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function noDia(conv, dia) {
  const marcas = [conv.last_activity_at, conv.created_at, conv.updated_at].map(seg).filter(Boolean);
  return marcas.some((s) => diaSp(s * 1000) === dia);
}

/** Aberto no negócio, pessoal sem resolver, ou etiqueta de passagem ao humano. */
export function esperaHumano(caixa, status, labels) {
  if (status === 'resolved') return false;
  if (caixa === 5) return true;
  if (!NEGOCIO.has(caixa)) return false;
  if (status === 'open') return true;
  return [...labels].some((l) => PASSOU_HUMANO.has(l));
}

export function haQuanto(segundos, agoraMs) {
  const s = Math.max(0, Math.floor(agoraMs / 1000 - segundos));
  if (s < 3600) return `há ${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export function montarResumo(dados) {
  const agora = dados.agora ? new Date(dados.agora).getTime() : Date.now();
  const dia = diaSp(agora);
  const lista = Array.isArray(dados.conversas) ? dados.conversas : [];
  const porCaixa = { 2: 0, 3: 0, 4: 0, 5: 0 };
  let roboEncerrou = 0;
  let roboConversando = 0;
  let quentes = 0;
  const esperas = [];

  for (const c of lista) {
    const caixa = Number(c.inbox_id);
    const labels = new Set(c.labels || []);
    const humano = [...labels].some((l) => PASSOU_HUMANO.has(l));
    if (noDia(c, dia) && porCaixa[caixa] !== undefined) porCaixa[caixa] += 1;
    if (NEGOCIO.has(caixa) && noDia(c, dia) && !humano) {
      if (c.status === 'resolved') roboEncerrou += 1;
      else if (c.status === 'pending') roboConversando += 1;
    }
    if (esperaHumano(caixa, c.status, labels)) {
      const marca = seg(c.waiting_since) || seg(c.last_activity_at) || seg(c.created_at);
      if (marca) esperas.push(marca);
    }
    if (NEGOCIO.has(caixa) && labels.has('lead-quente') && c.status !== 'resolved') quentes += 1;
  }

  const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(agora));
  const maisAntiga = esperas.length ? haQuanto(Math.min(...esperas), agora) : '';
  const espera = esperas.length
    ? `Esperando você: ${esperas.length}. A mais antiga ${maisAntiga}.`
    : 'Esperando você: ninguém.';
  return [
    `Central ${quando}.`,
    `OLLI ${porCaixa[4]} hoje. GR Tech ${porCaixa[2]}. Segundo Andar ${porCaixa[3]}. Pessoal ${porCaixa[5]}.`,
    `Robô encerrou sozinho: ${roboEncerrou}. Ainda com o robô: ${roboConversando}.`,
    espera,
    `Leads quentes: ${quentes}.`,
  ].join(' ');
}

function cw(caminho) {
  const saida = execFileSync('cw-api', ['GET', caminho], { encoding: 'utf8', timeout: 30000, maxBuffer: 8_000_000 });
  const inicio = Math.min(...[saida.indexOf('{'), saida.indexOf('[')].filter((n) => n >= 0));
  return JSON.parse(saida.slice(inicio));
}

export function lerConversas() {
  const todas = [];
  for (const status of ['open', 'pending', 'resolved']) {
    for (let page = 1; page <= 20; page += 1) {
      const d = cw(`/conversations?status=${status}&page=${page}`);
      const payload = d?.data?.payload || [];
      if (!payload.length) break;
      for (const c of payload) {
        todas.push({
          id: c.id,
          inbox_id: c.inbox_id,
          status: c.status,
          labels: c.labels || [],
          waiting_since: c.waiting_since,
          last_activity_at: c.last_activity_at,
          created_at: c.created_at,
          updated_at: c.updated_at,
        });
      }
      if (payload.length < 25) break;
    }
  }
  return todas;
}

function enviar(texto) {
  execFileSync('node', ['/home/igor/Desktop/Sistema/ferramentas/equipe-telegram/equipe.mjs', 'pv', texto, 'Central ZAP'], { stdio: 'inherit', timeout: 30000 });
}

function main() {
  const fixture = process.argv.indexOf('--fixture');
  const dados = fixture >= 0
    ? JSON.parse(readFileSync(process.argv[fixture + 1], 'utf8'))
    : { conversas: lerConversas() };
  const texto = montarResumo(dados);
  if (process.argv.includes('--enviar')) enviar(texto);
  else process.stdout.write(`${texto}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('resumo-18h30.mjs')) main();
