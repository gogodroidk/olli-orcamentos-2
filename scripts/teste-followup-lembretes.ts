/**
 * Teste dos lembretes locais de follow-up (item 2.12) —
 * src/services/followUpLembretesRegra.ts + a fiação em cloudSync/clienteLink/App.
 *
 *     node scripts/teste-followup-lembretes.ts
 * Exit 0 = passou; qualquer assert que falha derruba o processo.
 *
 * Protege:
 *  • agendamento D+2 (enviado, sem sinal de abertura) e D+5 (viu e não respondeu),
 *    às 09h, pulando o domingo mudo, sem lembrete no passado;
 *  • quem sai do follow-up (respondeu, pagou, venceu, lixeira) não recebe lembrete
 *    e o que já estava agendado é CANCELADO na reconciliação;
 *  • aviso diário de rascunhos (24h+) às 16h, silêncio quando não há rascunho;
 *  • "Cliente aprovou/recusou" sai UMA vez por orçamento (dedupe por conta) e o
 *    histórico antigo não é despejado;
 *  • a fiação: sync após o pull, toque abre o orçamento, logout cancela.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DIAS_FOLLOWUP_NAO_ABRIU,
  DIAS_FOLLOWUP_VIU_SEM_RESPOSTA,
  HORA_AVISO_RASCUNHOS,
  HORA_FOLLOWUP,
  ORIGEM_FOLLOWUP,
  decidirAvisosDeResposta,
  lerEstadoRespostas,
  planejarAvisoRascunhos,
  planejarFollowUps,
  reconciliarAgendadas,
  selecionarFollowUps,
  type AgendadaExistente,
  type NotificacaoPlanejada,
  type RespostaDoLink,
} from '../src/services/followUpLembretesRegra.ts';
import type { Orcamento, Recibo } from '../src/types/index.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const semComentarios = (s: string) =>
  s.replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');

let oks = 0;
function ok(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  oks++;
  console.log(`  ok   ${msg}`);
}

// Quinta-feira, 01/10/2026, meio-dia LOCAL. Domingo = 04/10.
const AGORA = new Date(2026, 9, 1, 12, 0, 0);
const local = (dia: number, hora: number, mes = 9) => new Date(2026, mes, dia, hora, 0, 0, 0);
const iso = (d: Date) => d.toISOString();
const SEM_DOMINGO = { domingoAtivo: false };
const COM_DOMINGO = { domingoAtivo: true };

function orc(id: string, extra: Partial<Orcamento>): Orcamento {
  return {
    id,
    numero: `00${id}`,
    clienteId: `c-${id}`,
    clienteNome: `Cliente${id} Sobrenome`,
    clienteTelefone: '11999998888',
    status: 'enviado',
    valorTotal: 1500,
    dataEmissao: '2026-09-28',
    criadoEm: iso(local(28, 10, 8)),
    atualizadoEm: iso(local(30, 15, 8)),
    ...extra,
  } as Orcamento;
}
const recibo = (orcamentoId: string, extra: Partial<Recibo> = {}) =>
  ({ orcamentoId, ...extra }) as Pick<Recibo, 'orcamentoId' | 'estornadoEm' | 'excluidoEm'>;

console.log('\n1) agendamento D+2 / D+5');
assert.equal(DIAS_FOLLOWUP_NAO_ABRIU, 2);
assert.equal(DIAS_FOLLOWUP_VIU_SEM_RESPOSTA, 5);
{
  // Enviado qua 30/09 15h, sem sinal de abertura → sex 02/10 09h.
  const enviado = orc('1', { status: 'enviado', atualizadoEm: iso(local(30, 15, 8)) });
  // Visualizado ter 29/09 10h → D+5 = dom 04/10 → domingo mudo → seg 05/10 09h.
  const visto = orc('2', { status: 'visualizado', atualizadoEm: iso(local(29, 10, 8)) });
  const itens = selecionarFollowUps([enviado, visto], [], AGORA, SEM_DOMINGO);
  ok(itens.length === 2, 'enviado e visualizado entram no follow-up');
  const [i1, i2] = itens;
  ok(i1.orcamentoId === '1' && i1.tipo === 'nao_abriu', 'enviado = "sem sinal de abertura"');
  ok(i1.alvo.getTime() === local(2, HORA_FOLLOWUP).getTime(), 'enviado: D+2 às 09h (sex 02/10 09:00)');
  ok(i1.diasSemMovimento === 2, 'enviado: "2 dias" no texto');
  ok(i2.orcamentoId === '2' && i2.tipo === 'viu_sem_resposta', 'visualizado = "viu e não respondeu"');
  ok(i2.alvo.getTime() === local(5, HORA_FOLLOWUP).getTime(), 'visualizado: D+5 cai no domingo mudo → segunda 09:00');
  ok(i2.diasSemMovimento === 6, 'domingo pulado conta no "há N dias" (6, não 5)');

  const comDomingo = selecionarFollowUps([visto], [], AGORA, COM_DOMINGO);
  ok(comDomingo[0].alvo.getTime() === local(4, HORA_FOLLOWUP).getTime(), 'domingo liberado em Conta → dispara no domingo');

  for (const i of itens) {
    const h = i.alvo.getHours();
    ok(h >= 7 && h < 20 && i.alvo.getDay() !== 0, `lembrete ${i.orcamentoId} fora da madrugada e fora do domingo`);
  }

  const notifs = planejarFollowUps([enviado, visto], [], AGORA, SEM_DOMINGO);
  ok(notifs.length === 2, 'horários diferentes = 2 notificações');
  ok(notifs[0].data.orcamentoId === '1' && notifs[0].data.origem === ORIGEM_FOLLOWUP, 'toque do lembrete único abre o orçamento');
  ok(notifs[0].titulo === 'Orçamento nº 001 sem resposta', 'título traz o número do orçamento');
  ok(notifs[0].corpo.includes('Cliente1') && notifs[0].corpo.includes('1.500,00'), 'corpo traz cliente e valor reais');
  ok(notifs[0].corpo.includes('sem sinal de que o link foi aberto'), 'copy honesta: "sem sinal", nunca "o cliente não abriu"');
  ok(notifs[1].corpo.includes('abriu o orçamento') && notifs[1].corpo.includes('ainda não respondeu'), 'D+5 diz que viu e não respondeu');
}

console.log('\n2) quem sai do follow-up não ganha lembrete');
{
  const fora = [
    orc('aprov', { status: 'aprovado' }),
    orc('recus', { status: 'recusado' }),
    orc('negoc', { status: 'em_negociacao' }),
    orc('assin', { status: 'aguardando_assinatura' }),
    orc('rasc', { status: 'rascunho' }),
    orc('pago', { status: 'enviado' }),
    orc('venc', { status: 'enviado', validadeOrcamento: '01/10/2026' }),
    orc('lixo', { status: 'enviado', excluidoEm: iso(local(30, 16, 8)) }),
    orc('data', { status: 'enviado', atualizadoEm: 'lixo', criadoEm: 'lixo' }),
    // Enviado seg 28/09 → D+2 = qua 30/09 09h, já passou: sem rajada de atrasados.
    orc('velho', { status: 'enviado', atualizadoEm: iso(local(28, 8, 8)) }),
  ];
  const itens = selecionarFollowUps(fora, [recibo('pago')], AGORA, SEM_DOMINGO);
  ok(itens.length === 0, 'respondido/negociando/rascunho/pago/vencido/lixeira/data ilegível/atrasado = nenhum lembrete');
  const estornado = selecionarFollowUps([orc('pago', {})], [recibo('pago', { estornadoEm: iso(AGORA) })], AGORA, SEM_DOMINGO);
  ok(estornado.length === 1, 'recibo estornado não conta como pago (mesma regra do radar)');
}

console.log('\n3) agrupamento no mesmo horário');
{
  const a = orc('a', { clienteNome: 'Ana Souza', atualizadoEm: iso(local(30, 9, 8)) });
  const b = orc('b', { clienteNome: 'Bruno Lima', atualizadoEm: iso(local(30, 18, 8)) });
  const c = orc('c', { clienteNome: 'Carla Dias', atualizadoEm: iso(local(30, 20, 8)) });
  const notifs = planejarFollowUps([a, b, c], [], AGORA, SEM_DOMINGO);
  ok(notifs.length === 1, '3 lembretes às 09h de sexta viram 1 notificação');
  ok(notifs[0].titulo === '3 orçamentos esperando resposta', 'título agrupado com a contagem');
  ok(notifs[0].corpo.startsWith('Ana, Bruno e mais 1'), 'corpo agrupado lista nomes sem estourar');
  ok(notifs[0].data.listaOrcamentos === 'followUp' && !notifs[0].data.orcamentoId, 'agrupado abre a lista de orçamentos');
}

console.log('\n4) cancelamento por reconciliação');
{
  const x = orc('x', { atualizadoEm: iso(local(30, 15, 8)) });
  const y = orc('y', { status: 'visualizado', atualizadoEm: iso(local(29, 10, 8)) });
  const plano1 = planejarFollowUps([x, y], [], AGORA, SEM_DOMINGO);
  const agendadas: AgendadaExistente[] = plano1.map((p, i) => ({ id: `n${i}`, chave: p.data.chave }));
  const idDeX = agendadas[plano1.findIndex((p) => p.data.orcamentoId === 'x')].id;

  const igual = reconciliarAgendadas(agendadas, plano1);
  ok(igual.cancelar.length === 0 && igual.criar.length === 0, 'nada mudou = nada cancela, nada recria');

  // O cliente de X aprovou no link → próximo sync: X sai do plano e é CANCELADO.
  const plano2 = planejarFollowUps([{ ...x, status: 'aprovado' }, y], [], AGORA, SEM_DOMINGO);
  const r2 = reconciliarAgendadas(agendadas, plano2);
  ok(r2.cancelar.length === 1 && r2.cancelar[0] === idDeX, 'resposta do cliente cancela o lembrete daquele orçamento');
  ok(r2.criar.length === 0, 'o lembrete de Y é mantido, não recriado');

  // Recusou → também cancela; pagou → também cancela.
  const r3 = reconciliarAgendadas(agendadas, planejarFollowUps([{ ...x, status: 'recusado' }, y], [], AGORA, SEM_DOMINGO));
  ok(r3.cancelar.includes(idDeX), 'recusa cancela');
  const r4 = reconciliarAgendadas(agendadas, planejarFollowUps([x, y], [recibo('x')], AGORA, SEM_DOMINGO));
  ok(r4.cancelar.includes(idDeX), 'pagamento registrado cancela');

  // X foi visualizado: o D+2 é cancelado e nasce o D+5.
  const vistoAgora = { ...x, status: 'visualizado' as const, atualizadoEm: iso(local(1, 11)) };
  const r5 = reconciliarAgendadas(agendadas, planejarFollowUps([vistoAgora, y], [], AGORA, SEM_DOMINGO));
  ok(r5.cancelar.includes(idDeX) && r5.criar.length === 1 && r5.criar[0].data.orcamentoId === 'x', 'abriu o link: troca D+2 por D+5');

  const lixo = reconciliarAgendadas([{ id: 'sem', chave: null }, ...agendadas, { id: 'dup', chave: agendadas[0].chave }], plano1);
  ok(lixo.cancelar.includes('sem') && lixo.cancelar.includes('dup') && lixo.criar.length === 0, 'agendamento sem chave ou duplicado é cancelado');
}

console.log('\n5) aviso diário de rascunhos');
{
  const velho = orc('r1', { status: 'rascunho', criadoEm: iso(local(30, 15, 8)), atualizadoEm: iso(local(30, 15, 8)) });
  const novo = orc('r2', { status: 'rascunho', criadoEm: iso(local(1, 10)), atualizadoEm: iso(local(1, 10)) });
  const editado = orc('r3', { status: 'rascunho', criadoEm: iso(local(20, 9, 8)), atualizadoEm: iso(local(20, 9, 8)), editadoEm: iso(local(1, 11)) });
  const excluido = orc('r4', { status: 'rascunho', criadoEm: iso(local(20, 9, 8)), atualizadoEm: iso(local(20, 9, 8)), excluidoEm: iso(local(1, 8)) });
  const aviso = planejarAvisoRascunhos([velho, novo, editado, excluido, orc('e', {})], AGORA, SEM_DOMINGO) as NotificacaoPlanejada;
  ok(aviso !== null, 'há rascunho com 24h+ → aviso');
  ok(aviso.alvo.getTime() === local(1, HORA_AVISO_RASCUNHOS).getTime(), 'aviso no próximo 16h (hoje)');
  ok(aviso.titulo === '1 orçamento pronto para enviar', 'conta só o rascunho parado há 24h+ (singular correto)');
  ok(aviso.data.listaOrcamentos === 'rascunhos', 'toque abre a lista de orçamentos');

  const dois = planejarAvisoRascunhos([velho, { ...excluido, id: 'r5', excluidoEm: undefined }], AGORA, SEM_DOMINGO) as NotificacaoPlanejada;
  ok(dois.titulo === '2 orçamentos prontos para enviar' && dois.corpo.startsWith('Rascunhos parados há mais de 24 horas'), 'plural correto');

  ok(planejarAvisoRascunhos([novo, orc('e', {})], AGORA, SEM_DOMINGO) === null, 'sem rascunho parado = silêncio (nunca "0 orçamentos")');

  const sabadoTarde = local(3, 17);
  const segunda = planejarAvisoRascunhos([velho], sabadoTarde, SEM_DOMINGO) as NotificacaoPlanejada;
  ok(segunda.alvo.getTime() === local(5, HORA_AVISO_RASCUNHOS).getTime(), 'sábado depois das 16h: domingo mudo → segunda 16h');
  const domingo = planejarAvisoRascunhos([velho], sabadoTarde, COM_DOMINGO) as NotificacaoPlanejada;
  ok(domingo.alvo.getTime() === local(4, HORA_AVISO_RASCUNHOS).getTime(), 'domingo liberado → domingo 16h');

  const r = reconciliarAgendadas([{ id: 'ontem', chave: 'chave-de-ontem' }], [aviso]);
  ok(r.cancelar[0] === 'ontem' && r.criar.length === 1, 'um aviso por vez: o de outro dia é trocado, não acumulado');
}

console.log('\n6) "Cliente aprovou/recusou" uma vez por orçamento');
{
  const u = 'user-1';
  const horasAtras = (h: number) => iso(new Date(AGORA.getTime() - h * 3_600_000));
  const dados = (n: string) => ({ numero: n, clienteNome: `Pessoa${n} X`, valorTotal: 800 });
  const respostas: RespostaDoLink[] = [
    { orcamentoId: 'A', status: 'aprovado', respondidoEm: horasAtras(1), orcamento: dados('10') },
    { orcamentoId: 'B', status: 'recusado', respondidoEm: horasAtras(24 * 10), orcamento: dados('11') },
    { orcamentoId: 'C', status: 'aprovado', orcamento: dados('12') },
    { orcamentoId: 'D', status: 'recusado', respondidoEm: horasAtras(2), orcamento: null },
    { orcamentoId: 'E', status: 'visualizado', orcamento: dados('13') },
  ];
  const comLink = ['A', 'B', 'C', 'D', 'E', 'F'];

  const r1 = decidirAvisosDeResposta(respostas, comLink, null, u, AGORA);
  ok(r1.avisar.length === 1 && r1.avisar[0].orcamentoId === 'A', 'primeira leitura: só a resposta recente vira notificação');
  ok(r1.avisar[0].titulo === 'Cliente aprovou' && r1.avisar[0].corpo.includes('nº 10') && r1.avisar[0].corpo.includes('800,00'), 'texto derivado do orçamento real');
  ok(['A', 'B', 'C', 'D'].every((id) => r1.novoEstado.ids.includes(id)), 'antigas/sem data/excluídas entram no conjunto EM SILÊNCIO');
  ok(!r1.novoEstado.ids.includes('E'), 'link só visualizado não conta como resposta');

  const r2 = decidirAvisosDeResposta(respostas, comLink, r1.novoEstado, u, AGORA);
  ok(r2.avisar.length === 0, 'DEDUPE: o mesmo sync de novo não avisa outra vez');

  const persistido = lerEstadoRespostas(JSON.parse(JSON.stringify(r1.novoEstado)));
  const r3 = decidirAvisosDeResposta(respostas, comLink, persistido, u, AGORA);
  ok(r3.avisar.length === 0, 'DEDUPE sobrevive à ida e volta pelo AsyncStorage (JSON)');

  const nova: RespostaDoLink = { orcamentoId: 'F', status: 'recusado', orcamento: dados('14') };
  const r4 = decidirAvisosDeResposta([...respostas, nova], comLink, persistido, u, AGORA);
  ok(r4.avisar.length === 1 && r4.avisar[0].orcamentoId === 'F' && r4.avisar[0].titulo === 'Cliente recusou', 'resposta nova depois da 1ª leitura avisa (mesmo sem data)');
  const r5 = decidirAvisosDeResposta([...respostas, nova], comLink, r4.novoEstado, u, AGORA);
  ok(r5.avisar.length === 0, 'e só uma vez');

  const outraConta = decidirAvisosDeResposta(respostas, comLink, r1.novoEstado, 'user-2', AGORA);
  ok(outraConta.novoEstado.userId === 'user-2' && outraConta.avisar.length === 1, 'outra conta no aparelho começa do zero (conjunto da conta anterior não vale)');

  const podado = decidirAvisosDeResposta(respostas, ['A'], r1.novoEstado, u, AGORA);
  ok(podado.novoEstado.ids.join() === 'A', 'conjunto podado aos orçamentos que ainda têm link');

  ok(lerEstadoRespostas(null) === null && lerEstadoRespostas({ ids: 'x' }) === null, 'estado ilegível = tratado como conta nova (com janela de 48h)');
}

console.log('\n7) fiação');
{
  const cloud = semComentarios(ler('../src/services/cloudSync.ts'));
  const iSync = cloud.indexOf('export async function syncOnLogin');
  const sync = cloud.slice(iSync);
  const iPull = sync.indexOf('await pullAll(geracao)');
  const iLinks = sync.indexOf('m.sincronizarStatusLinks()');
  const iFollow = sync.indexOf('m.reagendarFollowUps()');
  ok(iPull > 0 && iLinks > iPull, 'syncOnLogin chama sincronizarStatusLinks DEPOIS do pull');
  ok(iFollow > iLinks, 'e reagenda os follow-ups depois do status novo');
  const iAgenda = sync.indexOf('m.resincronizarLembretes()');
  ok(iAgenda > 0 && iFollow > iAgenda && /resincronizarLembretes\(\)\)\s*\.catch\(\(\) => \{\}\)\s*\.then\(\(\) => import\('\.\/followUpLembretes'\)\)/.test(sync),
    'follow-ups ENCADEADOS depois do resincronizarLembretes da agenda (o cancelAll dela não derruba os lembretes)');

  const link = semComentarios(ler('../src/services/clienteLink.ts'));
  const iFn = link.indexOf('export async function sincronizarStatusLinks');
  const fn = link.slice(iFn, link.indexOf('\nexport ', iFn + 10));
  ok(fn.includes('avisarRespostasDoCliente(user.id, respostas, idsComLink)'), 'sincronizarStatusLinks dispara o aviso de resposta');
  ok(fn.includes('if (rows === null) return 0;'), 'leitura de links que falhou não vira "nenhuma resposta"');

  const app = semComentarios(ler('../App.tsx'));
  ok(/data\.orcamentoId\)[^\n]*'VisualizarOrcamento', \{ orcamentoId: data\.orcamentoId \}/.test(app), 'toque com orcamentoId abre VisualizarOrcamento');
  ok(app.includes("!data?.orcamentoId && !data?.listaOrcamentos"), 'payload de follow-up passa pelo filtro do listener');

  const servico = semComentarios(ler('../src/services/followUpLembretes.ts'));
  ok(!servico.includes('requestPermissionsAsync'), 'nunca pede permissão sozinho');
  ok(servico.includes("CANAL_FOLLOWUP_ANDROID_ID = 'orcamentos-followup'") && !servico.includes('CANAL_RITUAL_ANDROID_ID'),
    'canal Android próprio (silenciar o Ritual diário não cala o "Cliente aprovou")');
  ok(/naFila\(\(\) => avisarRespostasAgora/.test(servico) && /naFila\(\(\) => reagendarFollowUpsAgora/.test(servico) && servico.includes('naFila(cancelarFollowUpLembretesAgora)'),
    'aviso, reconciliação e cancelamento serializados (chamadas concorrentes não duplicam o aviso)');

  const db = semComentarios(ler('../src/database/database.ts'));
  ok(db.includes('await cancelarFollowUpLembretes()'), 'logout (limpar dados) cancela os lembretes de follow-up');
  const chaves = semComentarios(ler('../src/services/storageKeys.ts'));
  const lista = chaves.slice(chaves.indexOf('APP_DATA_STORAGE_KEYS'));
  ok(lista.includes('RESPOSTAS_AVISADAS_KEY'), 'conjunto de respostas avisadas sai no logout (APP_DATA_STORAGE_KEYS)');
}

console.log(`\nteste-followup-lembretes: ${oks} ok`);
