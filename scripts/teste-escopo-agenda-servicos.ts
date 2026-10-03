/**
 * ESCOPO DA AGENDA FORA DAS TELAS — relatório do dia e ritual diário.
 *
 *     node scripts/teste-escopo-agenda-servicos.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * A Agenda e o Hoje já filtram por papel (`resolverEscopoAgenda` + `aplicarEscopo`).
 * Este teste trava a MESMA regra em quem lê a agenda sem componente React:
 *  1) relatório do dia ("Como foi seu dia?" e a prévia do "Fechar o dia"): técnico
 *     conta só as visitas em que é o responsável; papel desconhecido deixa a
 *     agenda FORA do resumo (nem "0 na agenda", nem a agenda da equipe) e o dia
 *     não vira "sem movimentos";
 *  2) ritual diário ("Bom dia" e aviso "saia às"): a próxima saída e a origem da
 *     rota passam pelo escopo; papel desconhecido não cria nem cancela aviso;
 *  3) o papel vem do store de `useTipoConta` (cache → rede) pela ponte
 *     `services/papelAtual.ts` (sem React Native, o painel também compila isto) e o
 *     usuário de `getCurrentUser`, com a mesma matriz de permissão do hook.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { escopoConhecido, resolverEscopoAgenda, type EscopoAgenda } from '../src/utils/agendaDominio.ts';
import {
  agendaIndisponivel,
  relatorioParaTexto,
  resumirAgendaDoDia,
  semMovimentosConhecidos,
  type RelatorioDia,
} from '../src/utils/relatorioDiaTexto.ts';
import type { Agendamento } from '../src/types/index.ts';
import { lerPapelAtual, registrarLeitorPapel } from '../src/services/papelAtual.ts';

let passos = 0;
function caso(nome: string, fn: () => void) {
  fn();
  passos++;
  console.log(`  ok  ${nome}`);
}

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

type Visita = Pick<Agendamento, 'responsavelId' | 'status'>;
const equipe: Visita[] = [
  { responsavelId: 'tec-1', status: 'concluido' },
  { responsavelId: 'tec-1', status: 'agendado' },
  { responsavelId: 'tec-2', status: 'agendado' },
  { responsavelId: 'tec-2', status: 'concluido' },
  { responsavelId: undefined, status: 'agendado' },
];

const TECNICO = resolverEscopoAgenda({ papelResolvido: true, papelCarregando: false, podeVerEquipe: false, usuario: { status: 'ok', id: 'tec-1' } });
const GESTAO = resolverEscopoAgenda({ papelResolvido: true, papelCarregando: false, podeVerEquipe: true, usuario: { status: 'ok', id: 'dono' } });
const SEM_PAPEL = resolverEscopoAgenda({ papelResolvido: false, papelCarregando: false, podeVerEquipe: false, usuario: { status: 'ok', id: 'tec-1' } });
const SEM_SESSAO = resolverEscopoAgenda({ papelResolvido: true, papelCarregando: false, podeVerEquipe: false, usuario: { status: 'ok', id: null } });

function relatorio(agendamentos: RelatorioDia['agendamentos'], extra: Partial<RelatorioDia> = {}): RelatorioDia {
  const base: RelatorioDia = {
    data: '2026-10-01',
    orcamentos: { criados: 0, criadosValor: 0, enviados: 0, enviadosValor: 0, aprovados: 0, aprovadosValor: 0 },
    recibos: { emitidos: 0, totalRecebido: 0 },
    agendamentos,
    clientesNovos: 0,
    semMovimentos: false,
    ...extra,
  };
  return base;
}

console.log('Escopo da agenda nos serviços (relatório do dia + ritual diário)');

caso('escopoConhecido: só equipe e própria permitem filtrar', () => {
  assert.equal(escopoConhecido(TECNICO), true);
  assert.equal(escopoConhecido(GESTAO), true);
  assert.equal(escopoConhecido(SEM_PAPEL), false);
  assert.equal(escopoConhecido(SEM_SESSAO), false);
  assert.equal(escopoConhecido({ status: 'carregando' } as EscopoAgenda), false);
});

caso('relatório: técnico conta só as visitas dele', () => {
  const r = resumirAgendaDoDia(equipe, TECNICO);
  assert.equal(r.total, 2);
  assert.deepEqual(r.porStatus, { agendado: 1, concluido: 1, cancelado: 0 });
  assert.equal(r.escopo, 'propria');
});

caso('relatório: gestão/conta pessoal conta a equipe inteira', () => {
  const r = resumirAgendaDoDia(equipe, GESTAO);
  assert.equal(r.total, 5);
  assert.deepEqual(r.porStatus, { agendado: 3, concluido: 2, cancelado: 0 });
  assert.equal(r.escopo, 'equipe');
});

caso('relatório: papel ou sessão desconhecidos = agenda indisponível, nunca a equipe', () => {
  for (const escopo of [SEM_PAPEL, SEM_SESSAO]) {
    const r = resumirAgendaDoDia(equipe, escopo);
    assert.equal(r.escopo, 'indisponivel');
    assert.equal(r.total, 0);
    assert.equal(agendaIndisponivel({ agendamentos: r }), true);
  }
});

caso('narrativa: agenda indisponível é dita, nunca "sem agendamento" nem "dia de trabalho"', () => {
  const ag = resumirAgendaDoDia(equipe, SEM_PAPEL);
  const r = relatorio(ag);
  assert.equal(semMovimentosConhecidos(r), true);
  const texto = relatorioParaTexto(r);
  assert.match(texto, /agenda ficou fora deste resumo/);
  assert.doesNotMatch(texto, /Nenhum orçamento, recibo, agendamento/);
  assert.doesNotMatch(texto, /Foi um dia de trabalho/);
  assert.doesNotMatch(texto, /compromisso/);
});

caso('narrativa: com outro movimento, a agenda indisponível vira ressalva no meio', () => {
  const r = relatorio(resumirAgendaDoDia(equipe, SEM_PAPEL), {
    orcamentos: { criados: 2, criadosValor: 300, enviados: 0, enviadosValor: 0, aprovados: 0, aprovadosValor: 0 },
  });
  assert.equal(semMovimentosConhecidos(r), false);
  const texto = relatorioParaTexto(r);
  assert.ok(texto.startsWith('Hoje você criou 2 orçamentos'), texto);
  assert.match(texto, /agenda ficou fora deste resumo/);
});

caso('narrativa: técnico ouve "na sua agenda" com as contas dele', () => {
  const texto = relatorioParaTexto(relatorio(resumirAgendaDoDia(equipe, TECNICO)));
  assert.match(texto, /Teve 2 compromissos na sua agenda \(1 concluído, 1 ainda agendado\)/);
});

caso('narrativa: retrato antigo (sem campo escopo) continua lendo como antes', () => {
  const texto = relatorioParaTexto(relatorio({ total: 1, porStatus: { agendado: 1, concluido: 0, cancelado: 0 } }));
  assert.match(texto, /Teve 1 compromisso na agenda \(1 ainda agendado\)/);
});

caso('fonte: relatorioDia passa a agenda pelo escopo e não grava retrato sem ele', () => {
  const src = ler('src/services/relatorioDia.ts');
  assert.match(src, /escopoAgendaAtual\(\)/);
  assert.match(src, /resumirAgendaDoDia\(agendaDaEquipe, escopo\)/);
  assert.match(src, /!agendaIndisponivel\(\{ agendamentos \}\)/, 'agenda ilegível não vira "sem movimentos"');
  assert.match(src, /if \(!agendaIndisponivel\(relatorio\)\) await saveRelatorioDia/);
  assert.doesNotMatch(src, /agendamentosDoDia\.length/, 'nada conta a agenda crua da equipe');
});

caso('fonte: ritualDiario só lê a próxima saída e o dia pelo escopo', () => {
  const src = ler('src/services/ritualDiario.ts');
  const chamadasSaida = src.match(/getProximaSaida\([^)]*\)/g) ?? [];
  assert.ok(chamadasSaida.length >= 2);
  for (const c of chamadasSaida) assert.equal(c, 'getProximaSaida(escopo)', `chamada sem escopo: ${c}`);
  assert.equal((src.match(/doDia: aplicarEscopo\(doDia, escopo\)/g) ?? []).length, 1, 'origem do Bom dia = só as visitas desta pessoa');
  assert.match(src, /getAgendamentosDoDia\(inicio\)\.then\(d => aplicarEscopo\(d, escopo\)\)/);
  // Papel desconhecido: o aviso de saída não é criado nem cancelado.
  assert.match(src, /const escopo = escopoPronto \?\? \(await escopoAgendaAtual\(\)\);\s*if \(!escopoConhecido\(escopo\)\) return;/);
  assert.match(src, /if \(escopo\) await reagendarAvisoSaidaDoDia\(false, escopo\)/);
  assert.match(src, /escopo \? getProximaSaida\(escopo\)\.catch\(\(\) => null\) : Promise\.resolve\(null\)/);
  assert.match(src, /relatorio\.semMovimentos \|\| semMovimentosConhecidos\(relatorio\)/);
});

caso('fonte: getProximaSaida exige escopo conhecido e filtra antes de escolher', () => {
  const src = ler('src/services/agenda.ts');
  assert.match(src, /export async function getProximaSaida\(escopo: EscopoConhecido,/);
  assert.match(src, /escolherProximaSaida\(aplicarEscopo\(ocorrencias, escopo\), agora\)/);
});

// Ponte do papel (sem React Native): sem leitor, leitor que falha ou papel não
// resolvido = desconhecido; nunca "pode ver a equipe".
{
  assert.deepEqual(await lerPapelAtual(), { resolvido: false, podeVerAgendaEquipe: false });
  registrarLeitorPapel(async () => { throw new Error('rede'); });
  assert.deepEqual(await lerPapelAtual(), { resolvido: false, podeVerAgendaEquipe: false });
  registrarLeitorPapel(async () => ({ resolvido: false, podeVerAgendaEquipe: true }));
  assert.deepEqual(await lerPapelAtual(), { resolvido: false, podeVerAgendaEquipe: false });
  registrarLeitorPapel(async () => ({ resolvido: true, podeVerAgendaEquipe: false }));
  assert.deepEqual(await lerPapelAtual(), { resolvido: true, podeVerAgendaEquipe: false });
  passos++;
  console.log('  ok  ponte do papel: sem leitor, falha ou não resolvido = desconhecido, nunca "pode"');
}

caso('fonte: escopo fora do React usa a ponte do papel, getCurrentUser e a matriz do hook', () => {
  const src = ler('src/services/escopoAgendaAtual.ts');
  assert.match(src, /lerPapelAtual\(\)/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /podeVerEquipe: conta\.podeVerAgendaEquipe/);
  assert.match(src, /papelCarregando: false/);
  assert.match(src, /catch \{\s*return \{ status: 'erro' \};/);
  // Nada de React Native no caminho do serviço: ele entra no type-check do painel.
  assert.doesNotMatch(src, /hooks\/useTipoConta|hooks\/usePermissao/);
  assert.doesNotMatch(ler('src/services/papelAtual.ts'), /^import /m);
  const perm = ler('src/hooks/usePermissao.ts');
  assert.match(perm, /registrarLeitorPapel\(async \(\) => \{\s*const conta = await resolverTipoContaAtual\(\);\s*return \{ resolvido: conta\.resolvido, podeVerAgendaEquipe: podeComPapel\('ver_agenda_equipe', conta\) === true \};/);
  assert.match(perm, /podeComPapel\(acao, \{ tipo, org, resolvido \}\) === true/, 'o hook e a ponte decidem pela mesma função');
  assert.match(perm, /if \(!conta\.resolvido\) return null;/, 'papel indeterminado não é "pode"');
  const tipo = ler('src/hooks/useTipoConta.ts');
  assert.match(tipo, /export async function resolverTipoContaAtual\(\)/);
  // O leitor é carregado no boot (AppNavigator importa usePermissao), antes do sync que roda o ritual.
  assert.match(ler('src/navigation/AppNavigator.tsx'), /hooks\/usePermissao/);
});

caso('fonte: a tela do relatório não mostra 0 quando a agenda ficou de fora', () => {
  const src = ler('src/screens/RelatorioDiaScreen.tsx');
  assert.match(src, /agendaIndisponivel\(relatorio\) \?/);
  assert.match(src, /Não confirmei quais são suas/);
  assert.match(src, /agendaIndisponivel\(r\) \? 'agenda fora do resumo'/);
});

console.log(`\n${passos} casos ok`);
