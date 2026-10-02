/**
 * Encaixes de 02/10/2026 nas telas que estavam congeladas (Home, Conta, Detalhe do
 * orçamento e Onboarding) — as peças dos PRs #106 a #109 chegando onde o prestador
 * as vê.
 *
 *     node scripts/teste-encaixe-home-conta.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * COMPORTAMENTO (regras puras):
 *  - convite "Trazer meus dados do app antigo": só com os três números CONHECIDOS
 *    (null = "não sei" nunca convida), conta começando e não dispensado;
 *  - aviso do crédito de troca na Home: em análise sempre; decidido só por um
 *    tempo; aprovado vencido some; sem pedido não ocupa espaço.
 * FIAÇÃO (fonte sem comentários):
 *  - Home: aviso do crédito (dono), convite de importar, chip "hora de sair" só no
 *    estado bloqueado e sem duplicar o EtaChip, pedidos pela etiqueta QR antes do
 *    Dinheiro;
 *  - Conta: crédito de troca abaixo do plano (só o dono, pagante só com pedido) e
 *    a ferramenta de importar (não para técnico), ambos na busca;
 *  - Detalhe: o ramo morto "Cota mensal utilizada" saiu; o cartão do link com
 *    pagamento fica perto do envio, só para quem decide o plano;
 *  - Onboarding: "Trazer meus dados" conclui o cadastro e chega na importação;
 *  - motion só pelos componentes da casa (nada de Animated legado).
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  POUCOS_CLIENTES,
  POUCOS_ORCAMENTOS,
  TEXTO_CONVITE_IMPORTAR,
  chaveConviteImportarDispensado,
  deveConvidarImportar,
} from '../src/utils/conviteImportar.ts';
import {
  AVISO_TROCA_HOME_DIAS,
  pedidoTrocaMereceAvisoNaHome,
  type PedidoTroca,
} from '../src/services/creditoTrocaRegras.ts';
import { TERMOS_AJUSTE, buscarAjustes, SECAO_AJUSTES } from '../src/services/buscaAjustes.ts';

let ok = 0;
function caso(nome: string, fn: () => void) {
  fn();
  ok++;
  console.log(`ok - ${nome}`);
}

function ler(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

/** Fonte sem comentários: o teste olha o que RODA, não o que o comentário promete. */
function semComentarios(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ [^'"`\n]*$/gm, '');
}

// ─── 1. Convite de importar ──────────────────────────────────────────────────
caso('convite: conta começando e nada dispensado → convida', () => {
  assert.equal(deveConvidarImportar({ clientes: 0, orcamentos: 0, dispensado: false }), true);
  assert.equal(deveConvidarImportar({ clientes: POUCOS_CLIENTES, orcamentos: POUCOS_ORCAMENTOS, dispensado: false }), true);
});

caso('convite: "não sei" nunca convida (carregando, erro, nuvem não baixou)', () => {
  assert.equal(deveConvidarImportar({ clientes: null, orcamentos: 0, dispensado: false }), false);
  assert.equal(deveConvidarImportar({ clientes: 0, orcamentos: null, dispensado: false }), false);
  assert.equal(deveConvidarImportar({ clientes: 0, orcamentos: 0, dispensado: null }), false);
  assert.equal(deveConvidarImportar({ clientes: Number.NaN, orcamentos: 0, dispensado: false }), false);
});

caso('convite: some com a base crescendo ou com o "agora não"', () => {
  assert.equal(deveConvidarImportar({ clientes: POUCOS_CLIENTES + 1, orcamentos: 0, dispensado: false }), false);
  assert.equal(deveConvidarImportar({ clientes: 0, orcamentos: POUCOS_ORCAMENTOS + 1, dispensado: false }), false);
  assert.equal(deveConvidarImportar({ clientes: 0, orcamentos: 0, dispensado: true }), false);
});

caso('convite: copy única e chave por usuário', () => {
  assert.equal(TEXTO_CONVITE_IMPORTAR.titulo, 'Trazer meus dados do app antigo');
  // A descrição só promete as três entradas que a ImportarScreen tem de verdade.
  const importar = ler('../src/screens/ImportarScreen.tsx');
  assert.match(importar, /titulo: 'Contatos do celular'/);
  assert.match(importar, /titulo: 'Planilha'/);
  assert.match(importar, /titulo: 'Foto de orçamento antigo'/);
  assert.match(TEXTO_CONVITE_IMPORTAR.descricao, /Contatos do celular, planilha ou foto de orçamento antigo/);
  assert.notEqual(chaveConviteImportarDispensado('a'), chaveConviteImportarDispensado('b'));
});

// ─── 2. Aviso do crédito de troca na Home ────────────────────────────────────
const AGORA = Date.parse('2026-10-02T12:00:00Z');
const DIA = 86_400_000;
function pedido(p: Partial<PedidoTroca>): PedidoTroca {
  return {
    id: 'p1',
    status: 'pendente',
    appAnterior: 'Outro App',
    venceEm: null,
    mesesConcedidos: null,
    concedidoAte: null,
    motivoRecusa: null,
    criadoEm: new Date(AGORA - DIA).toISOString(),
    ...p,
  };
}

caso('troca: em análise sempre avisa; sem pedido não ocupa espaço', () => {
  assert.equal(pedidoTrocaMereceAvisoNaHome(null, AGORA), false);
  assert.equal(pedidoTrocaMereceAvisoNaHome(pedido({ criadoEm: new Date(AGORA - 90 * DIA).toISOString() }), AGORA), true);
});

caso('troca: decidido avisa por um tempo e depois sai da Home', () => {
  const recente = new Date(AGORA - 5 * DIA).toISOString();
  const antigo = new Date(AGORA - (AVISO_TROCA_HOME_DIAS + 1) * DIA).toISOString();
  assert.equal(pedidoTrocaMereceAvisoNaHome(pedido({ status: 'recusado', criadoEm: recente }), AGORA), true);
  assert.equal(pedidoTrocaMereceAvisoNaHome(pedido({ status: 'recusado', criadoEm: antigo }), AGORA), false);
  assert.equal(pedidoTrocaMereceAvisoNaHome(pedido({ status: 'aprovado', criadoEm: recente, concedidoAte: '2027-01-02' }), AGORA), true);
  assert.equal(pedidoTrocaMereceAvisoNaHome(pedido({ status: 'aprovado', criadoEm: antigo, concedidoAte: '2027-01-02' }), AGORA), false);
});

caso('troca: aprovado já vencido não anuncia "Pro liberado"; data ilegível ainda avisa', () => {
  assert.equal(pedidoTrocaMereceAvisoNaHome(pedido({ status: 'aprovado', concedidoAte: '2026-10-01' }), AGORA), false);
  assert.equal(pedidoTrocaMereceAvisoNaHome(pedido({ status: 'aprovado', concedidoAte: '2026-10-02' }), AGORA), true, 'vale até o fim do dia');
  assert.equal(pedidoTrocaMereceAvisoNaHome(pedido({ status: 'recusado', criadoEm: 'ontem' }), AGORA), true);
});

// ─── 3. Fiação ───────────────────────────────────────────────────────────────
const home = semComentarios(ler('../src/screens/HomeScreen.tsx'));
const conta = semComentarios(ler('../src/screens/ContaScreen.tsx'));
const detalhe = semComentarios(ler('../src/screens/VisualizarOrcamentoScreen.tsx'));
const onboarding = semComentarios(ler('../src/screens/OnboardingScreen.tsx'));
const atalho = semComentarios(ler('../src/components/CreditoTrocaAtalho.tsx'));
const convite = semComentarios(ler('../src/components/ConviteImportar.tsx'));
const avisoQr = semComentarios(ler('../src/components/equipamento/PedidosQrAvisoInicio.tsx'));
const blocoQr = semComentarios(ler('../src/components/equipamento/PedidosQrBloco.tsx'));
const limites = semComentarios(ler('../src/services/limitesComerciais.ts'));

caso('Home: aviso do crédito de troca só para o dono, no modo aviso', () => {
  assert.match(home, /\{ativacaoDoDono \? <CreditoTrocaAtalho modo="aviso"/);
  assert.match(atalho, /modo === 'aviso' && !pedidoTrocaMereceAvisoNaHome\(pedido, Date\.now\(\)\)\) return null/);
  assert.match(atalho, /estado\.tipo === 'carregando' \|\| estado\.tipo === 'sem_sessao'\) return null/);
});

