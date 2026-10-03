/**
 * Teste da Mala da Véspera (Onda I4, jogada 7).
 *
 *     node scripts/teste-mala-vespera.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Roda `src/services/malaVespera.ts` (puro): peças do orçamento com quantidade e
 * origem, serviços como lembrete, kit usual do ofício por tipo de visita (sem
 * quantidade inventada), bitola só pelas faixas consolidadas, soma das peças
 * entre visitas e o "Sem dados para sugerir material desta visita".
 */
import { readFileSync } from 'node:fs';
import {
  bitolaUsual,
  btuDoTexto,
  deveMostrarMala,
  montarMala,
  textoMala,
  type VisitaMala,
} from '../src/services/malaVespera.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const joao: VisitaMala = {
  id: 'v1',
  clienteNome: 'João',
  inicio: '2026-10-02T13:00:00.000Z',
  tipo: 'instalacao',
  titulo: 'Instalação split',
  orcamentoNumero: '0123',
  itensOrcamento: [
    { tipo: 'servico', nome: 'Instalação split 12.000 BTUs', quantidade: 1, unidade: 'un' },
    { tipo: 'produto', nome: 'Suporte 400 mm', quantidade: 1, unidade: 'un' },
    { tipo: 'produto', nome: 'Tubo de cobre', quantidade: 3, unidade: 'm' },
  ],
};
const maria: VisitaMala = {
  id: 'v2',
  clienteNome: 'Maria',
  inicio: '2026-10-02T17:00:00.000Z',
  tipo: 'limpeza',
  titulo: 'Limpeza',
  itensOrcamento: [{ tipo: 'produto', nome: 'Tubo de  cobre', quantidade: 2, unidade: 'm' }],
};
const semNada: VisitaMala = { id: 'v3', clienteNome: 'Ana', inicio: '2026-10-02T19:00:00.000Z', tipo: 'outro', titulo: 'Ver vazamento' };

console.log('\n1) leitura de BTU e bitola');
checar('"12.000 BTUs" → 12000', btuDoTexto('Instalação split 12.000 BTUs'), 12000);
checar('"9000 btu" → 9000', btuDoTexto('Split 9000 btu'), 9000);
checar('"split 18k" → 18000', btuDoTexto('Split 18k inverter'), 18000);
checar('"12k" sem contexto de ar → null', btuDoTexto('Cabo 12k'), null);
checar('bitola 12k e 18k; 24k = confira o manual', [bitolaUsual(12000), bitolaUsual(18000), bitolaUsual(24000)],
  ['linhas de 1/4" e 3/8"', 'linhas de 1/4" e 1/2"', null]);

console.log('\n2) mala de ar-condicionado');
{
  const mala = montarMala([maria, joao, semNada], ['refrigeracao']);
  checar('grupos em ordem de horário', mala.grupos.map((g) => g.clienteNome), ['João', 'Maria', 'Ana']);
  const g1 = mala.grupos[0];
  checar('serviço vira lembrete, não item', g1.servicos, ['Instalação split 12.000 BTUs']);
  checar('peças do orçamento com quantidade e origem', g1.itens.filter((i) => i.fonte === 'orcamento').map((i) => [i.texto, i.origem]),
    [['1 un de Suporte 400 mm', 'orçamento 0123'], ['3 m de Tubo de cobre', 'orçamento 0123']]);
  checar('kit de instalação com gás citando a fonte', g1.itens.some((i) => i.id === 'kit:ref.gas' && /fabricantes/.test(i.detalhe ?? '')), true);
  checar('bitola pela capacidade do orçamento', g1.itens.some((i) => i.texto === 'Cobre em linhas de 1/4" e 3/8" (12 mil BTU)'), true);
  checar('kit é rotulado como sugestão do ofício', g1.itens.find((i) => i.fonte === 'oficio')?.origem, 'kit usual de ar-condicionado · instalação');
  checar('visita sem orçamento e sem regra = sem dados', [mala.grupos[2].semDados, mala.grupos[2].itens.length], [true, 0]);
  const cobre = mala.separar.find((i) => i.texto.includes('Tubo de cobre'));
  checar('peças iguais somadas entre visitas (nome normalizado)', [cobre?.texto, cobre?.origem], ['5 m de Tubo de cobre', 'para 2 clientes']);
  checar('kit sem repetir entre visitas', mala.separar.filter((i) => i.id === 'kit:ref.manometro').length, 1);
  const txt = textoMala(mala, 'sexta, 02/10', new Set(['kit:ref.gas']));
  checar('texto para compartilhar marca o que já separou e avisa o sem dados',
    [txt.startsWith('Mala para sexta, 02/10:'), txt.includes('[x] Gás'), txt.includes('(1 visita sem dados para sugerir material)')], [true, true, true]);
}

console.log('\n3) sem ofício: só o que o orçamento diz');
{
  const mala = montarMala([joao], undefined);
  checar('nenhum kit sem ofício', mala.separar.every((i) => i.fonte === 'orcamento'), true);
  const orc = montarMala([{ ...semNada, tipo: 'orcamento' }], ['pintura']);
  checar('visita de orçamento leva trena (vale p/ qualquer ofício)', orc.grupos[0].itens.map((i) => i.id), ['kit:orc.trena', 'kit:orc.celular']);
}

console.log('\n4) quando aparece');
{
  const visitas = 2;
  checar('18h59 não aparece', deveMostrarMala(new Date(2026, 9, 1, 18, 59), visitas), false);
  checar('19h aparece', deveMostrarMala(new Date(2026, 9, 1, 19, 0), visitas), true);
  checar('sem visita amanhã = silêncio', deveMostrarMala(new Date(2026, 9, 1, 20, 0), 0), false);
}

console.log('\n5) encaixes');
{
  const ler = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const card = ler('../src/components/hoje/MalaVesperaCard.tsx');
  checar('gate Pro (relatorio_dia) com 3 estados do plano', card.includes("useRecursoPlano('relatorio_dia')") && card.includes('CartaoRecursoPlano'), true);
  checar('erro de leitura vira aviso com tentar de novo', card.includes("estado === 'erro'") && card.includes('Tentar de novo'), true);
  checar('nada sai sozinho: só o Share do sistema', card.includes('Share.share') && !/fetch\(|wa\.me/.test(card), true);
  checar('Hoje liga a mala no escopo de quem vê', ler('../src/screens/HojeScreen.tsx').includes('<MalaVesperaCard'), true);
  checar('dados respeitam o escopo do técnico', ler('../src/services/malaVesperaDados.ts').includes('aplicarEscopo(doDia, escopo)'), true);
}

console.log(`\nteste-mala-vespera: ${passes} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
