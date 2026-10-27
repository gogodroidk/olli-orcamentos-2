import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { destinatariosEmail, emailValido, normalizarEmail, validarEmailsCliente } from '../src/utils/emailsCliente.ts';

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
// nuvem sem a coluna não pode apagar o e-mail do aparelho
assert.match(sync, /clientesSemColunasEmail \? \(local\?\.email \?\? null\)/);
const mig = readFileSync(new URL('../supabase/migrations/20261030050000_clientes_email_secundario.sql', import.meta.url), 'utf8');
assert.match(mig, /add column if not exists email\s+text/);
assert.match(mig, /add column if not exists email2 text/);

console.log('teste-cliente-email: todas as verificações passaram');
