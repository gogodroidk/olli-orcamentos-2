import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  type Ambiente,
  ATRIBUICAO_VAZIA,
  anexarAtribuicaoAoLink,
  capturarAtribuicao,
  CHAVE_ATRIBUICAO,
  lerAtribuicao,
  lerAtribuicaoSalva,
  lerCookie,
  lerToqueDaUrl,
  mesclarAtribuicao,
  montarCookie,
  montarOrigemUtm,
  registrarToque,
  serializarAtribuicao,
  VALIDADE_DIAS,
} from '../web/src/lib/atribuicao.ts';
import {
  iniciarPixel,
  META_PIXEL_ID,
  novoEventId,
  pageView,
  rastreamentoPermitido,
  rastrear,
  urlTemSegredo,
} from '../web/src/lib/metaPixel.ts';
import {
  consentimentoAtual,
  lerConsentimentoDeCookies,
  montarCookieConsentimento,
  sinalDeRecusaDoNavegador,
} from '../web/src/lib/consentimento.ts';
import {
  CONVERSAO_CADASTRO,
  GOOGLE_ADS_ID,
  googleConversaoCadastro,
  googleTagConfigurada,
  iniciarGoogleTag,
} from '../web/src/lib/googleTag.ts';
import { montarEventoMeta, processarConversoesAnuncios, valorDoPlano } from '../worker/src/anunciosConversoes.js';

console.log('\nMarketing — atribuição (UTM/fbclid/gclid) e Meta Pixel');

const DIA = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 29, 12, 0, 0);

// ─── 1) parser ──────────────────────────────────────────────────────────────
const toque = lerToqueDaUrl(
  '?utm_source=facebook&utm_medium=cpc&utm_campaign=olli_traf_cadastro_v1&utm_content=a04&utm_term=orcamento&fbclid=IwAR123&gclid=Cj0K&modo=cadastro&outro=x',
  '/para/ar-condicionado/',
  T0,
);
assert.deepEqual(toque, {
  ts: T0,
  utm_source: 'facebook',
  utm_medium: 'cpc',
  utm_campaign: 'olli_traf_cadastro_v1',
  utm_content: 'a04',
  utm_term: 'orcamento',
  fbclid: 'IwAR123',
  gclid: 'Cj0K',
  pagina: '/para/ar-condicionado/',
});
assert.equal(lerToqueDaUrl('?modo=cadastro&plano=pro', '/', T0), null, 'sem parâmetro de campanha não há toque');
assert.equal(lerToqueDaUrl('', '/', T0), null);
assert.equal(lerToqueDaUrl('?utm_source=', '/', T0), null, 'valor vazio não conta');
assert.deepEqual(lerToqueDaUrl('?fbclid=abc', undefined, T0), { ts: T0, fbclid: 'abc' }, 'só o fbclid já é uma origem');
const longo = lerToqueDaUrl(`?utm_source=${'a'.repeat(500)}`, '/', T0);
assert.equal(longo?.utm_source?.length, 100, 'valor é truncado');
const controle = lerToqueDaUrl(`?utm_source=${encodeURIComponent('fa\u0000ce\nbook')}`, '/', T0);
assert.equal(controle?.utm_source, 'facebook', 'caractere de controle é removido');
assert.equal(lerToqueDaUrl('?FBCLID=x&UTM_SOURCE=y', '/', T0), null, 'nome do parâmetro é case-sensitive');

// ─── 2) first-touch × last-touch ────────────────────────────────────────────
const a = lerToqueDaUrl('?utm_source=facebook&utm_campaign=c1', '/', T0)!;
const b = lerToqueDaUrl('?utm_source=google&utm_campaign=c2', '/', T0 + 5 * DIA)!;
let estado = registrarToque(ATRIBUICAO_VAZIA, a);
assert.deepEqual(estado, { primeiro: a, ultimo: a });
estado = registrarToque(estado, b);
assert.equal(estado.primeiro?.utm_campaign, 'c1', 'first-touch nunca é sobrescrito');
assert.equal(estado.ultimo?.utm_campaign, 'c2', 'last-touch é trocado');
assert.equal(registrarToque(estado, null), estado, 'visita direta não apaga a campanha');
// ordem invertida (toque antigo chegando depois) não rebaixa o last-touch
const invertido = registrarToque(registrarToque(ATRIBUICAO_VAZIA, b), a);
assert.equal(invertido.primeiro?.utm_campaign, 'c1');
assert.equal(invertido.ultimo?.utm_campaign, 'c2');
assert.deepEqual(mesclarAtribuicao(ATRIBUICAO_VAZIA, estado), estado);

