/**
 * Onda 2, item 2.10 — detalhe do orçamento premium.
 *
 *     node scripts/teste-detalhe-orcamento.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que é puro roda de verdade: a linha do tempo, a frase do cabeçalho e a regra
 * da celebração (`src/components/orcamento/linhaDoTempo.ts`). Tela e componentes
 * são React Native e não rodam em Node, então o teste lê o FONTE (sem
 * comentários) e trava as regras: erro do link nunca vira "o cliente não abriu",
 * uma ação principal por card, compartilhar e ⋯ em folha, confete curto e uma
 * vez, só transform/opacity e "Reduzir movimento" respeitado.
 */
import { readFileSync } from 'node:fs';
import {
  MAX_CELEBRACOES_GUARDADAS,
  celebracaoDaTransicao,
  chaveCelebracao,
  lerCelebracoes,
  montarLinhaDoTempo,
  proximoPassoDoStatus,
  registrarCelebracao,
  type EntradaLinhaDoTempo,
  type EtapaLinhaDoTempo,
} from '../src/components/orcamento/linhaDoTempo.ts';

let falhas = 0;
let passes = 0;
function checar(nome: string, obtido: unknown, esperado: unknown) {
  if (Object.is(obtido, esperado)) {
    passes++;
    console.log(`  ok  ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHOU  ${nome}\n          esperado: ${JSON.stringify(esperado)}\n          obtido:   ${JSON.stringify(obtido)}`);
  }
}
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const semComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

const base: EntradaLinhaDoTempo = {
  status: 'rascunho',
  criadoEm: '2026-09-30T12:00:00.000Z',
  trilha: [],
  leituraLink: 'ok',
  financeiro: { estado: null },
};
const linha = (parcial: Partial<EntradaLinhaDoTempo>) => montarLinhaDoTempo({ ...base, ...parcial });
const etapa = (etapas: EtapaLinhaDoTempo[], chave: EtapaLinhaDoTempo['chave']) => etapas.find(e => e.chave === chave);
const estados = (etapas: EtapaLinhaDoTempo[]) => etapas.map(e => `${e.chave}:${e.estado}`).join(' ');

