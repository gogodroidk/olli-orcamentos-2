/**
 * SEMEADURA — cria os dados fictícios DIRIGINDO A INTERFACE REAL do app.
 *
 * Por que dirigir a UI em vez de escrever no SQLite:
 * o dono pediu telas reais. Uma tela que mostra um estado que o produto não
 * consegue produzir sozinho é exatamente a mentira que a landing tinha quando
 * exibia a demo de outro produto. Aqui cada linha do banco nasce pelo caminho
 * que um prestador percorre: formulário de cliente, formulário de item, botão
 * "Gerar orçamento", troca de status para "Aprovado". Se o fluxo quebrar, a
 * semeadura falha — e a falha é um teste de fumaça de brinde.
 *
 * Roda contra um export web feito SEM NUVEM (ver capturar-telas.mjs): sem
 * Supabase configurado o app entra direto nas abas, o banco é um SQLite local
 * vazio e não existe dado real ao alcance do browser. O risco de vazar dado de
 * cliente não é mitigado por política — ele é ausente por arquitetura.
 */
import { AGENDAMENTOS, CLIENTES, EMPRESA, ITENS_ORCAMENTO, ORCAMENTOS_EXTRA, ORDEM_SERVICO } from './elenco.mjs';

const ESPERA = 15000;

// ─── Primitivas de interação (RN-web: tudo é <div>, nada é <button>) ────────

/**
 * `exato: true` por padrão — e isto não é preciosismo. O `getByText` do
 * Playwright, quando NÃO é exato, casa por SUBSTRING e IGNORANDO MAIÚSCULAS.
 * Foi assim que um clique em "Gerar orçamento" caiu no texto de ajuda
 * `Toque em "Gerar Orçamento" para criar o PDF...`, que fica acima do botão:
 * o passo 4 rolava para o topo e a semeadura travava sem erro nenhum.
 *
 * `.last()` porque modal em RN-web é irmão no fim do DOM: com um modal aberto,
 * o último elemento com aquele texto é o dele, não o da tela por trás.
 */
export async function clicar(page, texto, { exato = true, timeout = ESPERA } = {}) {
  const alvo = page.getByText(texto, { exact: exato }).last();
  await alvo.waitFor({ state: 'visible', timeout });
  await alvo.click();
}

export async function clicarSeAparecer(page, texto, { timeout = 2500, exato = true } = {}) {
  try {
    const alvo = page.getByText(texto, { exact: exato }).last();
    await alvo.waitFor({ state: 'visible', timeout });
    await alvo.click();
    return true;
  } catch {
    return false;
  }
}

/**
 * `fill()` sem `click()` de propósito: em RN-web o campo de dinheiro fica dentro
 * de um `Animated.View` que anima a cor da borda, e o `click` do Playwright
 * espera uma "estabilidade" que essa animação nunca dá. `fill` foca e dispara o
 * evento de input que o React escuta — que é tudo de que a máscara precisa.
 */
export async function preencher(page, placeholder, valor, { timeout = ESPERA, exato = true } = {}) {
  const campo = page.getByPlaceholder(placeholder, { exact: exato }).last();
  await campo.waitFor({ state: 'visible', timeout });
  await campo.fill(String(valor));
}

/**
 * Preenche pelo RÓTULO visível. `OlliInput` desenha o rótulo num `<Text>` acima
 * do campo, sem `<label for>`, então `getByLabel` não enxerga nada: o jeito
 * honesto é "o primeiro campo depois deste texto".
 */
export async function preencherPorRotulo(page, rotulo, valor, { timeout = ESPERA } = {}) {
  const campo = page
    .locator(`xpath=(//*[normalize-space(text())="${rotulo}"]/following::input)[1]`)
    .first();
  await campo.waitFor({ state: 'visible', timeout });
  await campo.fill(String(valor));
}

export async function esperarTexto(page, texto, timeout = ESPERA) {
  await page.getByText(texto, { exact: false }).first().waitFor({ state: 'visible', timeout });
}

/** Fecha a "dica contextual" (o balão de primeira visita) se ela estiver na tela. */
export async function dispensarDicas(page) {
  for (let i = 0; i < 3; i++) {
    if (!(await clicarSeAparecer(page, 'Entendi', { timeout: 1200 }))) break;
  }
}

// ─── Fluxos ────────────────────────────────────────────────────────────────

