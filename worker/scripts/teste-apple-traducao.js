/**
 * Tradução da transação Apple (worker/src/appleIap.js) em decisão de plano. Puro, sem rede.
 *     node worker/scripts/teste-apple-traducao.js
 */
import assert from 'node:assert/strict';
import { BUNDLE_ID_APPLE, FOLGA_RENOVACAO_APPLE_MS, PRODUTOS_APPLE, SKUS_APPLE, donoDaTransacao, produtoApple, traduzirTransacaoApple, validarTransacao, vinculoApple } from '../src/appleIap.js';

let ok = 0;
const caso = (n) => {
  ok++;
  console.log(`  ok  ${n}`);
};
const USER = '11111111-2222-4333-8444-555555555555';
const agora = Date.UTC(2026, 9, 24, 15, 0, 0);
const DIA = 86400e3;
const tx = (extra = {}) => ({
  bundleId: BUNDLE_ID_APPLE, productId: 'olli_pro_mensal', originalTransactionId: '2000000123456789', transactionId: '2000000123456790',
  type: 'Auto-Renewable Subscription', environment: 'Production', appAccountToken: USER, signedDate: agora - 1000,
  expiresDate: agora + 20 * DIA, ...extra,
});
const t = (x, o = {}) => traduzirTransacaoApple(x, { userId: USER, transacaoId: 'apple:abc', agora, ...o });

// catálogo
assert.deepEqual(SKUS_APPLE, ['olli_pro_mensal', 'olli_pro_anual', 'olli_empresa_mensal', 'olli_empresa_anual']);
assert.equal(produtoApple('olli_pro_anual').produtoId, 'olli_pro:anual');
assert.equal(produtoApple('olli_gold'), null);
assert.equal(produtoApple('__proto__'), null, 'chave especial não é produto');
assert.equal(produtoApple(undefined), null);
caso('catálogo: 4 SKUs, ids lógicos iguais aos do Play, desconhecido/__proto__ = null');

// concessão
{
  const d = t(tx());
  assert.equal(d.acao, 'conceder');
  assert.equal(d.plano, 'pro');
  assert.equal(d.vigenciaAte, new Date(agora + 20 * DIA).toISOString());
  assert.equal(d.acessoAte, d.vigenciaAte, 'sem renovationInfo: sem folga');
  assert.equal(d.produtoId, 'olli_pro:mensal');
  assert.equal(d.userId, USER);
  caso('ativa com vigência futura: concede o plano do produto até expiresDate');
}
assert.equal(t(tx({ productId: 'olli_empresa_anual' })).plano, 'empresa');
caso('produto Empresa anual concede Empresa');
{
  const d = t(tx(), { renovacao: { autoRenewStatus: 1 } });
  assert.equal(Date.parse(d.acessoAte) - Date.parse(d.vigenciaAte), FOLGA_RENOVACAO_APPLE_MS);
  caso('renovação automática ligada: folga de 2 h no acesso (vigência exata fica gravada)');
}
{
  const graca = agora + 25 * DIA;
  const d = t(tx(), { renovacao: { autoRenewStatus: 1, gracePeriodExpiresDate: graca } });
  assert.equal(d.acessoAte, new Date(graca).toISOString());
  caso('carência de cobrança (grace period): acesso vai até gracePeriodExpiresDate');
}

// encerramento
{
  const d = t(tx({ expiresDate: agora - DIA }));
  assert.equal(d.acao, 'encerrar');
  assert.equal(d.vigenciaAte, new Date(agora - DIA).toISOString(), 'encerra na vigência que já passou, nunca estende');
  caso('vencida: encerra na data do vencimento');
}
{
  const d = t(tx({ revocationDate: agora - 3600e3 }));
  assert.equal(d.acao, 'encerrar');
  assert.equal(d.vigenciaAte, new Date(agora - 3600e3).toISOString());
  caso('revocationDate (estorno/Family Sharing): encerra na data da revogação');
}
for (const tipo of ['REFUND', 'REVOKE']) {
  const d = t(tx(), { tipoNotificacao: tipo });
  assert.equal(d.acao, 'encerrar');
  assert.equal(d.vigenciaAte, new Date(agora).toISOString());
}
caso('notificação REFUND/REVOKE: corta agora (vigência = agora, não a futura)');
assert.equal(t(tx(), { tipoNotificacao: 'EXPIRED' }).acao, 'encerrar');
caso('notificação EXPIRED: encerra');

// fail-closed
assert.equal(t(tx({ bundleId: 'com.outro.app' })).motivo, 'bundle_diferente');
assert.equal(t(tx({ productId: 'olli_gold' })).motivo, 'produto_desconhecido');
assert.equal(t(tx({ type: 'Consumable' })).motivo, 'tipo_nao_e_assinatura');
assert.equal(t(tx({ originalTransactionId: 'abc' })).acao, 'invalido');
assert.equal(t(tx({ expiresDate: undefined })).motivo, 'sem_expiracao');
assert.equal(t(tx({ expiresDate: 'amanhã' })).motivo, 'sem_expiracao');
assert.equal(t(tx({ environment: 'Xcode' })).motivo, 'ambiente_desconhecido');
assert.equal(t(null).acao, 'invalido');
assert.equal(t([]).acao, 'invalido');
assert.equal(traduzirTransacaoApple(tx(), { userId: 'nao-uuid', transacaoId: 'apple:abc', agora }).motivo, 'sem_dono');
assert.equal(traduzirTransacaoApple(tx(), { userId: USER, agora }).motivo, 'sem_vinculo');
caso('fail-closed: bundle, produto, tipo, ids, expiresDate, ambiente, entrada lixo e dono/vínculo ausentes nunca concedem');

// sandbox
{
  const sb = tx({ environment: 'Sandbox' });
  assert.deepEqual(t(sb), { acao: 'registrar', motivo: 'sandbox_nao_permitido' });
  assert.equal(t(sb, { sandboxPermitido: true }).acao, 'conceder');
  caso('Sandbox: só registra; concede apenas para testador permitido');
}

// dono e vínculo
assert.equal(donoDaTransacao(tx({ appAccountToken: USER.toUpperCase() })), USER, 'normaliza caixa');
assert.equal(donoDaTransacao(tx({ appAccountToken: 'x' })), null);
assert.equal(donoDaTransacao(tx({ appAccountToken: undefined })), null);
assert.equal(validarTransacao(tx()).ok, true);
{
  const a = await vinculoApple('2000000123456789');
  assert.match(a, /^apple:[0-9a-f]{64}$/);
  assert.equal(a, await vinculoApple('2000000123456789'));
  assert.notEqual(a, await vinculoApple('2000000123456780'));
  caso('dono = appAccountToken (UUID, caixa normalizada); vínculo = apple:sha256 estável por originalTransactionId');
}

console.log(`\nteste-apple-traducao: ${ok} casos OK`);
