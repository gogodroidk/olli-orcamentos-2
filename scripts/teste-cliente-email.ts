import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { destinatariosEmail, escolherEmailNoPull, emailValido, normalizarEmail, validarEmailsCliente } from '../src/utils/emailsCliente.ts';

// normalizar: vazio é "não informado", nunca string vazia
assert.equal(normalizarEmail('  Ana@X.com '), 'ana@x.com');
assert.equal(normalizarEmail('   '), undefined);
assert.equal(normalizarEmail(undefined), undefined);
assert.equal(normalizarEmail(null), undefined);

assert.equal(emailValido('a@b.co'), true);
assert.equal(emailValido('a@b'), false);
assert.equal(emailValido('a b@c.com'), false);
assert.equal(emailValido(`${'x'.repeat(250)}@b.co`), false);

// validação: ambos vazios ok; segundo sem primeiro, repetido e inválido recusam
assert.equal(validarEmailsCliente('', ''), null);
assert.equal(validarEmailsCliente('a@b.co', ''), null);
assert.equal(validarEmailsCliente('a@b.co', 'c@d.co'), null);
assert.equal(validarEmailsCliente('a@b', '')?.campo, 'email');
assert.equal(validarEmailsCliente('a@b.co', 'c@d')?.campo, 'email2');
assert.equal(validarEmailsCliente('', 'c@d.co')?.campo, 'email');
assert.equal(validarEmailsCliente('A@B.co', 'a@b.CO')?.campo, 'email2');

// destinatários: principal primeiro, sem repetir, sem inválido
assert.deepEqual(destinatariosEmail({}), []);
assert.deepEqual(destinatariosEmail({ email: 'a@b.co', email2: 'c@d.co' }), ['a@b.co', 'c@d.co']);
assert.deepEqual(destinatariosEmail({ email: 'a@b.co', email2: 'A@B.co' }), ['a@b.co']);
assert.deepEqual(destinatariosEmail({ email: 'lixo', email2: 'c@d.co' }), ['c@d.co']);

// app e painel gravam as mesmas colunas na nuvem; migration cria as duas.
const sync = readFileSync(new URL('../src/services/cloudSync.ts', import.meta.url), 'utf8');
const painel = readFileSync(new URL('../webapp/src/olli/contrato.ts', import.meta.url), 'utf8');
for (const src of [sync, painel]) {
  assert.match(src, /email:\s*c\.email \?\? null/);
  assert.match(src, /email2:\s*c\.email2 \?\? null/);
}
// nuvem sem a coluna, ou push que deixou o e-mail de fora, não apaga o do aparelho
assert.match(sync, /escolherEmailNoPull/);
assert.match(sync, /marcarEmailForaDoPush/);
assert.match(sync, /esquecerEmailForaDoPush/);
assert.equal(sync.includes('20261030050000'), false);
assert.equal(sync.includes('30/10'), false);

const migUrl = new URL('../supabase/migrations/20261106053000_clientes_email_secundario.sql', import.meta.url);
const mig = readFileSync(migUrl, 'utf8');
assert.match(mig, /add column if not exists email\s+text/);
assert.match(mig, /add column if not exists email2 text/);
assert.equal(existsSync(new URL('../supabase/migrations/20261030050000_clientes_email_secundario.sql', import.meta.url)), false);

const painelMut = readFileSync(new URL('../webapp/src/olli/mutacoes.ts', import.meta.url), 'utf8');
const form = readFileSync(new URL('../webapp/src/pages/olli/clientes/FormCliente.tsx', import.meta.url), 'utf8');
const tipos = readFileSync(new URL('../src/types/index.ts', import.meta.url), 'utf8');
assert.equal(painelMut.includes('30/10'), false);
assert.equal(painelMut.includes('sexta'), false);
assert.match(painelMut, /ainda não guarda o e-mail do cliente/);
assert.equal(form.includes('Para enviar orçamento e recibo.'), false);
assert.match(form, /Opcional\. Fica no cadastro do cliente\./);
assert.equal(tipos.includes('orçamento/recibo vão para os dois'), false);

// pull: marca ligada e nuvem vazia conserva o aparelho; sem marca, null remoto vence;
// nuvem com e-mail vence mesmo com a marca (outro aparelho já gravou de verdade).
assert.deepEqual(
  escolherEmailNoPull({ email: null, email2: null }, { email: 'a@b.co', email2: 'c@d.co' }, true),
  { email: 'a@b.co', email2: 'c@d.co' },
);
assert.deepEqual(
  escolherEmailNoPull({ email: null, email2: null }, { email: 'a@b.co', email2: null }, false),
  { email: null, email2: null },
);
assert.deepEqual(
  escolherEmailNoPull({ email: 'c@d.co', email2: null }, { email: 'a@b.co', email2: null }, true),
  { email: 'c@d.co', email2: null },
);

console.log('teste-cliente-email: todas as verificações passaram');
