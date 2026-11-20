/**
 * Link público do cliente — OLLI.
 *
 * GET  /o/<token>  → página web (tema claro) onde o cliente vê o orçamento e
 *                    aprova / recusa / fala no WhatsApp. Sem login.
 * POST /o/<token>  → grava a resposta (aprovado/recusado) no Supabase.
 *
 * Segurança:
 *  - Lê/escreve em public.orcamentos_publicos via SERVICE_ROLE (a tabela tem RLS
 *    só para o dono autenticado; o cliente público NÃO consegue ler pela anon key).
 *  - O TOKEN (128 bits) é a única credencial — validado por formato + match exato.
 *  - TODO dado do usuário é escapado antes de entrar no HTML (anti-XSS).
 *
 * PAGAR COM PIX (depois de aprovado): a página mostra o Pix Copia e Cola (e o QR)
 * da chave do PRESTADOR com o valor do orçamento — pagamento do serviço dele, direto
 * na conta dele; o OLLI não intermedeia nem confirma dinheiro. O BR Code é montado
 * aqui pelo MESMO gerador do app (`src/utils/pixBrCode.ts`) e só aparece se passar
 * na conferência completa (EMV + CRC). "Já paguei" (POST acao=informar_pagamento)
 * só AVISA o prestador (carimba `pagamento_informado_em` + evento na trilha): quem
 * marca pago é ele, depois de ver o dinheiro no banco.
 *
 * O Pix aparece quando o CLIENTE aprovou aqui OU quando o PRESTADOR já fechou no app
 * (`dados.cobrarAgora`, gravado pelo app ao publicar). O valor é `dados.valorACobrar`
 * (entrada ou saldo, nunca acima do total); snapshot antigo sem o campo cobra o total;
 * `valorACobrar: null` (o app não soube quanto já foi pago) = sem Pix, nunca o total.
 * `#pagar` no fim do link rola até o bloco de pagamento. Proposta vencida não aceita
 * aprovação (409) e a página diz que venceu.
 *
 * PLANO DO DONO (Grátis ilimitado, 01/10/2026): a página lê o plano EFETIVO de quem
 * publicou o link (`plano_comercial_para_usuario`, a mesma RPC que a IA usa) e
 * decide duas coisas pela tabela única `src/services/entitlements.ts`:
 *  - o selo "Feito com OLLI" no rodapé — fica no Grátis e quando não deu para
 *    confirmar o plano (o lado seguro do "não sei" é o selo FICAR); some no Pro/Empresa;
 *  - o "Pagar com Pix" — é recurso do Pro (`link_pagamento`). No Grátis a página
 *    diz "combine a forma de pagamento" (o cliente final nunca vê paywall); quando a
 *    leitura do plano FALHA, diz que o pagamento não carregou e pede para recarregar —
 *    nunca mostra o Pix sem confirmar, nem finge que não existe.
 */
import { gerarPixCopiaECola, normalizarChavePix, pixCopiaEColaValido } from '../../src/utils/pixBrCode.ts';
import { FONTES_CSS } from './fontesProprias.js';
import { qrSvg } from '../../src/utils/qrcode.ts';
import { seloOlliHtml } from '../../src/utils/marcaOlli.ts';
import { RECURSO_REMOVE_MARCA, temAcessoRecurso } from '../../src/services/entitlements.ts';
import { corMarcaNoPapel } from '../../src/utils/coresMarca.ts';
import { linkWaMe, numeroWhatsAppBR } from './telefoneWhatsapp.js';

const ACCENT = '#0B6FCE';

// ─── helpers seguros ─────────────────────────────────────────
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBRL(v) {
  const n = Number(v) || 0;
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const intF = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}R$ ${intF},${dec}`;
}

function formatData(s) {
  if (!s) return '';
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // Fallback: tenta interpretar qualquer outro formato; senão, esconde o campo.
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  return '';
}

// O gerador real (novoToken em src/services/clienteLink.ts) produz 16 bytes
// aleatórios (128 bits) em base64url SEM padding = sempre 22 caracteres. O
// piso mínimo aqui precisa refletir isso: um token de 8 chars base64url tem
// só ~48 bits de entropia (força-bruta viável), então 8 era fraco demais para
// a única credencial deste endpoint público. Piso em 20 dá folga para
// variações de encoding sem abrir a porta para tokens curtos.
function validToken(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(t);
}

function safeHexColor(v, fallback = ACCENT) {
  const s = String(v ?? '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : fallback;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // Defesa em profundidade: mesmo com todo dado escapado, o CSP barra
      // exfiltração externa. A página usa <script>/<style> inline + Google Fonts.
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src https://olliorcamentos.online; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'",
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ─── acesso ao Supabase (service role; bypassa RLS) ──────────
function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

// Colunas explícitas (menor privilégio): só o que a página precisa — nunca
// puxa colunas internas futuras (custo, margem, observações) pra borda.
// `resposta_cliente` entra para reexibir ao cliente o motivo que ele deixou ao
// recusar (existe no schema base). NÃO pedimos `motivo_recusa` aqui de propósito:
// essa coluna vem na migration 20260708_portal_trilha e pode ainda não ter sido
// aplicada quando o worker subir — pedir uma coluna inexistente derruba a query
// inteira (PostgREST 400). O worker grava o motivo em AMBAS, então ler
// resposta_cliente já basta para a página.
// `user_id` (dono do link) entra para a página ler o PLANO de quem publicou: é ele
// que decide o selo "Feito com OLLI" e o "Pagar com Pix" (ver o topo do arquivo).
// A coluna existe desde o schema base (a RLS `orcamentos_publicos_owner` usa ela).
// `orcamento_id` (schema base) entra para o sinal do termômetro saber de qual
// orçamento do dono é a interação (POST /o/<token>/sinal); nunca vai para o HTML.
const SELECT_COLS = 'token,status,cliente_nome,prestador_nome,prestador_whatsapp,numero,valor_total,dados,resposta_cliente,user_id,orcamento_id';
// Coluna do "Já paguei" (migration 20260930120300_link_pagamento_informado.sql).
// Pedida numa 1ª tentativa; se o banco ainda não tem a coluna (PostgREST 400), a
// leitura cai para SELECT_COLS e a linha volta marcada `_semPagamentoInformado` —
// a página então NÃO mostra o botão "Já paguei" (desligado dizendo que está
// desligado, nunca um botão que finge funcionar).
const COL_PAGAMENTO = 'pagamento_informado_em';

/**
 * Uma linha pública viva. `revogado_em` é preenchido pelo gatilho do banco quando o
 * orçamento vai para a lixeira ou é excluído de vez (migration
 * 20260716_publicos_revogacao.sql). Sem este filtro, o link continuava servindo
 * nome do cliente, valor e itens — e aceitando aprovação — para sempre.
 *
 * ESTE é o único portão: renderLinkPage e responderLink passam os dois por aqui.
 * Retorna a linha, `null` se não existir, ou `{ error:true }` em falha de backend.
 */
async function getRow(env, token) {
  const buscar = (cols) =>
    fetch(
      `${env.SUPABASE_URL}/rest/v1/orcamentos_publicos?token=eq.${encodeURIComponent(token)}&revogado_em=is.null&select=${cols}&limit=1`,
      { headers: sbHeaders(env) },
    );
  try {
    let r = await buscar(`${SELECT_COLS},${COL_PAGAMENTO}`);
    let semColuna = false;
    if (r.status === 400) {
      r = await buscar(SELECT_COLS);
      semColuna = true;
    }
    if (!r.ok) return { error: true };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { error: true };
    if (!arr.length) return null;
    return semColuna ? { ...arr[0], _semPagamentoInformado: true } : arr[0];
  } catch {
    return { error: true };
  }
}

/**
 * Carimba o "Já paguei" do cliente. Só em link APROVADO (pelo cliente ou pelo
 * prestador, via `cobrarAgora`) e só na 1ª vez
 * (`pagamento_informado_em=is.null` na própria query: idempotente, sem corrida).
 * Retorna { error:true } em falha, ou { rows } (vazio = já avisado / não aprovado).
 */
async function patchPagamentoInformado(env, token, peloPrestador = false) {
  // Aprovado aqui pelo cliente, OU fechado pelo prestador no app (cobrarAgora) e sem
  // recusa registrada — a mesma condição que mostrou o Pix, repetida NA QUERY.
  const condicao = peloPrestador ? 'status=neq.recusado&dados->>cobrarAgora=eq.true' : 'status=eq.aprovado';
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orcamentos_publicos?token=eq.${encodeURIComponent(token)}&revogado_em=is.null&${condicao}&${COL_PAGAMENTO}=is.null`,
      {
        method: 'PATCH',
        headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ [COL_PAGAMENTO]: new Date().toISOString() }),
      },
    );
    if (!r.ok) return { error: true };
    const arr = await r.json().catch(() => []);
    return { rows: Array.isArray(arr) ? arr : [] };
  } catch {
    return { error: true };
  }
}

