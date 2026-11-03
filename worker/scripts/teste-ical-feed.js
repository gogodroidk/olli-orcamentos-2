/**
 * GET /ical/<token>.ics — não devolve calendário vazio quando a leitura falha
 * e não ecoa o token.     node scripts/teste-ical-feed.js
 */
import assert from 'node:assert/strict';
import {
  TEXTO_INDISPONIVEL,
  TEXTO_LINK_INVALIDO,
  acessoDoFeed,
  linhasDoFeed,
  renderAgendaIcal,
  tokenDoPath,
} from '../src/icalFeed.js';

const TOKEN = 'ab'.repeat(32);
const A = '00000000-0000-4000-8000-00000000000a';
const T = '00000000-0000-4000-8000-00000000000b';
const ORG = '10000000-0000-4000-8000-000000000001';
const OUTRO = '20000000-0000-4000-8000-000000000002';
const ENV = { SUPABASE_URL: 'https://exemplo.test', SUPABASE_SERVICE_ROLE_KEY: 'chave-de-teste' };
const PATH = `/ical/${TOKEN}.ics`;

assert.equal(tokenDoPath(PATH), TOKEN);
assert.equal(tokenDoPath('/ical/ABC.ics'), null);
assert.equal(tokenDoPath('/icalendar/x.ics'), null);
assert.equal(tokenDoPath(`/ical/${TOKEN}`), null);

function json(status, corpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return corpo;
    },
  };
}

function banco(partes) {
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(String(url));
    const auth = init?.headers?.Authorization;
    assert.equal(auth, `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`);
    const u = String(url);
    if (u.includes('/agenda_ical_assinaturas?')) return json(partes.feedStatus ?? 200, partes.feed);
    if (u.includes('/organizacao_membros?')) return json(200, partes.membros ?? []);
    if (u.includes('/organizacoes?')) return json(200, partes.orgs ?? []);
    if (u.includes('/agendamentos?')) return json(partes.agendaStatus ?? 200, partes.agenda ?? []);
    return json(500, { message: TOKEN });
  };
  return { fetchImpl, urls };
}

async function corpo(res) {
  return await res.text();
}

{
  const res = await renderAgendaIcal('/ical/curto.ics', ENV, async () => {
    throw new Error('nao devia buscar');
  });
  assert.equal(res.status, 404);
  assert.equal(await corpo(res), TEXTO_LINK_INVALIDO);
}

{
  const res = await renderAgendaIcal(PATH, {}, async () => {
    throw new Error('nao devia buscar');
  });
  assert.equal(res.status, 503);
  const texto = await corpo(res);
  assert.equal(texto, TEXTO_INDISPONIVEL);
  assert.equal(texto.includes(TOKEN), false);
}

{
  const { fetchImpl } = banco({ feed: [] });
  const res = await renderAgendaIcal(PATH, ENV, fetchImpl);
  assert.equal(res.status, 404);
  assert.equal(await corpo(res), TEXTO_LINK_INVALIDO);
}

{
  const { fetchImpl } = banco({ feed: [{ titular_id: 'nao-uuid', dono_id: A, escopo: 'equipe' }] });
  const res = await renderAgendaIcal(PATH, ENV, fetchImpl);
  assert.equal(res.status, 404);
}

