/**
 * LINK DE PAGAMENTO DO PRO POR CONTA (CQ-LINK-PAGAR-PRO, decisão do Salomão 19/11/2026).
 *
 *   GET  /pagar/pro/<token>  → página: plano, preço, o que entra no Pro, conta mascarada.
 *                              Com cobrança do link pendente: o Pix (copia e cola + QR) e a
 *                              conferência do pagamento. Paga: "Pagamento confirmado".
 *                              O GET NUNCA cria cobrança (pré-visualizador de WhatsApp/e-mail
 *                              abre o link sozinho).
 *   POST /pagar/pro/<token>  → cria a cobrança, ou reaproveita a pendente e válida da mesma
 *                              conta e plano, e volta para o GET (303).
 *
 * Atrás da chave LINK_PAGAMENTO_PRO ('true' liga; qualquer outra coisa = 404) e do segredo
 * LINK_PAGAMENTO_SECRET (ausente = 404 também: sem segredo não há link).
 *
 * REUSO (nada de caminho novo de dinheiro):
 *  - criação: `criarCobrancaPlano` (abacate.js), a mesma do POST /abacate/plano/pix;
 *  - liberação: `liberarSePaga` (abacate.js), a mesma do webhook e do GET /abacate/status,
 *    com o vínculo conferido contra a conta do token (cobrança alheia não libera nada);
 *  - preço: PLANO_PIX.pro_mensal (fonte única); texto do Pro: planosBase.ts (a tela Planos);
 *  - cobrança pendente: a linha `pix_cobranca` em webhook_events (a do lembrete de vencimento),
 *    que no link leva também `origem:'link'` e o copia e cola;
 *  - limite: ABACATE_RL, por IP e por token, fail-closed (`rateOkSensivel`).
 *
 * SEGURANÇA: o link só permite PAGAR por aquela conta e ver o e-mail mascarado. Não mostra
 * orçamento, cliente, telefone nem nome. O token não vai para log: nenhuma linha daqui loga
 * URL, caminho ou token, e exceção não sobe para o Sentry com a URL (catch no topo).
 */
import { planoBase } from '../../src/services/planosBase.ts';
import { qrSvg } from '../../src/utils/qrcode.ts';
import { criarCobrancaPlano, liberarSePaga, modoAbacate, ORIGEM_PIX_COBRANCA } from './abacate.js';
import { FONTES_CSS } from './fontesProprias.js';
import { sha256Hex } from './googleAuth.js';
import { PLANO_PIX } from './mercadopago.js';
import { rateOkSensivel } from './rateLimit.js';
import { buscarEventos } from './webhookEvents.js';
import { segredoLinkPro, verificarLinkPro } from './linkProToken.js';

export const LINK_PRO_PREFIXO = '/pagar/pro/';
const PLANO_KEY = 'pro_mensal';
/** Cobrança do link considerada "a mesma" enquanto faltar mais que isto para vencer. */
const MARGEM_REUSO_MS = 10 * 60 * 1000;
/** Só olha cobranças do link criadas nas últimas 25 h (o Pix vale 24 h). */
const JANELA_COBRANCA_MS = 25 * 3600 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A rota está ligada? (chave + segredo válido). Exportada para o teste e para o index. */
export function linkProLigado(env) {
  return env.LINK_PAGAMENTO_PRO === 'true' && !!segredoLinkPro(env.LINK_PAGAMENTO_SECRET);
}

