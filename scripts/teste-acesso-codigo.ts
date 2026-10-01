import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  avaliarSenha,
  CAMINHO_NOVA_SENHA,
  casasDoCodigo,
  classificarFalhaAcesso,
  codigoCompleto,
  destinoAposConfirmar,
  destinoSeguro,
  deveVerificar,
  ehErroDeContaInexistente,
  ESPERA_REENVIO_S,
  fracaoReenvio,
  lerConfirmacao,
  liberaReenvioEm,
  mensagemAguarde,
  mensagemFalhaCodigo,
  mensagemFalhaEnvio,
  mensagemFalhaLink,
  normalizarCodigo,
  reenvioDoLink,
  resultadoDoEnvio,
  rotuloReenvio,
  segundosDeEspera,
  segundosParaReenviar,
  TEXTO_CODIGO_ENVIADO,
  TEXTO_RECUPERACAO_ENVIADA,
  TIPOS_LINK_EMAIL,
  urlRecuperacaoSenha,
} from '../src/services/acessoCodigo.ts';
import { SENHA_MINIMA } from '../src/services/authPolicy.ts';

console.log('\nAcesso fácil e seguro — link /auth/confirm, código de 6 dígitos, reenvio e senha');

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};
const igual = <T>(a: T, b: T, msg: string) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

const PAINEL = 'https://app.olliorcamentos.online';
const HASH = 'pkce_4b1d0c9e7f2a8b3c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80';

// ─── 1. Contrato do link ───────────────────────────────────────────────────────
igual(urlRecuperacaoSenha(), `${PAINEL}/auth/confirm?next=/auth/nova-senha`, 'redirectTo do esqueci a senha = contrato');
igual(CAMINHO_NOVA_SENHA, '/auth/nova-senha', 'recuperação termina em /auth/nova-senha');
for (const t of ['signup', 'recovery', 'magiclink', 'email_change', 'invite'] as const) {
  ok(TIPOS_LINK_EMAIL.includes(t), `tipo ${t} aceito`);
}

