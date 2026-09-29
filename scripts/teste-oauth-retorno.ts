import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAMINHO_RETORNO_AUTH,
  classificarErroOAuth,
  criarRegistroFunilAuth,
  decidirRetornoNativo,
  ErroOAuth,
  erroDeTabelaAusente,
  type LinhaFunilAuth,
  lerRetornoOAuth,
  MOTIVOS_ERRO_OAUTH,
  mensagemErroOAuth,
  normalizarPlataforma,
  novaTentativaOAuth,
  urlSemParametrosOAuth,
} from '../src/services/oauthRetorno.ts';
import {
  CHAVE_INTENCAO_OAUTH,
  caminhoCallbackAuth,
  consumirIntencaoOAuth,
  guardarIntencaoOAuth,
} from '../webapp/src/olli/plano-intent.ts';
import { DESTINO_RETORNO_OAUTH, destinoResgateOAuth } from '../web/src/scripts/oauth-resgate.ts';

console.log('\nLogin social — retorno do OAuth nunca falha em silêncio (incidente 16–25/09)');

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};
const igual = <T>(a: T, b: T, msg: string) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

// ─── 1. Redirect SEM query (a causa raiz) ──────────────────────────────────────
igual(CAMINHO_RETORNO_AUTH, '/auth/login', 'retorno fixo do painel');
igual(caminhoCallbackAuth({ plano: 'pro', periodo: 'anual' }), '/auth/login', 'intenção de plano NÃO vai na query do redirect');
igual(caminhoCallbackAuth(null), '/auth/login', 'sem intenção, mesmo caminho');

// ─── 2. Leitura do retorno ─────────────────────────────────────────────────────
const CODE = '5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
igual(lerRetornoOAuth(`https://app.olliorcamentos.online/auth/login?code=${CODE}`), { tipo: 'codigo', codigo: CODE }, 'code na query');
igual(lerRetornoOAuth('https://app.olliorcamentos.online/auth/login'), { tipo: 'nenhum' }, 'sem parâmetros');
igual(lerRetornoOAuth(null), { tipo: 'nenhum' }, 'null');
igual(lerRetornoOAuth('não é url'), { tipo: 'nenhum' }, 'URL inválida não lança');
igual(
  lerRetornoOAuth('https://app.olliorcamentos.online/auth/login?error=access_denied&error_description=The+user+denied'),
  { tipo: 'erro', motivo: 'cancelado' },
  'negou no Google = cancelado',
);
igual(
  lerRetornoOAuth('https://app.olliorcamentos.online/auth/login#error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code'),
  { tipo: 'erro', motivo: 'provedor' },
  'erro no #hash também é lido',
);
igual(
  lerRetornoOAuth(`olliorcamentos://auth/callback?code=${CODE}`),
  { tipo: 'codigo', codigo: CODE },
  'deep link nativo',
);
igual(
  lerRetornoOAuth(`https://x.test/?code=${CODE}&error=invalid_request&error_description=bad_oauth_state`).tipo,
  'erro',
  'erro tem precedência sobre code',
);

// ─── 3. Classificação de erro (texto cru → motivo fechado) ─────────────────────
igual(classificarErroOAuth('bad_code_verifier', 'code challenge does not match previously saved code verifier'), 'navegador_trocado', 'PKCE sem verifier');
igual(classificarErroOAuth('flow_state_not_found', 'invalid flow state, no valid flow state found'), 'codigo_expirado', 'flow_state sumiu');
igual(classificarErroOAuth('flow_state_expired', null), 'codigo_expirado', 'flow_state vencido');
igual(classificarErroOAuth(null, 'TypeError: Failed to fetch'), 'rede', 'rede');
igual(classificarErroOAuth('provider_disabled', 'Unsupported provider: provider is not enabled'), 'provedor', 'provider desligado');
igual(classificarErroOAuth(null, 'algo inesperado'), 'desconhecido', 'fallback');
for (const motivo of MOTIVOS_ERRO_OAUTH) {
  const m = mensagemErroOAuth(motivo);
  ok(m.length > 20 && !/undefined|null/.test(m), `mensagem pt-BR para ${motivo}`);
  ok(!/flow|verifier|pkce|exchange/i.test(m), `mensagem de ${motivo} sem jargão técnico`);
}
ok(mensagemErroOAuth('cancelado', 'apple').includes('Apple'), 'mensagem cita o provedor');