// ─── 3) leitura de armazenamento (expiração, lixo, adulteração) ─────────────
const salvo = serializarAtribuicao(estado);
assert.deepEqual(lerAtribuicao(salvo, T0 + 10 * DIA), estado, 'ida e volta preserva');
assert.deepEqual(lerAtribuicao(salvo, T0 + (VALIDADE_DIAS + 6) * DIA), ATRIBUICAO_VAZIA, 'após 90 dias tudo expira');
const parcial = lerAtribuicao(salvo, T0 + 5 * DIA + VALIDADE_DIAS * DIA - 1000);
assert.equal(parcial.primeiro, null, 'o first-touch expira antes do last-touch');
assert.equal(parcial.ultimo?.utm_campaign, 'c2', 'a validade é contada por toque');
for (const lixo of ['', 'null', '[]', '{', '"x"', '{"primeiro":1,"ultimo":"a"}', '{"primeiro":{"ts":"x","utm_source":"a"}}']) {
  assert.deepEqual(lerAtribuicao(lixo, T0), ATRIBUICAO_VAZIA, `lixo não pode virar atribuição: ${lixo}`);
}
assert.deepEqual(lerAtribuicao(null, T0), ATRIBUICAO_VAZIA);
assert.deepEqual(
  lerAtribuicao(JSON.stringify({ primeiro: { ts: T0 + 30 * DIA, utm_source: 'x' } }), T0),
  ATRIBUICAO_VAZIA,
  'toque do futuro (relógio errado ou adulterado) é descartado',
);
const adulterado = lerAtribuicao(JSON.stringify({ primeiro: { ts: T0, utm_source: 'x'.repeat(999), extra: 'y' } }), T0);
assert.equal(adulterado.primeiro?.utm_source?.length, 100, 'valor gigante vindo do storage é truncado');
assert.equal((adulterado.primeiro as Record<string, unknown>).extra, undefined, 'chave desconhecida é ignorada');

// ─── 4) cookie ──────────────────────────────────────────────────────────────
assert.equal(lerCookie('a=1; olli_attr=%7B%22x%22%3A1%7D; b=2', 'olli_attr'), '{"x":1}');
assert.equal(lerCookie('a=1', 'olli_attr'), null);
assert.equal(lerCookie('olli_attr=%E0%A4%A', 'olli_attr'), null, 'cookie malformado não lança');
const cookieLanding = montarCookie('olli_attr', '{"a":1}', 'olliorcamentos.online', 'https:');
assert.match(cookieLanding, /Domain=\.olliorcamentos\.online/);
assert.match(cookieLanding, /Max-Age=7776000/, '90 dias em segundos');
assert.match(cookieLanding, /SameSite=Lax/);
assert.match(cookieLanding, /; Secure/);
assert.match(montarCookie('olli_attr', 'x', 'app.olliorcamentos.online', 'https:'), /Domain=\.olliorcamentos\.online/);
assert.doesNotMatch(montarCookie('olli_attr', 'x', 'localhost', 'http:'), /Domain=|Secure/, 'em localhost o cookie não leva Domain nem Secure');
assert.doesNotMatch(montarCookie('olli_attr', 'x', 'evilolliorcamentos.online', 'https:'), /Domain=/, 'só o nosso domínio');

// ─── 5) captura ponta a ponta com ambiente falso ────────────────────────────
type Pote = { cookie: string; local: string | null };
function criarAmbiente(host: string, search: string, pathname: string, agora: number, pote: Pote): Ambiente {
  return {
    agora,
    host,
    protocolo: 'https:',
    pathname,
    search,
    lerCookies: () => pote.cookie,
    gravarCookie: (c) => {
      pote.cookie = c.split(';')[0]; // só nome=valor: é o que o navegador devolve
    },
    lerLocal: () => pote.local,
    gravarLocal: (v) => {
      pote.local = v;
    },
  };
}
const landing: Pote = { cookie: '', local: null };
const app: Pote = { cookie: '', local: null };

