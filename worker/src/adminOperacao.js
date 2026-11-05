/**
 * Contas da operação do painel: busca, churn, conversão, lote e CSV.
 * Puro, sem rede. A página repete o CSV porque o JS do painel é uma string.
 *
 * Churn (30 dias): conta de cliente, plano pro/empresa na linha, status de saída
 * (canceled, cancelled, unpaid, incomplete_expired), período encerrado nessa
 * janela, e vínculo real de gateway (Stripe no padrão de assinaturasPagantes.js,
 * Mercado Pago ou Play). Cortesia (comp_/sub_demo/reviewer) e conta interna ficam
 * de fora. Não é zero quando a leitura falha — quem chama é que marca indisponível.
 */
import { assinaturaPagante, motivoContaInterna, origemExibida } from './assinaturasPagantes.js';

const DIA = 86400000;
const SUB_STRIPE = /^sub_[A-Za-z0-9]+$/;
const CUS_STRIPE = /^cus_[A-Za-z0-9]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_SAIDA = new Set(['canceled', 'cancelled', 'unpaid', 'incomplete_expired']);
const ACOES_LOTE = new Set(['bloquear', 'desbloquear', 'nota']);
const LOTE_MAX = 25;

export const STATUS_ORCAMENTO = Object.freeze([
  'rascunho', 'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura',
  'aprovado', 'recusado', 'expirado', 'cancelado', 'convertido',
]);

export const SEGMENTOS_FILTRO = Object.freeze([
  'todos', 'pagantes', 'manual', 'ativos', 'nunca', 'novos', 'risco', 'inativos', 'bloqueados',
]);
export const ORDENS_FILTRO = Object.freeze(['cadastro', 'uso', 'orc', 'nome']);

