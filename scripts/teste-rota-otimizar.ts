/**
 * Teste da Rota do Dia GRÁTIS (Onda I2): o ETA estimado no aparelho, a ordenação
 * da rota (vizinho mais próximo + 2-opt com horários fixos) e as regras puras do
 * Mapa do Dia.
 *
 *     node scripts/teste-rota-otimizar.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * `etaEstimado.ts`, `rotaOtimizar.ts` e `utils/mapaDia.ts` só importam módulos
 * puros: aqui roda o comportamento REAL. As buscas no fonte ficam para o que só
 * dá para provar lendo (nenhuma chamada ao Google, atribuição visível, gate Pro).
 */
import { readFileSync } from 'node:fs';
import {
  FATOR_RUA,
  MINUTOS_MINIMOS,
  ROTULO_ESTIMATIVA,
  distanciaRetaKm,
  estimarParaChegar,
  estimarViagem,
  folgaEstimativaMin,
  pontoValido,
  textoKm,
  textoMinutos,
  velocidadeUrbanaKmh,
} from '../src/services/etaEstimado.ts';
import { otimizarRota, textoGanho, textoMotivoRota, totaisDaRota, type ParadaRota } from '../src/services/rotaOtimizar.ts';
import { ATRIBUICAO_MAPA, ESTILO_MAPA, diaNoMapa, limitesDosPontos, linhaDaRota, linhaParcial, resumoDoDia } from '../src/utils/mapaDia.ts';
import type { Agendamento, Cliente } from '../src/types/index.ts';

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

function ler(caminho: string): string {
  return readFileSync(new URL(caminho, import.meta.url), 'utf8');
}

function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** ISO UTC de uma hora local de Brasília (UTC−3). */
function brasilia(dia: string, hhmm: string): number {
  return Date.parse(`${dia}T${hhmm}:00-03:00`);
}

const DIA = '2026-10-07'; // quarta-feira
const SE = { lat: -23.5505, lon: -46.6333 }; // Praça da Sé
const KM = 1 / 111; // ~1 km em graus de latitude

function pontoNorte(km: number) {
  return { lat: SE.lat + km * KM, lon: SE.lon };
}

console.log('\n1) ESTIMATIVA — linha reta × 1,4 ÷ velocidade do horário');
{
  const a = SE;
  const b = pontoNorte(5);
  const reta = distanciaRetaKm(a, b);
  checar('5 km de reta medidos pela haversine (±0,1)', Math.abs(reta - 5) < 0.1, true);
  const e = estimarViagem(a, b, brasilia(DIA, '10:00'));
  checar('rua = reta × FATOR_RUA', e?.distanciaKm, Math.round(reta * FATOR_RUA * 10) / 10);
  checar('10h de dia útil = 24 km/h', velocidadeUrbanaKmh(brasilia(DIA, '10:00')), 24);
  checar('18h de dia útil = pico (18 km/h)', velocidadeUrbanaKmh(brasilia(DIA, '18:00')), 18);
  checar('domingo = 32 km/h', velocidadeUrbanaKmh(brasilia('2026-10-11', '18:00')), 32);
  checar('madrugada = 32 km/h', velocidadeUrbanaKmh(brasilia(DIA, '23:30')), 32);
  const pico = estimarViagem(a, b, brasilia(DIA, '18:00'));
  checar('no pico demora mais que às 10h', (pico?.minutos ?? 0) > (e?.minutos ?? 0), true);
  checar('7 km de rua às 10h ≈ 7/24 h + 3 min = 21 min', e?.minutos, Math.ceil((reta * FATOR_RUA / 24) * 60 + 3));
  checar('viagem curtinha tem piso', estimarViagem(a, { lat: a.lat + 0.0001, lon: a.lon }, brasilia(DIA, '10:00'))?.minutos, MINUTOS_MINIMOS);
  const longe = estimarViagem(a, pontoNorte(60), brasilia(DIA, '10:00'));
  checar('trecho além de 10 km anda a 50 km/h (60 km de reta < 4h)', (longe?.minutos ?? 999) < 240, true);
}

