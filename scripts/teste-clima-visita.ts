/**
 * Teste do "Chuva na Visita" (Onda I1, jogada 1).
 *
 *     node scripts/teste-clima-visita.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * `src/services/climaVisitaRegra.ts` só importa módulos sem runtime
 * (`climaTexto.ts`, `telefoneWhatsapp.ts`), então aqui há COMPORTAMENTO de
 * verdade: cruzar a hora da visita com a série do MET, o limite de chuva forte
 * (2 mm/h ou símbolo forte), o alerta oficial (laranja/vermelho), a sugestão de
 * remarcar só para serviço externo, a mensagem do WhatsApp — e a regra dura:
 * falha, hora sem dado, visita fora da janela e feed de alertas caído NUNCA
 * viram "sem chuva"/"sem alertas". As buscas no fonte dos componentes provam o
 * que só dá para provar lendo (atribuição na tela, helper único do WhatsApp,
 * fundação de motion).
 */
import { readFileSync } from 'node:fs';
import type { DadosClima, HoraChuva } from '../src/services/climaTexto.ts';
import {
  analisarClimaVisita,
  diaRelativo,
  mensagemRemarcarChuva,
  simboloEhChuvaForte,
  visitaPrecisaDeClima,
  whatsappRemarcarChuva,
  type AlertaOficial,
  type VisitaParaClima,
} from '../src/services/climaVisitaRegra.ts';

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

/** Série de 12h a partir das 14h local (como o worker monta), cruzando a meia-noite. */
function serie(mms: (number | null)[], simbolos: (string | null)[] = []): HoraChuva[] {
  return mms.map((mm, i) => {
    const t = new Date(Date.parse('2026-10-01T14:00:00-03:00') + i * 3_600_000 - 3 * 3_600_000);
    const iso = t.toISOString();
    return {
      inicio: iso.slice(0, 16),
      hora: iso.slice(11, 16),
      mm,
      simbolo: simbolos[i] !== undefined ? simbolos[i] : mm === null ? null : 'cloudy',
    };
  });
}

function clima(mms: (number | null)[], simbolos: (string | null)[] = []): DadosClima {
  return {
    ok: true,
    temperatura: 27,
    simbolo: 'cloudy',
    descricao: 'Nublado',
    ehDia: true,
    max: 30,
    min: 20,
    chuvaPorHora: serie(mms, simbolos),
    atualizadoEm: null,
    resumo: '',
    atribuicao: 'Previsão: MET Norway',
  };
}

const SECO = Array(12).fill(0) as number[];
function comHora(i: number, mm: number | null, base: (number | null)[] = SECO): (number | null)[] {
  const c = [...base];
  c[i] = mm;
  return c;
}

const COORD = { lat: -23.5505, lon: -46.6333 };
const visita15h: VisitaParaClima = { inicio: '2026-10-01T15:00:00-03:00', ...COORD, local: 'Jardim X' };
const externa15h: VisitaParaClima = { ...visita15h, externa: true };
const op = { agora: AGORA };

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) chuva forte: 2 mm/h ou símbolo forte/trovoada');
{
  const r = analisarClimaVisita(externa15h, clima(comHora(1, 2.5)), op);
  checar('2,5 mm às 15h → forte', r.nivel, 'forte');
  checar('texto com hora e bairro', r.texto, 'Chuva forte às 15h · Jardim X');
  checar('tom de chuva (sem alerta)', r.tom, 'chuva');
  checar('externa → sugere remarcar', r.sugerirRemarcar, true);
  checar('crédito CC BY 4.0', r.atribuicao, 'Previsão: MET Norway');
  checar('mm da hora decisiva', r.mm, 2.5);

  const interna = analisarClimaVisita(visita15h, clima(comHora(1, 2.5)), op);
  checar('não externa → não sugere remarcar', interna.sugerirRemarcar, false);

  checar('exatamente 2 mm/h já é forte', analisarClimaVisita(externa15h, clima(comHora(1, 2)), op).nivel, 'forte');
  const simb = SECO.map(() => 'cloudy') as string[];
  simb[1] = 'heavyrain';
  checar('símbolo heavyrain com 0,3 mm → forte', analisarClimaVisita(externa15h, clima(comHora(1, 0.3), simb), op).nivel, 'forte');
  simb[1] = 'rainandthunder';
  checar('trovoada → forte', analisarClimaVisita(externa15h, clima(comHora(1, 0.3), simb), op).nivel, 'forte');
  checar('simboloEhChuvaForte(heavyrainshowers_day)', simboloEhChuvaForte('heavyrainshowers_day'), true);
  checar('simboloEhChuvaForte(lightrain)', simboloEhChuvaForte('lightrain'), false);
  checar('simboloEhChuvaForte(null)', simboloEhChuvaForte(null), false);

  const limiar5 = analisarClimaVisita(externa15h, clima(comHora(1, 2.5)), { ...op, limiarForteMm: 5 });
  checar('limiar ajustável (5 mm): 2,5 mm vira "chuva"', limiar5.nivel, 'chuva');
  checar('…e não sugere remarcar', limiar5.sugerirRemarcar, false);
}

