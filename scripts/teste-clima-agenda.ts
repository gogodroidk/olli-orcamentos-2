/**
 * Teste do ENCAIXE de "Chuva na Visita" e do Encaixe Inteligente nas telas
 * (Agenda, Hoje e Agenda desktop).
 *
 *     node scripts/teste-clima-agenda.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * `src/utils/climaNaAgenda.ts` só importa módulos puros (`climaVisitaRegra.ts`,
 * `climaTexto.ts`), então aqui há COMPORTAMENTO de verdade: quem ganha chip (sem
 * poluir a tela da rua), o cartão do dia (janela de 12h do MET, contando quem
 * ficou sem localização), o plano de remarcar (série = só esta ocorrência,
 * duração mantida) e os horários do Encaixe na mensagem — com a regra dura:
 * erro nunca vira vazio. As buscas no fonte provam a LIGAÇÃO nas telas.
 */
import { readFileSync } from 'node:fs';
import type { DadosClima, HoraChuva } from '../src/services/climaTexto.ts';
import { analisarClimaVisita } from '../src/services/climaVisitaRegra.ts';
import {
  alternativasDoEncaixe,
  climaMereceEspaco,
  planoRemarcarVisita,
  temCoordenada,
  textoSemLocal,
  visitaNaJanelaDoClima,
  visitaParaClima,
  visitasDoClimaNoDia,
  type VisitaClimaAgenda,
} from '../src/utils/climaNaAgenda.ts';

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

/** Agora: quinta 01/10/2026, 14h10 em Brasília. */
const AGORA = new Date('2026-10-01T14:10:00-03:00');
const SP = { lat: -23.55, lon: -46.63 };

