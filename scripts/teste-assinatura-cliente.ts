/**
 * Teste da ASSINATURA DO CLIENTE colhida no aparelho (o gesto que fecha o
 * serviço em campo: acabou, o cliente assina com o dedo, o PDF sai assinado).
 *
 *     node scripts/teste-assinatura-cliente.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * POR QUE ESTE ARQUIVO EXISTE: o buraco que ele fecha era exatamente uma ponta
 * solta entre duas metades certas — `pdfGenerator` já sabia imprimir
 * `assinaturaClienteUri`, o tipo já tinha o campo, e NENHUMA TELA colhia. Ligar
 * as pontas cria três formas novas de mentir, e são elas que este teste tranca:
 *   (a) a tela marcar "assinado" sem ter gravado (a falha virando SUCESSO, que é
 *       a variante pior da regra da casa e já aconteceu em outro caminho — ver
 *       teste-denuncia-ia.ts);
 *   (b) gravar num campo NOVO e deixar o PDF lendo o antigo: o app diria
 *       "assinado", o documento sairia em branco e ninguém saberia;
 *   (c) a cópia sugerir valor jurídico que um desenho em tela não tem.
 *
 * Metade das asserções é sobre o FONTE (não há RN aqui para montar tela) e
 * metade é EXECUÇÃO de verdade: `rasterizarAssinatura` é módulo puro, então o
 * peso em KB e o PNG que sai são medidos, não descritos.
 */
import { readFileSync } from 'node:fs';
import { rasterizarAssinatura, desenharAlfa, LARGURA_MAX_PX, ALTURA_MAX_PX, ESCALA_MAX } from '../src/components/assinatura/rasterizarAssinatura.ts';

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
 * Tira comentários — pelo MESMO motivo de teste-denuncia-ia.ts, e aqui com mais
 * força ainda: os comentários deste caminho citam nominalmente
 * `assinaturaClienteUri`, `solicitarAssinaturaCliente` e `saveOrcamento` ao
 * explicar a regra. Sem isto, metade das buscas abaixo casaria com a PROSA que
 * descreve o código e o teste passaria a atestar comentário.
 */
function semComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const CAMINHO_TELA = '../src/screens/VisualizarOrcamentoScreen.tsx';
const CAMINHO_MODAL = '../src/components/assinatura/AssinaturaClienteModal.tsx';
const CAMINHO_RASTER = '../src/components/assinatura/rasterizarAssinatura.ts';
const CAMINHO_PDF = '../src/utils/pdfGenerator.ts';

const telaBruta = ler(CAMINHO_TELA);
const tela = semComentarios(telaBruta);
const modalBruto = ler(CAMINHO_MODAL);
const modal = semComentarios(modalBruto);
const rasterBruto = ler(CAMINHO_RASTER);
const pdfBruto = ler(CAMINHO_PDF);
const pdf = semComentarios(pdfBruto);
const tipos = semComentarios(ler('../src/types/index.ts'));

/** Corpo de uma função nomeada, sem comentários (busca por chave de fechamento
 *  na mesma indentação — simplório de propósito, serve aos trechos daqui). */
function corpoDe(src: string, assinatura: string, fim: string): string {
  const i = src.indexOf(assinatura);
  if (i < 0) return '';
  const f = src.indexOf(fim, i);
  return f < 0 ? src.slice(i) : src.slice(i, f);
}

