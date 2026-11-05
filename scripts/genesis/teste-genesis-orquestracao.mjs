// Prova local da orquestração que entra no maestro por fora do app.
// node scripts/genesis/teste-genesis-orquestracao.mjs
// Exit 0 = passou. SQLite só em memória. Não chama CLI.

import { classificar } from './alcada.mjs';
import { abrirFila, TETO_ACORDAR_SEM_ARTEFATO } from './fila.mjs';
import { selecionar } from './pecas.mjs';
import { montarPlano, validarArgv } from './plano.mjs';

let ok = 0;
let falhas = 0;

function checar(nome, condicao) {
  if (condicao) {
    ok += 1;
    console.log(`  ok   ${nome}`);
  } else {
    falhas += 1;
    console.error(`  FALHA ${nome}`);
  }
}

function rejeita(nome, fn) {
  let rejeitou = false;
  try {
    fn();
  } catch {
    rejeitou = true;
  }
  checar(nome, rejeitou);
}

const agora = new Date('2026-11-03T12:00:00.000Z');

const verde = classificar({ tipo: 'pesquisa' }, agora);
checar('pesquisa e verde e executa', verde.cor === 'verde' && verde.executa === true && verde.registra === true);

const gastoIndireto = classificar({ tipo: 'pesquisa', gastoCentavos: 50 }, agora);
checar('qualquer gasto real e vermelho', gastoIndireto.cor === 'vermelho' && gastoIndireto.executa === false && gastoIndireto.criaAprovacao === true);

const deploy = classificar({ tipo: 'deploy_producao' }, agora);
checar('deploy de producao e vermelho sem valor', deploy.cor === 'vermelho' && deploy.criaAprovacao === true);

const amarelo = classificar({ tipo: 'publicar', efeitoVisivel: true, rollback: 'reverter o arquivo' }, agora);
checar(
  'efeito com rollback e amarelo por 2 h',
  amarelo.cor === 'amarelo' &&
    amarelo.executa === true &&
    amarelo.vetoAte === '2026-11-03T14:00:00.000Z',
);

const semRollback = classificar({ tipo: 'publicar', efeitoVisivel: true }, agora);
checar('efeito sem rollback sobe para vermelho', semRollback.cor === 'vermelho' && semRollback.executa === false);

const ambiguo = classificar({ tipo: 'pesquisa', ambiguo: true }, agora);
checar('ambiguo sobe de verde para amarelo', ambiguo.cor === 'amarelo');

const rebaixou = classificar({ tipo: 'gasto', gastoCentavos: 1, rebaixarPara: 'verde' }, agora);
checar('rebaixar a propria acao e recusado', rebaixou.reprovado === true && rebaixou.executa === false && rebaixou.cor === 'vermelho');

const mesmoAutor = classificar(
  { tipo: 'publicar', efeitoVisivel: true, rollback: 'voltar', produtor: 'a', aprovador: 'a' },
  agora,
);
checar('produtor nao aprova amarelo', mesmoAutor.reprovado === true && mesmoAutor.executa === false);

const pergunta = classificar({ tipo: 'gasto', gastoCentavos: 100, pergunta: true }, agora);
checar('pergunta nao vira ordem', pergunta.cor === 'nenhuma' && pergunta.executa === false);

const credito = classificar({ tipo: 'credito_expira' }, agora);
checar('credito que expira e amarelo', credito.cor === 'amarelo' && credito.vetoAte !== null);

const creditoExistente = classificar({ tipo: 'credito_existente', gastoCentavos: 0 }, agora);
checar('credito ja existente sem gasto e verde', creditoExistente.cor === 'verde');

checar('rotear fica no despachante', selecionar('rotear').peca.id === 'despachante' && selecionar('rotear').falta === false);
checar('lease fica na fila local', selecionar('lease').peca.id === 'fila-lease');
checar('chat proprio ainda falta', selecionar('chat-proprio').falta === true && selecionar('chat-proprio').peca.id === 'zulip');
rejeita('necessidade desconhecida falha', () => selecionar('copiar-concorrente'));

const plano = montarPlano(['canvas', 'classificar', 'chat-proprio', 'religar']);
checar('plano nao aplica', plano.aplica === false);
checar(
  'canvas simula sem aplicar',
  plano.passos[0].argv.join(' ') === 'node criar-papeis.mjs manifesto.json',
);
checar('classificar nao tem comando', plano.passos[1].argv === null && plano.passos[1].peca === 'alcada');
checar('zulip fica bloqueado no plano', plano.passos[2].bloqueio !== null && plano.passos[2].argv === null);
checar('religar nao recruta', plano.passos[3].argv === null && plano.passos[3].peca === 'vigia');
rejeita('recruit esta fora da superficie', () => validarArgv(['maestri', 'recruit', 'alguem']));
rejeita('hibernar esta fora da superficie', () => validarArgv(['hibernar']));
rejeita('--aplicar esta fora da superficie', () => validarArgv(['--aplicar']));

