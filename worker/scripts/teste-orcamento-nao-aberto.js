/**
 * Teste da régua "orçamento não aberto em 2 dias" (Z-123):  node scripts/teste-orcamento-nao-aberto.js
 */
import assert from 'node:assert/strict';
import { decidirNaoAberto, selecionarNaoAbertos } from '../src/orcamentoNaoAbertoPolicy.js';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = new Date('2026-10-26T15:00:00.000Z'); // 12:00 BRT
const H = 3600e3;
const antes = (ms) => new Date(AGORA.getTime() - ms).toISOString();
const cand = (x = {}) => ({ userId: U(1), token: 'fixture-um', enviadoEm: antes(50 * H), visualizadoEm: null, respondidoEm: null, revogadoEm: null, avisadoEm: null, membroDeEquipe: false, suprimido: false, ...x });
const mot = (x, agora = AGORA) => decidirNaoAberto(cand(x), { agora }).motivo;

let ok = 0;
const caso = (n, f) => { f(); ok += 1; console.log(`  ok   ${n}`); };

caso('48h+ sem abrir avisa o prestador, 1x por token', () => {
  const d = decidirNaoAberto(cand(), { agora: AGORA });
  assert.equal(d.avisar, true);
  assert.equal(d.pedido.idempotencyKey, 'reengajamento:00000000-0000-4000-8000-000000000001:nao_aberto:fixture-um');
  assert.equal(d.pedido.dados.tipo, 'nao_aberto');
});
caso('antes de 48h = cedo; depois de 7 dias = tarde', () => {
  assert.equal(mot({ enviadoEm: antes(47 * H) }), 'cedo');
  assert.equal(mot({ enviadoEm: antes(8 * 24 * H) }), 'tarde');
});
caso('aberto, respondido ou revogado nunca avisa', () => {
  for (const k of ['visualizadoEm', 'respondidoEm', 'revogadoEm']) assert.equal(mot({ [k]: antes(H) }), 'ja_aberto_ou_encerrado');
});
caso('já avisado, suprimido (SAIR) e membro de equipe não avisam', () => {
  assert.equal(mot({ avisadoEm: antes(H) }), 'ja_avisado');
  assert.equal(mot({ suprimido: true }), 'suprimido');
  assert.equal(mot({ membroDeEquipe: true }), 'membro_de_equipe');
});
caso('fora de 8h–18h BRT não avisa (07:59 e 18:00)', () => {
  assert.equal(mot({}, new Date('2026-10-26T10:59:00Z')), 'fora_da_janela');
  assert.equal(mot({}, new Date('2026-10-26T21:00:00Z')), 'fora_da_janela');
});
caso('lixo falha fechado: data ilegível, id inválido, flags ausentes', () => {
  assert.equal(mot({ enviadoEm: 'ontem' }), 'data_ilegivel');
  assert.equal(mot({ userId: 'x' }), 'candidato_invalido');
  assert.equal(mot({ suprimido: undefined }), 'candidato_invalido');
  assert.equal(decidirNaoAberto(null, { agora: AGORA }).motivo, 'candidato_invalido');
  assert.equal(decidirNaoAberto(cand(), {}).motivo, 'agora_invalido');
});
caso('lote: 1 por conta, teto da rodada, mais antigo primeiro', () => {
  const r = selecionarNaoAbertos([
    cand({ token: 'fixture-novo', enviadoEm: antes(49 * H) }),
    cand({ token: 'fixture-velho', enviadoEm: antes(100 * H) }),
    cand({ userId: U(2), token: 'fixture-dois' }),
    cand({ userId: U(3), token: 'fixture-tres' }),
  ], { agora: AGORA, teto: 2 });
  assert.equal(r.pedidos.length, 2);
  assert.equal(r.pedidos[0].dados.token, 'fixture-velho');
  assert.equal(r.motivos.uma_por_conta, 1);
  assert.equal(r.motivos.teto_da_rodada, 1);
});
console.log(`${ok} casos ok`);