// visita orgânica: nada é gravado
assert.deepEqual(capturarAtribuicao(criarAmbiente('olliorcamentos.online', '', '/', T0, landing)), ATRIBUICAO_VAZIA);
assert.equal(landing.cookie, '', 'visitante orgânico não ganha cookie');
assert.equal(landing.local, null);

// anúncio → landing
capturarAtribuicao(criarAmbiente('olliorcamentos.online', '?utm_source=facebook&utm_medium=cpc&utm_campaign=c1&fbclid=F1', '/', T0, landing));
assert.ok(landing.cookie.startsWith(`${CHAVE_ATRIBUICAO}=`), 'landing grava o cookie');
assert.ok(landing.local, 'e o localStorage');
// o cookie é o que atravessa para app.olliorcamentos.online; o localStorage de lá começa vazio
app.cookie = landing.cookie;
const noApp = lerAtribuicaoSalva(criarAmbiente('app.olliorcamentos.online', '', '/auth/login', T0 + 1000, app));
assert.equal(noApp.primeiro?.utm_source, 'facebook', 'o painel enxerga o first-touch gravado pela landing');
assert.equal(noApp.ultimo?.fbclid, 'F1');

// painel abre com nova campanha na URL: first-touch mantido, last-touch trocado, tudo persistido
const depois = capturarAtribuicao(
  criarAmbiente('app.olliorcamentos.online', '?modo=cadastro&utm_source=google&utm_campaign=c2&gclid=G1', '/auth/login', T0 + 2 * DIA, app),
);
assert.equal(depois.primeiro?.utm_campaign, 'c1');
assert.equal(depois.ultimo?.utm_campaign, 'c2');
assert.ok(app.local?.includes('"c2"'), 'o painel guarda em localStorage (a URL some após o login)');
// depois do login a URL não tem mais o utm: o estado continua lá
const aposLogin = lerAtribuicaoSalva(criarAmbiente('app.olliorcamentos.online', '', '/inicio', T0 + 2 * DIA + 5000, app));
assert.equal(aposLogin.ultimo?.utm_campaign, 'c2');
// storage indisponível não derruba a captura
const semStorage: Ambiente = {
  ...criarAmbiente('olliorcamentos.online', '?utm_source=x', '/', T0, { cookie: '', local: null }),
  lerLocal: () => null,
  gravarLocal: () => {},
  gravarCookie: () => {},
};
assert.equal(capturarAtribuicao(semStorage).primeiro?.utm_source, 'x');

// ─── 6) propagação landing → painel ─────────────────────────────────────────
const link = 'https://app.olliorcamentos.online/auth/login?modo=cadastro&plano=pro&periodo=anual';
const anexado = new URL(anexarAtribuicaoAoLink(link, estado));
assert.equal(anexado.searchParams.get('modo'), 'cadastro', 'parâmetros do link são preservados');
assert.equal(anexado.searchParams.get('plano'), 'pro');
assert.equal(anexado.searchParams.get('utm_source'), 'google', 'propaga o last-touch');
assert.equal(anexado.searchParams.get('utm_campaign'), 'c2');
assert.equal(
  new URL(anexarAtribuicaoAoLink(`${link}&utm_source=meu`, estado)).searchParams.get('utm_source'),
  'meu',
  'nunca sobrescreve parâmetro que o link já tem',
);
for (const fora of [
  'https://olliorcamentos.online/planos/',
  'https://wa.me/5511941727487',
  'https://app.olliorcamentos.online.evil.test/auth/login',
  'http://app.olliorcamentos.online/auth/login',
  'https://evil.test/?u=app.olliorcamentos.online',
  '/blog/',
  'mailto:contato@olliorcamentos.online',
]) {
  assert.equal(anexarAtribuicaoAoLink(fora, estado), fora, `link fora do painel não muda: ${fora}`);
}
assert.equal(anexarAtribuicaoAoLink(link, ATRIBUICAO_VAZIA), link, 'sem atribuição o href fica idêntico');
assert.equal(anexarAtribuicaoAoLink('http://[', estado), 'http://[', 'href inválido não lança');

