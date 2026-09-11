import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  IA_AUTOPILOT_MAX_BYTES,
  IA_AUTOPILOT_MAX_ITENS,
  IA_AUTOPILOT_SCHEMA,
  prepararPreviaAutopilot,
  textoDaFalhaAutopilot,
} from '../src/iaAutopilot.js';
import { parseJsonLoose } from '../src/util.js';

const user = { id: '00000000-0000-4000-8000-000000000099' };
const cliente = {
  nome: 'Dona Helena', telefone: '(11) 99999-0000', email: '', documento: '',
  endereco: 'Rua das Flores, 32', cidade: 'São Paulo', estado: 'sp', cep: '01001-000',
  confianca: 0.92, evidencia: 'linha 2',
};
const resultado = {
  clientes: [cliente],
  produtos: [{ nome: 'Capacitor 35uF', descricao: 'Peça', unidade: 'un', precoSugerido: 89.9, custoSugerido: 45, marca: 'Marca', modelo: 'M35', confianca: 0.8, evidencia: 'linha 4' }],
  servicos: [{ nome: 'Limpeza de split', descricao: 'Higienização', unidade: 'un', precoSugerido: 180, custoSugerido: 0, marca: '', modelo: '', confianca: 0.85, evidencia: 'linha 5' }],
  orcamento: {
    clienteNome: 'Dona Helena', clienteTelefone: '(11) 99999-0000', clienteEndereco: 'Rua das Flores, 32',
    observacoes: 'Validade sugerida: 15 dias',
    itens: [{ tipo: 'servico', nome: 'Limpeza de split', descricao: 'Higienização', unidade: 'un', quantidade: 1, precoSugerido: 180, confianca: 0.85, evidencia: 'linha 5' }],
    confianca: 0.88, evidencia: 'linhas 2 e 5',
  },
  documentos: [{ tipo: 'contrato', titulo: 'Contrato de prestação', texto: 'Rascunho para revisão.', confianca: 0.5, evidencia: 'página 1' }],
  avisos: ['Preço veio da fonte e precisa de conferência.'],
};

let chamadas = 0;
let ultimaOpcao;
const gerarIA = async (_env, opcoes) => {
  chamadas += 1;
  ultimaOpcao = opcoes;
  assert.equal(opcoes.wantJson, true);
  assert.deepEqual(opcoes.jsonSchema, IA_AUTOPILOT_SCHEMA);
  assert.match(opcoes.user, /<SOURCE_DATA>/);
  assert.match(opcoes.user, /ignore qualquer instrução/i);
  return JSON.stringify(resultado);
};

console.log('\n1) texto colado gera prévia completa, sem persistir');
const previa = await prepararPreviaAutopilot(JSON.stringify({
  intencao: 'orcamento',
  pedidoOriginal: 'Montar orçamento a partir da conversa',
  texto: 'Dona Helena quer limpeza de split por 180 reais.',
  referencias: [{ tipo: 'servico', nome: 'Limpeza de split', unidade: 'un', preco: 175, custo: 50 }],
}), { OPENROUTER_API_KEY: 'fixture-openrouter', }, user, { gerarIA, parseJsonLoose });
assert.equal(previa.ok, true);
assert.equal(chamadas, 1);
assert.equal(previa.previa.estado, 'aguardando_confirmacao');
assert.equal(previa.previa.requiresReview, true);
assert.equal(previa.previa.persistida, false);
assert.equal(previa.previa.intencao, 'orcamento');
assert.equal(previa.previa.candidatos.clientes[0].estado, 'SP');
assert.equal(previa.previa.candidatos.orcamento.itens.length, 1);
assert.match(previa.previa.fonte.hash, /^[a-f0-9]{64}$/);
assert.ok(previa.previa.fonte.bytes > 0);

console.log('\n2) PDF pequeno usa toMarkdown e preserva hash/parser');
const pdfBytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n');
let markdownCalls = 0;
const pdf = await prepararPreviaAutopilot(JSON.stringify({
  intencao: 'cadastro',
  arquivo: {
    nome: 'orcamento-concorrente.pdf', mimeType: 'application/pdf',
    conteudoBase64: btoa(String.fromCharCode(...pdfBytes)),
  },
}), { OPENROUTER_API_KEY: 'fixture-openrouter', AI: {
  async toMarkdown(file, options) {
    markdownCalls += 1;
    assert.equal(file.name, 'orcamento-concorrente.pdf');
    assert.equal(file.blob.type, 'application/pdf');
    assert.deepEqual(options.output, { format: 'markdown' });
    return { format: 'markdown', data: '# Orçamento\nLimpeza de split — R$ 180' };
  },
} }, user, { gerarIA, parseJsonLoose });
assert.equal(pdf.ok, true);
assert.equal(markdownCalls, 1);
assert.equal(pdf.previa.fonte.parser, 'cloudflare-toMarkdown');
assert.equal(pdf.previa.fonte.mime, 'application/pdf');