console.log('\n2) chuva comum, talvez, seco');
{
  const chuva = analisarClimaVisita(externa15h, clima(comHora(1, 1)), op);
  checar('1 mm → chuva', chuva.texto, 'Chuva prevista às 15h · Jardim X');
  checar('chuva comum não sugere remarcar', chuva.sugerirRemarcar, false);
  const talvez = analisarClimaVisita(visita15h, clima(comHora(1, 0.2)), op);
  checar('0,2 mm → pode chover', talvez.texto, 'Pode chover às 15h (0,2 mm) · Jardim X');
  const seco = analisarClimaVisita(visita15h, clima(SECO), op);
  checar('tudo 0 → sem chuva às 15h', seco.texto, 'Sem chuva prevista às 15h · Jardim X');
  checar('seco: tom neutro', seco.tom, 'neutro');
  checar('seco ainda credita o MET', seco.atribuicao, 'Previsão: MET Norway');
}

console.log('\n3) janela da visita: a pior hora manda');
{
  const longa: VisitaParaClima = { ...externa15h, fim: '2026-10-01T17:00:00-03:00' };
  const r = analisarClimaVisita(longa, clima(comHora(2, 3)), op);
  checar('chuva forte às 16h numa visita 15h–17h', r.texto, 'Chuva forte às 16h · Jardim X');
  const fora = analisarClimaVisita(visita15h, clima(comHora(4, 9)), op);
  checar('chuva às 18h não conta para visita 15h–16h', fora.texto, 'Sem chuva prevista às 15h · Jardim X');
  const andamento = analisarClimaVisita(
    { ...externa15h, inicio: '2026-10-01T13:30:00-03:00', fim: '2026-10-01T14:45:00-03:00' },
    clima(comHora(0, 4)),
    op,
  );
  checar('visita em andamento olha a hora corrente', andamento.nivel, 'forte');
}

