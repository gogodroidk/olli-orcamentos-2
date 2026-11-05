/**
 * Assinatura iCal da agenda — GET /ical/<token>.ics
 *
 * O Google Agenda, o calendário da Apple e o Outlook buscam este endereço
 * sozinhos. Não há OAuth: o token de 64 hex (gerado no banco por
 * `ativar_assinatura_ical`) é a credencial. Quem tem o link vê título, cliente,
 * endereço e observação dos compromissos daquele escopo.
 *
 * Falha de banco NÃO devolve calendário vazio: um VCALENDAR sem eventos apaga
 * a agenda já assinada. Link inválido, revogado ou de quem perdeu o acesso
 * responde o MESMO texto, sem dizer qual dos três foi.
 */

import { criarIcsAgenda } from '../../src/utils/icsAgenda.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[a-f0-9]{64}$/;

export const TEXTO_LINK_INVALIDO = 'Link inválido.';
export const TEXTO_INDISPONIVEL = 'Não consegui ler a agenda agora. O calendário que você já assinou não foi apagado.';

export function tokenDoPath(pathname) {
  const m = /^\/ical\/([a-f0-9]{64})\.ics$/.exec(String(pathname || ''));
  return m ? m[1] : null;
}

function uuidOk(valor) {
  return typeof valor === 'string' && UUID.test(valor);
}

/**
 * Segunda trava, além do filtro do PostgREST: linha de outro dono, da lixeira
 * ou fora do escopo não entra no arquivo.
 */
export function linhasDoFeed(linhas, feed) {
  if (!Array.isArray(linhas) || !feed) return [];
  return linhas.filter((r) => {
    if (!r || r.user_id !== feed.dono_id) return false;
    if (r.excluido_em) return false;
    if (feed.escopo === 'propria') return r.responsavel_id === feed.titular_id;
    if (feed.escopo === 'equipe') return true;
    return false;
  });
}

/** O titular ainda pode ver o que o link promete? Conta pessoal: titular = dono. */
export function acessoDoFeed(feed, membros, orgs) {
  if (!feed || !uuidOk(feed.titular_id) || !uuidOk(feed.dono_id)) return false;
  if (feed.escopo !== 'propria' && feed.escopo !== 'equipe') return false;
  if (feed.titular_id === feed.dono_id) return true;
  const orgIds = new Set(
    (Array.isArray(orgs) ? orgs : [])
      .filter((o) => o && o.owner_user_id === feed.dono_id && uuidOk(o.id))
      .map((o) => o.id),
  );
  const meu = (Array.isArray(membros) ? membros : []).find(
    (m) => m && m.user_id === feed.titular_id && m.ativo === true && orgIds.has(m.org_id),
  );
  if (!meu) return false;
  if (feed.escopo === 'equipe' && meu.papel === 'tecnico') return false;
  return true;
}

export function linhaParaEvento(r) {
  let excecoes;
  if (r.excecoes && typeof r.excecoes === 'object') excecoes = r.excecoes;
  return {
    id: String(r.id ?? ''),
    clienteNome: typeof r.cliente_nome === 'string' ? r.cliente_nome : '',
    titulo: typeof r.titulo === 'string' ? r.titulo : '',
    inicio: typeof r.inicio === 'string' ? r.inicio : '',
    fim: typeof r.fim === 'string' ? r.fim : undefined,
    endereco: typeof r.endereco === 'string' ? r.endereco : undefined,
    status: typeof r.status === 'string' ? r.status : undefined,
    observacao: typeof r.observacao === 'string' ? r.observacao : undefined,
    recorrencia: typeof r.recorrencia === 'string' ? r.recorrencia : undefined,
    recorrenciaAte: typeof r.recorrencia_ate === 'string' ? r.recorrencia_ate : undefined,
    excecoes,
    atualizadoEm: typeof r.atualizado_em === 'string' ? r.atualizado_em : undefined,
    excluidoEm: r.excluido_em ? String(r.excluido_em) : undefined,
  };
}

