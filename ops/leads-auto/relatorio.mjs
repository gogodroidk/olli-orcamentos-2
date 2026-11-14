// Relatório e amostra sem telefone inteiro. O CSV do motor fica em outro arquivo.
import { mascara } from './telefone.mjs';

const ROTULO = { refrigeracao: 'refrigeração', eletrica: 'elétrica', predial: 'predial' };

function vazouTelefone(texto) {
  return /\+55\d{8,}/.test(texto)
    || /\(\d{2}\)\s?\d{4,5}-?\d{4}/.test(texto)
    || /\b9\d{4}-\d{4}\b/.test(texto);
}

const PORQUE = {
  ja_na_lista: 'já está na lista de 07/11',
  ja_no_log: 'o hash já está no LOG de outubro',
  ja_no_auto: 'já entrou numa rodada anterior deste caçador',
  ja_na_central: 'já é contato da Central',
  supressao: 'o hash está na supressão',
  fora_da_praca: 'cidade fora da praça desta semana',
  sem_site: 'a fonte não tem site da própria empresa',
  sem_telefone_no_site: 'o site não publica celular comercial',
  sem_celular_comercial: 'o site só publica telefone fixo; o Rafa chama no WhatsApp',
  ddd_fora_da_praca: 'o DDD não é da praça',
  sem_cidade: 'o site não diz a cidade',
  cidade_ambigua: 'o site cita mais de uma cidade da praça',
  cidade_diverge: 'a cidade do site não é a da praça',
  sem_servico_no_site: 'o site não descreve serviço técnico',
  nicho_nao_confirmado_no_site: 'o texto do site não confirma refrigeração, elétrica ou predial',
  so_loja: 'é loja, sem serviço técnico',
  nao_e_servico: 'a associação não classifica como instalação ou manutenção',
  pagina_lista: 'a página tem telefone demais para ser o site de uma empresa',
  sem_empresa: 'não deu para ler o nome da empresa',
  dominio_ja_visto: 'este site já foi conferido',
  busca_bloqueada: 'a busca pública pediu captcha ou bloqueou; a semana para nesse nicho',
  busca_vazia: 'a busca pública não devolveu site de empresa',
  robots: 'o robots.txt da empresa não deixa ler a página',
  robots_indisponivel: 'não deu para ler o robots.txt; a empresa fica de fora',
  robots_lento: 'o robots pede uma espera longa demais',
  site_indisponivel: 'o site não respondeu',
  site_bloqueou: 'o site recusou a leitura',
  nao_achou: 'a página não existe',
  nao_html: 'a resposta não é página',
  url_proibida: 'o endereço não é site público de empresa',
  fonte_abrava: 'a página da associação não abriu',
  orcamento: 'acabou o teto de páginas da rodada',
  motivo_invalido: 'a nota saiu sem a marca de hipótese',
  central_indisponivel: 'não deu para ler a Central; nada foi gravado',
  central_incompleta: 'a Central não veio inteira; nada foi gravado',
};

export function mascararAmostra(leads) {
  return leads.map((lead) => (
    `- ${lead.nome} · ${lead.cidade} · ${ROTULO[lead.nicho] || lead.nicho} · ${mascara(lead.telefone)} · ${lead.site}`
  ));
}

export function montarRelatorio({ quando, praca, teto, aceitos, acumulado, descartes, usados, orcamento, abaixo, anexadas = null }) {
  const linhasDescarte = Object.entries(descartes)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([motivo, n]) => `- ${motivo} (${PORQUE[motivo] || 'fora do critério'}): ${n}`);
  const nichos = { refrigeracao: 0, eletrica: 0, predial: 0 };
  for (const lead of aceitos) nichos[lead.nicho] = (nichos[lead.nicho] || 0) + 1;
  const md = `# Relatório do caçador de leads

${quando}. Praça: ${praca}. Meta da semana: 20 a 30. Teto desta rodada: ${teto}.
Nenhuma mensagem foi enviada.

- Novas nesta rodada: **${aceitos.length}**
- Acumuladas no arquivo novo: **${acumulado}**
- Páginas pedidas: ${usados} de ${orcamento}
- Refrigeração: ${nichos.refrigeracao}. Elétrica: ${nichos.eletrica}. Predial: ${nichos.predial}.
- No CSV que o Rafa lê: ${anexadas == null ? 'não anexou nesta rodada. O arquivo novo está em PROSPECTS-AUTO.csv.' : `anexou ${anexadas} empresa(s) que ainda não estavam na lista.`}
${abaixo ? '- A rodada ficou abaixo de 20. A próxima continua na mesma praça, inclusive nas empresas que ficaram na fila.\n' : ''}
## Descartadas

${linhasDescarte.length ? linhasDescarte.join('\n') : '- Nenhuma.'}
`;
  if (vazouTelefone(md)) throw new Error('relatorio_vazou_telefone');
  return md;
}

export function montarAmostra(leads, quando) {
  const corpo = mascararAmostra(leads).join('\n');
  const md = `# Amostra mascarada

${quando}. Telefone só com os 4 últimos dígitos. O número completo fica no CSV que o motor lê.

${corpo || '- Nenhuma empresa nova nesta rodada.'}
`;
  if (vazouTelefone(md)) throw new Error('amostra_vazou_telefone');
  return md;
}
