/**
 * Teste do Radar do Tempo para vender (Onda I4, jogada 8).
 *
 *     node scripts/teste-radar-tempo.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Roda `src/services/radarTempo.ts` (puro) e o parse do resumo por dia do
 * `/clima` em `climaTexto.ts`: gatilhos por ofício, "não sei" ≠ "tempo bom",
 * época da dengue, mensagem honesta para UM cliente, e o anti-spam (1 sugestão
 * por semana, silenciar 30 dias). Prova também que a campanha é humana: wa.me
 * oficial, um por vez, sem envio automático.
 */
import { readFileSync } from 'node:fs';
import {
  avaliarRadarTempo,
  diasDaJanela,
  mensagemCampanha,
  ocultar,
  podeMostrarSugestao,
  registrarMostrada,
  rotuloDia,
  type DiaPrevisao,
} from '../src/services/radarTempo.ts';
import { normalizarRespostaClima } from '../src/services/climaTexto.ts';

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

const d = (data: string, max: number | null, chuvaMm: number | null = 0): DiaPrevisao => ({ data, max, min: 18, chuvaMm });
const HOJE = '2026-10-05'; // segunda
const calor: DiaPrevisao[] = [
  d('2026-10-05', 35), // hoje não conta
  d('2026-10-06', 33),
  d('2026-10-07', 34),
  d('2026-10-08', 29),
  d('2026-10-09', 32),
];

console.log('\n1) leitura do /clima (resumo por dia)');
{
  const base = {
    ok: true,
    atual: { temperatura: 25, simbolo: 'clearsky_day', ehDia: true },
    hoje: { max: 30, min: 18 },
    chuvaPorHora: [{ inicio: '2026-10-05T14:00', hora: '14:00', mm: 0, simbolo: 'clearsky_day' }],
  };
  checar('worker antigo (sem dias) = campo ausente, não lista vazia', 'dias' in (normalizarRespostaClima(base) ?? {}), false);
  const n = normalizarRespostaClima({ ...base, dias: [{ data: '2026-10-06', max: 33, min: 20, chuvaMm: -1 }, { data: 'ontem', max: 1 }] });
  checar('dia válido lido; chuva negativa vira "não sei"; data ruim descartada', n?.dias, [{ data: '2026-10-06', max: 33, min: 20, chuvaMm: null }]);
}