console.log('\n1) a captura EXISTE e está no fluxo (era isto que faltava: só o PDF sabia da assinatura)');
checar('a tela importa o modal de assinatura', tela.includes("import { AssinaturaClienteModal } from '../components/assinatura/AssinaturaClienteModal'"), true);
// Importar sem montar passa no tsc e não colhe assinatura nenhuma.
checar('e MONTA <AssinaturaClienteModal', tela.includes('<AssinaturaClienteModal'), true);
checar('ligado à função que grava (aoConfirmar)', tela.includes('aoConfirmar={gravarAssinaturaCliente}'), true);
// Sem um botão visível, a captura nasce escondida — que é o problema de origem.
checar('há um gesto visível que abre o pad', tela.includes('setAssinaturaAberta(true)'), true);
// OFFLINE é a essência do caso de uso (o prestador está na casa do cliente).
for (const [nome, src] of [['o modal', modal], ['o rasterizador', semComentarios(rasterBruto)]] as const) {
  checar(`${nome} não faz rede (sem fetch)`, /\bfetch\s*\(/.test(src), false);
  checar(`${nome} não fala com o supabase`, src.includes('supabase'), false);
}

console.log('\n2) a tela grava NO CAMPO QUE O PDF LÊ (não num campo novo paralelo)');
const gravar = corpoDe(tela, 'async function gravarAssinaturaCliente(', '\n  function fecharAssinatura');
checar('o corpo de `gravarAssinaturaCliente` foi localizado', gravar.length > 0, true);
checar('grava a imagem em `assinaturaClienteUri`', gravar.includes('assinaturaClienteUri: dataUri'), true);
checar('grava o carimbo em `dataAssinaturaCliente`', gravar.includes('dataAssinaturaCliente: assinadoEmISO'), true);
checar('e persiste de verdade (saveOrcamento)', gravar.includes('await saveOrcamento(atualizado)'), true);
// Os dois campos são os do TIPO — se alguém renomear lá, isto quebra aqui em vez
// de o app começar a gravar um campo que o PDF não lê.
checar('`assinaturaClienteUri` é campo do tipo Orcamento', tipos.includes('assinaturaClienteUri?: string;'), true);
checar('`dataAssinaturaCliente` é campo do tipo Orcamento', tipos.includes('dataAssinaturaCliente?: string;'), true);
// A data é a do ACEITE (gerada no confirmar), não a de quando a tela abriu.
checar('o carimbo nasce no confirmar do modal', modal.includes('await aoConfirmar(imagem.dataUri, new Date().toISOString())'), true);

console.log('\n3) NÃO existe caminho que marque "assinado" sem ter gravado');
const iSave = gravar.indexOf('await saveOrcamento(atualizado)');
const iRefletir = gravar.indexOf('setOrc(atualizado)');
checar('a tela só reflete DEPOIS do save', iSave >= 0 && iRefletir > iSave, true);
checar('e reflete uma única vez', (gravar.match(/setOrc\(atualizado\)/g) ?? []).length, 1);
// A falha do save tem que SUBIR: é a rejeição que segura o pad aberto com o
// desenho. Engolir aqui = pad fecha, tela não mostra nada, cliente assinou à toa.
checar('a falha do save é relançada (throw e)', /catch \(e\) \{\s*setAssinaturaFalhou\(true\);\s*throw e;\s*\}/.test(gravar), true);
checar('nenhum ramo engole a falha com catch vazio', /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(gravar), false);
// O "assinado" da tela é lido do campo PERSISTIDO, não de um booleano de UI que
// alguém possa setar antes da hora.
checar('o estado visual vem do campo gravado', tela.includes('const assinaturaDoCliente = orc?.assinaturaClienteUri;'), true);
checar('não existe um `useState` de "assinado" paralelo', /useState[^\n]*[aA]ssinad[oa]/.test(tela), false);
// Terceiro estado explícito: falhou ao salvar ≠ nunca assinou.
checar('existe estado próprio para "falhou ao salvar"', tela.includes('const [assinaturaFalhou, setAssinaturaFalhou] = useState(false)'), true);
checar('e ele é mostrado na tela', tela.includes('{assinaturaFalhou && ('), true);
checar('o sucesso limpa a marca de falha', gravar.includes('setAssinaturaFalhou(false)'), true);

// Do lado do modal: mesma regra, outra ponta.
const confirmar = corpoDe(modal, 'async function confirmar()', '\n  const salvando');
checar('o corpo de `confirmar` foi localizado', confirmar.length > 0, true);
const iRaster = confirmar.indexOf('await rasterizarAssinatura(');
const iEntrega = confirmar.indexOf('await aoConfirmar(');
checar('a imagem é gerada antes de entregar para gravar', iRaster >= 0 && iRaster < iEntrega, true);
// 'vazio'/'falha' do rasterizador NÃO podem seguir para a gravação.
checar('resultado não-ok interrompe antes de gravar', confirmar.indexOf('if (!imagem.ok)') < iEntrega, true);
checar('e o ramo não-ok termina em erro, não em sucesso', /if \(!imagem\.ok\) \{[\s\S]*?setEstado\('erro'\);\s*return;/.test(confirmar), true);
// O desenho é a ÚNICA cópia da assinatura do cliente até o save resolver.
const iLimpaDesenho = confirmar.indexOf('aplicar([])');
checar('o desenho só é apagado DEPOIS de gravar', iEntrega >= 0 && iLimpaDesenho > iEntrega, true);
checar('a falha da gravação vira estado de erro no pad', /catch \(e: unknown\) \{[\s\S]*?setEstado\('erro'\);/.test(confirmar), true);
checar('e o pad NÃO se fecha sozinho no erro', /setEstado\('erro'\)[\s\S]{0,120}aoCancelar\(\)/.test(confirmar), false);
// Quem fecha o pad no sucesso é a tela, e só depois do save.
checar('quem fecha o pad após gravar é a tela', gravar.includes('fecharAssinatura()'), true);
checar('e o fechamento no sucesso vem depois do save', gravar.indexOf('fecharAssinatura()') > iSave, true);

console.log('\n4) o PDF só mostra a assinatura quando ela EXISTE');
const blocoAssinaturas = (() => {
  const i = pdf.indexOf('<div class="signatures">');
  return i < 0 ? '' : pdf.slice(i, pdf.indexOf('<!-- FOOTER', i));
})();
checar('o bloco de assinaturas do PDF foi localizado', blocoAssinaturas.length > 0, true);
checar('a imagem do cliente é condicionada à existência dela', blocoAssinaturas.includes('${img(o.assinaturaClienteUri) ? `<img src="${img(o.assinaturaClienteUri)}" class="sign-img" />` : \'\'}'), true);
// Sem assinatura, sai a linha em branco de sempre — nunca um <img> vazio (que
// no PDF vira o ícone de imagem quebrada em cima da linha de assinatura).
checar('não existe <img> do cliente fora da condicional', (blocoAssinaturas.match(/img\(o\.assinaturaClienteUri\)/g) ?? []).length, 2);
checar('o bloco inteiro segue sob `exibirAssinatura`', pdf.includes('${o.exibirAssinatura ? `'), true);
// A data impressa é condicional: sem carimbo, a legenda volta a ser o rótulo da
// linha em branco. Imprimir "Assinado em " vazio seria pior que não imprimir.
checar('a legenda com a data é condicionada ao carimbo', blocoAssinaturas.includes('${o.dataAssinaturaCliente'), true);
checar('e cai no rótulo antigo quando não há carimbo', blocoAssinaturas.includes("'Aprovação do cliente · data'"), true);
// XSS: houve um conserto aqui (todo data URI vai para dentro de src="..."), e
// esta mudança passa por cima do MESMO ponto. `img()` tem que continuar escapando.
checar('img() continua escapando o data URI (conserto de XSS intacto)', pdf.includes('return escapeHtml(IMG_CACHE[uri] || (uri.startsWith(\'data:\') ? uri : \'\'));'), true);
checar('a data impressa também é escapada', blocoAssinaturas.includes('escapeHtml(formatDateTime(o.dataAssinaturaCliente))'), true);

console.log('\n5) a imagem: PNG de verdade, pequeno, e os 3 estados do rasterizador (EXECUÇÃO)');
/** Rabisco sintético parecido com uma assinatura: 4 traços, ida e volta. */
function rabisco(escala = 1, densidade = 1): { x: number; y: number }[][] {
  const tracos: { x: number; y: number }[][] = [];
  const n = Math.round(600 * densidade);
  let traco: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 10;
    traco.push({ x: (20 + i * (330 / n)) * escala, y: (90 + Math.sin(a) * 38 + Math.sin(a * 2.7) * 14) * escala });
    if (i > 0 && i % Math.round(n / 4) === 0) { tracos.push(traco); traco = []; }
  }
  tracos.push(traco);
  return tracos;
}

const normal = await rasterizarAssinatura(rabisco());
checar('assinatura normal rasteriza', normal.ok, true);
if (normal.ok) {
  checar('sai como data URI de PNG', normal.dataUri.startsWith('data:image/png;base64,'), true);
  // Alfabeto base64 puro: é o que torna o escapeHtml do PDF um no-op e impede
  // que a imagem feche o atributo src="..." e injete HTML.
  checar('o payload é base64 puro (nada de < > & " \')', /^[A-Za-z0-9+/=]+$/.test(normal.dataUri.slice('data:image/png;base64,'.length)), true);
  checar('respeita o teto de largura', normal.larguraPx <= LARGURA_MAX_PX, true);
  checar('respeita o teto de altura', normal.alturaPx <= ALTURA_MAX_PX, true);
  // O TETO DE PESO é o ponto: este data URI entra no blob JSON do orçamento
  // (SQLite + sync + PDF). Uma foto de assinatura passaria de 300 KB.
  const kb = normal.dataUri.length / 1024;
  checar(`o data URI cabe em 40 KB (medido: ${kb.toFixed(1)} KB)`, kb < 40, true);
  console.log(`       → ${normal.larguraPx}x${normal.alturaPx}px · PNG ${(normal.bytes / 1024).toFixed(1)} KB · data URI ${kb.toFixed(1)} KB`);
  // Round-trip: o PNG precisa DECODIFICAR. Bytes que ninguém consegue ler seriam
  // uma assinatura gravada que nenhum leitor de PDF desenha.
  const { decode } = await import('fast-png');
  const volta = decode(Uint8Array.from(atob(normal.dataUri.slice('data:image/png;base64,'.length)), c => c.charCodeAt(0)));
  checar('o PNG decodifica de volta na mesma largura', volta.width, normal.larguraPx);
  checar('e na mesma altura', volta.height, normal.alturaPx);
  // 2 canais = cinza + alfa: fundo TRANSPARENTE (a assinatura pousa sobre a
  // linha do PDF) e metade dos bytes crus de um RGBA.
  checar('tem canal alfa (fundo transparente, não retângulo branco)', volta.channels, 2);
  const opacos = (() => { let n = 0; for (let i = 1; i < volta.data.length; i += 2) if (volta.data[i] > 0) n++; return n; })();
  checar('e tem tinta de fato (pixels opacos > 0)', opacos > 0, true);
  checar('a maior parte da imagem continua transparente', opacos < volta.width * volta.height * 0.5, true);
}

// Os 3 estados. 'vazio' (ninguém desenhou) NUNCA pode ser confundido com 'falha'
// nem, muito menos, com sucesso.
checar('sem traço nenhum → vazio', await rasterizarAssinatura([]).then(r => r.ok ? 'ok' : r.motivo), 'vazio');
checar('traço sem pontos → vazio', await rasterizarAssinatura([[]]).then(r => r.ok ? 'ok' : r.motivo), 'vazio');
checar('pontos inválidos (NaN) → vazio, não uma imagem em branco', await rasterizarAssinatura([[{ x: NaN, y: 0 }]]).then(r => r.ok ? 'ok' : r.motivo), 'vazio');
// Um toque seco é assinatura ruim, mas é um traço — vira pingo, não some.
const pingo = await rasterizarAssinatura([[{ x: 5, y: 5 }]]);
checar('um ponto só ainda produz imagem', pingo.ok, true);
// Assinatura miúda é AMPLIADA (até o teto), não sai um selo de 3 pixels.
const miuda = desenharAlfa(rabisco(0.25));
checar('assinatura miúda é ampliada', !!miuda && miuda.largura > 200, true);
checar('mas a ampliação tem teto', !!miuda && miuda.largura <= Math.ceil(330 * 0.25 * ESCALA_MAX) + 12, true);
// O recorte é na TINTA, não na tela: assinar no cantinho não gera um PNG enorme
// cheio de vazio.
const cantinho = desenharAlfa([[{ x: 400, y: 300 }, { x: 460, y: 320 }]]);
checar('o recorte é na tinta (não no tamanho da área de desenho)', !!cantinho && cantinho.largura < 200, true);

console.log('\n6) a cópia é honesta: aceite entre as partes, NÃO assinatura certificada');
const AVISO = 'Não é assinatura digital certificada (ICP-Brasil)';
// Texto de JSX quebra em várias linhas; o que importa é a frase que o usuário lê.
const nMod = modalBruto.replace(/\s+/g, ' ');
const nTela = telaBruta.replace(/\s+/g, ' ');
checar('o pad avisa o que a assinatura NÃO é', nMod.includes(AVISO), true);
checar('e o card da tela repete o aviso (quem vê o resultado também lê)', nTela.includes(AVISO), true);
checar('o pad diz o que a assinatura VALE (aceite/execução)', nMod.includes('comprovação de aceite e execução entre você e o cliente'), true);
// Nenhuma das duas superfícies pode prometer o que não entrega.
for (const [nome, src] of [['o pad', modalBruto], ['o card', telaBruta]] as const) {
  for (const promessa of ['validade jurídica', 'juridicamente válida', 'certificado digital', 'assinatura eletrônica avançada', 'com fé pública']) {
    checar(`${nome} não promete "${promessa}"`, src.toLowerCase().includes(promessa.toLowerCase()), false);
  }
}

console.log('\n7) o carregador do fast-png não pode voltar para o topo do módulo');
// O import no topo derrubava o app INTEIRO no boot do Android (TextDecoder
// latin1 no Hermes — bug real do APK v6). São DUAS cópias do carregador
// (extrairCoresLogo e a assinatura), e é a divergência entre cópias que este
// bloco impede: as duas regras valem nos dois arquivos.
for (const [nome, caminho] of [
  ['rasterizarAssinatura', CAMINHO_RASTER],
  ['extrairCoresLogo', '../src/utils/extrairCoresLogo.ts'],
] as const) {
  const src = semComentarios(ler(caminho));
  checar(`${nome} não importa fast-png no topo`, /^import[^\n]*from '(fast-png)'/m.test(src), false);
  const iShim = src.indexOf('instalarShimLatin1();');
  // A ÚNICA atribuição do cache é a carga de fato (o `let fastPngCache: FastPng
  // | null = null` do topo não casa com esta busca). Ancorar nela — e não na
  // string `import('fast-png')` — evita casar com o `typeof import('fast-png')`
  // do type alias, que fica no topo do arquivo nos dois casos.
  const iCarga = src.indexOf('fastPngCache =');
  checar(`${nome} instala o shim de latin1 antes de carregar`, iShim >= 0 && iCarga > iShim, true);
  checar(`${nome} devolve null quando o encoder não carrega`, /catch \{\s*return null;/.test(src), true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