// ─── 1. Linha do tempo ───────────────────────────────────────────────────────
console.log('\n1) Linha do tempo: cada etapa vem de uma fonte');
{
  const r = linha({});
  checar('rascunho: criado feito, envio é o próximo passo', estados(r),
    'criado:feito enviado:atual visualizado:pendente decisao:pendente pago:pendente');
  checar('criado carrega a data de criação', etapa(r, 'criado')?.em, base.criadoEm);
  checar('rascunho diz que ainda não foi enviado', etapa(r, 'enviado')?.detalhe, 'Ainda não enviado');
}
{
  const r = linha({ status: 'enviado' });
  checar('enviado sem link: visualizar é o próximo', estados(r),
    'criado:feito enviado:feito visualizado:atual decisao:pendente pago:pendente');
  checar('sem link, a cópia é honesta sobre o que dá para saber',
    etapa(r, 'visualizado')?.detalhe, 'Só dá para saber se o cliente abriu quando a proposta vai pelo link');
}
{
  const r = linha({ status: 'enviado', trilha: [{ tipo: 'enviado' }] });
  checar('com link e sem abertura: aguardando abrir', etapa(r, 'visualizado')?.detalhe, 'Aguardando o cliente abrir o link');
  checar('o envio pelo link é dito', etapa(r, 'enviado')?.detalhe, 'Com o link de aprovação');
}
{
  const r = linha({ status: 'visualizado', trilha: [{ tipo: 'enviado' }, { tipo: 'visualizado', em: '2026-09-30T15:00:00Z' }] });
  checar('visualizado pelo link tem horário', etapa(r, 'visualizado')?.em, '2026-09-30T15:00:00Z');
  checar('e a aprovação vira o próximo passo', etapa(r, 'decisao')?.estado, 'atual');
}
{
  const r = linha({
    status: 'aprovado',
    decididoEm: '2026-10-01T09:00:00Z',
    trilha: [{ tipo: 'enviado' }, { tipo: 'visualizado' }, { tipo: 'aprovado', em: '2026-10-01T08:59:00Z' }],
    financeiro: { estado: 'aguardando_pagamento' },
  });
  checar('aprovado pelo link: horário da resposta (não o do save)', etapa(r, 'decisao')?.em, '2026-10-01T08:59:00Z');
  checar('aprovado pelo link diz de onde veio', etapa(r, 'decisao')?.detalhe, 'Pelo link do cliente');
  checar('aprovado e aguardando: pagamento é o próximo passo', etapa(r, 'pago')?.estado, 'atual');
}
{
  const r = linha({ status: 'aprovado', decididoEm: '2026-10-01T09:00:00Z' });
  checar('aprovado à mão usa decididoEm', etapa(r, 'decisao')?.em, '2026-10-01T09:00:00Z');
  checar('aprovado sem abrir o link: visualização SEM REGISTRO (nem feito, nem "não abriu")',
    etapa(r, 'visualizado')?.estado, 'sem_registro');
}
{
  const r = linha({ status: 'aprovado', financeiro: { estado: 'recibo_emitido', pagoEm: '01/10/2026' } });
  checar('quitado: pago feito com a data do recebimento', `${etapa(r, 'pago')?.estado}|${etapa(r, 'pago')?.em}`, 'feito|01/10/2026');
  checar('tudo concluído: ninguém é "atual"', r.some(e => e.estado === 'atual'), false);
}
{
  const r = linha({ status: 'aprovado', financeiro: { estado: 'parcial', resumoParcial: 'Recebido R$ 100,00 de R$ 300,00' } });
  checar('parcial: atual com o resumo', `${etapa(r, 'pago')?.estado}|${etapa(r, 'pago')?.detalhe}`, 'atual|Recebido R$ 100,00 de R$ 300,00');
}
{
  const r = linha({ status: 'aprovado', financeiro: { estado: 'aguardando_pagamento' }, trilha: [{ tipo: 'enviado' }, { tipo: 'pagamento_informado', em: 'x' }] });
  const pago = etapa(r, 'pago');
  checar('"já paguei" do cliente NÃO vira pago (é aviso para conferir)', pago?.estado === 'feito', false);
  checar('e o aviso manda conferir no banco', /Confira no banco/.test(pago?.detalhe ?? ''), true);
}
{
  const r = linha({ status: 'recusado', trilha: [{ tipo: 'enviado' }, { tipo: 'visualizado' }, { tipo: 'recusado', em: 'r', motivo: '  Achei caro  ' }] });
  checar('recusado interrompe com o motivo', `${etapa(r, 'decisao')?.estado}|${etapa(r, 'decisao')?.detalhe}`, 'interrompido|Motivo: Achei caro');
  checar('recusado não mostra etapa de pagamento', etapa(r, 'pago'), undefined);
  checar('recusado não tem "próximo passo" na linha', r.some(e => e.estado === 'atual'), false);
}
{
  const r = linha({ status: 'cancelado' });
  checar('cancelado sem link: envio sem registro (pode ter ido por PDF)', etapa(r, 'enviado')?.estado, 'sem_registro');
  checar('cancelado interrompe', etapa(r, 'decisao')?.rotulo, 'Cancelado');
}
{
  const r = linha({ status: 'aprovado', financeiro: null });
  checar('quem não vê valores não vê a etapa de pagamento', etapa(r, 'pago'), undefined);
}

console.log('\n2) Erro do link NUNCA vira "o cliente não abriu" (3 estados)');
{
  const erro = linha({ status: 'enviado', leituraLink: 'erro' });
  checar('erro: diz que não deu para consultar', etapa(erro, 'visualizado')?.detalhe, 'Não deu para consultar o link agora');
  checar('erro: tom de aviso', etapa(erro, 'visualizado')?.tom, 'aviso');
  const carregando = linha({ status: 'enviado', leituraLink: 'carregando' });
  checar('carregando: diz que está consultando', etapa(carregando, 'visualizado')?.detalhe, 'Consultando o link do cliente…');
  const ok = linha({ status: 'enviado', leituraLink: 'ok' });
  checar('os três estados dão três textos diferentes',
    new Set([etapa(erro, 'visualizado')?.detalhe, etapa(carregando, 'visualizado')?.detalhe, etapa(ok, 'visualizado')?.detalhe]).size, 3);
  const erroComVisto = linha({ status: 'visualizado', leituraLink: 'erro' });
  checar('status local "Visualizado" continua feito mesmo com o link fora', etapa(erroComVisto, 'visualizado')?.estado, 'feito');
}

console.log('\n3) Frase do cabeçalho');
checar('rascunho', proximoPassoDoStatus('rascunho', null), 'Rascunho. Próximo passo: enviar ao cliente.');
checar('aprovado aguardando', proximoPassoDoStatus('aprovado', 'aguardando_pagamento'), 'Aprovado. Próximo passo: receber.');
checar('aprovado pago', proximoPassoDoStatus('aprovado', 'recibo_emitido'), 'Pago. Hora de pedir uma avaliação.');
checar('aprovado sem ver valores', proximoPassoDoStatus('aprovado', null), 'Aprovado. Próximo passo: agendar o serviço.');
checar('recusado sugere revisão', proximoPassoDoStatus('recusado', null), 'O cliente recusou. Dá para criar uma revisão.');

