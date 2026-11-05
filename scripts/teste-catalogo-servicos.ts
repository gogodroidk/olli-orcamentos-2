/**
 * Tela de Serviços (D1438-G17) — regras puras e o encaixe nas três cascas.
 *
 *     node scripts/teste-catalogo-servicos.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O Igor pediu revisão sem detalhe. O que esta suíte trava é o óbvio que a
 * tela já fazia errado: busca que não acha "Instalação", filtro que mente
 * "catálogo vazio", prejuízo escrito como lucro, e exclusão que diz não
 * voltar sendo que vai para a lixeira.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  abaixoDoCusto,
  filtrarServicos,
  margemInfo,
  mensagemExcluirServico,
  seloMargem,
  textoListaServicos,
} from '../src/screens/desktop/servicoMargem.ts';

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

function ok(nome: string, cond: boolean): void {
  checar(nome, cond, true);
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

const catalogo = [
  { id: '1', nome: 'Instalação de ar-condicionado', descricao: 'Com garantia de 90 dias', preco: 200, custo: 50 },
  { id: '2', nome: 'Limpeza de split', descricao: null, preco: 80, custo: 100 },
  { id: '3', nome: 'Visita técnica', descricao: 'Deslocamento incluso', preco: 0, custo: 40 },
  { id: '4', nome: 'Orçamento no local', preco: 150 },
];

console.log('\n1) busca sem acento, hífen ou caixa');
checar('vazio devolve o catálogo inteiro', filtrarServicos(catalogo, '   ').map((s) => s.id), ['1', '2', '3', '4']);
checar('instalacao acha Instalação', filtrarServicos(catalogo, 'instalacao').map((s) => s.id), ['1']);
checar('ar condicionado acha ar-condicionado', filtrarServicos(catalogo, 'AR CONDICIONADO').map((s) => s.id), ['1']);
checar('garantia olha a descrição', filtrarServicos(catalogo, 'garantia').map((s) => s.id), ['1']);
checar('termo inexistente não devolve nada', filtrarServicos(catalogo, 'xyz').map((s) => s.id), []);

console.log('\n2) lista vazia ≠ busca sem resultado');
checar(
  'catálogo vazio',
  textoListaServicos(0, 0, ''),
  {
    estado: 'vazio',
    titulo: 'Nenhum serviço',
    subtitulo: 'Cadastre seus serviços para montar orçamentos em segundos.',
  },
);
checar(
  'filtro não achou, o catálogo continua lá',
  textoListaServicos(4, 0, 'xyz').estado,
  'sem-resultado',
);
checar('espaço em branco não é uma busca', textoListaServicos(4, 0, '   ').estado, 'vazio');
checar('com resultado não troca o título', textoListaServicos(4, 1, 'visita').estado, 'lista');
ok('o vazio de busca não manda cadastrar de novo', !textoListaServicos(4, 0, 'xyz').subtitulo.includes('Cadastre'));

console.log('\n3) margem: prejuízo não se chama lucro');
checar('200 sobre custo 50 é 75%', margemInfo(200, 50), { pct: 75, lucro: 150 });
checar('preço 0 não divide por zero', margemInfo(0, 40), null);
checar('sem custo a margem é desconhecida', margemInfo(150, undefined), null);
checar('custo 0 não vira 100% de lucro', margemInfo(150, 0), null);
ok('80 < 100 está abaixo do custo', abaixoDoCusto(80, 100));
ok('preço 0 com custo está abaixo do custo', abaixoDoCusto(0, 40));
ok('preço igual ao custo não é prejuízo', !abaixoDoCusto(100, 100));
checar('selo de lucro', seloMargem(200, 50), { tom: 'lucro', texto: 'lucro 75%' });
checar('selo de prejuízo usa o módulo', seloMargem(80, 100), { tom: 'prejuizo', texto: 'prejuízo 25%' });
checar('preço zerado com custo não inventa percentual', seloMargem(0, 40), { tom: 'prejuizo', texto: 'prejuízo' });
checar('sem custo não há selo', seloMargem(150, undefined), null);
ok('nenhum selo de prejuízo contém a palavra lucro', seloMargem(80, 100)?.texto.includes('lucro') !== true);

console.log('\n4) excluir vai para a lixeira — o texto não pode mentir');
const aviso = mensagemExcluirServico('Limpeza de split');
ok('cita o nome', aviso.includes('Limpeza de split'));
ok('diz lixeira', aviso.includes('lixeira'));
ok('diz que orçamento já feito não muda', aviso.includes('Orçamentos já feitos'));
ok('não diz que é irreversível', !aviso.includes('não pode ser desfeita'));
ok('nome vazio não fica aspas ocas', mensagemExcluirServico('   ').includes('(sem nome)'));

console.log('\n5) as três cascas usam a regra, e não o texto antigo');
const mobile = ler('src/screens/ServicosScreen.tsx');
const desktop = ler('src/screens/desktop/ServicosDesktopScreen.tsx');
const painel = ler('src/screens/desktop/PainelServico.tsx');
const web = ler('webapp/src/pages/olli/catalogo/ListaCatalogo.tsx');

ok('celular filtra pela função pura', mobile.includes('filtrarServicos'));
ok('celular relê a busca atual no foco', mobile.includes('queryRef.current'));
ok('celular não filtra só com toLowerCase', !mobile.includes('toLowerCase'));
ok('celular usa o selo de margem', mobile.includes('seloMargem'));
ok('celular distingue lista vazia', mobile.includes('textoListaServicos'));
ok('celular explica a lixeira', mobile.includes('mensagemExcluirServico'));
ok('unidade ativa usa onPrimary', mobile.includes('unidadeTextActive') && mobile.includes('onPrimary'));
ok('celular não promete exclusão irreversível', !mobile.includes('não pode ser desfeita'));

ok('desktop filtra pela função pura', desktop.includes('filtrarServicos'));
ok('desktop distingue lista vazia', desktop.includes('textoListaServicos'));
ok('desktop explica a lixeira', desktop.includes('mensagemExcluirServico'));
ok('desktop não promete exclusão irreversível', !desktop.includes('não pode ser desfeita'));
ok('desktop pinta prejuízo', desktop.includes('celulaPrejuizo'));

ok('painel explica a lixeira', painel.includes('mensagemExcluirServico'));
ok('painel avisa preço abaixo do custo', painel.includes('Preço abaixo do custo'));
ok('painel não promete exclusão irreversível', !painel.includes('não pode ser desfeita'));

ok('painel web não fala de marca na busca de serviço', web.includes('a busca olha nome e descrição'));
ok('painel web ainda fala de marca na busca de produto', web.includes('a busca olha nome, descrição, marca e modelo'));
ok('painel web marca preço zerado', web.includes('Preço zerado — entra de graça no orçamento'));

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
