/**
 * Encerramento em 60 segundos na OS (jogada B5).
 *
 *     node scripts/teste-encerramento-os.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - passos na ordem do trabalho, cobrança ANTES do recibo (recibo = dinheiro entrou);
 *  - cada passo pulável; progresso conta feitos + pulados; refazer volta a pendente
 *    sem apagar a assinatura/recibo já gravados;
 *  - leitura tolerante do banco (TEXT JSON, jsonb, lixo) — nunca lança;
 *  - Pix fail-closed: sem chave / chave inválida / sem valor = sem QR, nunca quebrado;
 *  - próxima visita: N meses depois, 9h, domingo vira segunda;
 *  - SQLite, sync (com escada de coluna ausente), migration e tela ligados (contrato).
 */
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INFO_PASSO,
  PASSOS_ENCERRAMENTO,
  estadoDoPasso,
  iniciarEncerramento,
  lerEncerramento,
  marcarPasso,
  mensagemCobrancaEncerramento,
  mensagemResumoAtendimento,
  pixDoEncerramento,
  progressoEncerramento,
  proximoPasso,
  reabrirPasso,
  rotuloBotaoEncerrar,
  sugerirProximaVisita,
} from '../src/utils/encerramentoOS.ts';
import { pixCopiaEColaValido } from '../src/utils/pixBrCode.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

let verificacoes = 0;
function ok(nome: string, fn: () => void) {
  fn();
  verificacoes += 1;
  console.log(`  ok   ${nome}`);
}

const T0 = new Date('2026-10-01T15:00:00.000Z');
const T1 = new Date('2026-10-01T15:01:00.000Z');

console.log('\n1) passos, estados e progresso');
ok('ordem do trabalho, cobrança antes do recibo, todo passo explicado', () => {
  assert.deepEqual([...PASSOS_ENCERRAMENTO], ['fotos', 'assinatura', 'cobranca', 'recibo', 'proxima_visita', 'avaliacao']);
  assert.ok(PASSOS_ENCERRAMENTO.indexOf('cobranca') < PASSOS_ENCERRAMENTO.indexOf('recibo'));
  for (const p of PASSOS_ENCERRAMENTO) {
    assert.ok(INFO_PASSO[p].titulo.length > 0);
    assert.ok(INFO_PASSO[p].descricao.length > 10);
  }
  assert.match(INFO_PASSO.cobranca.descricao, /Só marque como pago quando o dinheiro cair/);
});
ok('novo encerramento: tudo pendente, começa nas fotos', () => {
  const e = iniciarEncerramento(T0);
  assert.equal(e.iniciadoEm, T0.toISOString());
  for (const p of PASSOS_ENCERRAMENTO) assert.equal(estadoDoPasso(e, p), 'pendente');
  assert.equal(proximoPasso(e), 'fotos');
  assert.deepEqual(progressoEncerramento(e), { resolvidos: 0, feitos: 0, pulados: 0, total: 6, fracao: 0 });
  assert.equal(proximoPasso(undefined), 'fotos');
});
ok('marcar é imutável; pulado conta como resolvido; próximo pula os resolvidos', () => {
  const e0 = iniciarEncerramento(T0);
  const e1 = marcarPasso(e0, 'fotos', 'feito', T1);
  const e2 = marcarPasso(e1, 'assinatura', 'pulado', T1);
  assert.equal(estadoDoPasso(e0, 'fotos'), 'pendente', 'o original não muda');
  assert.equal(estadoDoPasso(e2, 'fotos'), 'feito');
  assert.equal(estadoDoPasso(e2, 'assinatura'), 'pulado');
  assert.equal(proximoPasso(e2), 'cobranca');
  const pr = progressoEncerramento(e2);
  assert.equal(pr.resolvidos, 2); assert.equal(pr.feitos, 1); assert.equal(pr.pulados, 1);
  assert.equal(pr.fracao, 2 / 6);
});
ok('passo pendente no meio volta a ser o próximo (fluxo não se perde)', () => {
  let e = iniciarEncerramento(T0);
  for (const p of PASSOS_ENCERRAMENTO) if (p !== 'recibo') e = marcarPasso(e, p, 'feito', T1);
  assert.equal(proximoPasso(e), 'recibo');
  e = marcarPasso(e, 'recibo', 'pulado', T1);
  assert.equal(proximoPasso(e), null);
  assert.equal(progressoEncerramento(e).fracao, 1);
});
ok('extra grava junto (assinatura) e refazer não apaga a assinatura', () => {
  const e = marcarPasso(iniciarEncerramento(T0), 'assinatura', 'feito', T1, {
    assinaturaClienteUri: 'data:image/png;base64,AAAA', assinaturaEm: T1.toISOString(), assinanteNome: 'Ana',
  });
  const r = reabrirPasso(e, 'assinatura');
  assert.equal(estadoDoPasso(r, 'assinatura'), 'pendente');
  assert.equal(r.assinaturaClienteUri, 'data:image/png;base64,AAAA');
});
ok('rótulo do botão da OS: encerrar → continuar N de 6 → encerrado', () => {
  assert.equal(rotuloBotaoEncerrar(undefined), 'Encerrar atendimento');
  const e = marcarPasso(iniciarEncerramento(T0), 'fotos', 'feito', T1);
  assert.equal(rotuloBotaoEncerrar(e), 'Continuar encerramento · 1 de 6');
  assert.equal(rotuloBotaoEncerrar({ ...e, finalizadoEm: T1.toISOString() }), 'Atendimento encerrado');
});

