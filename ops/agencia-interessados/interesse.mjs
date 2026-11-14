// Interesse da OLLI Serviços: pediu preço, pediu para ver ou aceitou conversa.
// Sem preço, sem promessa, sem telefone no registro. Quem pede para parar não entra.

export const ETIQUETA = 'interessado';
export const NOME_VISAO = 'Interessados';

export const ROTULO = {
  preco: 'Pediu preço',
  ver: 'Pediu para ver',
  aceitou: 'Aceitou conversa',
};

const OFERTA_NOME = {
  site: 'site',
  atendimento: 'atendimento no WhatsApp',
  conexao: 'central de atendimento',
  anuncio: 'anúncio',
  ads_google: 'Google Ads',
  meta: 'Meta Business Suite',
  marca: 'identidade visual',
  logo: 'logo',
  workspace: 'Google Workspace',
  sistema: 'sistema',
};

const OFERTAS = [
  ['logo', /\blogo\b/],
  ['marca', /identidade visual|marca nova/],
  ['workspace', /google workspace|e-?mail corporativo/],
  ['ads_google', /google ads/],
  ['meta', /meta business|facebook ads|instagram ads|anuncio no instagram|anuncio no face/],
  ['anuncio', /\banuncio\b|trafego pago/],
  ['conexao', /multi.?atendente|varios atendentes|central de atendimento/],
  ['sistema', /\bsistema\b|\baplicativo\b/],
  ['site', /\bsite\b|landing|pagina nova|pagina web/],
  ['atendimento', /atendimento automatico|mensagem sem resposta|sem resposta|\brobo\b|nao respondo|nao fica|whatsapp/],
];

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pediuParaVer(texto) {
  const n = normalizar(texto);
  if (!n || n === 'quero' || n === 'sim' || n === 'ok' || n === 'pode') return false;
  if (/^(quero ver|mostra|pode mostrar|manda ver|me mostra|quero uma demo)$/.test(n)) return true;
  return /(quero ver|pode mostrar|me mostra|mostra (pra|para) (mim|eu|nos|a gente)|manda (um |o )?(exemplo|modelo)|quero (uma |a )?(demo|demonstracao|previa)|ver como fica)/.test(n);
}

export function ofertaDaFala(texto) {
  const n = normalizar(texto);
  if (!n) return null;
  for (const [id, re] of OFERTAS) if (re.test(n)) return id;
  return null;
}

export function descreverQuer(tipo, texto) {
  const base = ROTULO[tipo] || 'Interesse';
  const oferta = ofertaDaFala(texto);
  return oferta ? `${base} · ${OFERTA_NOME[oferta]}` : base;
}

export function redigirPedido(texto) {
  return String(texto ?? '')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[doc]')
    .replace(/\+?\d[\d\s()-]{7,}\d/g, '[tel]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function nomeDeEmpresa(...candidatos) {
  for (const c of candidatos) {
    const limpo = String(c ?? '').trim();
    if (!limpo) continue;
    if (/^\+?\d[\d\s()-]{6,}$/.test(limpo)) continue;
    return limpo.slice(0, 80);
  }
  return 'Empresa';
}

export function registroDeInteresse({ tipo, texto, empresa, conversa, nicho, desde }) {
  if (!tipo || !ROTULO[tipo] || conversa == null) return null;
  return {
    conversa: Number(conversa),
    empresa: nomeDeEmpresa(empresa),
    quer: descreverQuer(tipo, texto),
    pedido: redigirPedido(texto),
    nicho: String(nicho || '').slice(0, 40),
    desde: Number(desde) || 0,
    tipo,
    parado: false,
  };
}
