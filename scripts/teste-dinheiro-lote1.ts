/**
 * CQ-DINHEIRO-LOTE1 (D-2506) — a frente do dinheiro, 1º lote:
 *  1. a verdade do Pix no link (CDC): painel e app param de prometer o Pix no link no Grátis;
 *  2. botão de pagar no aviso de limite do Grátis (PDF e WhatsApp), indo ao Pix do Pro que já existe;
 *  3. o fim (e a véspera) do teste do Pro mostra o que o Pro fez, só com número verdadeiro;
 *  4. medir: "viu o aviso" e "clicou em pagar no aviso" (migration escrita, não aplicada).
 *
 * Rodar: `npm run test:dinheiro-lote1`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FRASE_NAO_USOU_LINK,
  linhasDoQueOProFez,
  resumoTestePro,
  type EntradaResumoTestePro,
} from '../src/services/resumoTestePro.ts';
import { dicaChavePix, FRASE_PIX_LINK_GRATIS } from '../src/services/pixNoLink.ts';
import { PARAM_PAGAR, lerIntencaoPlano, podeAbrirPixDaIntencao } from '../webapp/src/olli/plano-intent.ts';
import { PRECO_PRO, reais } from '../web/src/data/planos.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
let casos = 0;
const caso = (nome: string, fn: () => void) => {
  fn();
  casos++;
  void nome;
};

// ─── 1. A verdade do Pix no link ────────────────────────────────────────────────
const PROMESSA_ANTIGA = 'Vai no recibo, na cobrança pelo WhatsApp e no link do orçamento depois que o cliente aprova.';

caso('Grátis: diz que o cliente NÃO vê o Pix no link e o que o Pro faz (frase da CPO)', () => {
  const d = dicaChavePix('bloqueado');
  assert.equal(d.avisoGratis, 'No Grátis, o seu cliente não vê o seu Pix no link. No Pro, ele paga por Pix ali mesmo.');
  assert.equal(d.avisoGratis, FRASE_PIX_LINK_GRATIS);
  assert.doesNotMatch(d.dica, /link do orçamento/i, 'no Grátis a dica não promete o link');
});
caso('Pro: promete o Pix no link (é verdade) e não mostra aviso', () => {
  const d = dicaChavePix('liberado');
  assert.match(d.dica, /link do orçamento/);
  assert.equal(d.avisoGratis, null);
});
caso('plano não confirmado: texto neutro, sem afirmar Grátis nem prometer Pix no link a quem não tem', () => {
  for (const e of ['carregando', 'indeterminado', 'em_breve'] as const) {
    const d = dicaChavePix(e);
    assert.equal(d.avisoGratis, null, e);
    assert.match(d.dica, /Pro e Empresa/, e);
  }
});
caso('nenhum texto do Pix promete preço ou prazo', () => {
  for (const e of ['carregando', 'indeterminado', 'em_breve', 'bloqueado', 'liberado'] as const) {
    const d = dicaChavePix(e);
    assert.doesNotMatch(`${d.dica} ${d.avisoGratis ?? ''}`, /R\$|\bdias?\b|grátis por/i, e);
  }
});
caso('painel: a promessa antiga sumiu e a dica vem da regra do plano, com botão "Conhecer o Pro"', () => {
  const tela = ler('../webapp/src/pages/olli/meu-negocio/index.tsx');
  assert.ok(!tela.includes(PROMESSA_ANTIGA), 'promessa antiga do painel removida');
  assert.match(tela, /useRecursoPlanoPainel\("link_pagamento"\)/);
  assert.match(tela, /dica=\{dicaPix\.dica\}/);
  assert.match(tela, />\s*Conhecer o Pro\s*</);
  assert.match(tela, /min-h-11/, 'botão com alvo de 44 px');
  assert.match(tela, /\/planos\?plano=pro&periodo=mensal&origem=pix-link"/, '"Conhecer o Pro" só leva a Planos, não abre cobrança');
});
caso('app: a promessa antiga sumiu do Meu Negócio, sem preço e sem "Pix" junto do nome do plano', () => {
  const tela = ler('../src/screens/MeuNegocioScreen.tsx');
  assert.ok(!tela.includes(PROMESSA_ANTIGA), 'promessa antiga do app removida');
  const helper = tela.match(/HELPER_CHAVE_PIX_APP =\s*'([^']+)'/)?.[1] ?? '';
  assert.match(helper, /só nos planos Pro e Empresa; no Grátis, ele combina o pagamento com você/);
  assert.doesNotMatch(helper, /R\$/);
  assert.doesNotMatch(helper, /Pix[^.]{0,40}Pro|Pro[^.]{0,40}Pix/, 'regra das lojas: sem Pix colado ao plano');
});
caso('app: a cobrança pelo link só diz "paga por Pix" quando o plano libera o Pix no link', () => {
  const tela = ler('../src/screens/VisualizarOrcamentoScreen.tsx');
  assert.match(tela, /const pixNoLink = comPix && estadoLinkPagamento === 'liberado';/);
  assert.match(tela, /montarMensagemCobrancaLink\(orc, dias, `\$\{url\}#pagar`, \{ comPix: pixNoLink,/);
});
caso('página do cliente (/o/) no Grátis continua sem Pix e sem paywall ("combine a forma de pagamento")', () => {
  const link = ler('../worker/src/link.js');
  assert.match(link, /if \(pagamento !== 'liberado'\) \{\s*return `<div class="pix-box" id="pagar"><div class="pix-t">Pagamento<\/div><div class="pix-sub">Combine a forma de pagamento/);
});

// ─── 2. Botão de pagar no aviso de limite ───────────────────────────────────────
const cota = ler('../webapp/src/olli/cota-envios.ts');
const aviso = ler('../webapp/src/olli/avisoLimiteEnvios.ts');
caso('o aviso tem botão "Liberar no Pro", preço da fonte única e nenhuma palavra "bloqueado"', () => {
  assert.match(cota, /rotuloAcao: "Liberar no Pro"/);
  assert.match(cota, /precoDoPlano\("pro"\)/, 'preço lido do catálogo, nunca digitado');
  assert.doesNotMatch(cota.match(/export function avisoLimiteEnvios[\s\S]{0,900}/)?.[0] ?? '', /bloquead|R\$ ?\d/i);
  assert.equal(reais(PRECO_PRO.mensalCentavos), 'R$ 39', 'preço publicado do Pro (D-preço: R$ 39)');
});
caso('o botão leva ao Pix do Pro que já existe (Planos + pagar=pix), sem cobrança nova', () => {
  assert.match(cota, /URL_PAGAR_PRO_DO_LIMITE = "\/planos\?plano=pro&periodo=mensal&origem=limite&pagar=pix"/);
  const url = new URL('https://x' + '/planos?plano=pro&periodo=mensal&origem=limite&pagar=pix');
  assert.deepEqual(lerIntencaoPlano(url.search), { plano: 'pro', periodo: 'mensal' });
  assert.equal(url.searchParams.get(PARAM_PAGAR), 'pix');
  assert.doesNotMatch(aviso, /abacate|fetch\(|criarCobranca|\/plano\/pix/i, 'o aviso não cria cobrança');
});
caso('o aviso fica 20 s, tem X, alvo de 44 px e grava os 2 eventos', () => {
  assert.match(aviso, /DURACAO_AVISO_LIMITE_MS = 20_000/);
  assert.match(aviso, /closeButton: true/);
  assert.match(aviso, /height: 44,\s*minWidth: 44/);
  assert.match(aviso, /registrarEtapaAtivacao\("limite_aviso_visto"\)/);
  assert.match(aviso, /registrarEtapaAtivacao\("limite_aviso_pagar_clicado"\)/);
});
caso('PDF: o limite não vira mais erro vermelho; PDF e WhatsApp usam o mesmo aviso com botão', () => {
  const orc = ler('../webapp/src/pages/olli/orcamentos/index.tsx');
  assert.doesNotMatch(orc, /throw new Error\(`\$\{aviso\.titulo\}\. \$\{aviso\.mensagem\}`\)/, 'limite não é mais exceção');
  assert.match(orc, /mostrarAvisoLimiteEnvios\(reserva, navigate\)/);
  const wa = ler('../webapp/src/pages/olli/orcamentos/useEnviarWhatsApp.tsx');
  assert.match(wa, /mostrarAvisoLimiteEnvios\(reserva, navigate\)/);
  assert.doesNotMatch(wa, /toast\.info\(aviso\.titulo/, 'o aviso só-texto saiu');
});
caso('pagar=pix só abre o Pix quando é seguro', () => {
  const gratis = { planoEfetivo: 'gratis', origem: 'gratis' };
  assert.equal(podeAbrirPixDaIntencao({ pixLigado: true, membroNaoDono: false, resumo: gratis }), true);
  assert.equal(podeAbrirPixDaIntencao({ pixLigado: true, membroNaoDono: false, resumo: { planoEfetivo: 'pro', origem: 'trial' } }), true, 'no teste pode pagar');
  assert.equal(podeAbrirPixDaIntencao({ pixLigado: false, membroNaoDono: false, resumo: gratis }), false, 'Pix desligado');
  assert.equal(podeAbrirPixDaIntencao({ pixLigado: true, membroNaoDono: true, resumo: gratis }), false, 'membro da equipe');
  assert.equal(podeAbrirPixDaIntencao({ pixLigado: true, membroNaoDono: false, resumo: null }), false, 'assinatura não lida');
  assert.equal(podeAbrirPixDaIntencao({ pixLigado: true, membroNaoDono: false, resumo: { planoEfetivo: 'pro', origem: 'pagamento' } }), false, 'já paga');
  const planos = ler('../webapp/src/pages/olli/planos/index.tsx');
  assert.match(planos, /url\.searchParams\.delete\(PARAM_PAGAR\)/, 'recarregar não reabre a cobrança');
});

// ─── 3. Resumo do teste do Pro ──────────────────────────────────────────────────
const AGORA = new Date('2026-11-19T15:00:00Z');
const base = (p: Partial<EntradaResumoTestePro>): EntradaResumoTestePro => ({
  agora: AGORA,
  trialEstado: 'ended',
  terminaEm: '2026-11-17T15:00:00Z',
  planoEfetivo: 'gratis',
  numeros: { linksEnviados: 0, linksAbertos: 0, linksAprovados: 0 },
  ...p,
});
caso('fim do teste com uso: só os números verdadeiros, sem a frase do "não usou"', () => {
  const r = resumoTestePro(base({ numeros: { linksEnviados: 4, linksAbertos: 3, linksAprovados: 1 } }));
  assert.ok(r);
  assert.equal(r.momento, 'fim');
  assert.equal(r.titulo, 'Seu teste do Pro terminou');
  assert.deepEqual(r.feitos, [
    '4 orçamentos foram pelo link sem o selo da OLLI, só com a sua marca.',
    '3 clientes abriram o link.',
    '1 orçamento foi aprovado pelo cliente no próprio link.',
  ]);
  assert.equal(r.naoUsou, null);
});
caso('número zero não aparece; singular certo', () => {
  assert.deepEqual(linhasDoQueOProFez({ linksEnviados: 1, linksAbertos: 0, linksAprovados: 0 }), [
    '1 orçamento foi pelo link sem o selo da OLLI, só com a sua marca.',
  ]);
});
caso('tudo zero: não inventa, mostra em 1 frase o que ainda não usou', () => {
  const r = resumoTestePro(base({}));
  assert.ok(r);
  assert.deepEqual(r.feitos, []);
  assert.equal(r.naoUsou, FRASE_NAO_USOU_LINK);
  assert.equal(r.naoUsou?.split(/[.!?](\s|$)/).filter((x) => x?.trim()).length, 1, '1 frase');
});
caso('leitura que falhou: nem número nem "não usou" (não sabemos)', () => {
  const r = resumoTestePro(base({ numeros: null }));
  assert.ok(r);
  assert.deepEqual(r.feitos, []);
  assert.equal(r.naoUsou, null);
});
caso('número estranho do banco não vira conta inventada', () => {
  assert.deepEqual(linhasDoQueOProFez({ linksEnviados: Number.NaN, linksAbertos: 5, linksAprovados: 5 }), []);
  assert.deepEqual(linhasDoQueOProFez({ linksEnviados: 2, linksAbertos: 9, linksAprovados: -1 }), [
    '2 orçamentos foram pelo link sem o selo da OLLI, só com a sua marca.',
    '2 clientes abriram o link.',
  ]);
});
caso('véspera: teste ativo acabando em até 3 dias', () => {
  const r = resumoTestePro(base({ trialEstado: 'active', planoEfetivo: 'pro', terminaEm: '2026-11-20T10:00:00Z' }));
  assert.equal(r?.momento, 'vespera');
  assert.equal(r?.titulo, 'Seu teste do Pro acaba amanhã');
  assert.equal(resumoTestePro(base({ trialEstado: 'active', planoEfetivo: 'pro', terminaEm: '2026-11-28T10:00:00Z' })), null, 'longe do fim');
});
caso('P2 LIVRE: dias de CALENDÁRIO em São Paulo (acaba hoje à noite = "hoje", não "amanhã")', () => {
  const v = (agora: string, termina: string) =>
    resumoTestePro(base({ agora: new Date(agora), trialEstado: 'active', planoEfetivo: 'pro', terminaEm: termina }))?.titulo;
  // 19/11 10h em SP (13h UTC); o teste acaba 19/11 23h em SP (02h UTC do dia 20).
  assert.equal(v('2026-11-19T13:00:00Z', '2026-11-20T02:00:00Z'), 'Seu teste do Pro acaba hoje');
  // acaba amanhã de manhã (20/11 08h em SP), visto 19/11 23h em SP → amanhã
  assert.equal(v('2026-11-20T02:00:00Z', '2026-11-20T11:00:00Z'), 'Seu teste do Pro acaba amanhã');
  assert.equal(v('2026-11-19T13:00:00Z', '2026-11-22T13:00:00Z'), 'Seu teste do Pro acaba em 3 dias');
  // 21h em SP do dia 19 ainda é dia 19 (00h UTC do dia 20 já cruzou em UTC, não em SP)
  assert.equal(v('2026-11-20T00:30:00Z', '2026-11-20T15:00:00Z'), 'Seu teste do Pro acaba amanhã');
});
caso('P2 LIVRE: nenhum texto do limite/resumo promete Pix do plano sem conferir se está ligado', () => {
  assert.doesNotMatch(ler('../webapp/src/olli/cota-envios.ts').split('export function avisoLimiteEnvios')[1].split('export ')[0], /por Pix|com Pix/);
  assert.doesNotMatch(ler('../webapp/src/pages/olli/planos/ResumoTesteProCard.tsx'), /pagar com Pix/);
});
caso('não mostra para quem já paga, converteu, foi revogado ou acabou há mais de 14 dias', () => {
  assert.equal(resumoTestePro(base({ planoEfetivo: 'pro' })), null);
  assert.equal(resumoTestePro(base({ planoEfetivo: 'empresa' })), null);
  assert.equal(resumoTestePro(base({ trialEstado: 'converted' })), null);
  assert.equal(resumoTestePro(base({ trialEstado: 'revoked' })), null);
  assert.equal(resumoTestePro(base({ terminaEm: '2026-11-01T15:00:00Z' })), null);
  assert.equal(resumoTestePro(base({ terminaEm: null })), null);
});
caso('o cartão lê só dados reais da própria conta (RLS) dentro da janela do teste', () => {
  const card = ler('../webapp/src/pages/olli/planos/ResumoTesteProCard.tsx');
  assert.match(card, /from\("trials_comerciais"\)/);
  assert.match(card, /from\("orcamentos_publicos"\)[\s\S]{0,200}\.gte\("criado_em", inicio\)[\s\S]{0,40}\.lt\("criado_em", fim\)/);
  assert.match(card, /ehMembroNaoDono/, 'membro da equipe não vê convite de compra');
  assert.match(card, /min-h-11/, 'botões com alvo de 44 px');
  assert.match(card, /pagar=pix/, 'botão vai ao Pix do Pro');
  assert.match(ler('../webapp/src/pages/olli/inicio/index.tsx'), /<ResumoTesteProCard resumo=\{resumoTeste\} \/>/);
});

// ─── 4. Medir ───────────────────────────────────────────────────────────────────
caso('migration nova: CHECK e função aceitam os 2 eventos; arquivo só escrito', () => {
  const sql = ler('../supabase/migrations/20261119200000_atividade_limite_aviso.sql');
  const check = sql.slice(sql.search(/add constraint user_activity_log_evento_check/i));
  assert.match(check.slice(0, check.indexOf(';')), /'limite_aviso_visto', 'limite_aviso_pagar_clicado'/);
  const fn = sql.slice(sql.indexOf('not in ('));
  assert.match(fn.slice(0, fn.indexOf(')')), /'limite_aviso_visto', 'limite_aviso_pagar_clicado'/);
  assert.match(sql, /NÃO APLICADA/);
  const store = ler('../webapp/src/store/userStore.ts');
  assert.match(store, /\| "limite_aviso_visto"\s*\| "limite_aviso_pagar_clicado";/);
});

console.log(`teste-dinheiro-lote1: OK (${casos} casos)`);
