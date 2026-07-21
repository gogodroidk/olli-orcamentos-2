/**
 * Teste do caminho de DENÚNCIA de conteúdo gerado por IA (política de
 * AI-Generated Content do Google Play).
 *
 *     node scripts/teste-denuncia-ia.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * POR QUE ESTE ARQUIVO EXISTE: este caminho já quebrou duas vezes, e as duas
 * por falta de asserção.
 *   (a) a primeira versão marcava "Obrigado, vamos revisar" ANTES de chamar o
 *       serviço e descartava o retorno — a regra da casa invertida: erro não
 *       virava vazio, virava SUCESSO, que é pior. Em campo (sem sinal) o
 *       prestador recebia a confirmação e a denúncia sumia;
 *   (b) três cópias da mesma máquina de 3 estados divergiram, e foi essa
 *       divergência que motivou extrair <SinalizarIA>. Nenhuma asserção
 *       prendia nada — a divergência foi descoberta por leitura.
 *
 * Igual a teste-planos-ios.ts, isto é asserção sobre o FONTE: não há RN aqui
 * para montar componente. Não é prova de runtime — é a rede que pega "alguém
 * mexeu e a regra não seguiu junto", que é literalmente o que aconteceu.
 */
import { readFileSync } from 'node:fs';

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

function ler(caminho: string): string {
  return readFileSync(new URL(caminho, import.meta.url), 'utf8');
}

/**
 * Tira comentários. Comentário NÃO é código, e aqui isso não é preciosismo:
 * este caminho é o mais comentado do app (a regra mora no comentário), então
 * quase toda busca por `'ok'`, `sem_sessao` ou `key={...}` casa primeiro com a
 * prosa que descreve a regra e o teste passa a atestar o comentário em vez do
 * código. Simplório de propósito (não é um parser): serve para os trechos
 * analisados aqui, que não têm `//` dentro de string nem regex literal.
 */
function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const sinalizarSrc = ler('../src/components/SinalizarIA.tsx');
// Só o CORPO do `sinalizar`, e sem comentários: o docblock do topo cita 'ok',
// 'erro' e o próprio `confirmar` em português, e tornaria metade das buscas
// abaixo verdadeira por acidente.
const corpoSinalizar = (() => {
  const inicio = sinalizarSrc.indexOf('const sinalizar = useCallback(async () => {');
  if (inicio < 0) return '';
  return semComentarios(sinalizarSrc.slice(inicio, sinalizarSrc.indexOf('\n  }, [', inicio)));
})();

console.log('\n1) as TRÊS superfícies generativas montam o MESMO componente');
// Denúncia em uma superfície de três não é conformidade, é a aparência dela.
// Cada tela precisa IMPORTAR e MONTAR — importar sem montar passa no tsc.
for (const [nome, caminho] of [
  ['OlliChatScreen (chat)', '../src/screens/OlliChatScreen.tsx'],
  ['DiagnosticoIAScreen (diagnóstico)', '../src/screens/DiagnosticoIAScreen.tsx'],
  ['OlliVozScreen (voz, modo conversa)', '../src/screens/OlliVozScreen.tsx'],
] as const) {
  const telaSrc = semComentarios(ler(caminho));
  checar(`${nome} importa SinalizarIA`, telaSrc.includes("import { SinalizarIA } from"), true);
  checar(`${nome} MONTA <SinalizarIA`, telaSrc.includes('<SinalizarIA'), true);
  // O aviso ao usuário é parte do contrato, não da UI: quem chamar o serviço
  // direto de uma tela envia sem ninguém ter confirmado nada.
  checar(`${nome} NÃO chama enviarDenunciaIA direto (só via o componente)`, telaSrc.includes('enviarDenunciaIA'), false);
}

console.log('\n2) o estado "ok" só pode vir de r === "ok" (nunca de sem_sessao, nunca de erro)');
checar('o corpo de `sinalizar` foi localizado', corpoSinalizar.length > 0, true);
checar('o veredito é o ternário sobre o retorno REAL', corpoSinalizar.includes("setEstado(r === 'ok' ? 'ok' : 'erro')"), true);
// `enviarDenunciaIA` devolve 'ok' | 'sem_sessao' | 'erro'. 'sem_sessao' é
// deslogado/sem Supabase: a linha NÃO entrou. Tratá-lo como sucesso é o mesmo
// buraco de (a), por outra porta.
checar("nenhum ramo trata 'sem_sessao' como sucesso", /sem_sessao[\s\S]{0,80}'ok'/.test(corpoSinalizar), false);
// A rejeição da Promise também não pode virar silêncio: vira 'erro'.
checar('a falha da chamada cai em erro (.catch => erro)', corpoSinalizar.includes(".catch(() => 'erro' as const)"), true);
// O componente só tem UM caminho para o 'ok', e ele é o ternário acima.
checar(
  "só existe UMA atribuição de 'ok' no corpo",
  (corpoSinalizar.match(/'ok'/g) ?? []).length,
  2, // `r === 'ok'` e o ramo verdadeiro do mesmo ternário
);

console.log('\n3) NÃO existe setEstado("ok") antes do await do envio (a regressão que este caminho já teve)');
const iEnvio = corpoSinalizar.indexOf('await enviarDenunciaIA(');
const iVeredito = corpoSinalizar.indexOf("setEstado(r === 'ok'");
checar('o envio é aguardado (await)', iEnvio >= 0, true);
checar('o veredito vem DEPOIS do envio', iEnvio < iVeredito, true);
// A forma exata do bug antigo: um `setEstado('ok')` literal, sem olhar retorno.
checar("não existe setEstado('ok') literal em lugar nenhum do arquivo", sinalizarSrc.includes("setEstado('ok')"), false);
// Antes do envio só pode existir o 'enviando'.
checar(
  "o único setEstado antes do envio é 'enviando'",
  corpoSinalizar.slice(0, iEnvio).match(/setEstado\([^)]*\)/g) ?? [],
  ["setEstado('enviando'"].map(s => s + ')'),
);

