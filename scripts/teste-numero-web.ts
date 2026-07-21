/**
 * PARIDADE PAINEL ↔ APP no documento que vai para o cliente.
 *
 *     node scripts/teste-numero-web.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O mesmo orçamento é aberto no celular e no painel. Toda regra duplicada entre os
 * dois lados é um lugar onde eles podem passar a discordar sem ninguém perceber —
 * e o resultado não é um erro na tela, é um DOCUMENTO ERRADO na mão do cliente.
 * Este arquivo tranca as três que existem hoje:
 *
 *  1–6. QUANTIDADE E DESCONTO (DoD do item O3-25: "digitar 2.5 permanece 2.5").
 *       O bug original ("2.5" virar 25) não dava erro nenhum: emitia um documento
 *       com o valor 10x errado, calado, com cara de certo.
 *  7.   NUMERAÇÃO (`extrairSequencia`). Se um lado enxergar um sequencial menor
 *       que o outro num número torto, ele reemite um número que o outro já deu por
 *       usado — dois documentos diferentes com o mesmo "00126" no PDF.
 *  8.   TRAVA DE EDIÇÃO (`edicaoBloqueada`). Se um lado deixar editar o que o
 *       outro congela, o mesmo documento tem duas regras conforme onde foi aberto.
 *
 * As seções 7 e 8 leem o CÓDIGO-FONTE dos dois lados, como a seção 5 de
 * `teste-backup-equipe.ts`: `src/database/database.ts` importa expo-sqlite e as
 * telas são TSX, nada disso carrega no node. Não é prova de execução — é a rede
 * que pega o "alguém mexeu num lado só e os testes continuaram verdes".
 */
import { readdirSync, readFileSync } from 'node:fs';
import { qtdParaTexto, textoParaNumero } from '../webapp/src/olli/numero.ts';

