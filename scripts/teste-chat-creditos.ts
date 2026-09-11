import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const servico = ler('../src/services/olliAssistente.ts');
const tela = ler('../src/screens/OlliChatScreen.tsx');
const planos = ler('../src/services/planos.ts');

// O cliente só manifesta consentimento; a autorização/cobrança segue no Worker.
assert.match(servico, /semCreditos\?: boolean/);
assert.match(servico, /opcoesCredito\?\.confirmarCredito === true/);
assert.match(servico, /corpo\.confirmarCredito = true/);
assert.match(servico, /corpo\.creditoRef = opcoesCredito\.creditoRef\.trim\(\)/);
assert.match(servico, /semCreditos: true/);

// O contador local não bloqueia a chamada. É o servidor que abre o gate.
assert.doesNotMatch(tela, /const iaEsgotada/);
assert.doesNotMatch(tela, /if \(iaEsgotada\)/);
assert.match(tela, /if \(res\.semCreditos\)/);
assert.match(tela, /getMeuSaldo\(\)/);
assert.match(tela, /creditoRefRef\.current \?\? generateId\(\)/);
assert.match(tela, /confirmarCredito: true, creditoRef/);
assert.match(tela, /Nada é cobrado sem seu toque/);

// A cota exibida é reconciliada com a mesma tabela/competência/ação do Worker.
assert.match(planos, /\.from\('ia_uso_gratis'\)/);
assert.match(planos, /select\('id', \{ count: 'exact', head: true \}\)/);
assert.match(planos, /\.eq\('acao', 'voz_ia'\)/);
assert.match(planos, /const \{ usos \} = await lerContadorIa\(\)/); // fallback offline continua existindo

console.log('teste-chat-creditos: 16 verificações passaram');