function respostaTexto(status, texto) {
  return new Response(texto, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function respostaIcs(corpo) {
  return new Response(corpo, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="agenda-olli.ics"',
      'Cache-Control': 'private, max-age=900',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function sbConfigurado(env) {
  return typeof env?.SUPABASE_URL === 'string' && env.SUPABASE_URL.startsWith('https://')
    && typeof env?.SUPABASE_SERVICE_ROLE_KEY === 'string' && env.SUPABASE_SERVICE_ROLE_KEY.length > 0;
}

async function sbGet(env, path, fetchImpl) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const resposta = await fetchImpl(`${base}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!resposta.ok) {
    const erro = new Error('ical_leitura');
    erro.status = resposta.status;
    throw erro;
  }
  const json = await resposta.json();
  if (!Array.isArray(json)) throw new Error('ical_leitura');
  return json;
}

export async function renderAgendaIcal(pathname, env, fetchImpl = globalThis.fetch) {
  const token = tokenDoPath(pathname);
  if (!token || !TOKEN.test(token)) return respostaTexto(404, TEXTO_LINK_INVALIDO);
  if (!sbConfigurado(env) || typeof fetchImpl !== 'function') return respostaTexto(503, TEXTO_INDISPONIVEL);

  try {
    const feeds = await sbGet(
      env,
      `agenda_ical_assinaturas?token=eq.${token}&revogado_em=is.null&select=titular_id,dono_id,escopo&limit=1`,
      fetchImpl,
    );
    const feed = feeds[0];
    if (!feed) return respostaTexto(404, TEXTO_LINK_INVALIDO);
    if (!uuidOk(feed.titular_id) || !uuidOk(feed.dono_id)) return respostaTexto(404, TEXTO_LINK_INVALIDO);

    const [membros, orgs] = await Promise.all([
      sbGet(
        env,
        `organizacao_membros?user_id=eq.${feed.titular_id}&ativo=eq.true&select=org_id,user_id,papel,ativo`,
        fetchImpl,
      ),
      sbGet(env, `organizacoes?owner_user_id=eq.${feed.dono_id}&select=id,owner_user_id`, fetchImpl),
    ]);
    if (!acessoDoFeed(feed, membros, orgs)) return respostaTexto(404, TEXTO_LINK_INVALIDO);

    const filtroResponsavel = feed.escopo === 'propria'
      ? `&responsavel_id=eq.${feed.titular_id}`
      : '';
    // O PostgREST corta a página (~1000). Pedir os mais antigos e deixar o
    // iCal jogar fora o que passou de 30 dias publicava calendário vazio — e
    // calendário vazio apaga a agenda já assinada. A janela é a mesma do arquivo:
    // de 31 dias atrás para a frente, mais as séries (o início delas é antigo).
    const diaCorte = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const linhas = await sbGet(
      env,
      'agendamentos?user_id=eq.' + feed.dono_id +
        '&excluido_em=is.null' +
        '&or=(inicio.gte.' + diaCorte + ',recorrencia.not.is.null)' +
        '&select=id,user_id,cliente_nome,titulo,inicio,fim,endereco,status,observacao,atualizado_em,responsavel_id,recorrencia,recorrencia_ate,excecoes' +
        filtroResponsavel +
        '&order=inicio.desc&limit=2000',
      fetchImpl,
    );
    const seguros = linhasDoFeed(linhas, feed);
    // Linha de outro dono e nenhuma nossa: não publico calendário vazio.
    // Vazio de verdade (zero linhas) é agenda sem compromisso. Vazio forçado
    // por lixo de outro tenant apagaria o calendário já assinado.
    const veioOutroDono = linhas.some((r) => r && r.user_id !== feed.dono_id);
    if (veioOutroDono && seguros.length === 0) return respostaTexto(503, TEXTO_INDISPONIVEL);
    const eventos = seguros.map(linhaParaEvento);
    const ics = criarIcsAgenda(eventos, { modo: 'agenda' });
    if (!ics || !ics.startsWith('BEGIN:VCALENDAR')) return respostaTexto(503, TEXTO_INDISPONIVEL);
    return respostaIcs(ics);
  } catch {
    // Sem o token e sem o corpo do PostgREST: os dois podem citar o segredo.
    return respostaTexto(503, TEXTO_INDISPONIVEL);
  }
}
