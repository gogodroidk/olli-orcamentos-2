/**
 * Teste do radar de follow-up do app (src/services/radarFollowUpRegra.ts) e da
 * fiação do "Início com dados certos" + "sincronização honesta".
 *
 *     node scripts/teste-radar-followup.ts
 * Exit 0 = passou; qualquer assert que falha derruba o processo.
 *
 * Protege:
 *  • quem já pagou (recibo ativo, não estornado) NÃO entra no follow-up;
 *  • prioridade = valor × recência (não "parado há mais tempo primeiro");
 *  • proposta vencida (validade, ou 30 dias da emissão sem validade) vira "renovar"
 *    com mensagem que diz que venceu — nunca "vale até" uma data passada;
 *  • o KPI e o selo do Início contam a MESMA lista do palco (fim da 2ª regra);
 *  • o pull que falha não vira "tabela vazia" e o carimbo só sai com tudo ok.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DIAS_EXPIRACAO_SEM_VALIDADE,
  montarMensagemPropostaVencida,
  orcamentosComPagamento,
  pesoRecencia,
  prioridadeFollowUp,
  propostaExpirada,
  selecionarFollowUp,
  validaAteYmd,
} from '../src/services/radarFollowUpRegra.ts';
import type { Cliente, Orcamento, Recibo } from '../src/types/index.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

// Meio-dia local: comparações por dia não dependem do fuso de quem roda o teste.
const AGORA = new Date(2026, 8, 30, 12, 0, 0);
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();
const LIMIAR = 3;

function orc(id: string, extra: Partial<Orcamento>): Orcamento {
  return {
    id,
    numero: `00${id}`,
    clienteId: `c-${id}`,
    clienteNome: `Cliente ${id}`,
    clienteTelefone: '11999998888',
    status: 'enviado',
    valorTotal: 100,
    dataEmissao: '2026-09-20',
    criadoEm: diasAtras(10),
    atualizadoEm: diasAtras(10),
    ...extra,
  } as Orcamento;
}
const recibo = (orcamentoId: string, extra: Partial<Recibo> = {}) =>
  ({ orcamentoId, ...extra }) as Pick<Recibo, 'orcamentoId' | 'estornadoEm' | 'excluidoEm'>;
const clientes: Cliente[] = [];

// ─── 1. Quem já pagou não entra ──────────────────────────────────────────────
// Caso real: Roberto, orçamento 00726 "enviado", recibo REC-00826 de R$ 440 por Pix.
const roberto = orc('726', { clienteNome: 'Roberto Nogueira', valorTotal: 440, atualizadoEm: diasAtras(90), criadoEm: diasAtras(90) });
const outro = orc('727', { valorTotal: 300 });
let lista = selecionarFollowUp([roberto, outro], [recibo('726')], clientes, LIMIAR, AGORA);
assert.deepEqual(lista.map((i) => i.orcamento.id), ['727'], 'recibo emitido tira o orçamento do follow-up');
lista = selecionarFollowUp([roberto], [recibo('726', { estornadoEm: diasAtras(1) })], clientes, LIMIAR, AGORA);
assert.equal(lista.length, 1, 'recibo ESTORNADO não conta como pago');
lista = selecionarFollowUp([roberto], [recibo('726', { excluidoEm: diasAtras(1) })], clientes, LIMIAR, AGORA);
assert.equal(lista.length, 1, 'recibo na lixeira não conta como pago');
assert.deepEqual([...orcamentosComPagamento([recibo(''), recibo('a'), recibo('b', { estornadoEm: 'x' })])], ['a']);

// ─── 2. Só proposta enviada, parada há >= 3 dias, com data legível ───────────
lista = selecionarFollowUp(
  [
    orc('r', { status: 'rascunho' }),
    orc('a', { status: 'aprovado' }),
    orc('n', { status: 'em_negociacao' }),
    orc('v', { status: 'visualizado', atualizadoEm: diasAtras(2) }),
    orc('x', { atualizadoEm: 'lixo', criadoEm: 'lixo' }),
  ],
  [],
  clientes,
  LIMIAR,
  AGORA,
);
assert.deepEqual(lista.map((i) => i.orcamento.id), ['n'], 'rascunho, aprovado, recente e data ilegível ficam de fora');
assert.equal(lista[0].diasParado, 10);

// ─── 3. Prioridade = valor × recência ────────────────────────────────────────
assert.equal(pesoRecencia(3, LIMIAR), 1, 'no limiar, peso cheio');
assert.equal(pesoRecencia(17, LIMIAR), 0.5, '14 dias além do limiar: metade');
assert.equal(pesoRecencia(31, LIMIAR), 0.25);
assert.equal(prioridadeFollowUp(Number.NaN, 5, LIMIAR), 0, 'valor ilegível conta 0 (vai para o fim, não some)');
lista = selecionarFollowUp(
  [
    orc('velho-caro', { valorTotal: 2000, atualizadoEm: diasAtras(90) }), // 2000 × 0,5^(87/14) ≈ 27
    orc('novo-medio', { valorTotal: 800, atualizadoEm: diasAtras(4) }), // ≈ 762
    orc('novo-barato', { valorTotal: 150, atualizadoEm: diasAtras(3) }), // 150
    orc('sem-valor', { valorTotal: 0, atualizadoEm: diasAtras(5) }),
  ],
  [],
  clientes,
  LIMIAR,
  AGORA,
);
assert.deepEqual(
  lista.map((i) => i.orcamento.id),
  ['novo-medio', 'novo-barato', 'velho-caro', 'sem-valor'],
  'R$ 800 parado há 4 dias vem antes de R$ 2.000 parado há 90',
);
assert.ok(lista[0].prioridade > lista[1].prioridade);

// ─── 4. Expirada: validade ou 30 dias da emissão ─────────────────────────────
assert.equal(validaAteYmd({ validadeOrcamento: '10/07/2026', dataEmissao: '2026-07-01', criadoEm: '' }), '2026-07-10');
assert.equal(validaAteYmd({ validadeOrcamento: '2026-07-10', dataEmissao: '', criadoEm: '' }), '2026-07-10', 'ISO legado também vale');
assert.equal(
  validaAteYmd({ validadeOrcamento: undefined, dataEmissao: '2026-09-01', criadoEm: '' }),
  '2026-10-01',
  `sem validade: emissão + ${DIAS_EXPIRACAO_SEM_VALIDADE} dias`,
);
assert.equal(validaAteYmd({ validadeOrcamento: '31/02/2026', dataEmissao: '2026-09-01', criadoEm: '' }), '2026-10-01', 'validade impossível cai na regra dos 30 dias');
assert.equal(validaAteYmd({ validadeOrcamento: '', dataEmissao: 'lixo', criadoEm: 'lixo' }), null, 'sem data legível: não inventa vencimento');
assert.equal(propostaExpirada('2026-09-30', AGORA), false, 'no último dia ainda vale');
assert.equal(propostaExpirada('2026-09-29', AGORA), true);
assert.equal(propostaExpirada(null, AGORA), false);

lista = selecionarFollowUp(
  [orc('venc', { validadeOrcamento: '10/07/2026' }), orc('ok', { validadeOrcamento: '31/10/2026' })],
  [],
  clientes,
  LIMIAR,
  AGORA,
);
const vencida = lista.find((i) => i.orcamento.id === 'venc');
assert.ok(vencida, 'a vencida continua no radar');
assert.ok(vencida.expirada, 'passou da validade: ação "renovar"');
assert.equal(vencida.validaAte, '2026-07-10');
assert.equal(lista.find((i) => i.orcamento.id === 'ok')?.expirada, false);
const msg = montarMensagemPropostaVencida(vencida, 'R$ 100,00', '(11) 3333-4444');
assert.match(msg, /^Olá, Cliente! O orçamento nº 00venc \(R\$ 100,00\) venceu em 10\/07\/2026\./);
assert.match(msg, /atualizo e te mando de novo/);
assert.doesNotMatch(msg, /vale até/, 'vencida nunca diz "vale até"');
assert.match(msg, /Contato: \(11\) 3333-4444/);
assert.doesNotMatch(montarMensagemPropostaVencida({ ...vencida, validaAte: null }, 'R$ 1,00'), /Contato/);

// ─── 5. Fiação: uma régua só no Início ───────────────────────────────────────
const home = ler('../src/screens/HomeScreen.tsx');
assert.doesNotMatch(home, /getOrcamentosParadosAgregado/, 'Início não tem mais a 2ª regra de "parado" (5 dias da criação)');
assert.doesNotMatch(home, /paradosResumo/, 'KPI e selo não leem mais o agregado antigo');
assert.match(home, /const pedemFollowUp = !veDinheiro \|\| followUpCarregando \|\| followUpErro \? null : followUp\.length/, 'KPI e selo = lista do palco, com 3 estados (e só para quem vê os valores)');
assert.match(home, /useVerticais\(\)/, 'Início respeita o ofício');
assert.match(home, /\{mostraHvac && \(\s*<AnimatedEntrance index=\{2\}>/, 'anzol de ar-condicionado só para HVAC');
assert.match(home, /\{mostraHvac && \(\s*<ShortcutTile\s+icon="card-search-outline"/, 'atalho do diagnóstico só para HVAC');
assert.match(home, /paddingBottom: insets\.bottom \+ 16/, 'folha da OLLI não fica sob a barra do sistema');
assert.match(home, /\{telefoneProxima \? \(/, '"Estou a caminho" aparece com telefone, mesmo sem ETA');
assert.match(home, /mensagemEstouACaminho\(proxima\.clienteNome, temEta \? etaResultado : null\)/, 'sem ETA, mensagem sem horário');
assert.match(home, /abrirRotaGoogleMaps\(/, '"Traçar rota" abre a navegação, não uma busca');
assert.doesNotMatch(home, /maps\/search/, 'nada de link de busca no Início');
assert.match(home, /useSyncInicial\(\)/, 'Início espera o 1º download antes de afirmar "nenhum"');
assert.match(home, /download === 'pronto' && !papelCarregando && !ativacaoDoDono/, 'StarterCard: só sem o convite do dono e depois do download');
assert.doesNotMatch(home, /actionLabel="Criar o primeiro"/, 'só um convite de "primeiro orçamento" na tela');

// ─── 6. Fiação: sincronização honesta ────────────────────────────────────────
const sync = ler('../src/services/cloudSync.ts');
assert.match(sync, /Promise<\{ tabela: SyncTable; ok: boolean \}>/, 'pullTable devolve {tabela, ok}');
assert.doesNotMatch(sync, /tabela indisponível = ignora/, 'erro de leitura não é mais engolido');
assert.match(sync, /if \(resultado\.falhas\.length > 0\) return;\s+try \{\s+const usuario = await getCurrentUser\(\);[\s\S]{0,120}PULL_INICIAL_OK_PREFIX \+ usuario\.id/, 'carimbo só com todas as tabelas ok');
assert.match(
  sync,
  /const pull = await pullAll\(geracao\);[\s\S]{0,400}definirEstadoPull\(pull\.falhas\.length === 0 \? 'ok' : 'falhou'\);[\s\S]{0,400}notificarSyncAplicado\(\);\s+await pushLocalTombstones/,
  'telas releem logo depois do pull, antes do push',
);
assert.match(ler('../src/database/database.ts'), /await esquecerDownloadInicial\(\);/, 'apagar dados também apaga o carimbo');
assert.match(ler('../src/services/storageKeys.ts'), /ULTIMO_PULL_KEY,\s*\];/, 'diagnóstico do último pull some no logout');
assert.match(
  sync,
  /if \(carimboConfirmadoPara !== null && carimboConfirmadoPara !== usuario\.id\) \{\s+carimboConfirmadoPara = null;\s+avisarEstadoPull\(\);/,
  'carimbo em memória de outra conta não vale para quem acabou de entrar',
);
assert.match(sync, /export function downloadInicialJaConfirmado\(\): boolean \{[\s\S]{0,160}if \(!supabase\) return true;/, 'build sem nuvem não fica preso em "baixando"');
const hook = ler('../src/hooks/useSyncInicial.ts');
assert.match(hook, /export type EstadoSyncInicial = 'baixando' \| 'falhou' \| 'pronto';/);
assert.doesNotMatch(hook, /const avaliar = useCallback\(async \(\) => \{\s+if \(downloadInicialJaConfirmado\(\)\)/, 'reavaliação confere o carimbo do usuário da sessão');

console.log('OK — radar de follow-up (pago fora, valor × recência, vencida) e sincronização honesta validados.');