// ─── 2. Parsing do /auth/confirm ───────────────────────────────────────────────
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?token_hash=${HASH}&type=recovery&next=/auth/nova-senha`),
  { tipo: 'token', tokenHash: HASH, tipoLink: 'recovery', destino: '/auth/nova-senha' },
  'recovery com next',
);
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?token_hash=${HASH}&type=recovery`),
  { tipo: 'token', tokenHash: HASH, tipoLink: 'recovery', destino: '/auth/nova-senha' },
  'recovery SEM next ainda vai definir a senha',
);
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?token_hash=${HASH}&type=recovery&next=/dashboard`),
  { tipo: 'token', tokenHash: HASH, tipoLink: 'recovery', destino: '/auth/nova-senha' },
  'recovery ignora next diferente (senha não fica para trás)',
);
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?token_hash=${HASH}&type=signup`, '/inicio'),
  { tipo: 'token', tokenHash: HASH, tipoLink: 'signup', destino: '/inicio' },
  'signup sem next vai para o padrão',
);
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?token_hash=${HASH}&type=magiclink&next=%2Fplanos%3Fplano%3Dpro`, '/inicio'),
  { tipo: 'token', tokenHash: HASH, tipoLink: 'magiclink', destino: '/planos?plano=pro' },
  'magiclink respeita next interno (codificado)',
);
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?token_hash=${HASH}&type=email_change`, '/inicio'),
  { tipo: 'token', tokenHash: HASH, tipoLink: 'email_change', destino: '/inicio' },
  'email_change',
);
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?token_hash=${HASH}&type=invite`, '/inicio').tipo === 'token' &&
    (lerConfirmacao(`${PAINEL}/auth/confirm?token_hash=${HASH}&type=invite`) as { destino: string }).destino,
  '/auth/nova-senha',
  'convite também define senha',
);
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?token_hash=${HASH}&type=hackeado`),
  { tipo: 'erro', motivo: 'incompleto', tipoLink: null },
  'tipo fora da lista = link incompleto',
);
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?type=recovery`),
  { tipo: 'erro', motivo: 'incompleto', tipoLink: 'recovery' },
  'sem token_hash = incompleto, mas lembra o tipo para o reenvio',
);
igual(lerConfirmacao(`${PAINEL}/auth/confirm`), { tipo: 'erro', motivo: 'incompleto', tipoLink: null }, 'sem nada');
igual(lerConfirmacao('não é url'), { tipo: 'erro', motivo: 'incompleto', tipoLink: null }, 'URL inválida não lança');
igual(lerConfirmacao(null), { tipo: 'erro', motivo: 'incompleto', tipoLink: null }, 'null não lança');
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?token_hash=${'a'.repeat(600)}&type=signup`).tipo,
  'erro',
  'token absurdo é recusado',
);
// Template antigo (PKCE): o GoTrue já validou e mandou ?code=.
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?next=/auth/nova-senha&code=5f0c1a2b-3c4d`, '/inicio'),
  { tipo: 'codigo_pkce', destino: '/auth/nova-senha' },
  'code PKCE do template antigo espera a sessão e segue o next',
);
// Erros devolvidos pelo GoTrue no #hash (link vencido/usado).
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?next=/auth/nova-senha#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`),
  { tipo: 'erro', motivo: 'expirado', tipoLink: null },
  'otp_expired no hash = expirado',
);
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?type=recovery&error=server_error`),
  { tipo: 'erro', motivo: 'desconhecido', tipoLink: 'recovery' },
  'erro genérico do GoTrue',
);

// ─── 3. Open redirect ──────────────────────────────────────────────────────────
igual(destinoSeguro('/orcamentos', '/x'), '/orcamentos', 'caminho interno passa');
for (const ruim of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', 'evil.com', '/a\u0000b', '', null, undefined, `/${'a'.repeat(600)}`]) {
  igual(destinoSeguro(ruim as string, '/x'), '/x', `bloqueia ${JSON.stringify(ruim)?.slice(0, 30)}`);
}
igual(
  lerConfirmacao(`${PAINEL}/auth/confirm?token_hash=${HASH}&type=magiclink&next=//evil.com`, '/inicio'),
  { tipo: 'token', tokenHash: HASH, tipoLink: 'magiclink', destino: '/inicio' },
  'next externo vira o padrão',
);
igual(destinoAposConfirmar('signup', '/auth/confirm?token_hash=x', '/inicio'), '/inicio', 'nunca volta para a própria confirmação');