/**
 * Quanto o Pix desta página cobra. Três estados, nunca um chute:
 *  - snapshot ANTIGO (sem `valorACobrar`): o total, como sempre foi;
 *  - `valorACobrar` número: ele mesmo, com teto no total (entrada ou saldo); 0 = quitado;
 *  - `valorACobrar` presente mas não-número (`null`): o app NÃO SOUBE quanto já foi
 *    pago → `null` (sem Pix), em vez de cobrar o total de quem pagou a entrada.
 */
export function valorDoPix(dados, total) {
  const teto = Math.round((Number(total) || 0) * 100) / 100;
  if (!dados || typeof dados !== 'object' || !('valorACobrar' in dados)) return teto > 0 ? teto : 0;
  const v = dados.valorACobrar;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const c = Math.round(v * 100) / 100;
  if (!(c > 0) || !(teto > 0)) return 0;
  return Math.min(c, teto);
}

/**
 * Data de validade da proposta (DD/MM/AAAA do app ou ISO do painel) já passou?
 * Vale até o FIM do dia no horário de Brasília (UTC−3). Sem validade, ou num formato
 * que não dá para ler, NÃO vence (não bloqueia o cliente por um dado que não existe).
 */
export function validadeVencida(validade, agora = new Date()) {
  const s = String(validade ?? '').trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  let dia;
  let mes;
  let ano;
  if (m) {
    [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return false;
    [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  // 23:59:59 em Brasília = 02:59:59 UTC do dia seguinte.
  const fimDoDia = Date.UTC(ano, mes - 1, dia + 1, 2, 59, 59);
  return agora.getTime() > fimDoDia;
}

/**
 * O PRESTADOR já fechou o serviço no app e há valor a cobrar (`dados.cobrarAgora`): a
 * página pode cobrar mesmo sem o cliente ter tocado "Aprovar". É a MESMA condição do
 * filtro do PATCH de "Já paguei" (`patchPagamentoInformado`). Uma recusa registrada
 * aqui vence: a página nunca mostra Pix para quem recusou.
 */
function cobravelPeloPrestador(row, dados) {
  return !!dados && dados.cobrarAgora === true && row.status !== 'recusado';
}

/**
 * O PRESTADOR já fechou o serviço no app (status aprovado/convertido no snapshot), com
 * ou sem valor a cobrar. Sem isto, o orçamento fechado e QUITADO (`valorACobrar` 0) ou
 * cujo recebido o app não conseguiu ler (`valorACobrar` null → `cobrarAgora` false)
 * voltava a pedir "Aprovar" ao cliente — justamente o que o `statusApp` veio evitar.
 * O Pix continua decidido por `valorDoPix`; a recusa registrada aqui vence.
 */
function fechadoPeloPrestador(row, dados) {
  if (!dados || row.status === 'recusado') return false;
  return cobravelPeloPrestador(row, dados) || dados.statusApp === 'aprovado' || dados.statusApp === 'convertido';
}

/**
 * O Pix do PRESTADOR para esta página, ou `null`. Monta o BR Code com o valor a
 * cobrar (`valorDoPix`: entrada, saldo ou total) a partir de `dados.pix` (gravado pelo
 * app só com chave reconhecida) e RECONFERE tudo aqui: chave reconhecida, valor > 0 e
 * código aprovado na conferência EMV + CRC. Qualquer dúvida = sem Pix na página (nunca
 * um código que o banco recusa). O QR é opcional: se o texto não couber no gerador, a
 * página fica só com o copia e cola.
 */
export function pixDaPagina(dados, total, numero) {
  try {
    const p = dados && typeof dados.pix === 'object' && dados.pix ? dados.pix : null;
    if (!p || typeof p.chave !== 'string') return null;
    const chave = normalizarChavePix(p.chave);
    const valor = valorDoPix(dados, total);
    if (!chave || valor === null || !(valor > 0)) return null;
    const codigo = gerarPixCopiaECola({
      chave: chave.chave,
      valor,
      nome: typeof p.nome === 'string' ? p.nome : '',
      cidade: typeof p.cidade === 'string' ? p.cidade : '',
      txid: String(numero || ''),
    });
    if (!pixCopiaEColaValido(codigo)) return null;
    let svg = '';
    try {
      svg = qrSvg(codigo).replace('QR code do equipamento', 'QR code do Pix');
    } catch {
      svg = '';
    }
    return { codigo, svg, valor };
  } catch {
    return null;
  }
}

/**
 * Grava a resposta de forma ATÔMICA: o filtro `status=not.in.(aprovado,recusado)`
 * entra na própria query, então o UPDATE só afeta linhas ainda não respondidas
 * (first-writer-wins no Postgres — fecha a janela de corrida do read-then-write).
 * Retorna { error:true } em falha, ou { rows } (vazio = já respondido / inexistente).
 */
async function patchStatus(env, token, status, mensagem) {
  try {
    // Na recusa, o texto do cliente vira TANTO resposta_cliente (coluna que o app
    // já sincroniza) QUANTO motivo_recusa (coluna nova, semanticamente clara para
    // o painel). Na aprovação não há motivo → ambas ficam nulas.
    const patch = {
      status,
      resposta_cliente: mensagem ?? null,
      respondido_em: new Date().toISOString(),
    };
    if (status === 'recusado') patch.motivo_recusa = mensagem ?? null;

    const r = await fetch(
      // `revogado_em=is.null` também aqui: defesa em profundidade. getRow já barrou,
      // mas esta escrita não pode depender de quem a chamou ter checado.
      `${env.SUPABASE_URL}/rest/v1/orcamentos_publicos?token=eq.${encodeURIComponent(token)}&revogado_em=is.null&status=not.in.(aprovado,recusado)`,
      {
        method: 'PATCH',
        headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(patch),
      },
    );
    if (!r.ok) return { error: true };
    const arr = await r.json().catch(() => []);
    return { rows: Array.isArray(arr) ? arr : [] };
  } catch {
    return { error: true };
  }
}

// ─── TRILHA de eventos (LGPD-safe) ───────────────────────────
// Hash irreversível do IP: SHA-256(token || ':' || ip). NUNCA guardamos o IP cru.
// Salgado com o token → o mesmo IP em orçamentos diferentes gera hashes DIFERENTES
// (não dá para cruzar a navegação de uma pessoa entre links). Serve só para o dono
// distinguir "aberturas de origens diferentes" dentro de UM orçamento.
async function hashIp(token, ip) {
  try {
    const cripto = globalThis.crypto;
    if (!ip || !cripto || !cripto.subtle) return null;
    const dados = new TextEncoder().encode(`${token}:${ip}`);
    const buf = await cripto.subtle.digest('SHA-256', dados);
    const bytes = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
  } catch {
    return null;
  }
}

// Extrai da request o par (ip_hash, user_agent_curto) para enriquecer o evento.
// Tudo LGPD-safe: só o hash do IP (nunca o cru) e o UA truncado (não é fingerprint).
// `request` pode não existir (a rota GET hoje chama renderLinkPage sem ela) — nesse
// caso o evento é gravado sem enriquecimento (ip_hash/ua nulos), o que é aceitável.
async function contextoTrilha(token, request) {
  if (!request || !request.headers) return { ipHash: null, uaCurto: null };
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  const ipHash = await hashIp(token, ip);
  const uaCurto = ua ? String(ua).slice(0, 120) : null;
  return { ipHash, uaCurto };
}

/**
 * Já existe um evento 'visualizado' para este token HOJE (dedupe por dia, UTC)?
 * Evita poluir a trilha com uma linha a cada refresh. Em falha de backend retorna
 * `true` (fail-safe: prefere NÃO gravar duplicado a arriscar spam de linhas).
 */
async function visualizadoHoje(env, token) {
  try {
    // date_trunc('day', now()) em UTC: início do dia de hoje em ISO (só a data).
    const hojeUTC = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/eventos_orcamento_publico` +
        `?token=eq.${encodeURIComponent(token)}` +
        `&evento=eq.visualizado` +
        `&criado_em=gte.${encodeURIComponent(hojeUTC + 'T00:00:00Z')}` +
        `&select=id&limit=1`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return true; // fail-safe: não arrisca duplicar
    const arr = await r.json().catch(() => null);
    return Array.isArray(arr) ? arr.length > 0 : true;
  } catch {
    return true;
  }
}

/**
 * Carimba orcamentos_publicos.visualizado_em na PRIMEIRA vez que o cliente abre o
 * link (só grava quando ainda está NULL — filtro `visualizado_em=is.null` torna a
 * operação idempotente: aberturas seguintes não sobrescrevem o 1º carimbo). É o
 * dado denormalizado que o app lê (clienteLink) para promover enviado→visualizado
 * na "Trilha do cliente". Best-effort: nunca lança, nunca bloqueia a página.
 */
async function marcarVisualizadoEm(env, token) {
  try {
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/orcamentos_publicos` +
        `?token=eq.${encodeURIComponent(token)}` +
        `&revogado_em=is.null` +
        `&visualizado_em=is.null`,
      {
        method: 'PATCH',
        headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ visualizado_em: new Date().toISOString() }),
      },
    );
  } catch {
    // best-effort: a coluna pode ainda não existir (pré-migration) ou o backend
    // pode falhar — em nenhum caso a página do cliente pode cair por isso.
  }
}