console.log('\n4) REGRA DURA: "não sei" nunca vira "sem chuva"');
{
  const nulo = analisarClimaVisita(visita15h, clima(comHora(1, null)), op);
  checar('mm null → incerto', nulo.nivel, 'incerto');
  checar('texto de previsão incompleta', nulo.texto, 'Previsão incompleta para as 15h');
  checar('incerto: tom mudo', nulo.tom, 'mudo');

  const amanha = analisarClimaVisita({ ...visita15h, inicio: '2026-10-02T10:00:00-03:00' }, clima(SECO), op);
  checar('visita amanhã 10h → fora da janela', amanha.estado, 'fora_da_janela');
  checar('texto honesto da janela', amanha.texto, 'Previsão de chuva sai 12h antes da visita');
  checar('fora da janela não credita dado que não mostrou', amanha.atribuicao, null);

  // Série vai das 14h às 01h; visita 01h–03h: 01h seca, 02h fora da série.
  const borda = analisarClimaVisita(
    { ...visita15h, inicio: '2026-10-02T01:00:00-03:00', fim: '2026-10-02T03:00:00-03:00' },
    clima(SECO),
    op,
  );
  checar('janela meio coberta e seca → incerto (não "sem chuva")', borda.nivel, 'incerto');

  const vazia = analisarClimaVisita(visita15h, { ...clima(SECO), chuvaPorHora: [] }, op);
  checar('série vazia com visita em 1h → incerto (não "sai 12h antes")', vazia.nivel, 'incerto');
  checar('série vazia: texto de previsão incompleta', vazia.texto, 'Previsão incompleta para as 15h');
  const amanhaFalha = analisarClimaVisita({ ...visita15h, inicio: '2026-10-02T10:00:00-03:00' }, 'carregando', op);
  checar('fora da janela responde sem esperar o clima', amanhaFalha.estado, 'fora_da_janela');
  checar('visitaPrecisaDeClima: hoje 15h com coordenada', visitaPrecisaDeClima(visita15h, AGORA), true);
  checar('visitaPrecisaDeClima: amanhã 10h não gasta rede', visitaPrecisaDeClima({ ...visita15h, inicio: '2026-10-02T10:00:00-03:00' }, AGORA), false);
  checar('visitaPrecisaDeClima: sem coordenada não gasta rede', visitaPrecisaDeClima({ inicio: visita15h.inicio }, AGORA), false);
  checar('visitaPrecisaDeClima: passada não gasta rede', visitaPrecisaDeClima({ ...visita15h, inicio: '2026-10-01T09:00:00-03:00' }, AGORA), false);

  const falha = analisarClimaVisita(visita15h, { ok: false, motivo: 'clima_indisponivel' }, op);
  checar('falha → Clima indisponível', falha.texto, 'Clima indisponível');
  checar('falha → estado indisponivel', falha.estado, 'indisponivel');
  checar('falha não sugere remarcar sem alerta', falha.sugerirRemarcar, false);
  checar('offline diz offline', analisarClimaVisita(visita15h, { ok: false, motivo: 'offline' }, op).texto, 'Clima indisponível sem internet');
  checar('carregando', analisarClimaVisita(visita15h, 'carregando', op).texto, 'Carregando clima…');

  const semCoord = analisarClimaVisita({ inicio: visita15h.inicio }, clima(SECO), op);
  checar('sem coordenada → sem_local', semCoord.estado, 'sem_local');
  checar('sem coordenada diz isso', semCoord.texto, 'Clima: endereço do cliente sem localização');
  checar('0,0 não é coordenada', analisarClimaVisita({ ...visita15h, lat: 0, lon: 0 }, clima(SECO), op).estado, 'sem_local');

  const passada = analisarClimaVisita({ ...visita15h, inicio: '2026-10-01T09:00:00-03:00' }, clima(SECO), op);
  checar('visita já passada → passada (o chip não renderiza)', passada.estado, 'passada');
  checar('horário inválido → indisponível, não vazio', analisarClimaVisita({ ...visita15h, inicio: 'x' }, clima(SECO), op).texto.length > 0, true);
}