// ─── 4. Estados de erro ────────────────────────────────────────────────────────
igual(classificarFalhaAcesso({ code: 'otp_expired', message: 'Token has expired or is invalid' }), 'expirado', 'otp_expired');
igual(classificarFalhaAcesso({ message: 'Token has expired or is invalid' }), 'expirado', 'mensagem sem code');
igual(classificarFalhaAcesso({ code: 'over_email_send_rate_limit', status: 429, message: 'For security purposes, you can only request this after 42 seconds.' }), 'limite', 'limite de envio');
igual(classificarFalhaAcesso({ status: 429, message: 'x' }), 'limite', '429 é limite');
igual(classificarFalhaAcesso({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), 'rede', 'rede');
igual(classificarFalhaAcesso({ code: 'email_address_invalid', message: 'Email address "x" is invalid' }), 'email_invalido', 'e-mail inválido NÃO vira "expirado"');
igual(classificarFalhaAcesso(new Error('boom')), 'desconhecido', 'desconhecido');
igual(classificarFalhaAcesso(null), 'desconhecido', 'null');

igual(segundosDeEspera({ message: 'For security purposes, you can only request this after 42 seconds.' }), 42, 'lê os segundos pedidos');
igual(segundosDeEspera({ message: 'email rate limit exceeded' }), ESPERA_REENVIO_S, 'sem número = espera padrão');
igual(segundosDeEspera({ message: 'after 0 seconds' }), 1, 'nunca menos de 1s');

// ─── 5. Anti-enumeração ────────────────────────────────────────────────────────
ok(ehErroDeContaInexistente({ code: 'otp_disabled', message: 'Signups not allowed for otp' }), 'otp_disabled = sem conta');
ok(ehErroDeContaInexistente({ message: 'Signups not allowed for otp' }), 'mensagem sem code');
ok(!ehErroDeContaInexistente({ code: 'otp_expired' }), 'expirado não é "sem conta"');
igual(resultadoDoEnvio(null), { tipo: 'enviado' }, 'sem erro = enviado');
igual(
  resultadoDoEnvio({ code: 'otp_disabled', status: 422, message: 'Signups not allowed for otp' }),
  resultadoDoEnvio(null),
  'e-mail SEM conta responde IGUAL a e-mail com conta',
);
igual(resultadoDoEnvio({ status: 429, message: 'you can only request this after 17 seconds' }), { tipo: 'aguarde', segundos: 17 }, 'limite vira "aguarde Xs"');
igual(resultadoDoEnvio({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), { tipo: 'erro', motivo: 'rede' }, 'rede vira erro');
for (const texto of [TEXTO_CODIGO_ENVIADO, TEXTO_RECUPERACAO_ENVIADA]) {
  ok(/^Se houver uma conta/.test(texto), 'texto de envio nunca afirma que a conta existe');
  ok(!/não (existe|encontrad)/i.test(texto), 'nem que não existe');
}
ok(/Aguarde 42s/.test(mensagemAguarde(41.2)), 'aguarde arredonda para cima');
ok(/aguarde|Aguarde/.test(mensagemFalhaEnvio('limite')), 'limite sempre diz aguarde');
for (const m of ['expirado', 'incompleto', 'limite', 'email_invalido', 'rede', 'desconhecido'] as const) {
  ok(mensagemFalhaCodigo(m).length > 10, `mensagem de código para ${m}`);
  const l = mensagemFalhaLink(m, 'recovery');
  ok(l.titulo && l.texto, `mensagem de link para ${m}`);
  ok(!/conta (não )?existe/i.test(mensagemFalhaCodigo(m) + l.texto), `${m} não revela conta`);
}
ok(/expirou ou já foi usado/.test(mensagemFalhaLink('expirado', 'recovery').titulo), 'expirado/já usado em linguagem humana');
ok(/nova senha/.test(mensagemFalhaLink('expirado', 'recovery').texto), 'diz qual link era');

igual(reenvioDoLink('recovery'), 'recuperacao', 'reenvio de recuperação');
igual(reenvioDoLink('signup'), 'confirmacao_cadastro', 'reenvio de cadastro');
igual(reenvioDoLink('email_change'), 'troca_email', 'reenvio de troca de e-mail');
igual(reenvioDoLink('invite'), 'nenhum', 'convite não se reenvia sozinho');
igual(reenvioDoLink('magiclink'), 'codigo_login', 'magiclink vira código de login');
igual(reenvioDoLink(null), 'codigo_login', 'sem tipo vira código de login');

// ─── 6. Regra de reenvio ───────────────────────────────────────────────────────
const T0 = 1_000_000;
igual(liberaReenvioEm({ tipo: 'enviado' }, T0), T0 + ESPERA_REENVIO_S * 1000, 'enviado trava 60s');
igual(liberaReenvioEm({ tipo: 'aguarde', segundos: 17 }, T0), T0 + 17_000, 'aguarde trava o que o servidor pediu');
igual(liberaReenvioEm({ tipo: 'erro', motivo: 'rede' }, T0), null, 'erro de rede libera na hora');
igual(segundosParaReenviar(null, T0), 0, 'sem envio = liberado');
igual(segundosParaReenviar(T0 + 60_000, T0), 60, '60s no início');
igual(segundosParaReenviar(T0 + 60_000, T0 + 59_001), 1, 'arredonda para cima (nunca mostra 0 travado)');
igual(segundosParaReenviar(T0 + 60_000, T0 + 60_000), 0, 'libera no segundo exato');
igual(segundosParaReenviar(T0 + 60_000, T0 + 90_000), 0, 'nunca negativo');
igual(segundosParaReenviar(Number.NaN, T0), 0, 'NaN não trava');
igual(rotuloReenvio(42), 'Reenviar código em 42s', 'rótulo com contagem');
igual(rotuloReenvio(0), 'Reenviar código', 'rótulo liberado');
igual(fracaoReenvio(30), 0.5, 'contador circular na metade');
igual(fracaoReenvio(0), 0, 'contador vazio');
igual(fracaoReenvio(999), 1, 'contador nunca passa de 1');

// ─── 7. Lógica pura do campo de código ─────────────────────────────────────────
igual(normalizarCodigo('123456'), '123456', 'digitado');
igual(normalizarCodigo('123 456'), '123456', 'colado com espaço');
igual(normalizarCodigo('123-456'), '123456', 'colado com hífen');
igual(normalizarCodigo('Seu código é 482913. Vale 10 min'), '482913', 'frase do e-mail: pega o bloco de 6 (ignora o 10)');
igual(normalizarCodigo('12a3'), '123', 'só dígitos');
igual(normalizarCodigo('12345678'), '123456', 'corta no tamanho');
igual(normalizarCodigo(null), '', 'null');
ok(codigoCompleto('123456'), 'completo');
ok(!codigoCompleto('12345'), 'incompleto');
ok(!codigoCompleto('12345a'), 'com letra');
const casas = casasDoCodigo('12');
igual(casas.length, 6, '6 casas');
igual(casas.map((c) => c.digito).join(''), '12', 'dígitos nas casas');
igual(casas.findIndex((c) => c.ativa), 2, 'a próxima casa é a ativa');
igual(casasDoCodigo('123456').some((c) => c.ativa), false, 'cheio: nenhuma ativa');
igual(casasDoCodigo('').findIndex((c) => c.ativa), 0, 'vazio: a primeira');
ok(deveVerificar('123456', 'digitando'), 'verifica quando completa');
ok(deveVerificar('123456', 'erro'), 'pode tentar de novo depois do erro');
ok(!deveVerificar('123456', 'verificando'), 'nunca duas verificações ao mesmo tempo');
ok(!deveVerificar('123456', 'sucesso'), 'nada depois do sucesso');
ok(!deveVerificar('12345', 'digitando'), 'incompleto não verifica');

// ─── 8. Força da senha ─────────────────────────────────────────────────────────
igual(avaliarSenha('', SENHA_MINIMA).nivel, 'vazia', 'vazia');
igual(avaliarSenha('abc1', SENHA_MINIMA).valida, false, 'curta');
igual(avaliarSenha('abcdefgh', SENHA_MINIMA).faltas, ['Inclua pelo menos um número'], 'sem número');
igual(avaliarSenha('12345678', SENHA_MINIMA).valida, false, 'só números e óbvia');
ok(avaliarSenha('12345678', SENHA_MINIMA).faltas.some((f) => /óbvias/.test(f)), 'sequência óbvia avisada');
igual(avaliarSenha('senha123', SENHA_MINIMA).valida, false, '"senha123" recusada');
igual(avaliarSenha('aaaaaaa1', SENHA_MINIMA).valida, true, 'regra mínima atendida');
igual(avaliarSenha('carro2024', SENHA_MINIMA).nivel, 'media', 'mínimo = razoável');
igual(avaliarSenha('Carro-azul-2024', SENHA_MINIMA).nivel, 'forte', 'longa + símbolo + maiúscula = forte');
igual(avaliarSenha('ção12345', SENHA_MINIMA).valida, true, 'acento conta como letra');

// ─── 9. Fiação: as telas usam o contrato ───────────────────────────────────────
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const entrar = ler('src/screens/EntrarScreen.tsx');
const acessoApp = ler('src/components/auth/AcessoPorCodigo.tsx');
const servicoApp = ler('src/services/supabase.ts');
const campoApp = ler('src/components/auth/CampoCodigo.tsx');
ok(!/resetPasswordForEmail\(e\)/.test(entrar), 'app não pede recuperação sem redirectTo');
ok(/urlRecuperacaoSenha\(\)/.test(servicoApp), 'app usa o redirectTo do contrato');
ok(/shouldCreateUser:\s*false/.test(servicoApp), 'login por código NÃO cria conta no app');
ok(/type:\s*'recovery'/.test(servicoApp) && /type:\s*'email'/.test(servicoApp), 'app verifica recovery e login por código');
ok(/oneTimeCode/.test(campoApp) && /one-time-code/.test(campoApp) && /sms-otp/.test(campoApp), 'campo do app aceita autofill do código');
ok(/Haptics|vibrar\(/.test(campoApp) || /Haptics|vibrar\(/.test(acessoApp), 'haptic no app');
ok(/useReducedMotion/.test(campoApp), 'app respeita Reduzir movimento');
ok(/resultadoDoEnvio/.test(acessoApp), 'app aplica a regra anti-enumeração');

const confirmar = ler('webapp/src/pages/sys/login/confirmar.tsx');
const reset = ler('webapp/src/pages/sys/login/reset-form.tsx');
const codigoForm = ler('webapp/src/pages/sys/login/codigo-form.tsx');
const otpWeb = ler('webapp/src/pages/sys/login/components/CodigoOtp.tsx');
const otpCss = ler('webapp/src/pages/sys/login/components/codigo-otp.css');
const rotas = ler('webapp/src/routes/sections/auth.tsx');
ok(/verifyOtp\(\{\s*token_hash/.test(confirmar), '/auth/confirm usa verifyOtp com token_hash');
ok(/lerConfirmacao/.test(confirmar), '/auth/confirm usa o parser testado');
// O supabase-js apaga o ?code= da barra ao trocar o PKCE, e a página é lazy: ela
// precisa ler a URL de entrada guardada antes do client, senão vira "Link incompleto".
const libSupabaseWeb = ler('webapp/src/lib/supabase.ts');
ok(
  /export const urlDeEntrada[\s\S]*?window\.location\.href[\s\S]*?createClient\(/.test(libSupabaseWeb),
  'painel guarda a URL de entrada ANTES de criar o client',
);
ok(
  /lerConfirmacao\(urlDaConfirmacao\(\)/.test(confirmar) && /urlDeEntrada/.test(confirmar),
  '/auth/confirm lê a URL de entrada quando o supabase-js já apagou o ?code=',
);
ok(/"confirm"/.test(rotas) && /"nova-senha"/.test(rotas), 'rotas /auth/confirm e /auth/nova-senha existem');
ok(/path: "nova-senha"/.test(rotas), 'rota antiga /nova-senha continua viva (e-mails já enviados)');
ok(/urlRecuperacaoSenha\(\)/.test(reset), 'painel usa o redirectTo do contrato');
ok(/shouldCreateUser:\s*false/.test(codigoForm), 'login por código NÃO cria conta no painel');
ok(/aria-live/.test(otpWeb), 'erro e sucesso anunciados para leitor de tela');
ok(/prefers-reduced-motion:\s*reduce/.test(otpCss), 'CSS tem caminho sem movimento');
// Motion: só transform/opacity, nada de número mágico.
const keyframes = otpCss.match(/@keyframes[\s\S]*?\n\}/g) ?? [];
ok(keyframes.length >= 3, 'keyframes de entrada, tremida e sucesso');
for (const k of keyframes) {
  const props = [...k.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]);
  ok(props.every((p) => p === 'transform' || p === 'opacity'), `keyframe só anima transform/opacity (${props.join(',')})`);
}
ok(!/\d+ms/.test(otpCss.replace(/--motion-[a-z-]+:\s*[^;]+;/g, '')), 'durações vêm dos tokens --motion-*');

console.log(`  ${checks} verificações OK\n`);
