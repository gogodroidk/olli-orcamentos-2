/**
 * Verificação de JWS da Apple (worker/src/appleJws.js) com uma CADEIA DE TESTE gerada pelo openssl
 * (raiz P-384 → intermediária P-384 → folha P-256, com os OIDs-marca da Apple). Sem rede.
 *     node worker/scripts/teste-apple-jws.js
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppleJwsErro, RAIZ_APPLE_G3_SHA256, verificarJwsApple } from '../src/appleJws.js';

const dir = mkdtempSync(join(tmpdir(), 'apple-jws-'));
const sh = (...a) => execFileSync('openssl', a, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
const f = (n) => join(dir, n);
let ok = 0;
const caso = (n) => {
  ok++;
  console.log(`  ok  ${n}`);
};

function cadeia(prefixo, { marca = true } = {}) {
  const p = (n) => `${prefixo}-${n}`;
  sh('ecparam', '-name', 'secp384r1', '-genkey', '-noout', '-out', p('root.key'));
  sh('req', '-new', '-x509', '-key', p('root.key'), '-subj', `/CN=${prefixo} Root`, '-days', '3650', '-sha384', '-out', p('root.crt'), '-addext', 'basicConstraints=critical,CA:TRUE');
  sh('ecparam', '-name', 'secp384r1', '-genkey', '-noout', '-out', p('int.key'));
  sh('req', '-new', '-key', p('int.key'), '-subj', `/CN=${prefixo} Inter`, '-out', p('int.csr'));
  writeFileSync(f(p('int.cnf')), `basicConstraints=CA:TRUE\n${marca ? '1.2.840.113635.100.6.2.1=ASN1:NULL\n' : ''}`);
  sh('x509', '-req', '-in', p('int.csr'), '-CA', p('root.crt'), '-CAkey', p('root.key'), '-CAcreateserial', '-days', '3000', '-sha384', '-extfile', p('int.cnf'), '-out', p('int.crt'));
  sh('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', p('leaf.key'));
  sh('req', '-new', '-key', p('leaf.key'), '-subj', `/CN=${prefixo} Leaf`, '-out', p('leaf.csr'));
  writeFileSync(f(p('leaf.cnf')), `basicConstraints=CA:FALSE\n${marca ? '1.2.840.113635.100.6.11.1=ASN1:NULL\n' : ''}`);
  sh('x509', '-req', '-in', p('leaf.csr'), '-CA', p('int.crt'), '-CAkey', p('int.key'), '-CAcreateserial', '-days', '365', '-sha256', '-extfile', p('leaf.cnf'), '-out', p('leaf.crt'));
  const der = (n) => sh('x509', '-in', p(n), '-outform', 'der').toString('base64');
  const rootDer = sh('x509', '-in', p('root.crt'), '-outform', 'der');
  return {
    x5c: [der('leaf.crt'), der('int.crt'), der('root.crt')],
    leafKey: createPrivateKey(readFileSync(f(p('leaf.key')))),
    raizSha: createHash('sha256').update(rootDer).digest('hex'),
  };
}
const b64u = (b) => Buffer.from(b).toString('base64url');
function assinar(c, payload, headerExtra = {}) {
  const h = b64u(JSON.stringify({ alg: 'ES256', x5c: c.x5c, ...headerExtra }));
  const p = b64u(JSON.stringify(payload));
  const sig = sign('sha256', Buffer.from(`${h}.${p}`), { key: c.leafKey, dsaEncoding: 'ieee-p1363' });
  return `${h}.${p}.${b64u(sig)}`;
}
async function erro(jws, opcoes, codigo, nome) {
  await assert.rejects(() => verificarJwsApple(jws, opcoes), (e) => e instanceof AppleJwsErro && e.codigo === codigo, nome);
  caso(nome);
}

// 0. a raiz fixada no código é a "Apple Root CA - G3" de verdade (fixture = cert baixado da Apple)
{
  const cer = readFileSync(new URL('./fixtures/AppleRootCA-G3.cer', import.meta.url));
  assert.equal(createHash('sha256').update(cer).digest('hex'), RAIZ_APPLE_G3_SHA256);
  caso('RAIZ_APPLE_G3_SHA256 confere com o certificado oficial (fixture)');
}

const a = cadeia('apple');
const agora = Date.now() + 60_000; // +1 min: certificados nascem "agora" (granularidade de 1 s) e a data da assinatura não pode ser anterior
const payload = { bundleId: 'online.olliorcamentos.app', productId: 'olli_pro', signedDate: agora, x: 1 };
const opc = { raizes: [a.raizSha] };

{
  const r = await verificarJwsApple(assinar(a, payload), opc);
  assert.deepEqual(r, payload);
  caso('JWS válido: cadeia, marca Apple e assinatura confere; devolve o payload');
}
{
  const jws = assinar(a, payload);
  const [h, , s] = jws.split('.');
  const adulterado = `${h}.${b64u(JSON.stringify({ ...payload, productId: 'olli_empresa' }))}.${s}`;
  await erro(adulterado, opc, 'assinatura_invalida', 'payload adulterado: recusa');
}
await erro(assinar(a, payload, { alg: 'none' }), opc, 'algoritmo_invalido', 'alg none/diferente de ES256: recusa');
{
  const c = { ...a, x5c: a.x5c.slice(1) };
  await erro(assinar(c, payload), opc, 'cadeia_invalida', 'cadeia com 2 certificados: recusa');
}
await erro(assinar(a, payload), {}, 'raiz_nao_confiavel', 'raiz que não é a da Apple (padrão): recusa');
{
  const sem = cadeia('semmarca', { marca: false });
  await erro(assinar(sem, payload), { raizes: [sem.raizSha] }, 'certificado_sem_marca_apple', 'cadeia sem os OIDs da Apple: recusa');
  const r = await verificarJwsApple(assinar(sem, payload), { raizes: [sem.raizSha], exigirMarcaApple: false });
  assert.equal(r.productId, 'olli_pro');
  caso('...mas aceita com exigirMarcaApple:false (só para teste)');
}
{
  const outra = cadeia('outra');
  // folha de OUTRA cadeia com a intermediária e a raiz da primeira: encadeamento quebrado
  const misto = { x5c: [outra.x5c[0], a.x5c[1], a.x5c[2]], leafKey: outra.leafKey };
  await erro(assinar(misto, payload), opc, 'cadeia_invalida', 'folha não assinada pela intermediária: recusa');
}
await erro(assinar(a, { ...payload, signedDate: Date.parse('2000-01-01') }), opc, 'certificado_fora_da_validade', 'assinado antes de o certificado existir: recusa');
await erro(assinar(a, { ...payload, signedDate: agora + 3600e3 }), opc, 'assinado_no_futuro', 'signedDate no futuro: recusa');
{
  const antigo = { ...payload, signedDate: agora + 100 * 86400e3 }; // folha dura 365 d: vigente na assinatura (+100 d), vencida "hoje" (+400 d)
  const r = await verificarJwsApple(assinar(a, antigo), { ...opc, agora: agora + 400 * 86400e3 });
  assert.equal(r.signedDate, antigo.signedDate);
  caso('folha vencida hoje mas vigente na data da assinatura: aceita (transação antiga)');
}
{
  // DER malformado com a raiz CERTA: erro limpo, e a raiz errada é recusada ANTES de parsear qualquer coisa
  const h = b64u(JSON.stringify({ alg: 'ES256', x5c: [Buffer.from('lixo').toString('base64'), Buffer.from('lixo2').toString('base64'), a.x5c[2]] }));
  const forjado = `${h}.${b64u(JSON.stringify({ signedDate: agora }))}.${b64u(Buffer.alloc(64, 7))}`;
  await erro(forjado, opc, 'der_invalido', 'DER malformado (raiz certa): AppleJwsErro der_invalido, não TypeError');
  await erro(forjado, {}, 'raiz_nao_confiavel', 'DER malformado com raiz errada: recusado pela raiz antes de parsear');
  // DER bem formado mas com ESTRUTURA errada (o caso que antes estourava TypeError: 'reading inicio')
  const estranho = Buffer.from([0x30, 0x03, 0x02, 0x01, 0x00]).toString('base64');
  const h2 = b64u(JSON.stringify({ alg: 'ES256', x5c: [estranho, estranho, a.x5c[2]] }));
  const forjado2 = `${h2}.${b64u(JSON.stringify({ signedDate: agora }))}.${b64u(Buffer.alloc(64, 7))}`;
  await erro(forjado2, opc, 'certificado_invalido', 'DER válido com estrutura errada: certificado_invalido (antes: TypeError/503 + Sentry)');
}
{
  const velho = { ...payload, signedDate: agora - 1000 };
  await erro(assinar(a, velho), { ...opc, agora: agora + 40 * 86400e3, maxIdadeMs: 7 * 86400e3 }, 'assinatura_antiga', 'maxIdadeMs: assinatura mais velha que a janela é recusada');
  const r = await verificarJwsApple(assinar(a, velho), { ...opc, agora: agora + 3 * 86400e3, maxIdadeMs: 7 * 86400e3 });
  assert.equal(r.productId, 'olli_pro');
  caso('maxIdadeMs: dentro da janela passa');
  await erro(assinar(a, { productId: 'x' }), { ...opc, maxIdadeMs: 7 * 86400e3 }, 'sem_signed_date', 'com janela, payload sem signedDate é recusado');
}
await erro('a.b', opc, 'jws_invalido', 'lixo: recusa');
await erro('', opc, 'jws_invalido', 'vazio: recusa');
await erro(null, opc, 'jws_invalido', 'nulo: recusa');
{
  const jws = assinar(a, payload);
  const [h, p] = jws.split('.');
  await erro(`${h}.${p}.${b64u(Buffer.alloc(64, 1))}`, opc, 'assinatura_invalida', 'assinatura forjada: recusa');
}

console.log(`\nteste-apple-jws: ${ok} casos OK`);