function serie(mms: (number | null)[]): HoraChuva[] {
  return mms.map((mm, i) => {
    const t = new Date(Date.parse('2026-10-01T14:00:00-03:00') + i * 3_600_000 - 3 * 3_600_000);
    const iso = t.toISOString();
    return { inicio: iso.slice(0, 16), hora: iso.slice(11, 16), mm, simbolo: mm === null ? null : 'cloudy' };
  });
}
function clima(mms: (number | null)[]): DadosClima {
  return {
    ok: true, temperatura: 27, simbolo: 'cloudy', descricao: 'Nublado', ehDia: true, max: 30, min: 20,
    chuvaPorHora: serie(mms), atualizadoEm: null, resumo: '', atribuicao: 'Previsão: MET Norway',
  };
}
const SECO = Array(12).fill(0) as number[];
const FORTE_16H = [0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const iso = (s: string) => new Date(s).toISOString();

console.log('\n1) quem ganha a linha de clima (sem poluir a tela da rua)');
{
  const v = { inicio: iso('2026-10-01T16:00:00-03:00'), fim: iso('2026-10-01T17:00:00-03:00'), externa: true };
  const forte = analisarClimaVisita(visitaParaClima(v, SP), clima(FORTE_16H), { agora: AGORA });
  checar('previsão de chuva forte → aparece', climaMereceEspaco(forte, { externa: true }), true);
  checar('visita externa com chuva forte → sugere remarcar', forte.sugerirRemarcar, true);
  const seco = analisarClimaVisita(visitaParaClima(v, SP), clima(SECO), { agora: AGORA });
  checar('sem chuva também aparece (é previsão confirmada)', climaMereceEspaco(seco), true);
  const carregando = analisarClimaVisita(visitaParaClima(v, SP), 'carregando', { agora: AGORA });
  checar('carregando aparece (skeleton)', climaMereceEspaco(carregando), true);
  const falhou = analisarClimaVisita(visitaParaClima(v, SP), { ok: false, motivo: 'offline' }, { agora: AGORA });
  checar('REGRA DURA: clima que falhou aparece ("indisponível"), não some', [climaMereceEspaco(falhou), falhou.texto], [true, 'Clima indisponível sem internet']);
  const semLocalInterna = analisarClimaVisita(visitaParaClima({ ...v, externa: false }, null), 'carregando', { agora: AGORA });
  checar('sem localização numa visita interna/"não sei" → não ocupa espaço', [climaMereceEspaco(semLocalInterna, { externa: false }), climaMereceEspaco(semLocalInterna, {})], [false, false]);
  const semLocalExterna = analisarClimaVisita(visitaParaClima(v, null), 'carregando', { agora: AGORA });
  checar('sem localização numa visita EXTERNA → aparece (é onde a chuva importa)', climaMereceEspaco(semLocalExterna, { externa: true }), true);
  const longe = { inicio: iso('2026-10-06T10:00:00-03:00') };
  const fora = analisarClimaVisita(visitaParaClima(longe, SP), 'carregando', { agora: AGORA });
  checar('visita da semana que vem ("a previsão sai 12h antes") → não ocupa espaço', [fora.estado, climaMereceEspaco(fora)], ['fora_da_janela', false]);
  const passada = analisarClimaVisita(visitaParaClima({ inicio: iso('2026-10-01T08:00:00-03:00'), fim: iso('2026-10-01T09:00:00-03:00') }, SP), clima(SECO), { agora: AGORA });
  checar('visita passada → nada', climaMereceEspaco(passada), false);
  checar('"Dia todo" nunca ganha clima (a meia-noite dele não é horário)', climaMereceEspaco(seco, { diaTodo: true }), false);
  const comAlertaFora = analisarClimaVisita(visitaParaClima(longe, SP), 'carregando', {
    agora: AGORA,
    alertas: { ok: true, alertas: [{ fonte: 'INMET', evento: 'Tempestade', nivel: 'laranja', inicio: iso('2026-10-06T00:00:00-03:00'), fim: null }] },
  });
  checar('alerta oficial aparece mesmo fora da janela do MET', climaMereceEspaco(comAlertaFora), true);
}

console.log('\n2) entrada do clima a partir da visita + cliente');
checar('ponto do cliente e "externa?" vão para a regra',
  visitaParaClima({ inicio: 'a', fim: 'b', externa: true }, { lat: -23, lon: -46 }),
  { inicio: 'a', fim: 'b', lat: -23, lon: -46, externa: true });
checar('sem cliente / "não sei" → nulls (nunca 0,0 nem false)',
  visitaParaClima({ inicio: 'a' }, null), { inicio: 'a', fim: null, lat: null, lon: null, externa: null });
checar('coordenada: 0,0 e NaN recusados', [temCoordenada(SP), temCoordenada({ lat: 0, lon: 0 }), temCoordenada({ lat: Number.NaN, lon: 1 }), temCoordenada(null)], [true, false, false, false]);

console.log('\n3) cartão "Clima nas próximas visitas" (visão Dia)');
{
  const base = (id: string, h: string, extra: Partial<VisitaClimaAgenda> = {}): VisitaClimaAgenda =>
    ({ id, inicio: iso(`2026-10-01T${h}:00-03:00`), status: 'agendado', clienteId: 'c1', ...extra });
  const itens: VisitaClimaAgenda[] = [
    base('feita', '09:00', { fim: iso('2026-10-01T10:00:00-03:00') }),
    base('agora', '14:00', { fim: iso('2026-10-01T15:00:00-03:00') }),
    base('noite', '23:30'),
    base('semponto', '16:00', { clienteId: 'c2' }),
    base('livre', '17:00', { clienteId: null }),
    base('cancelada', '15:00', { status: 'cancelado' }),
    base('diatodo', '00:00'),
  ];
  itens.push({ id: 'amanha-cedo', inicio: iso('2026-10-02T01:00:00-03:00'), status: 'agendado', clienteId: 'c1' });
  itens.push({ id: 'amanha-tarde', inicio: iso('2026-10-02T15:00:00-03:00'), status: 'agendado', clienteId: 'c1' });
  const clientes: Record<string, { lat?: number; lon?: number }> = { c1: SP, c2: {} };
  const r = visitasDoClimaNoDia(itens, (id) => clientes[id], (v) => v.id === 'diatodo', AGORA);
  checar('só agendadas, com hora, nas próximas 12h e com ponto — em ordem', r.comLocal.map((v) => v.id), ['agora', 'noite', 'amanha-cedo']);
  checar('sem localização (sem ponto ou sem cadastro) é CONTADA, não some', r.semLocal, 2);
  checar('texto da contagem (1)', textoSemLocal(1), '1 visita sem localização do cliente ficou sem previsão. Cadastre o CEP no cliente.');
  checar('texto da contagem (2)', textoSemLocal(2), '2 visitas sem localização do cliente ficaram sem previsão. Cadastre o CEP nos clientes.');
  checar('zero → sem texto', textoSemLocal(0), null);
  checar('janela: começou e ainda não acabou conta', visitaNaJanelaDoClima({ inicio: iso('2026-10-01T13:30:00-03:00'), fim: iso('2026-10-01T15:00:00-03:00') }, AGORA), true);
  checar('janela: começa depois das 12h da série não conta', visitaNaJanelaDoClima({ inicio: iso('2026-10-02T02:00:00-03:00') }, AGORA), false);
  checar('janela: início ilegível não conta', visitaNaJanelaDoClima({ inicio: 'x' }, AGORA), false);
}

console.log('\n4) remarcar por chuva');
{
  const novo = new Date('2026-10-03T09:00:00-03:00');
  const avulsa = planoRemarcarVisita({ inicio: iso('2026-10-01T16:00:00-03:00'), fim: iso('2026-10-01T17:30:00-03:00') }, novo);
  checar('avulsa: muda a própria linha, mantém a duração (1h30)', avulsa, { modo: 'visita_avulsa', inicio: novo.toISOString(), fim: iso('2026-10-03T10:30:00-03:00') });
  const serieOc = planoRemarcarVisita({ inicio: iso('2026-10-01T16:00:00-03:00'), ocorrenciaDe: 'base' }, novo);
  checar('ocorrência de série: só esta (sem fim continua sem fim)', serieOc, { modo: 'so_esta_da_serie', inicio: novo.toISOString() });
  checar('1ª ocorrência (a própria base com repetição) também é "só esta"', planoRemarcarVisita({ inicio: iso('2026-10-01T16:00:00-03:00'), recorrencia: 'semanal' }, novo)?.modo, 'so_esta_da_serie');
  checar('data inválida → null (nada gravado)', planoRemarcarVisita({ inicio: iso('2026-10-01T16:00:00-03:00') }, new Date('x')), null);
}

console.log('\n5) horários do Encaixe na mensagem');
{
  const sug = (quando: string) => ({ inicio: '', fim: '', ancora: { visitaId: '', clienteNome: '', inicio: '', distanciaKm: 1, posicao: 'depois' as const }, deslocamentoMin: 10, quando, motivo: '' });
  checar('até 2 horários, na ordem', alternativasDoEncaixe({ ok: true, sugestoes: [sug('a'), sug('b'), sug('c')], visitasConsideradas: 3, visitasSemLocalizacao: 0 }), ['a', 'b']);
  checar('carregando/erro/cliente sem ponto → nenhum (a mensagem pergunta o dia, não inventa)',
    [alternativasDoEncaixe('carregando'), alternativasDoEncaixe('erro'), alternativasDoEncaixe({ ok: false, motivo: 'cliente_sem_localizacao' })], [[], [], []]);
}

console.log('\n6) ligação nas telas (fonte)');
function fonte(caminho: string): string {
  return readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
{
  const agenda = fonte('src/screens/AgendaScreen.tsx');
  checar('Agenda: chip de clima em cada visita da lista', /<ClimaDaVisita visita=\{item\}/.test(agenda), true);
  checar('Agenda: cartão de clima acima da grade do Dia', /cabecalho=\{<ClimaProximasVisitas/.test(agenda), true);
  checar('Agenda: Encaixe no "Agendar visita" (só visita nova com cliente)', /const mostrarEncaixe = !state\.id && !!clienteSel/.test(agenda) && /<SugestaoEncaixe resultado=\{encaixe\}/.test(agenda), true);
  checar('Agenda: "Serviço externo?" no formulário com a sugestão do ofício', /<CampoVisitaExterna valor=\{state\.externa\} sugestao=\{sugestaoExterna\}/.test(agenda) && /sugerirVisitaExterna\(/.test(agenda), true);
  checar('Agenda: o save SEMPRE leva a chave externa', /externa: e\.externa,/.test(agenda), true);
  checar('Agenda: série compara "externa?" (vira campo de série)', /recorrenciaAte: a\.recorrenciaAte, externa: a\.externa/.test(agenda), true);

  const hoje = fonte('src/screens/HojeScreen.tsx');
  checar('Hoje: chip de clima na visita (não na feita)', /fase !== 'feita' \? \(\s*<ClimaDaVisita/.test(hoje), true);
  checar('Hoje: clientes lidos junto com a agenda (erro = erro da tela, não "sem localização")', /getClientes\(\),\s*\]\);/.test(hoje), true);

  const desk = fonte('src/screens/desktop/AgendaDesktopScreen.tsx');
  checar('Desktop: clima no detalhe da visita', /<ClimaDaVisita\s+visita=\{detalhe\}/.test(desk), true);
  checar('Desktop: "Serviço externo?" e Encaixe no formulário', /<CampoVisitaExterna/.test(desk) && /<SugestaoEncaixe/.test(desk), true);
  checar('Desktop: o save leva a chave externa', /externa: e\.externa,/.test(desk), true);

  const remarcar = fonte('src/services/remarcarVisita.ts');
  checar('remarcar série usa editarRecorrente "só esta"', /editarRecorrente\(v\.id, 'so_esta'/.test(remarcar), true);
  checar('remarcar guarda o "antes" para o Desfazer', /desfazerRemarcacao/.test(remarcar), true);

  const comp = fonte('src/components/clima/ClimaDaVisita.tsx');
  checar('ClimaDaVisita: folha só abre para quem pede remarcar', /onPress=\{podeRemarcar \?/.test(comp), true);
  checar('ClimaDaVisita: a mensagem leva os horários do Encaixe', /alternativas=\{alternativasDoEncaixe\(encaixe\)\}/.test(comp), true);

  const encaixe = fonte('src/components/agenda/SugestaoEncaixe.tsx');
  checar('SugestaoEncaixe: leitura que falhou DIZ isso (não "nenhum encaixe")', /resultado === 'erro'/.test(encaixe), true);

  const hook = fonte('src/hooks/useEncaixe.ts');
  checar('useEncaixe: catch vira \'erro\' (nunca fica carregando)', /\.catch\(\(\) => \{\s*if \(vivo\) setLeitura\('erro'\)/.test(hook), true);

  const card = fonte('src/components/agenda/ClimaProximasVisitas.tsx');
  checar('cartão do dia credita o MET uma vez', /\{ATRIBUICAO_CLIMA\}/.test(card), true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
if (falhas > 0) process.exit(1);
