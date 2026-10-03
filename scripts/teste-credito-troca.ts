/**
 * Crédito de troca — worker (painel admin) + regras do app.
 *
 *     node scripts/teste-credito-troca.ts
 *
 * O SQL real (RLS, 1 por conta, guarda de nível/vigência, auditoria) é testado
 * em teste-credito-troca-sql.ts. Aqui: gates do painel (papel + MFA antes de
 * qualquer service-role), três estados da lista (falha ≠ vazio), URL assinada
 * só para a chave que vem do BANCO, mapeamento de erro da RPC, aviso por e-mail
 * best-effort (não desfaz a concessão), texto honesto (não promete cobrança nem
 * renovação), paridade dos tetos com a fonte e as regras puras do app.
 */
import { readFileSync } from 'node:fs';
import { handleAdmin } from '../worker/src/admin.js';
import {
  CREDITO_TROCA_MESES_MAX as MESES_WORKER,
  mesesSugeridos,
  montarEmailAprovado,
  validarDecisao,
} from '../worker/src/creditoTroca.js';
import { CREDITO_TROCA_MESES_MAX } from '../src/services/limitesComerciais.ts';
import {
  dataBrParaIso,
  interpretarPedidoTroca,
  mensagemErroTroca,
  pedidoVigente,
  resumoPedidoTroca,
  validarFormularioTroca,
  type PedidoTroca,
} from '../src/services/creditoTrocaRegras.ts';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

