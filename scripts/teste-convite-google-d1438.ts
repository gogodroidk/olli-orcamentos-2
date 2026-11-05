/**
 * D1438-G23 — funcionário entra com o Google do e-mail do convite.
 *
 *     node scripts/teste-convite-google-d1438.ts
 *
 * Cobre a regra pura (app e worker têm de concordar), a leitura do retorno do
 * banco e o fato de o aceite continuar explícito. Não fala com rede nem com Auth.
 */
import { readFileSync } from 'node:fs';
import * as app from '../src/services/conviteGoogle.ts';
import * as worker from '../worker/src/conviteGoogle.js';

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

const TOKEN = 'abcdefghijklmnopqrstuv';
const EMAIL = 'Tecnico.Campo@Empresa.com';

console.log('\n── App e worker concordam ──');
for (const email of [EMAIL, '', 'sem-arroba', null]) {
  checar(
    `página ${JSON.stringify(email)}`,
    app.decidirPaginaConvite(email, TOKEN),
    worker.decidirPaginaConvite(email, TOKEN),
  );
}
checar('token ruim não gera URL', app.urlPainelLoginConvite('curto'), '');
checar('worker token ruim', worker.urlPainelLoginConvite('curto'), '');

console.log('\n── Google só com o e-mail do convite, sem escopo extra ──');
const params = app.queryParamsGoogleConvite(EMAIL);
checar('login_hint normalizado', params?.login_hint, 'tecnico.campo@empresa.com');
checar('pede para escolher a conta', params?.prompt, 'select_account');
checar('não pede escopo', params && 'scope' in params, false);
checar('e-mail inválido não manda hint', app.queryParamsGoogleConvite('x'), undefined);
checar('máscara esconde o nome', app.mascararEmailConvite(EMAIL), 't•••@empresa.com');

const pagina = app.decidirPaginaConvite(EMAIL, TOKEN);
checar('com e-mail não abre o app sozinho', pagina.abrirAppSozinho, false);
checar('url do painel', pagina.urlGoogle, `https://app.olliorcamentos.online/auth/login?convite=${TOKEN}`);
checar('sem e-mail abre o app', app.decidirPaginaConvite('', TOKEN).abrirAppSozinho, true);
checar('sem e-mail não tem botão Google', app.decidirPaginaConvite('', TOKEN).urlGoogle, '');

console.log('\n── Retorno do banco não vira sucesso calado ──');
checar('ok', app.interpretarAceiteConvite('ok'), { ok: true, jaAceito: false });
checar('já aceito', app.interpretarAceiteConvite('ja_aceito'), { ok: true, jaAceito: true });
checar('outro e-mail', app.interpretarAceiteConvite('erro:convite_outro_email').ok, false);
checar('exige google', app.interpretarAceiteConvite('erro:convite_exige_google').ok, false);
checar('vazio não é sucesso', app.interpretarAceiteConvite(null), { ok: false, codigo: 'desconhecido' });
checar(
  'mensagem não revela o e-mail do convite',
  app.mensagemAceiteConvite('outro_email').includes('@'),
  false,
);

console.log('\n── Quem pode aceitar ──');
checar(
  'google do e-mail certo',
  app.podeAceitarConvite({
    sabeEmail: true,
    temEmail: true,
    emailConvite: EMAIL,
    emailConta: 'tecnico.campo@empresa.com',
    temGoogle: true,
  }),
  { ok: true },
);
checar(
  'mesma caixa, sem google',
  app.podeAceitarConvite({
    sabeEmail: true,
    temEmail: true,
    emailConvite: EMAIL,
    emailConta: EMAIL,
    temGoogle: false,
  }).ok,
  false,
);
checar(
  'outra conta google',
  app.podeAceitarConvite({
    sabeEmail: true,
    temEmail: true,
    emailConvite: EMAIL,
    emailConta: 'outra@gmail.com',
    temGoogle: true,
  }).ok,
  false,
);
checar(
  'convite sem e-mail segue',
  app.podeAceitarConvite({ sabeEmail: true, temEmail: false, temGoogle: false }),
  { ok: true },
);
checar(
  'resumo fora do ar não trava o link',
  app.podeAceitarConvite({ sabeEmail: false, temEmail: false, temGoogle: false }),
  { ok: true },
);
checar(
  'sessão google pela identidade',
  app.sessaoTemGoogle({ identities: [{ provider: 'google' }], app_metadata: { provider: 'email' } }),
  true,
);
checar('sessão só senha', app.sessaoTemGoogle({ identities: [{ provider: 'email' }], app_metadata: { provider: 'email' } }), false);

