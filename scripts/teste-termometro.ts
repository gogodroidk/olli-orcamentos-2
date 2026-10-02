/**
 * Teste do TERMÔMETRO DO ORÇAMENTO + follow-up que lê o comportamento (frente I2).
 *
 *     node scripts/teste-termometro.ts
 * Exit 0 = passou; qualquer assert que falha derruba o processo.
 *
 * Protege:
 *  • a regra pura (src/services/termometroRegra.ts): quente/morno/frio com o porquê,
 *    a próxima ação na ordem certa, "sem link" ≠ "frio", quem abriu antes da medição
 *    não vira "não abriu", e as mensagens não contam ao cliente que ele foi medido;
 *  • o follow-up (followUpLembretesRegra.ts): texto pelo sinal, "vence amanhã" e
 *    nada de dois avisos do mesmo orçamento no mesmo minuto;
 *  • o aviso "Cliente abriu seu orçamento agora": só abertura recente, uma vez a
 *    cada 30 min por orçamento;
 *  • o Worker (worker/src/link.js): POST /o/<token>/sinal só aceita métrica
 *    (sem IP, sem user-agent), tem teto, diz quando está desligado; a página leva
 *    o script e o id do preço; a retenção roda 1x por dia;
 *  • a migration (RLS do dono, sem insert para usuário, Realtime, CHECKs);
 *  • a fiação (lista, detalhe, App, wrangler, plano).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ABERTURAS_QUENTE,
  avaliarTermometro,
  decidirAvisoAbertura,
  diasAteValidade,
  duracaoTexto,
  haQuanto,
  linhaDoResumo,
  mensagemDaAcao,
  normalizarInteracao,
  resumirInteracoes,
  type EntradaTermometro,
  type EstadoTermometro,
  type Interacao,
} from '../src/services/termometroRegra.ts';
import { planejarFollowUps, selecionarAvisosValidade } from '../src/services/followUpLembretesRegra.ts';
import { RECURSOS_EM_BREVE } from '../src/services/entitlements.ts';
import type { Orcamento } from '../src/types/index.ts';
import {
  TETO_SINAIS_POR_HORA,
  horaDeLimparSinais,
  lerSinal,
  limparEventosAntigos,
  registrarSinal,
  renderLinkPage,
  scriptSinais,
} from '../worker/src/link.js';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

let oks = 0;
function ok(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  oks++;
  console.log(`  ok   ${msg}`);
}
function igual<T>(atual: T, esperado: T, msg: string): void {
  assert.deepEqual(atual, esperado, msg);
  oks++;
  console.log(`  ok   ${msg}`);
}

// Quinta-feira, 01/10/2026, meio-dia LOCAL.
const AGORA = new Date(2026, 9, 1, 12, 0, 0);
const haMin = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();
const haDias = (d: number) => new Date(AGORA.getTime() - d * 86_400_000).toISOString();
const ev = (tipo: Interacao['tipo'], em: string, sessao = 'aaaaaaaaaaaaaaaa', segundos: number | null = null): Interacao =>
  ({ tipo, em, sessao, segundos });

function entrada(extra: Partial<EntradaTermometro>): EntradaTermometro {
  return { status: 'enviado', temLink: true, enviadoEm: haDias(3), validaAte: '2026-10-20', interacoes: [], ...extra };
}
function medido(e: EstadoTermometro) {
  assert.equal(e.tipo, 'medido', 'esperava medido');
  return e as Extract<EstadoTermometro, { tipo: 'medido' }>;
}

console.log('\n1) regra pura: temperatura e porquê');
{
  igual(avaliarTermometro(entrada({ status: 'rascunho' }), AGORA).tipo, 'fora_do_funil', 'rascunho não tem termômetro');
  igual(avaliarTermometro(entrada({ status: 'aprovado' }), AGORA).tipo, 'fora_do_funil', 'aprovado não tem termômetro');
  igual(avaliarTermometro(entrada({ temLink: false }), AGORA).tipo, 'sem_link', 'sem link e sem sinal = sem_link (nunca "frio")');

  const frio = medido(avaliarTermometro(entrada({}), AGORA));
  igual(frio.temperatura, 'frio', 'link sem abertura = frio');
  igual(frio.porque, 'Ainda não abriu o link.', 'frio diz o porquê');
  igual(frio.acao.tipo, 'reenviar', 'não abriu há 3 dias → reenviar ou ligar');

  const recente = medido(avaliarTermometro(entrada({ enviadoEm: haMin(180) }), AGORA));
  igual(recente.acao.tipo, 'aguardar', 'enviado há 3 h e não abriu → aguardar');

  const tres = [ev('abertura', haDias(2), 's1'), ev('abertura', haDias(1), 's2'), ev('abertura', haMin(20), 's3')]
    .map((i, n) => ({ ...i, sessao: `${'0'.repeat(15)}${n}` }));
  const quente = medido(avaliarTermometro(entrada({ interacoes: tres }), AGORA));
  igual(quente.temperatura, 'quente', `${ABERTURAS_QUENTE} aberturas em 7 dias = quente`);
  ok(quente.porque.includes('3 vezes'), 'quente explica "Abriu 3 vezes nos últimos 7 dias"');

  const comPreco = [...tres, ev('preco_visto', haDias(2)), ev('preco_visto', haMin(25))];
  const parcelar = medido(avaliarTermometro(entrada({ interacoes: comPreco }), AGORA));
  igual(parcelar.acao.tipo, 'oferecer_parcelar', 'abriu 3x e voltou ao preço → oferecer parcelar');
  igual(parcelar.resumo.voltasPreco, 1, 'a 1ª vista do preço não é "volta"');

  const clicou = medido(avaliarTermometro(entrada({ interacoes: [ev('abertura', haDias(4)), ev('clique_aprovar', haDias(4))] }), AGORA));
  igual([clicou.temperatura, clicou.acao.tipo], ['quente', 'ajudar_fechar'], 'tocou em Aprovar e não concluiu → quente + ajudar a fechar');

  const morno = medido(avaliarTermometro(entrada({ interacoes: [ev('abertura', haDias(2))] }), AGORA));
  igual([morno.temperatura, morno.acao.tipo], ['morno', 'retomar'], 'abriu há 2 dias = morno → perguntar se pode ajudar');
  ok(morno.porque.startsWith('Abriu há 2 dias'), 'morno diz quando abriu');

  const esfriou = medido(avaliarTermometro(entrada({ interacoes: [ev('abertura', haDias(12))] }), AGORA));
  igual(esfriou.temperatura, 'frio', 'última abertura há 12 dias = frio');
  igual(esfriou.porque, 'Não abre o link há 12 dias.', 'frio por tempo diz há quantos dias');

  const leu = medido(avaliarTermometro(entrada({ interacoes: [ev('abertura', haMin(60)), ev('tempo', haMin(55), undefined, 140)] }), AGORA));
  igual(leu.temperatura, 'quente', 'abriu nas últimas 24 h e leu 2 min = quente');

  // Beacon de abertura perdido: a sessão com outros sinais conta como abertura.
  const semAbertura = resumirInteracoes([ev('preco_visto', haMin(10), 'bbbbbbbbbbbbbbbb')], AGORA);
  igual(semAbertura.aberturas, 1, 'sessão sem o evento de abertura ainda conta 1 abertura');

  // Abriu ANTES de o termômetro medir (status Visualizado, sem evento): nunca "não abriu".
  const antes = medido(avaliarTermometro(entrada({ status: 'visualizado', abriuAntes: true }), AGORA));
  igual([antes.temperatura, antes.acao.tipo], ['morno', 'retomar'], 'visualizado sem evento = morno, nunca "reenviar"');
  igual(linhaDoResumo(antes.resumo, AGORA), 'Abriu o link antes de o termômetro começar a medir', 'linha não inventa quantas vezes');
}

console.log('\n2) próxima ação: validade vem primeiro');
{
  const amanha = medido(avaliarTermometro(entrada({ validaAte: '2026-10-02', interacoes: [ev('abertura', haDias(1))] }), AGORA));
  igual(amanha.acao.tipo, 'lembrar_validade', 'vence amanhã → lembrar a validade');
  ok(amanha.acao.titulo.includes('amanhã'), 'título diz "amanhã"');
  const venceu = medido(avaliarTermometro(entrada({ validaAte: '2026-09-28' }), AGORA));
  igual(venceu.acao.tipo, 'renovar', 'vencida → oferecer proposta atualizada');
  igual(diasAteValidade('2026-10-01', AGORA), 0, 'hoje = 0 dias');
  igual(diasAteValidade('lixo', AGORA), null, 'validade ilegível = null');
}

console.log('\n3) textos curtos');
{
  igual(duracaoTexto(40), '40 s', '40 s');
  igual(duracaoTexto(100), '1 min 40 s', '1 min 40 s');
  igual(duracaoTexto(720), '12 min', '12 min');
  igual(haQuanto(haMin(20), AGORA), 'há 20 min', 'há 20 min');
  igual(haQuanto(haDias(1), AGORA), 'ontem', 'ontem');
  const r = resumirInteracoes([
    ev('abertura', haDias(1), '1111111111111111'), ev('abertura', haDias(1), '2222222222222222'),
    ev('abertura', haMin(20), '3333333333333333'), ev('preco_visto', haDias(1), '2222222222222222'), ev('preco_visto', haMin(19), '3333333333333333'),
    ev('preco_visto', haMin(18), '3333333333333333'), ev('tempo', haMin(15), '3333333333333333', 100),
  ], AGORA);
  igual(linhaDoResumo(r, AGORA), 'Abriu 3 vezes · a última há 20 min · voltou 2 vezes ao preço · 1 min 40 s na página', 'linha do resumo completa');
  igual(normalizarInteracao({ orcamento_id: 'o1', tipo: 'hack', criado_em: haMin(1) }), null, 'tipo desconhecido é descartado');
  igual(normalizarInteracao({ orcamento_id: 'o1', tipo: 'abertura', criado_em: haMin(1), segundos: 99 })?.segundos, null, 'segundos só em "tempo"');
}

console.log('\n4) mensagens de WhatsApp: falam do orçamento, nunca da medição');
{
  const orc = { clienteNome: 'Roberto Silva', numero: '01126', valorTotal: 850 };
  const textos = (['lembrar_validade', 'ajudar_fechar', 'oferecer_parcelar', 'reenviar'] as const)
    .map((t) => mensagemDaAcao(t, orc, { validaAte: '2026-10-02', contato: '(11) 99999-0000', agora: AGORA }) ?? '');
  ok(textos.every((t) => t.startsWith('Olá, Roberto!')), 'todas começam pelo primeiro nome');
  ok(textos.every((t) => t.includes('011/26') && /R\$\s?850,00/.test(t)), 'todas citam número legível e valor');
  ok(textos.every((t) => !/abriu|vezes|voltou|vi que|visualiz/i.test(t)), 'nenhuma conta ao cliente que ele foi medido');
  ok(textos[0].includes('até amanhã (02/10)'), 'vence amanhã cita a data');
  ok(textos[2].includes('parcelada'), 'parcelar oferece forma parcelada sem prometer juros/Pix');
  ok(textos.every((t) => t.endsWith('Contato: (11) 99999-0000')), 'contato no fim');
  igual(mensagemDaAcao('retomar', orc), null, 'retomar usa o texto de follow-up de sempre');
  igual(mensagemDaAcao('aguardar', orc), null, 'aguardar não tem mensagem');
}

console.log('\n5) "Cliente abriu seu orçamento agora"');
{
  const orc = { status: 'enviado' as const, clienteNome: 'Ana Paula', numero: '00726', valorTotal: 300 };
  const r1 = decidirAvisoAbertura({ orcamentoId: 'o1', tipo: 'abertura', em: haMin(1) }, orc, {}, AGORA);
  igual(r1.aviso?.titulo, 'Cliente abriu seu orçamento agora', 'abertura recente avisa');
  ok(r1.aviso?.corpo.includes('Ana está vendo o orçamento nº 007/26'), 'corpo com nome e número legível');
  const r2 = decidirAvisoAbertura({ orcamentoId: 'o1', tipo: 'abertura', em: haMin(0) }, orc, r1.ultimosAvisos, new Date(AGORA.getTime() + 10 * 60_000));
  igual(r2.aviso, null, 'mesmo orçamento não avisa de novo em 30 min');
  const r3 = decidirAvisoAbertura({ orcamentoId: 'o1', tipo: 'abertura', em: new Date(AGORA.getTime() + 40 * 60_000).toISOString() }, orc, r2.ultimosAvisos, new Date(AGORA.getTime() + 40 * 60_000));
  ok(r3.aviso !== null, 'depois de 30 min avisa de novo');
  igual(decidirAvisoAbertura({ orcamentoId: 'o2', tipo: 'abertura', em: haMin(30) }, orc, {}, AGORA).aviso, null, 'evento velho (reconexão) não vira "agora"');
  igual(decidirAvisoAbertura({ orcamentoId: 'o2', tipo: 'preco_visto', em: haMin(0) }, orc, {}, AGORA).aviso, null, 'só abertura avisa');
  igual(decidirAvisoAbertura({ orcamentoId: 'o2', tipo: 'abertura', em: haMin(0) }, { ...orc, status: 'aprovado' }, {}, AGORA).aviso, null, 'proposta já respondida não avisa');
  igual(decidirAvisoAbertura({ orcamentoId: 'o2', tipo: 'abertura', em: haMin(0) }, null, {}, AGORA).aviso, null, 'orçamento fora do aparelho não avisa');
}

console.log('\n6) follow-up que lê o comportamento');
{
  const SEM_DOMINGO = { domingoAtivo: false };
  const base = (id: string, extra: Partial<Orcamento>): Orcamento => ({
    id, numero: `00${id}26`, clienteId: 'c', clienteNome: `Cliente${id} Sobrenome`, valorTotal: 500,
    status: 'enviado', criadoEm: new Date(2026, 8, 30, 10).toISOString(), atualizadoEm: new Date(2026, 8, 30, 10).toISOString(),
    validadeOrcamento: '30/10/2026', itens: [],
  } as unknown as Orcamento);
  const o1 = base('1', {});
  const parcelar: EstadoTermometro = {
    tipo: 'medido', temperatura: 'quente', porque: 'x',
    resumo: { aberturas: 3, aberturas7d: 3, ultimaAbertura: haMin(5), segundos: 60, vistasPreco: 2, voltasPreco: 1, clicouAprovar: false, clicouPagar: false },
    acao: { tipo: 'oferecer_parcelar', titulo: 'Oferecer parcelar?', detalhe: 'x' },
  };
  const semSinal = planejarFollowUps([o1], [], AGORA, SEM_DOMINGO);
  ok(semSinal[0].corpo.includes('sem sinal de que o link foi aberto'), 'sem termômetro: texto de sempre');
  const comSinal = planejarFollowUps([o1], [], AGORA, SEM_DOMINGO, { sinais: new Map([['1', parcelar]]) });
  ok(comSinal[0].corpo.includes('abriu o orçamento 3 vezes e voltou ao preço') && comSinal[0].corpo.includes('oferecer parcelar'), 'com termômetro: "voltou ao preço → oferecer parcelar"');
  ok(comSinal[0].data.chave !== semSinal[0].data.chave, 'texto novo muda a chave (a reconciliação reagenda)');

  // Vence amanhã: validade 03/10 → aviso 02/10 às 09h, que é o MESMO alvo do D+2 do o2.
  const o2 = { ...base('2', {}), validadeOrcamento: '03/10/2026' } as Orcamento;
  const avisos = selecionarAvisosValidade([o2], [], AGORA, SEM_DOMINGO);
  igual(avisos.map((a) => [a.alvo.getDate(), a.alvo.getHours(), a.venceHoje]), [[2, 9, false]], 'vence 03/10 → aviso 02/10 09h "amanhã"');
  const plano = planejarFollowUps([o2], [], AGORA, SEM_DOMINGO, { avisoValidade: true });
  igual(plano.length, 1, 'D+2 no mesmo minuto do "vence amanhã" do mesmo orçamento: sai só um');
  igual(plano[0].titulo, 'Proposta vence amanhã', 'o que sai é o de validade');
  ok(plano[0].corpo.includes('nº 002/26') && plano[0].data.orcamentoId === '2', 'aviso de validade abre o orçamento');
  // Véspera já passou → "vence hoje" às 09h do último dia.
  const o3 = { ...base('3', {}), validadeOrcamento: '02/10/2026' } as Orcamento;
  const hoje = selecionarAvisosValidade([o3], [], new Date(2026, 9, 1, 10, 0), SEM_DOMINGO);
  igual(hoje.map((a) => [a.alvo.getDate(), a.venceHoje]), [[2, true]], 'véspera passou → "vence hoje" no dia');
  igual(selecionarAvisosValidade([{ ...o3, status: 'aprovado' } as Orcamento], [], AGORA, SEM_DOMINGO).length, 0, 'aprovado não recebe "vence amanhã"');
  igual(selecionarAvisosValidade([o3], [{ orcamentoId: '3', estornadoEm: undefined, excluidoEm: undefined }], AGORA, SEM_DOMINGO).length, 0, 'pago não recebe "vence amanhã"');
}

console.log('\n7) Worker: POST /o/<token>/sinal');
{
  const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
  const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srk-teste-123456' };
  const linha = {
    token: TOKEN, user_id: '11111111-2222-4333-8444-555555555555', orcamento_id: 'orc-1', status: 'enviado',
    cliente_nome: 'Maria', prestador_nome: 'Frio Bom', numero: '01126', valor_total: 350,
    dados: { numero: '011/26', clienteNome: 'Maria', valorTotal: 350, itens: [], prestador: { nome: 'Frio Bom' } },
  };
  type Fake = { contagem?: number; semTabela?: boolean };
  function fake(opts: Fake = {}) {
    const inserts: Record<string, unknown>[] = [];
    const deletes: string[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      const u = String(url);
      const metodo = init.method || 'GET';
      if (u.includes('/rpc/plano_comercial_para_usuario')) return Response.json('pro');
      if (u.includes('/eventos_orcamento_publico')) return metodo === 'POST' ? new Response('', { status: 201 }) : Response.json([{ id: 1 }]);
      if (u.includes('/orcamento_eventos')) {
        if (opts.semTabela) return new Response('{"code":"PGRST205"}', { status: 404 });
        if (metodo === 'POST') { inserts.push(JSON.parse(String(init.body))); return new Response('', { status: 201 }); }
        if (metodo === 'DELETE') { deletes.push(u); return new Response(null, { status: 204 }); }
        return Response.json(Array.from({ length: opts.contagem ?? 0 }, (_, i) => ({ id: i })));
      }
      if (u.includes('/orcamentos_publicos')) return Response.json([linha]);
      return new Response('nao esperado', { status: 500 });
    }) as typeof fetch;
    return { inserts, deletes };
  }
  const req = (corpo: unknown) => new Request(`https://link.exemplo/o/${TOKEN}/sinal`, {
    method: 'POST', headers: { 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'Mozilla/5.0 teste' },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });

  igual(lerSinal({ tipo: 'abertura', sessao: '0123456789abcdef' }), { tipo: 'abertura', sessao: '0123456789abcdef', segundos: null }, 'abertura válida');
  igual(lerSinal({ tipo: 'tempo', sessao: '0123456789abcdef', segundos: 99999 })?.segundos, 1800, '"tempo" tem teto de 30 min');
  igual(lerSinal({ tipo: 'abertura', sessao: 'João da Silva' }), null, 'sessão fora do formato (texto livre) é recusada');
  igual(lerSinal({ tipo: 'qualquer', sessao: '0123456789abcdef' }), null, 'tipo fora da lista é recusado');
  igual(lerSinal({ tipo: 'abertura', sessao: '0123456789abcdef', segundos: 50 })?.segundos, null, 'segundos só em "tempo"');

  let f = fake();
  let r = await registrarSinal(TOKEN, req({ tipo: 'abertura', sessao: '0123456789abcdef', ip: '1.2.3.4', email: 'x@y.z' }), ENV);
  igual(r.status, 204, 'sinal válido → 204');
  igual(f.inserts.length, 1, 'gravou 1 evento');
  igual(Object.keys(f.inserts[0]).sort(), ['orcamento_id', 'segundos', 'sessao', 'tipo', 'token', 'user_id'], 'grava SÓ métrica (sem ip, sem user-agent, sem campo extra)');
  igual([f.inserts[0].user_id, f.inserts[0].orcamento_id], [linha.user_id, 'orc-1'], 'dono e orçamento vêm da linha do link, não do corpo');

  f = fake();
  r = await registrarSinal(TOKEN, req('não é json'), ENV);
  igual([r.status, f.inserts.length], [400, 0], 'corpo inválido → 400 e nada gravado');
  r = await registrarSinal('curto', req({ tipo: 'abertura', sessao: '0123456789abcdef' }), ENV);
  igual(r.status, 400, 'token inválido → 400');

  f = fake({ contagem: TETO_SINAIS_POR_HORA + 1 });
  r = await registrarSinal(TOKEN, req({ tipo: 'preco_visto', sessao: '0123456789abcdef' }), ENV);
  igual([r.status, f.inserts.length], [429, 0], `teto de ${TETO_SINAIS_POR_HORA} eventos/hora por link`);

  f = fake({ semTabela: true });
  r = await registrarSinal(TOKEN, req({ tipo: 'abertura', sessao: '0123456789abcdef' }), ENV);
  igual(r.status, 503, 'sem a migration: 503 (desligado dizendo que está desligado)');
  igual((await r.json()).erro, 'termometro_indisponivel', 'erro honesto "termometro_indisponivel"');

  fake();
  const pagina = await renderLinkPage(TOKEN, ENV, new Request(`https://link.exemplo/o/${TOKEN}`));
  const html = await pagina.text();
  ok(html.includes('id="preco"'), 'a página marca o total com id="preco"');
  ok(html.includes("+ '/sinal'") && html.includes('navigator.sendBeacon'), 'a página manda os sinais por beacon para /sinal');
  ok(html.includes("window.olliSinal('clique_aprovar')"), 'tocar em Aprovar manda clique_aprovar');
  ok(html.includes("window.olliSinal('clique_pagar')"), 'copiar o Pix / "Já paguei" manda clique_pagar');
  const script = scriptSinais();
  ok(!/cookie|localStorage|userAgent|navigator\.language/.test(script), 'o script não lê cookie, user-agent nem idioma');
  ok(script.includes('sessionStorage') && script.includes('getRandomValues'), 'sessão aleatória só no sessionStorage da aba');

  igual(horaDeLimparSinais(new Date(Date.UTC(2026, 9, 1, 6, 17))), true, 'retenção roda às 06:17 UTC');
  igual(horaDeLimparSinais(new Date(Date.UTC(2026, 9, 1, 6, 18))), false, 'e só nesse minuto');
  f = fake();
  igual(await limparEventosAntigos(ENV, new Date(Date.UTC(2026, 9, 1, 6, 17))), true, 'apaga eventos antigos');
  ok(f.deletes.length === 1 && f.deletes[0].includes('criado_em=lt.2026-04-04'), 'apaga o que passou de 180 dias');
}

console.log('\n8) migration e fiação');
{
  const sql = ler('../supabase/migrations/20261003102000_orcamento_eventos.sql');
  ok(/enable row level security/.test(sql), 'RLS ligada');
  ok(/using \(user_id = \(select auth\.uid\(\)\)\)/.test(sql), 'SELECT só do dono (InitPlan)');
  ok(/grant select on public\.orcamento_eventos to authenticated/.test(sql) && !/grant (insert|update|delete|all)/i.test(sql), 'usuário só lê; ninguém além do service_role grava');
  ok(/on delete cascade/.test(sql), 'apagar o link apaga os eventos (cascade)');
  ok(/check \(tipo in \('abertura', 'tempo', 'preco_visto', 'clique_aprovar', 'clique_pagar'\)\)/.test(sql), 'CHECK de tipo');
  ok(/sessao ~ '\^\[0-9a-f\]\{16\}\$'/.test(sql), 'CHECK de sessão (não aceita texto livre)');
  ok(!/ip_hash|user_agent/.test(sql.replace(/--.*$/gm, '')), 'sem coluna de IP ou user-agent');
  ok(/alter publication supabase_realtime add table public\.orcamento_eventos/.test(sql), 'entra no Realtime (aviso com o app aberto)');

  const indice = ler('../worker/src/index.js');
  ok(/\\\/sinal\$/.test(indice) && indice.includes('registrarSinal('), 'index.js roteia POST /o/<token>/sinal');
  ok(indice.includes('limparEventosAntigos(env, agendado)'), 'cron chama a retenção');
  const wr = ler('../worker/wrangler.jsonc');
  ok((wr.match(/"SINAL_RL"/g) ?? []).length === 2, 'SINAL_RL nos dois ambientes (balde próprio, separado do LINK_RL)');

  const lista = ler('../src/screens/OrcamentosScreen.tsx');
  ok(lista.includes('<TermometroChip') && lista.includes("useRecursoPlano('termometro_orcamento')"), 'lista mostra o chip, com o gate do Pro');
  ok(lista.includes("termometro.estado === 'erro'"), 'lista diz quando não conseguiu ler (erro não vira vazio)');
  const detalhe = ler('../src/screens/VisualizarOrcamentoScreen.tsx');
  ok(detalhe.includes('<CartaoRecursoPlano recurso="termometro_orcamento" />'), 'detalhe mostra "Disponível no Pro" fora do plano');
  ok(detalhe.includes('id="orcamento.termometro"'), 'detalhe tem a dica da primeira vez');
  ok(detalhe.includes('<CartaoTermometro'), 'detalhe mostra o cartão do termômetro');
  const app = ler('../App.tsx');
  ok(app.includes('iniciarAvisoAberturaCliente()'), 'App liga o aviso "cliente abriu agora"');
  const followUp = ler('../src/services/followUpLembretes.ts');
  ok(followUp.includes('termometrosSeLiberado(orcamentos, agora)') && followUp.includes('avisoValidade: true'), 'follow-up usa o sinal e o "vence amanhã"');
  igual(RECURSOS_EM_BREVE.has('termometro_orcamento'), false, 'termômetro não é mais "em breve"');
  const pkg = JSON.parse(ler('../package.json'));
  ok(String(pkg.scripts.test).includes('npm run test:termometro'), 'teste registrado no "test" do package.json');
}

console.log(`\nteste-termometro: ${oks} ok`);
