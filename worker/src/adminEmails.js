/**
 * Painel ADM, aba "E-mails" (pedido do Igor em 09/11/2026, D-1859).
 *
 * - resumoEmails: saúde dos e-mails automáticos nos últimos N dias (por tipo: enviados, na fila, falhos) e
 *   descadastros/devoluções/reclamações.
 * - candidatasOfertaPro: contas com uso real e o motivo pelo qual a oferta do Pro sairia ou não (a mesma
 *   política de ofertaPro.js, aplicada sobre os fatos que o banco devolve agora).
 * - textoOfertaPro: texto padrão montado só com fatos da conta. Sem contagem do mês (muda até o envio) e sem
 *   preço digitado (vem de precosPlanos).
 * - enviarOfertaPro: ensaio (padrão) ou envio pela outbox (executarOfertaPro). O envio grava auditoria ANTES
 *   de enfileirar; sem auditoria, nada sai.
 *
 * Nada aqui devolve o e-mail do cliente. As rotas (admin.js) exigem papel admin + aal2.
 */
import { chamarRpcServico } from './emailRpc.js';
import { decidirOferta, executarOfertaPro, OFERTA_PRO_MAX_CONTAS } from './ofertaPro.js';
import { PRECO_PRO, reais } from '../../src/services/precosPlanos.ts';
import { LIMITE_ENVIOS_GRATIS_MES } from '../../src/services/planosBase.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANDIDATAS_MAX_BYTES = 256 * 1024;

export const EMAILS_TIPOS = Object.freeze({
  boas_vindas: 'Boas-vindas',
  lembrete_ativacao: 'Lembrete de ativação',
  lembrete_assinatura: 'Lembrete de assinatura',
  lembrete_reengajamento: 'Reengajamento',
  resumo_dinheiro: 'Resumo do dinheiro',
  oferta_pro: 'Oferta do Pro',
});

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