console.log('\n── Resumo público ──');
checar(
  '200 com e-mail',
  app.lerResumoConvite(200, { ok: true, email: EMAIL, papel: 'tecnico', empresa: 'Frio Sul' }),
  { ok: true, temEmail: true, email: 'tecnico.campo@empresa.com', papel: 'tecnico', empresa: 'Frio Sul' },
);
checar('404', app.lerResumoConvite(404, { ok: false, erro: 'invalido' }), { ok: false, erro: 'invalido' });
checar('expirado', app.lerResumoConvite(200, { ok: false, erro: 'expirado' }), { ok: false, erro: 'expirado' });
checar('429 não vira convite vazio', app.lerResumoConvite(429, null), { ok: false, erro: 'indisponivel' });

console.log('\n── O token não vai na URL de retorno do Google ──');
checar('tira convite e deixa o code', app.buscaSemParametroConvite(`?convite=${TOKEN}&code=abc`), '?code=abc');
checar('só convite some', app.buscaSemParametroConvite(`?convite=${TOKEN}`), '');
const memoria = new Map<string, string>();
const armazenamento = {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => { memoria.set(k, v); },
  removeItem: (k: string) => { memoria.delete(k); },
};
app.guardarConvitePendente(armazenamento, TOKEN, 1_000);
checar('destino do convite', app.destinoDoConvitePendente(armazenamento, 1_000), '/equipe/aceitar');
checar('vence em 2h', app.lerConvitePendente(armazenamento, 1_000 + 2 * 60 * 60 * 1000 + 1), '');

console.log('\n── Migration e telas ──');
const sql = readFileSync(new URL('../supabase/migrations/20261103120000_convite_equipe_google.sql', import.meta.url), 'utf8');
checar('exige google no banco', sql.includes("return 'erro:convite_exige_google'"), true);
checar('exige o e-mail do convite', sql.includes("return 'erro:convite_outro_email'"), true);
checar('não rebaixa o dono', sql.includes("papel = 'owner'"), true);
checar('anon não executa', /revoke execute on function public\.aceitar_convite\(text\) from anon, public/.test(sql), true);
checar('não pede escopo no sql', sql.toLowerCase().includes('gmail'), false);

const tela = readFileSync(new URL('../src/screens/ConviteScreen.tsx', import.meta.url), 'utf8');
checar('app oferece Google no convite', tela.includes('Continuar com o Google'), true);
checar('app não aceita sozinho ao logar', tela.includes("setEstado({ fase: 'confirmar', token })"), true);

const painel = readFileSync(new URL('../webapp/src/pages/olli/equipe/aceitar.tsx', import.meta.url), 'utf8');
const inicioEfeito = painel.indexOf('useEffect(() => {');
const fimEfeito = painel.indexOf('}, []);', inicioEfeito);
const corpoEfeito = painel.slice(inicioEfeito, fimEfeito);
checar('painel tem o botão Aceitar convite', painel.includes('Aceitar convite'), true);
checar('painel não aceita dentro do efeito', corpoEfeito.includes('aceitar_convite'), false);
checar('o efeito não chama aceitar()', corpoEfeito.includes('aceitar()'), false);

const oauth = readFileSync(new URL('../webapp/src/pages/sys/login/components/OAuthButtons.tsx', import.meta.url), 'utf8');
checar('redirect do painel continua sem query', oauth.includes('callbackAuthPath'), true);
checar('hint só no google do convite', oauth.includes('provider === "google" && conviteToken'), true);

const login = readFileSync(new URL('../webapp/src/pages/sys/login/index.tsx', import.meta.url), 'utf8');
const bloco = login.slice(login.indexOf('if (token.accessToken)'));
const grava = bloco.indexOf('guardarConvitePendente(');
const destino = bloco.indexOf('destinoDoConvitePendente(');
checar('sessão já aberta ainda guarda o convite da URL', grava >= 0 && destino > grava, true);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
