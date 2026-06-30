import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageJson = JSON.parse(read('package.json'));
const appJson = JSON.parse(read('app.json'));
const supabaseTs = read('src/services/supabase.ts');
const appTsx = read('App.tsx');
const navigatorTsx = read('src/navigation/AppNavigator.tsx');
const entrarTsx = read('src/screens/EntrarScreen.tsx');
const contaTsx = read('src/screens/ContaScreen.tsx');
const authCallbackTsx = read('src/screens/AuthCallbackScreen.tsx');
const docsSupabase = read('docs/SUPABASE.md');

const deps = packageJson.dependencies ?? {};
for (const dep of ['expo-auth-session', 'expo-web-browser', 'expo-linking']) {
  assert(deps[dep], `Missing dependency: ${dep}`);
}

assert(appJson.expo?.scheme === 'olliorcamentos', 'app.json must define expo.scheme = "olliorcamentos"');

for (const token of [
  'getAuthRedirectUrl',
  'isAuthRedirectUrl',
  'handleAuthRedirectUrl',
  'signInWithGoogle',
  'resetPassword',
  'startAutoRefresh',
  'stopAutoRefresh',
]) {
  assert(supabaseTs.includes(token), `src/services/supabase.ts missing ${token}`);
}

assert(appTsx.includes('Linking.getInitialURL'), 'App.tsx must handle initial auth deep link');
assert(appTsx.includes('Linking.addEventListener'), 'App.tsx must subscribe to runtime auth deep links');
assert(appTsx.includes('AUTH_REDIRECT_PATH'), 'App.tsx must map the auth callback path');
assert(navigatorTsx.includes('AuthCallback'), 'AppNavigator must register AuthCallback screen');
assert(authCallbackTsx.includes('handleAuthRedirectUrl'), 'AuthCallbackScreen must exchange the Google callback URL');
assert(authCallbackTsx.includes('CommonActions.reset'), 'AuthCallbackScreen must leave the login route after success');
assert(supabaseTs.includes('window.location.assign(data.url)'), 'Web Google sign-in must use full-page redirect instead of leaving the user on the login screen');

assert(entrarTsx.includes('signInWithGoogle'), 'EntrarScreen must wire Google sign-in');
assert(!entrarTsx.includes("emBreve('Entrar com Google')"), 'EntrarScreen Google button still points to emBreve');
assert(entrarTsx.includes('resetPassword('), 'EntrarScreen must use redirect-aware resetPassword helper');

assert(contaTsx.includes('signInWithGoogle'), 'ContaScreen must offer Google sign-in');

for (const required of [
  'olliorcamentos://auth/callback',
  'Google Cloud Console',
  'SMTP',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
]) {
  assert(docsSupabase.includes(required), `docs/SUPABASE.md missing ${required}`);
}

console.log('Auth readiness checks passed.');
