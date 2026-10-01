/**
 * Teste do Encaixe Inteligente e de "Clientes perto de mim" (Onda I1, jogada 4).
 *
 *     node scripts/teste-encaixe.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * `src/services/encaixe.ts` não importa nada: aqui roda o comportamento REAL —
 * haversine, janelas antes/depois da visita mais perto alinhadas em 30 min,
 * expediente e dias atendidos em hora de Brasília, conflito com outras visitas
 * (contando o deslocamento), as 3 melhores, e a regra da casa: cliente sem
 * coordenada é "sem localização", nunca "nenhum encaixe"; visita sem
 * coordenada é CONTADA, não some. Prova também que o componente não chama API.
 */
import { readFileSync } from 'node:fs';
import {
  clientesPerto,
  deslocamentoEstimadoMin,
  distanciaKm,
  sugerirEncaixe,
  textoDistancia,
  textoQuando,
  type VisitaAgenda,
} from '../src/services/encaixe.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

/** ISO UTC de uma hora local de Brasília. */
function br(dataHora: string): string {
  return new Date(`${dataHora}:00-03:00`).toISOString();
}

/** Quinta, 01/10/2026, 08h em Brasília. */
const AGORA = new Date('2026-10-01T08:00:00-03:00');
const NOVO = { lat: -23.55, lon: -46.63 };
/** ~1,2 km ao norte do cliente novo. */
const PERTO = { lat: -23.55 + 0.0108, lon: -46.63 };
/** ~5 km ao norte. */
const MEDIO = { lat: -23.55 + 0.045, lon: -46.63 };
/** ~22 km ao norte (fora do raio de 15 km). */
const LONGE = { lat: -23.55 + 0.2, lon: -46.63 };

const maria: VisitaAgenda = {
  id: 'v-maria',
  clienteNome: 'Maria',
  inicio: br('2026-10-06T14:00'),
  fim: br('2026-10-06T15:00'),
  ...PERTO,
  status: 'agendado',
};
const joao: VisitaAgenda = {
  id: 'v-joao',
  clienteNome: 'João',
  inicio: br('2026-10-02T09:00'),
  fim: br('2026-10-02T10:00'),
  ...MEDIO,
};

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) geometria');
{
  const spRio = distanciaKm({ lat: -23.5505, lon: -46.6333 }, { lat: -22.9068, lon: -43.1729 });
  checar('São Paulo–Rio ≈ 357 km (haversine)', Math.abs(spRio - 357) < 5, true);
  checar('~1,2 km', Math.round(distanciaKm(NOVO, PERTO) * 10) / 10, 1.2);
  checar('textoDistancia 0,8 → 800 m', textoDistancia(0.8), '800 m');
  checar('textoDistancia 1,23 → 1,2 km', textoDistancia(1.23), '1,2 km');
  checar('textoDistancia 12,4 → 12 km', textoDistancia(12.4), '12 km');
  checar('deslocamento mínimo 10 min', deslocamentoEstimadoMin(1.2), 10);
  checar('5 km → 14 min (×1,4 a 30 km/h)', deslocamentoEstimadoMin(5), 14);
  checar('textoQuando terça', textoQuando(Date.parse(br('2026-10-06T15:30')), AGORA.getTime()), 'terça, 06/10 às 15h30');
  checar('textoQuando amanhã', textoQuando(Date.parse(br('2026-10-02T09:00')), AGORA.getTime()), 'amanhã às 9h');
}

console.log('\n2) as 3 sugestões perto de onde já vai estar');
{
  const r = sugerirEncaixe(NOVO, [maria, joao], { agora: AGORA });
  if (!r.ok) throw new Error('esperava ok');
  checar('3 sugestões', r.sugestoes.length, 3);
  checar(
    'horários: antes e depois da Maria, depois do João',
    r.sugestoes.map((s) => s.quando),
    ['terça, 06/10 às 12h30', 'terça, 06/10 às 15h30', 'amanhã às 10h30'],
  );
  checar('posição', r.sugestoes.map((s) => s.ancora.posicao), ['antes', 'depois', 'depois']);
  checar('motivo com distância e hora da âncora', r.sugestoes[1].motivo, 'a 1,2 km da visita de Maria (14h)');
  checar('fim = início + duração', r.sugestoes[1].fim, br('2026-10-06T16:30'));
  checar('âncora com id', r.sugestoes[0].ancora.visitaId, 'v-maria');
  checar('visitas consideradas', r.visitasConsideradas, 2);
  checar('nenhuma sem localização', r.visitasSemLocalizacao, 0);
  checar('antes do João (7h30) caiu fora do expediente', r.sugestoes.some((s) => s.inicio === br('2026-10-02T07:30')), false);

  const longo = sugerirEncaixe(NOVO, [maria], { agora: AGORA, duracaoMin: 120 });
  if (!longo.ok) throw new Error('esperava ok');
  checar('duração do catálogo (2h) empurra o "antes"', longo.sugestoes.map((s) => s.quando), [
    'terça, 06/10 às 11h30',
    'terça, 06/10 às 15h30',
  ]);
}