console.log('\n2) gatilhos por ofício');
{
  checar('sem resumo = sem_previsao (nunca "tempo bom")', avaliarRadarTempo(undefined, ['refrigeracao'], HOJE), { estado: 'sem_previsao' });
  checar('janela: de amanhã em diante, no máximo 7 dias', diasDaJanela(calor, HOJE).map((x) => x.data), ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  const ar = avaliarRadarTempo(calor, ['refrigeracao'], HOJE);
  checar('ar-condicionado: 3 dias ≥ 32 °C dispara calor', ar.estado === 'sugestao' ? [ar.sugestao.gatilho, ar.sugestao.dias] : ar,
    ['calor', ['2026-10-06', '2026-10-07', '2026-10-09']]);
  if (ar.estado === 'sugestao') {
    checar('título e detalhe derivados dos números', [ar.sugestao.titulo, ar.sugestao.detalhe],
      ['Calor forte chegando: 3 dias com máxima de 32 °C ou mais', 'de ter (06/10) a sex (09/10), até 34 °C na previsão.']);
  }
  checar('1 dia quente só não dispara', avaliarRadarTempo([d('2026-10-06', 35), d('2026-10-07', 25)], ['refrigeracao'], HOJE), { estado: 'sem_sugestao' });
  checar('dia sem máxima conhecida não conta como quente', avaliarRadarTempo([d('2026-10-06', null), d('2026-10-07', 33)], ['refrigeracao'], HOJE), { estado: 'sem_sugestao' });
  checar('ofício sem gatilho (elétrica) = silêncio', avaliarRadarTempo(calor, ['eletrica'], HOJE), { estado: 'sem_sugestao' });
  checar('sem ofício = silêncio (nada genérico)', avaliarRadarTempo(calor, undefined, HOJE), { estado: 'sem_sugestao' });
  const multi = avaliarRadarTempo(calor, ['eletrica', 'piscina'], HOJE);
  checar('vários ofícios: o primeiro com gatilho vence', multi.estado === 'sugestao' ? multi.sugestao.oficio : multi, 'piscina');

  const chuva = [d('2026-10-06', 25, 3), d('2026-10-07', 24, 28.4)];
  const hid = avaliarRadarTempo(chuva, ['hidraulica'], HOJE);
  checar('hidráulica: chuva forte ≥ 20 mm', hid.estado === 'sugestao' ? hid.sugestao.titulo : hid, 'Chuva forte prevista: 28,4 mm em qua (07/10)');
  checar('chuva "não sei" não vira chuva forte', avaliarRadarTempo([d('2026-10-06', 25, null)], ['hidraulica'], HOJE), { estado: 'sem_sugestao' });

  const seco = ['06', '07', '08', '09', '10'].map((x) => d(`2026-10-${x}`, 30, 0));
  checar('jardinagem: 5 dias secos e quentes', avaliarRadarTempo(seco, ['jardinagem'], HOJE).estado, 'sugestao');
  const secoComBuraco = seco.map((x, i) => (i === 2 ? { ...x, chuvaMm: null } : x));
  checar('dia com chuva desconhecida não conta como seco', avaliarRadarTempo(secoComBuraco, ['jardinagem'], HOJE).estado, 'sem_sugestao');
}

console.log('\n3) dengue só na época (novembro a maio)');
{
  const prev = [d('2026-02-11', 31, 0), d('2026-02-12', 30, 12)];
  const fev = avaliarRadarTempo(prev, ['dedetizacao'], '2026-02-10');
  checar('fevereiro com calor e chuva → dengue', fev.estado === 'sugestao' ? fev.sugestao.gatilho : fev, 'dengue');
  if (fev.estado === 'sugestao') checar('detalhe cita a previsão e a época', fev.sugestao.detalhe,
    'Previsão: 2 dias com 30 °C ou mais e chuva de 12 mm em qui (12/02). De novembro a maio é quando o mosquito mais se espalha.');
  const set = [d('2026-09-11', 31, 0), d('2026-09-12', 30, 12)];
  checar('setembro (fora da época) → silêncio', avaliarRadarTempo(set, ['dedetizacao'], '2026-09-10'), { estado: 'sem_sugestao' });
}

console.log('\n4) mensagem para UM cliente (o prestador envia)');
{
  const ar = avaliarRadarTempo(calor, ['refrigeracao'], HOJE);
  if (ar.estado === 'sugestao') {
    checar('mensagem honesta com nome, prestador e tempo do último serviço',
      mensagemCampanha(ar.sugestao, { nome: 'Maria da Silva', meses: 8 }, 'Igor'),
      'Olá, Maria! Aqui é Igor. Passando porque a previsão é de calor forte nos próximos dias. Seu último serviço comigo foi há 8 meses. Quer agendar a limpeza do ar-condicionado? É só me responder aqui.');
    checar('sem meses e sem prestador não inventa', mensagemCampanha(ar.sugestao, { nome: '' }, null),
      'Olá! Passando porque a previsão é de calor forte nos próximos dias. Quer agendar a limpeza do ar-condicionado? É só me responder aqui.');
  }
  checar('rótulo do dia', rotuloDia('2026-10-11'), 'dom (11/10)');
}

console.log('\n5) anti-spam');
{
  const DIA = 86_400_000;
  const t0 = Date.UTC(2026, 9, 5);
  checar('primeira vez mostra', podeMostrarSugestao(null, 'calor:2026-10-06', t0), true);
  const g = registrarMostrada(null, 'calor:2026-10-06', t0);
  checar('a MESMA sugestão continua visível', podeMostrarSugestao(g, 'calor:2026-10-06', t0 + 2 * DIA), true);
  checar('OUTRA sugestão só depois de 7 dias', [podeMostrarSugestao(g, 'calor:2026-10-12', t0 + 3 * DIA), podeMostrarSugestao(g, 'calor:2026-10-12', t0 + 7 * DIA)], [false, true]);
  const fechado = ocultar(g, t0, 'semana');
  checar('"agora não" esconde por 7 dias', [podeMostrarSugestao(fechado, 'calor:2026-10-06', t0 + 6 * DIA), podeMostrarSugestao(fechado, 'calor:2026-10-06', t0 + 7 * DIA)], [false, true]);
  const mudo = ocultar(g, t0, 'silenciar');
  checar('silenciar = 30 dias', [podeMostrarSugestao(mudo, 'x', t0 + 29 * DIA), podeMostrarSugestao(mudo, 'x', t0 + 31 * DIA)], [false, true]);
}

console.log('\n6) encaixes: campanha humana, gate Pro, sem API paga');
{
  const ler = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const card = ler('../src/components/rua/RadarTempoCard.tsx');
  checar('gate Pro (radar_clientes)', card.includes("useRecursoPlano('radar_clientes')") && card.includes('CartaoRecursoPlano'), true);
  checar('WhatsApp só pelo abrirWhatsApp (wa.me), um cliente por vez', card.includes('abrirWhatsApp(telefone') && card.includes('fila.indice + 1'), true);
  checar('nenhum envio automático/em massa nem API não oficial', /setInterval|Promise\.all\(\s*clientes|graph\.facebook|api\.whatsapp|z-api|evolution/i.test(card), false);
  checar('crédito do MET aparece com a sugestão', card.includes('atribuicaoClima(clima)'), true);
  checar('erro ao ler clientes vira aviso, não some', card.includes("clientes === 'erro'") && card.includes('Tentar de novo'), true);
  checar('Painel liga o radar', ler('../src/screens/HomeScreen.tsx').includes('<RadarTempoCard clima={clima} />'), true);
  checar('worker manda o resumo por dia do MET', ler('../worker/src/clima.js').includes('dias: resumirDias(serie)'), true);
}

console.log(`\nteste-radar-tempo: ${passes} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
