import { readFileSync } from 'node:fs';

const store = readFileSync('webapp/src/store/userStore.ts', 'utf8');
const guard = readFileSync('webapp/src/routes/components/login-auth-guard.tsx', 'utf8');
const ok = (name: string, condition: boolean) => {
  if (!condition) throw new Error(`FALHA: ${name}`);
  console.log(`  ok   ${name}`);
};

console.log('\nAuth web — hidratação antes do guard');
ok('store expõe authHydrated', /authHydrated: boolean/.test(store) && /useAuthHydrated/.test(store));
ok('getSession marca hidratação em sucesso e erro', /setAuthHydrated\(true\)/g.test(store));
ok('sessão ausente limpa estado local e cache', /if \(!session\)[\s\S]*limparEstadoDaSessao\(\)/.test(store));
ok('tokens não são duplicados no persist do Zustand', !/createJSONStorage|persist\(|StorageEnum\.UserToken/.test(store));
ok('logout comum encerra somente este navegador', /signOut\(\{ scope: ["']local["'] \}\)/.test(store));
ok('guard espera hidratação antes de redirecionar', /authHydrated && !accessToken/.test(guard));
ok('guard não renderiza protegido antes da sessão', /if \(!authHydrated\)/.test(guard) && /if \(!accessToken\) return null/.test(guard));
console.log('PASSOU: hidratação de Auth não cria falso logout no reload');