console.log('\n4) Celebração: só na transição, e uma vez');
checar('primeira leitura nunca celebra', celebracaoDaTransicao(null, { status: 'aprovado', quitado: true }), null);
checar('enviado → aprovado celebra aprovado', celebracaoDaTransicao({ status: 'enviado', quitado: false }, { status: 'aprovado', quitado: false }), 'aprovado');
checar('aprovado → convertido não celebra de novo', celebracaoDaTransicao({ status: 'aprovado', quitado: false }, { status: 'convertido', quitado: false }), null);
checar('quitou celebra pago', celebracaoDaTransicao({ status: 'aprovado', quitado: false }, { status: 'aprovado', quitado: true }), 'pago');
checar('mesmo retrato não celebra', celebracaoDaTransicao({ status: 'aprovado', quitado: true }, { status: 'aprovado', quitado: true }), null);
checar('chave por orçamento e motivo', chaveCelebracao('abc', 'pago'), 'abc:pago');
checar('lista persistida estranha vira vazia', lerCelebracoes({ a: 1 }).length, 0);
checar('lista filtra o que não é texto', lerCelebracoes(['a', 2, 'b']).join(','), 'a,b');
checar('registrar não duplica', registrarCelebracao(['a', 'b'], 'a').join(','), 'b,a');
const cheia = Array.from({ length: MAX_CELEBRACOES_GUARDADAS }, (_, i) => `o${i}:aprovado`);
const depois = registrarCelebracao(cheia, 'novo:pago');
checar('teto: tamanho não cresce', depois.length, MAX_CELEBRACOES_GUARDADAS);
checar('teto: a mais antiga sai', depois.includes('o0:aprovado'), false);

