import { concluidoEmDaTransicao } from '../src/utils/ordemServicoStatus.ts';

const ok = (nome: string, condicao: boolean) => {
  if (!condicao) throw new Error(`FALHA: ${nome}`);
  console.log(`  ok   ${nome}`);
};

const primeiro = '2026-09-10T12:00:00.000Z';
const segundo = '2026-09-11T12:00:00.000Z';

console.log('\nOS — marco de conclusão separado da última edição');
ok('aberta → concluída cria o marco', concluidoEmDaTransicao({ status: 'aberta' }, 'concluida', primeiro) === primeiro);
ok('edição de OS concluída preserva o marco', concluidoEmDaTransicao({ status: 'concluida', concluidoEm: primeiro }, 'concluida', segundo) === primeiro);
ok('reabertura limpa o marco', concluidoEmDaTransicao({ status: 'concluida', concluidoEm: primeiro }, 'em_execucao', segundo) === undefined);
ok('reconclusão cria um novo marco', concluidoEmDaTransicao({ status: 'em_execucao' }, 'concluida', segundo) === segundo);
ok('transição para cancelada não deixa marco', concluidoEmDaTransicao({ status: 'aberta' }, 'cancelada', segundo) === undefined);
console.log('PASSOU: 5 verificações');