// ─── 7) o que vai para user_metadata ────────────────────────────────────────
const origem = montarOrigemUtm(
  registrarToque(ATRIBUICAO_VAZIA, lerToqueDaUrl('?utm_source=facebook&fbclid=F9', '/', T0)!),
  '_fbp=fb.1.1700000000000.111; olli_attr=x',
)!;
assert.equal(origem.primeiro_toque?.utm_source, 'facebook');
assert.equal(origem.primeiro_toque?.capturado_em, new Date(T0).toISOString());
assert.equal(origem.ultimo_toque?.fbclid, 'F9');
assert.equal(origem.fbp, 'fb.1.1700000000000.111');
assert.equal(origem.fbc, `fb.1.${T0}.F9`, 'sem cookie _fbc, monta a partir do fbclid');
assert.equal(montarOrigemUtm(estado, '_fbc=fb.1.5.REAL')?.fbc, 'fb.1.5.REAL', '_fbc do Pixel tem prioridade');
assert.equal(montarOrigemUtm(ATRIBUICAO_VAZIA, ''), null, 'nada a gravar = null');
assert.deepEqual(montarOrigemUtm(ATRIBUICAO_VAZIA, '_fbp=fb.1.2.3'), { fbp: 'fb.1.2.3' });
assert.equal((origem.primeiro_toque as Record<string, unknown>).ts, undefined, 'ts interno não vaza para o banco');

// ─── 8) Meta Pixel ──────────────────────────────────────────────────────────
assert.equal(META_PIXEL_ID, '4793168394059665');
assert.equal(rastreamentoPermitido({}), true);
assert.equal(rastreamentoPermitido({ globalPrivacyControl: true }), false, 'GPC desliga o Pixel');
assert.equal(rastreamentoPermitido({ doNotTrack: '1' }), false, 'DNT desliga o Pixel');
assert.equal(rastreamentoPermitido({ doNotTrack: '0' }), true);
assert.equal(urlTemSegredo('?code=abc', ''), true, 'retorno de OAuth PKCE');
assert.equal(urlTemSegredo('', '#access_token=x&refresh_token=y'), true, 'retorno implícito / recuperação de senha');
assert.equal(urlTemSegredo('?token_hash=x&type=recovery', ''), true);
assert.equal(urlTemSegredo('?modo=cadastro&utm_source=facebook', ''), false);
assert.equal(urlTemSegredo('?barcode=1', ''), false, 'não confunde parâmetro que só termina em code');
assert.match(novoEventId(), /^[0-9a-f-]{20,}$/i);

// Sem DOM (SSR/build): no-op silencioso
assert.equal(iniciarPixel(), false, 'sem window/document o Pixel não inicia');
pageView();

// ─── 7b) Consentimento (LGPD): três estados, silêncio não é aceite ─────────
assert.equal(lerConsentimentoDeCookies(''), null, 'sem resposta = null');
assert.equal(lerConsentimentoDeCookies('a=1; olli_consent=sim'), 'sim');
assert.equal(lerConsentimentoDeCookies('olli_consent=nao'), 'nao');
assert.equal(lerConsentimentoDeCookies('olli_consent=talvez'), null, 'valor estranho = não respondeu');
assert.equal(sinalDeRecusaDoNavegador({ globalPrivacyControl: true }), true);
assert.equal(sinalDeRecusaDoNavegador({ doNotTrack: '1' }), true);
assert.equal(sinalDeRecusaDoNavegador({}), false);
assert.match(
  montarCookieConsentimento('sim', 'app.olliorcamentos.online', 'https:'),
  /^olli_consent=sim; Max-Age=\d+; Path=\/; SameSite=Lax; Secure; Domain=\.olliorcamentos\.online$/,
  'cookie no domínio pai: landing e painel compartilham a resposta',
);
assert.doesNotMatch(montarCookieConsentimento('nao', 'localhost', 'http:'), /Domain=/);

