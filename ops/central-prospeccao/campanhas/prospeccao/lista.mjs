// Markdown da entrega. Telefone só com os 4 últimos dígitos.
import { mascara } from '../../ativacao/telefones.mjs';
import { textoPrimeiroToque, textoRetorno } from './mensagens.mjs';
import { LIMITE_DIA, LIMITE_HORA, INTERVALO_MIN, INTERVALO_MAX } from './ritmo.mjs';

const NICHO = { refrigeracao: 'refrigeração', eletrica: 'elétrica', predial: 'predial' };

export function gerarLista(fila, fora, { quando = '', trava = '' } = {}) {
  const cabeca = `# LISTA DE ENVIO — prospecção OLLI Serviços

Gerado ${quando || 'agora'}. Caixa Segundo Andar (final 3507). Quem fala: Rafa, da OLLI. Sem preço. Telefone só com os 4 últimos dígitos.
Ritmo: seg–sáb, 9h–18h (Brasília), no máximo ${LIMITE_DIA} empresas por dia e ${LIMITE_HORA} por hora, intervalo aleatório de ${INTERVALO_MIN} a ${INTERVALO_MAX} min. Um retorno só, depois de 2 dias úteis sem resposta.
${trava}

Na fila: **${fila.length}**. De fora: **${fora.length}**.

A nota é hipótese da pesquisa de 07/11, não é fato sobre a empresa. A origem do telefone é o site público, não a Receita.
`;
  const resumoFora = resumirFora(fora);
  if (!fila.length) return `${cabeca}\n${resumoFora}\nNinguém na fila com os filtros atuais.\n`;
  const blocos = fila.map((lead, i) => `## ${i + 1}. ${lead.nome} · ${NICHO[lead.nicho] || lead.nicho} · ${mascara(lead.telefone_e164)}

- Cidade: ${lead.cidade || '-'}
- Prioridade (hipótese): ${lead.nota}
- 1º toque:

> ${textoPrimeiroToque(lead).split('\n').join('\n> ')}

- Retorno (só depois de 2 dias úteis, se não responder):

> ${textoRetorno(lead).split('\n').join('\n> ')}
`);
  return `${cabeca}\n${resumoFora}\n${blocos.join('\n')}`;
}

function resumirFora(fora) {
  const n = {};
  for (const item of fora) n[item.motivo] = (n[item.motivo] || 0) + 1;
  const linhas = Object.entries(n).map(([k, v]) => `- ${k}: ${v}`);
  return linhas.length ? `## De fora\n\n${linhas.join('\n')}\n` : '';
}
