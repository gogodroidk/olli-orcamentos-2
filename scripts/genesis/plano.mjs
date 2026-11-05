// Plano de inserção no maestro. Só descreve. Não chama CLI, não recruta, não hiberna.

import { selecionar } from './pecas.mjs';

export const ARGUMENTOS_PROIBIDOS = [
  'recruit',
  'hibernate',
  'hibernar',
  '--aplicar',
  'deploy',
  'wrangler',
  'eas',
  'vercel',
];

export function validarArgv(argv) {
  if (!Array.isArray(argv)) throw new Error('argv invalido');
  for (const arg of argv) {
    if (ARGUMENTOS_PROIBIDOS.includes(arg)) {
      throw new Error(`superficie proibida: ${arg}`);
    }
  }
}

function passoDe(escolha) {
  if (escolha.peca.id === 'canvas-manifesto') {
    const argv = ['node', 'criar-papeis.mjs', 'manifesto.json'];
    validarArgv(argv);
    return {
      necessidade: escolha.necessidade,
      peca: escolha.peca.id,
      acao: 'simular o manifesto de papeis, sem aplicar',
      argv,
      bloqueio: null,
    };
  }
  if (escolha.falta) {
    return {
      necessidade: escolha.necessidade,
      peca: escolha.peca.id,
      acao: 'nao inserir',
      argv: null,
      bloqueio: escolha.peca.nota,
    };
  }
  return {
    necessidade: escolha.necessidade,
    peca: escolha.peca.id,
    acao: escolha.peca.nota,
    argv: null,
    bloqueio: null,
  };
}

export function montarPlano(necessidades) {
  if (!Array.isArray(necessidades) || necessidades.length === 0) {
    throw new Error('lista de necessidades vazia');
  }
  const passos = necessidades.map((necessidade) => passoDe(selecionar(necessidade)));
  return Object.freeze({
    aplica: false,
    motivo: 'dry-run: este modulo nao chama o maestro nem acorda terminal',
    passos,
  });
}
