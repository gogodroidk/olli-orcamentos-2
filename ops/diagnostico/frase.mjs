// Frase do 1º toque a partir da lacuna já classificada. Sem preço e sem promessa.

const PERGUNTA = {
  sem_site: (cidade) => `Não achei uma página da empresa${cidade ? ` em ${cidade}` : ''}. Posso te mostrar em 2 minutos uma página com botão de WhatsApp para o cliente chamar?`,
  site_nao_abre: () => 'Tentei abrir o site de vocês e ele não respondeu. Posso te mostrar em 2 minutos uma página que abre no celular, com botão de WhatsApp?',
  pediu_login: () => 'Tentei abrir o site de vocês e ele pediu login, então parei. Posso te mostrar em 2 minutos uma página aberta, com botão de WhatsApp?',
  nao_html: () => 'O endereço de vocês não abre uma página. Posso te mostrar em 2 minutos uma página no celular, com botão de WhatsApp?',
  sem_https: () => 'Vi que o site de vocês abre sem o cadeado de segurança. Posso te mostrar em 2 minutos uma página com HTTPS e botão de WhatsApp?',
  sem_viewport: () => 'Abri o site de vocês e a página não se ajusta à tela do celular. Posso te mostrar em 2 minutos como ela fica no telefone, com botão de WhatsApp?',
  sem_whatsapp: () => 'Vi o site de vocês e não achei botão de WhatsApp. Posso te mostrar em 2 minutos como o cliente chama com um toque?',
  sem_google: () => 'Vi o site de vocês e não achei link para o Google. Posso te mostrar em 2 minutos o que publicar na ficha da empresa?',
  sem_instagram: () => 'Vi o site de vocês e não achei link para o Instagram. Posso te mostrar em 2 minutos um anúncio que manda o cliente para o WhatsApp?',
  email_amador: () => 'Vi que o e-mail publicado no site de vocês é de um provedor gratuito. Posso te mostrar em 2 minutos o e-mail no domínio da empresa?',
  sem_formulario: () => 'Vi o site de vocês e não achei um formulário de contato. Posso te mostrar em 2 minutos uma central que recebe o WhatsApp e organiza o chamado?',
  completo: () => 'Vi o site de vocês, com WhatsApp. Posso te mostrar em 2 minutos uma central que organiza o chamado e usa um agente de IA na triagem?',
};

export function cidadeCurta(cidade) {
  return String(cidade || '').split(' - ')[0].replace(/\s+/g, ' ').trim();
}

export function nomeLimpo(nome) {
  return String(nome || 'aí').replace(/\s+/g, ' ').trim().slice(0, 80) || 'aí';
}

export function artigo(nome) {
  const n = nomeLimpo(nome);
  if (/^(grupo|time)\b/i.test(n)) return `do ${n}`;
  return `da ${n}`;
}

export function fraseDoDiagnostico(lead) {
  const d = lead?.diagnostico;
  if (!d || d.evidencia === false) return '';
  const montar = PERGUNTA[d.principal];
  if (!montar) return '';
  const nome = nomeLimpo(lead?.nome);
  const miolo = montar(cidadeCurta(lead?.cidade));
  return `Oi, equipe ${artigo(nome)}. Aqui é o Rafa, da OLLI. ${miolo}`;
}

export function fraseSeLimpa(lead, proibido) {
  const frase = fraseDoDiagnostico(lead);
  if (!frase) return '';
  if (typeof proibido === 'function' && proibido(frase)) return '';
  if (!frase.includes('Rafa') || !frase.includes('OLLI')) return '';
  if (!frase.endsWith('?')) return '';
  if (/@/.test(frase) || /\+?\d[\d\s().-]{8,}\d/.test(frase)) return '';
  return frase;
}