function naoEncontrado() {
  return new Response(JSON.stringify({ erro: 'nao_encontrado' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ─── entrada ────────────────────────────────────────────────
export async function handleLinkPagarPro(request, env, url) {
  if (!linkProLigado(env)) return naoEncontrado();
  try {
    return await atender(request, env, url);
  } catch (e) {
    // Nunca relança: a exceção levaria a URL (com o token) para o Sentry.
    console.error('[olli-linkpro] falha inesperada:', e && e.name);
    return pagina({ status: 500, titulo: 'Algo deu errado', texto: 'Não conseguimos abrir o pagamento agora. Tente de novo em alguns minutos.', tom: 'erro' });
  }
}

async function atender(request, env, url) {
  const token = url.pathname.slice(LINK_PRO_PREFIXO.length);
  if (!token || token.includes('/')) return paginaInvalido();
  const metodo = request.method;
  if (metodo !== 'GET' && metodo !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' } });
  }

  // Teto por IP ANTES de olhar o token (barra quem tenta adivinhar), depois por token.
  const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
  if (!(await rateOkSensivel(env, env.ABACATE_RL, `linkpro:ip:${ip}`))) return paginaLimite();

  const v = await verificarLinkPro(segredoLinkPro(env.LINK_PAGAMENTO_SECRET), token);
  if (!v.ok) return v.motivo === 'vencido' ? paginaVencido() : paginaInvalido();
  const tokenHash = (await sha256Hex(token)).slice(0, 32);
  if (!(await rateOkSensivel(env, env.ABACATE_RL, `linkpro:tk:${tokenHash}`))) return paginaLimite();

  if (modoAbacate(env) === 'desligado') return paginaIndisponivel();

  const uid = v.uid;
  const conta = await emailDaConta(env, uid);
  if (!conta.ok) return paginaIndisponivel();
  if (!conta.email) return paginaInvalido(); // conta apagada/inexistente = link inválido
  const contaMascarada = mascararEmail(conta.email);

  const plano = PLANO_PIX[PLANO_KEY];
  // 1º a cobrança DESTE link (não cria nada): paga = "confirmado", mesmo que o Pro agora apareça como vigente.
  const ultima = await ultimaCobrancaDoLink(env, uid);
  if (!ultima.ok) return paginaIndisponivel();

  let pendente = null;
  if (ultima.linha) {
    const r = await liberarSePaga(env, ultima.linha.event_id, uid);
    if (r.estado === 'liberado') return paginaConfirmado(contaMascarada);
    if (r.estado === 'indisponivel') return paginaIndisponivel();
    if (r.estado === 'pendente' && cobrancaReutilizavel(ultima.linha)) pendente = ultima.linha;
  }

  // Regra da CPO (19/11): nunca cobrar em dobro. Confere o Pro vigente por TODAS as origens antes de vender.
  const sinais = await sinaisDoPlano(env, uid);
  if (!sinais.ok) return paginaNaoConferi();
  const sit = decidirVenda({ ...sinais });
  if (sit.bloqueia) return paginaJaAtivo(contaMascarada, sit);

  if (metodo === 'POST') {
    if (!pendente) {
      const criada = await criarCobrancaPlano(env, { userId: uid, plano, origem: 'link' });
      if (!criada.ok) {
        return pagina({ status: 502, titulo: 'Não conseguimos gerar o Pix', texto: 'Tente de novo em alguns minutos.', tom: 'erro' });
      }
      // Sem a linha gravada o GET não reencontra a cobrança: mostra o Pix já, nesta resposta.
      if (!criada.gravou) {
        return paginaPix({ contaMascarada, plano, sit, brCode: criada.data.brCode, expiraEm: criada.data.expiresAt, url });
      }
    }
    return new Response(null, { status: 303, headers: { Location: url.pathname, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }

  if (pendente) {
    return paginaPix({ contaMascarada, plano, sit, brCode: pendente.payload.br_code, expiraEm: pendente.payload.expires_at, url });
  }
  return paginaOferta({ contaMascarada, plano, sit });
}

// ─── dados ──────────────────────────────────────────────────
/** E-mail da conta pelo Auth admin. `{ ok:true, email|null }` (null = não existe) ou `{ ok:false }`. */
async function emailDaConta(env, uid) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (r.status === 404) return { ok: true, email: null };
    if (!r.ok) return { ok: false };
    const j = await r.json().catch(() => null);
    const email = j && (j.email || (j.user && j.user.email));
    return { ok: true, email: typeof email === 'string' && email.includes('@') ? email : null };
  } catch {
    return { ok: false };
  }
}

/** "joao@gmail.com" → "j***@gmail.com". Nunca devolve o e-mail inteiro. */
export function mascararEmail(email) {
  const [local, dominio] = String(email || '').split('@');
  if (!local || !dominio) return '***';
  return `${local[0]}***@${dominio}`;
}

/** Pix avulso só renova nos últimos N dias do Pro já pago (antes disso não vende: seria cobrar 2 meses juntos). */
export const RENOVAR_ULTIMOS_DIAS = 7;
/**
 * Teste do Pro (trial) NÃO bloqueia: quem está no teste é justamente quem o link quer converter. O Pix pago começa
 * na hora (o teste não fica em `assinaturas`). Confirmar com a CPO; desligar aqui bloqueia a venda durante o teste.
 */
export const VENDE_DURANTE_TESTE = true;

const ATIVO = (st) => !!st && !['canceled', 'unpaid', 'incomplete_expired', 'expired'].includes(st);
const ms = (v) => (v ? Date.parse(v) : NaN);

/**
 * Regra pura: dado o que o banco diz da conta, vende ou bloqueia. Origens que BLOQUEIAM (Pro/Empresa pago vigente):
 * Empresa; cartão (Stripe); Play/Apple (RevenueCat); Pix Automático ativo; override do admin (Pro ou Empresa).
 * Pix avulso vigente: bloqueia, salvo nos últimos RENOVAR_ULTIMOS_DIAS (aí vende e o mês novo começa no fim do atual).
 * Devolve { bloqueia, plano, ate, proAte, origem }.
 */
export function decidirVenda({ assinatura: a, paAtiva, testeAte, agora = Date.now() }) {
  const fim = ms(a?.current_period_end);
  const vigente = !!a && ATIVO(a.status) && Number.isFinite(fim) && fim > agora && ['pro', 'empresa'].includes(a.plano);
  const overrideAte = ms(a?.admin_override_ate);
  const override = !!a && a.admin_override_ativo === true && ['pro', 'empresa'].includes(a.admin_plano_override)
    && (!a.admin_override_ate || overrideAte >= agora);
  const rcAte = ms(a?.revenuecat_vigencia_ate);
  const loja = !!a && !!a.revenuecat_transacao_id && ((Number.isFinite(rcAte) && rcAte > agora) || vigente);

  if (override) return { bloqueia: true, plano: a.admin_plano_override, ate: Number.isFinite(overrideAte) ? overrideAte : null, origem: 'override' };
  if (vigente && a.plano === 'empresa') return { bloqueia: true, plano: 'empresa', ate: fim, origem: 'empresa' };
  if (vigente && a.stripe_subscription_id) return { bloqueia: true, plano: a.plano, ate: fim, origem: 'cartao' };
  if (loja) return { bloqueia: true, plano: 'pro', ate: Number.isFinite(rcAte) ? rcAte : fim, origem: 'loja' };
  if (paAtiva) return { bloqueia: true, plano: 'pro', ate: vigente ? fim : null, origem: 'pix_automatico' };
  if (vigente) {
    if (fim - agora > RENOVAR_ULTIMOS_DIAS * 864e5) return { bloqueia: true, plano: 'pro', ate: fim, origem: 'pix_avulso' };
    return { bloqueia: false, proAte: fim, origem: 'pix_avulso_renovacao' };
  }
  if (testeAte && testeAte > agora && !VENDE_DURANTE_TESTE) return { bloqueia: true, plano: 'pro', ate: testeAte, origem: 'teste' };
  return { bloqueia: false, proAte: null, origem: testeAte && testeAte > agora ? 'teste' : 'gratis' };
}

/**
 * Tudo que decide a venda, de uma vez. `{ ok:false }` se QUALQUER leitura falhar (3º estado: não gera Pix).
 * assinaturas (todas as colunas de origem) + Pix Automático ativo (webhook_events) + teste ativo (trials_comerciais).
 */
async function sinaisDoPlano(env, uid) {
  const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const u = encodeURIComponent(uid);
  try {
    const cols = 'user_id,plano,status,current_period_end,stripe_subscription_id,revenuecat_transacao_id,revenuecat_vigencia_ate,admin_override_ativo,admin_override_ate,admin_plano_override';
    const [ra, rt, pa] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/assinaturas?user_id=eq.${u}&select=${cols}&limit=1`, { headers: h }),
      fetch(`${env.SUPABASE_URL}/rest/v1/trials_comerciais?owner_user_id=eq.${u}&estado=eq.active&select=termina_em&order=termina_em.desc&limit=1`, { headers: h }),
      buscarEventos(env, 'abacate_pa_sub', { user_id: uid, estado: 'ativa' }, 1),
    ]);
    if (!ra.ok || !rt.ok || !pa || !pa.ok) return { ok: false };
    const la = await ra.json();
    const lt = await rt.json();
    if (!Array.isArray(la) || !Array.isArray(lt)) return { ok: false };
    const testeAte = lt[0] ? ms(lt[0].termina_em) : null;
    return { ok: true, assinatura: la[0] || null, paAtiva: pa.linhas.length > 0, testeAte: Number.isFinite(testeAte) ? testeAte : null };
  } catch {
    return { ok: false };
  }
}

/** A cobrança do link mais recente da conta (últimas 25 h), ou null. `{ ok:false }` = não deu para saber. */
async function ultimaCobrancaDoLink(env, uid) {
  if (!UUID_RE.test(uid)) return { ok: true, linha: null };
  const r = await buscarEventos(env, ORIGEM_PIX_COBRANCA, { user_id: uid, origem: 'link' }, 50);
  if (!r.ok) return { ok: false };
  const agora = Date.now();
  const linhas = r.linhas
    .filter((l) => l && typeof l.event_id === 'string' && l.payload && l.payload.plano === PLANO_KEY)
    .filter((l) => agora - Date.parse(l.recebido_em) < JANELA_COBRANCA_MS)
    .sort((x, y) => Date.parse(y.recebido_em) - Date.parse(x.recebido_em));
  return { ok: true, linha: linhas[0] || null };
}

function cobrancaReutilizavel(linha) {
  const exp = Date.parse(linha.payload && linha.payload.expires_at);
  return typeof linha.payload.br_code === 'string' && linha.payload.br_code.length > 20 && Number.isFinite(exp) && exp - Date.now() > MARGEM_REUSO_MS;
}

// ─── páginas ────────────────────────────────────────────────
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const reais = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const data = (ms) => new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

/** As 3 primeiras linhas do Pro na tela Planos (sem o "Tudo do plano Grátis"). Fonte única: planosBase.ts. */
export function linhasDoPro() {
  return planoBase('pro').beneficios.filter((b) => b !== 'Tudo do plano Grátis').slice(0, 3);
}

function blocoPlano(plano, contaMascarada, sit) {
  const itens = linhasDoPro().map((b) => `<li>${esc(b)}</li>`).join('');
  const aviso = sit && sit.proAte
    ? `<p class="nota">Seu Pro vale até ${esc(data(sit.proAte))}. Se pagar agora, o novo mês começa quando esse prazo terminar.</p>`
    : '';
  return `<div class="plano">
      <div class="nome">OLLI Pro · mensal</div>
      <div class="preco">${esc(reais(plano.valor))}<span> por 1 mês, no Pix</span></div>
    </div>
    <ul class="lista">${itens}</ul>
    <p class="conta">Conta: <strong>${esc(contaMascarada)}</strong></p>${aviso}`;
}

function paginaOferta({ contaMascarada, plano, sit }) {
  return pagina({
    titulo: 'Assinar o OLLI Pro',
    corpo: `${blocoPlano(plano, contaMascarada, sit)}
    <form method="post"><button type="submit" class="btn">Gerar Pix de ${esc(reais(plano.valor))}</button></form>
    <p class="mini">O Pix gerado vale por 24 horas. O Pro é liberado na conta acima assim que o pagamento é confirmado.</p>`,
    formSelf: true,
  });
}

function paginaPix({ contaMascarada, plano, sit, brCode, expiraEm, url }) {
  let svg = '';
  try {
    svg = qrSvg(brCode).replace('QR code do equipamento', 'QR code do Pix');
  } catch {
    svg = '';
  }
  const exp = Date.parse(expiraEm);
  const nonce = base64Nonce();
  return pagina({
    titulo: 'Pague com Pix',
    refresh: 15,
    nonce,
    corpo: `${blocoPlano(plano, contaMascarada, sit)}
    ${svg ? `<div class="qr">${svg}</div>` : ''}
    <label class="rot" for="cc">Pix copia e cola</label>
    <textarea id="cc" class="cc" readonly rows="4">${esc(brCode)}</textarea>
    <button type="button" class="btn" id="copiar">Copiar código Pix</button>
    <p class="mini" id="copiado" role="status" aria-live="polite"></p>
    ${Number.isFinite(exp) ? `<p class="mini">Vale até ${esc(data(exp))} às ${esc(hora(exp))}.</p>` : ''}
    <p class="espera">Depois de pagar, esta página confere sozinha. <a href="${esc(url.pathname)}">Já paguei, conferir agora</a></p>
    <script nonce="${nonce}">
      document.getElementById('copiar').addEventListener('click', function () {
        var t = document.getElementById('cc'); var ok = document.getElementById('copiado');
        function feito() { ok.textContent = 'Código copiado. Cole no app do seu banco, na opção Pix copia e cola.'; }
        if (navigator.clipboard) { navigator.clipboard.writeText(t.value).then(feito, function () { t.select(); }); }
        else { t.select(); try { document.execCommand('copy'); feito(); } catch (e) {} }
      });
    </script>`,
  });
}

function paginaConfirmado(contaMascarada) {
  return pagina({
    titulo: 'Pagamento confirmado, seu Pro está ativo',
    tom: 'ok',
    corpo: `<p class="texto">O plano Pro já está liberado na conta <strong>${esc(contaMascarada)}</strong>. Abra o app OLLI para usar.</p>`,
  });
}

function paginaJaAtivo(contaMascarada, sit) {
  const nome = sit.plano === 'empresa' ? 'Empresa' : 'Pro';
  return pagina({
    titulo: `Seu plano ${nome} já está ativo`,
    tom: 'ok',
    corpo: `<p class="texto">${sit.ate ? `Você já tem o ${nome} até ${esc(data(sit.ate))}` : `Você já tem o ${nome} ativo`} na conta <strong>${esc(contaMascarada)}</strong>. Não há nada a pagar por este link.</p>
    <p class="texto">${COMO_GERENCIAR[sit.origem] || COMO_GERENCIAR.padrao}</p>`,
  });
}

const COMO_GERENCIAR = {
  cartao: 'Para mudar ou cancelar, abra Planos no app ou no painel (app.olliorcamentos.online/planos).',
  loja: 'Essa assinatura é pela loja do celular (Google Play ou App Store): mude ou cancele por lá.',
  pix_automatico: 'É o Pix Automático: ele renova sozinho. Para cancelar, abra Planos no app ou o app do seu banco.',
  pix_avulso: `Perto do vencimento (nos últimos ${RENOVAR_ULTIMOS_DIAS} dias) este link deixa renovar.`,
  padrao: 'Para mudar o plano, abra Planos no app ou no painel (app.olliorcamentos.online/planos).',
};
const paginaNaoConferi = () => pagina({ status: 503, titulo: 'Não consegui conferir seu plano', texto: 'Para não cobrar em dobro, só gero o Pix depois de conferir se você já tem o Pro. Tente de novo em alguns minutos.', tom: 'erro' });
const paginaInvalido = () => pagina({ status: 404, titulo: 'Link inválido', texto: 'Este link de pagamento não é válido. Peça um novo a quem enviou.', tom: 'erro' });
const paginaVencido = () => pagina({ status: 410, titulo: 'Este link venceu', texto: 'Links de pagamento valem 14 dias. Peça um novo a quem enviou, ou assine pela tela Planos no app OLLI.', tom: 'erro' });
const paginaLimite = () => pagina({ status: 429, titulo: 'Muitas tentativas', texto: 'Espere um minuto e abra o link de novo.', tom: 'erro' });
const paginaIndisponivel = () => pagina({ status: 503, titulo: 'Pagamento indisponível agora', texto: 'Não conseguimos abrir o pagamento neste momento. Tente de novo em alguns minutos.', tom: 'erro' });

function base64Nonce() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

function pagina({ status = 200, titulo, texto = '', corpo = '', tom = 'neutro', refresh = 0, nonce = '', formSelf = false }) {
  const cor = tom === 'ok' ? '#15B66E' : tom === 'erro' ? '#C0392B' : '#0A2540';
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    'font-src https://olliorcamentos.online',
    nonce ? `script-src 'nonce-${nonce}'` : '',
    "base-uri 'none'",
    `form-action ${formSelf ? "'self'" : "'none'"}`,
    "frame-ancestors 'none'",
  ].filter(Boolean).join('; ');
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex, nofollow"/>
<meta name="referrer" content="no-referrer"/>
${refresh ? `<meta http-equiv="refresh" content="${refresh}"/>` : ''}
<title>${esc(titulo)} · OLLI</title>
<style>${FONTES_CSS}</style>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif;background:#EAEEF3;color:#1A2230;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 14px}
  .wrap{max-width:440px;width:100%}
  .card{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(10,37,64,.14)}
  .hd{background:linear-gradient(140deg,#0B6FCE,#0A2540);height:8px}
  .body{padding:32px 26px 28px}
  h1{font-family:'Spectral',Georgia,serif;font-size:23px;font-weight:700;color:${cor};line-height:1.25}
  .texto{font-size:15px;color:#5A6575;margin-top:12px;line-height:1.55}
  .plano{margin-top:18px;padding:16px;border-radius:14px;background:#F6F8FB;border:1px solid #EDEFF2}
  .nome{font-weight:700;font-size:15px}
  .preco{font-size:26px;font-weight:800;color:#0A2540;margin-top:4px}
  .preco span{font-size:13px;font-weight:600;color:#5A6575}
  .lista{margin:14px 0 0 18px;font-size:14px;line-height:1.55;color:#33404F}
  .lista li{margin-top:4px}
  .conta{margin-top:14px;font-size:14px;color:#33404F}
  .nota{margin-top:10px;font-size:13px;color:#5A6575;line-height:1.5}
  .btn{display:block;width:100%;min-height:48px;margin-top:18px;border:0;border-radius:14px;background:#0B6FCE;color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer}
  .btn:focus-visible,a:focus-visible,.cc:focus-visible{outline:3px solid #F5A623;outline-offset:2px}
  .qr{margin:18px auto 4px;width:220px;height:220px}
  .qr svg{width:100%;height:100%}
  .rot{display:block;margin-top:14px;font-size:13px;font-weight:700;color:#33404F}
  .cc{width:100%;margin-top:6px;padding:10px;border:1px solid #D5DAE1;border-radius:10px;font:12px/1.4 ui-monospace,monospace;color:#1A2230;resize:none;word-break:break-all}
  .mini{font-size:12px;color:#8A93A2;margin-top:10px;line-height:1.5}
  .espera{font-size:13px;color:#5A6575;margin-top:16px;line-height:1.5}
  .espera a{color:#0B6FCE;font-weight:700;display:inline-block;padding:10px 0;min-height:44px}
  .foot{text-align:center;font-size:12px;color:#9AA3B2;margin-top:20px;font-weight:600}
</style>
</head>
<body>
  <main class="wrap">
    <div class="card">
      <div class="hd"></div>
      <div class="body">
        <h1>${esc(titulo)}</h1>
        ${texto ? `<p class="texto">${esc(texto)}</p>` : ''}
        ${corpo}
      </div>
    </div>
    <div class="foot">OLLI Orçamentos</div>
  </main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': csp,
    },
  });
}