const anexos: unknown[] = [];
const janela: {
  location: { search: string; hash: string; hostname: string; protocol: string };
  fbq?: unknown;
  dataLayer?: unknown[];
} = { location: { search: '?modo=cadastro', hash: '', hostname: 'app.olliorcamentos.online', protocol: 'https:' } };
const doc = {
  cookie: '',
  createElement: () => ({}) as Record<string, unknown>,
  head: { appendChild: (n: unknown) => anexos.push(n) },
};
Object.assign(globalThis, { window: janela, document: doc });
assert.equal(consentimentoAtual(), null);
assert.equal(iniciarPixel(), false, 'SEM consentimento o Pixel não carrega');
assert.equal(iniciarGoogleTag(), false, 'SEM consentimento a Google tag não carrega');
doc.cookie = 'olli_consent=nao';
assert.equal(iniciarPixel(), false, 'recusa = não carrega');
assert.equal(anexos.length, 0, 'nada de terceiro foi injetado sem aceite');
doc.cookie = 'olli_consent=sim';
assert.equal(iniciarPixel(), true);
assert.equal(iniciarPixel(), true, 'idempotente');
assert.equal(anexos.length, 1, 'injeta o fbevents.js uma única vez');
const script = anexos[0] as { src: string; async: boolean };
assert.equal(script.src, 'https://connect.facebook.net/en_US/fbevents.js');
assert.equal(script.async, true, 'carregamento assíncrono');
const fbq = janela.fbq as ((...args: unknown[]) => void) & { queue: unknown[][]; disablePushState?: boolean };
assert.equal(fbq.disablePushState, true, 'PageView de SPA fica manual');
assert.deepEqual(fbq.queue[0], ['set', 'autoConfig', false, META_PIXEL_ID], 'autoConfig desligado ANTES do init');
assert.deepEqual(fbq.queue[1], ['init', META_PIXEL_ID]);
pageView();
rastrear('Lead', { content_category: 'cadastro' });
rastrear('CompleteRegistration', { status: true, registration_method: 'email' }, 'evt-1');
assert.deepEqual(fbq.queue.slice(2), [
  ['track', 'PageView'],
  ['track', 'Lead', { content_category: 'cadastro' }],
  ['track', 'CompleteRegistration', { status: true, registration_method: 'email' }, { eventID: 'evt-1' }],
]);
const antes = fbq.queue.length;
janela.location.search = '?code=segredo-do-oauth';
pageView();
rastrear('CompleteRegistration', {}, 'evt-2');
assert.equal(fbq.queue.length, antes, 'URL com credencial nunca vai ao Meta');
janela.location.search = '';
janela.location.hash = '#access_token=segredo';
pageView();
assert.equal(fbq.queue.length, antes, 'nem no fragmento');
janela.location.hash = '';

