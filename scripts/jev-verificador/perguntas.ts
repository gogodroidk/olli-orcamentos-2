/**
 * Perguntas do System One (docs.typesafe.ai). Uma requisição leva as três
 * do lead, ou as três da ideia. O código decide pela distribuição inteira,
 * não pelo rótulo de maior probabilidade.
 */

export const PERGUNTAS_LEAD = {
  intencao: {
    type: 'choice',
    instructions: 'Qual é a intenção deste texto, já sem identificadores?',
    criteria: {
      pedido_servico: 'pede orçamento, visita ou serviço de climatização, refrigeração ou manutenção',
      curiosidade: 'pergunta geral, sem pedido de serviço',
      reclamacao: 'reclamação de um serviço já feito',
      fora_do_nicho: 'assunto que não é serviço de climatização ou refrigeração',
      saida: 'pede para parar o contato',
    },
  },
  urgencia: {
    type: 'score',
    instructions: 'Quão urgente é o pedido de serviço, se houver um.',
    criteria: ['sem prazo', 'nesta semana', 'hoje ou o aparelho está parado'],
  },
  opt_out: {
    type: 'noul',
    instructions: 'A pessoa pede para não ser contatada.',
  },
} as const;

export const PERGUNTAS_IDEIA = {
  impacto: {
    type: 'score',
    instructions:
      'Impacto esperado em receita ou em ativação de pagantes nas próximas semanas, para um app de orçamento com zero pagantes.',
    criteria: ['nenhum', 'baixo', 'medio', 'alto'],
  },
  risco_legal: {
    type: 'noul',
    instructions: 'Executar esta ideia exige parecer jurídico ou pode violar a LGPD ou o Código de Defesa do Consumidor.',
  },
  esforco: {
    type: 'choice',
    instructions: 'Esforço para construir.',
    criteria: {
      P: 'horas a um dia',
      M: 'alguns dias',
      G: 'semanas ou mais',
    },
  },
} as const;

/** Texto sintético, sem nome, telefone, e-mail ou documento. Serve para uma chamada real quando houver autorização de gasto. */
export const TEXTO_SINTETICO_LEAD =
  'Preciso de orçamento de manutenção preventiva em dois aparelhos split de uma loja. O ar não gela direito desde ontem. Quero visita técnica.';
