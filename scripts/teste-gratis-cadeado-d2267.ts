/**
 * D-2267 (Igor, 18/11): "no free só o básico; o resto pago e com cadeado".
 *
 *     node scripts/teste-gratis-cadeado-d2267.ts
 * Exit 0 = passou; 1 = falhou.
 *
 *  1. Aviso aos Grátis de hoje: diz o que muda, quando, o que continua grátis e o que acontece com o já criado.
 *  2. Painel: agenda, OS e importar em lote passam pelo portão (lista visível, ação com cadeado). Recibos no painel
 *     é só o REGISTRO do pagamento (o PDF/link sai no app, #399) — corte da CPO 18/11: registrar é Grátis.
 *  3. Tela "Disponível no Pro: <preço> por mês", com o preço da fonte.
 *  4. Landing e FAQ não prometem mais recibo, agenda nem OS no Grátis (CDC: mesma coisa em todo lugar).
 */
import { readFileSync } from 'node:fs';
import { avisoMudancaGratis, dataTrancaGratisBR, recursosQueSairamDoGratis, ROTULO_RECURSO, tituloRecurso } from '../src/services/planosBase.ts';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// 1. Aviso
const av = avisoMudancaGratis('R$ 39,00');
ok('aviso tem a data da tranca', av.titulo.includes(dataTrancaGratisBR()) && dataTrancaGratisBR() === '26/11/2026');
ok('aviso diz o que sai do Grátis', /recibo em PDF/i.test(av.texto) && av.texto.includes('agenda de visitas') && av.texto.includes('ordem de serviço') && av.texto.includes('importar clientes em lote'));
ok('aviso diz o preço que recebeu (nunca digitado)', av.texto.includes('R$ 39,00 por mês'));
ok('aviso diz o que continua grátis', /Criar e enviar orçamentos continua grátis/.test(av.texto));
ok('aviso diz que o já criado continua', /já criou continua/.test(av.texto));
ok('aviso diz que registrar o pagamento continua grátis (CPO 19/11) e não promete PDF/link grátis', /registrar o pagamento recebido também/.test(av.texto) && !/(PDF|link)[^.]*continua grátis/i.test(av.texto));
// CPO 19/11: "Preparar nota fiscal" é aberto a todos; o recurso Pro é só a emissão automática pela OLLI, em breve.
ok('nota fiscal Pro = emissão automática pela OLLI, em breve (nunca "emitir pelo OLLI" como pronto)',
  /automática/.test(ROTULO_RECURSO.nota_fiscal.titulo) && tituloRecurso('nota_fiscal').endsWith('(em breve)'));
ok('aviso sem pressão falsa nem "responda SAIR"', !/últimas vagas|só hoje|SAIR/i.test(av.titulo + av.texto));
ok('frase do que saiu do Grátis', recursosQueSairamDoGratis() === 'recibo em PDF e link, agenda de visitas, ordem de serviço e importar clientes em lote');

