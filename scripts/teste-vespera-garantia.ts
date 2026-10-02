/**
 * Onda I3 — confirmação de véspera com 1 toque + garantia que se cuida sozinha.
 *
 *     node scripts/teste-vespera-garantia.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * COMPORTAMENTO (regras puras):
 *  - chave da visita: série recorrente usa a BASE + dia original; selo só vale para
 *    o horário ATUAL (remarcou → resposta antiga some); linha torta/revogada nunca
 *    vira "confirmada";
 *  - fila de amanhã: só visitas ativas do dia (Brasília), situação por visita,
 *    resumo e frase honestos; sem telefone é contado, não some;
 *  - mensagem do WhatsApp com e SEM link (nunca promete link que não existe);
 *  - vaga aberta: candidatos do radar a até 10 km; origem sem coordenada =
 *    "cadastre o CEP" (nunca "ninguém perto");
 *  - aviso das 18h: horário, silêncio sem nada a pedir;
 *  - garantia: OS > orçamento, só OS concluída, prazo ilegível não afirma fim,
 *    check-in D+15 dedetização / D+30 demais, "vence" nos últimos 7 dias, Feito
 *    tira o item, avisos futuros com teto.
 * FIAÇÃO (fonte):
 *  - recurso `vespera_garantia` no Pro e no tenant; telas com TelaRecursoPlano;
 *  - Hoje e Agenda com o selo; Hoje com os dois nós; rotas + deep link + toque da
 *    notificação; cloudSync reagenda DEPOIS do cancelAll e leva a garantia à nuvem
 *    com a escada da coluna ausente; SQLite v11;
 *  - WhatsApp só por link oficial (abrirWhatsApp → wa.me / api.whatsapp.com);
 *  - worker: /v/ antes do gate da IA, com LINK_RL; migrations com timestamp único.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  avisoVesperaJaSaiu,
  candidatosParaVaga,
  chaveConfirmacao,
  confirmacaoDaVisita,
  conteudoAvisoVespera,
  diaDaVisita,
  diaLocalDoAparelho,
  fraseResumoFila,
  horarioAvisoVespera,
  idBaseDaVisita,
  linhaParaConfirmacao,
  linkConfirmacao,
  mapaDeConfirmacoes,
  mensagemConfirmacao,
  mensagemOfertaVaga,
  montarFilaVespera,
  resumoFila,
  seloDaConfirmacao,
  type ConfirmacaoVisita,
} from '../src/utils/confirmacaoVisita.ts';
import {
  avisosFuturosDeGarantia,
  diasDoCheckin,
  garantiaAteDaOS,
  garantiaDaOS,
  garantiasParaCuidar,
  mensagemCuidadoGarantia,
  rotuloItemGarantia,
  textoGarantiaDaOS,
} from '../src/utils/garantiaServico.ts';
import type { Cliente, OrdemServico } from '../src/types/index.ts';

let verificacoes = 0;
function ok(nome: string, fn: () => void): void {
  fn();
  verificacoes++;
  console.log(`  ok   ${nome}`);
}

// ─── fixtures ────────────────────────────────────────────────────────────────
const AGORA = new Date('2026-10-01T20:00:00Z'); // qui 17h em Brasília
const AMANHA = '2026-10-02';
const visita = (id: string, inicio: string, extra: Record<string, unknown> = {}) => ({
  id, inicio, status: 'agendado' as const, clienteId: 'c-ana', clienteNome: 'Ana Lima', titulo: 'Limpeza do split', ...extra,
});
const cliente = (id: string, nome: string, extra: Partial<Cliente> = {}): Cliente => ({
  id, nome, telefone: '(11) 98765-4321', criadoEm: '2026-01-01T00:00:00Z', ...extra,
});
const conf = (agendamentoId: string, dia: string, inicio: string, status: ConfirmacaoVisita['status']): ConfirmacaoVisita =>
  ({ agendamentoId, dia, inicio, status });

console.log('\n1) chave e selo da confirmação');
ok('ocorrência de série usa a BASE e o dia ORIGINAL', () => {
  const o = visita('ag-1@2026-10-02', '2026-10-02T17:00:00Z', { ocorrenciaDe: 'ag-1', dataOcorrencia: '2026-10-02' });
  assert.equal(idBaseDaVisita(o), 'ag-1');
  assert.equal(diaDaVisita(o), '2026-10-02');
  assert.equal(idBaseDaVisita({ id: 'ag-2@2026-10-09' }), 'ag-2');
  // ocorrência MOVIDA para outro dia continua com a chave do dia original
  const movida = visita('ag-1@2026-10-02', '2026-10-03T17:00:00Z', { ocorrenciaDe: 'ag-1', dataOcorrencia: '2026-10-02' });
  assert.equal(diaDaVisita(movida), '2026-10-02');
});
ok('dia da visita avulsa é o de Brasília (22h30 de Brasília não vira o dia seguinte)', () => {
  assert.equal(diaDaVisita(visita('x', '2026-10-03T01:30:00Z')), '2026-10-02');
});
ok('selo só vale para o horário ATUAL da visita', () => {
  const mapa = mapaDeConfirmacoes([conf('ag-1', AMANHA, '2026-10-02T17:00:00Z', 'confirmada')]);
  assert.equal(confirmacaoDaVisita(visita('ag-1', '2026-10-02T17:00:00Z'), mapa)?.status, 'confirmada');
  assert.equal(confirmacaoDaVisita(visita('ag-1', '2026-10-02T19:00:00Z'), mapa), null, 'remarcou: resposta antiga não vale');
  assert.equal(confirmacaoDaVisita(visita('ag-9', '2026-10-02T17:00:00Z'), mapa), null);
});
ok('selos: confirmada / pediu para remarcar / aguardando; sem pedido = nada', () => {
  assert.equal(seloDaConfirmacao(conf('a', AMANHA, 'x', 'confirmada'))?.rotulo, 'Confirmada pelo cliente');
  assert.equal(seloDaConfirmacao(conf('a', AMANHA, 'x', 'remarcar'))?.rotulo, 'Pediu para remarcar');
  assert.equal(seloDaConfirmacao(conf('a', AMANHA, 'x', 'pendente'))?.rotulo, 'Aguardando o cliente');
  assert.equal(seloDaConfirmacao(null), null);
});
ok('linha da nuvem torta ou revogada nunca vira confirmação', () => {
  const boa = { agendamento_id: 'ag-1', ocorrencia_dia: '2026-10-02', inicio: '2026-10-02T17:00:00Z', status: 'confirmada', respondido_em: '2026-10-01T21:00:00Z' };
  assert.equal(linhaParaConfirmacao(boa)?.status, 'confirmada');
  assert.equal(linhaParaConfirmacao({ ...boa, status: 'sim' }), null);
  assert.equal(linhaParaConfirmacao({ ...boa, agendamento_id: 7 }), null);
  assert.equal(linhaParaConfirmacao({ ...boa, revogado_em: '2026-10-01T00:00:00Z' }), null);
  assert.equal(chaveConfirmacao('ag-1', '2026-10-02'), 'ag-1|2026-10-02');
});

console.log('\n2) fila de amanhã');
const clientes = [cliente('c-ana', 'Ana Lima'), cliente('c-bia', 'Bia', { telefone: '' }), cliente('c-caio', 'Caio')];
const visitas = [
  visita('v-tarde', '2026-10-02T17:00:00Z'),
  visita('v-manha', '2026-10-02T12:00:00Z', { clienteId: 'c-bia', clienteNome: 'Bia' }),
  visita('v-caio', '2026-10-02T14:00:00Z', { clienteId: 'c-caio', clienteNome: 'Caio' }),
  visita('v-cancelada', '2026-10-02T15:00:00Z', { status: 'cancelado' }),
  visita('v-lixo', '2026-10-02T15:30:00Z', { excluidoEm: '2026-10-01T00:00:00Z' }),
  visita('v-hoje', '2026-10-01T21:00:00Z'),
];
const mapa = mapaDeConfirmacoes([
  conf('v-tarde', AMANHA, '2026-10-02T17:00:00Z', 'remarcar'),
  conf('v-caio', AMANHA, '2026-10-02T14:00:00Z', 'confirmada'),
]);
const fila = montarFilaVespera({ visitas, clientes, confirmacoes: mapa, dia: AMANHA });
ok('só ativas do dia, mais cedo primeiro', () => {
  assert.deepEqual(fila.map((i) => i.visita.id), ['v-manha', 'v-caio', 'v-tarde']);
});
ok('situação por visita (sem telefone é contado, não some)', () => {
  assert.deepEqual(fila.map((i) => i.situacao), ['sem_telefone', 'confirmada', 'remarcar']);
});
ok('resumo e frase honestos', () => {
  const r = resumoFila(fila);
  assert.deepEqual(r, { total: 3, confirmadas: 1, remarcar: 1, aguardando: 0, aPedir: 0, semTelefone: 1 });
  assert.equal(fraseResumoFila(r), 'Amanhã: 3 visitas · 1 confirmada · 1 pediu para remarcar · 1 sem pedido de confirmação');
  assert.equal(fraseResumoFila(resumoFila([])), 'Nenhuma visita marcada para amanhã.');
});

console.log('\n3) mensagens (o prestador revisa e envia)');
ok('com link: 1 toque, dia e hora de Brasília', () => {
  const m = mensagemConfirmacao({ clienteNome: 'Ana Lima', nomePrestador: 'Frio & Cia', inicio: '2026-10-02T17:00:00Z', servico: 'Limpeza do split', link: linkConfirmacao('a'.repeat(64)), agora: AGORA });
  assert.equal(m, `Olá, Ana! Aqui é Frio & Cia. Sua visita está marcada para amanhã (sex, 02/10) às 14:00 (Limpeza do split). Pode confirmar com 1 toque aqui: https://link.olliorcamentos.online/v/${'a'.repeat(64)}`);
});
ok('sem link: pede a resposta por escrito (nunca promete link)', () => {
  const m = mensagemConfirmacao({ clienteNome: '', inicio: '2026-10-02T17:00:00Z', link: null, agora: AGORA });
  assert.equal(m, 'Olá! Sua visita está marcada para amanhã (sex, 02/10) às 14:00. Pode me confirmar por aqui se está tudo certo?');
  assert.ok(!m.includes('http'));
});
ok('oferta da vaga', () => {
  assert.equal(
    mensagemOfertaVaga({ clienteNome: 'João Souza', nomePrestador: 'Frio & Cia', inicio: '2026-10-02T17:00:00Z', agora: AGORA }),
    'Olá, João! Aqui é Frio & Cia. Abriu um horário amanhã (sex, 02/10) às 14:00 aqui perto de você. Quer aproveitar para fazer a manutenção?',
  );
});

console.log('\n4) vaga aberta → clientes vencidos por perto');
const radar = [
  { cliente: cliente('r-perto', 'Perto', { lat: -23.551, lon: -46.634 }), mesesSemContato: 8 },
  { cliente: cliente('r-longe', 'Longe', { lat: -22.9, lon: -43.2 }), mesesSemContato: 12 },
  { cliente: cliente('r-sem', 'Sem ponto'), mesesSemContato: 7 },
  { cliente: cliente('c-ana', 'Ana Lima', { lat: -23.55, lon: -46.633 }), mesesSemContato: 6 },
];
ok('até 10 km, sem o próprio cliente, sem-coordenada contado', () => {
  const r = candidatosParaVaga({ origem: { lat: -23.55, lon: -46.633 }, radar, ignorarIds: ['c-ana'] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.candidatos.map((c) => c.cliente.id), ['r-perto']);
  assert.equal(r.candidatos[0].mesesSemContato, 8);
  assert.equal(r.semLocalizacao, 1);
});
ok('origem sem coordenada = "cadastre o CEP" (nunca "ninguém perto")', () => {
  assert.deepEqual(candidatosParaVaga({ origem: null, radar }), { ok: false, motivo: 'origem_sem_localizacao' });
  assert.deepEqual(candidatosParaVaga({ origem: { lat: null, lon: null }, radar }), { ok: false, motivo: 'origem_sem_localizacao' });
});

console.log('\n5) aviso das 18h');
ok('18h de hoje; entre 18h e 20h em instantes; depois, silêncio', () => {
  const manha = new Date(2026, 9, 1, 10, 0);
  assert.equal(horarioAvisoVespera(manha)?.getHours(), 18);
  const as19 = new Date(2026, 9, 1, 19, 0);
  assert.ok((horarioAvisoVespera(as19)?.getTime() ?? 0) - as19.getTime() <= 10_000);
  assert.equal(horarioAvisoVespera(new Date(2026, 9, 1, 21, 0)), null);
});
ok('um aviso por dia: voltar ao app entre 18h e 20h não repete o aviso', () => {
  const as18 = new Date(2026, 9, 1, 18, 0);
  const as1830 = new Date(2026, 9, 1, 18, 30);
  const registro = { dia: diaLocalDoAparelho(as18), em: as18.getTime() };
  assert.equal(avisoVesperaJaSaiu(registro, as1830), true);
  // ainda pendente (agendado de manhã para as 18h): reagenda normalmente
  assert.equal(avisoVesperaJaSaiu(registro, new Date(2026, 9, 1, 17, 0)), false);
  // registro de ontem não segura o aviso de hoje
  assert.equal(avisoVesperaJaSaiu(registro, new Date(2026, 9, 2, 18, 30)), false);
  // registro torto = "não saiu"
  assert.equal(avisoVesperaJaSaiu(null, as1830), false);
  assert.equal(avisoVesperaJaSaiu({ dia: 1, em: 'x' }, as1830), false);
  const svc = readFileSync('src/services/confirmacaoVisita.ts', 'utf8');
  assert.match(svc, /avisoVesperaJaSaiu\(ultimo, agora\)/);
  assert.match(svc, /VESPERA_AVISO_DIA_KEY, JSON\.stringify/);
});
ok('conteúdo só com algo a pedir (sinal real ou silêncio)', () => {
  assert.equal(conteudoAvisoVespera(resumoFila([])), null);
  assert.equal(conteudoAvisoVespera({ total: 2, confirmadas: 2, remarcar: 0, aguardando: 0, aPedir: 0, semTelefone: 0 }), null);
  assert.deepEqual(conteudoAvisoVespera({ total: 4, confirmadas: 0, remarcar: 0, aguardando: 0, aPedir: 4, semTelefone: 0 }),
    { titulo: 'Confirmar visitas de amanhã', corpo: 'Amanhã você tem 4 visitas. Peça a confirmação com 1 toque.' });
  assert.equal(conteudoAvisoVespera({ total: 4, confirmadas: 1, remarcar: 0, aguardando: 0, aPedir: 3, semTelefone: 0 })?.corpo,
    'Amanhã você tem 4 visitas. 3 ainda sem pedido de confirmação.');
});

console.log('\n6) garantia que se cuida sozinha');
const os = (id: string, extra: Partial<OrdemServico> = {}): OrdemServico => ({
  id, numero: `OS-${id}`, clienteId: 'c-ana', clienteNome: 'Ana Lima', titulo: 'Instalação split', status: 'concluida',
  concluidoEm: '2026-09-01T15:00:00Z', checklist: [], fotos: [], criadoEm: '2026-08-30T10:00:00Z', atualizadoEm: '2026-09-01T15:00:00Z', ...extra,
});
ok('fonte: OS > orçamento; sem texto = sem garantia', () => {
  assert.deepEqual(textoGarantiaDaOS({ garantia: '6 meses' }, '90 dias'), { texto: '6 meses', origem: 'os' });
  assert.deepEqual(textoGarantiaDaOS({ garantia: '  ' }, '90 dias'), { texto: '90 dias', origem: 'orcamento' });
  assert.equal(textoGarantiaDaOS({}, null), null);
});
ok('fim só de OS concluída com prazo legível', () => {
  assert.equal(garantiaAteDaOS(os('1', { garantia: '90 dias' })), '2026-11-30');
  assert.equal(garantiaAteDaOS(os('1', { garantia: '1 ano' })), '2027-09-01');
  assert.equal(garantiaAteDaOS(os('1', { garantia: 'conforme fabricante' })), undefined);
  assert.equal(garantiaAteDaOS(os('1', { garantia: '90 dias', status: 'aberta', concluidoEm: undefined })), undefined);
  assert.equal(garantiaAteDaOS(os('1'), '30 dias'), '2026-10-01');
});
ok('check-in: D+15 dedetização, D+30 nos demais', () => {
  assert.equal(diasDoCheckin(['dedetizacao']), 15);
  assert.equal(diasDoCheckin(['refrigeracao']), 30);
  assert.equal(diasDoCheckin(undefined), 30);
});
const g90 = garantiaDaOS(os('a', { garantia: '90 dias' }))!; // até 30/11
const g30 = garantiaDaOS(os('b', { garantia: '30 dias', concluidoEm: '2026-09-28T15:00:00Z' }))!; // até 28/10
const gVencida = garantiaDaOS(os('c', { garantia: '10 dias', concluidoEm: '2026-08-01T15:00:00Z' }))!;
const gSemPrazo = garantiaDaOS(os('d', { garantia: 'vitalícia' }))!;
ok('lista do dia: "vence" primeiro, depois check-in; vencida e sem prazo ficam de fora', () => {
  const itens = garantiasParaCuidar({ garantias: [g90, g30, gVencida, gSemPrazo], hoje: '2026-10-22', verticais: ['refrigeracao'] });
  assert.deepEqual(itens.map((i) => `${i.garantia.osId}:${i.motivo}`), ['b:vence', 'a:checkin']);
  assert.equal(itens[0].diasParaVencer, 6);
  assert.equal(rotuloItemGarantia(itens[0]), 'Vence em 6 dias (até 28/10)');
  assert.equal(rotuloItemGarantia(itens[1]), 'Hora de perguntar se está tudo certo');
});
ok('check-in ainda não chegou = fora; Feito tira o item', () => {
  assert.equal(garantiasParaCuidar({ garantias: [g90], hoje: '2026-09-20' }).length, 0);
  assert.equal(garantiasParaCuidar({ garantias: [g90], hoje: '2026-10-05', feitos: ['a:checkin'] }).length, 0);
  assert.equal(garantiasParaCuidar({ garantias: [g90], hoje: '2026-10-05', verticais: ['dedetizacao'] }).length, 1);
});
ok('avisos futuros: 7 dias antes, só no futuro, sem Feito, com teto', () => {
  const av = avisosFuturosDeGarantia({ garantias: [g90, g30, gVencida, gSemPrazo], hoje: '2026-10-05' });
  assert.deepEqual(av.map((a) => `${a.garantia.osId}@${a.dia}`), ['b@2026-10-21', 'a@2026-11-23']);
  assert.equal(avisosFuturosDeGarantia({ garantias: [g90, g30], hoje: '2026-10-05', feitos: ['b:vence'] }).length, 1);
  assert.equal(avisosFuturosDeGarantia({ garantias: [g90, g30], hoje: '2026-10-05', limite: 1 }).length, 1);
});
ok('mensagem da garantia não promete além do escrito', () => {
  const [vence] = garantiasParaCuidar({ garantias: [g30], hoje: '2026-10-22' });
  assert.equal(mensagemCuidadoGarantia(vence, 'Frio & Cia'),
    'Olá, Ana! Aqui é Frio & Cia. A garantia do serviço "Instalação split" vale até 28/10. Está tudo funcionando bem? Se algo voltou a dar problema, me avise antes dessa data que eu resolvo pela garantia.');
});

console.log('\n7) fiação');
const ler = (p: string) => readFileSync(p, 'utf8');
ok('recurso vespera_garantia no Pro e valendo pelo tenant', () => {
  const ent = ler('src/services/entitlements.ts');
  assert.match(ent, /'termometro_orcamento',\s*'vespera_garantia',\s*'ia_ilimitada'/);
  assert.match(ent, /RECURSOS_DO_TENANT[\s\S]*'vespera_garantia'/);
  assert.match(ler('src/services/planosBase.ts'), /bullet\(ROTULO_RECURSO\.vespera_garantia\.titulo, \['vespera_garantia'\]\)/);
});
ok('telas inteiras passam pelo muro do plano (3 estados)', () => {
  assert.match(ler('src/screens/ConfirmarVisitasScreen.tsx'), /<TelaRecursoPlano recurso="vespera_garantia"/);
  assert.match(ler('src/screens/GarantiasScreen.tsx'), /<TelaRecursoPlano recurso="vespera_garantia"/);
  assert.match(ler('src/components/vespera/CartaoVespera.tsx'), /<RecursoPlanoChip recurso="vespera_garantia">/);
  assert.match(ler('src/components/garantia/CartaoGarantias.tsx'), /<RecursoPlanoChip recurso="vespera_garantia">/);
});
ok('servidor também decide o plano (RPC recusa Grátis)', () => {
  assert.match(ler('supabase/migrations/20261003103000_agendamentos_confirmacao.sql'), /plano_comercial_para_usuario\(p_dono\)[\s\S]*recurso_pro/);
});
ok('Hoje e Agenda mostram o selo; Hoje tem os dois nós', () => {
  const hoje = ler('src/screens/HojeScreen.tsx');
  assert.match(hoje, /<SeloConfirmacao visita=\{a\}/);
  assert.match(hoje, /<CartaoVespera escopo=\{escopo\}/);
  assert.match(hoje, /<CartaoGarantias indice=\{ordem\+\+\} visivel=\{escopo\.status === 'equipe'\}/);
  assert.match(ler('src/screens/AgendaScreen.tsx'), /<SeloConfirmacao visita=\{item\}/);
});
ok('rotas, deep link e toque da notificação', () => {
  const navTxt = ler('src/navigation/AppNavigator.tsx');
  assert.match(navTxt, /name="ConfirmarVisitas"/);
  assert.match(navTxt, /name="Garantias"/);
  const link = ler('src/navigation/linking.ts');
  assert.match(link, /ConfirmarVisitas: 'confirmar-visitas'/);
  assert.match(link, /Garantias: 'garantias'/);
  const app = ler('App.tsx');
  assert.match(app, /data\.vespera\) navigationRef\.navigate\('ConfirmarVisitas'/);
  assert.match(app, /data\.garantia\) navigationRef\.navigate\('Garantias'/);
  assert.match(app, /!data\?\.vespera && !data\?\.garantia\) return;/);
});
ok('cloudSync: reagenda DEPOIS do cancelAll da agenda e leva a garantia com a escada', () => {
  const sync = ler('src/services/cloudSync.ts');
  assert.match(sync, /m\.reagendarFollowUps\(\)\)[\s\S]{0,400}import\('\.\/confirmacaoVisita'\)[\s\S]{0,120}reagendarAvisoVespera\(\)[\s\S]{0,200}import\('\.\/garantias'\)[\s\S]{0,120}reagendarAvisosGarantia\(\)/);
  assert.match(sync, /garantia_ate: garantiaAteDaOS\(o\) \?\? null/);
  assert.match(sync, /table === 'ordens_servico' && !osSemColunasGarantia && erroDeColunaDesconhecida\(error\)/);
  assert.match(sync, /const garantia = o\.garantia \?\? garantiaLocal;/);
});
ok('SQLite v11 com as colunas da garantia', () => {
  const db = ler('src/database/database.ts');
  assert.ok(Number(/const SCHEMA_VERSION = (\d+);/.exec(db)?.[1]) >= 11);
  assert.match(db, /if \(v < 11\) \{\s*await addColumnIfMissing\(database, 'ordens_servico', 'garantia', 'TEXT'\);\s*await addColumnIfMissing\(database, 'ordens_servico', 'garantia_de_os_id', 'TEXT'\);/);
  // Colunas mais novas (ex.: `encerramento`, v12) podem vir depois da garantia.
  assert.match(db, /asset_id TEXT,\s*garantia TEXT,\s*garantia_de_os_id TEXT\s*[,)]/);
});
ok('WhatsApp só pelo link oficial', () => {
  for (const p of ['src/screens/ConfirmarVisitasScreen.tsx', 'src/screens/GarantiasScreen.tsx', 'src/components/equipamento/PedidosQrBloco.tsx']) {
    const src = ler(p);
    assert.match(src, /abrirWhatsApp/, p);
    assert.ok(!/whatsapp-web|baileys|wppconnect|venom|evolution/i.test(src), p);
  }
  const worker = ler('worker/src/confirmacaoVisita.js');
  assert.match(worker, /linkWaMe/);
});
ok('worker: /v/ antes do gate da IA, com o teto por IP do link', () => {
  const idx = ler('worker/src/index.js');
  const v = idx.indexOf("url.pathname.startsWith('/v/')");
  assert.ok(v > 0 && v < idx.indexOf('IA_ROUTES.has(url.pathname)'));
  assert.match(idx.slice(v, v + 1200), /env\.LINK_RL\.limit/);
  // "%E0" solto no caminho não pode virar URIError (500 + Sentry por requisição).
  assert.match(idx.slice(v, v + 1600), /const tokenV = url\.pathname\.slice\(3\);/);
});
ok('migrations da frente com timestamp único 2026100310xxxx e sem dado semeado', () => {
  for (const nome of ['20261003103000_agendamentos_confirmacao.sql', '20261003103100_garantia_os_qr.sql']) {
    const mig = ler(`supabase/migrations/${nome}`);
    assert.ok(!/\binsert into public\.(?!agendamentos_confirmacao)/i.test(mig.split('-- CONFERÊNCIA')[0]), nome);
  }
});

console.log(`\n${verificacoes} verificações ok`);