/**
 * Grava UM evento na trilha (append-only). Nunca lança e nunca bloqueia o fluxo
 * principal: a trilha é observabilidade, não pode derrubar a página do cliente
 * nem a gravação da resposta. `motivo` só é relevante em 'recusado'.
 */
async function registrarEvento(env, token, evento, extra = {}) {
  try {
    const linha = {
      token,
      evento,
      motivo: extra.motivo ?? null,
      ip_hash: extra.ipHash ?? null,
      user_agent_curto: extra.uaCurto ?? null,
    };
    await fetch(`${env.SUPABASE_URL}/rest/v1/eventos_orcamento_publico`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(linha),
    });
  } catch {
    // trilha é best-effort: engolir qualquer erro
  }
}

// ─── SINAIS DE INTERAÇÃO — o TERMÔMETRO do orçamento ─────────
// POST /o/<token>/sinal  (navigator.sendBeacon da própria página do cliente)
//
// Só MÉTRICA de interação (migration 20261003102000_orcamento_eventos.sql): abriu,
// tempo visível, viu o preço, tocou em aprovar/pagar. Nada de IP (nem hash), nada
// de user-agent, nada de texto livre — o corpo aceito é {tipo, sessao, segundos}
// e qualquer outro campo é ignorado. `sessao` é aleatória, gerada na aba e só
// serve para "recarregar a página" não contar como nova abertura.
//
// Quem conta "abriu" é o JavaScript da página: o pré-visualizador do WhatsApp não
// executa script, então a prévia do link na conversa não vira abertura falsa.
//
// Nunca derruba nada: a página do cliente não espera esta resposta (beacon) e a
// gravação é best-effort. Resposta 204 quando aceitou; erros com código honesto.

export const TIPOS_SINAL = Object.freeze(['abertura', 'tempo', 'preco_visto', 'clique_aprovar', 'clique_pagar']);
const SESSAO_RE = /^[0-9a-f]{16}$/;
/** Teto de segundos de UM envio de 'tempo' (aba esquecida aberta não vira 8 horas). */
export const MAX_SEGUNDOS_POR_ENVIO = 1800;
/** Teto de eventos por link por hora: acima disso é robô ou bug, não cliente. */
export const TETO_SINAIS_POR_HORA = 120;
/** Eventos mais velhos que isto são apagados pelo job diário (LGPD: retenção). */
export const DIAS_RETENCAO_SINAIS = 180;

/**
 * Valida o corpo de um sinal. PURA. Devolve `{ tipo, sessao, segundos }` ou `null`
 * (corpo inválido). `segundos` só existe em 'tempo' (inteiro 1..1800, arredondado
 * e com teto); nos demais é sempre `null`, mesmo que o corpo mande outra coisa.
 */
export function lerSinal(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const tipo = typeof body.tipo === 'string' ? body.tipo : '';
  if (!TIPOS_SINAL.includes(tipo)) return null;
  const sessao = typeof body.sessao === 'string' && SESSAO_RE.test(body.sessao) ? body.sessao : null;
  if (!sessao) return null;
  let segundos = null;
  if (tipo === 'tempo') {
    const n = Number(body.segundos);
    if (!Number.isFinite(n) || n < 1) return null;
    segundos = Math.min(MAX_SEGUNDOS_POR_ENVIO, Math.round(n));
  }
  return { tipo, sessao, segundos };
}

/** Já passou do teto de eventos deste link na última hora? Falha de leitura = "sim" (não grava). */
async function sinaisDemaisNaUltimaHora(env, token, agora = new Date()) {
  try {
    const desde = new Date(agora.getTime() - 3_600_000).toISOString();
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orcamento_eventos` +
        `?token=eq.${encodeURIComponent(token)}` +
        `&criado_em=gte.${encodeURIComponent(desde)}` +
        `&select=id&limit=${TETO_SINAIS_POR_HORA + 1}`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return { erro: true, status: r.status };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { erro: true, status: 502 };
    return { erro: false, demais: arr.length > TETO_SINAIS_POR_HORA };
  } catch {
    return { erro: true, status: 503 };
  }
}

export async function registrarSinal(token, request, env) {
  if (!validToken(token)) return json({ ok: false, erro: 'token_invalido' }, 400);
  // Rate limit PRÓPRIO por IP (SINAL_RL), separado do LINK_RL: o beacon não pode
  // gastar a cota de quem vai tocar em "Aprovar" logo depois. Rota de métrica, não
  // de dinheiro: limiter indisponível deixa passar (o teto por link abaixo segura).
  if (env.SINAL_RL) {
    const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
    try {
      const { success } = await env.SINAL_RL.limit({ key: ip });
      if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
    } catch {
      // binding com problema: segue para o teto por link
    }
  }
  let body = null;
  try {
    const raw = await request.text();
    if (raw.length > 512) return json({ ok: false, erro: 'payload_grande' }, 413);
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  const sinal = lerSinal(body);
  if (!sinal) return json({ ok: false, erro: 'sinal_invalido' }, 400);

  const row = await getRow(env, token);
  if (row && row.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (!row) return json({ ok: false, erro: 'nao_encontrado' }, 404);
  if (!UUID_RE.test(String(row.user_id || '')) || !row.orcamento_id) {
    return json({ ok: false, erro: 'indisponivel' }, 503);
  }

  const teto = await sinaisDemaisNaUltimaHora(env, token);
  // Tabela ausente (migration não aplicada) ou backend fora: o termômetro está
  // DESLIGADO e a resposta diz isso — nunca finge que gravou.
  if (teto.erro) return json({ ok: false, erro: 'termometro_indisponivel' }, 503);
  if (teto.demais) return json({ ok: false, erro: 'muitos_sinais' }, 429);

  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/orcamento_eventos`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({
        token,
        user_id: row.user_id,
        orcamento_id: row.orcamento_id,
        tipo: sinal.tipo,
        sessao: sinal.sessao,
        segundos: sinal.segundos,
      }),
    });
    if (!r.ok) return json({ ok: false, erro: 'termometro_indisponivel' }, 503);
  } catch {
    return json({ ok: false, erro: 'termometro_indisponivel' }, 503);
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Retenção (LGPD): apaga eventos de interação com mais de 180 dias. Chamado pelo
 * cron de minuto, mas só age às 06:17 UTC (uma vez por dia). Best-effort: tabela
 * ausente ou backend fora = tenta no dia seguinte. Devolve se rodou.
 */
export function horaDeLimparSinais(agora) {
  return agora.getUTCHours() === 6 && agora.getUTCMinutes() === 17;
}

export async function limparEventosAntigos(env, agora = new Date()) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return false;
  if (!horaDeLimparSinais(agora)) return false;
  try {
    const limite = new Date(agora.getTime() - DIAS_RETENCAO_SINAIS * 86_400_000).toISOString();
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/orcamento_eventos?criado_em=lt.${encodeURIComponent(limite)}`,
      { method: 'DELETE', headers: sbHeaders(env, { Prefer: 'return=minimal' }) },
    );
    return r.ok;
  } catch {
    return false;
  }
}

// ─── POST /o/<token> — registra resposta do cliente ──────────
export async function responderLink(token, request, env) {
  if (!validToken(token)) return json({ ok: false, erro: 'token_invalido' }, 400);
  // Rate limit por IP: endpoint público sem login — barra abuso/brute-force.
  if (env.LINK_RL) {
    // Em produção a Cloudflare sempre injeta CF-Connecting-IP; o fallback garante
    // que mesmo sem o header o endpoint NUNCA fica 100% sem limite (degrada seguro).
    const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
    try {
      const { success } = await env.LINK_RL.limit({ key: ip });
      if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
    } catch {
      // binding ausente: não bloqueia
    }
  }
  // Rejeita payload grande ANTES de parsear (endpoint público sem login). Não
  // confia só no content-length: um POST em Transfer-Encoding: chunked não traz
  // esse header (Number(null)=0) e escaparia do teto. Lê o corpo cru, mede o
  // tamanho real e só então parseia — o cap vale mesmo sem content-length.
  let body = {};
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ ok: false, erro: 'payload_grande' }, 413);
    if (raw) body = JSON.parse(raw);
  } catch { /* corpo opcional / JSON inválido → segue com body vazio */ }
  if (body.acao === 'informar_pagamento') return informarPagamento(token, request, env);
  const acao = body.acao === 'recusar' ? 'recusado' : body.acao === 'aprovar' ? 'aprovado' : null;
  if (!acao) return json({ ok: false, erro: 'acao_invalida' }, 400);
  const mensagem = typeof body.mensagem === 'string' ? body.mensagem.slice(0, 500) : null;
  const row = await getRow(env, token);
  if (row && row.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (!row) return json({ ok: false, erro: 'nao_encontrado' }, 404);

  const dados = (row && typeof row.dados === 'object' && row.dados) ? row.dados : {};
  if (acao === 'aprovado' && dados.exibirAprovacao === false) {
    return json({ ok: false, erro: 'aprovacao_desativada' }, 403);
  }
  if (acao === 'recusado' && dados.exibirRecusa === false) {
    return json({ ok: false, erro: 'recusa_desativada' }, 403);
  }
  if (row.status === 'aprovado' || row.status === 'recusado') {
    return json({ ok: true, status: row.status, jaRespondido: true });
  }
  // Proposta vencida não se aprova: o preço e o prazo podem ter mudado. 409 (conflito
  // com o estado da proposta), e a página já mostra "proposta vencida".
  if (acao === 'aprovado' && validadeVencida(dados.validade)) {
    return json({ ok: false, erro: 'proposta_vencida' }, 409);
  }

  // Escrita atômica: só grava se ainda não foi respondido (first-writer-wins).
  const res = await patchStatus(env, token, acao, mensagem);
  if (res.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (res.rows.length) {
    // Resposta gravada com sucesso → registra o evento na trilha (best-effort,
    // não bloqueia a resposta ao cliente). O motivo só entra na recusa.
    const ctx = await contextoTrilha(token, request);
    await registrarEvento(env, token, acao, {
      motivo: acao === 'recusado' ? mensagem : null,
      ipHash: ctx.ipHash,
      uaCurto: ctx.uaCurto,
    });
    return json({ ok: true, status: acao });
  }

  // Não afetou nada: ou não existe, ou já foi respondido. Relê para distinguir.
  const atual = await getRow(env, token);
  if (atual && atual.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (!atual) return json({ ok: false, erro: 'nao_encontrado' }, 404);
  return json({ ok: true, status: atual.status, jaRespondido: true });
}

/**
 * "Já paguei" — o cliente AVISA o prestador que pagou. Não marca pago, não emite
 * recibo, não muda o status do orçamento: carimba `pagamento_informado_em` (1ª vez)
 * e grava 'pagamento_informado' na trilha; o app mostra "cliente avisou que pagou —
 * confira no banco" e o prestador registra o recebimento quando o dinheiro cair.
 * Só vale para link APROVADO (pelo cliente, ou pelo prestador no app com
 * `cobrarAgora`). Já avisado = ok idempotente.
 */
async function informarPagamento(token, request, env) {
  const row = await getRow(env, token);
  if (row && row.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (!row) return json({ ok: false, erro: 'nao_encontrado' }, 404);
  // Banco sem a coluna (migration não aplicada): o recurso está DESLIGADO — diz isso.
  if (row._semPagamentoInformado) return json({ ok: false, erro: 'recurso_desligado' }, 503);
  const dados = row && typeof row.dados === 'object' && row.dados ? row.dados : {};
  // Só "fechado COM valor a cobrar" (cobrarAgora): é o que o filtro do PATCH confere.
  const peloPrestador = row.status !== 'aprovado' && cobravelPeloPrestador(row, dados);
  if (row.status !== 'aprovado' && !peloPrestador) return json({ ok: false, erro: 'nao_aprovado' }, 409);
  if (row[COL_PAGAMENTO]) return json({ ok: true, pagamentoInformado: true, jaInformado: true });

  const res = await patchPagamentoInformado(env, token, peloPrestador);
  if (res.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (res.rows.length) {
    const ctx = await contextoTrilha(token, request);
    await registrarEvento(env, token, 'pagamento_informado', { ipHash: ctx.ipHash, uaCurto: ctx.uaCurto });
    return json({ ok: true, pagamentoInformado: true });
  }
  // Não afetou nada: outra aba avisou antes (sucesso) ou o link deixou de estar
  // aprovado no meio do caminho (recusa). Relê para distinguir — nunca finge.
  const atual = await getRow(env, token);
  if (atual && atual.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  if (atual && atual[COL_PAGAMENTO]) return json({ ok: true, pagamentoInformado: true, jaInformado: true });
  return json({ ok: false, erro: 'nao_aprovado' }, 409);
}

// ─── GET /o/<token> — página do cliente ──────────────────────
// `request` é OPCIONAL (o router hoje chama sem ela): quando presente, enriquece
// o evento 'visualizado' com ip_hash/user-agent; quando ausente, o evento ainda é
// gravado (sem enriquecimento). Assim a trilha funciona independentemente disso.
/**
 * `?acao=aprovar|recusar` vem dos botões/links do PDF. Ele SÓ PRÉ-SELECIONA a ação na
 * página: rola até os botões e, no caso de recusa, abre o campo de motivo. NUNCA
 * envia.
 *
 * GET não pode mudar estado. Um pré-visualizador de link (WhatsApp, Slack, um
 * antivírus de e-mail) que buscasse a URL aprovaria o orçamento sem o cliente
 * tocar em nada — e a aprovação é irreversível pela página.
 */
function acaoPreSelecionada(request) {
  try {
    const v = new URL(request.url).searchParams.get('acao');
    return v === 'aprovar' || v === 'recusar' ? v : '';
  } catch {
    return '';
  }
}

// ─── plano do dono do link (selo + Pix) ──────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANOS = new Set(['gratis', 'pro', 'empresa']);

/**
 * Plano EFETIVO de quem publicou o link: `{ confirmado:true, plano }` ou
 * `{ confirmado:false }`. A RPC só é executável por service_role e já resolve
 * tenant (membro de equipe herda o plano do dono), assinatura, override do admin e
 * teste do Pro. Qualquer falha (rede, 4xx/5xx, JSON estranho, linha sem dono) é
 * "não sei" — NUNCA "grátis" e nunca "pago".
 */
export async function planoDoDonoDoLink(env, row) {
  const userId = row && typeof row.user_id === 'string' ? row.user_id : '';
  if (!UUID_RE.test(userId)) return { confirmado: false };
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/plano_comercial_para_usuario`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_user_id: userId }),
    });
    if (!r.ok) return { confirmado: false };
    const plano = await r.json().catch(() => null);
    return PLANOS.has(plano) ? { confirmado: true, plano } : { confirmado: false };
  } catch {
    return { confirmado: false };
  }
}