// 1b. Corte de recibos da CPO (18/11): Grátis REGISTRA pagamento; EMITIR recibo é Pro. Nenhum texto do Grátis promete recibo.
// 2. Painel
{
  const P = await import('../src/services/planosBase.ts');
  const textosGratis = [...P.RECURSOS_GRATIS, P.NOTA_SELO_GRATIS, P.FRASE_GRATIS, P.FRASE_GRATIS_CURTA, P.GRATIS_LINHA_ANUNCIO];
  ok('nenhum texto do Grátis promete recibo emitido (só o registro do pagamento)', textosGratis.every((t) => !/recibo/i.test(t)) && P.RECURSOS_GRATIS.includes('Registro dos pagamentos recebidos'));
  ok('rótulo Pro do recibo = "Recibo em PDF e link para o cliente"', P.ROTULO_RECURSO.recibos.titulo === 'Recibo em PDF e link para o cliente');
  ok('selo do Grátis fala do PDF e do link do orçamento', P.NOTA_SELO_GRATIS.startsWith('O PDF e o link do orçamento do Grátis'));
}
const telas: Array<[string, string]> = [
  ['webapp/src/pages/olli/ordens-servico/index.tsx', 'ordem_servico'],
  ['webapp/src/pages/olli/agenda/index.tsx', 'agenda'],
];
for (const [arq, recurso] of telas) {
  const t = ler(arq);
  ok(`${recurso}: ação passa pelo portão`, t.includes(`usePortaoPro("${recurso}")`) && t.includes('portao.exigir('));
  ok(`${recurso}: faixa do cadeado e aviso na tela`, t.includes(`<FaixaRecursoPro recurso="${recurso}"`) && t.includes('<AvisoMudancaGratis />') && t.includes('{portao.dialogo}'));
}
const recibosPainel = ler('webapp/src/pages/olli/recibos/index.tsx');
ok('recibos (painel = registro do pagamento) NÃO tranca: registrar é Grátis', !recibosPainel.includes('usePortaoPro(') && recibosPainel.includes('<AvisoMudancaGratis />'));
ok('painel não emite PDF/link de recibo (isso é do app, com cadeado)', !/gerarPdfRecibo|compartilharRecibo|linkRecibo/.test(recibosPainel + ler('webapp/src/pages/olli/recibos/FormRecibo.tsx')));
const agenda = ler('webapp/src/pages/olli/agenda/index.tsx');
ok('agenda: arrastar/remarcar também respeita o cadeado', agenda.includes('if (!agendaLiberadaRef.current)') && !/setFormAberto\(true\);\n(?![\s\S]*portao)/.test(agenda.split('const abrirForm')[1] ?? ''));
const quadro = ler('webapp/src/features/kanban/components/kanban-board.tsx');
ok('Quadro: "Finalizar serviço" (cria/conclui OS) passa pelo portão', quadro.includes('usePortaoPro("ordem_servico")') && quadro.includes('portaoOs.exigir(() => void finalizar(alvo))') && quadro.includes('{portaoOs.dialogo}'));
// Toda gravação de recibo/agenda/OS no painel mora numa tela com portão (lista fechada de quem grava).
const gravadores = ['webapp/src/pages/olli/agenda/FormAgendamento.tsx', 'webapp/src/pages/olli/ordens-servico/FormOs.tsx'];
ok('formulários de agenda/OS só abrem pelas telas com portão', gravadores.every((g) => ler(g).length > 0));
const dados = ler('webapp/src/pages/olli/dados/index.tsx');
ok('Central de dados: importar CLIENTES em lote passa pelo portão', dados.includes('usePortaoPro("importar_lote")') && dados.includes('tipo === "clientes" ? portaoLote.exigir('));

// 3. Tela de upgrade
const rp = ler('webapp/src/olli/recursoPlano.tsx');
ok('tela "Disponível no <plano>: <preço> por mês" com preço da fonte', rp.includes('Disponível no {nome}: {preco} por mês') && rp.includes('precoDoPlano(plano)'));
ok('assinar leva a Planos (Pix Automático em 1º lá)', rp.includes('navigate("/planos")'));
ok('indeterminado nunca libera nem rebaixa', /indeterminado[\s\S]{0,200}toast\.error/.test(rp));

// 4. Coerência landing + FAQ
const homeEPlanos = ['web/src/pages/index.astro', 'web/src/pages/planos.astro'].map(ler);
const oficioEAjuda = ['web/src/pages/para/[oficio].astro', 'src/content/ajuda/index.ts'].map(ler);
const faqSite = ler('web/src/data/faq-site.ts');
const landing = [...homeEPlanos, ...oficioEAjuda, faqSite].join('\n');
ok('landing/FAQ não prometem recibo/agenda/OS no Grátis', !/(rascunhos, (ordem de serviço, )?recibos|Grátis para começar: orçamento, ordem de serviço e recibo|Grátis da OLLI faz ordem de serviço|com orçamento, ordem de serviço, recibo, clientes|recibos, clientes, agenda e histórico)/.test(landing));
const fraseSite = ler('web/src/data/site.ts').split('\n')
  .find((linha) => linha.startsWith('export const FRASE_RECURSOS_PLANOS_PAGOS = '));
ok('home e planos usam a lista derivada da fonte',
  fraseSite?.includes('${recursosQueSairamDoGratis()}') === true
  && homeEPlanos.every((pagina) => pagina.includes('{FRASE_RECURSOS_PLANOS_PAGOS}')));
ok('ofício e ajuda usam a lista derivada da fonte',
  oficioEAjuda.every((pagina) => pagina.includes('recursosQueSairamDoGratis()')));
ok('FAQ de ordem de serviço usa o título da fonte e a inclusão nos planos',
  faqSite.includes('ROTULO_RECURSO.ordem_servico.titulo') && faqSite.includes('${PLANOS_PAGOS_INCLUEM}'));

console.log(falhas ? `\n${falhas} falha(s)` : '\nPASSOU');
process.exit(falhas ? 1 : 0);