{
  const { fetchImpl, urls } = banco({
    feed: [{ titular_id: A, dono_id: A, escopo: 'equipe' }],
    agenda: [],
  });
  const res = await renderAgendaIcal(PATH, ENV, fetchImpl);
  assert.equal(res.status, 200);
  const texto = await corpo(res);
  assert.match(texto, /BEGIN:VCALENDAR/);
  assert.equal(texto.includes('BEGIN:VEVENT'), false);
  assert.equal(texto.includes(TOKEN), false);
  assert.equal(res.headers.get('content-type'), 'text/calendar; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'private, max-age=900');
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
  assert.ok(urls.some((u) => u.includes('revogado_em=is.null') && u.includes(`token=eq.${TOKEN}`)));
  assert.ok(urls.some((u) => u.includes('/agendamentos?') && !u.includes('responsavel_id=')));
}

{
  const { fetchImpl } = banco({
    feed: [{ titular_id: T, dono_id: A, escopo: 'propria' }],
    membros: [{ org_id: ORG, user_id: T, papel: 'tecnico', ativo: true }],
    orgs: [{ id: ORG, owner_user_id: A }],
    agenda: [
      {
        id: 'meu',
        user_id: A,
        responsavel_id: T,
        titulo: 'Visita da Ana',
        cliente_nome: 'Clínica',
        inicio: '2026-11-01T13:00:00.000Z',
        fim: '2026-11-01T14:00:00.000Z',
        endereco: 'Rua A',
        status: 'agendado',
        observacao: 'Levar filtros',
      },
      {
        id: 'alheio',
        user_id: OUTRO,
        responsavel_id: T,
        titulo: 'Segredo alheio',
        inicio: '2026-11-01T15:00:00.000Z',
      },
    ],
  });
  const res = await renderAgendaIcal(PATH, ENV, fetchImpl);
  assert.equal(res.status, 200);
  const texto = await corpo(res);
  assert.match(texto, /Visita da Ana/);
  assert.equal(texto.includes('Segredo alheio'), false);
  assert.equal(texto.includes(TOKEN), false);
}

{
  const { fetchImpl, urls } = banco({
    feed: [{ titular_id: T, dono_id: A, escopo: 'propria' }],
    membros: [{ org_id: ORG, user_id: T, papel: 'tecnico', ativo: true }],
    orgs: [{ id: ORG, owner_user_id: A }],
    agenda: [],
  });
  await renderAgendaIcal(PATH, ENV, fetchImpl);
  assert.ok(urls.some((u) => u.includes(`responsavel_id=eq.${T}`)));
}

{
  const { fetchImpl } = banco({
    feed: [{ titular_id: T, dono_id: A, escopo: 'equipe' }],
    membros: [{ org_id: ORG, user_id: T, papel: 'tecnico', ativo: true }],
    orgs: [{ id: ORG, owner_user_id: A }],
    agenda: [{ id: 'meu', user_id: A, titulo: 'Nao publicar', inicio: '2026-08-20T13:00:00.000Z' }],
  });
  const res = await renderAgendaIcal(PATH, ENV, fetchImpl);
  assert.equal(res.status, 404);
  const texto = await corpo(res);
  assert.equal(texto, TEXTO_LINK_INVALIDO);
  assert.equal(texto.includes('Nao publicar'), false);
  assert.equal(texto.includes(TOKEN), false);
}

{
  const { fetchImpl } = banco({
    feed: [{ titular_id: A, dono_id: A, escopo: 'equipe' }],
    agenda: [{ id: 'x', user_id: OUTRO, titulo: 'Segredo alheio', inicio: '2026-08-20T13:00:00.000Z' }],
  });
  const res = await renderAgendaIcal(PATH, ENV, fetchImpl);
  assert.equal(res.status, 503);
  const texto = await corpo(res);
  assert.equal(texto, TEXTO_INDISPONIVEL);
  assert.equal(texto.includes('Segredo alheio'), false);
  assert.equal(texto.includes(TOKEN), false);
}

{
  const { fetchImpl } = banco({ feedStatus: 500, feed: { message: TOKEN } });
  const res = await renderAgendaIcal(PATH, ENV, fetchImpl);
  assert.equal(res.status, 503);
  const texto = await corpo(res);
  assert.equal(texto.includes(TOKEN), false);
}

{
  const { fetchImpl } = banco({ feed: { token: TOKEN } });
  const res = await renderAgendaIcal(PATH, ENV, fetchImpl);
  assert.equal(res.status, 503);
  assert.equal((await corpo(res)).includes(TOKEN), false);
}

assert.equal(acessoDoFeed(
  { titular_id: T, dono_id: A, escopo: 'equipe' },
  [{ org_id: ORG, user_id: T, papel: 'tecnico', ativo: true }],
  [{ id: ORG, owner_user_id: A }],
), false);
assert.equal(acessoDoFeed(
  { titular_id: A, dono_id: A, escopo: 'propria' },
  [],
  [],
), true);
assert.deepEqual(
  linhasDoFeed(
    [
      { user_id: A, excluido_em: null, responsavel_id: T, id: '1' },
      { user_id: OUTRO, excluido_em: null, responsavel_id: T, id: '2' },
      { user_id: A, excluido_em: '2026-01-01', responsavel_id: T, id: '3' },
    ],
    { dono_id: A, titular_id: T, escopo: 'propria' },
  ).map((r) => r.id),
  ['1'],
);

console.log('teste-ical-feed: ok');