// ─── 8b) Google tag (Google Ads) ────────────────────────────────────────────
assert.equal(GOOGLE_ADS_ID, 'AW-18229645817', 'tag da conta 779-101-4121');
assert.equal(googleTagConfigurada(), true, 'IDs configurados');
assert.equal(googleTagConfigurada('AW-PREENCHER', 'AW-PREENCHER/X'), false, 'placeholder = desligada');
assert.ok(CONVERSAO_CADASTRO.startsWith(`${GOOGLE_ADS_ID}/`));
assert.equal(iniciarGoogleTag(false), true);
assert.equal(iniciarGoogleTag(false), true, 'idempotente');
const scriptG = anexos[1] as { src: string; async: boolean };
assert.equal(scriptG.src, `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`);
assert.equal(scriptG.async, true);
const camada = (janela.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
assert.equal(camada[0][0], 'js');
assert.deepEqual(camada[1], ['config', GOOGLE_ADS_ID, { send_page_view: false }]);
googleConversaoCadastro('u-123');
assert.deepEqual(
  Array.from((janela.dataLayer ?? []).at(-1) as ArrayLike<unknown>),
  ['event', 'conversion', { send_to: CONVERSAO_CADASTRO, transaction_id: 'cadastro-u-123' }],
  'transaction_id deduplica',
);
const nAntes = janela.dataLayer?.length;
janela.location.search = '?code=x';
googleConversaoCadastro('u-123');
assert.equal(janela.dataLayer?.length, nAntes, 'URL com credencial nunca vai ao Google');
janela.location.search = '';

// ─── 9) fiação (fontes) ─────────────────────────────────────────────────────
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const layout = ler('../web/src/layouts/Layout.astro');
const scriptLanding = ler('../web/src/scripts/marketing.ts');
const gerarHeaders = ler('../web/scripts/gerar-headers.mjs');
const headersPainel = ler('../webapp/public/_headers');
const vercel = ler('../webapp/vercel.json');
const registro = ler('../webapp/src/pages/sys/login/register-form.tsx');
const store = ler('../webapp/src/store/userStore.ts');
const main = ler('../webapp/src/main.tsx');
const privacidade = ler('../src/content/legal/privacidade.ts');

assert.match(layout, /<script src="\.\.\/scripts\/marketing\.ts"><\/script>/, 'Layout carrega o marketing da landing');
assert.match(scriptLanding, /meta\[name="robots"\]\[content\*="noindex"\]/, 'páginas noindex ficam de fora');
assert.match(scriptLanding, /rastrear\("Lead"/, 'Lead no clique de CTA de cadastro');
assert.match(scriptLanding, /anexarAtribuicaoAoLink/, 'UTM propagado aos links do painel');
assert.match(gerarHeaders, /scriptSrc = \["'self'", CF_ANALYTICS_SCRIPT, META_SCRIPT, \.\.\.GOOGLE_SCRIPT/, 'CSP da landing libera fbevents.js e gtag.js');
assert.match(gerarHeaders, /img-src 'self' data: \$\{META_EVENTOS\} \$\{GOOGLE_EVENTOS/);
assert.match(gerarHeaders, /connect-src[^\n]*\$\{META_EVENTOS\}[^\n]*GOOGLE_EVENTOS/);
assert.match(gerarHeaders, /frame-src \$\{GOOGLE_FRAME/);
for (const csp of [headersPainel, vercel]) {
  assert.match(csp, /script-src 'self' https:\/\/static\.cloudflareinsights\.com https:\/\/connect\.facebook\.net https:\/\/www\.googletagmanager\.com/);
  assert.match(csp, /connect-src [^;]*https:\/\/www\.facebook\.com https:\/\/connect\.facebook\.net [^;]*https:\/\/www\.googleadservices\.com/);
  assert.match(csp, /frame-src https:\/\/td\.doubleclick\.net/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/, 'script-src continua sem unsafe-inline');
}
assert.match(registro, /\.\.\.origemUtmParaCadastro\(\)/, 'signUp envia origem_utm em options.data');
assert.match(registro, /registrarCadastroConcluido\("email", data\.user\?\.id\)/, 'CompleteRegistration no cadastro por e-mail, com o id que deduplica');
assert.match(scriptLanding, /mostrarBannerConsentimento/, 'landing mostra o aviso de cookies');
assert.match(registro, /identities\?\.length !== 0/, 'e-mail já cadastrado não vira conversão');
assert.match(store, /registrarNovaContaSocial/, 'cadastro social grava a origem via updateUser');
assert.match(main, /iniciarMarketing\(\);/, 'captura roda no boot do painel');
assert.match(privacidade, /Meta Pixel/, 'política de privacidade menciona o Pixel');
assert.match(privacidade, /tag do Google/, 'e a tag do Google');
assert.match(privacidade, /Consentimento \(art\. 7º, I\)/, 'medição de anúncio tem base em consentimento');
assert.match(privacidade, /olli_consent/, 'e o cookie da resposta');
assert.match(privacidade, /olli_attr/, 'e o cookie de origem');
assert.doesNotMatch(privacidade, /Não usamos cookies de publicidade nem rastreamento de terceiros/, 'a frase antiga (falsa com o Pixel) saiu');

// ─── 10) Worker: Conversions API (cadastro e assinatura) ────────────────────
const AGORA = Date.parse('2026-10-05T12:00:00Z');
const base = {
  event_id: 'cadastro-11111111-1111-1111-1111-111111111111',
  evento: 'CompleteRegistration',
  user_id: '11111111-1111-1111-1111-111111111111',
  email: '  Fulano@Exemplo.com ',
  event_time: '2026-10-05T11:00:00Z',
  medicao: { versao: 1, consentimento: 'sim', ua: 'Mozilla/5.0 teste' },
  origem: { fbp: 'fb.1.1.2', fbc: 'fb.1.3.ABC', primeiro_toque: { utm_source: 'facebook' } },
  plano: null as string | null,
};
type EventoCapi = { [k: string]: any };
const ev = ((await montarEventoMeta(base, AGORA)) as { evento: EventoCapi }).evento;
assert.equal(ev.event_id, base.event_id, 'mesmo event_id do navegador');
assert.equal(ev.action_source, 'website');
assert.equal(ev.event_time, Math.floor(Date.parse(base.event_time) / 1000));
assert.equal(ev.user_data.client_user_agent, 'Mozilla/5.0 teste');
assert.equal(ev.user_data.em[0], createHash('sha256').update('fulano@exemplo.com').digest('hex'), 'e-mail em SHA-256, normalizado');
assert.doesNotMatch(JSON.stringify(ev), /fulano|exemplo/i, 'e-mail em claro nunca sai');
assert.equal(ev.user_data.external_id[0], createHash('sha256').update(base.user_id).digest('hex'));
assert.equal(ev.user_data.fbp, 'fb.1.1.2');
assert.equal(ev.user_data.fbc, 'fb.1.3.ABC');
assert.deepEqual(await montarEventoMeta({ ...base, medicao: { versao: 1, consentimento: 'sim' } as typeof base.medicao }, AGORA), { pular: 'sem_user_agent' });
assert.deepEqual(await montarEventoMeta({ ...base, event_time: '2026-09-20T00:00:00Z' }, AGORA), { pular: 'fora_da_janela' }, 'CAPI só aceita 7 dias');
const assin = ((await montarEventoMeta({ ...base, evento: 'Subscribe', event_id: 'assinatura-x', plano: 'pro' }, AGORA)) as { evento: EventoCapi }).evento;
assert.deepEqual(assin.custom_data, { currency: 'BRL', value: 39, content_name: 'pro' });
assert.equal(valorDoPlano('pro'), 39, 'valor derivado de precosPlanos.ts');
assert.equal(valorDoPlano('gratis'), null);

assert.deepEqual(await processarConversoesAnuncios({}, { forcar: true }), { estado: 'desligado' }, 'sem token = desligado, sem fingir');
assert.deepEqual(await processarConversoesAnuncios({ META_CAPI_TOKEN: 'x' }, { agora: new Date('2026-10-05T12:04:00Z') }), { estado: 'fora_do_horario' });
const chamadas: { url: string; corpo: EventoCapi }[] = [];
const fetchFalso = async (url: string, opcoes: { body: string }) => {
  chamadas.push({ url, corpo: JSON.parse(opcoes.body) });
  if (url.includes('pendentes')) return new Response(JSON.stringify([base]), { status: 200 });
  if (url.includes('graph.facebook.com')) return new Response(JSON.stringify({ events_received: 1, fbtrace_id: 'T' }), { status: 200 });
  return new Response('1', { status: 200 });
};
const envW = { META_CAPI_TOKEN: 'tok', SUPABASE_URL: 'https://sb', SUPABASE_SERVICE_ROLE_KEY: 'k' };
const res = (await processarConversoesAnuncios(envW, { agora: new Date(AGORA + 3 * 60_000), fetchImpl: fetchFalso as unknown as typeof fetch })) as EventoCapi;
assert.equal(res.estado, 'ok');
assert.equal(res.enviados, 1);
assert.equal(chamadas.length, 3, '3 subrequests: pendências, envio, registro');
assert.match(chamadas[1].url, /\/v23\.0\/4793168394059665\/events\?access_token=tok$/);
assert.equal(chamadas[1].corpo.test_event_code, undefined);
assert.deepEqual(chamadas[2].corpo.p_itens.map((x: EventoCapi) => x.estado), ['enviado']);
chamadas.length = 0;
const resTeste = (await processarConversoesAnuncios({ ...envW, META_CAPI_TEST_CODE: 'TEST1' }, { forcar: true, agora: new Date(AGORA), fetchImpl: fetchFalso as unknown as typeof fetch })) as EventoCapi;
assert.equal(chamadas[1].corpo.test_event_code, 'TEST1');
assert.deepEqual(chamadas[2].corpo.p_itens.map((x: EventoCapi) => x.estado), ['erro'], 'evento de teste não fecha a pendência');
assert.equal(resTeste.enviados, 0);

console.log('PASSOU: parser, first/last-touch, expiração, cookie, propagação, origem_utm, consentimento, Pixel, Google tag, CSP, fiação e CAPI do worker.');
