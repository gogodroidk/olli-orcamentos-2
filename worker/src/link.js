/**
 * Link público do cliente — OLLI.
 *
 * GET  /o/<token>  → página web (tema claro) onde o cliente vê o orçamento e
 *                    aprova / recusa / fala no WhatsApp. Sem login.
 * POST /o/<token>  → grava a resposta (aprovado/recusado) no Supabase.
 *
 * Segurança:
 *  - Lê/escreve em public.orcamentos_publicos via SERVICE_ROLE (a tabela tem RLS
 *    só para o dono autenticado; o cliente público NÃO consegue ler pela anon key).
 *  - O TOKEN (128 bits) é a única credencial — validado por formato + match exato.
 *  - TODO dado do usuário é escapado antes de entrar no HTML (anti-XSS).
 */

const ACCENT = '#0B6FCE';

// ─── helpers seguros ─────────────────────────────────────────
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function digits(v) {
  return String(v ?? '').replace(/\D/g, '');
}

function formatBRL(v) {
  const n = Number(v) || 0;
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const intF = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}R$ ${intF},${dec}`;
}

function formatData(s) {
  if (!s) return '';
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // Fallback: tenta interpretar qualquer outro formato; senão, esconde o campo.
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  return '';
}

function validToken(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(t);
}

function safeHexColor(v, fallback = ACCENT) {
  const s = String(v ?? '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : fallback;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // Defesa em profundidade: mesmo com todo dado escapado, o CSP barra
      // exfiltração externa. A página usa <script>/<style> inline + Google Fonts.
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'",
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ─── acesso ao Supabase (service role; bypassa RLS) ──────────
function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

// Colunas explícitas (menor privilégio): só o que a página precisa — nunca
// puxa colunas internas futuras (custo, margem, observações) pra borda.
const SELECT_COLS = 'token,status,cliente_nome,prestador_nome,prestador_whatsapp,numero,valor_total,dados';

/** Retorna a linha, `null` se não existir, ou `{ error:true }` em falha de backend. */
async function getRow(env, token) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orcamentos_publicos?token=eq.${encodeURIComponent(token)}&select=${SELECT_COLS}&limit=1`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return { error: true };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { error: true };
    return arr.length ? arr[0] : null;
  } catch {
    return { error: true };
  }
}

/**
 * Grava a resposta de forma ATÔMICA: o filtro `status=not.in.(aprovado,recusado)`
 * entra na própria query, então o UPDATE só afeta linhas ainda não respondidas
 * (first-writer-wins no Postgres — fecha a janela de corrida do read-then-write).
 * Retorna { error:true } em falha, ou { rows } (vazio = já respondido / inexistente).
 */
