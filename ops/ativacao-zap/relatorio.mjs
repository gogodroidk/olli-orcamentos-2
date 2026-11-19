// Markdown da entrega. Telefone só com os 4 últimos dígitos.
import { mascara } from './telefones.mjs';
import { mensagemAtivacao, primeiroNome, id8 } from './mensagens.mjs';
import { montarFila, LIMITE_DIA, LIMITE_HORA, INTERVALO_MIN, INTERVALO_MAX } from './fila.mjs';

function contar(pessoas, chave, valor) {
  return pessoas.filter((p) => p[chave] === valor).length;
}

export function gerarMapa(pessoas, { quando = '', notaSync = '' } = {}) {
  const etapas = ['cadastrou', 'perfil', 'cliente', 'orcamento', 'enviado', 'aprovado', 'pagou'];
  const linhasEtapa = etapas.map((e) => `| ${e} | ${contar(pessoas, 'etapa', e)} |`).join('\n');
  const comFone = pessoas.filter((p) => p.telefone_e164).length;
  const paga = pessoas.filter((p) => p.paga === true).length;
  const sup = pessoas.filter((p) => p.suprimido === true).length;
  const planos = ['gratis', 'trial', 'pro', 'empresa'];
  const linhasPlano = planos.map((e) => `| ${e} | ${contar(pessoas, 'plano', e)} |`).join('\n');
  return `# MAPA DA BASE — OLLI Orçamentos

Gerado ${quando || 'agora'}. Fonte: base.json (SELECT do mapa.sql). Telefone só com os 4 últimos dígitos.
${notaSync}

## Contagem por etapa

| Etapa | Contas |
|---|---|
${linhasEtapa}

Total de contas no mapa: **${pessoas.length}**. Com telefone: **${comFone}**. Sem telefone: **${pessoas.length - comFone}**. Pagante: **${paga}**. Pediu para parar (banco ou e-mail): **${sup}**.

## Plano

| Plano | Contas |
|---|---|
${linhasPlano}

A lista de quem entra no WhatsApp está em LISTA-ENVIO.md. A base inteira não é copiada para cá com nome completo.
`;
}

export function gerarLista(pessoas, ctx, { quando = '', trava = '' } = {}) {
  const oficial = montarFila(pessoas, ctx);
  const previa = montarFila(pessoas, { ...ctx, syncFresca: true });
  const cabeca = `# LISTA DE ENVIO — ativação pelo WhatsApp da OLLI

Gerado ${quando || 'agora'}. Uma mensagem por pessoa. Ritmo: seg–sáb, 9h–18h (Brasília), no máximo ${LIMITE_DIA} por dia e ${LIMITE_HORA} por hora, intervalo aleatório de ${INTERVALO_MIN} a ${INTERVALO_MAX} min. Telefone só com os 4 últimos dígitos.
${trava}

Fila que sairia se a supressão estivesse fresca: **${previa.fila.length}**. Fila liberada agora: **${oficial.fila.length}**.
`;
  if (!previa.fila.length) return `${cabeca}\nNinguém na fila com os filtros atuais.\n`;
  const blocos = previa.fila.map((p, i) => {
    const texto = mensagemAtivacao(p);
    return `## ${i + 1}. ${primeiroNome(p.nome) || 'sem nome'} · conta ${id8(p.conta_id)} · ${mascara(p.telefone_e164)}

- Quando: na fila, assim que a janela e os tetos deixarem (não há horário cravado por pessoa)
- Etapa: ${p.etapa || '-'} · plano ${p.plano || '-'} · orçamentos ${p.orcamentos ?? '-'}
- Ofício: ${p.especialidade || '-'} · cidade: ${p.cidade || '-'} · cadastro ${p.cadastro || '-'}

> ${texto.split('\n').join('\n> ')}
`;
  });
  return `${cabeca}\n${blocos.join('\n')}`;
}

export const MAPA_SEM_BASE = `# MAPA DA BASE — OLLI Orçamentos

A base ao vivo ainda não foi lida. O Grok não acessa o Supabase de produção. O Salomão roda \`/home/igor/chatwoot-central/ativacao/mapa.sql\` (só SELECT) e salva o array em \`base.json\`. Aí \`node mapa.mjs\` reescreve este arquivo com a contagem e o telefone mascarado.

## O que já se sabe (recorte de 30 dias, medido em 12/11/2026, não é a base inteira)

Fonte: \`2026-11-12-ativacao-gratis/FUNIL.md\`. 38 cadastros em 30 dias, sem anônimo e sem conta interna.

| Etapa (não exclusiva) | Contas | % de 38 |
|---|---|---|
| Cadastrou | 38 | 100% |
| Perfil da empresa | 12 | 32% |
| Cliente | 17 | 45% |
| Orçamento criado | 15 | 39% |
| Enviado | 7 | 18% |
| Aprovado | 3 | 8% |
| Pagou | 0 | 0% |

Onde as 31 com 0 ou 1 orçamento pararam: 18 só no cadastro, 3 com cliente e sem perfil, 2 com perfil e cliente, 7 com 1 rascunho, 1 enviado. Nenhuma dessas 38 pagava naquele dia.

Prioridade de dinheiro já conhecida, fora desse recorte de "0 ou 1": Luiz (conta 8d2c59dd, pagamento do Pro não concluído) e MK Bombas / Mike (conta ac0f2c80, pagamento da Empresa não concluído; na fonte de 12/11 o telefone não estava). Quem já paga fica de fora. O 1º pagante (conta 63616103) não entra nesta fila.
`;
