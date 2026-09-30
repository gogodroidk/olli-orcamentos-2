import {
  PUSH_DEVICE_PLATFORMS,
  PUSH_DEVICE_REGISTRY_VERSION,
  PUSH_DEVICE_STATES,
  criarRegistroDispositivo,
  listarDispositivosAtivos,
  marcarTokenInvalido,
  revogarDispositivo,
  rotacionarFingerprint,
} from '../worker/src/pushDeviceRegistry.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}
function erroCodigo(fn: () => unknown) {
  try { fn(); return ''; } catch (erro: any) { return erro?.codigo || erro?.message || ''; }
}

console.log('\nNotificações OLLI — registro local de dispositivos');

const agora = '2026-09-01T15:00:00.000Z';
const contexto = { userId: 'user-01', tenantId: 'tenant-01' };
const entrada: any = {
  deviceId: 'device-a',
  userId: 'user-01',
  tenantId: 'tenant-forjado',
  platform: 'ANDROID',
  appVersion: '1.2.3',
  deviceLabel: 'Celular principal\n',
  tokenFingerprint: 'A'.repeat(64),
  token: 'token-bruto-nao-copiar',
  consentGranted: true,
  consentAt: '2026-09-01T14:59:00.000Z',
};
const snapshot = JSON.stringify(entrada);
const deviceA: any = criarRegistroDispositivo(entrada, contexto, { agora });

checar('versão e enums são fechados', deviceA.version === PUSH_DEVICE_REGISTRY_VERSION && PUSH_DEVICE_PLATFORMS.join(',') === 'android,ios,web' && PUSH_DEVICE_STATES.join(',') === 'active,revoked,invalid');
checar('registro nasce ativo e normalizado', deviceA.status === 'active' && deviceA.platform === 'android' && deviceA.deviceLabel === 'Celular principal');
checar('usuário e tenant vêm do contexto', deviceA.userId === 'user-01' && deviceA.tenantId === 'tenant-01' && deviceA.tenantId !== entrada.tenantId);
checar('fingerprint é normalizada', deviceA.tokenFingerprint === 'a'.repeat(64));
checar('token bruto nunca entra no registro', !('token' in deviceA) && !Object.values(deviceA).includes(entrada.token));
checar('registro é imutável e não altera entrada', Object.isFrozen(deviceA) && JSON.stringify(entrada) === snapshot);

checar('sem consentimento falha fechado', erroCodigo(() => criarRegistroDispositivo({ ...entrada, consentGranted: false }, contexto, { agora })) === 'consentimento_obrigatorio');
checar('plataforma desconhecida falha fechado', erroCodigo(() => criarRegistroDispositivo({ ...entrada, platform: 'windows-phone' }, contexto, { agora })) === 'plataforma_invalida');
checar('fingerprint curta falha fechado', erroCodigo(() => criarRegistroDispositivo({ ...entrada, tokenFingerprint: 'abc' }, contexto, { agora })) === 'fingerprint_invalida');
checar('usuário forjado falha fechado', erroCodigo(() => criarRegistroDispositivo({ ...entrada, userId: 'outro' }, contexto, { agora })) === 'usuario_payload_divergente');
checar('consentimento futuro falha fechado', erroCodigo(() => criarRegistroDispositivo({ ...entrada, consentAt: '2026-09-01T16:00:00Z' }, contexto, { agora })) === 'consent_at_futuro');

const deviceB: any = criarRegistroDispositivo({ ...entrada, deviceId: 'device-b', platform: 'ios', tokenFingerprint: 'b'.repeat(64), deviceLabel: 'iPhone' }, contexto, { agora });
const outroTenant: any = criarRegistroDispositivo({ ...entrada, deviceId: 'device-c', tokenFingerprint: 'c'.repeat(64) }, { userId: 'user-01', tenantId: 'tenant-02' }, { agora });
const ativos: any = listarDispositivosAtivos([deviceA, deviceB, outroTenant], contexto);
checar('vários aparelhos da conta são listados', ativos.length === 2 && ativos.map((item: any) => item.deviceId).join(',') === 'device-a,device-b');
checar('outro tenant fica isolado', !ativos.some((item: any) => item.deviceId === 'device-c'));
checar('lista pública não expõe fingerprint', ativos.every((item: any) => !('tokenFingerprint' in item) && !('token' in item)));
checar('lista e projeções são imutáveis', Object.isFrozen(ativos) && ativos.every(Object.isFrozen));

const rotacionado: any = rotacionarFingerprint(deviceA, { tokenFingerprint: 'd'.repeat(64), appVersion: '1.2.4' }, contexto, { agora: '2026-09-01T15:05:00Z' });
checar('rotação atualiza fingerprint e versão', rotacionado.tokenFingerprint === 'd'.repeat(64) && rotacionado.appVersion === '1.2.4' && rotacionado.status === 'active');
checar('rotação idêntica é idempotente', rotacionarFingerprint(rotacionado, { tokenFingerprint: 'd'.repeat(64), appVersion: '1.2.4' }, contexto, { agora: '2026-09-01T15:06:00Z' }) === rotacionado);
checar('relógio regressivo falha fechado', erroCodigo(() => rotacionarFingerprint(rotacionado, { tokenFingerprint: 'e'.repeat(64) }, contexto, { agora: '2026-09-01T14:00:00Z' })) === 'clock_skew');

const revogado: any = revogarDispositivo(rotacionado, contexto, { motivo: 'user_revoked', agora: '2026-09-01T15:10:00Z' });
const aposRevogacao: any = listarDispositivosAtivos([revogado, deviceB], contexto);
checar('revogação remove apenas um aparelho', revogado.status === 'revoked' && aposRevogacao.length === 1 && aposRevogacao[0].deviceId === 'device-b');
checar('revogação repetida é idempotente', revogarDispositivo(revogado, contexto, { agora: '2026-09-01T15:11:00Z' }) === revogado);
checar('terminal não pode ser rotacionado', erroCodigo(() => rotacionarFingerprint(revogado, { tokenFingerprint: 'f'.repeat(64) }, contexto, { agora: '2026-09-01T15:12:00Z' })) === 'dispositivo_terminal');
checar('outro tenant não revoga aparelho', erroCodigo(() => revogarDispositivo(deviceB, { userId: 'user-01', tenantId: 'tenant-02' }, { agora: '2026-09-01T15:12:00Z' })) === 'escopo_divergente');

checar('invalidação exige capability', erroCodigo(() => marcarTokenInvalido(deviceB, contexto, { agora: '2026-09-01T15:15:00Z' })) === 'capability_delivery_obrigatoria');
const invalido: any = marcarTokenInvalido(deviceB, { ...contexto, canManageDelivery: true }, { motivo: 'provider_rejected', agora: '2026-09-01T15:15:00Z' });
checar('delivery autorizado invalida token', invalido.status === 'invalid' && invalido.terminalReason === 'provider_rejected');
checar('token inválido não aparece como ativo', listarDispositivosAtivos([invalido], contexto).length === 0);
checar('registro inválido não reativa por rotação', erroCodigo(() => rotacionarFingerprint(invalido, { tokenFingerprint: 'f'.repeat(64) }, contexto, { agora: '2026-09-01T15:20:00Z' })) === 'dispositivo_terminal');

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