console.log('\n2) O QUE NÃO VIRA NÚMERO — "não sei" nunca é "pertinho"');
checar('0,0 não é ponto', pontoValido({ lat: 0, lon: 0 }), false);
checar('meia coordenada não é ponto', pontoValido({ lat: -23 }), false);
checar('ponto inválido → null', estimarViagem({ lat: 0, lon: 0 }, SE, Date.now()), null);
checar('900 km entre visitas → null (coordenada errada)', estimarViagem(SE, { lat: -15.79, lon: -47.88 }, Date.now()), null);
checar('chegada ilegível → null', estimarParaChegar(SE, pontoNorte(3), Number.NaN), null);

console.log('\n3) FOLGA E TEXTOS');
checar('folga mínima 8 min', folgaEstimativaMin(10), 8);
checar('folga = 20% em viagem longa', folgaEstimativaMin(100), 20);
checar('folga tem teto de 60', folgaEstimativaMin(1000), 60);
checar('rótulo honesto', ROTULO_ESTIMATIVA, 'estimativa, sem trânsito');
checar('km com vírgula', textoKm(12.34), '12,3 km');
checar('metros abaixo de 1 km', textoKm(0.42), '400 m');
checar('minutos curtos', textoMinutos(45), '45 min');
checar('hora e minutos', textoMinutos(80), '1h20');

console.log('\n4) ORDENAR — zigue-zague vira linha reta');
function parada(id: string, km: number, hhmm: string, fixa = false): ParadaRota {
  return { id, ponto: pontoNorte(km), inicioMs: brasilia(DIA, hhmm), duracaoMin: 60, fixa };
}
{
  // Agenda atual: 0 km → 12 km → 2 km → 14 km (vai e volta). O certo é 0,2,12,14.
  const r = otimizarRota([parada('a', 0, '08:00'), parada('b', 12, '09:30'), parada('c', 2, '11:00'), parada('d', 14, '12:30')]);
  checar('resultado ok', r.ok, true);
  if (r.ok) {
    checar('ordem sugerida a, c, b, d', r.ordem, ['a', 'c', 'b', 'd']);
    checar('melhorou', r.melhorou, true);
    checar('economiza tempo', r.ganhoMin > 0, true);
    checar('economiza km', r.ganhoKm > 0, true);
    checar('os horários do dia são mantidos (troca quem vai em cada horário)', r.inicios.c, brasilia(DIA, '09:30'));
    checar('lista de mudanças tem quem trocou de horário', r.mudancas.map((m) => m.id).sort(), ['b', 'c']);
    checar('frase do ganho diz que é estimativa', textoGanho(r.ganhoMin, r.ganhoKm).includes('estimativa, sem trânsito'), true);
  }
}

console.log('\n5) HORÁRIO FIXO não sai do lugar');
{
  // 'b' (12 km) tem horário combinado às 09:30: mesmo sendo a "errada" no caminho, fica.
  const r = otimizarRota([parada('a', 0, '08:00'), parada('b', 12, '09:30', true), parada('c', 2, '11:00'), parada('d', 14, '12:30')]);
  checar('ok', r.ok, true);
  if (r.ok) {
    checar('a fixa continua na 2ª posição', r.ordem[1], 'b');
    checar('a fixa continua no mesmo horário', r.inicios.b, brasilia(DIA, '09:30'));
    checar('a fixa nunca aparece nas mudanças', r.mudancas.some((m) => m.id === 'b'), false);
  }
}

console.log('\n6) ORDEM INVIÁVEL nunca é sugerida');
{
  // 'x' fixa às 08:40 a 30 km de 'a' (08:00–08:30): nenhuma ordem chega a tempo nela.
  const r = otimizarRota([parada('a', 0, '08:00'), { ...parada('x', 30, '08:40', true), duracaoMin: 30 }, parada('c', 1, '10:00'), parada('d', 2, '11:00')]);
  checar('a ordem atual já é inviável → diz isso', r.ok ? 'ok' : r.motivo, 'ordem_atual_inviavel');
  checar('texto explica e manda revisar a agenda', textoMotivoRota('ordem_atual_inviavel').includes('Revise os horários'), true);
}
{
  // Bloqueio (visita sem coordenada às 10:00–11:00): ninguém é empurrado para cima dela.
  const r = otimizarRota(
    [parada('a', 0, '08:00'), parada('b', 12, '09:00'), parada('c', 2, '11:00'), parada('d', 14, '12:00')],
    { bloqueios: [{ inicioMs: brasilia(DIA, '10:00'), fimMs: brasilia(DIA, '11:00') }] },
  );
  if (r.ok) {
    const choca = Object.values(r.inicios).some((ini) => ini < brasilia(DIA, '11:00') && ini + 60 * 60_000 > brasilia(DIA, '10:00'));
    checar('nenhuma parada cai em cima do bloqueio', choca, false);
  } else {
    checar('ok', r.ok, true);
  }
}