console.log('\n5) alertas oficiais');
{
  const tempestade: AlertaOficial = {
    fonte: 'INMET',
    evento: 'Tempestade',
    nivel: 'vermelho',
    inicio: '2026-10-01T12:00:00-03:00',
    fim: '2026-10-01T18:00:00-03:00',
  };
  const r = analisarClimaVisita(externa15h, clima(SECO), { ...op, alertas: { ok: true, alertas: [tempestade] } });
  checar('alerta cobre a visita', r.alerta?.evento, 'Tempestade');
  checar('texto do alerta', r.textoAlerta, 'Alerta INMET: tempestade até 18h');
  checar('vermelho → perigo', r.tom, 'perigo');
  checar('externa + alerta → remarcar mesmo com previsão seca', r.sugerirRemarcar, true);
  checar('crédito do MET e do alerta', r.atribuicao, 'Previsão: MET Norway · Alerta: INMET');
  checar('acessibilidade junta alerta e chuva', r.acessibilidade, 'Alerta INMET: tempestade até 18h. Sem chuva prevista às 15h · Jardim X');

  const amarelo = analisarClimaVisita(visita15h, clima(SECO), {
    ...op,
    alertas: { ok: true, alertas: [{ ...tempestade, nivel: 'amarelo', fonte: 'Defesa Civil', evento: 'Chuvas intensas' }] },
  });
  checar('amarelo → aviso (laranja)', amarelo.tom, 'aviso');
  checar('não externa + alerta → não sugere', amarelo.sugerirRemarcar, false);

  const umidade = analisarClimaVisita(externa15h, clima(SECO), {
    ...op,
    alertas: { ok: true, alertas: [{ ...tempestade, nivel: 'laranja', evento: 'Baixa Umidade' }] },
  });
  checar('alerta de baixa umidade aparece no chip', umidade.textoAlerta, 'Alerta INMET: baixa umidade até 18h');
  checar('…mas não pede remarcar serviço externo', umidade.sugerirRemarcar, false);
  const calorVermelho = analisarClimaVisita(externa15h, clima(SECO), {
    ...op,
    alertas: { ok: true, alertas: [{ ...tempestade, evento: 'Onda de Calor' }] },
  });
  checar('alerta vermelho (grande perigo) sempre pede remarcar', calorVermelho.sugerirRemarcar, true);

  const depois = analisarClimaVisita(visita15h, clima(SECO), {
    ...op,
    alertas: { ok: true, alertas: [{ ...tempestade, inicio: '2026-10-01T19:00:00-03:00', fim: '2026-10-01T23:00:00-03:00' }] },
  });
  checar('alerta fora do horário da visita não conta', depois.alerta, null);

  const outroDia = analisarClimaVisita(visita15h, clima(SECO), {
    ...op,
    alertas: { ok: true, alertas: [{ ...tempestade, fim: '2026-10-02T06:00:00-03:00' }] },
  });
  checar('fim em outro dia leva a data', outroDia.textoAlerta, 'Alerta INMET: tempestade até 02/10 6h');

  const dois = analisarClimaVisita(visita15h, clima(SECO), {
    ...op,
    alertas: { ok: true, alertas: [{ ...tempestade, nivel: 'amarelo' }, { ...tempestade, nivel: 'vermelho', evento: 'Vendaval' }] },
  });
  checar('o mais grave vence', dois.alerta?.evento, 'Vendaval');

  const caido = analisarClimaVisita(visita15h, clima(SECO), { ...op, alertas: { ok: false, motivo: 'indisponivel' } });
  checar('feed caído → alertasIndisponiveis', caido.alertasIndisponiveis, true);
  checar('feed caído aparece na acessibilidade', caido.acessibilidade.includes('Alertas oficiais indisponíveis'), true);
  checar('feed não ligado (undefined) não afirma nada', analisarClimaVisita(visita15h, clima(SECO), op).alertasIndisponiveis, false);
  checar('nenhum texto diz "sem alerta"', /sem alerta/i.test(JSON.stringify([r, amarelo, depois, caido])), false);

  const alertaSemClima = analisarClimaVisita(externa15h, { ok: false, motivo: 'offline' }, {
    ...op,
    alertas: { ok: true, alertas: [tempestade] },
  });
  checar('clima caído + alerta: o alerta ainda aparece', alertaSemClima.textoAlerta, 'Alerta INMET: tempestade até 18h');
  checar('…e ainda sugere remarcar', alertaSemClima.sugerirRemarcar, true);
}

