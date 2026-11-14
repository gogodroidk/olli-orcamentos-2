// Página estática de prévia. Sem preço, sem promessa, sem script, sem publicar.
import { ofertaDaFala } from '../agencia-interessados/interesse.mjs';

const PROIBIDO = [/R\$\s*\d/, /\bgaranto\b/i, /100\s*%/, /todo cliente na hora/i, /OLLI Orçamentos/i, /<script/i];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function escolherModelo(oferta) {
  if (oferta === 'atendimento' || oferta === 'conexao') return 'atendimento';
  return 'site';
}

export function paginaProibida(html) {
  return PROIBIDO.some((re) => re.test(String(html || '')));
}

function servicosDe(nicho) {
  const n = String(nicho || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (n.includes('refrig')) return ['Instalação', 'Manutenção', 'Higienização'];
  if (n.includes('eletr')) return ['Instalação', 'Manutenção', 'Iluminação'];
  if (n.includes('predial')) return ['Manutenção', 'Chamado', 'Visita técnica'];
  return ['Atendimento', 'Serviço no local', 'WhatsApp'];
}

function monograma(empresa) {
  const l = String(empresa || 'E').trim().charAt(0).toUpperCase();
  return /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(l) ? l : 'E';
}

function css(cor, tinta) {
  return `:root{--marca:${cor};--tinta:${tinta};--papel:#f6f4ef;--tinta-escura:#172033;--linha:rgba(23,32,51,.12)}
*{box-sizing:border-box}html,body{margin:0}body{font-family:Georgia,'Iowan Old Style','Palatino Linotype',serif;color:var(--tinta-escura);background:var(--papel)}
a{color:inherit}.aviso{font-family:system-ui,sans-serif;font-size:13px;letter-spacing:.04em;text-transform:uppercase;background:#172033;color:#f6f4ef;padding:8px 16px;text-align:center}
.miolo{width:min(880px,calc(100vw - 40px));margin:0 auto}`;
}

function cabeca(empresa, cor, tinta) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(empresa)}</title><style>${css(cor, tinta)}`;
}

function logoHtml(empresa, logoNome) {
  if (logoNome) return `<img src="${esc(logoNome)}" alt="" width="44" height="44">`;
  return `<b class="mono" aria-hidden="true">${esc(monograma(empresa))}</b>`;
}

function rodape() {
  return `<footer>Prévia ainda não está no ar. Feita para a conversa, sem compromisso de prazo ou resultado.</footer></body></html>`;
}

function paginaSite({ empresa, cidade, nicho, cor, tinta, logoNome }) {
  const lugar = cidade ? ` em ${esc(cidade)}` : '';
  const itens = servicosDe(nicho).map((s) => `<li>${esc(s)}</li>`).join('');
  return `${cabeca(empresa, cor, tinta)}