// ─── Fonte ───────────────────────────────────────────────────────────────────
console.log('\n5) Tela do detalhe');
const tela = semComentarios(ler('../src/screens/VisualizarOrcamentoScreen.tsx'));
checar('sem Alert nativo no detalhe (toast e folha)', /Alert\.alert\(/.test(tela), false);
checar('aprovação vira a folha "Próximos passos"', /visivel=\{folha === 'proximos'\}/.test(tela), true);
checar('a antiga pergunta "Criar OS?" saiu', /rotuloConfirmar: 'Criar OS'/.test(tela), false);
checar('o pad de assinatura não abre sozinho ao aprovar', /function oferecerProximosPassos\(\) \{[^}]*setAssinaturaAberta\(true\)/.test(tela), false);
checar('próximos passos não atropela outra folha aberta', tela.includes("setFolha(atual => (atual === null ? 'proximos' : atual))"), true);
checar('aprovação pelo link (tela aberta) também leva aos próximos passos', /motivo === 'aprovado' \? \(\) => abrirProximosRef\.current\(\)/.test(tela), true);
checar('Realtime do link: escuta no foco e para ao sair', /const pararDeEscutar = escutarMudancasDoLink\(orcamentoId, reler\)/.test(tela) && /return pararDeEscutar;/.test(tela), true);
checar('Realtime em rajada vira uma releitura por vez', /if \(relendo\) \{\s*deNovo = true;/.test(tela), true);
checar('cabeçalho que encolhe: faixa compacta ligada à rolagem', tela.includes('<BarraStatusCompacta') && tela.includes('onScroll={aoRolar}'), true);
checar('linha do tempo montada pela regra pura', tela.includes('montarLinhaDoTempo({'), true);
checar('e desenhada pelo componente', tela.includes('<TimelineOrcamento'), true);
checar('erro do link vira estado próprio ("erro"), não lista vazia', /\.catch\(\(\) => setLeituraLink\('erro'\)\)/.test(tela), true);
checar('cabeçalho com status animado', tela.includes('<CabecalhoStatus'), true);
checar('compartilhar em folha', /visivel=\{folha === 'compartilhar'\}/.test(tela), true);
checar('ações secundárias no ⋯', /visivel=\{folha === 'mais'\}/.test(tela), true);
checar('status trocado em folha', /visivel=\{folha === 'status'\}/.test(tela), true);
checar('a barra de 9 botões no topo saiu', /<ActionBtn\b/.test(tela), false);
checar('assinar vira secundário quando há card de ação (1 ação principal)',
  tela.includes('style={cardAcao ? styles.closeSecundario : styles.closePrimary}'), true);
checar('celebração por motivo (aprovado/pago), não só aprovado', tela.includes("tipo={celebracao ?? 'aprovado'}"), true);
checar('celebração guardada: uma vez por orçamento', tela.includes('jaCelebrou(orcamentoId, motivo)') && tela.includes('marcarCelebrado(orcamentoId, motivo)'), true);
checar('puxar para atualizar', tela.includes('<RefreshControl'), true);
checar('recarregar com dados na tela não troca pelo spinner', tela.includes('const silencioso = temDadosRef.current;'), true);
checar('carregando com esqueleto, não spinner solto', tela.includes('<Skeleton'), true);

console.log('\n6) Trilha do link: falha de leitura rejeita (não devolve [])');
const link = semComentarios(ler('../src/services/clienteLink.ts'));
const trilhaFn = link.slice(link.indexOf('export async function trilhaDoLink('), link.indexOf('export async function trilhaDoLink(') + 1400);
checar('trilhaDoLink lança quando a leitura falhou', /FALHA_LEITURA_LINK\) throw new Error/.test(trilhaFn), true);
checar('trilhaDoLink não engole erro em []', /catch \{\s*return \[\];/.test(trilhaFn), false);
checar('statusDoLink segue sem lançar (cobrança não muda)', /async function lerLinkRow\([\s\S]{0,200}FALHA_LEITURA_LINK \? null : r/.test(link), true);
const escuta = link.slice(link.indexOf('export function escutarMudancasDoLink('), link.indexOf('export function escutarMudancasDoLink(') + 1200);
checar('escuta do link: filtra pelo orçamento', escuta.includes('filter: `orcamento_id=eq.${orcamentoId}`'), true);
checar('escuta do link: sem nuvem não quebra (devolve um "parar" vazio)', /if \(!cliente \|\| !orcamentoId\) return \(\) => \{\};/.test(escuta), true);
checar('escuta do link: payload do evento não vira dado (a tela relê com RLS)', /\(\) => aoMudar\(\)/.test(escuta), true);
const migracao = ler('../supabase/migrations/20261001150000_realtime_orcamentos_publicos.sql');
checar('migration põe orcamentos_publicos na publicação do Realtime', /alter publication supabase_realtime add table public\.orcamentos_publicos/.test(migracao), true);
checar('migration idempotente', /if not exists \(\s*select 1 from pg_publication_tables/.test(migracao), true);

console.log('\n7) Movimento: Reanimated, só transform/opacity, Reduzir movimento');
const arquivos = {
  Celebracao: ler('../src/components/Celebracao.tsx'),
  TimelineOrcamento: ler('../src/components/orcamento/TimelineOrcamento.tsx'),
  CabecalhoStatus: ler('../src/components/orcamento/CabecalhoStatus.tsx'),
  FolhaAcoes: ler('../src/components/orcamento/FolhaAcoes.tsx'),
};
for (const [nome, bruto] of Object.entries(arquivos)) {
  const src = semComentarios(bruto);
  checar(`${nome}: usa Reanimated`, /from 'react-native-reanimated'/.test(src), true);
  checar(`${nome}: não usa o Animated antigo do RN`, /import \{[^}]*\bAnimated\b[^}]*\} from 'react-native'/.test(src), false);
  checar(`${nome}: respeita Reduzir movimento`, /useReduzirMovimento\(\)/.test(src), true);
  checar(`${nome}: sem loop infinito`, /withRepeat\(/.test(src), false);
  // Estilos animados só mexem em transform/opacity.
  // Cada bloco vai de `useAnimatedStyle(` até o fim da chamada (`}));` ou `});`).
  const animados = src.split('useAnimatedStyle(').slice(1).map(resto => {
    const fim = [resto.indexOf('}));'), resto.indexOf('});')].filter(i => i >= 0);
    return resto.slice(0, fim.length ? Math.min(...fim) : resto.length);
  });
  checar(`${nome}: tem estilo animado para conferir`, animados.length > 0, true);
  const proibido = animados.some(b => /\b(width|height|top|left|right|bottom|margin\w*|padding\w*|backgroundColor)\s*:/.test(b));
  checar(`${nome}: estilo animado só com transform/opacity`, proibido, false);
  checar(`${nome}: durações vêm dos tokens (sem número solto em withTiming)`, /withTiming\([^,]+,\s*\{\s*duration:\s*\d/.test(src), false);
}
checar('Celebracao: confete curto, uma rajada (Motion.dur.celebrate)', /duration: Motion\.dur\.celebrate/.test(arquivos.Celebracao), true);
checar('Celebracao: tem o motivo "pago"', /pago: 'Pagamento recebido!'/.test(arquivos.Celebracao), true);
checar('FolhaAcoes: roda a ação só depois de fechar (Modal sobre Modal no iOS)', /if \(acao\) setTimeout\(acao,/.test(arquivos.FolhaAcoes), true);

console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