/**
 * Configura o negócio do prestador (é o que dá nome e cara ao PDF e ao link).
 *
 * NÃO É CHAMADA HOJE, e o motivo importa: a tela "Meu negócio" só monta depois
 * que o app sabe o PAPEL do usuário, e o papel vem de uma consulta ao Supabase.
 * No build sem nuvem esse "não sei" nunca vira "sei" e a tela fica em branco
 * para sempre — mesmo defeito que deixa a Home do celular vazia. Quando isso
 * for corrigido no app, basta voltar a chamar esta função em `semearTudo`: ela
 * está escrita e testada até onde a tela deixa chegar.
 */
export async function configurarEmpresa(page, base) {
  await page.goto(`${base}/meu-negocio`, { waitUntil: 'domcontentloaded' });
  await esperarTexto(page, 'Nome da empresa', 60000);
  await dispensarDicas(page);
  await preencherPorRotulo(page, 'Nome da empresa', EMPRESA.nome);
  await preencherPorRotulo(page, 'Especialidade', EMPRESA.especialidade);
  await preencherPorRotulo(page, 'Slogan', EMPRESA.slogan);
  await preencherPorRotulo(page, 'Endereço', EMPRESA.endereco);
  await preencherPorRotulo(page, 'Cidade', EMPRESA.cidade);
  await preencherPorRotulo(page, 'UF', EMPRESA.estado);
  await preencherPorRotulo(page, 'Telefone', EMPRESA.telefone);
  await preencherPorRotulo(page, 'E-mail', EMPRESA.email);
  await clicarSeAparecer(page, 'Salvar', { timeout: 4000 });
  await clicarSeAparecer(page, 'Salvar dados', { timeout: 4000 });
}

/**
 * Cadastra o cliente DENTRO do passo 1 do orçamento — é o caminho real: o
 * prestador quase nunca cadastra cliente antes, cadastra na hora de orçar.
 */
async function cadastrarCliente(page, cliente) {
  await clicar(page, 'Cadastrar novo cliente');
  await esperarTexto(page, 'Novo Cliente');
  await preencher(page, 'Ex: João da Silva', cliente.nome);
  await preencher(page, '(11) 99999-9999', cliente.telefone);
  await preencher(page, 'Rua, número', cliente.endereco);
  await preencher(page, 'São Paulo', cliente.cidade);
  await preencher(page, 'SP', cliente.estado);
  await clicar(page, 'Salvar cliente');
  await esperarTexto(page, cliente.nome);
}

async function escolherClienteExistente(page, cliente) {
  await preencher(page, 'Buscar cliente pelo nome...', cliente.nome.slice(0, 8));
  await clicar(page, cliente.nome);
}

async function adicionarItem(page, item) {
  await clicar(page, 'Adicionar manual');
  await esperarTexto(page, 'Novo item');
  await preencher(page, 'Ex: Limpeza de ar condicionado', item.nome);
  await preencher(page, 'Detalhe opcional', item.descricao);
  // Campo de dinheiro é mascarado em centavos: "89000" vira R$ 890,00.
  await preencher(page, '0,00', String(item.preco));
  await preencher(page, '1', String(item.quantidade));
  await clicar(page, 'Confirmar item');
  await esperarTexto(page, item.nome);
}

/**
 * Troca o status pelo menu real da tela do orçamento (o crachá é o gatilho).
 *
 * A âncora de saída é o menu SUMIR, não o rótulo novo aparecer — o rótulo
 * "Aprovado" já está escrito no próprio menu, então esperar por ele passava na
 * hora, antes de o banco gravar. A navegação seguinte abortava a gravação no
 * meio e o orçamento voltava a ser rascunho, sem erro nenhum no caminho.
 */
export async function mudarStatus(page, de, para) {
  await clicar(page, de);
  await esperarTexto(page, 'Alterar status:');
  await clicar(page, para);
  await page
    .getByText('Alterar status:', { exact: true })
    .first()
    .waitFor({ state: 'hidden', timeout: ESPERA });
  await page.getByText(para, { exact: true }).first().waitFor({ state: 'visible', timeout: ESPERA });
}

/**
 * Monta um orçamento inteiro pelos 4 passos e o gera.
 * @returns a URL final, que já é /orcamentos/<id> (a tela de visualização).
 */