async function patchStatus(env, token, status, mensagem) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orcamentos_publicos?token=eq.${encodeURIComponent(token)}&status=not.in.(aprovado,recusado)`,
      {
        method: 'PATCH',
        headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ status, resposta_cliente: mensagem ?? null, respondido_em: new Date().toISOString() }),
      },
    );
    if (!r.ok) return { error: true };
    const arr = await r.json().catch(() => []);
    return { rows: Array.isArray(arr) ? arr : [] };
  } catch {
    return { error: true };
  }
}

// ─── POST /o/<token> — registra resposta do cliente ──────────
export async function responderLink(token, request, env) {
  if (!validToken(token)) return json({ ok: false, erro: 'token_invalido' }, 400);
  // Rate limit por IP: endpoint público sem login — barra abuso/brute-force.
  if (env.LINK_RL) {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (ip) {
      try {
        const { success } = await env.LINK_RL.limit({ key: ip });
        if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
      } catch {
        // binding ausente: não bloqueia
      }
    }
  }
  // Rejeita payload grande ANTES de parsear (endpoint público sem login).
  if (Number(request.headers.get('content-length') || 0) > 4096) {
    return json({ ok: false, erro: 'payload_grande' }, 413);
  }
  let body = {};
  try { body = await request.json(); } catch { /* corpo opcional */ }
  const acao = body.acao === 'recusar' ? 'recusado' : body.acao === 'aprovar' ? 'aprovado' : null;
  if (!acao) return json({ ok: false, erro: 'acao_invalida' }, 400);
  const mensagem = typeof body.mensagem === 'string' ? body.mensagem.slice(0, 500) : null;
  const row = await getRow(env, token);
  if (row && row.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (!row) return json({ ok: false, erro: 'nao_encontrado' }, 404);

  const dados = (row && typeof row.dados === 'object' && row.dados) ? row.dados : {};
  if (acao === 'aprovado' && dados.exibirAprovacao === false) {
    return json({ ok: false, erro: 'aprovacao_desativada' }, 403);
  }
  if (acao === 'recusado' && dados.exibirRecusa === false) {
    return json({ ok: false, erro: 'recusa_desativada' }, 403);
  }
  if (row.status === 'aprovado' || row.status === 'recusado') {
    return json({ ok: true, status: row.status, jaRespondido: true });
  }

  // Escrita atômica: só grava se ainda não foi respondido (first-writer-wins).
  const res = await patchStatus(env, token, acao, mensagem);
  if (res.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (res.rows.length) return json({ ok: true, status: acao });

  // Não afetou nada: ou não existe, ou já foi respondido. Relê para distinguir.
  const atual = await getRow(env, token);
  if (atual && atual.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (!atual) return json({ ok: false, erro: 'nao_encontrado' }, 404);
  return json({ ok: true, status: atual.status, jaRespondido: true });
}

// ─── GET /o/<token> — página do cliente ──────────────────────
export async function renderLinkPage(token, env) {
  if (!validToken(token)) return html(pageErro('Link inválido', 'Confira o endereço que você recebeu.'), 400);
  const row = await getRow(env, token);
  if (row && row.error) return html(pageErro('Erro temporário', 'Não consegui carregar agora. Recarregue em alguns instantes.'), 503);
  if (!row) return html(pageErro('Orçamento não encontrado', 'Este link pode ter expirado ou sido removido.'), 404);
  return html(pageOrcamento(row));
}

// ─── páginas ─────────────────────────────────────────────────
function shell(inner, accentRaw = ACCENT) {
  const accent = safeHexColor(accentRaw, ACCENT);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex, nofollow"/>
<title>Orçamento · OLLI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Spectral:wght@600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif;background:#EAEEF3;color:#1A2230;-webkit-font-smoothing:antialiased;padding:24px 14px 48px}
  .wrap{max-width:480px;margin:0 auto}
  .card{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(10,37,64,.14)}
  .hd{background:linear-gradient(140deg,${accent},#0A2540);padding:22px 22px 20px;color:#fff;display:flex;align-items:center;gap:12px}
  .hd-mark{width:42px;height:42px;border-radius:13px;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .hd-name{font-family:'Spectral',Georgia,serif;font-size:18px;font-weight:700}
  .hd-tag{font-size:12.5px;color:rgba(255,255,255,.8);margin-top:1px}
  .body{padding:22px}
  .eyebrow{font-size:12px;font-weight:700;color:#6B7686}
  .title{font-size:19px;font-weight:800;margin-top:3px;line-height:1.3}
  .meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px}
  .meta-txt{font-size:12.5px;color:#6B7686}
  .pill{font-size:11px;font-weight:700;color:${accent};border:1px solid #BBD6F2;background:#EAF3FC;border-radius:999px;padding:3px 10px}
  .items{margin-top:18px;border-top:1px solid #EDEFF2}
  .item{display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #EDEFF2}
  .item-name{font-size:14.5px;font-weight:600}
  .badge{font-size:9.5px;font-weight:800;color:${accent};background:#EAF3FC;border-radius:5px;padding:1px 6px;letter-spacing:.3px;vertical-align:middle}
  .item-desc{font-size:12px;color:#8A93A2;margin-top:2px}
  .item-qtd{font-size:12px;color:#8A93A2;margin-top:3px}
  .item-val{font-size:14px;font-weight:700;white-space:nowrap}
  .total{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding:15px 16px;background:#EAF3FC;border:1px solid #BBD6F2;border-radius:14px}
  .total-l{font-size:13px;font-weight:700;letter-spacing:.3px}
  .total-v{font-family:'Spectral',Georgia,serif;font-size:24px;font-weight:700;color:${accent}}
  .conds{display:flex;gap:10px;margin-top:16px}
  .cond{flex:1;background:#F6F8FB;border:1px solid #EDEFF2;border-radius:12px;padding:11px}
  .cond-l{font-size:9.5px;font-weight:800;letter-spacing:.8px;color:#9AA3B2;text-transform:uppercase}
  .cond-v{font-size:12.5px;color:#3C4756;margin-top:4px;line-height:1.4}
  .actions{margin-top:20px;display:flex;flex-direction:column;gap:10px}
  .btn{border:none;border-radius:14px;padding:15px;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none}
  .btn-aprovar{background:#15B66E;color:#fff;box-shadow:0 8px 20px rgba(21,182,110,.32)}
  .btn-row{display:flex;gap:10px}
  .btn-recusar{flex:1;background:#fff;color:#C0392B;border:1.5px solid #F0D2CE}
  .btn-zap{flex:1;background:#fff;color:#1A7F4B;border:1.5px solid #BFE6CF}
  .btn:active{transform:scale(.98)}
  .status-box{margin-top:20px;border-radius:14px;padding:18px;text-align:center}
  .status-ok{background:#E9F9F1;border:1px solid #BFE6CF}
  .status-no{background:#FDECEA;border:1px solid #F5C9C3}
  .status-emoji{font-size:30px}
  .status-title{font-size:16px;font-weight:800;margin-top:6px}
  .status-sub{font-size:13px;color:#5A6575;margin-top:3px}
  .foot{text-align:center;font-size:11px;color:#9AA3B2;margin-top:18px;font-weight:600}
  .err{background:#fff;border-radius:22px;padding:40px 26px;text-align:center;box-shadow:0 18px 50px rgba(10,37,64,.14)}
  .err-emoji{font-size:40px}
  .err-title{font-size:18px;font-weight:800;margin-top:10px}
  .err-sub{font-size:13.5px;color:#6B7686;margin-top:6px;line-height:1.5}
  .robot{width:26px;height:26px}
</style>
</head>
<body><div class="wrap">${inner}</div></body>
</html>`;
}

