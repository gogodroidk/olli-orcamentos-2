import assert from 'node:assert/strict';
import { AuthStorageSeguro } from '../src/services/authStorageCore.ts';

class Memoria {
  dados = new Map<string, string>();
  falharSet = false;
  async getItem(key: string) { return this.dados.get(key) ?? null; }
  async setItem(key: string, value: string) { if (this.falharSet) throw new Error('falha'); this.dados.set(key, value); }
  async removeItem(key: string) { this.dados.delete(key); }
  async getItemAsync(key: string) { return this.getItem(key); }
  async setItemAsync(key: string, value: string) { return this.setItem(key, value); }
  async deleteItemAsync(key: string) { return this.removeItem(key); }
}

console.log('\nSupabase Auth — sessão cifrada e migrável');

const chave = 'sb-projeto-auth-token';
const sessaoGrande = JSON.stringify({ access_token: 'a'.repeat(2_400), refresh_token: 'r'.repeat(900) });

const legado = new Memoria();
const seguro = new Memoria();
await legado.setItem(chave, sessaoGrande);
const storage = new AuthStorageSeguro(legado, seguro);
assert.equal(await storage.getItem(chave), sessaoGrande, 'migração preserva sessão válida');
assert.equal(await legado.getItem(chave), null, 'plaintext legado é removido após commit seguro');
assert.ok(seguro.dados.size > 2, 'payload grande foi dividido em múltiplas partes');
assert.equal(await storage.getItem(chave), sessaoGrande, 'sessão segura remonta exatamente os chunks');

const legadoFalha = new Memoria();
const seguroFalha = new Memoria();
await legadoFalha.setItem(chave, sessaoGrande);
seguroFalha.falharSet = true;
const storageFalha = new AuthStorageSeguro(legadoFalha, seguroFalha);
assert.equal(await storageFalha.getItem(chave), null, 'SecureStore indisponível falha fechado');
assert.equal(await legadoFalha.getItem(chave), sessaoGrande, 'migração falha mantém legado para nova tentativa, sem conceder sessão');

const legadoReinstalado = new Memoria();
const seguroPersistente = new Memoria();
const primeiraInstalacao = new AuthStorageSeguro(legadoReinstalado, seguroPersistente);
await primeiraInstalacao.setItem(chave, sessaoGrande);
legadoReinstalado.dados.clear(); // simula sandbox apagado na reinstalação; Keychain persiste
const reinstalado = new AuthStorageSeguro(legadoReinstalado, seguroPersistente);
assert.equal(await reinstalado.getItem(chave), null, 'reinstalação não ressuscita sessão antiga do Keychain');

const legadoLogout = new Memoria();
const seguroLogout = new Memoria();
const logout = new AuthStorageSeguro(legadoLogout, seguroLogout);
await logout.setItem(chave, sessaoGrande);
await logout.removeItem(chave);
assert.equal(await logout.getItem(chave), null, 'logout remove manifesto e sessão');

console.log('PASSOU: chunks, migração, falha fechada, reinstalação e logout validados.');
