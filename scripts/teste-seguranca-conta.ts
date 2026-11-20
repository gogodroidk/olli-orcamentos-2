/**
 * CQ-SEGURANCA-CONTA — contrato da tela "Minha conta" e do espaço lateral do painel.
 *
 * 1) Trocar a senha EXIGE a senha atual de quem já tem senha, e quem confere é o servidor
 *    (current_password no updateUser; nada de signInWithPassword, que derruba o nível do MFA).
 * 2) O painel não deixa mais ~350px vazios de cada lado em monitor largo: nenhum contêiner de
 *    tela pode voltar a 1280px (xl:max-w-screen-xl / max-w-6xl / max-w-7xl no topo da página).
 *
 * Roda com: node scripts/teste-seguranca-conta.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PAINEL = 'webapp/src';
const contaBruto = readFileSync(join(PAINEL, 'pages/olli/configuracoes/index.tsx'), 'utf8');
// Sem comentários de linha: o aviso no comentário cita signInWithPassword de propósito.
const conta = contaBruto.replace(/^\s*\/\/.*$/gm, '');
const layout = readFileSync(join(PAINEL, 'layouts/dashboard/main.tsx'), 'utf8');

function testar(nome: string, fn: () => void) {
  fn();
  console.log(`ok - ${nome}`);
}

testar('senha atual é obrigatória para quem já tem senha', () => {
  assert.match(conta, /if \(temSenha\) \{\s*if \(!conta\.senhaAtual\) throw new Error\("Para trocar a senha, digite a sua senha atual\."\)/);
});

testar('a senha atual vai ao servidor em current_password', () => {
  assert.match(conta, /atualizacao\.current_password = conta\.senhaAtual/);
  assert.ok(conta.indexOf('atualizacao.current_password') < conta.indexOf('supabase.auth.updateUser(atualizacao)'), 'current_password precisa entrar antes do updateUser');
});

testar('sem signInWithPassword na troca (derruba o MFA)', () => {
  assert.doesNotMatch(conta, /signInWithPassword/);
});

testar('conta só-Google cria a 1ª senha sem senha atual', () => {
  assert.match(conta, /setTemSenha\(\(user\.identities \?\? \[\]\)\.some\(\(i\) => i\.provider === "email"\)\)/);
});

testar('erros do servidor viram "A senha atual não confere"', () => {
  for (const codigo of ['current_password_invalid', 'current_password_mismatch', 'current_password_required']) {
    assert.ok(conta.includes(`"${codigo}"`), `falta tratar ${codigo}`);
  }
  assert.match(conta, /A senha atual não confere\. Nada foi alterado\./);
});

testar('campo Senha atual só aparece ao digitar nova senha, com autocomplete correto', () => {
  assert.match(conta, /temSenha && conta\.senha\.trim\(\) !== "" &&/);
  assert.match(conta, /autoComplete="current-password" required/);
});

testar('senha atual é limpa da memória depois de salvar', () => {
  assert.match(conta, /senha: "", senhaAtual: ""/);
});

testar('layout do painel não prende o conteúdo em 1280px', () => {
  assert.doesNotMatch(layout, /^\s*"xl:max-w-screen-xl"/m);
  assert.match(layout, /"max-w-\[1680px\]": !themeStretch/);
});

testar('nenhuma tela do painel volta a abrir com max-w-6xl/7xl no topo', () => {
  const ruins: string[] = [];
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) varrer(caminho);
      else if (caminho.endsWith('.tsx') && /mx-auto w-full max-w-(6|7)xl/.test(readFileSync(caminho, 'utf8'))) ruins.push(caminho);
    }
  };
  varrer(join(PAINEL, 'pages/olli'));
  assert.deepEqual(ruins, []);
});

console.log('Segurança da conta e largura do painel: tudo certo.');