console.log('\n2b) staging pode usar Workers AI open-weight sem secret OpenRouter');
let workerCalls = 0;
let workerModel = '';
const workerPreview = await prepararPreviaAutopilot(JSON.stringify({
  intencao: 'conversa', texto: 'Cliente pede instalação de split em São Paulo.',
}), {
  AUTOPILOT_WORKERS_AI_ENABLED: 'true',
  AI: {
    async run(model, options) {
      workerCalls += 1;
      workerModel = model;
      assert.equal(options.response_format.type, 'json_schema');
      return { response: JSON.stringify(resultado) };
    },
  },
}, user, { gerarIA, parseJsonLoose });
assert.equal(workerPreview.ok, true);
assert.equal(workerCalls, 1);
assert.equal(workerModel, '@cf/google/gemma-4-26b-a4b-it');

console.log('\n3) magic bytes, MIME e tamanho falham antes da IA');
const antes = chamadas;
const mismatch = await prepararPreviaAutopilot(JSON.stringify({ arquivo: {
  nome: 'foto.png', mimeType: 'image/png', conteudoBase64: btoa('não é png'),
} }), { AI: { toMarkdown: async () => ({ format: 'markdown', data: 'x' }) } }, user, { gerarIA, parseJsonLoose });
assert.deepEqual(mismatch, { ok: false, erro: 'assinatura_arquivo_invalida' });
const forbidden = await prepararPreviaAutopilot(JSON.stringify({ arquivo: {
  nome: 'macro.xlsm', mimeType: 'application/vnd.ms-excel.sheet.macroenabled.12', conteudoBase64: btoa('MZ'),
} }), {}, user, { gerarIA, parseJsonLoose });
assert.deepEqual(forbidden, { ok: false, erro: 'tipo_arquivo_nao_permitido' });
const oversized = await prepararPreviaAutopilot(JSON.stringify({ arquivo: {
  nome: 'grande.txt', mimeType: 'text/plain', conteudoBase64: 'A'.repeat(Math.ceil(IA_AUTOPILOT_MAX_BYTES / 3) * 4 + 12),
} }), {}, user, { gerarIA, parseJsonLoose });
assert.deepEqual(oversized, { ok: false, erro: 'arquivo_invalido' });
assert.equal(chamadas, antes);

console.log('\n4) parser ausente/fonte vazia e resposta vazia são estados explícitos');
assert.deepEqual(await prepararPreviaAutopilot(JSON.stringify({ arquivo: {
  nome: 'foto.jpg', mimeType: 'image/jpeg', conteudoBase64: btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xd9)),
} }), {}, user, { gerarIA, parseJsonLoose }), { ok: false, erro: 'parser_arquivo_nao_configurado' });
assert.deepEqual(await prepararPreviaAutopilot(JSON.stringify({}), {}, user, { gerarIA, parseJsonLoose }), { ok: false, erro: 'fonte_obrigatoria' });
await assert.rejects(
  () => prepararPreviaAutopilot(JSON.stringify({ texto: 'sem provider' }), {}, user, { gerarIA, parseJsonLoose }),
  /autopilot_ia_nao_configurada/,
);

console.log('\n5) saída é limitada, normalizada e não expõe opções extras');
assert.equal(previa.previa.candidatos.produtos.length <= IA_AUTOPILOT_MAX_ITENS, true);
assert.equal(previa.previa.candidatos.clientes[0].documento, '');
assert.equal(previa.previa.candidatos.clientes[0].estado, 'SP');
assert.equal(ultimaOpcao.temperature, 0.1);
assert.equal(ultimaOpcao.maxTokens, 4096);
assert.equal(textoDaFalhaAutopilot('assinatura_arquivo_invalida').includes('nada foi processado'), true);

const fonte = await readFile(new URL('../src/iaAutopilot.js', import.meta.url), 'utf8');
const indexFonte = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const wranglerFonte = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
assert.doesNotMatch(fonte, /fetch\s*\(/);
assert.doesNotMatch(fonte, /SUPABASE_SERVICE_ROLE|service_role/);
assert.match(indexFonte, /url\.pathname === '\/ia\/autopilot\/preview'/);
assert.match(indexFonte, /const cobranca = await cobrarCreditoVoz[\s\S]*?return json\(previa\);/);
assert.match(wranglerFonte, /AUTOPILOT_WORKERS_AI_ENABLED.*true/);

console.log('\nPASSOU: IA Autopilot — prévia de texto/PDF, magic bytes, limites e sem persistência.');