console.log('\n7) POUCAS PARADAS é estado próprio, não "rota já ótima"');
checar('1 parada livre → poucas_paradas', (() => { const r = otimizarRota([parada('a', 0, '08:00'), parada('b', 1, '09:00', true)]); return r.ok ? 'ok' : r.motivo; })(), 'poucas_paradas');
checar('ponto inválido não entra', (() => { const r = otimizarRota([{ ...parada('a', 0, '08:00'), ponto: { lat: 0, lon: 0 } }, parada('b', 1, '09:00')]); return r.ok ? 'ok' : r.motivo; })(), 'poucas_paradas');
{
  const r = otimizarRota([parada('a', 0, '08:00'), parada('b', 1, '09:30'), parada('c', 2, '11:00')]);
  checar('rota que já é a melhor → ok sem mudanças', r.ok && !r.melhorou && r.mudancas.length === 0, true);
}

console.log('\n8) COM BASE (ponto de saída)');
{
  const r = otimizarRota([parada('longe', 10, '08:00'), parada('perto', 1, '10:00')], { origem: SE });
  checar('saindo da base, a perto vem antes', r.ok ? r.ordem : null, ['perto', 'longe']);
  const t = totaisDaRota([parada('a', 0, '08:00'), parada('b', 2, '10:00')], SE);
  checar('totais somam o trecho da base', t.km > 0, true);
}

console.log('\n9) MAPA DO DIA — quem vira pin e quem fica sem local');
{
  const clientes = [
    { id: 'c1', nome: 'Ana', telefone: '', endereco: 'Rua A, 10', lat: -23.55, lon: -46.63, geoPrecisao: 'numero' },
    { id: 'c2', nome: 'Bia', telefone: '', endereco: 'Rua B, 20', lat: -23.56, lon: -46.64, geoPrecisao: 'cep' },
    { id: 'c3', nome: 'Caio', telefone: '', endereco: 'Rua C, 30' },
    { id: 'c4', nome: 'Duda', telefone: '', endereco: 'Rua D, 40', lat: -23.57, lon: -46.65, geoPrecisao: 'cidade' },
  ] as unknown as Cliente[];
  const ag = (id: string, clienteId: string, hhmm: string, endereco?: string) => ({
    id, clienteId, clienteNome: id, titulo: '', tipo: 'manutencao', inicio: new Date(brasilia(DIA, hhmm)).toISOString(),
    status: 'agendado', criadoEm: '', atualizadoEm: '', endereco,
  }) as unknown as Agendamento;
  const paradas = [
    { visita: ag('v2', 'c2', '10:00'), estado: 'depois' as const },
    { visita: ag('v1', 'c1', '08:00'), estado: 'feita' as const },
    { visita: ag('v3', 'c3', '12:00'), estado: 'depois' as const },
    { visita: ag('v4', 'c4', '14:00'), estado: 'depois' as const },
    { visita: ag('v5', 'c1', '16:00', 'Avenida Outra, 999'), estado: 'depois' as const },
  ];
  const d = diaNoMapa(paradas, clientes);
  checar('com local, em ordem de horário e numeradas', d.comLocal.map((p) => `${p.numero}:${p.id}`), ['1:v1', '2:v2']);
  checar('sem coordenada, só cidade, ou endereço próprio diferente → sem local', d.semLocal.map((p) => p.id).sort(), ['v3', 'v4', 'v5']);
  checar('ponto pelo CEP é marcado aproximado', d.comLocal.find((p) => p.id === 'v2')?.aproximado, true);
}