const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  if (Object.is(real, esperado)) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${String(esperado)}\n        recebido: ${String(real)}`);
  }
}

console.log('\n1) O BUG DO DoD: o ponto do teclado numérico é DECIMAL');
checar('"2.5" => 2.5 (NÃO 25)', textoParaNumero('2.5'), 2.5);
checar('"0.5" => 0.5', textoParaNumero('0.5'), 0.5);
checar('"10.25" => 10.25', textoParaNumero('10.25'), 10.25);

console.log('\n2) pt-BR de verdade: a vírgula é o decimal e o ponto é milhar');
checar('"2,5" => 2.5', textoParaNumero('2,5'), 2.5);
checar('"1.234,56" => 1234.56', textoParaNumero('1.234,56'), 1234.56);
checar('"1.234.567,89" => 1234567.89', textoParaNumero('1.234.567,89'), 1234567.89);

console.log('\n3) inteiros e milhar sem vírgula');
checar('"1234" => 1234', textoParaNumero('1234'), 1234);
checar('"1.234.567" (2+ pontos, sem vírgula) => 1234567', textoParaNumero('1.234.567'), 1234567);

console.log('\n4) entrada ilegível vira NaN — quem chama decide (nunca vira 0 calado)');
checar('"" => NaN', Number.isNaN(textoParaNumero('')), true);
checar('"abc" => NaN', Number.isNaN(textoParaNumero('abc')), true);

console.log('\n5) ida e volta: o que a tela mostra volta no mesmo número');
for (const n of [2.5, 0.5, 1, 1234, 10.25]) {
  checar(`${n} -> "${qtdParaTexto(n)}" -> ${n}`, textoParaNumero(qtdParaTexto(n)), n);
}

console.log('\n6) o dano que o bug causava, medido');
// Antes: replace(/\./g,"") em "2.5" => "25". Uma diária de 2,5h vira 25h no PDF.
const antesBugado = Number('2.5'.replace(/\./g, '').replace(',', '.'));
checar('a regressão daria 25', antesBugado, 25);
checar('e hoje dá 2.5', textoParaNumero('2.5'), 2.5);
checar('ou seja: 10x de erro no documento do cliente', antesBugado / textoParaNumero('2.5'), 10);

console.log('\n7) NUMERAÇÃO: `extrairSequencia` é o MESMO código nos dois lados');
const dbSrc = ler('../src/database/database.ts');
const mutSrc = ler('../webapp/src/olli/mutacoes.ts');

/** Corpo de `extrairSequencia` (entre a `{` da assinatura e o `}` da coluna 0). */
function corpoExtrairSequencia(src: string, arquivo: string): string {
  const assinatura = 'function extrairSequencia(numero: unknown): number {';
  const i = src.indexOf(assinatura);
  checar(`${arquivo} tem extrairSequencia`, i >= 0, true);
  if (i < 0) return '';
  const inicio = i + assinatura.length;
  const fim = src.indexOf('\n}', inicio);
  checar(`${arquivo}: corpo delimitado`, fim > inicio, true);
  return src.slice(inicio, fim);
}
// Tabs vs espaços e aspas simples vs duplas são diferença de formatador (o painel
// usa tab + aspas duplas, o app espaço + aspas simples). O que NÃO pode divergir é
// a lógica — então comparamos depois de normalizar só isso.
const normalizar = (s: string) => s.replace(/["']/g, '"').replace(/\s+/g, ' ').trim();
const corpoApp = corpoExtrairSequencia(dbSrc, 'database.ts');
const corpoPainel = corpoExtrairSequencia(mutSrc, 'mutacoes.ts');
checar('app e painel têm corpo IDÊNTICO (a menos de formatação)', normalizar(corpoApp), normalizar(corpoPainel));

// E o COMPORTAMENTO, executando os corpos REAIS extraídos do fonte — não uma cópia
// escrita aqui, que envelheceria sozinha. Rodamos OS DOIS, não só o do app: a
// comparação de texto acima passa pelo `normalizar`, e o que o `normalizar` perdoa
// ele também ESCONDE. Executando os dois, a divergência aparece com a ENTRADA que a
// causou, em vez de dois corpos inteiros para o leitor diferenciar no olho.
const seqApp = new Function('numero', corpoApp) as (n: unknown) => number;
const seqPainel = new Function('numero', corpoPainel) as (n: unknown) => number;

// Os números TORTOS são o motivo do teste: é aqui que dois parsers discordam.
const CASOS: ReadonlyArray<readonly [string, unknown, number]> = [
  ['"00126" => 1 (sequencial 1 + ano 26)', '00126', 1],
  ['"REC-00126" => 1 (recibo usa a mesma série)', 'REC-00126', 1],
  ['"04226" => 42', '04226', 42],
  ['"00126 " (espaço no fim) => 1, não 0', '00126 ', 1],
  ['"X00126" (prefixo estranho) => 1, não 0', 'X00126', 1],
  ['"00126.5" (lixo depois do ano) => 0 — a cauda deixa de ser dígito', '00126.5', 0],
  ['ausente => 0 (nunca NaN, que viraria número inválido)', null, 0],
  ['"" => 0', '', 0],
  ['"abc" => 0', 'abc', 0],
];
for (const [nome, entrada, esperado] of CASOS) {
  checar(`app: ${nome}`, seqApp(entrada), esperado);
  // A PARIDADE é a asserção que importa mais que o valor: se um dia o formato mudar,
  // o esperado acima muda junto — mas os dois lados continuam OBRIGADOS a responder
  // a mesma coisa. Divergir aqui = os dois emitem sequenciais diferentes para o
  // mesmo ponto, que é exatamente a colisão que esta frente existe para fechar.
  checar(`painel concorda em ${JSON.stringify(entrada)}`, seqPainel(entrada), seqApp(entrada));
}

console.log('\n8) TRAVA DE EDIÇÃO: documento que o cliente já tem não abre para editar');
// (a) A regra em si, nos dois lados. O painel lista os status na mão; o app compõe
//     por `acordoAceito`. Aqui exigimos que as duas somas deem no mesmo conjunto.
const formSrc = ler('../webapp/src/pages/olli/orcamentos/FormOrcamento.tsx');
checar(
  'app: edicaoBloqueada = propostaJaEnviada + acordoAceito',
  /export function edicaoBloqueada\([^)]*\): boolean \{\s*return propostaJaEnviada\(status\) \|\| acordoAceito\(status\);/.test(dbSrc),
  true,
);
checar(
  'app: acordoAceito = aprovado + convertido',
  /export function acordoAceito\([^)]*\): boolean \{\s*return status === 'aprovado' \|\| status === 'convertido';/.test(dbSrc),
  true,
);
checar(
  'painel: edicaoBloqueada = propostaJaEnviada + aprovado + convertido (mesmo conjunto)',
  /export function edicaoBloqueada\([^)]*\): boolean \{\s*return propostaJaEnviada\(status\) \|\| status === "aprovado" \|\| status === "convertido";/.test(formSrc),
  true,
);

// (b) A regra só vale se estiver LIGADA. Cada tela que leva ao editor precisa
//     esconder "Editar" — um botão que abre a tela para recusar no fim é pior que
//     botão ausente: o usuário digita tudo e perde no "Salvar".
for (const [nome, caminho] of [
  ['OrcamentosScreen (lista mobile)', '../src/screens/OrcamentosScreen.tsx'],
  ['VisualizarOrcamentoScreen (detalhe)', '../src/screens/VisualizarOrcamentoScreen.tsx'],
  ['OrcamentosDesktopScreen (tabela desktop)', '../src/screens/desktop/OrcamentosDesktopScreen.tsx'],
] as const) {
  checar(`${nome} esconde "Editar" com !edicaoBloqueada(`, ler(caminho).includes('!edicaoBloqueada('), true);
}

// (c) A guarda do PRÓPRIO editor. É a única que cobre quem não passa por tela
//     nenhuma: o deep link `orcamentos/:id/editar` abre o editor direto pela URL.
const novoSrc = ler('../src/screens/NovoOrcamentoScreen.tsx');
checar('o deep link de edição existe (é o caminho sem tela)', ler('../src/navigation/linking.ts').includes("orcamentos/:orcamentoId/editar"), true);
checar('NovoOrcamentoScreen consulta edicaoBloqueada', novoSrc.includes('edicaoBloqueada('), true);
checar(
  'e a consulta vem ANTES de montar o formulário (recusa na porta, não no Salvar)',
  novoSrc.indexOf('edicaoBloqueada(') < novoSrc.indexOf('async function handleSave'),
  true,
);

// (d) A recusa PERMANENTE não pode ser tratada como falha transitória: "tente
//     novamente em instantes" num caminho que nunca abre é o usuário repetindo
//     para sempre e perdendo o que digitou.
checar('saveOrcamento sinaliza a recusa com codigo ORCAMENTO_ACEITO', dbSrc.includes("codigo = 'ORCAMENTO_ACEITO'"), true);
checar('NovoOrcamentoScreen distingue essa recusa', novoSrc.includes("'ORCAMENTO_ACEITO'"), true);
checar('e o catch do save não é mais cego (`catch {`)', /\} catch \{\s*\n\s*avisar\('Não foi possível salvar'/.test(novoSrc), false);

// (e) A trava mora ANTES da escrita. Depois do INSERT ela não trava nada.
const saveInicio = dbSrc.indexOf('export async function saveOrcamento(');
const saveCorpo = dbSrc.slice(saveInicio, dbSrc.indexOf('\n}', saveInicio));
checar('saveOrcamento existe', saveInicio >= 0, true);
// A PRESENÇA vem antes da ORDEM, e não é detalhe: `indexOf` devolve -1 para o que
// não existe, e -1 é MENOR que qualquer índice. Só comparar posições daria verde
// para o pior caso possível — a recusa APAGADA do código. É o "não sei" virando
// "está tudo certo" dentro do próprio teste.
checar('saveOrcamento recusa o orçamento aceito', saveCorpo.includes('throw new OrcamentoAceitoError'), true);
checar('saveOrcamento grava com INSERT OR REPLACE', saveCorpo.includes('INSERT OR REPLACE'), true);
checar(
  'e a recusa vem ANTES da gravação (depois do INSERT não trava nada)',
  saveCorpo.indexOf('throw new OrcamentoAceitoError') < saveCorpo.indexOf('INSERT OR REPLACE'),
  true,
);

// (f) A migration que arbitra a colisão real (dois aparelhos, um offline) é um
//     arquivo NÃO APLICADO — some num `rm` distraído e ninguém nota. Aqui ela vira
//     falha de teste, com o pré-requisito junto. E a proteção é ESTRUTURAL, não só
//     o comentário no cabeçalho: a extensão `.sql.pendente` tira o arquivo do glob
//     `migrations/*.sql`, porque um "aplica tudo que é novo" não lê comentário —
//     aplicaria o índice sem o tratamento do 23505 no push e o documento de quem
//     perdesse a corrida pararia de subir, calado, para sempre.
const migracao = ler('../supabase/migrations/20260727_numero_unico_por_tenant.sql.pendente');
checar('migration do número único continua no repo', migracao.length > 0, true);
checar(
  'e NÃO voltou a ser `.sql` solto em migrations/ (reativar é decisão, não descuido)',
  readdirSync(new URL('../supabase/migrations/', import.meta.url)).some(
    (f) => f.endsWith('.sql') && f.includes('numero_unico_por_tenant'),
  ),
  false,
);
checar('com o índice de orcamentos por tenant', migracao.includes('orcamentos_numero_por_tenant_uidx'), true);
checar('e o de recibos', migracao.includes('recibos_numero_por_tenant_uidx'), true);
checar('grão (user_id, numero) — numeração é do prestador, não global', migracao.includes('(user_id, numero)'), true);
checar(
  'e o aviso de NÃO APLICAR sem tratar o 23505 no push (senão o documento some calado)',
  migracao.includes('NÃO APLIQUE') && migracao.includes('23505'),
  true,
);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