console.log('\n2) leitura tolerante do banco');
ok('TEXT JSON (SQLite) e objeto (jsonb) dão o mesmo encerramento', () => {
  const e = marcarPasso(iniciarEncerramento(T0), 'cobranca', 'feito', T1, { reciboId: 'r1' });
  assert.deepEqual(lerEncerramento(JSON.stringify(e)), e);
  assert.deepEqual(lerEncerramento(JSON.parse(JSON.stringify(e))), e);
});
ok('lixo vira "sem encerramento" (undefined), nunca lança', () => {
  for (const v of [null, undefined, '', '   ', '{', '[]', 42, [], {}, { iniciadoEm: 'ontem' }]) {
    assert.equal(lerEncerramento(v), undefined, `valor ${JSON.stringify(v)}`);
  }
});
ok('passo inválido some sem derrubar os válidos; assinatura só data:image', () => {
  const lido = lerEncerramento({
    iniciadoEm: T0.toISOString(),
    passos: {
      fotos: { estado: 'feito', em: T1.toISOString() },
      assinatura: { estado: 'talvez', em: T1.toISOString() },
      inventado: { estado: 'feito', em: T1.toISOString() },
      recibo: { estado: 'pulado', em: 'nunca' },
    },
    assinaturaClienteUri: 'https://evil.example/x.png',
    reciboId: 42,
  });
  assert.ok(lido);
  assert.deepEqual(Object.keys(lido.passos), ['fotos']);
  assert.equal(lido.assinaturaClienteUri, undefined);
  assert.equal(lido.reciboId, undefined);
});

console.log('\n3) Pix no aparelho, fail-closed');
const CHAVE_EMAIL = 'pix@prestador.com.br';
ok('chave válida + valor = código válido com o valor', () => {
  const p = pixDoEncerramento({ chavePix: CHAVE_EMAIL, valor: 180.5, nome: 'João Refrigeração', cidade: 'Campinas', referencia: 'OS-0007' });
  assert.equal(p.situacao, 'com_pix');
  assert.ok(pixCopiaEColaValido(p.codigo));
  assert.match(p.codigo, /5406180\.50/);
  assert.equal(p.valor, 180.5);
});
ok('sem chave, chave inválida e sem valor: sem código', () => {
  assert.deepEqual(pixDoEncerramento({ chavePix: '', valor: 100 }), { situacao: 'sem_chave', codigo: '', valor: 100 });
  assert.equal(pixDoEncerramento({ chavePix: 'não é chave', valor: 100 }).situacao, 'chave_invalida');
  assert.equal(pixDoEncerramento({ chavePix: CHAVE_EMAIL, valor: 0 }).situacao, 'sem_valor');
  assert.equal(pixDoEncerramento({ chavePix: CHAVE_EMAIL, valor: Number.NaN }).situacao, 'sem_valor');
  assert.equal(pixDoEncerramento({ chavePix: CHAVE_EMAIL, valor: -5 }).codigo, '');
});
ok('mensagens: cobrança leva o Pix só quando há; resumo só conta o que aconteceu', () => {
  const com = mensagemCobrancaEncerramento({ clienteNome: 'Ana Souza', titulo: 'Limpeza split', valorFormatado: 'R$ 180,00', pix: '000201XYZ' });
  assert.match(com, /^Oi, Ana! Serviço concluído: Limpeza split\./);
  assert.match(com, /000201XYZ/);
  const sem = mensagemCobrancaEncerramento({ clienteNome: '', titulo: '', valorFormatado: 'R$ 1,00' });
  assert.equal(/copia e cola/.test(sem), false);
  const e = marcarPasso(iniciarEncerramento(T0), 'proxima_visita', 'feito', T1, { proximaVisitaEm: '2027-04-15T12:00:00.000Z' });
  const resumo = mensagemResumoAtendimento({ clienteNome: 'Ana', titulo: 'Limpeza', fotos: 0, enc: e });
  assert.equal(/foto/.test(resumo), false, 'sem foto, não fala de foto');
  assert.equal(/assinado/.test(resumo), false, 'sem assinatura, não diz que assinou');
  assert.match(resumo, /Próxima visita marcada para 15\/04\/2027/);
});

