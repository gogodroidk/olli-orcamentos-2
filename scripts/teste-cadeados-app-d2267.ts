/**
 * D-2267 (Igor, 18/11) NO APP: "no free só o básico; o resto pago e com cadeado".
 *
 *     node scripts/teste-cadeados-app-d2267.ts
 * Exit 0 = passou; 1 = falhou.
 *
 *  1. Regra do cadeado (pura): quem fica trancado, com a carência até 26/11; nota fiscal nunca no Grátis.
 *  2. Cada tela do recurso passa pelo portão (recibos, agenda, ordem de serviço, nota fiscal), e a tela
 *     "Disponível no Pro" existe como rota.
 *  3. O que o usuário já criou continua VISÍVEL: a lista de recibos emitidos, a lista de OS e o detalhe da
 *     visita/OS não somem; só deixam de criar e editar.
 *  4. "Puxar 1 telefone dos contatos" (D-2245) NÃO tranca.
 *  5. Texto e preço só da fonte única (nada digitado à mão nas telas novas); alvos de toque >= 44 px.
 */
import { readFileSync } from 'node:fs';
import { RECURSOS_CADEADO_D2267, importacaoLoteTrancada, pdfReciboTrancado, podeOferecerPlanoPara, recursoTrancado, recursoVendavel } from '../src/services/cadeadoRecurso.ts';
import { regrasDaLoja } from '../src/config/lojaRegras.ts';
import { ROTULO_RECURSO, beneficioRecursoLoja } from '../src/services/planosBase.ts';
import { TRANCA_GRATIS_D2267, disponibilidadeRecurso, estadoAcessoRecurso, temAcessoRecurso } from '../src/services/entitlements.ts';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// 1. Regra pura
ok('liberado e em_breve não tranca', !recursoTrancado('liberado') && !recursoTrancado('em_breve'));
ok('bloqueado tranca', recursoTrancado('bloqueado'));
ok('carregando e indeterminado também trancam (nunca liberam de graça)', recursoTrancado('carregando') && recursoTrancado('indeterminado'));
ok('os 4 recursos com cadeado do D-2267 (nota fiscal saiu: Preparar nota é aberta a todos — CPO A7)', RECURSOS_CADEADO_D2267.join(',') === 'recibos,agenda,ordem_servico,importar_lote');
ok('recurso "em breve" não vende; o que já entrega vende', !recursoVendavel('nota_fiscal') && !recursoVendavel('mapa_equipe') && !recursoVendavel('dashboard_empresa') && recursoVendavel('recibos') && recursoVendavel('importar_lote'));
const antes = Date.parse(TRANCA_GRATIS_D2267) - 1000;
const depois = Date.parse(TRANCA_GRATIS_D2267) + 1000;
for (const r of ['recibos', 'agenda', 'ordem_servico', 'importar_lote'] as const) {
  ok(`${r}: Grátis na carência usa, depois do prazo tranca; Pro/Empresa sempre`,
    temAcessoRecurso('gratis', r, antes) && !temAcessoRecurso('gratis', r, depois)
    && temAcessoRecurso('pro', r, depois) && temAcessoRecurso('empresa', r, depois));
}
ok('nota fiscal: Grátis nunca (nem na carência); Pro/Empresa "em breve"',
  !temAcessoRecurso('gratis', 'nota_fiscal', antes) && !temAcessoRecurso('gratis', 'nota_fiscal', depois)
  && disponibilidadeRecurso('pro', 'nota_fiscal') === 'em_breve' && disponibilidadeRecurso('empresa', 'nota_fiscal') === 'em_breve');
ok('Grátis confirmado sem carência vira "bloqueado"; plano não confirmado nunca libera',
  estadoAcessoRecurso({ plano: 'gratis', carregando: false, confirmado: true } as never, 'nota_fiscal') === 'bloqueado'
  && estadoAcessoRecurso({ plano: 'gratis', carregando: false, confirmado: false } as never, 'nota_fiscal') === 'indeterminado');