caso('Home: convite de importar com números confiáveis e para quem cadastra clientes', () => {
  assert.match(home, /const contagemConfiavel = !carregando && !carregandoErro && download === 'pronto'/);
  assert.match(home, /clientes: contagemConfiavel \? clientes\.length : null/);
  assert.match(home, /orcamentos: contagemConfiavel \? totalOrcamentos : null/);
  assert.match(home, /!papelCarregando && pode\('gerenciar_clientes'\) && deveConvidarImportar\(/);
  assert.match(home, /onAbrir=\{\(\) => nav\.navigate\('Importar'\)\}/);
  assert.match(home, /onDispensar=\{conviteImportar\.dispensar\}/);
  assert.match(convite, /AsyncStorage\.getItem\(chave\.current\)/);
  assert.match(convite, /catch \{\s*if \(vivo\) setDispensado\(false\)/, 'preferência ilegível não esconde o convite para sempre');
});

caso('Home: "hora de sair" do Grátis só sem registro, sem duplicar o EtaChip e só bloqueado', () => {
  assert.match(home, /useRecursoPlano\('hora_de_sair'\)/);
  assert.match(
    home,
    /: !avisoSaida && !atendendo && !temEta && estadoHoraDeSair === 'bloqueado' \? \(\s*<View style=\{styles\.heroEta\}>\s*<RecursoPlanoChip recurso="hora_de_sair">/,
  );
  // O AvisoSaidaCard (com registro) continua o primeiro ramo.
  assert.ok(home.indexOf('<AvisoSaidaCard') < home.indexOf('<RecursoPlanoChip recurso="hora_de_sair">'));
});

caso('Home: pedidos pela etiqueta QR depois da rota e antes do Dinheiro', () => {
  const qr = home.indexOf('<PedidosQrAvisoInicio');
  assert.ok(qr > home.indexOf('<RotaDeHoje'), 'depois da rota de hoje');
  assert.ok(qr < home.indexOf('<PainelDinheiroParado'), 'antes do dinheiro');
  assert.match(home, /!papelCarregando && pode\('criar_orcamento'\) \?/);
  assert.match(home, /setVersaoPedidosQr\(v => v \+ 1\)/, 'relê no puxar-para-atualizar');
  assert.match(avisoQr, /modo="aviso"/);
  assert.match(avisoQr, /nav\.navigate\('Equipamento', \{ abrirToken: e\.qrToken \}\)/, 'toque abre a ficha certa');
  assert.match(blocoQr, /if \(!leitura \|\| leitura\.estado !== 'ok' \|\| leitura\.pedidos\.length === 0\) return null/, 'aviso, não lista');
});

caso('Conta: crédito de troca abaixo do plano, só o dono; pagante só com pedido', () => {
  assert.match(conta, /const mostraCreditoTroca = sessaoAtiva && !membroDeEmpresa && !carregandoPermissao\s*&& pode\('gerenciar_faturamento'\) && !cardPlanoCarregando/);
  assert.match(conta, /<CreditoTrocaAtalho ocultarSemPedido=\{temAssinaturaPaga\}/);
  // A busca só acha a linha que a tela com certeza desenha (pagante sem pedido não tem linha).
  assert.match(conta, /\.\.\.\(mostraCreditoTroca && !temAssinaturaPaga \? \[\{ id: 'creditoTroca'/);
  assert.match(conta, /mostraCreditoTroca && \(temAssinaturaPaga \? !resultadoBusca\.ativa : mostra\('creditoTroca'\)\)/);
  assert.ok(conta.indexOf("mostra('assinatura')") < conta.indexOf('<CreditoTrocaAtalho'), 'logo depois do cartão do plano');
  assert.ok(conta.indexOf('<CreditoTrocaAtalho') < conta.indexOf("mostra('equipe')"), 'antes de empresa/equipe');
});

caso('Conta: importar é ferramenta (não de técnico) e as duas linhas entram na busca', () => {
  assert.match(conta, /key: 'importar', icon: 'database-import-outline', label: TEXTO_CONVITE_IMPORTAR\.titulo, desc: TEXTO_CONVITE_IMPORTAR\.descricao, color: c\.accentLight, route: 'Importar', ocultarTecnico: true/);
  const itens = [
    { id: 'creditoTroca', secao: SECAO_AJUSTES.conta, titulo: 'Vim de outro app', termos: TERMOS_AJUSTE.creditoTroca },
    { id: 'ferramenta:importar', secao: SECAO_AJUSTES.ferramentas, titulo: TEXTO_CONVITE_IMPORTAR.titulo, descricao: TEXTO_CONVITE_IMPORTAR.descricao, termos: TERMOS_AJUSTE['ferramenta:importar'] },
  ];
  assert.ok(buscarAjustes(itens, 'planilha').ids.has('ferramenta:importar'));
  assert.ok(buscarAjustes(itens, 'migrar').ids.has('ferramenta:importar'));
  assert.ok(buscarAjustes(itens, 'troca').ids.has('creditoTroca'));
  assert.ok(buscarAjustes(itens, 'comprovante').ids.has('creditoTroca'));
});

caso('Detalhe: o ramo morto da cota saiu (e o tipo não deixa voltar)', () => {
  assert.doesNotMatch(detalhe, /cota_esgotada|Cota mensal utilizada|mensagemBloqueioEnvio|verificar a cota/);
  assert.match(detalhe, /return reservarEnvioOrcamento\(orc\.id, canal\);/);
  assert.match(limites, /permitido: true;/);
  assert.doesNotMatch(limites, /\| 'cota_esgotada'/);
});

caso('Detalhe: cartão do link com pagamento perto do envio, só para quem decide o plano', () => {
  assert.match(detalhe, /useRecursoPlano\('link_pagamento'\)/);
  assert.match(detalhe, /podePapel\('gerenciar_faturamento'\)/);
  assert.doesNotMatch(detalhe, /avisaLinkPagamento = [^;]*'liberado'/, 'Pro não vê nada');
  assert.doesNotMatch(detalhe, /avisaLinkPagamento = [^;]*'carregando'/, 'nada de esqueleto piscando para o Pro');
  assert.match(detalhe, /cardAcao === 'fechar' && orc\.status === 'rascunho' && avisaLinkPagamento && linkConfigurado\(\) && \(/);
  const card = detalhe.indexOf('<CartaoRecursoPlano recurso="link_pagamento"');
  assert.ok(card > detalhe.indexOf("cardAcao === 'fechar' && ("), 'depois do cartão "Fechar negócio"');
  assert.ok(card < detalhe.indexOf("cardAcao === 'cobrar'"), 'antes do cartão de cobrar');
});

caso('Onboarding: "Trazer meus dados" conclui o cadastro e chega na importação', () => {
  assert.match(onboarding, /<ConviteImportar onAbrir=\{\(\) => \{ void concluir\('importar'\); \}\} \/>/);
  assert.match(onboarding, /\{ index: 1, routes: \[\{ name: 'Tabs' \}, \{ name: 'Importar' \}\] \}/);
  assert.match(onboarding, /irParaApp\(destino\)/);
  assert.match(onboarding, /onPress=\{\(\) => \{ void concluir\('orcamento'\); \}\}/, 'o botão principal não recebe o evento como destino');
  assert.match(onboarding, /perfilOperacionalCompleto\(empresaFinal\)/, 'a mesma validação vale para os dois destinos');
});

caso('motion só pelos componentes da casa nos encaixes novos', () => {
  for (const fonte of [convite, avisoQr]) {
    assert.doesNotMatch(fonte, /Animated\.timing|Animated\.Value|LayoutAnimation|AnimatedEntrance/);
  }
  assert.match(convite, /PressableAnimado/);
  assert.match(home, /<Aparecer>\s*<ConviteImportar/);
});

console.log(`\n${ok} casos — encaixes de Home, Conta, Detalhe e Onboarding ok.`);