console.log('\n4) próxima visita');
ok('N meses depois às 9h; domingo vira segunda; intervalo inválido cai em 6', () => {
  const base = new Date(2026, 9, 1, 15, 0); // 01/10/2026, quinta
  const d6 = new Date(sugerirProximaVisita(base, 6));
  assert.equal(d6.getFullYear(), 2027); assert.equal(d6.getMonth(), 3); assert.equal(d6.getHours(), 9);
  assert.notEqual(d6.getDay(), 0);
  // 2026-11-01 é domingo → segunda 02/11.
  const dom = new Date(sugerirProximaVisita(new Date(2026, 9, 1, 8), 1));
  assert.equal(dom.getDate(), 2); assert.equal(dom.getMonth(), 10); assert.equal(dom.getDay(), 1);
  const inval = new Date(sugerirProximaVisita(base, Number.NaN));
  assert.equal(inval.getMonth(), d6.getMonth());
  // 31/01 + 1 mês não pula para março (29/02/2028 é terça).
  const fev = new Date(sugerirProximaVisita(new Date(2028, 0, 31, 10), 1));
  assert.equal(fev.getMonth(), 1);
  assert.equal(fev.getDate(), 29);
});

console.log('\n5) contrato: banco, sync, migration e tela');
const db = ler('src/database/database.ts');
const sync = ler('src/services/cloudSync.ts');
const servico = ler('src/services/ordemServico.ts');
const tela = ler('src/screens/OrdemServicoScreen.tsx');
const modal = ler('src/components/encerramento/EncerrarAtendimentoModal.tsx');
ok('SQLite: coluna nova, migração v12 e leitura tolerante', () => {
  // A garantia da OS (Onda I3, v11) entrou antes; o encerramento é a v12.
  // Colunas mais novas (ex.: `materiais`, v13) podem vir depois do encerramento.
  assert.match(db, /asset_id TEXT,\s*(garantia TEXT,\s*garantia_de_os_id TEXT,\s*)?encerramento TEXT\s*[,)]/);
  assert.ok(Number(/const SCHEMA_VERSION = (\d+);/.exec(db)?.[1]) >= 12, 'a versão do schema cobre o encerramento');
  assert.match(db, /if \(v < 12\) \{\s*await addColumnIfMissing\(database, 'ordens_servico', 'encerramento', 'TEXT'\);/);
  assert.match(db, /encerramento: lerEncerramento\(r\.encerramento\)/);
  assert.match(db, /os\.encerramento \? JSON\.stringify\(os\.encerramento\) : null/);
});
ok('sync: envia jsonb, escada de coluna ausente e pull NÃO apaga o local', () => {
  assert.match(sync, /osSemColunaEncerramento \? \{\} : \{ encerramento: o\.encerramento \?\? null \}/);
  assert.match(sync, /!\('encerramento' in row\)\) osSemColunaEncerramento = true/);
  assert.match(sync, /delete \(row as Record<string, unknown>\)\.encerramento;/);
  assert.match(sync, /const encerramento = o\.encerramento \? JSON\.stringify\(o\.encerramento\) : encerramentoLocal;/);
});
ok('migration única, idempotente, sem segredo', () => {
  const nomes = readdirSync(join(RAIZ, 'supabase/migrations')).filter((n) => n.includes('os_encerramento'));
  assert.deepEqual(nomes, ['20261003102500_os_encerramento.sql']);
  const sql = ler(`supabase/migrations/${nomes[0]}`);
  assert.match(sql, /add column if not exists encerramento jsonb/);
  assert.match(sql, /drop constraint if exists ordens_servico_encerramento_formato/);
  assert.equal(/service_role_key|sk_live|eyJhbGci/i.test(sql), false);
});
ok('serviço: salvar lança se não gravou; finalizar conclui a OS numa escrita', () => {
  assert.match(servico, /export async function salvarEncerramentoOS\(/);
  assert.match(servico, /patchOrdem\(id, \{ encerramento, status \}\)/);
});
ok('tela: botão da OS, dica da 1ª vez e o atalho antigo de concluir', () => {
  assert.match(tela, /label=\{rotuloBotaoEncerrar\(ordem\.encerramento\)\}/);
  assert.match(tela, /id="os\.encerrar\.botao"/);
  assert.match(tela, /label="Só concluir, sem o passo a passo"/);
  assert.match(tela, /podeFaturar=\{pode\('gerenciar_faturamento'\)\}/);
  // Checklist no debounce é gravado ANTES de abrir o fluxo (senão o toque some da tela).
  assert.match(tela, /descarregarChecklist\(\)\.catch\(\(\) => \{\}\)\.finally\(\(\) => setShowEncerrar\(true\)\)/);
});
ok('modal: grava antes de seguir, erro de gravação é dito, assinatura lança se não gravou', () => {
  assert.match(modal, /Não salvei este passo no aparelho/);
  assert.match(modal, /LANÇA se não gravou: o modal segura os traços/);
  assert.match(modal, /const o = await salvarEncerramentoOS\(ordem\.id, novo\);/);
  assert.match(modal, /id="os\.encerramento\.primeira-vez"/);
  assert.match(modal, /useReduzirMovimento\(\)/);
  // WhatsApp só pelo link oficial (abrirWhatsApp → wa.me / api.whatsapp.com).
  assert.equal(/whatsapp-web\.js|baileys|venom-bot/i.test(modal), false);
  assert.match(modal, /abrirWhatsApp\(telefone, mensagem\)/);
});

console.log(`\nPASSOU: ${verificacoes} verificações\n`);
