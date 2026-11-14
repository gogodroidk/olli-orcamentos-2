// Confere o telefone no HTML do próprio site. Número de associação, mapa ou rede social não serve.
import { cidadeCanonica, cidadeNoTexto, formatarCidade, semAcento } from './cidades.mjs';
import { motivoDedupe } from './dedupe.mjs';
import { hostDe, textoDe, urlDeEmpresa, urlPublica } from './fontes.mjs';
import { hipotese, nichoNoSite, nomeForaDoNicho, soLoja, temServico, textoDiretorio } from './nicho.mjs';
import { celularesNoHtml, dddDe, formatoComercial, temFixoComercial } from './telefone.mjs';

export function nomeDoSite(html, reserva) {
  const bruto = String(html || '');
  const og = (bruto.match(/property=["']og:site_name["'][^>]*content=["']([^"']+)/i) || [])[1]
    || (bruto.match(/content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i) || [])[1];
  const title = (bruto.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const base = textoDe(og || title || '').replace(/\s+/g, ' ').trim();
  const curto = base.split(/\s+[|–—]\s+|\s+-\s+/)[0].trim();
  const nome = (reserva || curto || '').replace(/\s+/g, ' ').trim();
  return nome.slice(0, 80);
}

export function nomeLimpo(nome) {
  return String(nome || '')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, ' ')
    .replace(/[⚡🟢✅📞]/gu, ' ')
    .replace(/\bagora no whats(?:app)?\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+[-–—|]\s*$/g, '')
    .trim()
    .slice(0, 80);
}

export function linkContato(html, base) {
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of String(html || '').matchAll(re)) {
    const href = m[1];
    const rotulo = m[2].replace(/<[^>]+>/g, ' ');
    if (!/contato|fale|contact|telefone/i.test(`${href} ${rotulo}`)) continue;
    try {
      const u = new URL(href, base);
      const origem = new URL(base);
      if (u.hostname.replace(/^www\./, '') !== origem.hostname.replace(/^www\./, '')) continue;
      if (!urlPublica(u.href)) continue;
      return u.href;
    } catch { /* próximo link */ }
  }
  return '';
}

function origemDoSite(url) {
  try { return new URL(url).origin; } catch { return url; }
}

function locality(html) {
  const m = String(html || '').match(/"addressLocality"\s*:\s*"([^"]{2,60})"/i);
  return m ? m[1].trim() : '';
}

function cidadeDoCandidato(html, candidato, praca) {
  const local = locality(html);
  const localCanon = local ? cidadeCanonica(local, praca.cidades) : '';
  if (local && !localCanon) return { motivo: 'cidade_diverge' };
  if (candidato.cidade) {
    const canon = cidadeCanonica(candidato.cidade, praca.cidades);
    if (!canon) return { motivo: 'fora_da_praca' };
    return { cidade: formatarCidade(canon, praca.uf) };
  }
  if (localCanon) return { cidade: formatarCidade(localCanon, praca.uf) };
  const cabeca = textoDe(html).slice(0, 2500);
  const hits = cidadeNoTexto(cabeca, praca);
  if (hits.length === 1) return { cidade: formatarCidade(hits[0], praca.uf) };
  if (hits.length > 1) return { motivo: 'cidade_ambigua' };
  return { motivo: 'sem_cidade' };
}

export function avaliar(html, candidato, { praca, dedupe }) {
  const visivel = textoDe(html);
  const fones = celularesNoHtml(html);
  if (fones.length > 6) return { motivo: 'pagina_lista' };
  if (!fones.length) return { motivo: temFixoComercial(html) ? 'sem_celular_comercial' : 'sem_telefone_no_site' };
  const fone = fones[0].e164;
  if (!praca.ddds.includes(dddDe(fone))) return { motivo: 'ddd_fora_da_praca' };
  if (soLoja(visivel)) return { motivo: 'so_loja' };
  if (!temServico(visivel)) return { motivo: 'sem_servico_no_site' };
  const nicho = nichoNoSite(visivel);
  if (!nicho) return { motivo: 'nicho_nao_confirmado_no_site' };
  const lugar = cidadeDoCandidato(html, candidato, praca);
  if (lugar.motivo) return { motivo: lugar.motivo };
  const nome = nomeLimpo(nomeDoSite(html, candidato.nome));
  if (!nome || nome.length < 2) return { motivo: 'sem_empresa' };
  if (textoDiretorio(visivel)) return { motivo: 'pagina_lista' };
  if (nomeForaDoNicho(nome, nicho)) return { motivo: 'nicho_nao_confirmado_no_site' };
  const dominio = hostDe(candidato.site);
  const repetido = motivoDedupe(dedupe, { telefone: fone, nome, dominio });
  if (repetido) return { motivo: repetido };
  const nota = hipotese(visivel, nicho);
  if (!semAcento(nota.motivo).includes('hipotese')) return { motivo: 'motivo_invalido' };
  return {
    lead: {
      nome,
      cidade: lugar.cidade,
      site: origemDoSite(candidato.site),
      telefone: formatoComercial(fone),
      telefoneE164: fone,
      onde: candidato.onde || candidato.site,
      nota: nota.nota,
      motivo: nota.motivo,
      nicho,
      dominio,
      origem: candidato.origem,
    },
  };
}

export async function conferir(candidato, { cliente, praca, dedupe }) {
  if (!candidato?.site || !urlDeEmpresa(candidato.site)) return { motivo: 'sem_site' };
  const dominio = hostDe(candidato.site);
  const cedo = motivoDedupe(dedupe, { nome: candidato.nome, dominio });
  if (cedo) return { motivo: cedo };
  let pagina = await cliente.texto(candidato.site);
  if (!pagina.ok && pagina.motivo === 'site_indisponivel' && candidato.site.startsWith('https://')) {
    pagina = await cliente.texto(candidato.site.replace(/^https:\/\//, 'http://'));
  }
  if (!pagina.ok) return { motivo: pagina.motivo || 'site_indisponivel' };
  let html = pagina.body || '';
  let onde = pagina.finalUrl || candidato.site;
  if (!celularesNoHtml(html).length) {
    const contato = linkContato(html, onde);
    if (contato && hostDe(contato) === hostDe(onde)) {
      const extra = await cliente.texto(contato);
      if (extra.motivo === 'orcamento') return { motivo: 'orcamento' };
      if (extra.ok && celularesNoHtml(extra.body).length) {
        html += `\n${extra.body}`;
        onde = extra.finalUrl || contato;
      }
    }
  }
  return avaliar(html, { ...candidato, site: candidato.site, onde }, { praca, dedupe });
}
