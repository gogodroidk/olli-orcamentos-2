// Catálogo das peças NOSSAS de orquestração. Nenhum código de terceiro entra aqui.
// A escolha prefere o que já roda. O que falta fica marcado e não é instalado.

export const PECAS = [
  {
    id: 'despachante',
    cobre: ['rotear'],
    temos: true,
    superficie: 'processo-externo',
    nota: 'Fila e roteamento por papel. O maestro só executa o que o processo externo pedir pela CLI.',
  },
  {
    id: 'vigia',
    cobre: ['religar'],
    temos: true,
    superficie: 'watchdog-externo',
    nota: 'Vê terminal morto e religa pelo caminho já existente. Este plano não acorda ninguém.',
  },
  {
    id: 'canvas-manifesto',
    cobre: ['canvas'],
    temos: true,
    superficie: 'cli-simulacao',
    nota: 'O canvas volta de um manifesto nosso. A simulação não leva --aplicar.',
  },
  {
    id: 'decisoes',
    cobre: ['registro'],
    temos: true,
    superficie: 'arquivo',
    nota: 'Decisão registrada antes de agir.',
  },
  {
    id: 'handoff',
    cobre: ['handoff'],
    temos: true,
    superficie: 'arquivo',
    nota: 'O fim da tarefa entrega o caminho do artefato.',
  },
  {
    id: 'alcada',
    cobre: ['classificar', 'freio'],
    temos: true,
    superficie: 'modulo-local',
    nota: 'classificar() decide a cor antes de qualquer efeito.',
  },
  {
    id: 'fila-lease',
    cobre: ['lease', 'idempotencia', 'fila'],
    temos: true,
    superficie: 'sqlite-local',
    nota: 'Claim, prazo e chave única. Banco só em memória, fora de produção.',
  },
  {
    id: 'circuit-breaker',
    cobre: ['circuit-breaker'],
    temos: true,
    superficie: 'modulo-local',
    nota: 'Acordar sem artefato novo passa do teto e a peça pausa.',
  },
  {
    id: 'zulip',
    cobre: ['chat-proprio'],
    temos: false,
    superficie: 'nao-sobe',
    nota: 'Licença Apache-2.0 já conferida. Falta medir a RAM do servidor. Não instalar nesta entrega.',
  },
];

export function selecionar(necessidade) {
  if (typeof necessidade !== 'string' || necessidade.length === 0) {
    throw new Error('necessidade obrigatoria');
  }
  const encontradas = PECAS.filter((peca) => peca.cobre.includes(necessidade));
  if (encontradas.length === 0) {
    throw new Error(`necessidade sem peca: ${necessidade}`);
  }
  const peca = encontradas.find((item) => item.temos) || encontradas[0];
  return { necessidade, peca, falta: peca.temos !== true };
}