const erro = new ErroOAuth('navegador_trocado');
igual(erro.name, 'ErroOAuth', 'nome do erro (traduzirErroAuth reconhece)');
igual(erro.motivo, 'navegador_trocado', 'motivo no erro');
ok(erro.mensagemUsuario === erro.message && erro.message.includes('navegador'), 'mensagem pronta no erro');

// ─── 4. Limpeza da URL ─────────────────────────────────────────────────────────
igual(
  urlSemParametrosOAuth(`https://app.olliorcamentos.online/auth/login?code=${CODE}&modo=cadastro`),
  'https://app.olliorcamentos.online/auth/login?modo=cadastro',
  'remove code e mantém o resto',
);
igual(
  urlSemParametrosOAuth('https://app.olliorcamentos.online/auth/login#error=x&error_description=y'),
  'https://app.olliorcamentos.online/auth/login',
  'remove erro do hash',
);

// ─── 5. Nativo: cancelar, dismiss com code capturado, erro ─────────────────────
const cb = 'olliorcamentos://auth/callback';
igual(decidirRetornoNativo({ type: 'success', url: `${cb}?code=${CODE}` }, null), { tipo: 'codigo', codigo: CODE }, 'sucesso normal');
igual(decidirRetornoNativo({ type: 'cancel' }, null), { tipo: 'cancelado' }, 'fechou a aba');
igual(decidirRetornoNativo({ type: 'dismiss' }, null), { tipo: 'cancelado' }, 'dismiss sem deep link');
igual(
  decidirRetornoNativo({ type: 'dismiss' }, `${cb}?code=${CODE}`),
  { tipo: 'codigo', codigo: CODE },
  'Android: dismiss DEPOIS de entregar o code — o code é aproveitado',
);
igual(decidirRetornoNativo({ type: 'success', url: cb }, null), { tipo: 'erro', motivo: 'sem_codigo' }, 'sucesso sem code é erro, não silêncio');
igual(decidirRetornoNativo({ type: 'success' }, null), { tipo: 'erro', motivo: 'sem_codigo' }, 'sucesso sem URL é erro');
igual(
  decidirRetornoNativo({ type: 'success', url: `${cb}?error=server_error&error_description=Database+error+saving+new+user` }, null),
  { tipo: 'erro', motivo: 'provedor' },
  'erro do GoTrue no deep link vira erro visível',
);
igual(
  decidirRetornoNativo({ type: 'success', url: `${cb}?error=access_denied` }, null),
  { tipo: 'cancelado' },
  'negou no Google = cancelado',
);

// ─── 6. Intenção de plano atravessa o redirect pelo sessionStorage ─────────────
function armazenamentoFalso() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
const agora = 1_780_000_000_000;
const s1 = armazenamentoFalso();
guardarIntencaoOAuth(s1, { plano: 'empresa', periodo: 'anual' }, agora);
igual(consumirIntencaoOAuth(s1, agora + 60_000), { plano: 'empresa', periodo: 'anual' }, 'intenção volta depois do OAuth');
igual(consumirIntencaoOAuth(s1, agora + 60_000), null, 'consumir apaga (não reaplica no próximo login)');
guardarIntencaoOAuth(s1, { plano: 'pro', periodo: 'mensal' }, agora);
igual(consumirIntencaoOAuth(s1, agora + 31 * 60_000), null, 'intenção vencida é descartada');
s1.setItem(CHAVE_INTENCAO_OAUTH, JSON.stringify({ plano: 'admin', periodo: 'anual', em: agora }));
igual(consumirIntencaoOAuth(s1, agora), null, 'storage adulterado não cria plano fora da allowlist');
s1.setItem(CHAVE_INTENCAO_OAUTH, '{quebrado');
igual(consumirIntencaoOAuth(s1, agora), null, 'JSON quebrado não lança');
guardarIntencaoOAuth(s1, { plano: 'pro', periodo: 'mensal' }, agora);
guardarIntencaoOAuth(s1, null, agora);
ok(!s1.m.has(CHAVE_INTENCAO_OAUTH), 'tentativa sem intenção apaga resto da anterior');
const quebrado = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => { throw new Error('bloqueado'); } };
guardarIntencaoOAuth(quebrado, { plano: 'pro', periodo: 'mensal' });
igual(consumirIntencaoOAuth(quebrado), null, 'storage bloqueado não quebra o login');

