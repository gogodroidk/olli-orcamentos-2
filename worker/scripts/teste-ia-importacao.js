import assert from 'node:assert/strict';
import { parseJsonLoose } from '../src/util.js';
import { IA_IMPORTACAO_MAX_ITENS, prepararPreviaImportacaoIa } from '../src/iaImportacao.js';

const user = { id: '00000000-0000-4000-8000-000000000099' };
const fontes = [{ nome: 'Fonte oficial de referência', url: 'https://www.gov.br/exemplo', consultadaEm: '2026-09-10T12:00:00.000Z' }];
const input = JSON.stringify({
  texto: 'Limpeza de split 180 reais\nInstalação de split 480 reais',
  tipo: 'servico',
  cidadeUf: 'São Paulo/SP',
  fontes,
  pedidoOriginal: 'Preparar serviços de ar-condicionado',
});

let chamadas = 0;
const gerarIA = async (_env, opcoes) => {
  chamadas += 1;
  assert.equal(opcoes.wantJson, true);
  assert.ok(opcoes.jsonSchema);
  assert.match(opcoes.user, /DADOS_NAO_CONFIAVEIS/);
  return JSON.stringify({ itens: [
    { id: 'modelo-tenta-injetar', tipo: 'servico', nome: 'Limpeza de split', descricao: 'higienização', unidade: 'un', precoSugerido: 180, cidadeUf: 'SP', confianca: 0.8 },
    { id: 'segundo', tipo: 'servico', nome: 'Instalação de split', descricao: '', unidade: 'un', precoSugerido: 480, cidadeUf: 'SP', confianca: 0.7 },
  ] });
};

const previa = await prepararPreviaImportacaoIa(input, {}, user, { gerarIA, parseJsonLoose });
assert.equal(previa.ok, true);
assert.equal(chamadas, 1);
assert.equal(previa.previa.estado, 'aguardando_confirmacao');
assert.equal(previa.previa.requiresReview, true);
assert.equal(previa.previa.persistida, false);
assert.equal(previa.previa.itens.length, 2);
assert.equal(previa.previa.itens[0].id, 'ia-import-1');
assert.equal(previa.previa.itens[0].fontes[0].url, fontes[0].url);
assert.equal(previa.previa.itens[0].precoSugerido, 180);
assert.ok(previa.previa.itens.length <= IA_IMPORTACAO_MAX_ITENS);

const semFonte = await prepararPreviaImportacaoIa(JSON.stringify({ texto: 'item' }), {}, user, { gerarIA, parseJsonLoose });
assert.deepEqual(semFonte, { ok: false, erro: 'fonte_obrigatoria' });

const fonteInsegura = await prepararPreviaImportacaoIa(JSON.stringify({ texto: 'item', fontes: [{ nome: 'x', url: 'http://exemplo.invalid', consultadaEm: '2026-09-10T12:00:00.000Z' }] }), {}, user, { gerarIA, parseJsonLoose });
assert.deepEqual(fonteInsegura, { ok: false, erro: 'fonte_obrigatoria' });

console.log('PASSOU: prévia IA de importação estruturada, fonte HTTPS, limite e confirmação pendente.');
