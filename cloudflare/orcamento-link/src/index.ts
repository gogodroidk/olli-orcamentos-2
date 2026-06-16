/**
 * OLLI — Link do cliente (Etapa 3 do PROCESSO).
 *
 * Cloudflare Worker que mostra um orçamento numa página clara e deixa o cliente
 * Aprovar / Recusar / tirar Dúvida no WhatsApp. A resposta é gravada no Supabase
 * (tabela `orcamentos_publicos`) usando a chave service_role — que fica como
 * SECRET do Worker, nunca no app.
 *
 * Deploy:
 *   cd cloudflare/orcamento-link && npm i -g wrangler
 *   wrangler secret put SUPABASE_URL                 # https://yiae...supabase.co
 *   wrangler secret put SUPABASE_SERVICE_ROLE_KEY    # service_role do projeto
 *   wrangler deploy
 * Depois aponte o domínio (Hostinger/Cloudflare) e use a mesma base em
 * EXPO_PUBLIC_LINK_BASE_URL no app. URL final: https://SEU_DOMINIO/o/<token>
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface OrcamentoPublico {
  token: string;
  numero?: string;
  cliente_nome?: string;
  valor_total: number;
  prestador_nome?: string;
  prestador_whatsapp?: string;
  dados: any;
  status: string;
  respondido_em?: string | null;
}

const BRL = (n: number) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sb(env: Env, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function carregar(env: Env, token: string): Promise<OrcamentoPublico | null> {
  const r = await sb(env, `orcamentos_publicos?token=eq.${encodeURIComponent(token)}&limit=1`);
  if (!r.ok) return null;
  const rows = (await r.json()) as OrcamentoPublico[];
  return rows?.[0] ?? null;
}

function page(o: OrcamentoPublico): string {
  const d = o.dados ?? {};
  const itens: any[] = Array.isArray(d.itens) ? d.itens : [];
  const respondido = o.status === 'aprovado' || o.status === 'recusado';
  const wpp = (o.prestador_whatsapp || '').replace(/\D/g, '');
  const wppMsg = encodeURIComponent(`Olá! Tenho uma dúvida sobre o orçamento nº ${o.numero ?? ''}.`);

  const banner = respondido
    ? `<div class="banner ${o.status}">${o.status === 'aprovado' ? '✓ Você aprovou este orçamento. O prestador foi avisado.' : '✗ Você recusou este orçamento.'}</div>`
    : '';

  const acoes = respondido
    ? ''
    : `<form method="POST" class="acoes">
         <button name="acao" value="aprovar" class="btn aprovar">Aprovar orçamento</button>
         <button name="acao" value="recusar" class="btn recusar">Recusar</button>
       </form>`;

  const whatsapp = wpp
    ? `<a class="btn whats" href="https://wa.me/55${wpp}?text=${wppMsg}">Dúvida no WhatsApp</a>`
    : '';

  const linhasItens = itens.map(it => `
    <tr>
      <td>${esc(it.nome)}<span class="qtd">${esc(it.quantidade)} ${esc(it.unidade ?? '')} × ${BRL(it.preco)}</span></td>
      <td class="val">${BRL(it.subtotal)}</td>
    </tr>`).join('');

  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orçamento nº ${esc(o.numero ?? '')} — ${esc(o.prestador_nome ?? 'OLLI')}</title>
<style>
  :root{--ink:#0A2540;--frost:#0B6FCE;--bg:#F4F7FB;--line:#E2E8F0;--ok:#15B66E;--no:#F25555;--mut:#64748B}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink)}
  .wrap{max-width:560px;margin:0 auto;padding:20px 16px 48px}
  .head{display:flex;align-items:center;gap:10px;margin:8px 0 18px}
  .logo{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#0B6FCE,#34C6D9);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:18px}
  .brand{font-weight:800}.brand small{display:block;color:var(--mut);font-weight:600;font-size:12px}
  .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;margin-bottom:14px;box-shadow:0 6px 20px rgba(10,37,64,.05)}
  .num{font-size:13px;color:var(--mut);font-weight:700;text-transform:uppercase;letter-spacing:.5px}
  .total{font-size:34px;font-weight:800;margin:2px 0 0}
  h2{font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px}
  table{width:100%;border-collapse:collapse}td{padding:9px 0;border-bottom:1px solid var(--line);vertical-align:top;font-size:15px}
  .qtd{display:block;color:var(--mut);font-size:12px;margin-top:2px}.val{text-align:right;font-weight:700;white-space:nowrap}
  .meta{display:flex;justify-content:space-between;font-size:14px;padding:6px 0;color:var(--mut)}.meta b{color:var(--ink)}
  .acoes{display:flex;gap:10px;margin-top:6px}
  .btn{flex:1;display:block;text-align:center;text-decoration:none;border:0;cursor:pointer;padding:15px;border-radius:13px;font-size:16px;font-weight:800}
  .aprovar{background:var(--ok);color:#fff}.recusar{flex:.6;background:#fff;color:var(--no);border:1.5px solid var(--no)}
  .whats{background:#25D366;color:#fff;margin-top:10px}
  .banner{padding:14px;border-radius:13px;font-weight:700;margin-bottom:14px}
  .banner.aprovado{background:#E7F8F0;color:#0d7a4c}.banner.recusado{background:#FDECEC;color:#b3261e}
  .foot{text-align:center;color:var(--mut);font-size:12px;margin-top:20px}
  .foot b{color:var(--frost)}
</style></head><body><div class="wrap">
  <div class="head"><div class="logo">O</div><div class="brand">${esc(o.prestador_nome || 'OLLI')}<small>Orçamento nº ${esc(o.numero ?? '')}</small></div></div>
  ${banner}
  <div class="card">
    <div class="num">Olá ${esc(o.cliente_nome || '')}, este é o seu orçamento</div>
    <div class="total">${BRL(o.valor_total)}</div>
  </div>
  ${itens.length ? `<div class="card"><h2>Itens</h2><table>${linhasItens}</table></div>` : ''}
  <div class="card">
    ${d.validade ? `<div class="meta">Válido até <b>${esc(d.validade)}</b></div>` : ''}
    ${d.garantia ? `<div class="meta">Garantia <b>${esc(d.garantia)}</b></div>` : ''}
    ${d.condicoesPagamento ? `<div class="meta">Pagamento <b>${esc(d.condicoesPagamento)}</b></div>` : ''}
    ${acoes}
    ${whatsapp}
  </div>
  <div class="foot">Feito com <b>OLLI</b> · orçamentos que fecham negócio</div>
</div></body></html>`;
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

const naoEncontrado = () =>
  html(`<!doctype html><meta charset="utf-8"><div style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#0A2540">
    <h1>Link não encontrado</h1><p>Este orçamento não existe ou foi removido. Peça um novo link ao prestador.</p></div>`, 404);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/o\/([A-Za-z0-9_-]+)\/?$/);
    if (!m) return naoEncontrado();
    const token = m[1];

    if (req.method === 'POST') {
      const form = await req.formData();
      const acao = String(form.get('acao') || '');
      const status = acao === 'aprovar' ? 'aprovado' : acao === 'recusar' ? 'recusado' : '';
      if (status) {
        await sb(env, `orcamentos_publicos?token=eq.${encodeURIComponent(token)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ status, respondido_em: new Date().toISOString() }),
        });
      }
      // Post/Redirect/Get
      return new Response(null, { status: 303, headers: { Location: `/o/${token}` } });
    }

    const o = await carregar(env, token);
    if (!o) return naoEncontrado();
    return html(page(o));
  },
};
