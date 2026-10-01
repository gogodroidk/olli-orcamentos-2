/**
 * Onda 2, item 2.7 — Hoje como linha do tempo do dia.
 *
 *     node scripts/teste-hoje-linha-do-tempo.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Parte pura (roda de verdade): fase de cada visita (feita / agora / sem baixa /
 * próxima / mais tarde), resumo do dia, texto de apoio do horário e o alcance da
 * baixa (série muda SÓ a ocorrência). Parte de tela (lê o FONTE): a ordem da
 * linha do tempo (lembretes → visitas → checklist → "Como foi seu dia?" no fim),
 * o pulso do "agora" finito e respeitando "Reduzir movimento", botões com estado
 * de carregando e erro que nunca vira vazio.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import type { Agendamento } from '../src/types/index.ts';
import {
  ROTULO_FASE,
  alcanceDaBaixa,
  detalheHorario,
  montarLinhaDoTempo,
  podeConcluirPeloHoje,
  resumoDoDia,
} from '../src/utils/linhaDoTempoHoje.ts';

let ok = 0;
function caso(nome: string, fn: () => void) {
  fn();
  ok++;
  console.log(`  ok  ${nome}`);
}

// Datas no horário do aparelho (o Hoje é por dia LOCAL).
const em = (h: number, m = 0) => new Date(2026, 9, 1, h, m, 0, 0);
const iso = (h: number, m = 0) => em(h, m).toISOString();

function visita(id: string, h: number, extra: Partial<Agendamento> = {}): Agendamento {
  return {
    id,
    clienteNome: `Cliente ${id}`,
    titulo: `Visita ${id}`,
    tipo: 'visita_tecnica',
    inicio: iso(h),
    fim: iso(h + 1),
    status: 'agendado',
    criadoEm: iso(6),
    atualizadoEm: iso(6),
    ...extra,
  } as Agendamento;
}

console.log('\n1) Fase de cada visita');
const AGORA = em(14, 30);
const dia = [
  visita('d', 17),
  visita('a', 8, { status: 'concluido' }),
  visita('b', 10), // terminou 11h, ninguém deu baixa
  visita('c', 14), // 14h–15h: em andamento às 14:30
  visita('x', 12, { status: 'cancelado' }),
  visita('e', 16),
];
const linha = montarLinhaDoTempo(dia, AGORA);

caso('cancelada fica de fora e o resto vem em ordem de início', () => {
  assert.deepEqual(linha.map(i => i.visita.id), ['a', 'b', 'c', 'e', 'd']);
});
caso('concluída = feita; passou sem baixa = sem_baixa; em andamento = agora', () => {
  assert.deepEqual(linha.map(i => i.fase), ['feita', 'sem_baixa', 'agora', 'proxima', 'depois']);
});
caso('só UMA próxima, mesmo com outra em andamento', () => {
  assert.equal(linha.filter(i => i.fase === 'proxima').length, 1);
});
caso('visita sem fim dura 1h (mesma régua do resto do app)', () => {
  const [i] = montarLinhaDoTempo([visita('s', 14, { fim: undefined })], em(14, 59));
  assert.equal(i.fase, 'agora');
  const [j] = montarLinhaDoTempo([visita('s', 14, { fim: undefined })], em(15, 0));
  assert.equal(j.fase, 'sem_baixa');
});
caso('concluída antes da hora continua "feita" (a baixa manda)', () => {
  const [i] = montarLinhaDoTempo([visita('f', 18, { status: 'concluido' })], AGORA);
  assert.equal(i.fase, 'feita');
});
caso('na lixeira não aparece', () => {
  assert.equal(montarLinhaDoTempo([visita('l', 16, { excluidoEm: iso(9) })], AGORA).length, 0);
});
caso('horário ilegível não vira "próxima" nem quebra', () => {
  const [i] = montarLinhaDoTempo([visita('q', 16, { inicio: 'lixo', fim: undefined })], AGORA);
  assert.equal(i.fase, 'depois');
});
caso('não altera a lista recebida', () => {
  const copia = dia.map(v => v.id).join(',');
  montarLinhaDoTempo(dia, AGORA);
  assert.equal(dia.map(v => v.id).join(','), copia);
});

console.log('\n2) Resumo, rótulos e ações');
caso('resumo conta total, feitas e sem baixa', () => {
  assert.deepEqual(resumoDoDia(linha), { total: 5, feitas: 1, semBaixa: 1 });
});
caso('rótulos pt-BR de cada fase', () => {
  assert.deepEqual(ROTULO_FASE, { feita: 'Feita', agora: 'Agora', sem_baixa: 'Sem baixa', proxima: 'Próxima', depois: 'Mais tarde' });
});
caso('só dá baixa pelo Hoje no que está acontecendo ou já passou', () => {
  assert.equal(podeConcluirPeloHoje('agora'), true);
  assert.equal(podeConcluirPeloHoje('sem_baixa'), true);
  assert.equal(podeConcluirPeloHoje('proxima'), false);
  assert.equal(podeConcluirPeloHoje('depois'), false);
  assert.equal(podeConcluirPeloHoje('feita'), false);
});

console.log('\n3) Texto de apoio do horário (só de inicio/fim, nada estimado)');
caso('agora → "até 15:00"', () => {
  assert.equal(detalheHorario(linha[2], AGORA), 'até 15:00');
});
caso('sem baixa → "terminou às 11:00"', () => {
  assert.equal(detalheHorario(linha[1], AGORA), 'terminou às 11:00');
});
caso('próxima a menos de 1h → "em 25 min"', () => {
  const [i] = montarLinhaDoTempo([visita('p', 15)], em(14, 35));
  assert.equal(detalheHorario(i, em(14, 35)), 'em 25 min');
});
caso('próxima a 1h ou mais → vazio (o relógio já diz)', () => {
  assert.equal(detalheHorario(linha[3], AGORA), '');
});
caso('feita e mais tarde → vazio', () => {
  assert.equal(detalheHorario(linha[0], AGORA), '');
  assert.equal(detalheHorario(linha[4], AGORA), '');
});

console.log('\n4) Baixa: série muda só a ocorrência');
caso('repetição projetada (<base>@<dia>) → só esta da série', () => {
  assert.equal(alcanceDaBaixa({ recorrencia: 'semanal', ocorrenciaDe: 'base' } as never), 'so_esta_da_serie');
});
caso('linha-base de série → só esta da série', () => {
  assert.equal(alcanceDaBaixa({ recorrencia: 'semanal' } as never), 'so_esta_da_serie');
});
caso('visita avulsa → a própria linha', () => {
  assert.equal(alcanceDaBaixa({ recorrencia: undefined } as never), 'visita_avulsa');
});

console.log('\n5) Tela (fonte)');
const ler = (c: string) => readFileSync(new URL(c, import.meta.url), 'utf8');
const semComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
const hoje = semComentarios(ler('../src/screens/HojeScreen.tsx'));
const noFonte = semComentarios(ler('../src/components/hoje/LinhaDoTempo.tsx'));
const pulso = semComentarios(ler('../src/components/motion/PulsoAgora.tsx'));
const agendaTs = ler('../src/services/agenda.ts');

caso('ordem do dia: lembretes → visitas → checklist → "Como foi seu dia?" no fim', () => {
  const pos = ['Lembretes da OLLI', 'Visitas de hoje', 'Checklist do dia', 'Como foi seu dia?'].map(t => hoje.indexOf(t));
  assert.ok(pos.every(p => p > 0), `faltou seção: ${pos}`);
  assert.deepEqual([...pos].sort((a, b) => a - b), pos);
  // O fim do dia é o ÚLTIMO nó (sem trilho abaixo).
  assert.match(hoje, /icone: 'weather-night' \}\} ultimo>/);
});
caso('a linha do tempo sai da regra pura', () => {
  assert.match(hoje, /montarLinhaDoTempo\(itens, agora\)/);
});
caso('o ponto "agora" usa o pulso finito', () => {
  assert.match(noFonte, /<PulsoAgora /);
  assert.match(pulso, /withRepeat\([\s\S]*?PULSO\.repeticoes/);
  assert.doesNotMatch(pulso, /withRepeat\([\s\S]*?,\s*-1\s*,/);
  assert.match(pulso, /useReduzirMovimento\(\)/);
  assert.match(pulso, /cancelAnimation\(/);
});
caso('pulso anima só transform/opacity', () => {
  const ini = pulso.indexOf('useAnimatedStyle(');
  const bloco = pulso.slice(ini, pulso.indexOf('});', ini));
  assert.match(bloco, /opacity/);
  assert.doesNotMatch(bloco, /\b(width|height|margin\w*|padding\w*|top|left|backgroundColor)\s*:/);
});
caso('relógio só roda com a tela em foco (e é limpo ao sair)', () => {
  assert.match(hoje, /const relogio = setInterval\(\(\) => \{[\s\S]*?setAgora\(n\);[\s\S]*?\}, TICK_RELOGIO_MS\)/);
  assert.match(hoje, /return \(\) => clearInterval\(relogio\)/);
});
caso('virou o dia com a tela aberta → recarrega a agenda (não pinta ontem como "Sem baixa")', () => {
  assert.match(hoje, /diaCarregadoRef\.current = format\(agoraLeitura, 'yyyy-MM-dd'\)/);
  assert.match(hoje, /diaCarregadoRef\.current !== format\(n, 'yyyy-MM-dd'\)\) void load\(\)/);
});
caso('botão de ação tem carregando, anúncio de ocupado e háptico leve só na principal', () => {
  assert.match(noFonte, /accessibilityState=\{\{ busy: !!carregando \}\}/);
  assert.match(noFonte, /<ActivityIndicator/);
  assert.match(noFonte, /variante === 'principal' \? 'light' : 'selection'/);
  assert.match(noFonte, /minHeight: 44/);
});
caso('baixa: sucesso com Desfazer, erro avisa (nunca some em silêncio)', () => {
  assert.match(hoje, /toast\.sucesso\(`Visita de \$\{a\.clienteNome\} concluída\.`/);
  assert.match(hoje, /rotulo: 'Desfazer'/);
  assert.match(hoje, /toast\.erro\(`Não deu para atualizar a visita\./);
  assert.match(agendaTs, /export async function mudarStatusVisitaDoDia\(/);
  assert.match(agendaTs, /editarRecorrente\(v\.id, 'so_esta', \{ status \}\)/);
});
caso('3 estados da agenda: carregando, erro com "Tentar de novo", vazio', () => {
  assert.match(hoje, /Não conseguimos buscar sua agenda de hoje/);
  assert.match(hoje, /rotulo="Tentar de novo" onPress=\{load\}/);
  assert.match(hoje, /Nada agendado para hoje/);
});
caso('"nada parado" só com as leituras respondidas', () => {
  assert.match(hoje, /lembretesConferidos = !carregando && !carregandoErro && !followUpCarregando && !followUpErro/);
});
caso('"Estou a caminho" não inventa horário de chegada', () => {
  assert.match(hoje, /mensagemEstouACaminho\(a\.clienteNome, null\)/);
});
caso('sem loop infinito novo na tela (EmptyState flutuante saiu da linha do tempo)', () => {
  assert.doesNotMatch(hoje, /<EmptyState/);
  assert.doesNotMatch(hoje, /withRepeat\(/);
});

console.log(`\n${ok} casos ok`);