const fila = abrirFila();
fila.registrarAgente('arquiteto', 'genesis');
const tarefa = fila.criar({
  dono: 'arquiteto',
  titulo: 'D-0676',
  chave: 'D-0676',
  requisitos: '["prova"]',
  handoffPath: 'HANDOFF.md',
});
const deNovo = fila.criar({ dono: 'arquiteto', titulo: 'D-0676 de novo', chave: 'D-0676' });
checar('mesma chave nao duplica', tarefa.repetida === false && deNovo.repetida === true && deNovo.id === tarefa.id);

const linha = fila.db.prepare('SELECT max_iteracoes, handoff_path FROM tarefa WHERE id = ?').get(tarefa.id);
checar('teto do loop padrao e 8', linha.max_iteracoes === 8 && linha.handoff_path === 'HANDOFF.md');
for (const estouro of [0, 33]) {
  rejeita(`max_iteracoes ${estouro} recusado`, () => {
    fila.db.prepare(`INSERT INTO tarefa(dono, titulo, max_iteracoes) VALUES ('arquiteto', 'sem teto', ?)`).run(estouro);
  });
}

const lease = fila.reivindicar(tarefa.id, 'arquiteto', agora);
checar('lease dura 15 min', lease.leaseAte === '2026-11-03T12:15:00.000Z');
rejeita('segunda claim com lease vigente falha', () => fila.reivindicar(tarefa.id, 'arquiteto', agora));
checar('no instante do fim o lease segue', fila.devolverVencidas(new Date('2026-11-03T12:15:00.000Z')) === 0);
checar('depois do fim a tarefa volta', fila.devolverVencidas(new Date('2026-11-03T12:15:00.001Z')) === 1);
const estado = fila.db.prepare('SELECT estado, lease_por FROM tarefa WHERE id = ?').get(tarefa.id);
checar('devolvida para a fila', estado.estado === 'fila' && estado.lease_por === null);

fila.reivindicar(tarefa.id, 'arquiteto', agora);
const portao = fila.classificarTarefa({
  tarefaId: tarefa.id,
  agente: 'arquiteto',
  acao: { tipo: 'deploy_producao' },
  agora,
  traceId: 'd0676-1',
});
checar('vermelho abre aprovacao e para', portao.criaAprovacao === true && portao.executa === false);
const humana = fila.db.prepare('SELECT estado FROM tarefa WHERE id = ?').get(tarefa.id);
const aprovacao = fila.db.prepare('SELECT alcada FROM aprovacao WHERE tarefa = ?').get(tarefa.id);
checar('tarefa vermelha fica humana', humana.estado === 'humano' && aprovacao.alcada === 'vermelho');
rejeita('humano nao recebe lease', () => fila.reivindicar(tarefa.id, 'arquiteto', agora));

fila.registrarAgente('vigia', 'ops');
let ultimo = null;
for (let i = 1; i <= TETO_ACORDAR_SEM_ARTEFATO; i += 1) {
  ultimo = fila.registrarAcordar('vigia', new Date(agora.getTime() + i * 1000));
}
checar('no teto ainda nao pausa', ultimo.pausado === false && ultimo.acordos === TETO_ACORDAR_SEM_ARTEFATO);
ultimo = fila.registrarAcordar('vigia', new Date(agora.getTime() + 7000));
checar('passar do teto sem entrega pausa', ultimo.pausado === true);
const travado = fila.db.prepare(`SELECT estado FROM agente WHERE id = 'vigia'`).get();
checar('agente pausado fica travado', travado.estado === 'travado');

fila.registrarAgente('radar', 'pesquisa');
fila.concluir(
  fila.criar({ dono: 'radar', titulo: 'entrega', chave: 'entrega-radar' }).id,
  'radar',
  agora,
);
let comEntrega = null;
for (let i = 1; i <= TETO_ACORDAR_SEM_ARTEFATO + 1; i += 1) {
  comEntrega = fila.registrarAcordar('radar', new Date(agora.getTime() + i * 1000));
}
checar('entrega na hora segura o acordar', comEntrega.pausado === false && comEntrega.artefatos === 1);

const pulso = fila.db.prepare(`SELECT entregas FROM pulso_agente WHERE agente = 'radar'`).get();
checar('pulso conta a entrega', pulso.entregas === 1);

if (falhas > 0) {
  console.error(`genesis-orquestracao: ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`genesis-orquestracao: ok (${ok})`);