function texto(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function idManual(v) {
  const s = texto(v).toLowerCase();
  return s.startsWith('comp_') || s.startsWith('sub_demo') || s.startsWith('reviewer_');
}

function stripeFicticio(row) {
  const ruim = (valor, re) => valor != null && valor !== '' && !(typeof valor === 'string' && re.test(valor));
  return ruim(row && row.stripe_subscription_id, SUB_STRIPE) || ruim(row && row.stripe_customer_id, CUS_STRIPE);
}

/** Teve pagamento em gateway de verdade, não cortesia escrita à mão. */
export function teveGatewayReal(row) {
  if (!row || stripeFicticio(row)) return false;
  const sub = texto(row.stripe_subscription_id);
  const cus = texto(row.stripe_customer_id);
  const mp = texto(row.mp_preapproval_id);
  const play = texto(row.revenuecat_transacao_id);
  if ((sub && SUB_STRIPE.test(sub)) || (cus && CUS_STRIPE.test(cus))) return true;
  if (mp && !idManual(mp)) return true;
  if (play && !idManual(play)) return true;
  return false;
}

export function normalizarTermo(q) {
  return String(q || '').trim().slice(0, 80).replace(/[%*,().\\"'`]/g, '').replace(/\s+/g, ' ').trim();
}

function textoBusca(v) {
  return String(v || '').toLowerCase().replace(/[%*,().\\"'`]/g, '');
}

export function buscarUsuarios(lista, termo, limite = 8) {
  const q = textoBusca(normalizarTermo(termo));
  if (q.length < 2) return [];
  const hits = [];
  for (const u of lista || []) {
    if (!u || !u.id) continue;
    // O mesmo recorte do termo: "fulano.ficticio@" continua achando o e-mail.
    const blob = textoBusca([u.email, u.nome, u.empresa, u.id].join(' '));
    if (!blob.includes(q)) continue;
    hits.push({
      id: u.id,
      email: u.email || '',
      nome: u.nome || '',
      empresa: u.empresa || '',
    });
    if (hits.length >= limite) break;
  }
  return hits;
}

export function consultaOrcamentos({ termo = '', status = '', limite = 100, userIds = [] } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limite) || 100));
  let path = `orcamentos?select=id,user_id,numero,cliente_nome,valor_total,status,criado_em&excluido_em=is.null&order=criado_em.desc&limit=${lim}`;
  if (STATUS_ORCAMENTO.includes(status)) path += `&status=eq.${status}`;
  const ids = (userIds || []).filter((id) => UUID_RE.test(id));
  if (ids.length) path += `&user_id=in.(${ids.join(',')})`;
  const t = normalizarTermo(termo);
  if (!ids.length && t.length >= 2) {
    const seguro = t.replace(/"/g, '');
    path += `&or=(cliente_nome.ilike."*${seguro}*",numero.ilike."*${seguro}*"`;
    if (UUID_RE.test(seguro) || seguro.length >= 8) path += `,id.eq."${seguro}"`;
    path += ')';
  }
  return path;
}

export function projetarOrcamentoLista(linha, campos) {
  const out = {};
  if (linha && linha.id != null) out.id = linha.id;
  if (linha && linha.user_id != null) out.user_id = linha.user_id;
  for (const campo of campos || []) {
    if (linha && Object.prototype.hasOwnProperty.call(linha, campo)) out[campo] = linha[campo];
  }
  return out;
}

export function juntarPorId(listas, limite = 20) {
  const vistos = new Set();
  const out = [];
  for (const lista of listas || []) {
    for (const item of lista || []) {
      if (!item || item.id == null || vistos.has(item.id)) continue;
      vistos.add(item.id);
      out.push(item);
      if (out.length >= limite) return out;
    }
  }
  return out;
}

function porPlanoZerado() {
  return { pro: 0, empresa: 0 };
}

export function resumirChurn({ assinaturas, usuarios, contexto, agoraMs, janelaDias = 30 }) {
  const porId = new Map((usuarios || []).map((u) => [u.id, u]));
  const porPlano = porPlanoZerado();
  for (const a of assinaturas || []) {
    const u = porId.get(a.user_id);
    if (!u) continue;
    if (motivoContaInterna(a.user_id, u.email, contexto)) continue;
    if (a.plano !== 'pro' && a.plano !== 'empresa') continue;
    if (!STATUS_SAIDA.has(String(a.status || '').toLowerCase())) continue;
    if (!teveGatewayReal(a)) continue;
    const fim = Date.parse(a.current_period_end);
    if (!Number.isFinite(fim)) continue;
    const idade = agoraMs - fim;
    if (idade < 0 || idade > janelaDias * DIA) continue;
    porPlano[a.plano] += 1;
  }
  return {
    estado: 'ok',
    contas: porPlano.pro + porPlano.empresa,
    porPlano,
    janelaDias,
  };
}

export function resumirVencendo({ assinaturas, usuarios, contexto, agoraMs, dias = 7 }) {
  const porId = new Map((usuarios || []).map((u) => [u.id, u]));
  let contas = 0;
  for (const a of assinaturas || []) {
    const u = porId.get(a.user_id);
    if (!u) continue;
    if (motivoContaInterna(a.user_id, u.email, contexto)) continue;
    if (!assinaturaPagante(a, agoraMs)) continue;
    const fim = Date.parse(a.current_period_end);
    if (!Number.isFinite(fim)) continue;
    const falta = fim - agoraMs;
    if (falta >= 0 && falta <= dias * DIA) contas += 1;
  }
  return { estado: 'ok', contas, dias };
}

export function resumirConversaoPorPlano({ usuarios, assinaturas, orcamentos, contexto, agoraMs }) {
  const ativacaoOk = Array.isArray(orcamentos);
  const ass = new Map((assinaturas || []).map((a) => [a.user_id, a]));
  const comOrc = new Set((orcamentos || []).map((o) => o && o.user_id).filter(Boolean));
  const base = {
    gratis: { contas: 0, comOrcamento: 0 },
    pro: { contas: 0, comOrcamento: 0 },
    empresa: { contas: 0, comOrcamento: 0 },
  };
  let pagos = 0;
  for (const u of usuarios || []) {
    if (!u || motivoContaInterna(u.id, u.email, contexto)) continue;
    const row = ass.get(u.id);
    let plano = 'gratis';
    if (row) {
      const o = origemExibida(row, u.email, contexto, agoraMs);
      plano = o.plano === 'pro' || o.plano === 'empresa' ? o.plano : 'gratis';
      if (o.origem === 'pagamento') pagos += 1;
    }
    base[plano].contas += 1;
    if (ativacaoOk && comOrc.has(u.id)) base[plano].comOrcamento += 1;
  }
  const planos = ['gratis', 'pro', 'empresa'].map((plano) => {
    const x = base[plano];
    return {
      plano,
      contas: x.contas,
      comOrcamento: ativacaoOk ? x.comOrcamento : null,
      taxaAtivacao: !ativacaoOk ? null : (x.contas ? Math.round((x.comOrcamento / x.contas) * 100) : 0),
    };
  });
  const contas = planos.reduce((s, p) => s + p.contas, 0);
  return {
    estado: 'ok',
    ativacao: ativacaoOk ? 'ok' : 'indisponivel',
    planos,
    pagos,
    taxaPago: contas ? Math.round((pagos / contas) * 100) : 0,
  };
}

export function validarLote(body) {
  const acao = body && body.acao;
  if (!ACOES_LOTE.has(acao)) return { erro: 'acao_invalida' };
  const brutos = Array.isArray(body.ids) ? body.ids : [];
  const ids = [];
  for (const id of brutos) {
    if (!UUID_RE.test(id)) return { erro: 'id_invalido' };
    if (!ids.includes(id)) ids.push(id);
  }
  if (!ids.length) return { erro: 'sem_ids' };
  if (ids.length > LOTE_MAX) return { erro: 'lote_grande' };
  const motivo = texto(body.motivo);
  if (motivo.length < 3 || motivo.length > 500) return { erro: 'motivo_invalido' };
  let dias = null;
  if (acao === 'bloquear' && body.dias != null && body.dias !== '') {
    dias = Number(body.dias);
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) return { erro: 'dias_invalidos' };
  }
  let nota = null;
  if (acao === 'nota') {
    nota = texto(body.texto) || motivo;
    if (nota.length < 3 || nota.length > 500) return { erro: 'nota_invalida' };
  }
  const requestId = typeof body.requestId === 'string' ? body.requestId.slice(0, 80) : '';
  return { acao, ids, motivo, dias, texto: nota, requestId };
}

export function normalizarFiltroSalvo(item, existentes = []) {
  if ((existentes || []).length >= 8) return { erro: 'limite_filtros' };
  const nome = texto(item && item.nome).slice(0, 40);
  if (nome.length < 2) return { erro: 'nome_invalido' };
  if (!SEGMENTOS_FILTRO.includes(item && item.seg)) return { erro: 'segmento_invalido' };
  if (!ORDENS_FILTRO.includes(item && item.ordem)) return { erro: 'ordem_invalida' };
  if (item.escopo !== 'clientes' && item.escopo !== 'internas') return { erro: 'escopo_invalido' };
  return {
    filtro: {
      nome,
      seg: item.seg,
      ordem: item.ordem,
      escopo: item.escopo,
      busca: String(item.busca || '').slice(0, 80),
    },
  };
}

export function celulaCsv(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvOrcamentos(linhas) {
  const cab = ['id', 'user_id', 'numero', 'cliente_nome', 'valor_total', 'status', 'criado_em'];
  const corpo = (linhas || []).map((o) => cab.map((k) => celulaCsv(o && o[k])).join(';'));
  return [cab.join(';'), ...corpo].join('\r\n');
}
