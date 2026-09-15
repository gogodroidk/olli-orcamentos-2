import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { caminhoCallbackAuth, destinoDepoisDoLogin, lerIntencaoPlano } from '../webapp/src/olli/plano-intent.ts';

console.log('\nConversão Pro — continuidade de intenção sem checkout automático');

const anual = lerIntencaoPlano('?modo=cadastro&plano=pro&periodo=anual&returnTo=https://malicioso.test');
assert.deepEqual(anual, { plano: 'pro', periodo: 'anual' });
assert.equal(destinoDepoisDoLogin(anual), '/planos?plano=pro&periodo=anual&origem=landing');
assert.equal(caminhoCallbackAuth(anual), '/auth/login?plano=pro&periodo=anual');
assert.deepEqual(lerIntencaoPlano('?plano=pro&periodo=inventado'), { plano: 'pro', periodo: 'mensal' });
assert.equal(lerIntencaoPlano('?plano=admin&periodo=anual'), null, 'plano fora da allowlist é ignorado');
assert.equal(lerIntencaoPlano('?returnTo=https://malicioso.test'), null, 'returnTo sozinho nunca cria destino');
assert.equal(destinoDepoisDoLogin(null), null);
assert.equal(caminhoCallbackAuth(null), '/auth/login');

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const landing = ler('../web/src/components/PlanosPrecos.astro');
const css = ler('../web/src/styles/global.css');
const login = ler('../webapp/src/pages/sys/login/login-form.tsx');
const oauth = ler('../webapp/src/pages/sys/login/components/OAuthButtons.tsx');
const planos = ler('../webapp/src/pages/olli/planos/index.tsx');

assert.match(landing, /plano=pro&periodo=mensal/);
assert.match(landing, /plano=pro&periodo=anual/);
assert.match(css, /periodo-anual:checked\) \.cta-mensal[\s\S]*display: none/);
assert.match(css, /periodo-anual:checked\) \.cta-anual[\s\S]*display: block/);
assert.match(login, /destinoPosLogin \?\? GLOBAL_CONFIG\.defaultRoute/);
assert.match(oauth, /window\.location\.origin\}\$\{callbackAuthPath/);
assert.match(planos, /Nenhuma cobrança começa sem seu clique/);
assert.doesNotMatch(landing, /checkout[^\n]*automatic/i);

console.log('PASSOU: plano/período preservados, destino fechado e confirmação explícita mantida.');
