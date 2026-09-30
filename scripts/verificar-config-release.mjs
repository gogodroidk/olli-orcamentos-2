import { readFile } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const eas = JSON.parse(await readFile(new URL('eas.json', raiz), 'utf8'));
const config = await readFile(new URL('src/config.ts', raiz), 'utf8');
const agenda = await readFile(new URL('src/services/googleAgenda.ts', raiz), 'utf8');
const plugin = await readFile(new URL('plugins/withReleaseSigningGuard.js', raiz), 'utf8');
let androidGradle = null;
try {
  androidGradle = await readFile(new URL('android/app/build.gradle', raiz), 'utf8');
} catch (erro) {
  // `android/` é saída gerada pelo prebuild e não é versionada. Em checkout
  // limpo (CI/EAS antes do prebuild), o plugin é a fonte de verdade; quando o
  // Gradle existe localmente, ele continua sendo validado como prova adicional.
  if (erro?.code !== 'ENOENT') throw erro;
}
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
for (const segredo of ['OPENROUTER_API_KEY', 'SUPABASE_SERVICE_ROLE', 'SENTRY_AUTH_TOKEN', 'REVENUECAT_WEBHOOK_SECRET']) {
  if (jsonEas.includes(segredo)) throw new Error(`Segredo não pode existir no eas.json: ${segredo}`);
}
// Google Play (RevenueCat): no app só entra a chave PÚBLICA do SDK (`goog_…`).
// A Secret API key (`sk_…`) dá acesso de escrita ao RevenueCat e nunca vai ao bundle.
for (const [perfil, cfg] of Object.entries(eas.build ?? {})) {
  const chaveRc = cfg?.env?.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY;
  if (chaveRc !== undefined && !/^goog_[A-Za-z0-9]{10,}$/.test(String(chaveRc))) {
    throw new Error(`eas.json (${perfil}): EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY tem de ser a chave pública goog_… do RevenueCat`);
  }
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
  `Configuração de release: URL pública presente nos 3 perfis, sem segredos; EAS remoto compatível com guard fail-closed (${androidGradle ? 'plugin + Gradle gerado' : 'plugin versionado; Gradle será gerado no prebuild'}); Google Agenda fail-closed.`,
);
