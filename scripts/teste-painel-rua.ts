/**
 * Painel da Rua — o Início novo do prestador que está na rua (item 2.6 da Onda 2).
 *
 *     node scripts/teste-painel-rua.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * COMPORTAMENTO de verdade (funções puras, sem React Native):
 *  - rota de hoje em sequência, com o estado de cada parada (feita, agora,
 *    sem baixa, próxima, depois); cancelada e excluída não são parada;
 *  - link do Google Maps com todas as paradas (público, sem chave, sem custo),
 *    no limite de 10 pontos do link;
 *  - consulta da cidade do cadastro para o clima de reserva.
 * FIAÇÃO (lendo o fonte sem comentários): ordem da tela, clima com o crédito
 * "Previsão: MET Norway", "Traçar rota" + "Estou a caminho", atalhos de 1 toque,
 * nada de duplicata ("Abrir agenda", diagnóstico, dica do botão central), motion
 * só com os componentes Reanimated e nenhum alerta cinza nativo.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import type { Agendamento } from '../src/types/index.ts';
import { montarRotaDoDia } from '../src/utils/agendaDia.ts';
import { MAX_PARADAS_LINK_MAPS, enderecosDaRota, urlRotaDoDia } from '../src/utils/rotaDoDia.ts';
import { chaveCidadeClima, consultaCidadeClima } from '../src/utils/cidadeClima.ts';

let ok = 0;
function caso(nome: string, fn: () => void) {
  fn();
  ok++;
  console.log(`ok - ${nome}`);
}

function ler(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

/** Fonte sem comentários: o teste olha o que RODA, não o que o comentário promete. */
function semComentarios(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ [^'"`\n]*$/gm, '');
}

function visita(p: Partial<Agendamento> & Pick<Agendamento, 'id' | 'inicio'>): Agendamento {
  return {
    clienteNome: 'Cliente',
    titulo: 'Visita',
    tipo: 'visita',
    status: 'agendado',
    criadoEm: '2026-10-01T00:00:00.000Z',
    atualizadoEm: '2026-10-01T00:00:00.000Z',
    ...p,
  };
}

// Relógio fixo: 1º/10/2026, 12:00 no horário do aparelho.
const AGORA = new Date(2026, 9, 1, 12, 0, 0);
const as = (h: number, m = 0) => new Date(2026, 9, 1, h, m, 0).toISOString();

// ─── 1. Rota de hoje ─────────────────────────────────────────────────────────
caso('rota em ordem de horário, com o estado de cada parada', () => {
  const rota = montarRotaDoDia([
    visita({ id: 'tarde2', inicio: as(16) }),
    visita({ id: 'feita', inicio: as(8), status: 'concluido' }),
    visita({ id: 'agora', inicio: as(11, 30), fim: as(13) }),
    visita({ id: 'semBaixa', inicio: as(9) }),
    visita({ id: 'tarde1', inicio: as(14) }),
  ], AGORA);
  assert.deepEqual(rota.map(p => [p.visita.id, p.estado]), [
    ['feita', 'feita'],
    ['semBaixa', 'sem_baixa'],
    ['agora', 'agora'],
    ['tarde1', 'proxima'],
    ['tarde2', 'depois'],
  ]);
});

caso('cancelada, excluída e horário ilegível não são parada', () => {
  const rota = montarRotaDoDia([
    visita({ id: 'cancelada', inicio: as(14), status: 'cancelado' }),
    visita({ id: 'lixeira', inicio: as(15), excluidoEm: as(10) }),
    visita({ id: 'lixo', inicio: 'não é data' }),
    visita({ id: 'valida', inicio: as(17) }),
  ], AGORA);
  assert.deepEqual(rota.map(p => p.visita.id), ['valida']);
  assert.equal(rota[0].estado, 'proxima');
});

caso('sem `fim`, a visita dura 1h (mesma regra do resto da agenda)', () => {
  const rota = montarRotaDoDia([visita({ id: 'v', inicio: as(11, 15) })], AGORA);
  assert.equal(rota[0].estado, 'agora');
  const depois = montarRotaDoDia([visita({ id: 'v', inicio: as(10, 30) })], AGORA);
  assert.equal(depois[0].estado, 'sem_baixa');
});

caso('dia vazio é lista vazia (a tela decide o "Nada marcado")', () => {
  assert.deepEqual(montarRotaDoDia([], AGORA), []);
});

// ─── 2. Link do Maps com todas as paradas ───────────────────────────────────
caso('sem endereço utilizável não há link (botão não aparece)', () => {
  assert.equal(urlRotaDoDia([]), null);
  assert.equal(urlRotaDoDia([undefined, null, '  ', 'ab']), null);
});

caso('uma parada: só destino, sem waypoints', () => {
  const url = urlRotaDoDia(['Av. Angélica, 2100 - São Paulo']);
  assert.ok(url);
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  assert.match(url, /travelmode=driving/);
  assert.doesNotMatch(url, /waypoints=/);
  assert.match(url, new RegExp(encodeURIComponent('Av. Angélica, 2100 - São Paulo').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

caso('várias paradas: a última é o destino, as outras viram waypoints em ordem', () => {
  const url = urlRotaDoDia(['Rua A, 1', 'Rua B, 2', 'Rua C, 3']) ?? '';
  const q = new URL(url).searchParams;
  assert.equal(q.get('destination'), 'Rua C, 3');
  assert.equal(q.get('waypoints'), 'Rua A, 1|Rua B, 2');
  assert.doesNotMatch(url, /key=/, 'link público: nenhuma chave de API');
});

caso('mesma parada em seguida vira um ponto só; espaços normalizados', () => {
  assert.deepEqual(enderecosDaRota(['Rua A, 1', ' rua a,  1 ', 'Rua B, 2', 'Rua A, 1']), ['Rua A, 1', 'Rua B, 2', 'Rua A, 1']);
});

caso('corta no limite do link do Maps (destino + 9 paradas)', () => {
  const muitas = Array.from({ length: 14 }, (_, i) => `Rua ${i + 1}, 100`);
  const lista = enderecosDaRota(muitas);
  assert.equal(MAX_PARADAS_LINK_MAPS, 10);
  assert.equal(lista.length, 10);
  const q = new URL(urlRotaDoDia(muitas) ?? '').searchParams;
  assert.equal(q.get('destination'), 'Rua 10, 100');
  assert.equal((q.get('waypoints') ?? '').split('|').length, 9);
});

// ─── 3. Cidade de reserva do clima ──────────────────────────────────────────
caso('cidade do cadastro vira consulta com UF e Brasil', () => {
  assert.equal(consultaCidadeClima('São Paulo', 'sp'), 'São Paulo - SP, Brasil');
  assert.equal(consultaCidadeClima('  Porto   Alegre ', ''), 'Porto Alegre, Brasil');
  assert.equal(consultaCidadeClima('', 'SP'), null, 'sem cidade não inventa coordenada');
  assert.equal(consultaCidadeClima(undefined, undefined), null);
  assert.equal(chaveCidadeClima('São  Paulo - SP, Brasil'), chaveCidadeClima('são paulo - sp, brasil'));
});

// ─── 4. Fiação do Início ─────────────────────────────────────────────────────
const homeBruto = ler('../src/screens/HomeScreen.tsx');
const home = semComentarios(homeBruto);
const climaComp = semComentarios(ler('../src/components/rua/ClimaDoDia.tsx'));
const rotaComp = semComentarios(ler('../src/components/rua/RotaDeHoje.tsx'));
const reserva = semComentarios(ler('../src/services/climaReserva.ts'));
const agenda = semComentarios(ler('../src/screens/AgendaScreen.tsx'));
const storageKeys = ler('../src/services/storageKeys.ts');

caso('ordem fixa: clima → próxima parada → rota de hoje → dinheiro → atalhos', () => {
  const pos = (re: RegExp) => {
    const i = home.search(re);
    assert.ok(i >= 0, `não achou ${re}`);
    return i;
  };
  const ordem = [
    pos(/<ClimaDoDia\b/),
    pos(/PRÓXIMA PARADA/),
    pos(/<RotaDeHoje\b/),
    pos(/<PainelDinheiroParado\b/),
    pos(/<AtalhosRua\b/),
  ];
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem);
});

caso('clima vem do worker (useClimaDoDia) e mostra o crédito do MET Norway', () => {
  assert.match(home, /useClimaDoDia\(/);
  assert.match(climaComp, /atribuicaoClima\(clima\)/, 'crédito CC BY 4.0 sempre que há dado');
  assert.match(climaComp, /textoClima\(clima\)/, 'falha aparece como "Clima indisponível", nunca some');
  assert.doesNotMatch(home + climaComp + reserva, /open-meteo|openweather|api\.weather/i, 'nenhum serviço de clima novo');
  assert.doesNotMatch(reserva, /requestForegroundPermissionsAsync|requestPermissions/, 'clima nunca pede permissão');
  assert.match(reserva, /geocodificarEndereco\(/, 'reserva usa o /geocodificar que o app já usa');
  assert.match(reserva, /AsyncStorage\.setItem\(CLIMA_COORD_CIDADE_KEY/, 'cidade geocodificada uma vez por aparelho');
  assert.match(reserva, /cadastro === 'erro'[\s\S]{0,80}estado: 'falhou'/, 'cadastro ilegível não vira "sem cidade"');
  assert.match(storageKeys, /CLIMA_COORD_CIDADE_KEY,\s*ULTIMO_PULL_KEY,\s*\];/, 'coordenada da cidade sai no logout');
});

caso('próxima parada: hora, endereço, "Traçar rota" e "Estou a caminho"', () => {
  assert.match(home, /rotuloQuandoVisita\(proxima\)/);
  assert.match(home, /proxima\.endereco\?\.trim\(\) \|\| 'Sem endereço nesta visita'/, 'sem endereço é dito, não some');
  assert.match(home, /abrirRotaGoogleMaps\(proxima\.endereco/);
  assert.match(home, />Traçar rota</);
  assert.match(home, /\{avisandoCliente \? 'Abrindo…' : 'Estou a caminho'\}/, '"Estou a caminho" tem estado de carregando');
  assert.match(home, /toast\.erro\('Não deu para abrir o WhatsApp\. Confira se ele está instalado\.'\)/, 'falha do WhatsApp aparece');
  assert.match(home, /Emitir recibo/, 'em atendimento: emitir recibo');
});

caso('rota de hoje: 3 estados e "Rota no Maps" só com 2+ paradas pela frente', () => {
  assert.match(home, /getAgendamentosDoDia\(\)/);
  assert.match(home, /setRotaEstado\('erro'\)/);
  assert.match(home, /enderecosPendentes\.length >= 2 \?/);
  assert.match(home, /download === 'falhou' \? 'erro' : 'carregando'/, 'agenda que não chegou da nuvem não vira "nada hoje"');
  assert.match(rotaComp, /estado === 'carregando'[\s\S]*estado === 'erro'[\s\S]*Nada marcado para hoje/);
  assert.match(rotaComp, /onAbrirVisita\(p\.visita\.id\)/, 'toque na parada abre a visita');
});

caso('atalhos de 1 toque: Orçar, Recibo, Agendar, Clientes', () => {
  for (const r of ['Orçar', 'Recibo', 'Agendar', 'Clientes']) {
    assert.match(home, new RegExp(`rotulo: '${r}'`), `atalho ${r}`);
  }
  assert.match(home, /params: \{ novo: true \}/, 'Agendar abre o formulário');
  assert.match(agenda, /p\?\.novo && !p\.novoParaClienteId/, 'Agenda entende o "novo"');
});

caso('sem duplicata: "Abrir agenda", diagnóstico e dica do botão central uma vez só', () => {
  assert.doesNotMatch(home, /Abrir agenda|Mais atalhos|Ações rápidas|Todos os orçamentos/);
  assert.equal((home.match(/<DicaContextual\b/g) ?? []).length, 1);
  assert.equal((home.match(/home\.botao-orcar/g) ?? []).length, 1);
  assert.equal((home.match(/card-search-outline/g) ?? []).length, 1);
});

caso('motion: só os componentes Reanimated, sem loop e sem alerta cinza', () => {
  assert.match(home, /<Aparecer indice=/);
  assert.match(home, /<ContadorAnimado valor=\{valorAprovadoMes\} formato="brl"/);
  assert.doesNotMatch(home, /AnimatedEntrance|CountUp|OlliSkeleton|TouchableOpacity|Animated\.timing|Animated\.Value/);
  assert.doesNotMatch(home, /Alert\.alert/, 'avisos pelo toast');
  assert.match(home, /<OlliMascot size=\{34\} onDark float=\{false\} pulse=\{false\} \/>/, 'mascote do topo sem loop');
  assert.match(home, /haptic="light"/, 'háptico leve na ação principal');
  assert.doesNotMatch(rotaComp + climaComp, /withRepeat/, 'nenhum loop infinito');
});

console.log(`\n${ok} casos passaram.`);
