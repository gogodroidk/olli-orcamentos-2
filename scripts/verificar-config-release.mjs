import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const raiz = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const eas = JSON.parse(await readFile(new URL('eas.json', raiz), 'utf8'));
const config = await readFile(new URL('src/config.ts', raiz), 'utf8');
const agenda = await readFile(new URL('src/services/googleAgenda.ts', raiz), 'utf8');
const plugin = await readFile(new URL('plugins/withReleaseSigningGuard.js', raiz), 'utf8');
const appJson = JSON.parse(await readFile(new URL('app.json', raiz), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('package.json', raiz), 'utf8'));
async function lerGerado(caminho) {
  try {
    return await readFile(new URL(caminho, raiz), 'utf8');
  } catch (erro) {
    // `android/` é saída gerada pelo prebuild e não é versionada. Em checkout
    // limpo (CI/EAS antes do prebuild), o plugin é a fonte de verdade; quando o
    // Gradle existe localmente, ele continua sendo validado como prova adicional.
    if (erro?.code !== 'ENOENT') throw erro;
    return null;
  }
}
const androidGradle = await lerGerado('android/app/build.gradle');
const androidGradleProps = await lerGerado('android/gradle.properties');
const urlEsperada = 'https://diagnostico.olliorcamentos.online';

for (const perfil of ['development', 'preview', 'production']) {
  const valor = eas?.build?.[perfil]?.env?.EXPO_PUBLIC_DIAGNOSTICO_URL;
  if (valor !== urlEsperada) {
    throw new Error(`${perfil}: EXPO_PUBLIC_DIAGNOSTICO_URL ausente ou divergente`);
  }
}

const jsonEas = JSON.stringify(eas);
if (eas?.build?.production?.android?.credentialsSource !== 'remote') {
  throw new Error('Produção Android precisa declarar credentialsSource=remote para o EAS');
}
const fontesAssinatura = [['plugin', plugin]];
if (androidGradle) fontesAssinatura.push(['android/app/build.gradle', androidGradle]);

for (const [nome, conteudo] of fontesAssinatura) {
  for (const trecho of ['EAS_BUILD', 'EAS_BUILD_RUNNER', 'eas-build.gradle', 'credentials.json', 'olliEasManagedSigningReady']) {
    if (!conteudo.includes(trecho)) throw new Error(`${nome}: integração de assinatura gerenciada do EAS ausente (${trecho})`);
  }
  if (!/if \(olliLocalReleaseSigningReady\)/.test(conteudo)) {
    throw new Error(`${nome}: assinatura local precisa ser separada da assinatura gerenciada pelo EAS`);
  }
}
for (const segredo of [
  'OPENROUTER_API_KEY', 'SUPABASE_SERVICE_ROLE', 'SENTRY_AUTH_TOKEN', 'REVENUECAT_WEBHOOK_SECRET',
  // Google Play Billing direto: a conta de serviço e a lista de testadores são do
  // WORKER (secrets). Nunca entram no app nem no eas.json.
  'PLAY_SA_JSON', 'PLAY_TESTE_PERMITIDOS', 'private_key',
]) {
  if (jsonEas.includes(segredo)) throw new Error(`Segredo não pode existir no eas.json: ${segredo}`);
}
// Sem flag de build para a venda pela Play (decisão C7): o build local não lê o env
// do eas.json, então uma flag ali sairia desligada sem ninguém perceber. Quem liga é
// o SERVIDOR (`PLAY_BILLING_MODE` → GET /play/config). E o RevenueCat saiu.
for (const [perfil, cfg] of Object.entries(eas.build ?? {})) {
  for (const chave of Object.keys(cfg?.env ?? {})) {
    if (/REVENUECAT|^EXPO_PUBLIC_PLAY/.test(chave)) {
      throw new Error(`eas.json (${perfil}): ${chave} não existe mais — a venda pela Play é ligada pelo servidor`);
    }
  }
}

// ── Play Billing direto (expo-iap) no binário ─────────────────────────────────
if (pkg.dependencies?.['expo-iap'] !== '5.8.2') {
  throw new Error('package.json: expo-iap tem de ser a dependência EXATA 5.8.2 (versão validada para Expo 57 / RN 0.86)');
}
if (pkg.dependencies?.['react-native-purchases'] !== undefined) {
  throw new Error('package.json: react-native-purchases tem de sair (duas Play Billing Library no mesmo APK)');
}
const plugins = appJson.expo?.plugins ?? [];
const temPlugin = (nome) => plugins.some((p) => p === nome || (Array.isArray(p) && p[0] === nome));
for (const nome of ['expo-iap', './plugins/withGradleReleaseTweaks', './plugins/withBackupSemBanco', './plugins/withReleaseSigningGuard']) {
  if (!temPlugin(nome)) throw new Error(`app.json: plugin ${nome} ausente`);
}
const secureStore = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-secure-store');
if (!secureStore || secureStore[1]?.configureAndroidBackup !== false) {
  throw new Error('app.json: expo-secure-store precisa de configureAndroidBackup:false (as regras de backup são do withBackupSemBanco)');
}
const android = appJson.expo?.android ?? {};
const bloqueadas = android.blockedPermissions ?? [];
for (const perm of ['android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT']) {
  if (!bloqueadas.includes(perm)) throw new Error(`app.json: ${perm} precisa ficar em blockedPermissions (o app não usa biometria)`);
}
if (bloqueadas.includes('com.android.vending.BILLING')) {
  throw new Error('app.json: a permissão BILLING da Play não pode ser bloqueada');
}
if (!Number.isInteger(android.versionCode) || android.versionCode < 24) {
  throw new Error('app.json: android.versionCode tem de ser inteiro ≥ 24 (a Play já tem até o 23)');
}
if (!/^\d+\.\d+\.\d+$/.test(String(appJson.expo?.version ?? ''))) {
  throw new Error('app.json: expo.version tem de ser semver (x.y.z)');
}

