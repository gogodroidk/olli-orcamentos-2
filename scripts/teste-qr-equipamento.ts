/**
 * QR DO EQUIPAMENTO — check-in pelo QR + etiqueta que vende (app).
 *
 *     node scripts/teste-qr-equipamento.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  1) leitura do QR: casa /q/ e /e/ SÓ no domínio do OLLI; token cru; lixo → null;
 *  2) histórico do equipamento: OS diretas + visitas PMOC, sem duplicar, sem lixeira;
 *     último serviço pelo fechamento; próxima manutenção (agendada x PMOC, hoje em
 *     diante); PMOC vencida; garantia com prazo legível (dias/meses/ano) e SEM
 *     afirmar vigência quando o texto não tem prazo; fotos sem repetir;
 *  3) "Iniciar atendimento" retoma na ordem certa (em execução > pausada > agendada
 *     mais cedo > aberta) e nunca retoma concluída/cancelada;
 *  4) etiqueta impressa: 3 tamanhos, logo só data-URI raster, contato do prestador,
 *     selo "Gerado com OLLI" só no Grátis, token vazio não imprime, escape de HTML,
 *     cópias com teto, QR aponta para /q/<token>;
 *  5) pedido pela etiqueta: linha da nuvem → objeto (linha torta = null), mensagem e
 *     link de resposta no WhatsApp com o número normalizado;
 *  6) fiação: schema local v10 com `asset_id`, sync com a escada de coluna ausente,
 *     scanner reusando a regra pura, worker com a rota /e/ e o POST.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import type { OrdemServico, PmocOrdemGerada, PedidoOrcamentoQr } from '../src/types/index.ts';
import { extrairTokenQr, urlEtiqueta, telefoneLegivel } from '../src/utils/qrEtiqueta.ts';
import {
  diaBr,
  diaDe,
  hojeLocal,
  montarHistoricoEquipamento,
  osParaRetomar,
  prazoGarantia,
} from '../src/utils/historicoEquipamento.ts';
import {
  codigoCurto,
  etiquetasPorLinha,
  logoSegura,
  montarHtmlEtiqueta,
  montarHtmlEtiquetasLote,
  TAMANHOS_ETIQUETA,
} from '../src/utils/etiquetaQrPdf.ts';
import { linkResponderPedidoQr, mensagemRespostaPedidoQr, rowParaPedido } from '../src/utils/pedidoQr.ts';

let verificacoes = 0;
function ok(nome: string, fn: () => void) {
  fn();
  verificacoes += 1;
  console.log(`  ok   ${nome}`);
}

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) leitura do QR');
ok('etiqueta /q/ no domínio do OLLI', () => {
  assert.equal(extrairTokenQr(`https://link.olliorcamentos.online/q/${TOKEN}`), TOKEN);
});
ok('apelido /e/ também casa', () => {
  assert.equal(extrairTokenQr(`https://link.olliorcamentos.online/e/${TOKEN}?utm=x`), TOKEN);
});
ok('domínio .app e sem subdomínio', () => {
  assert.equal(extrairTokenQr(`https://olliorcamentos.app/q/${TOKEN}`), TOKEN);
});
ok('outro site com /q/ NÃO casa (nem disfarçado de subdomínio)', () => {
  assert.equal(extrairTokenQr(`https://golpe.com/q/${TOKEN}`), null);
  assert.equal(extrairTokenQr(`https://olliorcamentos.online.golpe.com/q/${TOKEN}`), null);
  assert.equal(extrairTokenQr(`https://xolliorcamentos.online.evil/q/${TOKEN}`), null);
});
ok('token cru aceito; lixo e vazio recusados', () => {
  assert.equal(extrairTokenQr(TOKEN), TOKEN);
  assert.equal(extrairTokenQr(''), null);
  assert.equal(extrairTokenQr('curto'), null);
  assert.equal(extrairTokenQr('https://link.olliorcamentos.online/q/%3Cscript%3E'), null);
});
ok('urlEtiqueta continua em /q/ (etiquetas já impressas) e vazio sem token', () => {
  assert.equal(urlEtiqueta(TOKEN), `https://link.olliorcamentos.online/q/${TOKEN}`);
  assert.equal(urlEtiqueta(''), '');
});
ok('telefone legível para o adesivo', () => {
  assert.equal(telefoneLegivel('5511987654321'), '(11) 98765-4321');
  assert.equal(telefoneLegivel('551134567890'), '(11) 3456-7890');
  assert.equal(telefoneLegivel('11987654321'), '');
  assert.equal(telefoneLegivel(null), '');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n2) histórico do equipamento');
const EQ = 'eq-1';
function os(p: Partial<OrdemServico> & { id: string }): OrdemServico {
  return {
    numero: p.id.toUpperCase(),
    clienteNome: 'Cliente',
    titulo: `Serviço ${p.id}`,
    status: 'aberta',
    checklist: [],
    fotos: [],
    criadoEm: '2026-01-01T10:00:00.000Z',
    atualizadoEm: '2026-01-01T10:00:00.000Z',
    ...p,
  };
}
function gerada(p: Partial<PmocOrdemGerada> & { id: string; ordemId: string }): PmocOrdemGerada {
  return {
    planoId: 'pl-1',
    equipamentoId: EQ,
    periodo: '2026-10',
    periodicidadeId: 'mensal',
    criadoEm: '2026-01-01T00:00:00.000Z',
    ...p,
  };
}
const HOJE = '2026-10-01';
const ordens = [
  os({ id: 'os-a', equipamentoId: EQ, status: 'concluida', concluidoEm: '2026-08-10T15:00:00.000Z', orcamentoId: 'orc-1', fotos: ['f1', 'f2'], criadoEm: '2026-08-01T00:00:00.000Z' }),
  os({ id: 'os-b', equipamentoId: EQ, status: 'concluida', concluidoEm: '2026-09-20T15:00:00.000Z', fotos: ['f2', 'f3'], criadoEm: '2026-09-01T00:00:00.000Z' }),
  os({ id: 'os-pm1', status: 'agendada', dataAgendada: '2026-10-15T12:00:01.000Z', criadoEm: '2026-09-05T00:00:00.000Z' }),
  os({ id: 'os-pm-velha', status: 'aberta', criadoEm: '2026-07-01T00:00:00.000Z' }),
  os({ id: 'os-lixo', equipamentoId: EQ, status: 'concluida', concluidoEm: '2026-09-30T00:00:00.000Z', excluidoEm: '2026-09-30T01:00:00.000Z' }),
  os({ id: 'os-outro', equipamentoId: 'eq-2', status: 'concluida', concluidoEm: '2026-09-29T00:00:00.000Z' }),
];
const geradas = [
  gerada({ id: 'g1', ordemId: 'os-pm1', vencimento: '2026-10-31' }),
  gerada({ id: 'g0', ordemId: 'os-pm-velha', vencimento: '2026-07-31' }),
  gerada({ id: 'g-outro', ordemId: 'os-outro', equipamentoId: 'eq-2', vencimento: '2026-10-05' }),
];
const h = montarHistoricoEquipamento({
  equipamentoId: EQ,
  fotosEquipamento: ['f0', 'f1'],
  ordens: [...ordens, ordens[0]], // duplicata vinda de dois caminhos
  geradas,
  garantiaPorOrcamento: { 'orc-1': 'Garantia de 90 dias no serviço' },
  hoje: HOJE,
});
ok('junta OS diretas + PMOC, sem duplicata, sem lixeira, sem outro equipamento', () => {
  assert.deepEqual(h.ordens.map((o) => o.id), ['os-pm1', 'os-b', 'os-a', 'os-pm-velha']);
});
ok('último serviço = fechamento mais recente', () => {
  assert.equal(h.ultimoServico?.osId, 'os-b');
  assert.equal(h.ultimoServico?.data, '2026-09-20T15:00:00.000Z');
});
ok('próxima manutenção: a OS agendada (15/10) vence o vencimento PMOC (31/10)', () => {
  assert.deepEqual(h.proximaManutencao, { dia: '2026-10-15', origem: 'agendada', osId: 'os-pm1' });
});
ok('PMOC com vencimento passado e OS aberta aparece como vencida', () => {
  assert.deepEqual(h.pmocVencida, { dia: '2026-07-31', osId: 'os-pm-velha' });
  assert.equal(h.visitasPmoc, 2);
});
ok('garantia: só serviços concluídos com texto; prazo em dias calculado do fechamento', () => {
  assert.equal(h.garantia?.osNumero, 'OS-A');
  assert.equal(h.garantia?.desde, '2026-08-10');
  assert.equal(h.garantia?.ate, '2026-11-08');
  assert.equal(h.garantia?.vigente, true);
});
ok('fotos do equipamento primeiro e sem repetir', () => {
  assert.deepEqual(h.fotos, ['f0', 'f1', 'f2', 'f3']);
});
ok('abertas começam pela OS a retomar', () => {
  assert.equal(h.abertas[0].id, 'os-pm1');
  assert.equal(h.abertas.length, 2);
});
ok('equipamento sem nada: histórico vazio e sem afirmar próxima/garantia', () => {
  const v = montarHistoricoEquipamento({ equipamentoId: 'x', fotosEquipamento: [], ordens: [], geradas: [], hoje: HOJE });
  assert.equal(v.ordens.length, 0);
  assert.equal(v.ultimoServico, undefined);
  assert.equal(v.proximaManutencao, undefined);
  assert.equal(v.garantia, undefined);
  assert.equal(v.pmocVencida, undefined);
});
ok('PMOC concluída não conta como próxima nem como vencida', () => {
  const v = montarHistoricoEquipamento({
    equipamentoId: EQ, fotosEquipamento: [], hoje: HOJE,
    ordens: [os({ id: 'p', status: 'concluida', concluidoEm: '2026-09-01T00:00:00Z' })],
    geradas: [gerada({ id: 'gx', ordemId: 'p', vencimento: '2026-12-31' }), gerada({ id: 'gy', ordemId: 'p', periodo: '2026-08', vencimento: '2026-08-31' })],
  });
  assert.equal(v.proximaManutencao, undefined);
  assert.equal(v.pmocVencida, undefined);
});
ok('prazo de garantia legível', () => {
  assert.deepEqual(prazoGarantia('90 dias'), { qtd: 90, unidade: 'dia' });
  assert.deepEqual(prazoGarantia('Garantia: 3 MESES'), { qtd: 3, unidade: 'mes' });
  assert.deepEqual(prazoGarantia('6 mêses de garantia'), { qtd: 6, unidade: 'mes' });
  assert.deepEqual(prazoGarantia('1 ano'), { qtd: 1, unidade: 'ano' });
  assert.equal(prazoGarantia('conforme fabricante'), null);
  assert.equal(prazoGarantia('0 dias'), null);
  assert.equal(prazoGarantia(undefined), null);
});
ok('garantia sem prazo legível: mostra texto, NÃO afirma vigência', () => {
  const v = montarHistoricoEquipamento({
    equipamentoId: EQ, fotosEquipamento: [], geradas: [], hoje: HOJE,
    ordens: [os({ id: 'g', equipamentoId: EQ, status: 'concluida', concluidoEm: '2026-01-10T00:00:00Z', orcamentoId: 'o' })],
    garantiaPorOrcamento: { o: 'Conforme fabricante' },
  });
  assert.equal(v.garantia?.texto, 'Conforme fabricante');
  assert.equal(v.garantia?.ate, undefined);
  assert.equal(v.garantia?.vigente, undefined);
});
ok('garantia vencida', () => {
  const v = montarHistoricoEquipamento({
    equipamentoId: EQ, fotosEquipamento: [], geradas: [], hoje: HOJE,
    ordens: [os({ id: 'g', equipamentoId: EQ, status: 'concluida', concluidoEm: '2025-01-31T00:00:00Z', orcamentoId: 'o' })],
    garantiaPorOrcamento: { o: '1 mês' },
  });
  assert.equal(v.garantia?.ate, '2025-02-28', '31/01 + 1 mês prende no fim de fevereiro');
  assert.equal(v.garantia?.vigente, false);
});
ok('datas: dia ISO, pt-BR e hoje local', () => {
  assert.equal(diaDe('2026-10-15T12:00:01.000Z'), '2026-10-15');
  assert.equal(diaDe('lixo'), '');
  assert.equal(diaBr('2026-10-15'), '15/10/2026');
  assert.equal(diaBr(undefined), '');
  assert.equal(hojeLocal(new Date(2026, 0, 5, 23, 0)), '2026-01-05');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3) retomar atendimento');
ok('em execução > pausada > agendada mais cedo > aberta', () => {
  const lista = [
    os({ id: 'ab', status: 'aberta' }),
    os({ id: 'ag2', status: 'agendada', dataAgendada: '2026-10-20T10:00:00Z' }),
    os({ id: 'ag1', status: 'agendada', dataAgendada: '2026-10-10T10:00:00Z' }),
    os({ id: 'pa', status: 'pausada' }),
  ];
  assert.equal(osParaRetomar(lista)?.id, 'pa');
  assert.equal(osParaRetomar([...lista, os({ id: 'ex', status: 'em_execucao' })])?.id, 'ex');
  assert.equal(osParaRetomar(lista.filter((o) => o.status !== 'pausada'))?.id, 'ag1');
  assert.equal(osParaRetomar([]), undefined);
});
ok('o histórico nunca põe concluída/cancelada entre as abertas', () => {
  const v = montarHistoricoEquipamento({
    equipamentoId: EQ, fotosEquipamento: [], geradas: [], hoje: HOJE,
    ordens: [os({ id: 'c', equipamentoId: EQ, status: 'concluida' }), os({ id: 'x', equipamentoId: EQ, status: 'cancelada' })],
  });
  assert.equal(v.abertas.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n4) etiqueta impressa');
const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
ok('logo: só data URI raster', () => {
  assert.equal(logoSegura(LOGO), LOGO);
  assert.equal(logoSegura('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(logoSegura('https://exemplo.com/logo.png'), null);
  assert.equal(logoSegura('data:image/png;base64,abc"onerror="x'), null);
  assert.equal(logoSegura(undefined), null);
});
const base = { titulo: 'AC-014 <Sala>', subtitulo: 'Sala 302', qrToken: TOKEN };
ok('etiqueta com marca do prestador, contato e chamada que vende', () => {
  const html = montarHtmlEtiqueta(base, { empresa: 'Frio & Cia', logoDataUri: LOGO, contato: '(11) 98765-4321', tamanho: 'grande' });
  assert.match(html, /<img class="logo" src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.match(html, /\(11\) 98765-4321/);
  assert.match(html, /última manutenção e pedir orçamento/);
  assert.match(html, /AC-014 &lt;Sala&gt;/);
  assert.ok(!html.includes('<Sala>'), 'título escapado');
  assert.match(html, new RegExp(`Cód\\. ${codigoCurto(TOKEN)}`));
  assert.match(html, /width:90mm/);
});
ok('sem logo cai no nome da empresa (escapado)', () => {
  const html = montarHtmlEtiqueta(base, { empresa: 'Frio & Cia', logoDataUri: 'https://x/logo.png' });
  assert.match(html, /<div class="empresa-nome">Frio &amp; Cia<\/div>/);
  assert.ok(!html.includes('https://x/logo.png'));
});
ok('selo "Gerado com OLLI" só no Grátis', () => {
  assert.match(montarHtmlEtiqueta(base, {}), /Gerado com OLLI/);
  assert.ok(!montarHtmlEtiqueta(base, { removerMarca: true }).includes('Gerado com OLLI'));
});
ok('três tamanhos de adesivo cabem no A4 e o QR nunca é minúsculo', () => {
  for (const [t, m] of Object.entries(TAMANHOS_ETIQUETA)) {
    assert.ok(m.qrMm >= 24, `${t}: QR >= 24 mm`);
    assert.ok(m.larguraMm <= 190, `${t}: cabe na área útil`);
    const html = montarHtmlEtiqueta(base, { tamanho: t as keyof typeof TAMANHOS_ETIQUETA });
    assert.match(html, new RegExp(`width:${m.larguraMm}mm`));
  }
  assert.equal(etiquetasPorLinha('pequena'), 4);
  assert.equal(etiquetasPorLinha('media'), 3);
  assert.equal(etiquetasPorLinha('grande'), 2);
});
ok('adesivo pequeno usa a chamada curta e esconde o subtítulo', () => {
  const html = montarHtmlEtiqueta(base, { tamanho: 'pequena' });
  assert.match(html, /Escaneie: manutenção e orçamento/);
  assert.ok(!html.includes('Sala 302'));
});
ok('cópias: N etiquetas, com teto', () => {
  const conta = (html: string) => (html.match(/class="label /g) ?? []).length;
  assert.equal(conta(montarHtmlEtiqueta(base, { copias: 6 })), 6);
  assert.equal(conta(montarHtmlEtiqueta(base, { copias: 999 })), 40);
  assert.equal(conta(montarHtmlEtiqueta(base, { copias: 0 })), 1);
});
ok('token vazio não imprime etiqueta; lote conta os ignorados', () => {
  assert.ok(!montarHtmlEtiqueta({ ...base, qrToken: '' }).includes('class="label'));
  const lote = montarHtmlEtiquetasLote([base, { ...base, qrToken: '' }], { copias: 2 });
  assert.equal(lote.impressos, 1);
  assert.equal(lote.ignorados, 1);
  assert.equal((lote.html.match(/class="label /g) ?? []).length, 2);
});
ok('cor da marca inválida não entra no CSS', () => {
  const html = montarHtmlEtiqueta(base, { corMarca: 'red;}</style><script>' });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /#0B6FCE/);
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n5) pedido pela etiqueta');
ok('linha da nuvem vira pedido; linha torta = null', () => {
  const p = rowParaPedido({ id: 'p1', asset_id: EQ, nome: 'Ana Lima', telefone: '5511987654321', mensagem: '', criado_em: '2026-10-01T12:00:00Z', atendido_em: null });
  assert.deepEqual(p, { id: 'p1', equipamentoId: EQ, nome: 'Ana Lima', telefone: '5511987654321', mensagem: undefined, criadoEm: '2026-10-01T12:00:00Z', atendidoEm: undefined });
  assert.equal(rowParaPedido({ id: 1, asset_id: EQ }), null);
});
ok('resposta pronta no WhatsApp com o número do pedido', () => {
  const p: PedidoOrcamentoQr = { id: 'p1', equipamentoId: EQ, nome: '  Ana  Lima ', telefone: '5511987654321', criadoEm: '' };
  const msg = mensagemRespostaPedidoQr(p, 'AC-014', 'Frio & Cia');
  assert.equal(msg, 'Olá, Ana! Aqui é da Frio & Cia. Recebemos seu pedido de orçamento pela etiqueta do equipamento AC-014. Podemos combinar os detalhes por aqui?');
  assert.ok(linkResponderPedidoQr(p, 'AC-014').startsWith('https://wa.me/5511987654321?text='));
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n6) fiação');
const ler = (p: string) => readFileSync(p, 'utf8');
const db = ler('src/database/database.ts');
const sync = ler('src/services/cloudSync.ts');
ok('schema local: asset_id no CREATE, na migração incremental e no save', () => {
  assert.match(db, /excluido_em TEXT,\s*asset_id TEXT\s*\)/);
  assert.match(db, /addColumnIfMissing\(database, 'ordens_servico', 'asset_id', 'TEXT'\)/);
  const versao = Number(/const SCHEMA_VERSION = (\d+);/.exec(db)?.[1]);
  const bloco = new RegExp(`if \\(v < ${versao}\\) \\{\\s*await addColumnIfMissing\\(database, 'ordens_servico', 'asset_id'`);
  assert.match(db, bloco, 'o bloco do asset_id é o da versão atual');
  assert.match(db, /excluido_em, asset_id\)\s*VALUES \(\?(,\?){19}\)/);
  assert.match(db, /equipamentoId: r\.asset_id \?\? undefined/);
});
ok('sync: escada da coluna ausente e pull que preserva o vínculo local', () => {
  assert.match(sync, /osSemColunaAsset \? \{\} : \{ asset_id: o\.equipamentoId \?\? null \}/);
  assert.match(sync, /table === 'ordens_servico' && !osSemColunaAsset && erroDeColunaDesconhecida\(error\)/);
  assert.match(sync, /if \(osSemColunaAsset && !assetId\)/);
});
ok('scanner usa a regra pura e a URL saiu do serviço com banco', () => {
  assert.match(ler('src/screens/EscanearQrScreen.tsx'), /import \{ extrairTokenQr \} from '\.\.\/utils\/qrEtiqueta'/);
  assert.match(ler('src/services/equipamentos.ts'), /export \{ urlEtiqueta \} from '\.\.\/utils\/qrEtiqueta'/);
});
ok('worker: /e/ apelido e POST do pedido', () => {
  const idx = ler('worker/src/index.js');
  assert.match(idx, /url\.pathname\.startsWith\('\/q\/'\) \|\| url\.pathname\.startsWith\('\/e\/'\)/);
  assert.match(idx, /if \(request\.method === 'POST'\) return receberPedidoEtiqueta\(resto, env, request\);/);
});
ok('migration com timestamp único e sem aplicar dados', () => {
  const mig = ler('supabase/migrations/20261002153217_qr_equipamento_atendimento.sql');
  assert.match(mig, /add column if not exists asset_id text/);
  assert.match(mig, /grant update \(atendido_em\) on table public\.pedidos_orcamento_qr to authenticated/);
  assert.ok(!/\binsert into\b/i.test(mig.split('-- CONFERÊNCIA')[0]), 'sem dado semeado');
});

console.log(`\n${verificacoes} verificações ok`);
