// Fontes abertas: página pública da ABRAVA (robots permite) e a busca HTML do DuckDuckGo (Allow: /).
// O telefone da associação não entra na lista. Ele só serve para achar o site, e o número sai do site.

const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', nbsp: ' ', quot: '"', apos: "'",
  aacute: 'á', acirc: 'â', atilde: 'ã', agrave: 'à',
  eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ',
  uacute: 'ú', ccedil: 'ç',
};

export function textoDe(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|li|tr|td)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (tudo, nome) => ENTIDADES[nome.toLowerCase()] || tudo)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n');
}

export function urlDeSite(bruto) {
  const texto = String(bruto || '').replace(/&nbsp;/g, ' ').trim();
  if (!texto || /n[aã]o possui|n[aã]o tem|sem site/i.test(texto)) return '';
  const token = texto.match(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[a-z0-9.-]+\.(?:com\.br|ind\.br|eng\.br|net\.br|com|net)(?:\/[^\s<>"']*)?/i);
  if (!token) return '';
  let s = token[0].replace(/[),.;]+$/, '');
  if (!/^https?:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname.includes('.')) return '';
    return u.href;
  } catch {
    return '';
  }
}

const BLOQUEIO = [
  'instagram.com', 'facebook.com', 'fb.com', 'fb.me', 'linkedin.com', 'youtube.com', 'youtu.be',
  'tiktok.com', 'twitter.com', 'x.com', 'google.com', 'google.com.br', 'goo.gl', 'g.page',
  'whatsapp.com', 'wa.me', 'mercadolivre.com.br', 'mercadolibre.com', 'olx.com.br',
  'telelistas.net', 'apontador.com.br', 'guiamais.com.br', 'yelp.com', 'wikipedia.org',
  'econodata.com.br', 'casadosdados.com.br', 'cnpj.biz',
  'getninjas.com.br', 'habitissimo.com.br', 'reclameaqui.com.br', 'g1.globo.com', 'globo.com',
  'uol.com.br', 'exame.com', 'terra.com.br', 'r7.com', 'folha.uol.com.br', 'estadao.com.br',
  'metropoles.com', 'indeed.com', 'catho.com.br', 'infojobs.com.br', 'gov.br', 'jus.br',
  'linktr.ee', 'bit.ly', 'pinterest.com', 'amazon.com', 'amazon.com.br',
  'listamais.com.br', 'eguias.net', 'acheioprofissional.com.br', 'solutudo.com.br',
  'guiatelefone.com.br', 'listatudo.com.br',
  'magazineluiza.com.br', 'americanas.com.br', 'receitaws.com.br', 'fazenda.gov.br',
];

export function hostDe(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function hostProibido(host) {
  const h = String(host || '').replace(/^www\./, '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.local')) return true;
  if (h.startsWith('guia.') || h.includes('.guia.')) return true;
  return BLOQUEIO.some((b) => h === b || h.endsWith(`.${b}`));
}

const FONTES = ['abrava.com.br', 'duckduckgo.com'];

export function hostDeFonte(host) {
  const h = String(host || '').replace(/^www\./, '').toLowerCase();
  return FONTES.some((b) => h === b || h.endsWith(`.${b}`));
}

/** Site de empresa. A página da associação e a busca servem só para achar o site. */
export function urlDeEmpresa(url) {
  return urlPublica(url) && !hostDeFonte(hostDe(url));
}

export function urlPublica(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^(10\.|127\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) === false && h.includes(':')) return false;
  return !hostProibido(h);
}

export function associadosDeHtml(html) {
  const partes = String(html || '').split(/class="col-md-4 associado"/i).slice(1);
  const sai = [];
  for (const bloco of partes) {
    const nome = textoDe((bloco.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
    const corpo = textoDe((bloco.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '');
    const campo = (rotulo) => {
      const m = corpo.match(new RegExp(`${rotulo}\\s*:\\s*([^\\n]+)`, 'i'));
      return m ? m[1].replace(/\s+/g, ' ').trim() : '';
    };
    if (!nome) continue;
    sai.push({
      nome,
      cidadeBruta: campo('Cidade'),
      departamento: campo('Departamento'),
      site: urlDeSite(campo('Site')),
      origem: 'abrava',
    });
  }
  return sai;
}

export function linksDuckDuckGo(html, limite = 8) {
  const sai = [];
  const vistos = new Set();
  for (const m of String(html || '').matchAll(/uddg=([^&"']+)/g)) {
    let bruto = m[1];
    try { bruto = decodeURIComponent(bruto); } catch { continue; }
    if (!/^https?:\/\//i.test(bruto)) continue;
    if (!urlDeEmpresa(bruto)) continue;
    const host = hostDe(bruto);
    if (!host || vistos.has(host)) continue;
    vistos.add(host);
    try {
      const u = new URL(bruto);
      sai.push(`${u.origin}${u.pathname}`);
    } catch { continue; }
    if (sai.length >= limite) break;
  }
  return sai;
}

export function consultasDaPraca(praca) {
  if (praca.id === 'grande-sp') {
    return {
      refrigeracao: [
        'refrigeração manutenção "São Paulo" "fale conosco"',
        '"ar condicionado" manutenção "Santo André" telefone',
        '"PMOC" "Guarulhos" refrigeração contato',
        '"ar condicionado" "Osasco" whatsapp manutenção',
        'climatização "São Bernardo do Campo" manutenção contato',
        '"câmara fria" manutenção "São Paulo" telefone',
      ],
      eletrica: [
        '"instalação elétrica" predial "São Paulo" "fale conosco"',
        'eletricista "Guarulhos" whatsapp predial',
        '"manutenção elétrica" "Santo André" contato',
        '"instalações elétricas" "Osasco" telefone',
        'eletricista "Barueri" "fale conosco"',
        '"quadro elétrico" manutenção "São Caetano" contato',
      ],
      predial: [
        '"manutenção predial" "São Paulo" "fale conosco" -limpeza -portaria',
        '"serviços prediais" "Guarulhos" telefone -limpeza',
        '"manutenção predial" "Santo André" whatsapp',
        '"engenharia predial" "Osasco" contato',
        '"manutenção predial" "Barueri" telefone -portaria',
        '"manutenção de condomínios" "São Paulo" elétrica contato',
      ],
    };
  }
  const cidade = praca.cidades[0];
  return {
    refrigeracao: [
      `refrigeração manutenção "${cidade}" "fale conosco"`,
      `"ar condicionado" manutenção "${cidade}" telefone`,
    ],
    eletrica: [
      `"instalação elétrica" "${cidade}" "fale conosco"`,
      `eletricista predial "${cidade}" telefone`,
    ],
    predial: [
      `"manutenção predial" "${cidade}" "fale conosco" -limpeza`,
      `"serviços prediais" "${cidade}" telefone`,
    ],
  };
}

export function urlBusca(consulta) {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(consulta)}`;
}

export function urlAbrava(letra) {
  return `https://abrava.com.br/associados-2/?letra=${letra}`;
}
