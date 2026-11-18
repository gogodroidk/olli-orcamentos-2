// Lê o HTML que já foi baixado. Não entra na rede e não executa JavaScript.

export function analisarHtml(html) {
  const texto = String(html || '');
  return {
    viewport: temViewport(texto),
    whatsapp: temWhatsapp(texto),
    formulario: temFormulario(texto),
    instagram: temInstagram(texto),
    google: temGoogle(texto),
    emailAmador: temEmailAmador(texto),
  };
}

export function classificar(leitura) {
  const motivo = leitura?.motivo || '';
  const sinais = {
    abre: false,
    https: false,
    viewport: false,
    whatsapp: false,
    formulario: false,
    instagram: false,
    google: false,
    emailAmador: false,
    status: leitura?.status || 0,
  };
  if (!leitura || motivo === 'sem_site' || motivo === 'maps' || motivo === 'rede_social' || motivo === 'url_invalida') {
    return { sinais, lacunas: ['sem_site'], principal: 'sem_site', evidencia: true };
  }
  if (motivo === 'url_proibida') {
    return { sinais, lacunas: ['url_proibida'], principal: 'url_proibida', evidencia: false };
  }
  if (motivo === 'robots' || motivo === 'robots_lento' || motivo === 'robots_indisponivel') {
    return { sinais, lacunas: ['robots'], principal: 'robots', evidencia: false };
  }
  if (motivo === 'bloqueou') {
    return { sinais, lacunas: ['site_bloqueou'], principal: 'site_bloqueou', evidencia: false };
  }
  if (motivo === 'orcamento') {
    return { sinais, lacunas: ['orcamento'], principal: 'orcamento', evidencia: false };
  }
  if (motivo === 'nao_abre' || motivo === 'nao_achou') {
    return { sinais, lacunas: ['site_nao_abre'], principal: 'site_nao_abre', evidencia: true };
  }
  sinais.abre = true;
  sinais.https = String(leitura.finalUrl || '').startsWith('https:');
  if (leitura.login) {
    return { sinais, lacunas: ['pediu_login'], principal: 'pediu_login', evidencia: true };
  }
  if (leitura.naoHtml) {
    const lacunas = [];
    if (!sinais.https) lacunas.push('sem_https');
    lacunas.push('nao_html');
    return { sinais, lacunas, principal: lacunas[0], evidencia: true };
  }
  const html = analisarHtml(leitura.html || '');
  sinais.viewport = html.viewport;
  sinais.whatsapp = html.whatsapp;
  sinais.formulario = html.formulario;
  sinais.instagram = html.instagram;
  sinais.google = html.google;
  sinais.emailAmador = html.emailAmador;
  const lacunas = [];
  if (!sinais.https) lacunas.push('sem_https');
  if (!html.viewport) lacunas.push('sem_viewport');
  if (!html.whatsapp) lacunas.push('sem_whatsapp');
  if (!html.google) lacunas.push('sem_google');
  if (!html.instagram) lacunas.push('sem_instagram');
  if (html.emailAmador) lacunas.push('email_amador');
  if (!html.formulario) lacunas.push('sem_formulario');
  if (!lacunas.length) return { sinais, lacunas: [], principal: 'completo', evidencia: true };
  return { sinais, lacunas, principal: lacunas[0], evidencia: true };
}

function temViewport(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/\bname\s*=\s*["']viewport["']/i.test(tag)) continue;
    const content = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    if (/width\s*=\s*device-width/i.test(content)) return true;
  }
  return false;
}

function temWhatsapp(html) {
  if (/wa\.me\/|api\.whatsapp\.com|whatsapp:\/\/|web\.whatsapp\.com\/send/i.test(html)) return true;
  return /<(?:a|button|div|span|i)\b[^>]{0,240}(?:class|id|data-[\w:-]+)\s*=\s*["'][^"']*whatsapp[^"']*["'][^>]*>/i.test(html);
}

function temInstagram(html) {
  return /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]/i.test(html);
}

function temGoogle(html) {
  return /https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|g\.page\/|business\.google|share\.google)/i.test(html);
}

function temEmailAmador(html) {
  return /[A-Z0-9._%+-]+@(?:gmail|hotmail|outlook|yahoo|bol|uol|ig|live|icloud)\.[A-Z]{2,}/i.test(html);
}

function temFormulario(html) {
  if (/<textarea\b/i.test(html)) return true;
  if (/<input\b[^>]*type\s*=\s*["'](?:email|tel)["']/i.test(html)) return true;
  return /<form\b/i.test(html);
}