header{display:flex;align-items:center;justify-content:space-between;padding:22px 0 8px}
.marca{display:flex;align-items:center;gap:12px;font-weight:700;font-size:22px}
.marca img,.mono{width:44px;height:44px;border-radius:12px;background:var(--marca);object-fit:cover}
.mono{display:grid;place-items:center;color:var(--tinta);font-family:system-ui,sans-serif}
.hero{padding:48px 0 28px;display:grid;gap:16px}
.hero h1{font-size:clamp(36px,6vw,64px);line-height:.95;margin:0;max-width:14ch}
.hero p{font-size:20px;max-width:36ch;margin:0}
.lista{display:flex;gap:10px;flex-wrap:wrap;padding:0;margin:12px 0 0;list-style:none}
.lista li{font-family:system-ui,sans-serif;background:#fff;border:1px solid var(--linha);border-radius:999px;padding:8px 14px}
.zap{display:inline-flex;align-items:center;gap:8px;margin-top:8px;background:#128C7E;color:#fff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:700;padding:14px 18px;border-radius:999px}
.zap:focus-visible{outline:3px solid var(--marca);outline-offset:3px}
footer{font-family:system-ui,sans-serif;font-size:13px;color:#5c6570;padding:28px 0 40px}
</style></head><body>
<p class="aviso">Prévia · ainda não está no ar</p>
<div class="miolo">
<header><div class="marca">${logoHtml(empresa, logoNome)}<span>${esc(empresa)}</span></div></header>
<section class="hero">
<h1>${esc(empresa)}${lugar}.</h1>
<p>Um site leve, no nome de vocês, com um botão para chamar no WhatsApp.</p>
<ul class="lista">${itens}</ul>
<a class="zap" id="whatsapp" href="#whatsapp">Chamar no WhatsApp</a>
</section>
${rodape()}`;
}

function paginaAtendimento({ empresa, cidade, cor, tinta, logoNome }) {
  const lugar = cidade ? esc(cidade) : 'a cidade de vocês';
  return `${cabeca(empresa, cor, tinta)}
.palco{min-height:100vh;background:linear-gradient(180deg,var(--marca),#102238 70%);display:grid;place-items:center;padding:28px 16px}
.fone{width:min(380px,92vw);background:#f6f4ef;border-radius:28px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.28)}
.topo{background:var(--marca);color:var(--tinta);display:flex;align-items:center;gap:10px;padding:16px}
.topo img,.mono{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);object-fit:cover}
.mono{display:grid;place-items:center;font-family:system-ui,sans-serif;font-weight:800}
.topo b{display:block;font-family:system-ui,sans-serif}.topo span{font-family:system-ui,sans-serif;font-size:12px;opacity:.85}
.chat{display:grid;gap:10px;padding:16px}
.bolha{max-width:85%;padding:10px 12px;border-radius:16px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.35}
.deles{background:#fff;border:1px solid var(--linha);justify-self:start}
.nosso{background:#d9fdd3;justify-self:end}
.nota{font-family:system-ui,sans-serif;color:#f6f4ef;text-align:center;max-width:380px;margin:16px auto 0;font-size:14px}
footer{color:rgba(246,244,239,.75);text-align:center;font-family:system-ui,sans-serif;font-size:12px;padding:18px}
</style></head><body>
<p class="aviso">Prévia · ainda não está no ar</p>
<div class="palco">
<div>
<div class="fone" role="img" aria-label="Conversa de exemplo da ${esc(empresa)}">
<div class="topo">${logoHtml(empresa, logoNome)}<div><b>${esc(empresa)}</b><span>atendimento no WhatsApp</span></div></div>
<div class="chat">
<p class="bolha deles">Oi, vocês atendem em ${lugar} hoje?</p>
<p class="bolha nosso">Oi! Aqui é o atendimento da ${esc(empresa)}. Me conta o serviço e o bairro que eu deixo organizado para a equipe.</p>
<p class="bolha deles">É manutenção. A equipe está em serviço agora.</p>
<p class="bolha nosso">Anotei. A equipe vê esta conversa na central e responde com o horário. Eu não fecho valor por aqui.</p>
</div>
</div>
<p class="nota">No ar, esta conversa acontece no WhatsApp da ${esc(empresa)}.</p>
<footer>Prévia ainda não está no ar. Feita para a conversa, sem compromisso de prazo ou resultado.</footer>
</div></div></body></html>`;
}

export function renderPagina({ empresa, cidade, nicho, pedido, cor, corTexto: tinta, logoNome }) {
  const oferta = ofertaDaFala(pedido || '') || (nicho ? null : null);
  const modelo = escolherModelo(oferta || (/\bwhatsapp\b/i.test(pedido || '') ? 'atendimento' : 'site'));
  const dados = { empresa, cidade, nicho, cor, tinta: tinta || '#FFFFFF', logoNome };
  const html = modelo === 'atendimento' ? paginaAtendimento(dados) : paginaSite(dados);
  return { html, modelo, oferta: oferta || 'site' };
}
