/**
 * Agenda em iCalendar (arquivo .ics e link de assinatura), sem OAuth.
 *     node scripts/teste-agenda-ical.ts
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { criarIcsAgendamento } from '../webapp/src/pages/olli/agenda/googleAgenda.ts';
import {
  ativarAssinaturaIcal,
  classificarErroAssinatura,
  lerRespostaAssinatura,
  revogarAssinaturaIcal,
  type ClienteRpcIcal,
} from '../src/utils/assinaturaIcal.ts';
import { criarIcsAgenda, semHoraBrasil, urlsAssinaturaIcal, type EventoIcs } from '../src/utils/icsAgenda.ts';

const AGORA = new Date('2026-08-20T15:00:00.000Z');
const TOKEN = 'ab'.repeat(32);

function desdobrar(ics: string): string {
  return ics.replace(/\r\n /g, '');
}

const visita: EventoIcs = {
  id: 'ag-123',
  clienteNome: 'Clínica São José',
  titulo: 'Manutenção preventiva',
  inicio: '2026-08-20T13:00:00.000Z',
  fim: '2026-08-20T14:30:00.000Z',
  endereco: 'Rua A, 10',
  status: 'agendado',
  observacao: 'Levar filtros; confirmar acesso.',
  atualizadoEm: '2026-08-19T12:00:00.000Z',
};

const icsUm = criarIcsAgenda([visita], { modo: 'evento', forcarSemHora: false, agora: AGORA });
assert.ok(icsUm);
assert.match(icsUm, /BEGIN:VCALENDAR\r\n/);
assert.match(icsUm, /PRODID:-\/\/OLLI Orcamentos\/\/Agenda\/\/PT-BR/);
assert.match(icsUm, /UID:ag-123@olliorcamentos\.online/);
assert.match(icsUm, /DTSTART:20260820T130000Z/);
assert.match(icsUm, /DTEND:20260820T143000Z/);
assert.match(desdobrar(icsUm), /Levar filtros\\; confirmar acesso\./);
assert.match(icsUm, /Criado no OLLI Orçamentos\./);
assert.doesNotMatch(icsUm, /X-WR-CALNAME/);
assert.doesNotMatch(icsUm, /BEGIN:VCALENDAR[\s\S]*https:\/\//);
assert.equal(icsUm.split('\r\n').some((l) => l.includes('\n')), false);
assert.match(criarIcsAgendamento({ ...visita, tipo: 'manutencao', criadoEm: visita.atualizadoEm ?? '' }, false) ?? '', /UID:ag-123@olliorcamentos\.online/);

const meiaNoite = { ...visita, id: 'dia', inicio: '2026-08-20T03:00:00.000Z', fim: undefined };
assert.equal(semHoraBrasil(meiaNoite), true);
const dia = criarIcsAgenda([meiaNoite], { modo: 'agenda', agora: AGORA });
assert.match(dia!, /DTSTART;VALUE=DATE:20260820/);
assert.match(dia!, /DTEND;VALUE=DATE:20260821/);
assert.match(dia!, /X-WR-CALNAME:Agenda OLLI/);
assert.match(dia!, /REFRESH-INTERVAL;VALUE=DURATION:PT1H/);
assert.match(desdobrar(dia!), /não volta para o OLLI/);

const noite = { ...visita, id: 'noite', inicio: '2026-08-21T02:00:00.000Z', fim: undefined };
assert.equal(semHoraBrasil(noite), false);
const noiteIcs = criarIcsAgenda([noite], { modo: 'agenda', agora: AGORA })!;
assert.match(noiteIcs, /DTSTART:20260821T020000Z/);
assert.match(noiteIcs, /DTEND:20260821T030000Z/);
assert.doesNotMatch(noiteIcs, /VALUE=DATE:20260821/);
const noiteForcada = criarIcsAgenda([noite], { modo: 'evento', forcarSemHora: true, agora: AGORA })!;
assert.match(noiteForcada, /DTSTART;VALUE=DATE:20260820/);
const meiaForcadaComHora = criarIcsAgenda([meiaNoite], { modo: 'evento', forcarSemHora: false, agora: AGORA })!;
assert.match(meiaForcadaComHora, /DTSTART:20260820T030000Z/);
assert.doesNotMatch(meiaForcadaComHora, /VALUE=DATE/);

assert.equal(criarIcsAgenda([{ ...visita, inicio: 'inválido' }], { modo: 'evento' }), null);
assert.match(criarIcsAgenda([{ ...visita, inicio: 'inválido' }], { modo: 'agenda', agora: AGORA })!, /BEGIN:VCALENDAR/);
assert.doesNotMatch(criarIcsAgenda([{ ...visita, inicio: 'inválido' }], { modo: 'agenda', agora: AGORA })!, /BEGIN:VEVENT/);

const serie: EventoIcs = {
  ...visita,
  id: 'serie',
  recorrencia: 'semanal',
  recorrenciaAte: '2026-09-30',
  excecoes: {
    '2026-08-27': { cancelada: true },
    '2026-09-03': { titulo: 'Visita extra' },
    'lixo': { titulo: 'não entra' },
  },
};
const serieIcs = desdobrar(criarIcsAgenda([serie], { modo: 'agenda', agora: AGORA })!);
assert.match(serieIcs, /RRULE:FREQ=WEEKLY;UNTIL=20261001T025959Z/);
assert.match(serieIcs, /EXDATE:20260827T130000Z/);
assert.equal(serieIcs.match(/BEGIN:VEVENT/g)?.length, 2);
assert.match(serieIcs, /RECURRENCE-ID:20260903T130000Z/);
assert.match(serieIcs, /SUMMARY:Visita extra/);
assert.doesNotMatch(serieIcs, /não entra/);

const quinzena = criarIcsAgenda([{ ...visita, recorrencia: 'quinzenal' }], { modo: 'agenda', agora: AGORA })!;
assert.match(quinzena, /RRULE:FREQ=WEEKLY;INTERVAL=2/);
assert.match(criarIcsAgenda([{ ...visita, recorrencia: 'mensal' }], { modo: 'agenda', agora: AGORA })!, /RRULE:FREQ=MONTHLY\r\n/);
assert.match(criarIcsAgenda([{ ...visita, recorrencia: 'bimestral' }], { modo: 'agenda', agora: AGORA })!, /FREQ=MONTHLY;INTERVAL=2/);
assert.match(criarIcsAgenda([{ ...visita, recorrencia: 'trimestral' }], { modo: 'agenda', agora: AGORA })!, /FREQ=MONTHLY;INTERVAL=3/);
assert.match(criarIcsAgenda([{ ...visita, recorrencia: 'semestral' }], { modo: 'agenda', agora: AGORA })!, /FREQ=MONTHLY;INTERVAL=6/);
assert.match(criarIcsAgenda([{ ...visita, recorrencia: 'anual' }], { modo: 'agenda', agora: AGORA })!, /FREQ=YEARLY/);

const diaTodoSerie = criarIcsAgenda(
  [{ ...meiaNoite, recorrencia: 'mensal', recorrenciaAte: '2026-09-30', excecoes: { '2026-09-20': { status: 'cancelado' } } }],
  { modo: 'agenda', agora: AGORA },
)!;
assert.match(diaTodoSerie, /RRULE:FREQ=MONTHLY;UNTIL=20260930/);
assert.match(diaTodoSerie, /EXDATE;VALUE=DATE:20260920/);

const cancelada = criarIcsAgenda([{ ...serie, status: 'cancelado' }], { modo: 'agenda', agora: AGORA })!;
assert.match(cancelada, /STATUS:CANCELLED/);
assert.doesNotMatch(cancelada, /RRULE:/);
assert.equal(cancelada.match(/BEGIN:VEVENT/g)?.length, 1);

const semTitulo = criarIcsAgenda([{ id: 's', inicio: visita.inicio, fim: visita.fim }], { modo: 'evento', agora: AGORA })!;
assert.match(semTitulo, /SUMMARY:Compromisso OLLI/);
assert.doesNotMatch(semTitulo, /Telefone:/);
assert.match(semTitulo, /SEQUENCE:0\r\n/);
assert.match(criarIcsAgenda([visita], { modo: 'evento', agora: AGORA })!, new RegExp(`SEQUENCE:${Math.floor(Date.parse('2026-08-19T12:00:00.000Z') / 1000)}`));

const marca = 'FIM-DE-TEXTO-QUE-NAO-PODE-ENTRAR';
const longo = criarIcsAgenda([{ ...visita, observacao: `${'a'.repeat(1600)}${marca}` }], { modo: 'evento', agora: AGORA })!;
assert.doesNotMatch(desdobrar(longo), new RegExp(marca));
assert.match(desdobrar(longo), /…/);

const escapado = desdobrar(criarIcsAgenda([{ ...visita, observacao: 'a\\b,c;d' }], { modo: 'evento', agora: AGORA })!);
assert.ok(escapado.includes('a\\\\b\\,c\\;d'), escapado.slice(escapado.indexOf('DESCRIPTION'), escapado.indexOf('DESCRIPTION') + 180));
assert.ok(desdobrar(icsUm).includes('São José\\nLevar filtros\\; confirmar acesso.\\nCriado no OLLI'));

const velho: EventoIcs = { ...visita, id: 'velho', inicio: '2026-06-01T13:00:00.000Z', fim: '2026-06-01T14:00:00.000Z', recorrencia: undefined };
const recente: EventoIcs = { ...visita, id: 'recente', inicio: '2026-08-01T13:00:00.000Z', fim: '2026-08-01T14:00:00.000Z' };
const janela = criarIcsAgenda([velho, recente, { ...velho, id: 'serie-velha', recorrencia: 'anual' }], { modo: 'agenda', agora: AGORA })!;
assert.doesNotMatch(janela, /UID:velho@/);
assert.match(janela, /UID:recente@/);
assert.match(janela, /UID:serie-velha@/);
assert.doesNotMatch(criarIcsAgenda([{ ...visita, excluidoEm: '2026-08-01T00:00:00.000Z' }], { modo: 'agenda', agora: AGORA })!, /BEGIN:VEVENT/);

const muitos = Array.from({ length: 2001 }, (_, i) => ({ ...visita, id: `e${i}` }));
const teto = criarIcsAgenda(muitos, { modo: 'agenda', agora: AGORA })!;
assert.equal(teto.match(/BEGIN:VEVENT/g)?.length, 2000);

const base = 'https://link.olliorcamentos.online';
const urls = urlsAssinaturaIcal(`${base}/`, TOKEN);
assert.deepEqual(urls, {
  https: `${base}/ical/${TOKEN}.ics`,
  webcal: `webcal://link.olliorcamentos.online/ical/${TOKEN}.ics`,
});
assert.equal(urlsAssinaturaIcal('http://link.olliorcamentos.online', TOKEN), null);
assert.equal(urlsAssinaturaIcal('https://user:senha@link.olliorcamentos.online', TOKEN), null);
assert.equal(urlsAssinaturaIcal(`${base}?x=1`, TOKEN), null);
assert.equal(urlsAssinaturaIcal(`${base}#frag`, TOKEN), null);
assert.equal(urlsAssinaturaIcal(base, 'abc'), null);
assert.equal(urlsAssinaturaIcal(base, TOKEN.toUpperCase()), null);

assert.equal(classificarErroAssinatura('Could not find the function', 'PGRST202'), 'indisponivel');
assert.equal(classificarErroAssinatura('sem_acesso'), 'sem_acesso');
assert.equal(classificarErroAssinatura('sem_sessao'), 'sem_sessao');
assert.equal(classificarErroAssinatura('falhou'), 'erro');
assert.equal(lerRespostaAssinatura({ token: TOKEN, escopo: 'equipe' })?.escopo, 'equipe');
assert.equal(lerRespostaAssinatura({ token: 'curto', escopo: 'equipe' }), null);
assert.equal(lerRespostaAssinatura({ token: TOKEN, escopo: 'tudo' }), null);

function cliente(resposta: { data: unknown; error: { message?: string; code?: string } | null }, visto: { fn?: string; args?: Record<string, unknown> }): ClienteRpcIcal {
  return {
    rpc(fn, args) {
      visto.fn = fn;
      visto.args = args;
      return Promise.resolve(resposta);
    },
  };
}

const visto: { fn?: string; args?: Record<string, unknown> } = {};
const pronto = await ativarAssinaturaIcal(cliente({ data: { token: TOKEN, escopo: 'propria' }, error: null }, visto), base);
assert.equal(pronto.estado, 'pronto');
if (pronto.estado === 'pronto') assert.equal(pronto.https, `${base}/ical/${TOKEN}.ics`);
assert.equal(visto.fn, 'ativar_assinatura_ical');
assert.deepEqual(visto.args, {});
const comEscopo: typeof visto = {};
await ativarAssinaturaIcal(cliente({ data: { token: TOKEN, escopo: 'equipe' }, error: null }, comEscopo), base, 'equipe');
assert.deepEqual(comEscopo.args, { p_escopo: 'equipe' });
assert.equal((await ativarAssinaturaIcal(cliente({ data: null, error: { code: 'PGRST202', message: 'schema cache' } }, {}), base)).estado, 'indisponivel');
assert.equal((await revogarAssinaturaIcal(cliente({ data: null, error: { message: 'sem_acesso' } }, {}), 'equipe')), 'erro');
assert.equal((await revogarAssinaturaIcal(cliente({ data: { revogado: true }, error: null }, {}), 'propria')), 'ok');
assert.equal((await revogarAssinaturaIcal(cliente({ data: { revogado: false }, error: null }, {}), 'propria')), 'erro');

const google = readFileSync(new URL('../src/services/googleAgenda.ts', import.meta.url), 'utf8');
assert.match(google, /GOOGLE_AGENDA_NATIVO_HABILITADO = false/);
const sql = readFileSync(new URL('../supabase/migrations/20261103140000_agenda_ical_assinatura.sql', import.meta.url), 'utf8');
assert.match(sql, /grant select \(\s*id, titular_id, dono_id, escopo, revogado_em, criado_em, atualizado_em\s*\)/);
assert.doesNotMatch(sql, /grant select \([^)]*token/i);
assert.match(sql, /search_path = ''/);
assert.match(sql, /sem_acesso/);
const tela = readFileSync(new URL('../src/screens/AgendaScreen.tsx', import.meta.url), 'utf8');
assert.match(tela, /Levar para outro calendário/);
assert.match(tela, /FolhaCalendarioExterno/);
const web = readFileSync(new URL('../webapp/src/pages/olli/agenda/index.tsx', import.meta.url), 'utf8');
assert.match(web, /AssinaturaCalendario/);
const worker = readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');
assert.match(worker, /startsWith\('\/ical\/'\)/);
assert.match(worker, /renderAgendaIcal/);

console.log('teste-agenda-ical: ok');