// ── Plugins de Gradle e de backup: idempotentes e com o conteúdo certo ─────────
const tweaks = require('../plugins/withGradleReleaseTweaks.js');
const gradleModelo = 'apply plugin: "com.android.application"\n\nandroid {\n    ndkVersion rootProject.ext.ndkVersion\n}\n';
const umaVez = tweaks.aplicarLint(gradleModelo);
if (tweaks.aplicarLint(umaVez) !== umaVez) throw new Error('withGradleReleaseTweaks: aplicar duas vezes duplicou o bloco lint');
if (!/android \{\n[\s\S]*lint \{\n\s+checkReleaseBuilds false\n\s+abortOnError false\n\s+\}/.test(umaVez)) {
  throw new Error('withGradleReleaseTweaks: o bloco lint não entrou dentro de android {');
}
const props = tweaks.aplicarJvmArgs([{ type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m' }, { type: 'property', key: 'x', value: '1' }]);
if (props.filter((p) => p.key === 'org.gradle.jvmargs').map((p) => p.value).join('|') !== tweaks.JVMARGS) {
  throw new Error('withGradleReleaseTweaks: org.gradle.jvmargs não ficou único e com o valor do build de release');
}
const backup = require('../plugins/withBackupSemBanco.js');
for (const xml of [backup.XML_BACKUP, backup.XML_EXTRACAO]) {
  // Com <include>, só o incluído vai para o backup: o banco (files/SQLite) e o
  // AsyncStorage (databases/) ficam fora. Incluir 'file', 'database' ou 'root' os levaria.
  if (!xml.includes('<include domain="sharedpref" path="."/>')) throw new Error('withBackupSemBanco: falta o include das preferências');
  if (!xml.includes('<exclude domain="sharedpref" path="SecureStore"/>')) throw new Error('withBackupSemBanco: o SecureStore precisa ficar fora do backup');
  if (/domain="(?:file|database|root|external)"/.test(xml.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('withBackupSemBanco: o banco do app não pode entrar no backup');
}
// O release NUNCA pode sair com a chave de debug: o template do Expo tem as formas
// `signingConfig signingConfigs.debug` e `signingConfig = signingConfigs.debug`, e a
// segunda escapou do plugin em 02/10/2026 (AAB 1.2.0 saiu com CN=Android Debug).
if (!plugin.includes('signingConfig\\s*=?\\s*signingConfigs\\.debug')) {
  throw new Error('withReleaseSigningGuard: a remoção do signingConfig de debug não cobre a forma `signingConfig = ...`');
}
if (androidGradle) {
  const blocoRelease = androidGradle.match(/buildTypes\s*\{[\s\S]*?\brelease\s*\{([\s\S]*?)\n\s{8}\}/);
  if (blocoRelease && /signingConfig\s*=?\s*signingConfigs\.debug/.test(blocoRelease[1])) {
    throw new Error('android/app/build.gradle: buildTypes.release ainda usa signingConfigs.debug — rode o prebuild de novo');
  }
}
if (androidGradle && !androidGradle.includes(tweaks.MARCADOR) && !/lint \{\s*checkReleaseBuilds false/.test(androidGradle)) {
  throw new Error('android/app/build.gradle: falta o lint de release desligado (rode o prebuild com o plugin)');
}
if (androidGradleProps && !androidGradleProps.includes(`org.gradle.jvmargs=${tweaks.JVMARGS}`)) {
  throw new Error('android/gradle.properties: org.gradle.jvmargs diferente do plugin (rode o prebuild)');
}
if (!/process\.env\.EXPO_PUBLIC_DIAGNOSTICO_URL \?\? ''/.test(config)) {
  throw new Error('src/config.ts precisa falhar fechado quando a env pública não vier');
}
if (!/const GOOGLE_AGENDA_NATIVO_HABILITADO = false/.test(agenda)) {
  throw new Error('Google Agenda nativo precisa permanecer explicitamente desligado');
}
if (!/GOOGLE_AGENDA_NATIVO_HABILITADO &&/.test(agenda)) {
  throw new Error('googleAgendaDisponivel não está protegido pela trava de arquitetura');
}

console.log(
  `Configuração de release: URL pública presente nos 3 perfis, sem segredos; EAS remoto compatível com guard fail-closed (${androidGradle ? 'plugin + Gradle gerado' : 'plugin versionado; Gradle será gerado no prebuild'}); Google Agenda fail-closed; ` +
  `Play Billing direto (expo-iap 5.8.2, sem RevenueCat, sem flag de build); ${appJson.expo.version} (versionCode ${android.versionCode}); biometria bloqueada; backup sem o banco; Gradle de release por plugin.`,
);