ok('texto "Em breve" sem data inventada', !/\d{1,2}\/\d{1,2}|\b20\d\d\b/.test(semComentarios(ler('src/components/RecursoPlano.tsx')).match(/EM BREVE NO[\s\S]{0,200}/)?.[0] ?? ''));

// 2. Portões nas telas + rota
const recibo = semComentarios(ler('src/screens/EmitirReciboScreen.tsx'));
const agenda = semComentarios(ler('src/screens/AgendaScreen.tsx'));
const os = semComentarios(ler('src/screens/OrdemServicoScreen.tsx'));
const visualizar = semComentarios(ler('src/screens/VisualizarOrcamentoScreen.tsx'));
const nota = semComentarios(ler('src/screens/PrepararNotaScreen.tsx'));
const home = semComentarios(ler('src/screens/HomeScreen.tsx'));
const gate = semComentarios(ler('src/screens/RecursoTrancadoScreen.tsx'));
const nav = ler('src/navigation/AppNavigator.tsx');
ok('rota RecursoTrancado registrada e tipada', /RecursoTrancado: \{ recurso: Recurso \}/.test(nav) && /name="RecursoTrancado" component=\{RecursoTrancadoScreen\}/.test(nav));
ok('tela "Disponível no Pro" usa o cartão da fonte única', /<CartaoRecursoPlano recurso=\{recurso\} \/>/.test(gate) && /Disponível no \$\{NOME_PLANO\[planoMinimoDoRecurso\(recurso\)\]\}/.test(gate));
ok('recibo: aba Novo vira cartão do plano quando trancada', /useCadeado\('recibos'\)/.test(recibo) && /aba === 'novo' && reciboTrancado/.test(recibo) && /<CartaoRecursoPlano recurso="recibos" \/>/.test(recibo));
ok('recibo (corte do CPO): EMITIR PDF/link tranca, inclusive o pagamento já registrado com PDF pendente', /const reciboTrancado = cadeadoRecibo\.trancado;/.test(recibo) && !/cadeadoRecibo\.trancado && !reciboPendente/.test(recibo));
// REGISTRAR pagamento recebido segue Grátis: nem o registro (serviço) nem o botão no orçamento passam pelo cadeado de recibo
const vis = semComentarios(ler('src/screens/VisualizarOrcamentoScreen.tsx'));
const orcs = semComentarios(ler('src/screens/OrcamentosScreen.tsx'));
const pagamentos = [...vis.matchAll(/registrarPagamento\(/g)].map((m) => vis.slice(Math.max(0, m.index! - 400), m.index! + 400)).concat([...orcs.matchAll(/registrarPagamento\(/g)].map((m) => orcs.slice(Math.max(0, m.index! - 400), m.index! + 400)));
ok('recibo (corte do CPO): registrar pagamento recebido (marcar pago, valor, data) NÃO passa pelo cadeado', pagamentos.length > 0 && pagamentos.every((t) => !/cadeadoRecibo|abrirGate/.test(t)) && !/cadeado/i.test(semComentarios(ler('src/services/pagamentos.ts'))));
ok('agenda: agendar nova visita, salvar, excluir e arrastar passam pelo portão',
  /useCadeado\('agenda'\)/.test(agenda)
  && (agenda.match(/if \(cadeadoAgenda\.trancado\) \{ cadeadoAgenda\.abrirGate\(\); return/g) ?? []).length === 4);
ok('agenda: visita existente abre em somente leitura (Fechar, sem excluir, campos sem toque)',
  /somenteLeitura=\{cadeadoAgenda\.trancado\}/.test(agenda) && /pointerEvents=\{somenteLeitura \? 'none' : 'auto'\}/.test(agenda)
  && /onDelete && !somenteLeitura/.test(agenda) && /label="Fechar" variant="outline"/.test(agenda));
ok('OS: "Nova OS" passa pelo portão e o detalhe vira somente leitura com o cartão do plano',
  /useCadeado\('ordem_servico'\)/.test(os) && (os.match(/cadeadoOS\.trancado\) \{ cadeadoOS\.abrirGate\(\); return; \}/g) ?? []).length === 2
  && /osTrancada \? <CartaoRecursoPlano recurso="ordem_servico"/.test(os) && /pointerEvents=\{osTrancada \? 'none' : 'auto'\}/.test(os));
ok('orçamento: "Criar OS" passa pelo portão; botões de OS e recibo mostram o cadeado (nota fica aberta)',
  /cadeadoOS\.trancado\) \{ cadeadoOS\.abrirGate\(\); return; \}/.test(visualizar)
  && (visualizar.match(/lock-outline/g) ?? []).length >= 4);
ok('Preparar nota fica ABERTA a todos: tela sem TelaRecursoPlano/useCadeado e sem gate de nota_fiscal', !/TelaRecursoPlano|useCadeado|nota_fiscal|CartaoRecursoPlano/.test(nota) && /PrepararNotaConteudo/.test(nota));
ok('atalhos de Preparar nota (recibo e orçamento) sem gate e sem cadeado', !/cadeadoNota|useCadeado\('nota_fiscal'\)/.test(recibo) && !/cadeadoNota|useCadeado\('nota_fiscal'\)/.test(visualizar));
const rpl = semComentarios(ler('src/components/RecursoPlano.tsx'));
ok('cartão e chip "em breve": só texto "Em breve no <plano>", sem botão (recursoVendavel antes do botão)',
  (rpl.match(/if \(!recursoVendavel\(recurso\)\)/g) ?? []).length === 2 && /Em breve no \{nome\}\./.test(rpl) && /Em breve no \{NOME_PLANO\[planoMinimo\]\}/.test(rpl)
  && rpl.indexOf('!recursoVendavel(recurso)', rpl.indexOf('export function CartaoRecursoPlano')) < rpl.indexOf('Ver o plano {nome}'));
ok('Home: atalhos Recibo e Agendar ficam, com cadeado', /trancado: cadeadoRecibo\.trancado/.test(home) && /trancado: cadeadoAgenda\.trancado/.test(home));

// 3. O que já existe segue visível: a lista de emitidos e a lista de OS não passam pelo cadeado
ok('recibos emitidos seguem numa aba sem portão', /<FlatList\s+data=\{emitidos\}/.test(recibo) && !/aba === 'emitidos' && reciboTrancado/.test(recibo));
ok('lista de OS e detalhe legível não são envolvidos por TelaRecursoPlano', !/TelaRecursoPlano/.test(os) && !/TelaRecursoPlano/.test(agenda) && !/TelaRecursoPlano/.test(recibo));

// 4. Puxar 1 telefone (D-2245) NÃO tranca
for (const f of ['src/services/puxarTelefoneDosContatos.ts', 'src/steps/Step1Cliente.tsx', 'src/utils/telefonePuxado.ts', 'src/services/telefoneDoCliente.ts']) {
  const c = semComentarios(ler(f));
  ok(`${f}: sem cadeado (puxar 1 telefone segue Grátis)`, !/useCadeado|TelaRecursoPlano|CartaoRecursoPlano|'recibos'|'agenda'|'ordem_servico'|'importar_lote'/.test(c));
}
ok('handleWhatsAppAgora (puxar no envio) não passa por cadeado', !/handleWhatsAppAgora[\s\S]{0,2500}useCadeado/.test(visualizar));

// 5. Fonte única de texto e alvos de toque
for (const [nome, c] of [['RecursoTrancadoScreen', gate], ['useCadeado', semComentarios(ler('src/hooks/useCadeado.ts'))], ['cadeadoRecurso', semComentarios(ler('src/services/cadeadoRecurso.ts'))]] as const) {
  ok(`${nome}: sem preço nem nome de plano digitado`, !/R\$\s?\d|\b39\b|'Pro'|"Pro"/.test(c));
}
ok('Home: o nome do plano do atalho vem de NOME_PLANO', /NOME_PLANO\.pro/.test(home) && !/Disponível no Pro/.test(home));
ok('alvos >= 44 px: aba Novo/Emitidos, "Preparar nota" e "Nova OS"',
  /minHeight: 44, paddingVertical: 9/.test(ler('src/screens/EmitirReciboScreen.tsx'))
  && /paddingTop: 8, minHeight: 44/.test(ler('src/screens/EmitirReciboScreen.tsx'))
  && /minHeight: 44, paddingHorizontal: 14, paddingVertical: 8/.test(ler('src/screens/OrdemServicoScreen.tsx')));

// 6. LOJAS (Play e iOS): "Disponível no Pro" não tem botão nem link de pagamento externo e não cita Pix
ok('iOS: o cartão só informa (sem botão), mesmo se o servidor disser que a Play vende', !podeOferecerPlanoPara('ios', false) && !podeOferecerPlanoPara('ios', true));
ok('Android sem Play Billing confirmado: só informa; com a venda pela Play: botão (fluxo da loja)', !podeOferecerPlanoPara('android', false) && podeOferecerPlanoPara('android', true));
ok('web: pode oferecer', podeOferecerPlanoPara('web', false));
ok('regras de loja: iOS não vende; Android da Play não abre compra externa; só a web habilita compra externa',
  !regrasDaLoja('ios').compraNoApp && regrasDaLoja('android').buildPlaySemCompraExterna
  && regrasDaLoja('web').compraExternaHabilitada && !regrasDaLoja('android').compraExternaHabilitada && !regrasDaLoja('ios').compraExternaHabilitada);
const todosRecursos = Object.keys(ROTULO_RECURSO) as Array<keyof typeof ROTULO_RECURSO>;
ok('texto das LOJAS (título e beneficioRecursoLoja) de TODOS os recursos sem "Pix"',
  todosRecursos.every((r) => !/pix/i.test(beneficioRecursoLoja(r)) && !/pix/i.test(ROTULO_RECURSO[r].titulo)));
const cartao = semComentarios(ler('src/components/RecursoPlano.tsx'));
ok('cartão: fora da web o benefício vem de beneficioRecursoLoja', /Platform\.OS === 'web' \? beneficioRecurso\(recurso\) : beneficioRecursoLoja\(recurso\)/.test(cartao));
ok('cartão: o botão do plano só existe atrás de podeOferecerPlano() e só leva à tela de planos da loja',
  /podeOferecerPlano\(\) \? \(\s*<OlliPressable onPress=\{irParaPlanos\}/.test(cartao) && /nav\.navigate\('Planos'/.test(cartao));
ok('cartão e tela do cadeado: sem link externo, sem Pix e sem texto de pagamento fora da loja',
  !/Linking|openURL|https?:\/\/|mercadopago|stripe|checkout/i.test(cartao + gate) && !/pix/i.test(gate)
  && !/pix/i.test(cartao.replace(/beneficioRecurso\(recurso\)/g, '')));
ok('preço do cartão vem de precosPlanos (informação; nada de "pague por Pix")', /PRECO_PRO/.test(cartao) && /por mês/.test(cartao) && !/pix/i.test(cartao.split('por mês')[0].slice(-200)));

// 7. Os caminhos de escrita que o LIVRE achou (tablet/desktop, Hoje, Mapa, Encerrar atendimento): cada um bloqueia no Grátis
//    e libera no Pro, ligados ao MESMO estado de acesso (estadoAcessoRecurso -> useCadeado -> recursoTrancado).
const estadoCom = (plano: 'gratis' | 'pro' | 'empresa', agora: number, extra: { carregando?: boolean; confirmado?: boolean; planoTenant?: 'gratis' | 'pro' | 'empresa' } = {}) => {
  const real = Date.now;
  Date.now = () => agora;
  try {
    return estadoAcessoRecurso({ plano, planoTenant: extra.planoTenant, carregando: extra.carregando ?? false, confirmado: extra.confirmado ?? true } as never, 'agenda');
  } finally { Date.now = real; }
};
const pontos: Array<{ nome: string; recurso: 'agenda' | 'ordem_servico'; arquivo: string; prova: (c: string) => boolean }> = [
  { nome: 'tablet/desktop: agenda (novo, editar, salvar, concluir, cancelar, excluir)', recurso: 'agenda', arquivo: 'src/screens/desktop/AgendaDesktopScreen.tsx',
    prova: (c) => /useCadeado\('agenda'\)/.test(c) && (c.match(/if \(cadeadoAgenda\.trancado\) \{ cadeadoAgenda\.abrirGate\(\); return; \}/g) ?? []).length === 6 },
  { nome: 'tablet/desktop: painel Nova OS', recurso: 'ordem_servico', arquivo: 'src/screens/desktop/PainelNovaOS.tsx',
    prova: (c) => /useCadeado\('ordem_servico'\)/.test(c) && /<CartaoRecursoPlano recurso="ordem_servico" \/>/.test(c) && (c.match(/if \(cadeadoOS\.trancado\) return;/g) ?? []).length === 2 },
  { nome: 'tablet/desktop: painel da OS (status, checklist, agenda, dados, atribuir)', recurso: 'ordem_servico', arquivo: 'src/screens/desktop/PainelOS.tsx',
    prova: (c) => /useCadeado\('ordem_servico'\)\.trancado/.test(c) && (c.match(/if \(osTrancada\) return;/g) ?? []).length === 6 && /pointerEvents=\{osTrancada \? 'none' : 'auto'\}/.test(c) && /<CartaoRecursoPlano recurso="ordem_servico"/.test(c) },
  { nome: 'tela Hoje: concluir/reabrir visita', recurso: 'agenda', arquivo: 'src/screens/HojeScreen.tsx',
    prova: (c) => /useCadeado\('agenda'\)/.test(c) && /mudarStatus = useCallback\(async \(a: OcorrenciaAgendamento, status: 'concluido' \| 'agendado'\) => \{\s*if \(cadeadoAgenda\.trancado\) \{ cadeadoAgenda\.abrirGate\(\); return; \}/.test(c) },
  { nome: 'Mapa: reordenar a rota regrava horários', recurso: 'agenda', arquivo: 'src/screens/MapaDiaScreen.tsx',
    prova: (c) => /useCadeado\('agenda'\)/.test(c) && /if \(ordenando\) return;\s*if \(cadeadoAgenda\.trancado\) \{ cadeadoAgenda\.abrirGate\(\); return; \}/.test(c) },
  { nome: 'Mapa e Clima: folha "Remarcar" (remarcarVisita)', recurso: 'agenda', arquivo: 'src/components/clima/FolhaNovaDataVisita.tsx',
    prova: (c) => /useCadeado\('agenda'\)\.trancado/.test(c) && /if \(salvando \|\| trancado\) return;/.test(c) && /<CartaoRecursoPlano recurso="agenda" titulo="Remarcar visita" \/>/.test(c) },
  { nome: 'Encerrar atendimento (fotos, assinatura, cobrança, próxima visita)', recurso: 'ordem_servico', arquivo: 'src/components/encerramento/EncerrarAtendimentoModal.tsx',
    prova: (c) => /useCadeado\('ordem_servico'\)\.trancado/.test(c) && /pointerEvents=\{trancado \? 'none' : 'auto'\}/.test(c) && /finalizado \|\| trancado \?/.test(c) && /<CartaoRecursoPlano recurso="ordem_servico" titulo="Encerrar atendimento"/.test(c) },
  { nome: 'técnico em campo: avançar status da OS', recurso: 'ordem_servico', arquivo: 'src/screens/TecnicoHomeScreen.tsx',
    prova: (c) => /useCadeado\('ordem_servico'\)/.test(c) && /avancarStatus\(ordem: OrdemServico, proximo: StatusOS\) \{\s*if \(cadeadoOS\.trancado\)/.test(c) },
];
for (const p of pontos) {
  ok(`${p.nome}: portão no código (${p.arquivo.split('/').pop()})`, p.prova(semComentarios(ler(p.arquivo))));
}
ok('estado de acesso, para cada ponto: Grátis depois da carência TRANCA; Pro, Empresa e técnico de empresa Pro LIBERAM; Grátis na carência libera',
  recursoTrancado(estadoCom('gratis', depois)) && !recursoTrancado(estadoCom('pro', depois)) && !recursoTrancado(estadoCom('empresa', depois))
  && !recursoTrancado(estadoCom('gratis', depois, { planoTenant: 'pro' })) && !recursoTrancado(estadoCom('gratis', antes)));
ok('3 estados: carregando/indeterminado trancam o Grátis; Pro com plano em cache (offline, sem confirmar) segue LIBERADO',
  recursoTrancado(estadoCom('gratis', depois, { carregando: true, confirmado: false })) && recursoTrancado(estadoCom('gratis', depois, { confirmado: false }))
  && !recursoTrancado(estadoCom('pro', depois, { carregando: true, confirmado: false })) && !recursoTrancado(estadoCom('pro', depois, { confirmado: false })));
// Varredura: qualquer tela/componente que chame um serviço de ESCRITA de agenda/OS/recibo precisa usar useCadeado (ou estar na lista de isentos)
import { readdirSync, statSync } from 'node:fs';
const ESCRITA = /\b(saveAgendamento|deleteAgendamento|editarRecorrente|remarcarVisita|mudarStatusVisitaDoDia|criarOSManual|criarOSDeOrcamento|salvarEncerramentoOS|finalizarEncerramentoOS|atualizarStatusOS|atualizarChecklist|editarDadosOS|saveOrdemServico)\(/;
const ISENTOS = new Set<string>([
  'src/components/tecnico/BarraOffline.tsx', // só comentário de exemplo
  'src/database/database.ts', // camada de dados (sync/restauração), não é ação do usuário
]);
const sobra: string[] = [];
const varrer = (dir: string) => {
  for (const nome of readdirSync(new URL(`../${dir}`, import.meta.url))) {
    const rel = `${dir}/${nome}`;
    if (statSync(new URL(`../${rel}`, import.meta.url)).isDirectory()) { varrer(rel); continue; }
    if (!/\.tsx?$/.test(nome) || ISENTOS.has(rel)) continue;
    const c = semComentarios(ler(rel));
    if (ESCRITA.test(c) && !/useCadeado\(/.test(c)) sobra.push(rel);
  }
};
for (const d of ['src/screens', 'src/screens/desktop', 'src/components', 'src/components/clima', 'src/components/encerramento', 'src/components/tecnico', 'src/steps']) varrer(d);
ok(`varredura: toda tela/componente que escreve agenda/OS usa o cadeado${sobra.length ? ' — SEM: ' + sobra.join(', ') : ''}`, sobra.length === 0);

// LIVRE P2 #1 (#399): PDF de recibo ainda NÃO emitido sai pelo mesmo cadeado 'recibos' em TODA tela que o gera.
ok('regra pura: PDF pendente + recibos trancado tranca; já emitido (reenviar) e liberado seguem livres',
  pdfReciboTrancado({ pdfEmitido: false }, true) && !pdfReciboTrancado({ pdfEmitido: true }, true)
  && !pdfReciboTrancado({ pdfEmitido: false }, false) && !pdfReciboTrancado({}, true));
const telasPdfRecibo = [
  { arq: 'src/components/encerramento/EncerrarAtendimentoModal.tsx', onde: /async function gerarRecibo\(recibo: Recibo\) \{\s*if \(pdfReciboTrancado\(recibo, cadeadoRecibo\.trancado\)\) \{ cadeadoRecibo\.abrirGate\(\); return; \}/ },
  { arq: 'src/screens/ClienteDetalheScreen.tsx', onde: /async function abrirRecibo\(id: string\) \{[\s\S]{0,200}if \(!recibo\) return;\s*if \(pdfReciboTrancado\(recibo, cadeadoRecibo\.trancado\)\) \{ cadeadoRecibo\.abrirGate\(\); return; \}/ },
  { arq: 'src/screens/desktop/RecibosDesktopScreen.tsx', onde: /async \(r: Recibo\) => \{\s*if \(pdfReciboTrancado\(r, cadeadoRecibo\.trancado\)\) \{ cadeadoRecibo\.abrirGate\(\); return; \}/ },
];
for (const t of telasPdfRecibo) {
  const c = semComentarios(ler(t.arq));
  ok(`PDF de recibo pendente: portão 'recibos' antes de gerar (${t.arq.split('/').pop()})`, /useCadeado\('recibos'\)/.test(c) && t.onde.test(c));
}
// Varredura: quem monta o PDF do recibo e exporta precisa do portão (Emitir: aba 'novo' trancada; Modelos: só prévia de exemplo).
const ISENTOS_PDF_RECIBO = new Set<string>(['src/screens/EmitirReciboScreen.tsx', 'src/screens/ModelosDocumentoScreen.tsx']);
const semPortaoPdf: string[] = [];
const varrerPdf = (dir: string) => {
  for (const nome of readdirSync(new URL(`../${dir}`, import.meta.url))) {
    const rel = `${dir}/${nome}`;
    if (statSync(new URL(`../${rel}`, import.meta.url)).isDirectory()) { varrerPdf(rel); continue; }
    if (!/\.tsx$/.test(nome) || ISENTOS_PDF_RECIBO.has(rel)) continue;
    const c = semComentarios(ler(rel));
    if (/montarHtmlRecibo\(/.test(c) && /exportarHtmlComoPdf\(/.test(c) && !/pdfReciboTrancado\(/.test(c)) semPortaoPdf.push(rel);
  }
};
for (const d of ['src/screens', 'src/screens/desktop', 'src/components', 'src/components/encerramento']) varrerPdf(d);
ok(`varredura: toda tela que gera o PDF do recibo usa o portão${semPortaoPdf.length ? ' — SEM: ' + semPortaoPdf.join(', ') : ''}`, semPortaoPdf.length === 0);
ok('Emitir recibo: a aba "novo" fica trancada mesmo com pagamento já registrado (PDF pendente)', /const reciboTrancado = cadeadoRecibo\.trancado;/.test(semComentarios(ler('src/screens/EmitirReciboScreen.tsx'))));

// LIVRE P2 #2 (#387): a trava do lote vale pelo tipo FINAL, conferida na hora de importar.
ok('lote: trancado vale para contatos e planilha de clientes; catálogo e foto seguem Grátis',
  importacaoLoteTrancada('contatos', 'clientes', true) && importacaoLoteTrancada('planilha', 'clientes', true)
  && !importacaoLoteTrancada('planilha', 'catalogo', true) && !importacaoLoteTrancada('foto', 'clientes', true)
  && !importacaoLoteTrancada(null, 'clientes', true) && !importacaoLoteTrancada('planilha', 'clientes', false));
ok('lote: ler planilha como catálogo e TROCAR para clientes tranca (mesma planilha, tipo final decide)',
  !importacaoLoteTrancada('planilha', 'catalogo', true) && importacaoLoteTrancada('planilha', 'clientes', true));
{
  const c = ler('src/screens/ImportarScreen.tsx') // bruto: o seletor usa '*/*' e confunde a limpeza de comentários;
  ok('ImportarScreen: bloqueio e gravação usam a MESMA regra pura', /const bloqueioLote = importacaoLoteTrancada\(origem, tipo, loteTrancado\);/.test(c));
  ok('ImportarScreen: importar() confere de novo o tipo final antes de gravar (antes de gravarImportacao)',
    /async function importar\(\) \{[\s\S]*?if \(importacaoLoteTrancada\(origem, tipo, loteTrancado\)\) return;[\s\S]*?gravarImportacao\(/.test(c));
  ok('ImportarScreen: com o lote trancado não há prévia nem botão (trocar o tipo com a planilha lida não vaza)',
    /const fonteLiberada = temFonte && !bloqueioLote;/.test(c) && !/\{temFonte && existentes/.test(c) && (c.match(/\{fonteLiberada && existentes/g) ?? []).length === 4);
}

console.log(falhas ? `\nFALHOU: ${falhas}` : '\nPASSOU');
process.exit(falhas ? 1 : 0);