/**
 * O que a página mostra para este plano — regra PURA (testada em
 * worker/scripts/teste-link-pix.js). Três estados no pagamento:
 *  - `liberado`      → plano confirmado com `link_pagamento`: mostra o Pix;
 *  - `bloqueado`     → plano confirmado sem o recurso (Grátis): "combine com o prestador";
 *  - `indeterminado` → não deu para ler o plano: "o pagamento não carregou, recarregue".
 * O selo some só com o plano CONFIRMADO com `remove_olli_brand`.
 */
export function regrasDaPagina(leitura) {
  if (!leitura || leitura.confirmado !== true || !PLANOS.has(leitura.plano)) {
    return { mostrarSelo: true, pagamento: 'indeterminado' };
  }
  return {
    mostrarSelo: !temAcessoRecurso(leitura.plano, RECURSO_REMOVE_MARCA),
    pagamento: temAcessoRecurso(leitura.plano, 'link_pagamento') ? 'liberado' : 'bloqueado',
  };
}

/**
 * O GET veio de um robô de PRÉVIA de link (WhatsApp, Facebook/Instagram, Telegram,
 * Slack, X, Discord, LinkedIn, Skype, iMessage...)? PURA. Lista de assinaturas
 * específicas (nada de /bot/i genérico: "CUBOT" é marca de celular). O navegador
 * dentro do WhatsApp usa o user-agent do Chrome/Safari, não o "WhatsApp/x.y" do
 * robô de prévia — então o cliente de verdade continua contando.
 */
const PRE_VISUALIZADORES_RE =
  /^WhatsApp\/|facebookexternalhit|Facebot|meta-externalagent|TelegramBot|Slackbot|Slack-ImgProxy|Twitterbot|Discordbot|LinkedInBot|SkypeUriPreview|Googlebot|bingbot|Applebot|Pinterestbot|redditbot|Embedly|Iframely|vkShare/i;
export function ehPreVisualizadorDeLink(request) {
  try {
    const ua = request && request.headers ? String(request.headers.get('User-Agent') || '') : '';
    return PRE_VISUALIZADORES_RE.test(ua);
  } catch {
    return false;
  }
}

export async function renderLinkPage(token, env, request) {
  const preSelecao = acaoPreSelecionada(request);
  if (!validToken(token)) return html(pageErro('Link inválido', 'Confira o endereço que você recebeu.'), 400);
  const row = await getRow(env, token);
  if (row && row.error) return html(pageErro('Erro temporário', 'Não consegui carregar agora. Recarregue em alguns instantes.'), 503);
  if (!row) return html(pageErro('Orçamento não encontrado', 'Este link pode ter expirado ou sido removido.'), 404);

  // TRILHA: registra 'visualizado' na 1ª abertura do dia (dedupe por dia). É
  // best-effort e roda ANTES de responder — como é 1x/dia por token, o custo é
  // desprezível e evita depender de waitUntil (que exigiria mexer no router).
  // Pré-visualizador de link (o WhatsApp do PRÓPRIO prestador busca a URL para
  // montar a prévia ao colar o link) NÃO é o cliente abrindo: não vira
  // 'visualizado' — senão o app e o termômetro diriam "abriu" sem ninguém abrir.
  try {
    if (!ehPreVisualizadorDeLink(request) && !(await visualizadoHoje(env, token))) {
      const ctx = await contextoTrilha(token, request);
      await registrarEvento(env, token, 'visualizado', { ipHash: ctx.ipHash, uaCurto: ctx.uaCurto });
      // Carimba a 1ª visualização (idempotente por `visualizado_em=is.null`): é o
      // que o app lê para acender o passo "visualizado" na trilha do dono.
      await marcarVisualizadoEm(env, token);
    }
  } catch {
    // nunca deixa a trilha atrapalhar a entrega da página
  }

  // Plano do dono: decide o selo e o Pix. Lido DEPOIS da trilha, e a falha vira
  // o terceiro estado (ver `regrasDaPagina`), nunca uma página quebrada.
  const regras = regrasDaPagina(await planoDoDonoDoLink(env, row));
  return html(pageOrcamento({ ...row, _regras: regras }, preSelecao));
}

