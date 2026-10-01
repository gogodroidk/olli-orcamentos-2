/**
 * Agenda — camada de dados do item 2.8:
 *   exceções por ocorrência na série, editar só esta / esta e as próximas / a série,
 *   lembrete por ocorrência, OS concluída → visita concluída, conflito por técnico com
 *   duração, decididoEm nos KPIs do mês, busca do catálogo sem acento e por uso, tipos
 *   de visita por ofício, e a migration 20261001120000 rodando num Postgres (PGlite).
 *
 *     node scripts/teste-agenda-excecoes.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * As consultas SQL do aparelho rodam num SQLite de verdade (`node:sqlite`) — as MESMAS
 * strings que o app usa (`src/database/consultasSql.ts`). O banco de produção não é tocado.
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import type { Agendamento, Orcamento } from '../src/types/index.ts';
import {
  dividirIdOcorrencia,
  ehDiaDaSerie,
  encontrarConflitosPorTecnico,
  excecoesParaTexto,
  expandirRecorrencia,
  idAgendamentoDaOS,
  lerExcecoes,
  planejarEdicaoRecorrente,
  planejarLembretes,
  visitaConcluidaPelaOS,
} from '../src/utils/contratoRecorrente.ts';
import { carimbarDecisao } from '../src/utils/orcamentoDecisao.ts';
import { paramsBuscaCatalogo, sqlAgregadoPorStatusNoPeriodo, sqlBuscaCatalogo } from '../src/database/consultasSql.ts';
import { tiposDeVisita, VERTICAIS } from '../src/services/verticais.ts';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) {
    console.log(`  ok   ${nome}`);
    ok++;
  } else {
    console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`);
    falhas++;
  }
}
function lanca(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id).join(',');

// Série semanal: toda segunda 09:00 de Brasília (12:00Z), 1h, desde 05/10/2026.
const SERIE: Agendamento = {
  id: 'S',
  clienteNome: 'Condomínio Azul',
  titulo: 'Piscina',
  tipo: 'manutencao',
  inicio: '2026-10-05T12:00:00.000Z',
  fim: '2026-10-05T13:00:00.000Z',
  status: 'agendado',
  criadoEm: '2026-09-01T00:00:00.000Z',
  atualizadoEm: '2026-09-01T00:00:00.000Z',
  recorrencia: 'semanal',
  responsavelId: 'tec-1',
  responsavelNome: 'Ana',
};
const OUTUBRO: [string, string] = ['2026-10-01T03:00:00.000Z', '2026-11-01T03:00:00.000Z'];
const AGORA = new Date('2026-10-01T12:00:00.000Z');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) expandirRecorrencia aplica as exceções');
{
  const semExc = expandirRecorrencia(SERIE, ...OUTUBRO);
  checar('sem exceção: 4 segundas em outubro (5,12,19,26)', ids(semExc) === 'S,S@2026-10-12,S@2026-10-19,S@2026-10-26', ids(semExc));

  const comExc: Agendamento = {
    ...SERIE,
    excecoes: {
      '2026-10-12': { cancelada: true },
      '2026-10-19': { inicio: '2026-10-20T17:00:00.000Z' }, // terça 14:00
      '2026-10-26': { status: 'concluido', responsavelId: 'tec-2', responsavelNome: 'Bia' },
      '2026-11-02': { inicio: '2026-10-31T12:00:00.000Z' }, // puxada para DENTRO de outubro
      '2026-10-13': { inicio: '2026-10-14T12:00:00.000Z' }, // terça: não é dia da série
    },
  };
  const out = expandirRecorrencia(comExc, ...OUTUBRO);
  checar('cancelada some, movida entra pelo horário novo, de fora entra', ids(out) === 'S,S@2026-10-19,S@2026-10-26,S@2026-11-02', ids(out));
  const movida = out.find((o) => o.id === 'S@2026-10-19');
  checar('movida: início novo e duração preservada', movida?.inicio === '2026-10-20T17:00:00.000Z' && movida?.fim === '2026-10-20T18:00:00.000Z');
  checar('movida: dataOcorrencia é o dia ORIGINAL', movida?.dataOcorrencia === '2026-10-19');
  const conc = out.find((o) => o.id === 'S@2026-10-26');
  checar('status e técnico só desta ocorrência', conc?.status === 'concluido' && conc?.responsavelId === 'tec-2' && conc?.responsavelNome === 'Bia');
  checar('chave que não é dia da série não fabrica visita', !out.some((o) => o.id === 'S@2026-10-13'));

  // A movida para fora some da janela de onde saiu.
  const semana19 = expandirRecorrencia(comExc, '2026-10-19T03:00:00.000Z', '2026-10-20T03:00:00.000Z');
  checar('dia 19 fica vazio (a visita foi para o dia 20)', semana19.length === 0, ids(semana19));
  const nov = expandirRecorrencia(comExc, '2026-11-01T03:00:00.000Z', '2026-11-03T03:00:00.000Z');
  checar('02/11 movida para 31/10 não aparece em novembro', nov.length === 0, ids(nov));

  const baseCancelada = expandirRecorrencia({ ...SERIE, excecoes: { '2026-10-05': { cancelada: true } } }, ...OUTUBRO);
  checar('1ª ocorrência (a própria linha) também pode ser cancelada', ids(baseCancelada) === 'S@2026-10-12,S@2026-10-19,S@2026-10-26', ids(baseCancelada));
  const baseMovida = expandirRecorrencia({ ...SERIE, excecoes: { '2026-10-05': { inicio: '2026-10-06T12:00:00.000Z' } } }, ...OUTUBRO);
  checar('1ª ocorrência movida vira S@<dia>', baseMovida[0]?.id === 'S@2026-10-05' && baseMovida[0]?.ocorrenciaDe === 'S');

  const mensal31: Agendamento = { ...SERIE, id: 'M', recorrencia: 'mensal', inicio: '2027-01-31T12:00:00.000Z', fim: undefined };
  checar('ehDiaDaSerie respeita a âncora 31 (fev = 28)', ehDiaDaSerie(mensal31, '2027-02-28') && !ehDiaDaSerie(mensal31, '2027-02-27') && ehDiaDaSerie(mensal31, '2027-03-31'));
  checar('ehDiaDaSerie respeita recorrenciaAte', !ehDiaDaSerie({ ...SERIE, recorrenciaAte: '2026-10-18' }, '2026-10-19'));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n2) lerExcecoes: TEXT/jsonb → domínio, ilegível LANÇA');
{
  checar('null/vazio → sem exceções', lerExcecoes(null) === undefined && lerExcecoes('') === undefined && lerExcecoes({}) === undefined);
  const lido = lerExcecoes('{"2026-10-12":{"cancelada":true,"lixo":1},"nao-e-dia":{"cancelada":true},"2026-10-19":{"status":"inventado"}}');
  checar('lê do TEXT, descarta campo/chave/status inválidos', JSON.stringify(lido) === '{"2026-10-12":{"cancelada":true}}', JSON.stringify(lido));
  checar('JSON quebrado lança (não vira "nenhuma cancelada")', lanca(() => lerExcecoes('{quebrado')));
  checar('array lança', lanca(() => lerExcecoes([1, 2])));
  checar('ida e volta pelo TEXT', JSON.stringify(lerExcecoes(excecoesParaTexto({ '2026-10-12': { cancelada: true } }))) === '{"2026-10-12":{"cancelada":true}}');
  checar('sem exceções grava NULL', excecoesParaTexto(undefined) === null && excecoesParaTexto({}) === null);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3) editar só esta');
{
  const opcoes = { agora: AGORA, novoId: 'NOVA' };
  const cancelar = planejarEdicaoRecorrente(SERIE, 'S@2026-10-12', 'so_esta', { cancelar: true }, opcoes);
  checar('cancelar grava a exceção do dia, sem série nova', cancelar.base.excecoes?.['2026-10-12']?.cancelada === true && !cancelar.novaSerie);
  checar('série base intacta (início, recorrência, fim)', cancelar.base.inicio === SERIE.inicio && cancelar.base.recorrencia === 'semanal' && !cancelar.base.recorrenciaAte);
  checar('carimba atualizadoEm', cancelar.base.atualizadoEm === AGORA.toISOString());
  checar('expansão reflete o cancelamento', !expandirRecorrencia(cancelar.base, ...OUTUBRO).some((o) => o.id === 'S@2026-10-12'));

  const mover = planejarEdicaoRecorrente(SERIE, 'S@2026-10-19', 'so_esta', { inicio: '2026-10-19T18:00:00.000Z', fim: '2026-10-19T20:00:00.000Z' }, opcoes);
  const o19 = expandirRecorrencia(mover.base, ...OUTUBRO).find((o) => o.id === 'S@2026-10-19');
  checar('mover: ocorrência no horário novo com o fim novo', o19?.inicio === '2026-10-19T18:00:00.000Z' && o19?.fim === '2026-10-19T20:00:00.000Z');
  const voltar = planejarEdicaoRecorrente(mover.base, 'S@2026-10-19', 'so_esta', { inicio: '2026-10-19T12:00:00.000Z', fim: null }, opcoes);
  checar('voltar ao horário da série remove a exceção', voltar.base.excecoes === undefined, JSON.stringify(voltar.base.excecoes));

  const tecnico = planejarEdicaoRecorrente(SERIE, 'S', 'so_esta', { responsavelId: 'tec-9', responsavelNome: 'Caio' }, opcoes);
  checar('id da base = 1ª ocorrência', tecnico.base.excecoes?.['2026-10-05']?.responsavelId === 'tec-9');

  checar('dia fora da série lança', lanca(() => planejarEdicaoRecorrente(SERIE, 'S@2026-10-13', 'so_esta', { cancelar: true }, opcoes)));
  checar('id de outra linha lança', lanca(() => planejarEdicaoRecorrente(SERIE, 'X@2026-10-12', 'so_esta', { cancelar: true }, opcoes)));
  checar('agendamento sem recorrência lança', lanca(() => planejarEdicaoRecorrente({ ...SERIE, recorrencia: undefined }, 'S', 'so_esta', { cancelar: true }, opcoes)));
  checar('horário inválido lança', lanca(() => planejarEdicaoRecorrente(SERIE, 'S@2026-10-12', 'so_esta', { inicio: 'amanhã' }, opcoes)));
  checar('dividirIdOcorrencia', dividirIdOcorrencia('S@2026-10-12').dia === '2026-10-12' && dividirIdOcorrencia('S').dia === null);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n4) editar esta e as próximas');
{
  const opcoes = { agora: AGORA, novoId: 'NOVA' };
  const comExc: Agendamento = {
    ...SERIE,
    recorrenciaAte: '2026-12-31',
    excecoes: { '2026-10-12': { cancelada: true }, '2026-11-02': { cancelada: true }, '2026-11-09': { status: 'concluido' } },
  };
  const plano = planejarEdicaoRecorrente(comExc, 'S@2026-10-19', 'esta_e_proximas', { inicio: '2026-10-19T13:00:00.000Z' }, opcoes);
  checar('série antiga termina na véspera', plano.base.recorrenciaAte === '2026-10-18');
  checar('série antiga fica só com as exceções de antes', JSON.stringify(Object.keys(plano.base.excecoes ?? {})) === '["2026-10-12"]');
  const nova = plano.novaSerie;
  checar('série nova começa nesta ocorrência, no horário novo', nova?.id === 'NOVA' && nova?.inicio === '2026-10-19T13:00:00.000Z' && nova?.fim === '2026-10-19T14:00:00.000Z');
  checar('série nova herda regra, fim da série e técnico', nova?.recorrencia === 'semanal' && nova?.recorrenciaAte === '2026-12-31' && nova?.responsavelId === 'tec-1');
  checar('exceções futuras vão para a série nova', JSON.stringify(Object.keys(nova?.excecoes ?? {})) === '["2026-11-02","2026-11-09"]');
  checar('série nova nasce agora, sem OS ligada', nova?.criadoEm === AGORA.toISOString() && nova?.ordemServicoId === undefined);
  const juntas = [...expandirRecorrencia(plano.base, ...OUTUBRO), ...expandirRecorrencia(nova as Agendamento, ...OUTUBRO)].map((o) => o.inicio).sort();
  checar(
    'juntas: 05 (09h), 19 e 26 (10h) — 12 segue cancelada, sem duplicar',
    JSON.stringify(juntas) === JSON.stringify(['2026-10-05T12:00:00.000Z', '2026-10-19T13:00:00.000Z', '2026-10-26T13:00:00.000Z']),
    JSON.stringify(juntas),
  );

  const mudaDia = planejarEdicaoRecorrente(comExc, 'S@2026-10-19', 'esta_e_proximas', { inicio: '2026-10-20T12:00:00.000Z' }, opcoes);
  checar('mudou o dia da semana: exceções antigas não casam e ficam de fora', mudaDia.novaSerie?.excecoes === undefined);

  const cancelar = planejarEdicaoRecorrente(comExc, 'S@2026-10-19', 'esta_e_proximas', { cancelar: true }, opcoes);
  checar('cancelar esta e as próximas = só encerrar a série', cancelar.base.recorrenciaAte === '2026-10-18' && !cancelar.novaSerie);

  const naPrimeira = planejarEdicaoRecorrente(comExc, 'S', 'esta_e_proximas', { titulo: 'Piscina (novo)' }, opcoes);
  checar('na 1ª ocorrência equivale à série toda', !naPrimeira.novaSerie && naPrimeira.base.titulo === 'Piscina (novo)' && naPrimeira.base.recorrenciaAte === '2026-12-31');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n5) editar a série toda');
{
  const opcoes = { agora: AGORA, novoId: 'NOVA' };
  const comExc: Agendamento = { ...SERIE, excecoes: { '2026-10-12': { cancelada: true }, '2026-10-26': { inicio: '2026-10-27T12:00:00.000Z' } } };
  const hora = planejarEdicaoRecorrente(comExc, 'S@2026-10-19', 'toda_serie', { inicio: '2026-10-19T14:30:00.000Z' }, opcoes);
  checar('desloca a série inteira (09h → 11h30)', hora.base.inicio === '2026-10-05T14:30:00.000Z' && hora.base.fim === '2026-10-05T15:30:00.000Z');
  checar('só a hora mudou: exceções continuam', hora.base.excecoes?.['2026-10-12']?.cancelada === true && !!hora.base.excecoes?.['2026-10-26']);
  const out = expandirRecorrencia(hora.base, ...OUTUBRO);
  checar('expansão no horário novo, cancelada continua fora', ids(out) === 'S,S@2026-10-19,S@2026-10-26' && out[1].inicio === '2026-10-19T14:30:00.000Z', `${ids(out)} ${out[1]?.inicio}`);

  const dia = planejarEdicaoRecorrente(comExc, 'S@2026-10-19', 'toda_serie', { inicio: '2026-10-21T12:00:00.000Z' }, opcoes);
  checar('mudou o dia: série vai para quarta e exceções caem', dia.base.inicio === '2026-10-07T12:00:00.000Z' && dia.base.excecoes === undefined);

  const semHora = planejarEdicaoRecorrente(comExc, 'S@2026-10-26', 'toda_serie', { titulo: 'Piscina + filtro' }, opcoes);
  checar('sem horário novo a série não anda (mesmo abrindo a ocorrência movida)', semHora.base.inicio === SERIE.inicio && semHora.base.titulo === 'Piscina + filtro');
  checar('a exceção da ocorrência editada é absorvida', !semHora.base.excecoes?.['2026-10-26'] && semHora.base.excecoes?.['2026-10-12']?.cancelada === true);

  const cancelar = planejarEdicaoRecorrente(comExc, 'S@2026-10-19', 'toda_serie', { cancelar: true }, opcoes);
  const projCancelada = expandirRecorrencia(cancelar.base, ...OUTUBRO);
  checar(
    'cancelar a série = status cancelado (só a linha base, cancelada; nada projetado)',
    cancelar.base.status === 'cancelado' && ids(projCancelada) === 'S' && projCancelada[0].status === 'cancelado',
    ids(projCancelada),
  );
  checar('fim antes do início lança', lanca(() => planejarEdicaoRecorrente(comExc, 'S@2026-10-19', 'toda_serie', { inicio: '2026-10-19T14:00:00.000Z', fim: '2026-10-19T13:00:00.000Z' }, opcoes)));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n6) lembrete por ocorrência (janela de 14 dias, chave id@dia)');
{
  const agora = new Date('2026-10-06T12:00:00.000Z');
  const serie: Agendamento = { ...SERIE, excecoes: { '2026-10-12': { cancelada: true }, '2026-10-19': { inicio: '2026-10-19T18:00:00.000Z' } } };
  const plano = planejarLembretes(serie, agora, 60);
  checar('14 dias: só a de 19/10 (12 cancelada; 26 fora da janela)', plano.map((l) => l.chave).join(',') === 'S@2026-10-19', plano.map((l) => l.chave).join(','));
  checar('dispara 1h antes do horário MOVIDO', plano[0]?.disparo.toISOString() === '2026-10-19T17:00:00.000Z');
  const semExc = planejarLembretes(SERIE, agora, 60).map((l) => l.chave).join(',');
  checar('sem exceção: 12 e 19', semExc === 'S@2026-10-12,S@2026-10-19', semExc);
  const concluida = planejarLembretes({ ...SERIE, excecoes: { '2026-10-12': { status: 'concluido' } } }, agora, 60).map((l) => l.chave).join(',');
  checar('ocorrência concluída não lembra', concluida === 'S@2026-10-19', concluida);
  const avulso: Agendamento = { ...SERIE, id: 'A', recorrencia: undefined, inicio: '2026-12-20T12:00:00.000Z', fim: undefined };
  const lAvulso = planejarLembretes(avulso, agora, 60);
  checar('avulso não tem janela (lembra mesmo daqui a 2 meses), chave = id', lAvulso.length === 1 && lAvulso[0].chave === 'A');
  checar('lembrete que já passou não é criado', planejarLembretes({ ...avulso, inicio: '2026-10-06T12:30:00.000Z' }, agora, 60).length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n7) OS concluída → visita concluída');
{
  const agora = new Date('2026-10-10T20:00:00.000Z');
  const os = { id: 'os-1', status: 'concluida' as const, dataAgendada: '2026-10-10T12:00:00.000Z' };
  const visita: Agendamento = { ...SERIE, id: 'V', recorrencia: undefined, ordemServicoId: 'os-1' };
  const v = visitaConcluidaPelaOS(visita, os, agora);
  checar('avulsa ligada pelo campo vira concluída', v?.status === 'concluido' && v?.atualizadoEm === agora.toISOString());
  checar('idempotente: já concluída não muda de novo', visitaConcluidaPelaOS({ ...visita, status: 'concluido' }, os, agora) === null);
  checar('OS não concluída não mexe', visitaConcluidaPelaOS(visita, { ...os, status: 'em_execucao' }, agora) === null);
  checar('visita de outra OS não mexe', visitaConcluidaPelaOS({ ...visita, ordemServicoId: 'os-2' }, os, agora) === null);
  checar('cancelada não vira concluída', visitaConcluidaPelaOS({ ...visita, status: 'cancelado' }, os, agora) === null);
  checar('contrato: os_cv_X ↔ ag_cv_X', idAgendamentoDaOS('os_cv_c1_2026-10') === 'ag_cv_c1_2026-10' && idAgendamentoDaOS('os-1') === null);
  const doContrato = visitaConcluidaPelaOS({ ...visita, id: 'ag_cv_c1_2026-10', ordemServicoId: undefined }, { ...os, id: 'os_cv_c1_2026-10' }, agora);
  checar('visita de contrato concluída sem o campo', doContrato?.status === 'concluido');
  const serie = visitaConcluidaPelaOS({ ...SERIE, ordemServicoId: 'os-1' }, { ...os, dataAgendada: '2026-10-12T12:00:00.000Z' }, agora);
  checar('série: conclui SÓ a ocorrência do dia da OS', serie?.status === 'agendado' && serie?.excecoes?.['2026-10-12']?.status === 'concluido');
  const movida = visitaConcluidaPelaOS(
    { ...SERIE, ordemServicoId: 'os-1', excecoes: { '2026-10-12': { inicio: '2026-10-13T12:00:00.000Z' } } },
    { ...os, dataAgendada: '2026-10-13T12:00:00.000Z' },
    agora,
  );
  checar('série: acha a ocorrência MOVIDA para o dia da OS', movida?.excecoes?.['2026-10-12']?.status === 'concluido' && movida?.excecoes?.['2026-10-12']?.inicio === '2026-10-13T12:00:00.000Z');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n8) conflito por técnico considerando duração');
{
  const base = { status: 'agendado' as const, fim: undefined };
  const itens: Pick<Agendamento, 'id' | 'inicio' | 'fim' | 'tipo' | 'status' | 'responsavelId'>[] = [
    { ...base, id: 'inst', inicio: '2026-10-05T12:00:00.000Z', tipo: 'instalacao', responsavelId: 'tec-1' }, // 09h–12h (3h padrão)
    { ...base, id: 'orc', inicio: '2026-10-05T17:00:00.000Z', tipo: 'orcamento', responsavelId: 'tec-1' }, // 14h–14h30
    { ...base, id: 'outro-tec', inicio: '2026-10-05T13:00:00.000Z', tipo: 'visita', responsavelId: 'tec-2' },
    { ...base, id: 'canc', inicio: '2026-10-05T14:00:00.000Z', tipo: 'visita', responsavelId: 'tec-1', status: 'cancelado' },
    { ...base, id: 'dono', inicio: '2026-10-05T14:00:00.000Z', tipo: 'visita' },
  ];
  const c1 = encontrarConflitosPorTecnico(itens, { inicio: '2026-10-05T14:00:00.000Z', tipo: 'visita', responsavelId: 'tec-1' });
  checar('11h colide com a instalação das 9h (duração do TIPO: 3h)', ids(c1) === 'inst', ids(c1));
  const c2 = encontrarConflitosPorTecnico(itens, { inicio: '2026-10-05T17:30:00.000Z', tipo: 'visita', responsavelId: 'tec-1' });
  checar('14h30 não colide com o orçamento de 30min das 14h', c2.length === 0, ids(c2));
  const c3 = encontrarConflitosPorTecnico(itens, { inicio: '2026-10-05T16:00:00.000Z', fim: '2026-10-05T17:10:00.000Z', responsavelId: 'tec-1' });
  checar('fim explícito do candidato conta', ids(c3) === 'orc', ids(c3));
  const c4 = encontrarConflitosPorTecnico(itens, { inicio: '2026-10-05T13:00:00.000Z', responsavelId: 'tec-3' });
  checar('outro técnico livre não conflita', c4.length === 0, ids(c4));
  const c5 = encontrarConflitosPorTecnico(itens, { inicio: '2026-10-05T14:00:00.000Z' });
  checar('sem responsável só bate com sem responsável', ids(c5) === 'dono', ids(c5));
  const c6 = encontrarConflitosPorTecnico(itens, { inicio: '2026-10-05T12:30:00.000Z', responsavelId: 'tec-1', ignorarId: 'inst' });
  checar('ao editar, o próprio item é ignorado', c6.length === 0, ids(c6));
  const serieExp = expandirRecorrencia(SERIE, ...OUTUBRO);
  const c7 = encontrarConflitosPorTecnico(serieExp, { inicio: '2026-10-19T12:30:00.000Z', responsavelId: 'tec-1' });
  checar('ocorrência projetada da série conta', ids(c7) === 'S@2026-10-19', ids(c7));
  const c8 = encontrarConflitosPorTecnico(serieExp, { inicio: '2026-10-19T12:30:00.000Z', responsavelId: 'tec-1', ignorarId: 'S@2026-10-12' });
  checar('editando uma ocorrência, a série dela é ignorada', c8.length === 0, ids(c8));
  checar('início inválido LANÇA (não vira "livre")', lanca(() => encontrarConflitosPorTecnico(itens, { inicio: 'ontem' })));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n9) decididoEm (carimbarDecisao) e KPI do mês no SQLite');
{
  const orc = (o: Partial<Orcamento>): Orcamento => ({ id: 'o1', numero: '1', status: 'enviado', dataEmissao: '2026-09-28', criadoEm: '2026-09-28T12:00:00.000Z', atualizadoEm: '2026-09-28T12:00:00.000Z', valorTotal: 100, ...o }) as Orcamento;
  const out = new Date('2026-10-03T15:00:00.000Z');
  const aprovado = carimbarDecisao(orc({ status: 'enviado' }), orc({ status: 'aprovado' }), out);
  checar('enviado → aprovado carimba decididoEm e ultimaInteracaoEm', aprovado.decididoEm === out.toISOString() && aprovado.ultimaInteracaoEm === out.toISOString());
  const convertido = carimbarDecisao(aprovado, { ...aprovado, status: 'convertido', decididoEm: undefined }, new Date('2026-11-05T12:00:00.000Z'));
  checar('aprovado → convertido mantém a data da APROVAÇÃO', convertido.decididoEm === out.toISOString());
  const reaberto = carimbarDecisao(aprovado, { ...aprovado, status: 'enviado' }, out);
  checar('reaberto perde decididoEm', reaberto.decididoEm === undefined);
  const doLink = carimbarDecisao(orc({}), orc({ status: 'recusado', decididoEm: '2026-10-02T10:00:00.000Z' }), out);
  checar('hora informada (respondido_em do link) é respeitada', doLink.decididoEm === '2026-10-02T10:00:00.000Z');
  const legado = carimbarDecisao(orc({ status: 'aprovado' }), orc({ status: 'convertido' }), out);
  checar('decidido antes do campo existir não ganha carimbo de hoje', legado.decididoEm === undefined);
  const editado = carimbarDecisao(aprovado, { ...aprovado, ultimaInteracaoEm: undefined, decididoEm: undefined }, new Date('2026-12-01T00:00:00.000Z'));
  checar('save sem troca de status preserva os marcos', editado.decididoEm === out.toISOString() && editado.ultimaInteracaoEm === out.toISOString());

  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE orcamentos (id TEXT PRIMARY KEY, numero TEXT, data TEXT NOT NULL)');
  const ins = db.prepare('INSERT INTO orcamentos (id, numero, data) VALUES (?, ?, ?)');
  ins.run('a', '1', JSON.stringify(orc({ id: 'a', status: 'aprovado', decididoEm: '2026-10-03T15:00:00.000Z', valorTotal: 1000 })));
  ins.run('b', '2', JSON.stringify(orc({ id: 'b', status: 'aprovado', dataEmissao: '2026-09-10', valorTotal: 50 }))); // antigo, sem decididoEm
  ins.run('c', '3', JSON.stringify(orc({ id: 'c', status: 'aprovado', dataEmissao: '2026-10-02', valorTotal: 7, decididoEm: 'lixo' })));
  ins.run('d', '4', JSON.stringify(orc({ id: 'd', status: 'aprovado', decididoEm: '2026-10-20T15:00:00.000Z', valorTotal: 3, excluidoEm: '2026-10-21T00:00:00.000Z' })));
  const sql = sqlAgregadoPorStatusNoPeriodo(1);
  const outubro = db.prepare(sql).get('aprovado', '2026-10-01', '2026-11-01') as { contagem: number; soma: number };
  const setembro = db.prepare(sql).get('aprovado', '2026-09-01', '2026-10-01') as { contagem: number; soma: number };
  checar('outubro: o emitido em set e aprovado em out conta em OUT (+ data ilegível cai na emissão)', outubro.contagem === 2 && outubro.soma === 1007, JSON.stringify(outubro));
  checar('setembro: só o antigo sem decididoEm (pela emissão)', setembro.contagem === 1 && setembro.soma === 50, JSON.stringify(setembro));
  db.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n10) busca do catálogo: sem acento e ordenada por uso');
{
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE servicos (id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, preco REAL, unidade TEXT, criado_em TEXT, excluido_em TEXT);
    CREATE TABLE orcamentos (id TEXT PRIMARY KEY, numero TEXT, data TEXT NOT NULL);
  `);
  const s = db.prepare('INSERT INTO servicos (id, nome, descricao, excluido_em) VALUES (?, ?, ?, ?)');
  s.run('s1', 'Instalação Elétrica', null, null);
  s.run('s2', 'Revisão elétrica', 'quadro de distribuição', null);
  s.run('s3', 'Limpeza de split', 'higienização completa', null);
  s.run('s4', 'Elétrica antiga', null, '2026-01-01T00:00:00.000Z');
  const item = (catalogoId: string, tipo = 'servico') => ({ id: `i-${catalogoId}-${Math.random()}`, tipo, catalogoId, nome: '', preco: 1, quantidade: 1, unidade: 'un', subtotal: 1 });
  const o = db.prepare('INSERT INTO orcamentos (id, numero, data) VALUES (?, ?, ?)');
  o.run('o1', '1', JSON.stringify({ itens: [item('s2'), item('s3')] }));
  o.run('o2', '2', JSON.stringify({ itens: [item('s2'), item('s1', 'produto')] }));
  o.run('o3', '3', JSON.stringify({ itens: [item('s1')], excluidoEm: '2026-01-01T00:00:00.000Z' })); // lixeira não conta
  const buscar = (q: string) => (db.prepare(sqlBuscaCatalogo('servicos')).all(...paramsBuscaCatalogo(q)) as { id: string }[]).map((r) => r.id).join(',');
  checar('"eletrica" acha "Elétrica" e "elétrica"; mais usado primeiro', buscar('eletrica') === 's2,s1', buscar('eletrica'));
  checar('"ELÉTRICA" (caixa + acento) dá o mesmo', buscar('ELÉTRICA') === 's2,s1', buscar('ELÉTRICA'));
  checar('casa na descrição sem acento ("higienizacao")', buscar('higienizacao') === 's3', buscar('higienizacao'));
  checar('vazio = tudo ativo, por uso (s2:2, s3:1, s1:0)', buscar('') === 's2,s3,s1', buscar(''));
  checar('curinga digitado é literal ("%")', buscar('%') === '', buscar('%'));
  db.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n11) tipos de visita por ofício');
{
  const semOficio = tiposDeVisita(undefined);
  checar('sem ofício: as 6 categorias de sempre', semOficio.length === 6 && semOficio.every((t) => t.id.startsWith('geral_')));
  checar("'geral' também", tiposDeVisita(['geral']).length === 6);
  const piscina = tiposDeVisita(['piscina']);
  checar('piscina: específicos + Orçamento e Outro no fim', piscina[0]?.id === 'piscina_manutencao' && piscina.at(-1)?.tipo === 'outro' && piscina.at(-2)?.tipo === 'orcamento');
  checar('piscina sugere repetição semanal', piscina[0]?.recorrenciaSugerida === 'semanal');
  const duas = tiposDeVisita(['refrigeracao', 'eletrica', 'refrigeracao']);
  checar('duas verticais sem repetir', new Set(duas.map((t) => t.id)).size === duas.length && duas.some((t) => t.id === 'eletrica_instalacao'));
  const todosIds = VERTICAIS.flatMap((v) => v.tiposVisita.map((t) => t.id));
  checar('ids únicos no catálogo inteiro', new Set(todosIds).size === todosIds.length);
  checar('toda vertical especializada tem tipo de visita', VERTICAIS.every((v) => v.tiposVisita.length > 0));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n12) migration 20261001120000 num Postgres (PGlite)');
{
  const MIGRATION = readFileSync('supabase/migrations/20261001120000_agendamentos_excecoes.sql', 'utf8');
  const A = '00000000-0000-4000-8000-000000000001';
  const B = '00000000-0000-4000-8000-000000000002';
  const pg = new PGlite();
  await pg.exec(`
    create role anon nologin; create role authenticated nologin;
    create table public.agendamentos (
      id text primary key, user_id uuid not null, cliente_nome text not null, titulo text not null, tipo text not null,
      inicio timestamptz not null, fim timestamptz, status text not null default 'agendado',
      atualizado_em timestamptz not null default now(), excluido_em timestamptz, recorrencia text
    );
    create table public.ordens_servico (
      id text primary key, user_id uuid not null, status text not null default 'aberta', excluido_em timestamptz
    );
  `);
  let semPreRequisito = false;
  {
    const pg0 = new PGlite();
    await pg0.exec(`create role anon nologin; create role authenticated nologin;
      create table public.agendamentos (id text primary key, user_id uuid not null, status text not null);
      create table public.ordens_servico (id text primary key, user_id uuid not null, status text not null);`);
    try {
      await pg0.exec(MIGRATION);
    } catch (e) {
      semPreRequisito = /20260930130500/.test(String((e as Error).message));
    }
    await pg0.close();
  }
  checar('sem a migration da recorrência, falha ALTO na aplicação', semPreRequisito);

  await pg.exec(MIGRATION);
  await pg.exec(MIGRATION); // idempotente
  checar('aplica duas vezes (idempotente)', true);
  await pg.exec(`
    insert into public.agendamentos (id, user_id, cliente_nome, titulo, tipo, inicio, ordem_servico_id) values
      ('v1', '${A}', 'c', 't', 'visita', now(), 'os1'),
      ('ag_cv_k_2026-10', '${A}', 'c', 't', 'manutencao', now(), null),
      ('serie', '${A}', 'c', 't', 'manutencao', now(), 'os1'),
      ('outro', '${B}', 'c', 't', 'visita', now(), 'os1');
    update public.agendamentos set recorrencia = 'semanal' where id = 'serie';
    insert into public.ordens_servico (id, user_id, status) values ('os1', '${A}', 'em_execucao'), ('os_cv_k_2026-10', '${A}', 'agendada');
  `);
  const col = await pg.query<{ excecoes: unknown }>(`select excecoes from public.agendamentos where id = 'v1'`);
  checar("excecoes nasce '{}'", JSON.stringify(col.rows[0]?.excecoes) === '{}');
  let barrouArray = false;
  try {
    await pg.exec(`update public.agendamentos set excecoes = '[]'::jsonb where id = 'v1'`);
  } catch {
    barrouArray = true;
  }
  checar('CHECK barra excecoes que não é objeto', barrouArray);

  await pg.exec(`update public.ordens_servico set status = 'concluida' where id in ('os1', 'os_cv_k_2026-10')`);
  const st = await pg.query<{ id: string; status: string }>(`select id, status from public.agendamentos order by id`);
  const mapa = Object.fromEntries(st.rows.map((r) => [r.id, r.status]));
  checar('trigger: visita avulsa ligada vira concluido', mapa.v1 === 'concluido', JSON.stringify(mapa));
  checar('trigger: visita do contrato (ag_cv_ ↔ os_cv_) vira concluido', mapa['ag_cv_k_2026-10'] === 'concluido', JSON.stringify(mapa));
  checar('trigger: série recorrente NÃO é concluída inteira', mapa.serie === 'agendado', JSON.stringify(mapa));
  checar('trigger: visita de OUTRO tenant intocada', mapa.outro === 'agendado', JSON.stringify(mapa));
  await pg.exec(`
    insert into public.agendamentos (id, user_id, cliente_nome, titulo, tipo, inicio, ordem_servico_id) values ('v2', '${A}', 'c', 't', 'visita', now(), 'os2');
    insert into public.ordens_servico (id, user_id, status) values ('os2', '${A}', 'concluida');
  `);
  const v2 = await pg.query<{ status: string }>(`select status from public.agendamentos where id = 'v2'`);
  checar('trigger: OS que já NASCE concluída também fecha a visita', v2.rows[0]?.status === 'concluido');
  await pg.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n13) formulários da agenda preservam exceções e OS ligada ao salvar');
{
  // O formulário remonta o Agendamento campo a campo. Sem carregar `excecoes` e
  // `ordemServicoId` da linha aberta até o save, editar a série pelo formulário
  // gravava nulo local e `{}` na nuvem: apagava toda ocorrência cancelada/movida.
  for (const arquivo of ['src/screens/AgendaScreen.tsx', 'src/screens/desktop/AgendaDesktopScreen.tsx']) {
    const src = readFileSync(arquivo, 'utf8');
    checar(`${arquivo}: abrirEdicao carrega excecoes/ordemServicoId`,
      src.includes('excecoes: a.excecoes,') && src.includes('ordemServicoId: a.ordemServicoId,'));
    checar(`${arquivo}: o save devolve excecoes/ordemServicoId`,
      src.includes('excecoes: e.excecoes,') && src.includes('ordemServicoId: e.ordemServicoId,'));
  }
  // E a reconciliação de lembretes lê ANTES de cancelar (leitura que lança não zera tudo).
  const agendaSrc = readFileSync('src/services/agenda.ts', 'utf8');
  const corpo = agendaSrc.slice(agendaSrc.indexOf('export async function resincronizarLembretes'));
  checar('resincronizarLembretes lê a agenda antes de cancelar os lembretes',
    corpo.indexOf('await getAgendamentos()') > -1 && corpo.indexOf('await getAgendamentos()') < corpo.indexOf('await cancelarTodosLembretes()'));
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${ok} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
