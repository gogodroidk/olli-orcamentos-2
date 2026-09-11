import { readFile } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const eas = JSON.parse(await readFile(new URL('eas.json', raiz), 'utf8'));
const config = await readFile(new URL('src/config.ts', raiz), 'utf8');
const agenda = await readFile(new URL('src/services/googleAgenda.ts', raiz), 'utf8');
const urlEsperada = 'https://diagnostico.olliorcamentos.online';

for (const perfil of ['development', 'preview', 'production']) {
  const valor = eas?.build?.[perfil]?.env?.EXPO_PUBLIC_DIAGNOSTICO_URL;
  if (valor !== urlEsperada) {
    throw new Error(`${perfil}: EXPO_PUBLIC_DIAGNOSTICO_URL ausente ou divergente`);
  }
}

const jsonEas = JSON.stringify(eas);
for (const segredo of ['OPENROUTER_API_KEY', 'SUPABASE_SERVICE_ROLE', 'SENTRY_AUTH_TOKEN']) {
  if (jsonEas.includes(segredo)) throw new Error(`Segredo não pode existir no eas.json: ${segredo}`);
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

console.log('Configuração de release: URL pública presente nos 3 perfis, sem segredos; Google Agenda fail-closed.');