// ─── páginas ─────────────────────────────────────────────────
// ─── Open Graph (prévia do link no WhatsApp/Instagram/Telegram) ───────────────────
/** Imagem ESTÁTICA da OLLI (a mesma da landing): https, sem dado de ninguém. A logo do prestador não vai no
 *  snapshot do link e o WhatsApp não aceita data URI como og:image — por isso a da OLLI. */
export const OG_IMAGEM = 'https://olliorcamentos.online/og-image.png';

/**
 * Metadados da prévia. SÓ o nome do prestador (a marca que ele mesmo mostra ao cliente). NUNCA entram:
 * valor do orçamento, nome/telefone do cliente, itens, número, Pix. Tudo escapado para atributo HTML.
 */
export function metaOpenGraph(nomePrestador) {
  const nome = String(nomePrestador ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Seu prestador';
  const titulo = `Orçamento de ${nome}`;
  const descricao = 'Veja os itens do orçamento, aprove e fale direto com o prestador pelo WhatsApp.';
  return [
    '<meta property="og:type" content="website"/>',
    '<meta property="og:site_name" content="OLLI Orçamentos"/>',
    '<meta property="og:locale" content="pt_BR"/>',
    `<meta property="og:title" content="${esc(titulo)}"/>`,
    `<meta property="og:description" content="${esc(descricao)}"/>`,
    `<meta property="og:image" content="${OG_IMAGEM}"/>`,
    '<meta property="og:image:type" content="image/png"/>',
    '<meta name="twitter:card" content="summary_large_image"/>',
    `<meta name="twitter:title" content="${esc(titulo)}"/>`,
    `<meta name="twitter:description" content="${esc(descricao)}"/>`,
    `<meta name="twitter:image" content="${OG_IMAGEM}"/>`,
  ].join('\n');
}

function shell(inner, accentRaw = ACCENT, mostrarSelo = true, og = '') {
  // Cabeçalho é texto branco sobre a cor; pílula e total são a cor sobre fundo claro.
  // As duas falham juntas quando a marca é clara. Escurece só nesse caso.
  const accent = corMarcaNoPapel(accentRaw, ACCENT);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex, nofollow"/>
${og}
<title>Orçamento · OLLI</title>
<style>${FONTES_CSS}</style>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif;background:#EAEEF3;color:#1A2230;-webkit-font-smoothing:antialiased;padding:24px 14px 48px}
  .wrap{max-width:480px;margin:0 auto}
  .card{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(10,37,64,.14)}
  .hd{background:linear-gradient(140deg,${accent},#0A2540);padding:22px 22px 20px;color:#fff;display:flex;align-items:center;gap:12px}
  .hd-mark{width:42px;height:42px;border-radius:13px;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .hd-name{font-family:'Spectral',Georgia,serif;font-size:18px;font-weight:700}
  .hd-tag{font-size:12.5px;color:rgba(255,255,255,.8);margin-top:1px}
  .body{padding:22px}
  .eyebrow{font-size:12px;font-weight:700;color:#6B7686}
  .title{font-size:19px;font-weight:800;margin-top:3px;line-height:1.3}
  .meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px}
  .meta-txt{font-size:12.5px;color:#6B7686}
  .pill{font-size:11px;font-weight:700;color:${accent};border:1px solid #BBD6F2;background:#EAF3FC;border-radius:999px;padding:3px 10px}
  .items{margin-top:18px;border-top:1px solid #EDEFF2}
  .item{display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #EDEFF2}
  .item-name{font-size:14.5px;font-weight:600}
  .badge{font-size:9.5px;font-weight:800;color:${accent};background:#EAF3FC;border-radius:5px;padding:1px 6px;letter-spacing:.3px;vertical-align:middle}
  .item-desc{font-size:13px;color:#667085;margin-top:2px}
  .item-qtd{font-size:13px;color:#667085;margin-top:3px}
  .item-val{font-size:14px;font-weight:700;white-space:nowrap}
  .total{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding:15px 16px;background:#EAF3FC;border:1px solid #BBD6F2;border-radius:14px}
  .total-l{font-size:13px;font-weight:700;letter-spacing:.3px}
  .total-v{font-family:'Spectral',Georgia,serif;font-size:24px;font-weight:700;color:${accent}}
  .conds{display:flex;gap:10px;margin-top:16px}
  .cond{flex:1;background:#F6F8FB;border:1px solid #EDEFF2;border-radius:12px;padding:11px}
  .cond-l{font-size:11px;font-weight:800;letter-spacing:.8px;color:#667085;text-transform:uppercase}
  .cond-v{font-size:12.5px;color:#3C4756;margin-top:4px;line-height:1.4}
  .actions{margin-top:20px;display:flex;flex-direction:column;gap:10px}
  .approve-hint{font-size:12px;color:#5A6575;text-align:center;line-height:1.4;padding:0 6px}
  .btn{border:none;border-radius:14px;padding:15px;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none}
  .btn-aprovar{background:#15B66E;color:#fff;box-shadow:0 8px 20px rgba(21,182,110,.32)}
  .destacado{outline:3px solid rgba(255,255,255,.65);outline-offset:3px}
  .destacado-escuro{outline:3px solid ${accent};outline-offset:3px}
  #pagar{scroll-margin-top:16px}
  .btn-row{display:flex;gap:10px}
  .btn-recusar{flex:1;background:#fff;color:#C0392B;border:1.5px solid #F0D2CE}
  .btn-zap{flex:1;background:#fff;color:#1A7F4B;border:1.5px solid #BFE6CF}
  .btn:active{transform:scale(.98)}
  /* Passo-a-passo do que acontece ao aprovar/recusar (transparência para o cliente). */
  .comofunciona{margin-top:16px;background:#F6F8FB;border:1px solid #EDEFF2;border-radius:14px;padding:14px 16px}
  .cf-t{font-size:11px;font-weight:800;letter-spacing:.6px;color:#667085;text-transform:uppercase}
  .cf-step{display:flex;align-items:flex-start;gap:9px;margin-top:9px;font-size:13px;color:#3C4756;line-height:1.4}
  .cf-n{flex-shrink:0;width:19px;height:19px;border-radius:6px;background:#EAF3FC;color:${accent};font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:1px}
  /* Painel de recusa: aparece ao clicar "Recusar" — pede o motivo antes de enviar. */
  .recusa-panel{margin-top:14px;background:#FDF6F5;border:1px solid #F0D2CE;border-radius:14px;padding:15px}
  .recusa-title{font-size:14px;font-weight:800;color:#8E2E22}
  .recusa-sub{font-size:12px;color:#8A6A66;margin-top:3px;line-height:1.4}
  .recusa-panel textarea{width:100%;margin-top:11px;min-height:78px;resize:vertical;font-family:inherit;font-size:14px;color:#1A2230;background:#fff;border:1.5px solid #F0D2CE;border-radius:11px;padding:11px 12px;line-height:1.4}
  .recusa-panel textarea:focus{outline:none;border-color:#C0392B;box-shadow:0 0 0 3px rgba(192,57,43,.12)}
  .recusa-count{font-size:11px;color:#A98D89;text-align:right;margin-top:5px}
  .recusa-btns{display:flex;gap:10px;margin-top:12px}
  .btn-voltar{flex:1;background:#fff;color:#5A6575;border:1.5px solid #E0E5EC}
  .btn-conf-recusa{flex:1.4;background:#C0392B;color:#fff;box-shadow:0 8px 20px rgba(192,57,43,.28)}
  .hidden{display:none}
  .status-box{margin-top:20px;border-radius:14px;padding:18px;text-align:center}
  .status-ok{background:#E9F9F1;border:1px solid #BFE6CF}
  .status-no{background:#FDECEA;border:1px solid #F5C9C3}
  .status-emoji{font-size:30px}
  .status-title{font-size:16px;font-weight:800;margin-top:6px}
  .status-sub{font-size:13px;color:#5A6575;margin-top:3px}
  .foot{text-align:center;font-size:12px;color:#667085;margin-top:18px;font-weight:600}
  .err{background:#fff;border-radius:22px;padding:40px 26px;text-align:center;box-shadow:0 18px 50px rgba(10,37,64,.14)}
  .err-emoji{font-size:40px}
  .err-title{font-size:18px;font-weight:800;margin-top:10px}
  .err-sub{font-size:13.5px;color:#6B7686;margin-top:6px;line-height:1.5}
  .robot{width:26px;height:26px}
  /* Bloco do Pix (só em orçamento aprovado) — dinheiro direto na conta do prestador. */
  .pix-box{margin-top:16px;background:#F6F8FB;border:1px solid #EDEFF2;border-radius:14px;padding:16px;text-align:center}
  .pix-t{font-size:11px;font-weight:800;letter-spacing:.6px;color:#5A6575;text-transform:uppercase}
  .pix-valor{font-family:'Spectral',Georgia,serif;font-size:26px;font-weight:700;color:#1A2230;margin-top:4px}
  .pix-sub{font-size:12.5px;color:#5A6575;margin-top:4px;line-height:1.4}
  .pix-qr{margin:14px auto 4px;width:200px;height:200px}
  .pix-qr svg{width:100%;height:100%}
  .pix-l{font-size:11px;font-weight:800;color:#5A6575;margin-top:12px;text-align:left}
  .pix-code{width:100%;margin-top:6px;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:#1A2230;background:#fff;border:1.5px solid #E0E5EC;border-radius:11px;padding:10px;resize:none;word-break:break-all}
  .btn-copiar{width:100%;margin-top:10px;background:#1A2230;color:#fff}
  .btn-paguei{width:100%;margin-top:10px;background:#fff;color:#1A7F4B;border:1.5px solid #BFE6CF}
  .pix-nota{font-size:11.5px;color:#5A6575;margin-top:6px;line-height:1.4}
  .pix-avisado{margin-top:12px;font-size:12.5px;color:#1A7F4B;background:#E9F9F1;border:1px solid #BFE6CF;border-radius:11px;padding:10px;line-height:1.4}
  .olli-cta{text-align:center;margin:22px auto 10px}
</style>
</head>
<body><div class="wrap">${inner}</div>
${mostrarSelo ? `<div class="olli-cta">${seloOlliHtml('link_orcamento')}</div>` : ''}
</body>
</html>`;
}

function olliRobot() {
  // Símbolo oficial OLLI (rebrand v3): balão-documento + olhos + check.
  return `<svg class="robot" viewBox="0 0 64 64" fill="none"><defs><linearGradient id="om" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3FD8EA"/><stop offset="1" stop-color="#0B6FCE"/></linearGradient></defs><path d="M22 49 L12 59.5 L30 50 Z" fill="url(#om)"/><rect x="9" y="8" width="46" height="44" rx="14.5" fill="url(#om)"/><rect x="13" y="11.5" width="38" height="15" rx="9" fill="#ffffff" opacity="0.1"/><rect x="20" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><rect x="35.5" y="18.5" width="8.5" height="11" rx="4.2" fill="#7FE9F5"/><path d="M19 41 l6.6 6.9 l16 -15" fill="none" stroke="#EAFEFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function pageErro(titulo, sub) {
  return shell(`<div class="err"><div class="err-emoji">🔍</div><div class="err-title">${esc(titulo)}</div><div class="err-sub">${esc(sub)}</div><div class="foot" style="margin-top:22px">enviado com OLLI</div></div>`);
}

/**
 * Bloco "Pagar com Pix" do orçamento APROVADO. Três casos, todos honestos:
 *  - com Pix válido: QR + copia e cola (valor embutido) + "Já paguei";
 *  - cliente já avisou: mostra a data e diz que o prestador vai conferir (não diz "pago");
 *  - sem Pix do prestador: não inventa meio de pagamento — "combine com o prestador".
 * "Já paguei" some quando o banco não tem a coluna (`_semPagamentoInformado`).
 */
function blocoPagamento(row, d, total, numero, nomePrestador) {
  // Recurso do Pro (`link_pagamento`), decidido pelo plano do dono em renderLinkPage.
  // Linha sem regras (chamada antiga/teste) = "não sei": não mostra Pix.
  const pagamento = row && row._regras ? row._regras.pagamento : 'indeterminado';
  if (pagamento === 'indeterminado') {
    return `<div class="pix-box" id="pagar"><div class="pix-t">Pagamento</div><div class="pix-sub">Não consegui carregar a forma de pagamento agora. Recarregue a página em instantes ou combine diretamente com ${esc(nomePrestador)}.</div></div>`;
  }
  if (pagamento !== 'liberado') {
    return `<div class="pix-box" id="pagar"><div class="pix-t">Pagamento</div><div class="pix-sub">Combine a forma de pagamento diretamente com ${esc(nomePrestador)}.</div></div>`;
  }
  const pix = pixDaPagina(d, total, numero);
  const informadoEm = row && typeof row[COL_PAGAMENTO] === 'string' ? formatData(row[COL_PAGAMENTO]) : '';
  const podeInformar = pix && !row._semPagamentoInformado && !informadoEm;

  if (!pix) {
    // Quitado: o app registrou recebimentos que cobrem o total (valorACobrar 0).
    if (valorDoPix(d, total) === 0 && Number(total) > 0 && 'valorACobrar' in d) {
      return `<div class="pix-box" id="pagar"><div class="pix-t">Pagamento</div><div class="pix-sub">${esc(nomePrestador)} já registrou o pagamento deste orçamento. Obrigado!</div></div>`;
    }
    return `<div class="pix-box" id="pagar"><div class="pix-t">Pagamento</div><div class="pix-sub">Combine a forma de pagamento diretamente com ${esc(nomePrestador)}.</div></div>`;
  }

  // O que este valor é: a entrada, o saldo que falta ou o total (vem do app).
  const tipo = d && typeof d.cobrancaTipo === 'string' ? d.cobrancaTipo : '';
  const totalTxt = formatBRL(total);
  const rotulo =
    tipo === 'sinal' && pix.valor + 0.005 < Number(total)
      ? `<div class="pix-sub"><strong>Entrada</strong> para começar o serviço. Total do orçamento: ${totalTxt}.</div>`
      : tipo === 'saldo' && pix.valor + 0.005 < Number(total)
        ? `<div class="pix-sub"><strong>Saldo em aberto</strong>. Total do orçamento: ${totalTxt}.</div>`
        : '';

  const avisado = informadoEm
    ? `<div class="pix-avisado">Você avisou que pagou em ${esc(informadoEm)}. ${esc(nomePrestador)} vai conferir e confirmar o recebimento.</div>`
    : '';
  const botaoInformar = podeInformar
    ? `<button id="btnPaguei" class="btn btn-paguei" onclick="informarPagamento()">Já paguei</button>
       <div class="pix-nota">Isso só avisa ${esc(nomePrestador)}. O pagamento é confirmado por ele quando cair na conta.</div>`
    : '';

  // "Copiar código Pix" vem logo abaixo do valor: no celular o cliente paga colando o
  // código no app do banco; o QR serve para quem abre o link em outro aparelho.
  return `<div class="pix-box" id="pagar">
      <div class="pix-t">Pagar com Pix</div>
      <div class="pix-valor">${formatBRL(pix.valor)}</div>
      ${rotulo}
      <button id="btnCopiar" class="btn btn-copiar" onclick="copiarPix()">Copiar código Pix</button>
      <div class="pix-nota">Depois, abra o app do seu banco, escolha Pix copia e cola e cole o código.</div>
      <div class="pix-sub">O dinheiro vai direto para a conta de ${esc(nomePrestador)}.</div>
      ${pix.svg ? `<div class="pix-qr">${pix.svg}</div>` : ''}
      <div class="pix-l">Pix copia e cola</div>
      <textarea id="pixCodigo" class="pix-code" readonly rows="${Math.max(4, Math.ceil(String(pix.codigo || '').length / 32))}">${esc(pix.codigo)}</textarea>
      ${avisado}
      ${botaoInformar}
    </div>`;
}

/**
 * Script dos SINAIS do termômetro (ver `registrarSinal`). Exportado para o teste.
 * Só métrica: abriu (1x por aba), segundos com a página visível, o total ficou na
 * tela por 1,5 s, tocou em aprovar/pagar. Beacon para o mesmo domínio (o CSP já
 * restringe a `connect-src 'self'`); sem cookie, sem armazenamento além do
 * sessionStorage da aba. Qualquer falha é silenciosa: a página nunca depende disso.
 */
export function scriptSinais() {
  return `
    (function(){
      var destino = location.pathname.replace(/\\/+$/, '') + '/sinal';
      var chave = 'olli_sessao_' + location.pathname;
      var sessao = '';
      try { sessao = sessionStorage.getItem(chave) || ''; } catch(e){}
      var nova = !/^[0-9a-f]{16}$/.test(sessao);
      if (nova) {
        try {
          var bytes = new Uint8Array(8);
          crypto.getRandomValues(bytes);
          sessao = '';
          for (var i = 0; i < bytes.length; i++) { sessao += ('0' + bytes[i].toString(16)).slice(-2); }
          try { sessionStorage.setItem(chave, sessao); } catch(e){}
        } catch(e){ return; }
      }
      function sinal(tipo, segundos){
        var corpo = JSON.stringify(segundos ? { tipo: tipo, sessao: sessao, segundos: segundos } : { tipo: tipo, sessao: sessao });
        try { if (navigator.sendBeacon && navigator.sendBeacon(destino, corpo)) return; } catch(e){}
        try { fetch(destino, { method: 'POST', body: corpo, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function(){}); } catch(e){}
      }
      window.olliSinal = sinal;
      if (nova) sinal('abertura');

      var visivelDesde = document.visibilityState === 'visible' ? Date.now() : 0;
      var acumulado = 0;
      function fecharTempo(){
        if (visivelDesde) { acumulado += (Date.now() - visivelDesde) / 1000; visivelDesde = 0; }
        var s = Math.min(${MAX_SEGUNDOS_POR_ENVIO}, Math.round(acumulado));
        acumulado = 0;
        if (s >= 2) sinal('tempo', s);
      }
      document.addEventListener('visibilitychange', function(){
        if (document.visibilityState === 'hidden') fecharTempo();
        else if (!visivelDesde) visivelDesde = Date.now();
      });
      window.addEventListener('pagehide', fecharTempo);

      var preco = document.getElementById('preco');
      var vistas = 0;
      var espera = null;
      if (preco && 'IntersectionObserver' in window) {
        new IntersectionObserver(function(entradas){
          entradas.forEach(function(e){
            if (e.isIntersecting && e.intersectionRatio >= 0.6) {
              if (!espera) espera = setTimeout(function(){
                espera = null;
                if (vistas < 12) { vistas++; sinal('preco_visto'); }
              }, 1500);
            } else if (espera) { clearTimeout(espera); espera = null; }
          });
        }, { threshold: [0, 0.6, 1] }).observe(preco);
      }
    })();`;
}

function pageOrcamento(row, preSelecao = '') {
  const d = (row && typeof row.dados === 'object' && row.dados) ? row.dados : {};
  const prestador = (d.prestador && typeof d.prestador === 'object') ? d.prestador : {};
  const nomePrestador = prestador.nome || row.prestador_nome || 'Prestador';
  const tagline = prestador.tagline || '';
  const cliente = d.clienteNome || row.cliente_nome || '';
  const numero = d.numero || row.numero || '';
  const emitido = formatData(d.dataEmissao);
  const validade = formatData(d.validade);
  const total = (typeof d.valorTotal === 'number') ? d.valorTotal : Number(row.valor_total) || 0;
  const itens = (Array.isArray(d.itens) ? d.itens : []).filter((it) => it && typeof it === 'object');
  // Número pela regra única (DDD 55 certo; número torto = sem botão, nunca um chute).
  const whats = numeroWhatsAppBR(prestador.whatsapp || row.prestador_whatsapp || '');
  const status = row.status || 'enviado';
  // Aprovado pelo cliente aqui OU fechado pelo prestador no app (cobrarAgora).
  const aprovadoAqui = status === 'aprovado';
  const aprovadoPeloPrestador = !aprovadoAqui && fechadoPeloPrestador(row, d);
  const respondido = aprovadoAqui || aprovadoPeloPrestador || status === 'recusado';
  const vencida = !respondido && validadeVencida(d.validade);
  const accent = safeHexColor(d.corMarca, ACCENT);
  const allowApprove = d.exibirAprovacao !== false;
  const allowReject = d.exibirRecusa !== false;

  const itensHtml = itens.map((it) => {
    const badge = it && it.isPeca ? ` <span class="badge">PEÇA</span>` : '';
    const desc = it && it.descricao ? `<div class="item-desc">${esc(it.descricao)}</div>` : '';
    const qtd = Number(it && it.quantidade) || 1;
    const unid = esc((it && it.unidade) || 'un');
    const preco = formatBRL(it && it.preco);
    const sub = formatBRL(it && (it.subtotal != null ? it.subtotal : (Number(it.preco) || 0) * qtd));
    return `<div class="item"><div><div class="item-name">${esc((it && it.nome) || 'Item')}${badge}</div>${desc}<div class="item-qtd">${qtd} ${unid} × ${preco}</div></div><div class="item-val">${sub}</div></div>`;
  }).join('');

  const conds = [];
  if (d.condicoesPagamento) conds.push(`<div class="cond"><div class="cond-l">Condições comerciais</div><div class="cond-v">${esc(d.condicoesPagamento)}</div></div>`);
  if (d.garantia) conds.push(`<div class="cond"><div class="cond-l">Garantia</div><div class="cond-v">${esc(d.garantia)}</div></div>`);
  if (d.prazo) conds.push(`<div class="cond"><div class="cond-l">Prazo</div><div class="cond-v">${esc(d.prazo)}</div></div>`);
  const condsHtml = conds.length ? `<div class="conds">${conds.join('')}</div>` : '';

  // Mensagem de dúvida contextualizada: já chega no WhatsApp do prestador com
  // número do orçamento, valor e (quando houver) o nome do cliente, para ele
  // não precisar perguntar "de qual orçamento é" antes de poder ajudar.
  const duvidaTexto = `Olá! ${cliente ? `Sou ${cliente}, ` : ''}quero falar sobre o orçamento nº ${numero} (${formatBRL(total)}).`;
  const zapHref = whats ? linkWaMe(whats, duvidaTexto) : '';

  // Motivo que o cliente deixou ao recusar (o worker grava em resposta_cliente).
  const motivoRecusa = typeof row.resposta_cliente === 'string' ? row.resposta_cliente.trim() : '';

  let actionsHtml;
  if (respondido) {
    const ok = aprovadoAqui || aprovadoPeloPrestador;
    // Na recusa, se o cliente deixou motivo, reexibe para ele ("registramos isto").
    const motivoBloco = (!ok && motivoRecusa)
      ? `<div class="status-sub" style="margin-top:8px"><strong>Seu motivo:</strong> “${esc(motivoRecusa)}”</div>`
      : '';
    // Texto HONESTO: não existe aviso instantâneo ao prestador (push/e-mail). A resposta
    // fica registrada e aparece para ele no OLLI — por isso o WhatsApp para quem tem pressa.
    const subOk = aprovadoAqui
      ? `Sua aprovação foi registrada e aparece para ${esc(nomePrestador)} no OLLI.${zapHref ? ' Se tiver pressa, chame no WhatsApp.' : ''}`
      : `${esc(nomePrestador)} confirmou este serviço com você.`;
    actionsHtml = `<div class="status-box ${ok ? 'status-ok' : 'status-no'}">
        <div class="status-emoji">${ok ? '✅' : '❌'}</div>
        <div class="status-title">${ok ? 'Orçamento aprovado' : 'Orçamento recusado'}</div>
        <div class="status-sub">${ok ? subOk : 'Sua resposta foi registrada.'}</div>
        ${motivoBloco}
      </div>
      ${ok ? blocoPagamento(row, d, total, numero, nomePrestador) : ''}
      ${zapHref ? `<div class="actions"><a class="btn btn-zap" href="${esc(zapHref)}" target="_blank" rel="noopener">💬 Falar no WhatsApp</a></div>` : ''}`;
  } else if (vencida) {
    // Validade passou: preço e prazo podem ter mudado. Nada de aprovar (o POST também
    // recusa com 409); o caminho é pedir uma proposta atualizada.
    const pedirAtualizada = whats
      ? linkWaMe(whats, `Olá! ${cliente ? `Sou ${cliente}. ` : ''}O orçamento nº ${numero} venceu. Pode me mandar uma proposta atualizada?`)
      : '';
    actionsHtml = `<div class="status-box status-no" id="actions">
        <div class="status-emoji">⏳</div>
        <div class="status-title">Proposta vencida</div>
        <div class="status-sub">A validade desta proposta terminou em ${esc(validade)}. Fale com ${esc(nomePrestador)} para receber uma proposta atualizada.</div>
      </div>
      ${pedirAtualizada ? `<div class="actions"><a class="btn btn-zap" href="${esc(pedirAtualizada)}" target="_blank" rel="noopener">💬 Pedir proposta atualizada</a></div>` : ''}`;
  } else {
    // Passo-a-passo claro do que acontece quando o cliente aprova — só faz sentido
    // exibir quando aprovar está disponível (é o passo que dispara o restante). Sem
    // prometer "aviso na hora": a resposta fica registrada e aparece no OLLI dele.
    const comoFunciona = allowApprove
      ? `<div class="comofunciona">
          <div class="cf-t">Como funciona</div>
          <div class="cf-step"><span class="cf-n">1</span><span>Você aprova aqui, neste link — sem app, sem cadastro.</span></div>
          <div class="cf-step"><span class="cf-n">2</span><span>A sua resposta fica registrada e aparece para ${esc(nomePrestador)} no OLLI.</span></div>
          <div class="cf-step"><span class="cf-n">3</span><span>Vocês combinam os detalhes${whats ? ' pelo WhatsApp' : ''} e o trabalho começa.</span></div>
        </div>`
      : '';

    // O botão de aprovar vem ANTES do "Como funciona": é o passo que gera dinheiro e,
    // com o texto na frente, ficava abaixo da primeira tela do celular. A frase
    // "aprovando aqui, a resposta fica registrada…" repetia o passo 2 e saiu.
    actionsHtml = `<div class="actions" id="actions">
        ${allowApprove ? `<button id="btnAprovar" class="btn btn-aprovar" onclick="responder('aprovar')">✓ Aprovar orçamento</button>` : ''}
        <div class="btn-row">
          ${allowReject ? `<button class="btn btn-recusar" onclick="abrirRecusa()">Recusar</button>` : ''}
          ${zapHref ? `<a class="btn btn-zap" href="${esc(zapHref)}" target="_blank" rel="noopener">Tirar dúvida</a>` : ''}
        </div>
      </div>
      ${allowReject ? `<div class="recusa-panel hidden" id="recusaPanel">
        <div class="recusa-title">Por que está recusando?</div>
        <div class="recusa-sub">Conta pra ${esc(nomePrestador)} o motivo (preço, prazo, mudou de ideia…). É opcional, mas ajuda muito — e pode até gerar um ajuste na proposta.</div>
        <textarea id="motivoRecusa" maxlength="500" placeholder="Ex.: achei o valor acima do meu orçamento…" oninput="contarMotivo()"></textarea>
        <div class="recusa-count" id="motivoCount">0/500</div>
        <div class="recusa-btns">
          <button class="btn btn-voltar" onclick="fecharRecusa()">Voltar</button>
          <button class="btn btn-conf-recusa" onclick="confirmarRecusa()">Confirmar recusa</button>
        </div>
      </div>` : ''}
      ${comoFunciona}`;
    if (!allowApprove && !allowReject && !zapHref) {
      actionsHtml = `<div class="status-box status-ok"><div class="status-title">Orçamento enviado para conferência</div><div class="status-sub">Responda pelo canal combinado para aprovar ou tirar dúvidas.</div></div>`;
    }
  }

  // Só mostra o selo de validade quando o prestador de fato definiu um prazo —
  // "Válido por 15 dias" fixo criaria uma condição comercial que ele nunca configurou.
  const validadePill = validade
    ? `<span class="pill">${vencida ? 'Venceu em' : 'Válido até'} ${esc(validade)}</span>`
    : '';

  const inner = `<div class="card">
    <div class="hd">
      <div class="hd-mark">${olliRobot()}</div>
      <div><div class="hd-name">${esc(nomePrestador)}</div>${tagline ? `<div class="hd-tag">${esc(tagline)}</div>` : ''}</div>
    </div>
    <div class="body">
      ${cliente ? `<div class="eyebrow">Olá, ${esc(cliente)}</div>` : ''}
      <div class="title">Você recebeu um orçamento de ${esc(nomePrestador)}</div>
      <div class="meta">
        ${numero ? `<span class="meta-txt">Nº ${esc(numero)}</span>` : ''}
        ${d.revisaoDeNumero ? `<span class="pill">Revisão do nº ${esc(d.revisaoDeNumero)}</span>` : ''}
        ${emitido ? `<span class="meta-txt">· ${esc(emitido)}</span>` : ''}
        ${validadePill}
      </div>
      ${itens.length ? `<div class="items">${itensHtml}</div>` : ''}
      <div class="total" id="preco"><span class="total-l">TOTAL</span><span class="total-v">${formatBRL(total)}</span></div>
      ${condsHtml}
      ${actionsHtml}
      <div class="foot">enviado com segurança pela OLLI</div>
      <div class="foot" style="margin-top:6px;font-weight:500">O prestador vê quando esta página é aberta e por quanto tempo, sem saber quem abriu.</div>
    </div>
  </div>
  <script>
    var enviando = false;
    // Abre o painel de recusa (pede o motivo antes de enviar). Não envia nada ainda.
    function abrirRecusa(){
      var p = document.getElementById('recusaPanel');
      if (p){ p.classList.remove('hidden'); }
      var t = document.getElementById('motivoRecusa');
      if (t){ t.focus(); }
    }
    function fecharRecusa(){
      var p = document.getElementById('recusaPanel');
      if (p){ p.classList.add('hidden'); }
    }
    function contarMotivo(){
      var t = document.getElementById('motivoRecusa');
      var c = document.getElementById('motivoCount');
      if (t && c){ c.textContent = (t.value ? t.value.length : 0) + '/500'; }
    }
    // Confirma a recusa levando o motivo digitado (opcional).
    function confirmarRecusa(){
      var t = document.getElementById('motivoRecusa');
      var motivo = t && t.value ? t.value.trim() : '';
      responder('recusar', motivo);
    }
    // Envia a resposta. Em 'recusar' inclui o motivo (quando houver). Trava o
    // clique-duplo e desabilita TODOS os controles (ações + painel de recusa)
    // enquanto a request está em voo.
    async function responder(acao, motivo){
      if (enviando) return;
      enviando = true;
      var alvos = [];
      var box = document.getElementById('actions');
      if (box){ box.querySelectorAll('button,a').forEach(function(b){ alvos.push(b); }); }
      var panel = document.getElementById('recusaPanel');
      if (panel){ panel.querySelectorAll('button,textarea').forEach(function(b){ alvos.push(b); }); }
      alvos.forEach(function(b){ b.style.opacity='.5'; b.style.pointerEvents='none'; });
      var corpo = { acao: acao };
      if (acao === 'recusar' && motivo){ corpo.mensagem = motivo; }
      if (acao === 'aprovar' && window.olliSinal){ window.olliSinal('clique_aprovar'); }
      try {
        var r = await fetch(location.pathname, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(corpo) });
        var j = await r.json();
        if (j && j.ok) { location.reload(); return; }
        if (j && j.erro === 'proposta_vencida') {
          alert('A validade desta proposta terminou. Peça uma proposta atualizada ao prestador.');
          location.reload();
          return;
        }
        enviando = false;
        alvos.forEach(function(b){ b.style.opacity='1'; b.style.pointerEvents='auto'; });
        alert(j && j.erro === 'muitas_requisicoes' ? 'Muitas tentativas. Aguarde um instante e tente de novo.' : 'Não consegui registrar agora. Tente de novo.');
        return;
      } catch(e){}
      enviando = false;
      alvos.forEach(function(b){ b.style.opacity='1'; b.style.pointerEvents='auto'; });
      alert('Não consegui registrar agora. Verifique a internet e tente de novo.');
    }

    // Copia o Pix copia e cola. Clipboard API quando existe; senão seleciona o texto
    // (o cliente copia com o toque longo). Nunca envia nada.
    function copiarPix(){
      var t = document.getElementById('pixCodigo');
      var b = document.getElementById('btnCopiar');
      if (!t) return;
      if (window.olliSinal){ window.olliSinal('clique_pagar'); }
      var ok = function(){ if (b){ b.textContent = 'Código copiado ✓'; } };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(t.value).then(ok, function(){ t.focus(); t.select(); });
          return;
        }
      } catch(e){}
      t.focus(); t.select();
      try { if (document.execCommand('copy')) ok(); } catch(e){}
    }
    // "Já paguei": só AVISA o prestador (ele confere no banco e confirma).
    var avisando = false;
    async function informarPagamento(){
      if (avisando) return;
      avisando = true;
      if (window.olliSinal){ window.olliSinal('clique_pagar'); }
      var b = document.getElementById('btnPaguei');
      if (b){ b.style.opacity='.5'; b.style.pointerEvents='none'; }
      try {
        var r = await fetch(location.pathname, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ acao: 'informar_pagamento' }) });
        var j = await r.json();
        if (j && j.ok) { location.reload(); return; }
        alert(j && j.erro === 'muitas_requisicoes' ? 'Muitas tentativas. Aguarde um instante e tente de novo.' : 'Não consegui avisar agora. Tente de novo em instantes.');
      } catch(e){
        alert('Não consegui avisar agora. Verifique a internet e tente de novo.');
      }
      avisando = false;
      if (b){ b.style.opacity='1'; b.style.pointerEvents='auto'; }
    }

    // Link de cobrança (/o/<token>#pagar): rola até o pagamento e destaca "Copiar código
    // Pix". Sem bloco de pagamento (ainda não aprovado), rola até as ações. Não envia nada.
    (function(){
      if (location.hash !== '#pagar') return;
      var alvo = document.getElementById('pagar') || document.getElementById('actions');
      if (alvo && alvo.scrollIntoView) { alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      var c = document.getElementById('btnCopiar');
      if (c) { c.classList.add('destacado-escuro'); if (c.focus) c.focus({ preventScroll: true }); }
    })();

    // Pré-seleção vinda do botão/link do PDF (?acao=). NÃO envia nada: rola até as ações e,
    // na recusa, abre o campo de motivo. O cliente ainda confirma com um toque.
    (function(){
      var acao = ${JSON.stringify(preSelecao)};
      if (!acao) return;
      var box = document.getElementById('actions');
      if (box && box.scrollIntoView) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      if (acao === 'recusar') { abrirRecusa(); return; }
      var b = document.getElementById('btnAprovar');
      if (b) { b.classList.add('destacado'); if (b.focus) b.focus(); }
    })();
${scriptSinais()}
  </script>`;

  // Selo: só some com plano CONFIRMADO sem selo. Linha sem regras = selo fica.
  return shell(inner, accent, !(row._regras && row._regras.mostrarSelo === false), metaOpenGraph(nomePrestador));
}
