// Nicho sai do texto do site. A etiqueta nicho: bate com o nichoDe do motor.

const REGRAS = {
  refrigeracao: [/refrigera/, /ar[- ]condicionado/, /climatiza/, /p\.?m\.?o\.?c/, /c[aâ]mara fria/, /\bsplit\b/],
  eletrica: [/el[eé]tric/, /eletricista/, /disjuntor/, /quadro de (luz|distribui)/],
  predial: [/manuten[cç][aã]o predial/, /servi[cç]os prediais/, /engenharia predial/, /\bfacilities\b/, /manuten[cç][aã]o de condom[ií]nio/],
};

const SERVICO = /manuten|instala|assist[eê]ncia|conserto|p\.?m\.?o\.?c|visita t[eé]cnica/;

export function nichoNoSite(texto) {
  const t = String(texto || '').toLowerCase();
  const pontos = {};
  for (const [nicho, regras] of Object.entries(REGRAS)) {
    pontos[nicho] = regras.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  }
  if (pontos.predial && /limpeza|portaria|vigil[aâ]ncia/.test(t) && !/manuten[cç][aã]o predial|servi[cç]os prediais|el[eé]tric|refrigera|ar[- ]condicionado/.test(t)) {
    pontos.predial = 0;
  }
  const melhor = Object.entries(pontos).sort((a, b) => b[1] - a[1])[0];
  if (!melhor || melhor[1] < 1) return '';
  return melhor[0];
}

export function temServico(texto) {
  return SERVICO.test(String(texto || '').toLowerCase());
}

export function textoDiretorio(texto) {
  const t = String(texto || '').toLowerCase();
  return /anuncie (sua|aqui)|guia de empresas|lista de profissionais|cadastre sua empresa|milhares de (profissionais|empresas)|encontre profissionais|portal de empresas/.test(t);
}

export function nomeForaDoNicho(nome, nicho) {
  const t = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!/pintura|limpeza|dedetiza|mudanca|chaveiro|vidrac/.test(t)) return false;
  const regra = REGRAS[nicho] || [];
  return !regra.some((re) => re.test(t));
}

export function soLoja(texto) {
  const t = String(texto || '').toLowerCase();
  return /adicionar ao carrinho|comprar agora|meu carrinho/.test(t) && !temServico(t);
}

export function hipotese(texto, nicho) {
  const t = String(texto || '').toLowerCase();
  const bot = /chatbot|atendimento autom[aá]tico|assistente virtual|intelig[eê]ncia artificial|bot de whatsapp/.test(t);
  const wa = /whatsapp|wa\.me/.test(t);
  let nota = 5;
  let porque = 'site sem sinal de triagem automática';
  if (bot) {
    nota = 3;
    porque = 'o site já fala em atendimento automático';
  } else if (wa) {
    nota = 4;
    porque = 'há WhatsApp no site e não há sinal de triagem automática';
  }
  return {
    nota,
    motivo: `hipótese: nicho:${nicho}. ${porque}. Telefone comercial publicado no próprio site.`,
  };
}

/** Departamento publicado na associação. Vazio = não é serviço técnico do nosso corte. */
export function nichoDoDepartamento(departamento) {
  const t = String(departamento || '').toLowerCase();
  const instala = /instala|manuten/.test(t);
  const fora = /projetista|isolamento|tratamento de [aá]gua|qu[ií]mic/.test(t);
  if (fora && !instala) return '';
  if (/refrigera|ar condicionado|climatiza|ventila/.test(t)) return 'refrigeracao';
  if (/el[eé]tric/.test(t)) return 'eletrica';
  if (instala) return 'refrigeracao';
  return '';
}