// ─── 7. Landing resgata o code que caiu no Site URL ───────────────────────────
igual(destinoResgateOAuth(`?code=${CODE}`, ''), `${DESTINO_RETORNO_OAUTH}?code=${CODE}`, 'code do GoTrue volta pro painel');
igual(destinoResgateOAuth('?code=PROMO10', ''), null, 'code que não é do GoTrue não redireciona');
igual(destinoResgateOAuth('', ''), null, 'landing normal fica');
igual(destinoResgateOAuth('?utm_source=google', ''), null, 'utm não redireciona');
const resgateErro = destinoResgateOAuth('', '#error=server_error&error_description=x');
ok(resgateErro?.startsWith(`${DESTINO_RETORNO_OAUTH}?`) && resgateErro.includes('error=server_error'), 'erro no hash também é repassado');
const resgateSujo = destinoResgateOAuth(`?code=${CODE}&next=https://malicioso.test`, '');
ok(resgateSujo === `${DESTINO_RETORNO_OAUTH}?code=${CODE}`, 'só parâmetros do OAuth são repassados (sem open redirect)');

// ─── 8. Funil sem PII, tolerante à tabela ausente ─────────────────────────────
ok(/^[0-9a-f-]{36}$/.test(novaTentativaOAuth()), 'tentativa é UUID');
igual(normalizarPlataforma('android'), 'android', 'plataforma');
igual(normalizarPlataforma('windows'), 'unknown', 'plataforma desconhecida');

const gravadas: LinhaFunilAuth[] = [];
const registrar = criarRegistroFunilAuth(async (linha) => {
  gravadas.push(linha);
  return { error: null };
});
const tentativa = novaTentativaOAuth();
await registrar('oauth_iniciado', { plataforma: 'web', tentativa });
await registrar('oauth_erro', { plataforma: 'web', tentativa, motivo: 'navegador_trocado' });
await registrar('oauth_sessao_criada', { plataforma: 'web', tentativa, motivo: 'rede' });
await registrar('oauth_erro', { plataforma: 'web', tentativa, motivo: 'texto livre com email@x.com' as never });
igual(gravadas.length, 4, 'grava cada evento');
igual(gravadas[0], { evento: 'oauth_iniciado', plataforma: 'web', provedor: 'google', motivo: null, tentativa }, 'início sem motivo');
igual(gravadas[1].motivo, 'navegador_trocado', 'erro com motivo');
igual(gravadas[2].motivo, null, 'sucesso nunca carrega motivo (constraint da tabela)');
igual(gravadas[3].motivo, 'desconhecido', 'motivo fora da lista vira desconhecido (nada livre vai pro banco)');
igual(Object.keys(gravadas[0]).sort(), ['evento', 'motivo', 'plataforma', 'provedor', 'tentativa'], 'só colunas sem PII');

