// Relatório mascarado. Telefone não entra, mesmo se vier no objeto.
import { fraseDoDiagnostico } from './frase.mjs';

const ROTULO = {
  sem_site: 'sem site',
  site_nao_abre: 'site não abre',
  pediu_login: 'site pediu login',
  nao_html: 'não é página',
  sem_https: 'sem HTTPS',
  sem_viewport: 'não ajusta no celular',
  sem_whatsapp: 'sem botão de WhatsApp',
  sem_google: 'sem link do Google',
  sem_instagram: 'sem link do Instagram',
  email_amador: 'e-mail de provedor gratuito',
  sem_formulario: 'sem formulário',
  robots: 'robots não deixou ler',
  site_bloqueou: 'site recusou a leitura',
  orcamento: 'teto de páginas',
  url_proibida: 'endereço fora do permitido',
  completo: 'nenhuma lacuna nesses pontos',
};

export function relatorioMarkdown(itens, { quando = '', origem = '' } = {}) {
  const lista = itens || [];
  const contagem = {};
  for (const item of lista) {
    const chave = item.diagnostico?.ofertaId || 'sem-oferta';
    contagem[chave] = (contagem[chave] || 0) + 1;
  }
  const resumo = Object.entries(contagem).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  const blocos = lista.map((item, i) => bloco(item, i));
  const corpo = `# Diagnóstico das empresas — OLLI Serviços

Gerado ${quando || 'agora'}. Só a primeira página pública de cada site, um pedido por vez, com pausa. Sem login, sem Google Maps, sem mensagem enviada. O HTML não executa JavaScript: botão que só nasce no navegador pode não aparecer. Preço não entra na frase. O valor do catálogo segue proposta, sem aprovação.

Catálogo: ${origem || 'provisoria'}.
Lidos: **${lista.length}**.

## Ofertas

${resumo || '- nenhuma'}

${blocos.join('\n')}
`;
  return mascarar(`${corpo}\nESTADO: FEITO\n`);
}

function bloco(item, i) {
  const d = item.diagnostico || {};
  const s = d.sinais || {};
  const lacunas = (d.lacunas || []).map((id) => ROTULO[id] || id);
  const frase = d.evidencia ? fraseDoDiagnostico(item) : '';
  const toque = frase
    ? frase.split('\n').join('\n> ')
    : 'texto padrão do motor (a página não foi lida, então não há lacuna para citar)';
  return `## ${i + 1}. ${item.nome || 'aí'} · ${item.cidade || '-'} · ${item.nicho || '-'}

- Site: ${item.site || '-'}
- Abre: ${sim(s.abre)} · HTTPS: ${sim(s.https)} · Celular: ${sim(s.viewport)} · WhatsApp: ${sim(s.whatsapp)} · Formulário: ${sim(s.formulario)} · Instagram: ${sim(s.instagram)} · Google: ${sim(s.google)}
- Lacunas: ${lacunas.length ? lacunas.join(', ') : ROTULO.completo}
- Oferta: ${d.servico ? `Serviço ${d.servico} — ${d.ofertaNome}` : 'nenhuma (sem leitura)'}
- 1º toque:

> ${toque}
`;
}

function sim(valor) {
  return valor ? 'sim' : 'não';
}

export function mascarar(texto) {
  return String(texto)
    .replace(/\+\d{10,15}/g, '****')
    .replace(/\(\d{2}\)\s?\d{4,5}-?\d{4}/g, '****')
    .replace(/(?<!\d)\d{2}\s?\d{4,5}-?\d{4}(?!\d)/g, '****')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '***@***');
}