console.log('\n6) WhatsApp de remarcação');
{
  const analise = analisarClimaVisita(externa15h, clima(comHora(1, 2.5)), op);
  const msg = mensagemRemarcarChuva({
    clienteNome: 'Maria Souza',
    empresaNome: 'Refrigeração Silva',
    servico: 'limpeza da condensadora',
    inicio: externa15h.inicio,
    analise,
    agora: AGORA,
  });
  checar('saudação pelo primeiro nome', msg.startsWith('Olá, Maria! Aqui é da Refrigeração Silva.'), true);
  checar('fala de chuva forte hoje às 15h', msg.includes('chuva forte para hoje às 15h'), true);
  checar('cita o serviço', msg.includes('(limpeza da condensadora)'), true);
  checar('não inventa probabilidade', /%|probabilidade/.test(msg), false);
  checar('pede novo horário', msg.endsWith('Qual dia e horário ficam bons para você?'), true);

  const comAlt = mensagemRemarcarChuva({ inicio: externa15h.inicio, analise, alternativas: ['sexta, 02/10 às 9h', 'sábado, 03/10 às 10h'], agora: AGORA });
  checar('sem nome → Olá!', comAlt.startsWith('Olá! A previsão'), true);
  checar('oferece as alternativas', comAlt.includes('Tenho estes horários: sexta, 02/10 às 9h; sábado, 03/10 às 10h.'), true);

  const alerta = analisarClimaVisita(externa15h, clima(SECO), {
    ...op,
    alertas: {
      ok: true,
      alertas: [{ fonte: 'INMET', evento: 'Tempestade', nivel: 'laranja', inicio: '2026-10-01T12:00:00-03:00', fim: null }],
    },
  });
  checar('alerta sem fim: texto sem "até"', alerta.textoAlerta, 'Alerta INMET: tempestade');
  const msgAlerta = mensagemRemarcarChuva({ inicio: externa15h.inicio, analise: alerta, agora: AGORA });
  checar('mensagem cita o alerta oficial', msgAlerta.includes('alerta oficial do INMET de tempestade'), true);

  const ok = whatsappRemarcarChuva('(51) 99876-5432', 'oi');
  checar('número BR pela regra única (DDD 55 vira 5551…)', ok.link, 'https://api.whatsapp.com/send?phone=5551998765432&text=oi');
  checar('temNumero', ok.temNumero, true);
  const sem = whatsappRemarcarChuva('123', 'oi');
  checar('número inválido → seletor de contato', sem.link, 'https://wa.me/?text=oi');
  checar('…e a folha sabe que não tem número', sem.temNumero, false);

  checar('diaRelativo amanhã', diaRelativo('2026-10-02T09:00:00-03:00', AGORA), 'amanhã');
  checar('diaRelativo com dia da semana', diaRelativo('2026-10-06T09:00:00-03:00', AGORA), 'terça, 06/10');
  checar('diaRelativo vira o dia no fuso de Brasília', diaRelativo('2026-10-02T01:00:00Z', AGORA), 'hoje');
}

console.log('\n7) componentes: crédito, helper único, motion');
{
  const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const chip = semComentario(readFileSync(new URL('../src/components/clima/ClimaVisitaChip.tsx', import.meta.url), 'utf8'));
  const folha = semComentario(readFileSync(new URL('../src/components/clima/FolhaRemarcarChuva.tsx', import.meta.url), 'utf8'));
  const servico = semComentario(readFileSync(new URL('../src/services/climaVisita.ts', import.meta.url), 'utf8'));
  checar('chip mostra a atribuição', chip.includes('analise.atribuicao'), true);
  checar('chip mostra "Alertas oficiais indisponíveis"', chip.includes('Alertas oficiais indisponíveis'), true);
  checar('chip usa a fundação de motion', /from '\.\.\/motion'/.test(chip) && chip.includes('<Aparecer'), true);
  checar('folha abre o WhatsApp pelo helper (abrirWhatsApp)', folha.includes('abrirWhatsApp('), true);
  checar('folha não monta wa.me na mão', /wa\.me|api\.whatsapp/.test(folha), false);
  checar('folha mostra a atribuição', folha.includes('analise.atribuicao'), true);
  checar('serviço usa buscarClima de clima.ts', servico.includes("from './clima'") && servico.includes('buscarClima('), true);
  checar('serviço não chama o MET direto', /api\.met\.no/.test(servico), false);
}

console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