console.log('\n10) GEOMETRIA DA TELA');
{
  const lim = limitesDosPontos([{ lat: -23.5, lon: -46.6 }]);
  checar('1 ponto vira uma área (não zoom infinito)', lim !== null && lim[2] - lim[0] > 0 && lim[3] - lim[1] > 0, true);
  checar('sem pontos → null', limitesDosPontos([]), null);
  const linha = linhaDaRota([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }]);
  checar('linha em [lon, lat] (GeoJSON)', linha, [[2, 1], [4, 3]]);
  const reta: [number, number][] = [[0, 0], [10, 0], [20, 0]];
  checar('progresso 0 → 2 posições no 1º ponto', linhaParcial(reta, 0), [[0, 0], [0, 0]]);
  checar('progresso 0,25 → metade do 1º trecho', linhaParcial(reta, 0.25), [[0, 0], [5, 0]]);
  checar('progresso 0,75 → passa do meio', linhaParcial(reta, 0.75), [[0, 0], [10, 0], [15, 0]]);
  checar('progresso 1 → a linha inteira', linhaParcial(reta, 1), reta);
  checar('resumo do dia', resumoDoDia(4, 38.2, new Date(2026, 9, 7, 17, 30).getTime()), '4 visitas · 38,2 km · termina ~17h30');
  checar('resumo sem km nem fim', resumoDoDia(1, null, null), '1 visita');
}

console.log('\n11) GRÁTIS DE VERDADE — nada de Google, atribuição visível');
{
  checar('estilos do OpenFreeMap (sem chave)', Object.values(ESTILO_MAPA).every((u) => u.startsWith('https://tiles.openfreemap.org/styles/')), true);
  checar('atribuição OpenMapTiles + OpenStreetMap', ATRIBUICAO_MAPA, '© OpenMapTiles © OpenStreetMap');
  const fontes = [
    '../src/services/etaEstimado.ts', '../src/services/rotaOtimizar.ts', '../src/utils/mapaDia.ts',
    '../src/services/eta.ts', '../src/services/etaSaida.ts', '../src/services/saidaCalculo.ts',
    '../src/components/mapa/MapaBase.tsx', '../src/components/mapa/MapaBase.web.tsx',
    '../src/screens/MapaDiaScreen.tsx', '../src/components/rua/MiniMapaDia.tsx', '../worker/src/etaSaida.js',
  ].map((f) => semComentarios(ler(f))).join('\n');
  checar('nenhuma chamada ao Google Routes/Geocoding/Maps', /googleapis\.com|OLLI_ROUTES_API_KEY|computeRoutes/.test(fontes), false);
  const mapa = ler('../src/components/mapa/MapaBase.tsx');
  checar('o mapa nativo mostra a atribuição', mapa.includes('ATRIBUICAO_MAPA'), true);
  checar('o esquema (web/sem módulo) também mostra de onde vêm os dados', ler('../src/components/mapa/EsquemaRota.tsx').includes('sem mapa de fundo'), true);
  checar('o módulo nativo é carregado com guarda (APK antigo não quebra)', /TurboModuleRegistry\.get\(['"]MLRNMapViewModule['"]\)/.test(mapa), true);
  checar('nada de import do MapLibre no topo (bundle Hermes)', /^import[^\n]*@maplibre\/maplibre-react-native/m.test(mapa), false);
  const tela = semComentarios(ler('../src/screens/MapaDiaScreen.tsx'));
  checar('ordenar passa pelo gate Pro (hora_de_sair)', /RecursoPlanoChip recurso="hora_de_sair"|useRecursoPlano\('hora_de_sair'\)/.test(tela), true);
  checar('aplicar a nova ordem pergunta antes', tela.includes('confirmar('), true);
  checar('aviso ao cliente só por link oficial (wa.me)', /wa\.me|abrirWhatsApp/.test(tela) && !/api\.whatsapp|whatsapp-web|baileys/i.test(tela), true);
  checar('dica da primeira vez', tela.includes('DicaContextual'), true);
  const app = JSON.parse(ler('../app.json'));
  checar('config plugin do MapLibre no app.json', app.expo.plugins.some((p: unknown) => (Array.isArray(p) ? p[0] : p) === '@maplibre/maplibre-react-native'), true);
}

console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
