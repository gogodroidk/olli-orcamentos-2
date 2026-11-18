/**
 * D-2267 (Igor, 18/11): "no free só o básico; o resto pago e com cadeado".
 *
 *     node scripts/teste-gratis-cadeado-d2267.ts
 * Exit 0 = passou; 1 = falhou.
 *
 *  1. Aviso aos Grátis de hoje: diz o que muda, quando, o que continua grátis e o que acontece com o já criado.
 *  2. Painel: recibos, agenda, OS e importar em lote passam pelo portão (lista visível, ação com cadeado).
 *  3. Tela "Disponível no Pro: <preço> por mês", com o preço da fonte.
 *  4. Landing e FAQ não prometem mais recibo, agenda nem OS no Grátis (CDC: mesma coisa em todo lugar).
 */
import { readFileSync } from 'node:fs';
import { avisoMudancaGratis, dataTrancaGratisBR, recursosQueSairamDoGratis } from '../src/services/planosBase.ts';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// 1. Aviso
const av = avisoMudancaGratis('R$ 39,00');
ok('aviso tem a data da tranca', av.titulo.includes(dataTrancaGratisBR()) && dataTrancaGratisBR() === '26/11/2026');
ok('aviso diz o que sai do Grátis', /recibos/i.test(av.texto) && av.texto.includes('agenda de visitas') && av.texto.includes('ordem de serviço') && av.texto.includes('importar clientes em lote'));
ok('aviso diz o preço que recebeu (nunca digitado)', av.texto.includes('R$ 39,00 por mês'));
ok('aviso diz o que continua grátis', /Criar e enviar orçamentos continua grátis/.test(av.texto));
ok('aviso diz que o já criado continua', /já criou continua/.test(av.texto));
ok('aviso sem pressão falsa nem "responda SAIR"', !/últimas vagas|só hoje|SAIR/i.test(av.titulo + av.texto));
ok('frase do que saiu do Grátis', recursosQueSairamDoGratis() === 'recibos, agenda de visitas, ordem de serviço e importar clientes em lote');

// 2. Painel
const telas: Array<[string, string]> = [
  ['webapp/src/pages/olli/recibos/index.tsx', 'recibos'],
  ['webapp/src/pages/olli/ordens-servico/index.tsx', 'ordem_servico'],
  ['webapp/src/pages/olli/agenda/index.tsx', 'agenda'],
];
for (const [arq, recurso] of telas) {
  const t = ler(arq);
  ok(`${recurso}: ação passa pelo portão`, t.includes(`usePortaoPro("${recurso}")`) && t.includes('portao.exigir('));
  ok(`${recurso}: faixa do cadeado e aviso na tela`, t.includes(`<FaixaRecursoPro recurso="${recurso}"`) && t.includes('<AvisoMudancaGratis />') && t.includes('{portao.dialogo}'));
}
const agenda = ler('webapp/src/pages/olli/agenda/index.tsx');
ok('agenda: arrastar/remarcar também respeita o cadeado', agenda.includes('if (!agendaLiberadaRef.current)') && !/setFormAberto\(true\);\n(?![\s\S]*portao)/.test(agenda.split('const abrirForm')[1] ?? ''));
const dados = ler('webapp/src/pages/olli/dados/index.tsx');
ok('Central de dados: importar CLIENTES em lote passa pelo portão', dados.includes('usePortaoPro("importar_lote")') && dados.includes('tipo === "clientes" ? portaoLote.exigir('));

// 3. Tela de upgrade
const rp = ler('webapp/src/olli/recursoPlano.tsx');
ok('tela "Disponível no <plano>: <preço> por mês" com preço da fonte', rp.includes('Disponível no {nome}: {preco} por mês') && rp.includes('precoDoPlano(plano)'));
ok('assinar leva a Planos (Pix Automático em 1º lá)', rp.includes('navigate("/planos")'));
ok('indeterminado nunca libera nem rebaixa', /indeterminado[\s\S]{0,200}toast\.error/.test(rp));

// 4. Coerência landing + FAQ
const landing = [ler('web/src/pages/index.astro'), ler('web/src/pages/planos.astro'), ler('web/src/pages/para/[oficio].astro'), ler('src/content/ajuda/index.ts')].join('\n');
ok('landing/FAQ não prometem recibo/agenda/OS no Grátis', !/(rascunhos, (ordem de serviço, )?recibos|Grátis para começar: orçamento, ordem de serviço e recibo|Grátis da OLLI faz ordem de serviço|com orçamento, ordem de serviço, recibo, clientes|recibos, clientes, agenda e histórico)/.test(landing));
ok('landing/FAQ usam a frase da fonte', (landing.match(/recursosQueSairamDoGratis\(\)/g) ?? []).length >= 4);

console.log(falhas ? `\n${falhas} falha(s)` : '\nPASSOU');
process.exit(falhas ? 1 : 0);
