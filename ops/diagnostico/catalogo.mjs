// Ofertas do GZ-AGENCIA-1. Sem preço: o valor ainda não está aprovado.
import fs from 'node:fs';

export const CAMINHO_CATALOGO = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-14-agencia-ia/CATALOGO.md';

export const ID_POR_SERVICO = {
  1: 'site',
  2: 'atendimento',
  3: 'central',
  4: 'google',
  5: 'google-ads',
  6: 'meta',
  7: 'logo',
  8: 'criativos',
  9: 'workspace',
  10: 'sistema',
  11: 'retorno',
  12: 'agenda',
};

export const OFERTAS_PROVISORIAS = [
  { servico: 1, id: 'site', nome: 'Landing page / site com botão de WhatsApp' },
  { servico: 2, id: 'atendimento', nome: 'Atendimento automatizado no WhatsApp com IA' },
  { servico: 3, id: 'central', nome: 'Conexão multi-atendente no WhatsApp' },
  { servico: 4, id: 'google', nome: 'Perfil da empresa no Google' },
  { servico: 5, id: 'google-ads', nome: 'Google Ads' },
  { servico: 6, id: 'meta', nome: 'Meta Ads e Meta Business Suite' },
  { servico: 7, id: 'logo', nome: 'Identidade visual e logo' },
  { servico: 8, id: 'criativos', nome: 'Criativos e posts' },
  { servico: 9, id: 'workspace', nome: 'Google Workspace' },
  { servico: 10, id: 'sistema', nome: 'Mini-sistema de orçamentos' },
  { servico: 11, id: 'retorno', nome: 'Retorno de orçamentos' },
  { servico: 12, id: 'agenda', nome: 'Agendamento online' },
];

const SERVICO_DA_LACUNA = {
  sem_site: 1,
  site_nao_abre: 1,
  pediu_login: 1,
  nao_html: 1,
  sem_https: 1,
  sem_viewport: 1,
  sem_whatsapp: 1,
  sem_google: 4,
  sem_instagram: 6,
  email_amador: 9,
  sem_formulario: 2,
  completo: 2,
};

export function ofertasDoTexto(texto) {
  const achou = [];
  const re = /^### Serviço (\d+):\s*(.+)$/gm;
  for (const m of String(texto || '').matchAll(re)) {
    const servico = Number(m[1]);
    if (!ID_POR_SERVICO[servico]) continue;
    achou.push({ servico, id: ID_POR_SERVICO[servico], nome: m[2].trim() });
  }
  const numeros = new Set(achou.map((o) => o.servico));
  if (numeros.size < 8) return null;
  return achou.sort((a, b) => a.servico - b.servico);
}

export function carregarOfertas({ ler = fs.readFileSync, caminhos = [CAMINHO_CATALOGO] } = {}) {
  for (const caminho of caminhos) {
    try {
      const ofertas = ofertasDoTexto(ler(caminho, 'utf8'));
      if (ofertas) return { origem: caminho, ofertas };
    } catch { /* arquivo ausente ou ilegível: tenta o próximo */ }
  }
  return { origem: 'provisoria', ofertas: OFERTAS_PROVISORIAS };
}

export function ofertaDaLacuna(principal, ofertas = OFERTAS_PROVISORIAS) {
  const servico = SERVICO_DA_LACUNA[principal] || 0;
  if (!servico) return { ofertaId: '', servico: 0, ofertaNome: '' };
  const lista = Array.isArray(ofertas) && ofertas.length ? ofertas : OFERTAS_PROVISORIAS;
  const achou = lista.find((o) => o.servico === servico)
    || OFERTAS_PROVISORIAS.find((o) => o.servico === servico);
  return {
    ofertaId: achou?.id || ID_POR_SERVICO[servico] || '',
    servico,
    ofertaNome: achou?.nome || '',
  };
}