console.log('\n4) o envio passa pela confirmação do usuário — não há insert sem o "sim"');
const iConfirmar = corpoSinalizar.indexOf('await confirmar(');
checar('`confirmar` é aguardado antes de qualquer envio', iConfirmar >= 0 && iConfirmar < iEnvio, true);
checar('e o "não" faz o caminho parar ali', corpoSinalizar.includes('if (!querEnviar) return;'), true);
// O texto do aviso precisa dizer o que sai do aparelho — resposta de IA em app
// de orçamento carrega nome/endereço/preço de cliente o tempo todo.
checar('o aviso diz que o texto vai para a equipe', sinalizarSrc.includes('vão para a nossa equipe revisar'), true);
checar('o aviso avisa sobre dado de cliente no texto', sinalizarSrc.includes('nome, endereço ou preço de cliente'), true);
// Toque duplo: durante o `await confirmar(...)` o estado ainda é 'idle', então
// estado de React não trava nada. A trava precisa ser um ref setado ANTES do
// await, senão dois toques viram DUAS linhas no banco.
const iRef = corpoSinalizar.indexOf('emCursoRef.current = true;');
checar('existe trava de toque duplo por ref', iRef >= 0, true);
// Marcar o ref sem LER o ref é uma trava que não tranca nada.
const iGuarda = corpoSinalizar.indexOf('if (emCursoRef.current) return;');
checar('o segundo toque bate numa guarda que lê o ref', iGuarda >= 0, true);
checar('a guarda vem antes de marcar o ref', iGuarda >= 0 && iGuarda < iRef, true);
checar('e ela é setada ANTES do await da confirmação', iRef >= 0 && iRef < iConfirmar, true);
checar('a trava é liberada no finally (senão o "tentar de novo" morre)', corpoSinalizar.includes('emCursoRef.current = false;'), true);

console.log('\n5) tipo do produto é "denuncia" e o mapeamento para a coluna do banco existe');
const feedbackSrc = ler('../src/services/feedback.ts');
checar("'denuncia' é um TipoFeedback", /export type TipoFeedback =[^;]*'denuncia'/.test(feedbackSrc), true);
checar('enviarDenunciaIA envia com o tipo do produto', feedbackSrc.includes("enviarFeedback('denuncia'"), true);
// O tipo real do produto viaja em `contexto.origem`, DEPOIS do spread, para o
// chamador não conseguir sobrescrever — é por ele que o /admin separa.
checar('`origem` vem depois do spread do contexto', feedbackSrc.includes('...contexto, origem: tipo'), true);
// A coluna `tipo` tem CHECK constraint e mexer nela é passo humano. O mapa
// produto->banco é o único lugar que conhece o CHECK: se ele apontar para um
// valor que a constraint não aceita, TODA denúncia falha calada em produção.
const valoresDoCheck = (() => {
  const sql = ler('../supabase/migrations/20260717_feedback_inbox.sql');
  const m = sql.match(/check \(tipo in \(([^)]*)\)\)/);
  return m ? m[1].split(',').map(s => s.trim().replace(/'/g, '')) : [];
})();
checar('o CHECK da coluna `tipo` foi lido da migration', valoresDoCheck.length > 0, true);
checar("o CHECK NÃO aceita 'denuncia' (é por isso que existe mapeamento)", valoresDoCheck.includes('denuncia'), false);
const tipoNoBanco = (() => {
  const m = feedbackSrc.match(/\n\s*denuncia:\s*'([a-z_]+)',/);
  return m ? m[1] : null;
})();
checar('existe mapeamento `denuncia: <coluna>` em TIPO_NO_BANCO', tipoNoBanco !== null, true);
checar(
  `o valor mapeado ("${tipoNoBanco}") é aceito pelo CHECK constraint`,
  tipoNoBanco !== null && valoresDoCheck.includes(tipoNoBanco),
  true,
);

console.log('\n6) o "Obrigado" de um conteúdo não pode grudar no conteúdo seguinte');
// A tela de diagnóstico REUSA o mesmo lugar da árvore a cada consulta. A key
// precisa mudar por CHAMADA: `key={textoGerado}` não remonta quando a consulta
// nova devolve texto idêntico (cache) — e quem repete a consulta é justamente
// quem já viu o resultado.
const diagSrc = semComentarios(ler('../src/screens/DiagnosticoIAScreen.tsx'));
checar('o <SinalizarIA> do diagnóstico tem key por chamada', diagSrc.includes('key={idDaConsulta}'), true);
checar('e NÃO a key pelo conteúdo (que não remonta em cache hit)', diagSrc.includes('key={textoGerado}'), false);
checar('o contador é incrementado a cada consulta', diagSrc.includes('setIdDaConsulta(n => n + 1)'), true);
// O par (resposta + pedido) é o que torna a denúncia moderável — sem o pedido,
// quem modera recebe uma resposta ofensiva sem a pergunta que a provocou.
for (const [nome, caminho, campo] of [
  ['OlliChatScreen', '../src/screens/OlliChatScreen.tsx', 'pedido={pedido ?? \'\'}'],
  ['DiagnosticoIAScreen', '../src/screens/DiagnosticoIAScreen.tsx', 'pedido={pedidoDoResultado}'],
  ['OlliVozScreen', '../src/screens/OlliVozScreen.tsx', 'pedido={pedido ?? \'\'}'],
] as const) {
  checar(`${nome} manda o pedido junto da resposta`, ler(caminho).includes(campo), true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
