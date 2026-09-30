import { readFileSync } from 'node:fs';

const native = readFileSync('src/services/supabase.ts', 'utf8');
const autoRefresh = readFileSync('src/services/authAutoRefresh.ts', 'utf8');
const app = readFileSync('App.tsx', 'utf8');
const register = readFileSync('webapp/src/pages/sys/login/register-form.tsx', 'utf8');
const loginPage = readFileSync('webapp/src/pages/sys/login/index.tsx', 'utf8');
const reset = readFileSync('webapp/src/pages/sys/login/reset-form.tsx', 'utf8');
const novaSenha = readFileSync('webapp/src/pages/sys/login/nova-senha.tsx', 'utf8');
// O campo de e-mail do "esqueci a senha" mora no trilho compartilhado com o login por código.
const trilho = readFileSync('webapp/src/pages/sys/login/components/TrilhoCodigo.tsx', 'utf8');

const ok = (nome: string, condicao: boolean) => {
  if (!condicao) throw new Error(`FALHA: ${nome}`);
  console.log(`  ok   ${nome}`);
};

console.log('\nAuth OLLI — ciclo de sessão web + aplicativo');
ok('app encerra só a sessão local no logout comum', /signOut\(\{ scope: ['"]local['"] \}\)/.test(native));
ok('app inicia refresh ao voltar ao primeiro plano', /if \(estado === ['"]active['"]\) cliente\.auth\.startAutoRefresh\(\)/.test(autoRefresh));
ok('app pausa refresh fora do primeiro plano', /else cliente\.auth\.stopAutoRefresh\(\)/.test(autoRefresh));
ok('app registra um observador de primeiro plano', /AppState\.addEventListener\(['"]change['"], ajustarRefresh\)/.test(autoRefresh));
ok('raiz do app inicia e limpa o ciclo de refresh', /useEffect\(\(\) => iniciarAuthAutoRefreshNativo\(\), \[\]\)/.test(app));
ok('cadastro com sessão imediata entra no painel', /if \(data\.session\)[\s\S]*navigate\(/.test(register));
ok('cadastro mantém callback fechado e interno', /emailRedirectTo: `\$\{window\.location\.origin\}\$\{callbackAuthPath\}`/.test(register));
ok('login não renderiza formulário antes da hidratação', /if \(!authHydrated\)/.test(loginPage));
ok('OTP e QR sem backend não entram na árvore do login', !/MobileForm|QrCodeFrom/.test(loginPage));
ok(
  'recuperação identifica o campo de e-mail',
  /<TrilhoCodigo/.test(reset) && /<Label htmlFor="trilho-email">E-mail<\/Label>/.test(trilho) && /id="trilho-email"/.test(trilho),
);
ok('nova senha identifica os dois campos', /<FormLabel>Nova senha<\/FormLabel>/.test(novaSenha) && /<FormLabel>Confirme a nova senha<\/FormLabel>/.test(novaSenha));
console.log('PASSOU: sessão local, refresh nativo, hidratação e cadastro validados.');
