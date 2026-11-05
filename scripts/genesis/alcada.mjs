// classificar(acao) — D-0618. Código, não prompt. Não executa efeito no mundo.

const ORDEM = ['verde', 'amarelo', 'vermelho'];
const DUAS_HORAS_MS = 2 * 60 * 60 * 1000;

const TIPOS_VERMELHOS = new Set([
  'gasto',
  'contrato',
  'assinatura',
  'migration_producao',
  'deploy_producao',
  'primeiro_contato',
  'lote_externo',
  'credencial',
  'mudar_lei',
  'mudar_sigilo',
  'mudar_autonomia',
  'apagar_dado',
  'irreversivel',
]);

function subir(cor) {
  if (cor === 'verde') return 'amarelo';
  return 'vermelho';
}

function resposta(campos) {
  return Object.freeze({
    cor: campos.cor,
    executa: campos.executa,
    criaAprovacao: campos.criaAprovacao,
    reprovado: campos.reprovado === true,
    motivo: campos.motivo,
    vetoAte: campos.vetoAte,
    registra: campos.registra === true,
  });
}

export function classificar(acao, agora = new Date()) {
  if (!acao || typeof acao.tipo !== 'string' || acao.tipo.length === 0) {
    throw new Error('acao.tipo obrigatorio');
  }
  if (acao.pergunta === true) {
    return resposta({
      cor: 'nenhuma',
      executa: false,
      criaAprovacao: false,
      motivo: 'pergunta nao e ordem',
      vetoAte: null,
    });
  }

  let cor = 'verde';
  let motivo = 'reversivel, sem dinheiro e sem terceiro';
  const gasto = Number(acao.gastoCentavos || 0);
  if (!Number.isFinite(gasto) || gasto < 0) {
    throw new Error('gastoCentavos invalido');
  }

  if (TIPOS_VERMELHOS.has(acao.tipo) || gasto > 0 || acao.irreversivel === true) {
    cor = 'vermelho';
    motivo = 'lista vermelha';
  } else if (acao.tipo === 'credito_expira') {
    cor = 'amarelo';
    motivo = 'credito que expira, com aviso e veto de 2 h';
  } else if (acao.efeitoVisivel === true) {
    if (typeof acao.rollback === 'string' && acao.rollback.length > 0) {
      cor = 'amarelo';
      motivo = 'efeito visivel com rollback registrado';
    } else {
      cor = 'vermelho';
      motivo = 'efeito visivel sem rollback sobe para vermelho';
    }
  }

  if (acao.ambiguo === true && cor !== 'vermelho') {
    cor = subir(cor);
    motivo = 'ambiguo sobe de cor';
  }

  if (typeof acao.rebaixarPara === 'string') {
    const pedida = ORDEM.indexOf(acao.rebaixarPara);
    const atual = ORDEM.indexOf(cor);
    if (pedida !== -1 && atual !== -1 && pedida < atual) {
      return resposta({
        cor,
        executa: false,
        criaAprovacao: cor === 'vermelho',
        reprovado: true,
        motivo: 'rebaixar a propria acao e proibido',
        vetoAte: null,
      });
    }
  }

  if (
    cor !== 'verde' &&
    typeof acao.produtor === 'string' &&
    acao.produtor.length > 0 &&
    acao.produtor === acao.aprovador
  ) {
    return resposta({
      cor,
      executa: false,
      criaAprovacao: false,
      reprovado: true,
      motivo: 'produtor nao aprova a propria acao',
      vetoAte: null,
    });
  }

  const vetoAte = cor === 'amarelo' ? new Date(agora.getTime() + DUAS_HORAS_MS).toISOString() : null;
  return resposta({
    cor,
    executa: cor !== 'vermelho',
    criaAprovacao: cor === 'vermelho',
    motivo,
    vetoAte,
    registra: cor === 'verde',
  });
}