let chamadas = 0;
const registrarSemTabela = criarRegistroFunilAuth(async () => {
  chamadas++;
  return { error: { code: 'PGRST205', message: "Could not find the table 'public.auth_funil_eventos' in the schema cache" } };
});
await registrarSemTabela('oauth_iniciado', { plataforma: 'web', tentativa });
await registrarSemTabela('oauth_erro', { plataforma: 'web', tentativa, motivo: 'rede' });
igual(chamadas, 1, 'sem a tabela, desliga depois do primeiro erro');
ok(erroDeTabelaAusente({ code: '42P01', message: 'relation does not exist' }), '42P01 = tabela ausente');
ok(!erroDeTabelaAusente({ code: '42501', message: 'permission denied' }), 'permissão negada NÃO desliga (é outro problema)');

const registrarQueLanca = criarRegistroFunilAuth(() => {
  throw new Error('boom');
});
await registrarQueLanca('oauth_iniciado', { plataforma: 'web', tentativa });
const registrarRejeita = criarRegistroFunilAuth(() => Promise.reject(new Error('offline')));
await registrarRejeita('oauth_iniciado', { plataforma: 'web', tentativa });
await criarRegistroFunilAuth(null)('oauth_iniciado', { plataforma: 'web', tentativa });
checks++; // chegou aqui = nenhuma das três lançou

// ─── 9. Fiação nos call-sites (contrato de código) ────────────────────────────
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const nativo = ler('../src/services/supabase.ts');
ok(!/cancel' \/ 'dismiss' → usuário fechou o navegador; silêncio/.test(nativo), 'nativo não trata dismiss como silêncio');
ok(/decidirRetornoNativo\(res, urlCapturada\)/.test(nativo), 'nativo usa a decisão testada');
ok(/Linking\.addEventListener\('url'/.test(nativo), 'nativo escuta o deep link durante a aba');
ok(/oauth_sessao_criada/.test(nativo) && /oauth_iniciado/.test(nativo), 'nativo registra o funil');
const entrar = ler('../src/screens/EntrarScreen.tsx');
ok(/res === 'cancelado'[\s\S]{0,80}Alert\.alert/.test(entrar), 'app avisa quando o login não conclui');
const traduz = ler('../src/utils/authErrors.ts');
ok(/ErroOAuth/.test(traduz) && /mensagemUsuario/.test(traduz), 'traduzirErroAuth mostra a mensagem do ErroOAuth');
const botoes = ler('../webapp/src/pages/sys/login/components/OAuthButtons.tsx');
ok(/guardarIntencaoOAuth\(window\.sessionStorage/.test(botoes), 'painel guarda a intenção antes do redirect');
ok(/registrarFunilAuth\("oauth_iniciado"/.test(botoes), 'painel registra oauth_iniciado');
const clienteWeb = ler('../webapp/src/lib/supabase.ts');
ok(clienteWeb.indexOf('retornoOAuthInicial') < clienteWeb.indexOf('createClient(SUPABASE_URL'), 'URL lida ANTES do supabase-js consumir o code');
const pagina = ler('../webapp/src/pages/sys/login/index.tsx');
ok(/useRetornoOAuth\(\)/.test(pagina), 'tela de login trata o retorno');
ok(/destinoDepoisDoOAuth\(\)/.test(pagina), 'intenção de plano sobrevive ao OAuth');
const landing = ler('../web/src/scripts/session-redirect.ts');
ok(/destinoResgateOAuth\(window\.location\.search, window\.location\.hash\)/.test(landing), 'landing resgata o code');
const migration = ler('../supabase/migrations/20260929210000_auth_funil_eventos.sql');
ok(/grant insert \(evento, plataforma, provedor, motivo, tentativa\)/.test(migration), 'migration: INSERT só nas colunas sem PII');
ok(!/grant select/i.test(migration), 'migration: anon não lê o funil');
ok(/force row level security/.test(migration), 'migration: RLS forçada');
for (const motivo of MOTIVOS_ERRO_OAUTH) ok(migration.includes(`'${motivo}'`), `migration aceita o motivo ${motivo}`);

console.log(`PASSOU: ${checks} verificações — redirect fixo, erro visível, code resgatado, funil sem PII.`);
