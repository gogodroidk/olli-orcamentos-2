import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const form = ler('webapp/src/pages/olli/orcamentos/FormOrcamento.tsx');
const envio = ler('webapp/src/pages/olli/orcamentos/useEnviarWhatsApp.tsx');

// Rascunho: basta um NOME. O cliente cadastrado deixou de ser pré-requisito para salvar (igual ao app).
assert.doesNotMatch(form, /if \(!orc\.clienteId \|\| !orc\.clienteNome\.trim\(\)\)/);
assert.match(form, /if \(!orc\.clienteNome\.trim\(\)\) return "Informe o cliente/);
// O campo "só o nome" aparece quando não há cliente cadastrado escolhido e grava em clienteNome.
assert.match(form, /!orc\.clienteId && \(/);
assert.match(form, /patch\(\{ clienteNome: ev\.target\.value \}\)/);
// Enviar por WhatsApp continua exigindo número válido e, sem cliente cadastrado, diz o que fazer.
assert.match(envio, /linkWhatsApp\(blob\.clienteTelefone, ""\)/);
assert.match(envio, /blob\.clienteId\s*\?/);
assert.match(envio, /só o nome do cliente/);
console.log('teste-orcamento-nome-avulso: ok');