export async function criarOrcamento(page, base, { cliente, itens, clienteJaExiste = false, pararEm = null }) {
  await page.goto(`${base}/orcamentos/novo`, { waitUntil: 'domcontentloaded' });
  await esperarTexto(page, 'Para quem é o orçamento?', 60000);
  await dispensarDicas(page);

  if (clienteJaExiste) await escolherClienteExistente(page, cliente);
  else await cadastrarCliente(page, cliente);
  await clicar(page, 'Avançar');

  await esperarTexto(page, 'Adicionar manual');
  for (const item of itens) await adicionarItem(page, item);
  if (pararEm === 'itens') return null;
  await clicar(page, 'Avançar');

  // Passos 3 (Detalhes) e 4 (Personalizar) ficam nos padrões do app de
  // propósito: é o que o prestador apressado vê, e é o que a landing deve
  // mostrar.
  await clicar(page, 'Avançar');
  await esperarTexto(page, 'Modelo do PDF');
  await clicar(page, 'Gerar orçamento');

  // `(?!novo$)`: sem isso a espera casa a própria URL de origem
  // (/orcamentos/novo) e volta na hora, antes de o orçamento existir.
  await page.waitForURL(/\/orcamentos\/(?!novo$)[0-9a-zA-Z-]+$/, { timeout: 60000 });
  await dispensarDicas(page);
  return page.url();
}

export async function criarAgendamentos(page, base) {
  await page.goto(`${base}/agenda`, { waitUntil: 'domcontentloaded' });
  await esperarTexto(page, 'Agenda', 60000);
  await dispensarDicas(page);
  for (const ag of AGENDAMENTOS) {
    await clicarSeAparecer(page, 'Agendar visita', { timeout: 6000 });
    await esperarTexto(page, 'Título');
    await preencher(page, 'Ex: D. Helena Souza', ag.cliente);
    await preencher(page, 'Ex: Manutenção Split 12.000 BTUs', ag.titulo);
    // As setas de dia têm `accessibilityLabel`, que em RN-web vira `aria-label` —
    // é o único identificador estável desses dois botões (o resto é ícone).
    for (let i = 0; i < Math.abs(ag.dias ?? 0); i++) {
      await page.getByLabel(ag.dias < 0 ? 'Dia anterior' : 'Próximo dia').last().click();
    }
    await clicar(page, 'Confirmar agendamento');
    // O formulário FECHAR é a âncora que serve para os dois casos: a visita de
    // hoje aparece na lista, a de ontem não — esperar pelo título só funcionaria
    // para metade delas.
    await page
      .getByText('Confirmar agendamento', { exact: true })
      .last()
      .waitFor({ state: 'hidden', timeout: ESPERA });
  }
  await esperarTexto(page, AGENDAMENTOS[0].titulo.slice(0, 24));
}

/**
 * Cria a OS A PARTIR DO ORÇAMENTO APROVADO, e não "manual", de propósito: é a
 * história que a landing precisa contar — o cliente aprovou, o serviço vira
 * ordem, o técnico executa. Uma OS manual mostraria a mesma tela contando uma
 * história pior.
 */
export async function criarOrdemServico(page, base, cliente) {
  await page.goto(`${base}/ordens`, { waitUntil: 'domcontentloaded' });
  await esperarTexto(page, 'Ordens de serviço', 60000);
  await dispensarDicas(page);
  await clicar(page, 'Nova OS');
  await esperarTexto(page, 'Nova ordem de serviço');
  await clicar(page, 'De um orçamento aprovado');
  await clicar(page, cliente.nome);
  await clicar(page, 'Gerar ordem de serviço');
  await page.waitForURL(/\/ordens/, { timeout: 30000 }).catch(() => {});
  await esperarTexto(page, cliente.nome, 30000);
}

/**
 * Semeia tudo o que as telas escolhidas precisam mostrar, na ordem em que um
 * prestador de verdade faria: primeiro o negócio, depois o trabalho.
 */
export async function semearTudo(page, base, log = () => {}) {
  const feito = {};

  log('orçamento-herói (Clínica Vida & Saúde, R$ 2.480)');
  feito.orcamentoHeroi = await criarOrcamento(page, base, {
    cliente: CLIENTES[0],
    itens: ITENS_ORCAMENTO,
  });
  await mudarStatus(page, 'Rascunho', 'Aprovado');

  for (const extra of ORCAMENTOS_EXTRA) {
    log(`orçamento ${extra.cliente.nome}`);
    await criarOrcamento(page, base, { cliente: extra.cliente, itens: extra.itens });
    if (extra.status && extra.status !== 'Rascunho') {
      await mudarStatus(page, 'Rascunho', extra.status);
    }
  }

  log('agendamentos');
  await criarAgendamentos(page, base).catch((e) => {
    console.warn('  agenda não semeada:', e.message.split('\n')[0]);
  });

  log('ordem de serviço');
  await criarOrdemServico(page, base, CLIENTES[0]).catch((e) => {
    console.warn('  ordem de serviço não semeada:', e.message.split('\n')[0]);
  });

  return feito;
}
