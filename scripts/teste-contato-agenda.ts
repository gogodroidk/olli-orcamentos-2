/**
 * CONTATO DA AGENDA EM 1 TOQUE (I-0045) + E-MAIL OPCIONAL (I-0053).
 *
 *     node scripts/teste-contato-agenda.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Trava: (1) normalização do contato escolhido (nome, telefone BR, e-mail);
 * (2) e-mail opcional — vazio passa, formato ruim não; (3) privacidade no fonte:
 * só o seletor do sistema (sem varrer a agenda), READ/WRITE_CONTACTS bloqueadas no
 * app.json; (4) e-mail ligado ponta a ponta (tipo, SQLite, nuvem, migration, telas).
 */
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { contatoParaCadastro, isValidEmail, telefoneDoContato } from '../src/utils/contatoAgenda.ts';

let passos = 0;
function ok(nome: string, fn: () => void) {
  try { fn(); passos++; } catch (e) { console.error(`FALHOU: ${nome}\n`, e); process.exit(1); }
}
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// 1) telefone
ok('celular com +55 e máscara do contato', () => assert.equal(telefoneDoContato('+55 (11) 95875-8030'), '(11) 95875-8030'));
ok('fixo 10 dígitos', () => assert.equal(telefoneDoContato('1133334444'), '(11) 3333-4444'));
ok('0055 e zero de operadora', () => {
  assert.equal(telefoneDoContato('005511958758030'), '(11) 95875-8030');
  assert.equal(telefoneDoContato('011958758030'), '(11) 95875-8030');
});
ok('sem DDD, curto ou internacional vira vazio', () => {
  assert.equal(telefoneDoContato('958758030'), '');
  assert.equal(telefoneDoContato('+1 415 555 2671'), '');
  assert.equal(telefoneDoContato(''), '');
  assert.equal(telefoneDoContato(null), '');
});

// 2) e-mail
ok('e-mail válido e inválido', () => {
  assert.equal(isValidEmail('ana@exemplo.com.br'), true);
  assert.equal(isValidEmail('  ana@exemplo.com '), true);
  for (const ruim of ['', '   ', 'ana', 'ana@', '@x.com', 'ana@x', 'a na@x.com', undefined, null]) {
    assert.equal(isValidEmail(ruim as string), false, String(ruim));
  }
  assert.equal(isValidEmail(`${'a'.repeat(250)}@x.com`), false);
});

// 3) contato escolhido
ok('contato completo: nome, 1º telefone BR, 1º e-mail válido', () => {
  const c = contatoParaCadastro({
    fullName: ' Maria Souza ',
    phones: [{ number: '+1 202 555 0100' }, { number: '(21) 98888-7777' }, { number: '1133334444' }],
    emails: [{ address: 'quebrado' }, { address: 'maria@x.com' }],
  });
  assert.deepEqual(c, { nome: 'Maria Souza', telefone: '(21) 98888-7777', email: 'maria@x.com' });
});
ok('nome vem de given+family quando não há fullName', () => {
  assert.equal(contatoParaCadastro({ givenName: 'João', familyName: 'Lima', phones: [] })?.nome, 'João Lima');
});
ok('sem nome = nada a preencher; sem telefone = telefone vazio', () => {
  assert.equal(contatoParaCadastro({ phones: [{ number: '11958758030' }] }), null);
  assert.equal(contatoParaCadastro(null), null);
  assert.deepEqual(contatoParaCadastro({ fullName: 'Só Nome' }), { nome: 'Só Nome', telefone: '', email: '' });
});

// 4) privacidade no fonte
ok('só o seletor do sistema; nada de varrer a agenda', () => {
  const svc = ler('src/services/contatoAgenda.ts');
  assert.match(svc, /Contact\.presentPicker\(\)/);
  for (const proibido of ['getAll', 'getContactsAsync', 'requestPermissionsAsync', 'getPermissionsAsync', 'hasAny', 'getCount']) {
    assert.equal(svc.includes(proibido), false, `service não pode usar ${proibido}`);
  }
  assert.match(svc, /ContactField\.FULL_NAME, ContactField\.PHONES, ContactField\.EMAILS/);
});
ok('READ/WRITE_CONTACTS bloqueadas e plugin do expo-contacts fora (ele as injetaria)', () => {
  const app = JSON.parse(ler('app.json')) as { expo: { plugins: unknown[]; android: { permissions?: string[]; blockedPermissions?: string[] } } };
  const bloq = app.expo.android.blockedPermissions ?? [];
  assert.ok(bloq.includes('android.permission.READ_CONTACTS'));
  assert.ok(bloq.includes('android.permission.WRITE_CONTACTS'));
  assert.equal((app.expo.android.permissions ?? []).some(p => /CONTACTS/.test(p)), false);
  assert.equal(JSON.stringify(app.expo.plugins).includes('expo-contacts'), false);
});

// 5) e-mail ponta a ponta
ok('e-mail ligado em tipo, SQLite, nuvem e migration', () => {
  assert.match(ler('src/types/index.ts'), /email\?: string;/);
  const db = ler('src/database/database.ts');
  assert.match(db, /SCHEMA_VERSION = 14/);
  assert.match(db, /addColumnIfMissing\(database, 'clientes', 'email', 'TEXT'\)/);
  const nuvem = ler('src/services/cloudSync.ts');
  assert.match(nuvem, /clientesSemColunaEmail/);
  assert.match(nuvem, /nomeiaColuna\(error, 'email'\)/);
  const mig = readdirSync(new URL('../supabase/migrations/', import.meta.url)).find(f => f.endsWith('_clientes_email.sql'));
  assert.ok(mig, 'migration clientes_email.sql');
  assert.match(ler(`supabase/migrations/${mig}`), /add column if not exists email text/);
});
ok('as duas telas de cadastro têm e-mail opcional e o botão da agenda', () => {
  for (const tela of ['src/steps/Step1Cliente.tsx', 'src/screens/ClientesScreen.tsx']) {
    const src = ler(tela);
    assert.match(src, /E-mail \(opcional\)/, tela);
    assert.match(src, /BotaoContatoAgenda/, tela);
    assert.match(src, /isValidEmail\(/, tela);
    // e-mail nunca obrigatório: o `if (!nome)` segue sendo a única trava de salvar
    assert.equal(/email[^\n]*required/.test(src), false, `${tela}: e-mail não pode ser required`);
  }
});

console.log(`teste-contato-agenda: ${passos} grupos OK`);
