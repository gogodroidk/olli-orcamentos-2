/**
 * Painel ADM, "O que fazer hoje" no topo da Visão geral (pedido do Igor em 09/11/2026, D-1859 e D-1861).
 *
 * Uma leitura só (RPC public.admin_hoje, só service_role) devolve: Pix gerado e não pago em 7 dias, contas que bateram
 * o limite do Grátis no mês, testes do Pro que acabam em 3 dias, os "Números do mês" e dois sinais de saúde (e-mail em
 * dead_letter nas últimas 24 h e Pix pago que não liberou o plano).
 *
 * REGRA DA CASA: número que não deu para ler é `estado:'indisponivel'`, nunca zero. Cada bloco vem separado do banco
 * (NULL quando o bloco falhou); aqui só se normaliza e se descarta o que não tem a forma esperada.
 * Nada aqui devolve e-mail de cliente: só id, nome e empresa (para admin com aal2).
 */
import { chamarRpcServico } from './emailRpc.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOJE_MAX_BYTES = 256 * 1024;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function falha(codigo) {
  return Object.assign(new Error(codigo), { codigo });
}

function configDe(env) {
  const supabaseUrl = String(env?.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const serviceRoleKey = String(env?.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!/^https:\/\/[^/]+/.test(supabaseUrl) || serviceRoleKey.length < 20) throw falha('supabase_nao_configurado');
  return { supabaseUrl, serviceRoleKey };
}

const INDISPONIVEL = Object.freeze({ estado: 'indisponivel' });

function inteiro(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function texto(v, max) {
  return String(v ?? '').replace(/[<>]/g, ' ').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function dataIso(v) {
  return typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
}

function idOuNulo(v) {
  return typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null;
}

/** Lista com `total` e `itens`; sem a forma esperada = indisponível. `mapa` devolve null para descartar a linha. */
function lista(bloco, mapa, extra = () => ({})) {
  if (!bloco || typeof bloco !== 'object' || !Array.isArray(bloco.itens)) return INDISPONIVEL;
  const itens = bloco.itens.map(mapa).filter(Boolean);
  const total = inteiro(bloco.total);
  if (total === null) return INDISPONIVEL;
  return { estado: 'ok', total, itens, cortado: total > itens.length, ...extra(bloco) };
}

function pessoa(x) {
  const userId = idOuNulo(x?.userId);
  if (!userId) return null;
  return { userId, nome: texto(x.nome, 80), empresa: texto(x.empresa, 80) };
}

/** Normaliza o objeto da RPC para o que o painel desenha. */
export function normalizarHoje(bruto) {
  if (!bruto || typeof bruto !== 'object') throw falha('resposta_invalida');
  const pixPendentes = lista(bruto.pixPendentes, (x) => {
    const p = pessoa(x);
    return p && { ...p, plano: texto(x.plano, 20), criadoEm: dataIso(x.criadoEm), venceEm: dataIso(x.venceEm), vencido: x.vencido === true };
  });
  const limiteGratis = lista(bruto.limiteGratis, (x) => {
    const p = pessoa(x);
    const envios = inteiro(x?.envios);
    return p && envios !== null && { ...p, envios, limitada: x.limitada === true };
  }, (b) => ({ limite: inteiro(b.limite), corteAtivo: b.corteAtivo === true }));
  const testesTerminando = lista(bruto.testesTerminando, (x) => {
    const p = pessoa(x);
    return p && { ...p, terminaEm: dataIso(x.terminaEm) };
  });

  const m = bruto.mes && typeof bruto.mes === 'object' ? bruto.mes : {};
  const entrou = m.entrouCentavos === null || m.entrouCentavos === undefined ? null : inteiro(m.entrouCentavos);
  const pagantes = m.pagantes === null || m.pagantes === undefined ? null : inteiro(m.pagantes);
  const convertidos = m.testesViraramPagantes === null || m.testesViraramPagantes === undefined ? null : inteiro(m.testesViraramPagantes);
  const mes = {
    entrouCentavos: entrou,
    pagantes,
    testesViraramPagantes: convertidos,
  };

  const s = bruto.saude && typeof bruto.saude === 'object' ? bruto.saude : {};
  const emailsFalhos = s.emailsFalhos24h && typeof s.emailsFalhos24h === 'object' && inteiro(s.emailsFalhos24h.total) !== null
    ? {
      estado: 'ok',
      total: inteiro(s.emailsFalhos24h.total),
      porTemplate: (Array.isArray(s.emailsFalhos24h.porTemplate) ? s.emailsFalhos24h.porTemplate : [])
        .map((t) => ({ template: texto(t?.template, 60), n: inteiro(t?.n) }))
        .filter((t) => t.template && t.n !== null),
    }
    : INDISPONIVEL;
  const pixPagoSemPlano = lista(s.pixPagoSemPlano, (x) => ({
    userId: idOuNulo(x?.userId),
    plano: texto(x?.plano, 20),
    status: x?.status === 'falhou' ? 'falhou' : 'recebido',
    recebidoEm: dataIso(x?.recebidoEm),
  }));

  return {
    geradoEm: dataIso(bruto.geradoEm),
    pixPendentes,
    limiteGratis,
    testesTerminando,
    mes,
    saude: { emailsFalhos24h: emailsFalhos, pixPagoSemPlano },
  };
}

export async function lerHoje(env, { emailsExcluidos = [], fetchImpl = fetch } = {}) {
  const excl = (Array.isArray(emailsExcluidos) ? emailsExcluidos : [])
    .map((e) => String(e ?? '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
  const bruto = await chamarRpcServico(configDe(env), fetchImpl, 'admin_hoje', { p_emails_excluidos: excl }, { limiteBytes: HOJE_MAX_BYTES });
  return normalizarHoje(bruto);
}

/** GET /admin/api/hoje */
export async function rotaHoje(env, opcoes = {}) {
  try {
    return json({ ok: true, hoje: await lerHoje(env, opcoes) });
  } catch (e) {
    const codigo = e.codigo === 'supabase_nao_configurado' ? e.codigo : e.codigo === 'supabase_rpc_404' ? 'hoje_sem_migration' : 'banco_indisponivel';
    return json({ ok: false, erro: codigo }, 503);
  }
}