console.log('\n3) conflitos, expediente, dias, status, raio');
{
  // Pedro (sem coordenada) às 15h30–16h30 na terça: o "depois da Maria" bate.
  const pedro: VisitaAgenda = { id: 'v-pedro', clienteNome: 'Pedro', inicio: br('2026-10-06T15:30'), fim: br('2026-10-06T16:30') };
  const r = sugerirEncaixe(NOVO, [maria, pedro], { agora: AGORA });
  if (!r.ok) throw new Error('esperava ok');
  checar('15h30 bate com Pedro → descartado', r.sugestoes.map((s) => s.quando), ['terça, 06/10 às 12h30']);
  checar('Pedro (sem coordenada) é contado', r.visitasSemLocalizacao, 1);

  const fimDoDia: VisitaAgenda = { ...maria, inicio: br('2026-10-06T16:30'), fim: br('2026-10-06T17:30') };
  const r2 = sugerirEncaixe(NOVO, [fimDoDia], { agora: AGORA });
  if (!r2.ok) throw new Error('esperava ok');
  checar('depois das 17h30 + 1h passaria das 18h → só o "antes"', r2.sugestoes.map((s) => s.quando), ['terça, 06/10 às 15h']);

  const sabado: VisitaAgenda = { ...maria, inicio: br('2026-10-03T10:00'), fim: br('2026-10-03T11:00') };
  const r3 = sugerirEncaixe(NOVO, [sabado], { agora: AGORA, diasSemana: [1, 2, 3, 4, 5] });
  if (!r3.ok) throw new Error('esperava ok');
  checar('sábado fora dos dias atendidos', r3.sugestoes.length, 0);
  checar('…mas a visita entrou na conta', r3.visitasConsideradas, 1);

  const cancelada = sugerirEncaixe(NOVO, [{ ...maria, status: 'cancelado' }], { agora: AGORA });
  checar('cancelada não conta', cancelada.ok && cancelada.visitasConsideradas, 0);

  const longe = sugerirEncaixe(NOVO, [{ ...maria, ...LONGE }], { agora: AGORA });
  checar('22 km fora do raio de 15 km', longe.ok && longe.sugestoes.length, 0);

  const semana = sugerirEncaixe(NOVO, [{ ...maria, inicio: br('2026-10-09T14:00'), fim: br('2026-10-09T15:00') }], { agora: AGORA });
  checar('visita depois de 7 dias não conta', semana.ok && semana.visitasConsideradas, 0);

  const emCima = sugerirEncaixe(NOVO, [{ ...maria, inicio: br('2026-10-01T07:00'), fim: br('2026-10-01T08:10') }], { agora: AGORA });
  checar('antecedência mínima de 1h: 8h30 (logo depois das 8h10) é cedo demais', emCima.ok && emCima.sugestoes.length, 0);
  const hoje = sugerirEncaixe(NOVO, [{ ...maria, inicio: br('2026-10-01T08:30'), fim: br('2026-10-01T09:30') }], { agora: AGORA });
  if (!hoje.ok) throw new Error('esperava ok');
  checar('hoje: só o "depois" (o "antes" já passou)', hoje.sugestoes.map((s) => s.quando), ['hoje às 10h']);

  const lista = sugerirEncaixe(NOVO, [maria, joao], { agora: AGORA, quantidade: 1 });
  checar('quantidade respeitada', lista.ok && lista.sugestoes.length, 1);
}

console.log('\n4) erro não vira vazio');
{
  checar('cliente sem coordenada', sugerirEncaixe({}, [maria], { agora: AGORA }), { ok: false, motivo: 'cliente_sem_localizacao' });
  checar('cliente nulo', sugerirEncaixe(null, [maria], { agora: AGORA }), { ok: false, motivo: 'cliente_sem_localizacao' });
  checar('0,0 não é coordenada', sugerirEncaixe({ lat: 0, lon: 0 }, [maria], { agora: AGORA }).ok, false);
  const vazio = sugerirEncaixe(NOVO, [], { agora: AGORA });
  checar('agenda vazia: ok com 0 consideradas (a tela diz "nenhuma visita")', vazio, {
    ok: true,
    sugestoes: [],
    visitasConsideradas: 0,
    visitasSemLocalizacao: 0,
  });
}

console.log('\n5) clientes perto de mim');
{
  const clientes = [
    { id: 'a', nome: 'Ana', ...MEDIO },
    { id: 'b', nome: 'Bruno', ...PERTO },
    { id: 'c', nome: 'Carla' },
    { id: 'd', nome: 'Davi', ...LONGE },
    { id: 'e', nome: 'Eva', ...PERTO },
  ];
  const r = clientesPerto(NOVO, clientes, { raioKm: 10, ignorarIds: ['e'] });
  if (!r.ok) throw new Error('esperava ok');
  checar('mais perto primeiro, no raio', r.clientes.map((c) => c.nome), ['Bruno', 'Ana']);
  checar('distância arredondada', r.clientes[0].distanciaKm, 1.2);
  checar('sem localização contado', r.semLocalizacao, 1);
  checar('origem inválida', clientesPerto(null, clientes), { ok: false, motivo: 'origem_sem_localizacao' });
  const limite = clientesPerto(NOVO, clientes, { raioKm: 50, limite: 2 });
  checar('limite', limite.ok && limite.clientes.length, 2);
}

console.log('\n6) o componente não chama API e usa motion');
{
  const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const comp = semComentario(readFileSync(new URL('../src/components/agenda/SugestaoEncaixe.tsx', import.meta.url), 'utf8'));
  const serv = semComentario(readFileSync(new URL('../src/services/encaixe.ts', import.meta.url), 'utf8'));
  checar('serviço sem import nenhum', /^\s*import\s/m.test(serv), false);
  checar('serviço sem fetch', /fetch\(/.test(serv), false);
  checar('componente sem fetch', /fetch\(/.test(comp), false);
  checar('componente usa a fundação de motion', /from '\.\.\/motion'/.test(comp) && comp.includes('<PressableAnimado'), true);
  checar('componente avisa quem ficou de fora', comp.includes('sem localização'), true);
}

console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