function inteiro(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function textoLimpo(v, max) {
  return String(v ?? '').replace(/[<>]/g, ' ').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** "MARCOS antonio" -> "Marcos". Nome que não parece nome (número, e-mail, 1 letra) vira '' e a saudação fica "Olá!". */
export function primeiroNome(nome) {
  const p = textoLimpo(nome, 80).split(' ')[0] || '';
  if (!/^\p{L}[\p{L}'’-]{1,29}$/u.test(p)) return '';
  return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR');
}

/** Texto padrão da oferta. Só usa o que a conta tem de fato; números que podem mudar até o envio ficam de fora. */
export function textoOfertaPro(c) {
  const nome = primeiroNome(c?.nome);
  const empresa = textoLimpo(c?.empresa, 60);
  const preco = reais(PRECO_PRO.mensalCentavos);
  const orcamentos = inteiro(c?.orcamentos);
  const enviados = inteiro(c?.enviosTotal);
  const uso = orcamentos === 1 ? 'Você já criou 1 orçamento no OLLI' : `Você já criou ${orcamentos} orçamentos no OLLI`;
  const envio = enviados === 0 ? '' : enviados === 1 ? ' e enviou 1 ao cliente' : ` e enviou ${enviados} ao cliente`;
  const assunto = empresa
    ? `${empresa}: o plano Pro do OLLI não tem limite de envios`
    : 'O plano Pro do OLLI não tem limite de envios';
  return {
    assunto: assunto.slice(0, 150),
    paragrafos: [
      nome ? `Olá, ${nome}!` : 'Olá!',
      `${uso}${envio}. O plano Grátis permite até ${LIMITE_ENVIOS_GRATIS_MES} envios por mês. O Pro (${preco}/mês) não tem esse limite e libera também orçamento sem o selo "Feito com OLLI", follow-up automático de orçamento sem resposta e link do orçamento com pagamento na hora.`,
      `Para assinar com Pix: entre com a sua conta em app.olliorcamentos.online, abra Planos, escolha Pro e toque em "Pix — ${preco} (1 mês)". Pague pelo QR ou copia-e-cola. Vale por 1 mês, sem renovação automática.`,
      'Equipe OLLI',
    ],
  };
}

/** Saúde dos e-mails: sent = enviado, dead_letter = falhou, qualquer outro status = ainda na fila. */
export async function resumoEmails(env, { dias = 7, fetchImpl = fetch } = {}) {
  const d = Number(dias);
  if (!Number.isInteger(d) || d < 1 || d > 90) throw falha('dias_invalido');
  const j = await chamarRpcServico(configDe(env), fetchImpl, 'admin_emails_resumo', { p_dias: d });
  if (!j || !Array.isArray(j.porTemplate) || !Array.isArray(j.supressoes)) throw falha('resposta_invalida');
  const tipos = new Map();
  for (const x of j.porTemplate) {
    const template = textoLimpo(x?.template, 60);
    const n = inteiro(x?.n);
    const linha = tipos.get(template) ?? { template, nome: EMAILS_TIPOS[template] ?? template, enviados: 0, naFila: 0, falhos: 0, total: 0 };
    if (x?.status === 'sent') linha.enviados += n;
    else if (x?.status === 'dead_letter') linha.falhos += n;
    else linha.naFila += n;
    linha.total += n;
    tipos.set(template, linha);
  }
  const sup = { descadastro: 0, hard_bounce: 0, complaint: 0 };
  for (const s of j.supressoes) if (s?.motivo in sup) sup[s.motivo] = inteiro(s.n);
  return { dias: d, tipos: [...tipos.values()].sort((a, b) => b.total - a.total), supressoes: sup };
}

/** Contas com uso real + motivo da oferta ('sairia' ou o primeiro portão que barra). */
export async function candidatasOfertaPro(env, { userIds = null, limite = 100, fetchImpl = fetch, now = () => new Date() } = {}) {
  if (userIds !== null && (!Array.isArray(userIds) || userIds.length < 1 || userIds.length > OFERTA_PRO_MAX_CONTAS)) {
    throw falha('lista_invalida');
  }
  const lim = Number(limite);
  if (!Number.isInteger(lim) || lim < 1 || lim > 200) throw falha('limite_invalido');
  const linhas = await chamarRpcServico(configDe(env), fetchImpl, 'admin_oferta_pro_candidatas', {
    p_user_ids: userIds,
    p_limite: lim,
  }, { limiteBytes: CANDIDATAS_MAX_BYTES });
  if (!Array.isArray(linhas)) throw falha('resposta_invalida');
  const agora = now();
  return linhas
    .map((l) => l?.candidata)
    .filter((c) => c && UUID_RE.test(String(c.userId)))
    .map((c) => ({
      userId: String(c.userId).toLowerCase(),
      nome: textoLimpo(c.nome, 80),
      empresa: textoLimpo(c.empresa, 80),
      orcamentos: inteiro(c.orcamentos),
      enviosTotal: inteiro(c.enviosTotal),
      enviosMes: inteiro(c.enviosMes),
      ultimoUso: typeof c.ultimoUso === 'string' ? c.ultimoUso : null,
      testeFim: typeof c.testeFim === 'string' ? c.testeFim : null,
      plano: typeof c.fatos?.plano === 'string' ? c.fatos.plano : null,
      motivo: decidirOferta(c.fatos && typeof c.fatos === 'object' ? c.fatos : null, { agora }),
    }));
}

/**
 * POST { userIds: [...], enviar: boolean, motivo, confirmar, requestId }.
 * Ensaio (enviar=false): devolve quem sairia e por quê, com o texto de cada um. Não grava nada.
 * Envio (enviar=true): exige motivo e `confirmar` = quantidade de contas (digitada no painel); audita antes.
 */
export async function enviarOfertaPro(env, actor, body, { auditar, fetchImpl = fetch, now = () => new Date() } = {}) {
  const brutos = Array.isArray(body?.userIds) ? body.userIds.map((x) => String(x).toLowerCase()) : [];
  const ids = [...new Set(brutos)];
  if (ids.length < 1 || ids.length > OFERTA_PRO_MAX_CONTAS || ids.length !== brutos.length || ids.some((x) => !UUID_RE.test(x))) {
    return json({ ok: false, erro: 'lista_invalida' }, 400);
  }
  const enviar = body?.enviar === true;
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : '';
  if (enviar) {
    if (motivo.length < 3 || motivo.length > 200) return json({ ok: false, erro: 'motivo_invalido' }, 400);
    if (body?.confirmar !== ids.length) return json({ ok: false, erro: 'confirmacao_divergente' }, 409);
  }
  let candidatas;
  try {
    candidatas = await candidatasOfertaPro(env, { userIds: ids, limite: ids.length, fetchImpl, now });
  } catch (e) {
    return json({ ok: false, erro: e.codigo === 'supabase_nao_configurado' ? e.codigo : 'banco_indisponivel' }, 503);
  }
  const porId = new Map(candidatas.map((c) => [c.userId, c]));
  const semUso = ids.filter((id) => !porId.has(id));
  const ofertas = ids.filter((id) => porId.has(id)).map((id) => ({ userId: id, ...textoOfertaPro(porId.get(id)) }));
  if (!ofertas.length) {
    return json({ ok: true, modo: enviar ? 'envio' : 'ensaio', total: ids.length, contagens: { sem_uso: semUso.length }, itens: semUso.map((userId) => ({ userId, motivo: 'sem_uso' })) });
  }
  if (enviar) {
    const auditoria = await auditar(env, actor, {
      acao: 'email_oferta_pro_enviar',
      motivo,
      depois: { contas: ofertas.length, semUso: semUso.length },
      requestId: typeof body.requestId === 'string' && body.requestId.length >= 16 ? body.requestId.slice(0, 128) : crypto.randomUUID(),
    });
    if (!auditoria) return json({ ok: false, erro: 'auditoria_indisponivel' }, 503);
  }
  let r;
  try {
    r = await executarOfertaPro(env, ofertas, { enviar, fetchImpl, now });
  } catch (e) {
    return json({ ok: false, erro: String(e.codigo || 'oferta_falhou').replace(/[^a-z_0-9]/g, '').slice(0, 40) }, 502);
  }
  const textos = enviar ? undefined : Object.fromEntries(ofertas.map((o) => [o.userId, { assunto: o.assunto, paragrafos: o.paragrafos }]));
  const itens = [...r.itens, ...semUso.map((userId) => ({ userId, motivo: 'sem_uso' }))];
  const contagens = { ...r.contagens };
  if (semUso.length) contagens.sem_uso = semUso.length;
  return json({ ok: true, modo: r.modo, total: ids.length, contagens, itens, textos });
}

/** GET /admin/api/emails/resumo?dias=7 */
export async function rotaResumoEmails(env, url, opcoes = {}) {
  const dias = Number(url?.searchParams?.get('dias') ?? 7);
  try {
    return json({ ok: true, resumo: await resumoEmails(env, { dias, ...opcoes }) });
  } catch (e) {
    if (e.codigo === 'dias_invalido') return json({ ok: false, erro: e.codigo }, 400);
    return json({ ok: false, erro: e.codigo === 'supabase_nao_configurado' ? e.codigo : 'banco_indisponivel' }, 503);
  }
}

/** GET /admin/api/emails/oferta-pro/candidatas */
export async function rotaCandidatasOfertaPro(env, opcoes = {}) {
  try {
    return json({ ok: true, candidatas: await candidatasOfertaPro(env, { limite: 100, ...opcoes }) });
  } catch (e) {
    return json({ ok: false, erro: e.codigo === 'supabase_nao_configurado' ? e.codigo : 'banco_indisponivel' }, 503);
  }
}
