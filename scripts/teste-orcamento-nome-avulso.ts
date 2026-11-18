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
// Enviar por WhatsApp continua exigindo número válido. Sem número (ex.: orçamento só com o nome), não é
// mais um aviso sem saída (D-2151): abre o diálogo que PEDE o WhatsApp, valida e salva antes de seguir.
assert.match(envio, /linkWhatsApp\(blob\.clienteTelefone, ""\)/);
assert.match(envio, /setSemNumero\(\{ orcamentoId, blob \}\)/);
assert.match(envio, /if \(!numeroParaWhatsApp\(numero\)\)/);
// Salvar o número que falha não vira silêncio: o diálogo fica aberto com a mensagem.
assert.match(envio, /Não consegui salvar o número agora/);
// No modo "só o nome", o formulário já oferece o WhatsApp do cliente.
assert.match(form, /rotulo="WhatsApp do cliente"/);
assert.match(form, /clienteNome: orc\.clienteNome\.trim\(\),/);
const contrato = ler('webapp/src/olli/contrato.ts');
assert.doesNotMatch(contrato, /clienteId \?\? null/);
const recibo = ler('webapp/src/pages/olli/recibos/FormRecibo.tsx');
assert.match(recibo, /tem só o nome do cliente/);
console.log('teste-orcamento-nome-avulso: ok');