function token(aal: 'aal1' | 'aal2') {
  const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ aal, sub: '11111111-1111-4111-8111-111111111111' })}.x`;
}

const ADMIN = '11111111-1111-4111-8111-111111111111';
const PRESTADOR = '33333333-3333-4333-8333-333333333333';
const PEDIDO = '44444444-4444-4444-8444-444444444444';
const baseEnv: any = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_ANON_KEY: 'anon-publica',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secreta',
  ADMIN_EMAIL: 'admin@exemplo.com',
  ADMIN_RL: { limit: async () => ({ success: true }) },
};

console.log('\nCrédito de troca — paridade com a fonte');
checar('worker usa o mesmo teto de meses de limitesComerciais.ts', MESES_WORKER === CREDITO_TROCA_MESES_MAX);
const telaSrc = readFileSync('src/screens/VimDeOutroAppScreen.tsx', 'utf8');
const regrasSrc = readFileSync('src/services/creditoTrocaRegras.ts', 'utf8');
checar('tela não escreve o teto à mão (deriva de CREDITO_TROCA_MESES_MAX)', telaSrc.includes('CREDITO_TROCA_MESES_MAX') && !/até 3 meses/.test(telaSrc));
checar('regras não escrevem o teto à mão', !/até 3 meses/.test(regrasSrc));
checar('tela não fala em preço nem pagamento (não é venda)', !/R\$\s?\d/.test(telaSrc) && !/pagar agora|assinar agora|checkout/i.test(telaSrc));

console.log('\nCrédito de troca — regras puras do worker');
checar('decisão sem id é inválida', validarDecisao({ aprovar: true, meses: 1, motivo: 'ok ok' }).ok === false);
checar('aprovar com meses acima do teto é inválido', (validarDecisao({ id: PEDIDO, aprovar: true, meses: CREDITO_TROCA_MESES_MAX + 1, motivo: 'conferido' }) as any).erro === 'meses_invalidos');
checar('aprovar com meses fracionado é inválido', (validarDecisao({ id: PEDIDO, aprovar: true, meses: 1.5, motivo: 'conferido' }) as any).erro === 'meses_invalidos');
checar('recusar exige motivo', (validarDecisao({ id: PEDIDO, aprovar: false, motivo: ' ' }) as any).erro === 'motivo_invalido');
checar('aprovar não é implícito (precisa de boolean)', (validarDecisao({ id: PEDIDO, aprovar: 'sim', motivo: 'conferido' }) as any).erro === 'decisao_invalida');
const recusa = validarDecisao({ id: PEDIDO, aprovar: false, meses: 3, motivo: 'print ilegível' }) as any;
checar('recusa ignora meses', recusa.ok && recusa.meses === null);
const agora = Date.parse('2026-10-02T12:00:00-03:00');
checar('meses sugeridos: sem data = teto', mesesSugeridos(null, agora) === CREDITO_TROCA_MESES_MAX);
checar('meses sugeridos: vence em 20 dias = 1', mesesSugeridos('2026-10-22', agora) === 1);
checar('meses sugeridos: vence em 45 dias = 2', mesesSugeridos('2026-11-16', agora) === 2);
checar('meses sugeridos: vence em 1 ano = teto', mesesSugeridos('2027-10-01', agora) === CREDITO_TROCA_MESES_MAX);
checar('meses sugeridos: já vencido = 1 (o admin decide)', mesesSugeridos('2026-09-01', agora) === 1);

const email = montarEmailAprovado({ plano: 'pro', ate: '2027-01-02T15:00:00Z', appAnterior: 'App <b>X</b>' });
checar('e-mail diz a data do fim', email.texto.includes('02/01/2027'));
checar('e-mail não promete renovação/cobrança', /não há cobrança/i.test(email.texto) && /renovação automática/i.test(email.texto));
checar('e-mail escapa HTML do nome do app', email.html.includes('App &lt;b&gt;X&lt;/b&gt;') && !email.html.includes('<b>X</b>'));
checar('e-mail sem data final não inventa data', montarEmailAprovado({ plano: 'empresa', ate: null, appAnterior: 'Y' }).texto.includes('sem data para acabar'));
checar('e-mail sem data final não fala em fim do período', !/período acabar/i.test(montarEmailAprovado({ plano: 'empresa', ate: null, appAnterior: 'Y' }).texto));
checar('e-mail não promete voltar para o Grátis (pagante continua pagante)', !/Grátis/.test(email.texto) && !/Grátis/.test(email.html));
checar('e-mail com data avisa que o acesso termina sozinho', /termina sozinho/.test(email.texto));

// ─── rotas do painel com fetch simulado ─────────────────────────────────────
const originalFetch = globalThis.fetch;
type Chamada = { url: string; method: string; body?: any };
let chamadas: Chamada[] = [];
let modo: { lista?: number; rpc?: { status: number; body: any }; email?: boolean; pedidoChave?: string; sign?: number } = {};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method || 'GET';
  const body = init?.body ? (() => { try { return JSON.parse(String(init.body)); } catch { return init.body; } })() : undefined;
  chamadas.push({ url, method, body });
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: ADMIN, email: 'admin@exemplo.com' }), { status: 200 });
  if (url.includes('/auth/v1/admin/users?')) return new Response(JSON.stringify({ users: [{ id: PRESTADOR, email: 'prestador@exemplo.com' }] }), { status: 200 });
  if (url.includes(`/auth/v1/admin/users/${PRESTADOR}`)) return new Response(JSON.stringify({ id: PRESTADOR, email: 'prestador@exemplo.com' }), { status: 200 });
  if (url.includes('/rest/v1/creditos_troca?select=id,user_id')) {
    if (modo.lista && modo.lista !== 200) return new Response('{}', { status: modo.lista });
    return new Response(JSON.stringify([{ id: PEDIDO, user_id: PRESTADOR, app_anterior: 'Clima Bot', vence_em: null, status: 'pendente', criado_em: '2026-10-01T10:00:00Z' }]), { status: 200 });
  }
  if (url.includes('/rest/v1/creditos_troca?id=eq.') && method === 'GET') {
    return new Response(JSON.stringify([{ comprovante_chave: modo.pedidoChave ?? `olli-documentos/${PRESTADOR}/anexo/abc.jpg`, user_id: PRESTADOR }]), { status: 200 });
  }
  if (url.includes('/storage/v1/object/sign/')) {
    if (modo.sign && modo.sign !== 200) return new Response('{}', { status: modo.sign });
    return new Response(JSON.stringify({ signedURL: '/object/sign/olli-documentos/x.jpg?token=t' }), { status: 200 });
  }
  if (url.endsWith('/rest/v1/rpc/admin_decidir_credito_troca')) {
    const r = modo.rpc ?? { status: 200, body: null };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }
  if (url.startsWith('https://api.resend.com/')) return new Response(JSON.stringify({ id: 'em_1' }), { status: modo.email === false ? 500 : 200 });
  return new Response(JSON.stringify([]), { status: 200 });
}) as typeof fetch;

async function chamar(path: string, { aal = 'aal2', method = 'GET', body, env = baseEnv }: { aal?: 'aal1' | 'aal2'; method?: string; body?: unknown; env?: any } = {}) {
  const url = new URL(`https://api.exemplo/admin/api/${path}`);
  return handleAdmin(new Request(url, {
    method,
    headers: { Authorization: `Bearer ${token(aal)}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }), env, url);
}

const aprovado = {
  pedido: { id: PEDIDO, user_id: PRESTADOR, status: 'aprovado', app_anterior: 'Clima Bot', meses_concedidos: 3, concedido_ate: '2027-01-02T15:00:00Z', motivo_recusa: null },
  plano_efetivo_override: 'pro',
  override_ate: '2027-01-02T15:00:00Z',
};

try {
  console.log('\nCrédito de troca — rotas do painel');
  chamadas = [];
  const aal1 = await chamar('creditos-troca', { aal: 'aal1' });
  checar('lista exige MFA (AAL2)', aal1.status === 403 && chamadas.every((c) => !c.url.includes('/rest/v1/creditos_troca')));

  chamadas = [];
  const decAal1 = await chamar('creditos-troca/decidir', { aal: 'aal1', method: 'POST', body: { id: PEDIDO, aprovar: true, meses: 1, motivo: 'conferido' } });
  checar('decidir exige MFA e não chama a RPC', decAal1.status === 403 && !chamadas.some((c) => c.url.includes('admin_decidir_credito_troca')));

  modo = {};
  const lista = await chamar('creditos-troca?status=pendente');
  const listaJ: any = await lista.json();
  checar('lista traz pedidos com e-mail e meses sugeridos', lista.status === 200 && listaJ.pedidos?.[0]?.email === 'prestador@exemplo.com' && listaJ.pedidos[0].mesesSugeridos === CREDITO_TROCA_MESES_MAX && listaJ.mesesMax === CREDITO_TROCA_MESES_MAX);
  checar('filtro de status vai para a consulta', chamadas.some((c) => c.url.includes('status=eq.pendente')));

  modo = { lista: 500 };
  const listaFalha = await chamar('creditos-troca');
  const listaFalhaJ: any = await listaFalha.json();
  checar('falha de leitura = 503 indisponível, nunca lista vazia', listaFalha.status === 503 && listaFalhaJ.erro === 'credito_troca_indisponivel' && !('pedidos' in listaFalhaJ));
  modo = { lista: 404 };
  const semMig: any = await (await chamar('creditos-troca')).json();
  checar('tabela ausente = aviso de migration pendente', semMig.erro === 'credito_troca_sem_migration');

  modo = {};
  chamadas = [];
  const comp = await chamar(`creditos-troca/comprovante?id=${PEDIDO}`);
  const compJ: any = await comp.json();
  checar('comprovante devolve URL assinada absoluta de 5 min', comp.status === 200 && compJ.url.startsWith('https://projeto.supabase.co/storage/v1/object/sign/') && compJ.expiraEmSegundos === 300);
  checar('assinatura pede 300 s', chamadas.some((c) => c.url.includes('/storage/v1/object/sign/olli-documentos/') && c.body?.expiresIn === 300));
  modo = { pedidoChave: `olli-documentos/${ADMIN}/anexo/abc.jpg` };
  const compOutro = await chamar(`creditos-troca/comprovante?id=${PEDIDO}`);
  checar('chave fora da pasta do dono do pedido não é assinada', compOutro.status === 422);
  modo = { sign: 404 };
  const compSumiu: any = await (await chamar(`creditos-troca/comprovante?id=${PEDIDO}`)).json();
  checar('arquivo sumido = comprovante_ausente', compSumiu.erro === 'comprovante_ausente');
  modo = {};
  checar('comprovante sem id válido = 400', (await chamar('creditos-troca/comprovante?id=../x')).status === 400);

  console.log('\nCrédito de troca — decisão');
  chamadas = [];
  modo = { rpc: { status: 200, body: aprovado } };
  const dec = await chamar('creditos-troca/decidir', { env: { ...baseEnv, RESEND_API_KEY: 're_x' }, method: 'POST', body: { id: PEDIDO, aprovar: true, meses: 3, motivo: 'comprovante conferido', requestId: 'req-troca-0000000001' } });
  const decJ: any = await dec.json();
  const rpc = chamadas.find((c) => c.url.endsWith('admin_decidir_credito_troca'));
  checar('aprovar chama a RPC atômica com ator autenticado e papel', dec.status === 200 && rpc?.body?.p_actor === ADMIN && rpc?.body?.p_actor_role === 'owner' && rpc?.body?.p_meses === 3 && rpc?.body?.p_aprovar === true);
  checar('request_id do clique segue para a RPC (idempotência)', rpc?.body?.p_request_id === 'req-troca-0000000001');
  checar('aviso por e-mail sai com chave de idempotência do pedido', decJ.aviso?.email === 'enviado' && chamadas.some((c) => c.url.startsWith('https://api.resend.com/')));
  checar('marca o aviso no pedido', chamadas.some((c) => c.method === 'PATCH' && c.url.includes(`creditos_troca?id=eq.${PEDIDO}`) && c.body?.aviso_email_em));
  checar('resposta traz plano efetivo e data', decJ.planoEfetivo === 'pro' && decJ.acessoAte === '2027-01-02T15:00:00Z');

  chamadas = [];
  const decSemEmail: any = await (await chamar('creditos-troca/decidir', { env: { ...baseEnv, RESEND_API_KEY: '' }, method: 'POST', body: { id: PEDIDO, aprovar: true, meses: 3, motivo: 'conferido' } })).json();
  checar('e-mail desligado não desfaz a concessão', decSemEmail.ok === true && decSemEmail.aviso?.email === 'desligado');

  modo = { rpc: { status: 200, body: aprovado }, email: false };
  const decEmailFalho: any = await (await chamar('creditos-troca/decidir', { env: { ...baseEnv, RESEND_API_KEY: 're_x' }, method: 'POST', body: { id: PEDIDO, aprovar: true, meses: 3, motivo: 'conferido' } })).json();
  checar('e-mail recusado pelo provedor = aviso falha, concessão mantida', decEmailFalho.ok === true && decEmailFalho.aviso?.email === 'falha');

  chamadas = [];
  modo = { rpc: { status: 200, body: { ...aprovado, pedido: { ...aprovado.pedido, status: 'recusado', motivo_recusa: 'ilegível' }, plano_efetivo_override: null, override_ate: null } } };
  const recJ: any = await (await chamar('creditos-troca/decidir', { env: { ...baseEnv, RESEND_API_KEY: 're_x' }, method: 'POST', body: { id: PEDIDO, aprovar: false, motivo: 'ilegível' } })).json();
  checar('recusar não manda e-mail de aprovação', recJ.ok && recJ.aviso === null && !chamadas.some((c) => c.url.startsWith('https://api.resend.com/')));

  modo = { rpc: { status: 400, body: { code: 'P0001', message: 'pedido_ja_decidido' } } };
  const ja = await chamar('creditos-troca/decidir', { method: 'POST', body: { id: PEDIDO, aprovar: true, meses: 1, motivo: 'conferido' } });
  checar('pedido já decidido = 409 com código', ja.status === 409 && ((await ja.json()) as any).erro === 'pedido_ja_decidido');
  modo = { rpc: { status: 400, body: { code: 'P0001', message: 'autoaprovacao_proibida' } } };
  const auto = await chamar('creditos-troca/decidir', { method: 'POST', body: { id: PEDIDO, aprovar: true, meses: 1, motivo: 'conferido' } });
  checar('autoaprovação proibida = 403 com código', auto.status === 403 && ((await auto.json()) as any).erro === 'autoaprovacao_proibida');
  modo = { rpc: { status: 500, body: { message: 'boom' } } };
  const boom = await chamar('creditos-troca/decidir', { method: 'POST', body: { id: PEDIDO, aprovar: true, meses: 1, motivo: 'conferido' } });
  checar('falha desconhecida = 502 (sem fingir sucesso)', boom.status === 502);
  chamadas = [];
  const invalido = await chamar('creditos-troca/decidir', { method: 'POST', body: { id: PEDIDO, aprovar: true, meses: 9, motivo: 'conferido' } });
  checar('meses fora do teto barra antes da RPC', invalido.status === 400 && !chamadas.some((c) => c.url.includes('admin_decidir_credito_troca')));

  const html = await (await handleAdmin(new Request('https://api.exemplo/admin'), baseEnv, new URL('https://api.exemplo/admin'))).text();
  checar('painel tem a seção de crédito de troca', html.includes('id="v-troca"') && html.includes('function renderTroca()') && html.includes("api('creditos-troca'"));
  // O teto chega pelo CFG (vindo de CREDITO_TROCA_MESES_MAX) e é atualizado pela resposta da API.
  checar('painel deriva o teto do worker', html.includes(`"trocaMax":${CREDITO_TROCA_MESES_MAX}`) && html.includes('TROCA_MAX=CFG.trocaMax') && html.includes('TROCA_MAX=j.mesesMax||TROCA_MAX'));
} finally {
  globalThis.fetch = originalFetch;
}

console.log('\nCrédito de troca — regras do app');
const linha = { id: 'p1', status: 'aprovado', app_anterior: 'X', vence_em: null, meses_concedidos: 2, concedido_ate: '2027-01-02T15:00:00Z', motivo_recusa: null, criado_em: '2026-10-01T10:00:00Z' };
checar('interpreta linha válida', interpretarPedidoTroca(linha)?.mesesConcedidos === 2);
checar('linha com status estranho = null (vira "indisponível" na tela)', interpretarPedidoTroca({ ...linha, status: 'pago' }) === null);
const p = (status: PedidoTroca['status'], criadoEm: string): PedidoTroca => ({ id: status + criadoEm, status, appAnterior: 'X', venceEm: null, mesesConcedidos: null, concedidoAte: null, motivoRecusa: 'm', criadoEm });
checar('vigente: aprovado manda', pedidoVigente([p('recusado', '2026-10-03'), p('aprovado', '2026-10-01')])?.status === 'aprovado');
checar('vigente: pendente antes de recusado', pedidoVigente([p('recusado', '2026-10-03'), p('pendente', '2026-10-02')])?.status === 'pendente');
checar('vigente: recusado mais recente', pedidoVigente([p('recusado', '2026-10-01'), p('recusado', '2026-10-03')])?.criadoEm === '2026-10-03');
checar('vigente: nenhum = null', pedidoVigente([]) === null);
checar('data br → iso', dataBrParaIso('05/11/2026') === '2026-11-05');
checar('data br inválida', dataBrParaIso('31/02/2026') === null && dataBrParaIso('2026-11-05') === null);
checar('data vazia = sem data', dataBrParaIso('  ') === '');
const base = { appAnterior: 'Clima Bot', venceEm: '', observacao: '', temComprovante: true };
checar('formulário válido', validarFormularioTroca(base, '2026-10-02') === null);
checar('sem app', validarFormularioTroca({ ...base, appAnterior: ' ' }, '2026-10-02') !== null);
checar('sem comprovante', /print/.test(validarFormularioTroca({ ...base, temComprovante: false }, '2026-10-02') || ''));
checar('assinatura já vencida', /venceu/.test(validarFormularioTroca({ ...base, venceEm: '01/10/2026' }, '2026-10-02') || ''));
checar('erro conhecido da RPC vira texto claro', /uma vez por conta/.test(mensagemErroTroca({ message: 'credito_ja_usado' })));
checar('erro desconhecido diz que nada foi cobrado', /nada foi cobrado/.test(mensagemErroTroca(new Error('Failed to fetch'))));
checar('resumo sem pedido convida com o teto da fonte', resumoPedidoTroca(null).texto.includes(`até ${CREDITO_TROCA_MESES_MAX} meses`));
checar('resumo aprovado diz até quando e sem cobrança', /Pro liberado até .*Sem cobrança/.test(resumoPedidoTroca(interpretarPedidoTroca(linha)).texto));
checar('resumo recusado mostra o motivo', resumoPedidoTroca(p('recusado', '2026-10-01')).texto === 'Motivo: m');

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