function olliRobot() {
  // Símbolo oficial OLLI (rebrand v3): balão-documento + olhos + check.
  return `<svg class="robot" viewBox="0 0 64 64" fill="none"><defs><linearGradient id="om" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3FD8EA"/><stop offset="1" stop-color="#0B6FCE"/></linearGradient></defs><path d="M22 49 L12 59.5 L30 50 Z" fill="url(#om)"/><rect x="9" y="8" width="46" height="44" rx="14.5" fill="url(#om)"/><rect x="13" y="11.5" width="38" height="15" rx="9" fill="#ffffff" opacity="0.1"/><rect x="20" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><rect x="35.5" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><path d="M19 41 l6.6 6.9 l16 -15" fill="none" stroke="#EAFEFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function pageErro(titulo, sub) {
  return shell(`<div class="err"><div class="err-emoji">🔍</div><div class="err-title">${esc(titulo)}</div><div class="err-sub">${esc(sub)}</div><div class="foot" style="margin-top:22px">enviado com OLLI</div></div>`);
}

function pageOrcamento(row) {
  const d = (row && typeof row.dados === 'object' && row.dados) ? row.dados : {};
  const prestador = (d.prestador && typeof d.prestador === 'object') ? d.prestador : {};
  const nomePrestador = prestador.nome || row.prestador_nome || 'Prestador';
  const tagline = prestador.tagline || '';
  const cliente = d.clienteNome || row.cliente_nome || '';
  const numero = d.numero || row.numero || '';
  const emitido = formatData(d.dataEmissao);
  const validade = formatData(d.validade);
  const total = (typeof d.valorTotal === 'number') ? d.valorTotal : Number(row.valor_total) || 0;
  const itens = (Array.isArray(d.itens) ? d.itens : []).filter((it) => it && typeof it === 'object');
  const whats = digits(prestador.whatsapp || row.prestador_whatsapp || '');
  const status = row.status || 'enviado';
  const respondido = status === 'aprovado' || status === 'recusado';
  const accent = safeHexColor(d.corMarca, ACCENT);
  const allowApprove = d.exibirAprovacao !== false;
  const allowReject = d.exibirRecusa !== false;

  const itensHtml = itens.map((it) => {
    const badge = it && it.isPeca ? ` <span class="badge">PEÇA</span>` : '';
    const desc = it && it.descricao ? `<div class="item-desc">${esc(it.descricao)}</div>` : '';
    const qtd = Number(it && it.quantidade) || 1;
    const unid = esc((it && it.unidade) || 'un');
    const preco = formatBRL(it && it.preco);
    const sub = formatBRL(it && (it.subtotal != null ? it.subtotal : (Number(it.preco) || 0) * qtd));
    return `<div class="item"><div><div class="item-name">${esc((it && it.nome) || 'Item')}${badge}</div>${desc}<div class="item-qtd">${qtd} ${unid} × ${preco}</div></div><div class="item-val">${sub}</div></div>`;
  }).join('');

  const conds = [];
  if (d.condicoesPagamento) conds.push(`<div class="cond"><div class="cond-l">Pagamento</div><div class="cond-v">${esc(d.condicoesPagamento)}</div></div>`);
  if (d.garantia) conds.push(`<div class="cond"><div class="cond-l">Garantia</div><div class="cond-v">${esc(d.garantia)}</div></div>`);
  if (d.prazo) conds.push(`<div class="cond"><div class="cond-l">Prazo</div><div class="cond-v">${esc(d.prazo)}</div></div>`);
  const condsHtml = conds.length ? `<div class="conds">${conds.join('')}</div>` : '';

  const zapHref = whats ? `https://wa.me/${whats.startsWith('55') ? whats : '55' + whats}?text=${encodeURIComponent(`Olá! Sobre o orçamento ${numero}`)}` : '';

  let actionsHtml;
  if (respondido) {
    const ok = status === 'aprovado';
    actionsHtml = `<div class="status-box ${ok ? 'status-ok' : 'status-no'}">
        <div class="status-emoji">${ok ? '✅' : '❌'}</div>
        <div class="status-title">${ok ? 'Orçamento aprovado' : 'Orçamento recusado'}</div>
        <div class="status-sub">${ok ? `Avisamos ${esc(nomePrestador)}. Em breve entram em contato.` : 'Sua resposta foi registrada.'}</div>
      </div>
      ${zapHref ? `<div class="actions"><a class="btn btn-zap" href="${esc(zapHref)}" target="_blank" rel="noopener">💬 Falar no WhatsApp</a></div>` : ''}`;
  } else {
    actionsHtml = `<div class="actions" id="actions">
        ${allowApprove ? `<button class="btn btn-aprovar" onclick="responder('aprovar')">✓ Aprovar orçamento</button>` : ''}
        <div class="btn-row">
          ${allowReject ? `<button class="btn btn-recusar" onclick="responder('recusar')">Recusar</button>` : ''}
          ${zapHref ? `<a class="btn btn-zap" href="${esc(zapHref)}" target="_blank" rel="noopener">Tirar dúvida</a>` : ''}
        </div>
      </div>`;
    if (!allowApprove && !allowReject && !zapHref) {
      actionsHtml = `<div class="status-box status-ok"><div class="status-title">Orçamento enviado para conferência</div><div class="status-sub">Responda pelo canal combinado para aprovar ou tirar dúvidas.</div></div>`;
    }
  }

  const validadePill = validade
    ? `<span class="pill">Válido até ${esc(validade)}</span>`
    : `<span class="pill">Válido por 15 dias</span>`;

  const inner = `<div class="card">
    <div class="hd">
      <div class="hd-mark">${olliRobot()}</div>
      <div><div class="hd-name">${esc(nomePrestador)}</div>${tagline ? `<div class="hd-tag">${esc(tagline)}</div>` : ''}</div>
    </div>
    <div class="body">
      ${cliente ? `<div class="eyebrow">Olá, ${esc(cliente)}</div>` : ''}
      <div class="title">Você recebeu um orçamento de ${esc(nomePrestador)}</div>
      <div class="meta">
        ${numero ? `<span class="meta-txt">Nº ${esc(numero)}</span>` : ''}
        ${emitido ? `<span class="meta-txt">· ${esc(emitido)}</span>` : ''}
        ${validadePill}
      </div>
      ${itens.length ? `<div class="items">${itensHtml}</div>` : ''}
      <div class="total"><span class="total-l">TOTAL</span><span class="total-v">${formatBRL(total)}</span></div>
      ${condsHtml}
      ${actionsHtml}
      <div class="foot">enviado com segurança pela OLLI</div>
    </div>
  </div>
  <script>
    var enviando = false;
    async function responder(acao){
      if (enviando) return;            // trava clique-duplo enquanto a 1ª request está em voo
      enviando = true;
      var box = document.getElementById('actions');
      var btns = box ? box.querySelectorAll('button,a') : [];
      btns.forEach(function(b){ b.style.opacity='.5'; b.style.pointerEvents='none'; });
      try {
        var r = await fetch(location.pathname, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ acao: acao }) });
        var j = await r.json();
        if (j && j.ok) { location.reload(); return; }
        enviando = false;
        btns.forEach(function(b){ b.style.opacity='1'; b.style.pointerEvents='auto'; });
        alert(j && j.erro === 'muitas_requisicoes' ? 'Muitas tentativas. Aguarde um instante e tente de novo.' : 'Não consegui registrar agora. Tente de novo.');
        return;
      } catch(e){}
      enviando = false;
      btns.forEach(function(b){ b.style.opacity='1'; b.style.pointerEvents='auto'; });
      alert('Não consegui registrar agora. Verifique a internet e tente de novo.');
    }
  </script>`;

  return shell(inner, accent);
}
