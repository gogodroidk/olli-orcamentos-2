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
import { AGENDAMENTOS, CLIENTES, EMPRESA, ITENS_ORCAMENTO, ORCAMENTOS_EXTRA, ORDENS_SERVICO } from './elenco.mjs';

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
 * Abre "Nova OS" e cria uma ordem, deixando o DETALHE dela aberto — que é onde
 * status e checklist são editados. O app abre esse detalhe sozinho ao criar
 * (`onCriada` faz `setDetalheId`, `OrdemServicoScreen.tsx:360-364`).
 *
 * `deOrcamento: true` usa o caminho "De um orçamento aprovado", que é a história
 * que a vitrine precisa contar — o cliente aprovou, o serviço vira ordem. As
 * outras vão pelo "Manual", que é o caminho real de quem já estava com a OS na
 * cabeça antes de existir orçamento.
 */
async function abrirNovaOS(page, base, os) {
  await page.goto(`${base}/ordens`, { waitUntil: 'domcontentloaded' });
  await esperarTexto(page, 'Ordens de serviço', 60000);
  await dispensarDicas(page);
  await clicar(page, 'Nova OS');
  await esperarTexto(page, 'Nova ordem de serviço');

  if (os.deOrcamento) {
    await clicar(page, 'De um orçamento aprovado');
    // A linha do orçamento é escolhida pela META ("Nº 00126 · Aprovado"), e não
    // pelo nome do cliente. O nome não serve mais: com a lista de OS já semeada
    // atrás do modal, `getByText(nome).last()` cai num cartão da lista de trás,
    // que o modal cobre — o clique ficava batendo em elemento coberto até dar
    // timeout. A meta só existe dentro deste modal.
    const linhas = page.getByText(/^Nº \d+ · Aprovado$/);
    await linhas.first().waitFor({ state: 'visible', timeout: ESPERA });
    const quantas = await linhas.count();
    if (quantas !== 1) {
      // Dois aprovados elegíveis tornaria a escolha uma loteria, e a screenshot
      // mudaria de conteúdo sem ninguém mexer em nada. Melhor parar.
      throw new Error(`esperava 1 orçamento aprovado elegível em "Nova OS", achei ${quantas}`);
    }
    await linhas.first().click();
    await clicar(page, 'Gerar ordem de serviço');
  } else {
    await clicar(page, 'Manual');
    await esperarTexto(page, 'Título do serviço');
    await preencher(page, 'Nome do cliente', os.cliente.nome);
    await preencher(page, 'Ex.: Manutenção do ar-condicionado', os.titulo);
    if (os.descricao) await preencher(page, 'Detalhes do que precisa ser feito...', os.descricao);
    await clicar(page, 'Criar ordem de serviço');
  }

  // Âncora: o bloco "Checklist" só existe no DETALHE. Esperar pelo nome do
  // cliente não serviria — ele já está escrito no formulário que acabei de
  // preencher, e a espera passaria antes de a OS existir.
  await esperarTexto(page, 'Checklist', 30000);

  // O título de uma OS manual é o que eu digitei; o da OS nascida de orçamento
  // é escrito pelo APP ("Orçamento <nº>", `src/services/ordemServico.ts:93`).
  // Ler do cabeçalho do detalhe em vez de repetir a regra aqui é o que impede
  // a conferência final de comparar contra um número decorado.
  if (os.titulo) return os.titulo;
  const cabecalho = page.getByText(/^Orçamento \d+$/).first();
  await cabecalho.waitFor({ state: 'visible', timeout: ESPERA });
  return (await cabecalho.textContent()).trim();
}

/**
 * Preenche o checklist e ajusta o status da OS que está aberta no detalhe.
 *
 * As três gravações desta tela têm tempos DIFERENTES, e ignorar isso foi o que
 * fez a primeira rodada sair com uma OS "Aberta" onde devia estar "Agendada" e
 * um checklist "0/3" onde devia estar "0/4":
 *
 *  · `adicionarItem` grava na hora (`OrdemServicoScreen.tsx:484`) — mas duas
 *    gravações em voo terminam fora de ordem e a última a chegar vence com a
 *    lista que ELA calculou. Duas adições coladas perdem uma.
 *  · `toggleItem` tem autosave com DEBOUNCE de 500 ms (`:464-466`).
 *  · `mudarStatus` só atualiza o estado DEPOIS do await da gravação
 *    (`:434-438`), o que dá uma âncora de verdade: o crachá do cabeçalho.
 *
 * O que garante o resultado não é nenhuma espera aqui — é a conferência de
 * `semearOrdens`, que relê a lista do banco. As esperas só evitam que a
 * conferência reprove por corrida.
 */
async function preencherDetalheOS(page, os) {
  for (const item of os.checklist ?? []) {
    await preencher(page, 'Adicionar item...', item);
    await page.getByLabel('Adicionar item').last().click();
    await esperarTexto(page, item);
    // Relógio declarado, e não âncora, porque não existe âncora honesta aqui: o
    // que muda quando a gravação termina é o cartão ATRÁS do modal, e o rótulo
    // dele ("0/3") pode existir em outra OS já semeada. 150 ms fecha a janela
    // entre duas escritas do mesmo campo.
    await page.waitForTimeout(150);
  }

  // Marca os `feitos` primeiros itens. O alvo do toque é o TEXTO do item (a
  // linha inteira é o botão), o que evita depender do ícone da caixinha.
  const marcados = os.checklist?.slice(0, os.feitos ?? 0) ?? [];
  for (const item of marcados) {
    await clicar(page, item);
  }
  // Espera o debounce de 500 ms do autosave. Duração CONHECIDA, não "carregar":
  // 900 ms é folga. Tem de vir ANTES da troca de status, senão o patch de status
  // e o do checklist disputam a mesma linha.
  if (marcados.length) await page.waitForTimeout(900);

  if (os.status && os.status !== 'Aberta') {
    const rotulo = page.getByText(os.status, { exact: true });
    const antes = await rotulo.count();
    // `.last()` pega a opção do grid: o rótulo também aparece nos filtros da
    // lista atrás do modal, que vêm antes no DOM.
    await rotulo.last().click();
    // ÂNCORA DE GRAVAÇÃO: o crachá do cabeçalho do modal desenha `ordem.status`,
    // que só troca depois do await de `atualizarStatusOS`. Uma ocorrência a mais
    // do rótulo na tela significa que o banco já respondeu. Sem esta espera, a
    // navegação para a OS seguinte abortava a gravação — e a OS ficava "Aberta"
    // sem erro nenhum no caminho.
    await rotulo.nth(antes).waitFor({ state: 'attached', timeout: ESPERA });
  }
}

/**
 * Semeia as ordens de serviço e CONFERE o resultado lendo a lista de volta.
 *
 * Percorre `ORDENS_SERVICO` de trás para frente porque a lista da tela ordena
 * por `atualizadoEm` desc: quem é criado por último aparece em cima.
 */
export async function semearOrdens(page, base, log = () => {}) {
  const titulos = new Map();
  for (const os of [...ORDENS_SERVICO].reverse()) {
    log(`OS ${os.titulo ?? 'do orçamento aprovado'} (${os.cliente.nome})`);
    titulos.set(os, await abrirNovaOS(page, base, os));
    await preencherDetalheOS(page, os);
  }

  await page.goto(`${base}/ordens`, { waitUntil: 'domcontentloaded' });
  await esperarTexto(page, 'Ordens de serviço', 60000);
  await dispensarDicas(page);
  await conferirListaDeOrdens(page, titulos);
}

/**
 * Confere a lista de ordens de serviço contra o elenco, na ORDEM.
 *
 * Lê o texto visível da tela e fatia em blocos por título. A primeira versão
 * desta conferência perguntava "existe algum '0/4' na tela?" e passou com a OS
 * errada: outra ordem tinha 0/4, e a que devia ter 0/4 ficou com 0/3. Buscar
 * global é a versão de screenshot do "não sei virou não tem" — o dado sumiu e o
 * portão disse que estava tudo certo.
 *
 * Confere três coisas por OS, dentro do bloco DELA: cliente, crachá de status e
 * chip do checklist. E confere a ordem, porque a primeira imagem da lista é a
 * OS nascida do orçamento aprovado — é ela que a legenda da vitrine promete.
 */
async function conferirListaDeOrdens(page, titulos) {
  const linhas = (await page.evaluate(() => document.body.innerText))
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const problemas = [];
  let anterior = -1;
  const posicoes = ORDENS_SERVICO.map((os) => linhas.indexOf(titulos.get(os)));

  ORDENS_SERVICO.forEach((os, i) => {
    const titulo = titulos.get(os);
    const inicio = posicoes[i];
    if (inicio < 0) {
      problemas.push(`"${titulo}" não está na lista`);
      return;
    }
    if (inicio <= anterior) {
      problemas.push(`"${titulo}" saiu fora de ordem (a lista ordena por última alteração)`);
    }
    anterior = inicio;

    // O bloco vai até o título da próxima OS (ou o fim da tela).
    const fim = posicoes.slice(i + 1).find((p) => p > inicio) ?? linhas.length;
    const bloco = linhas.slice(inicio, fim);

    if (!bloco.includes(os.cliente.nome)) {
      problemas.push(`"${titulo}" não está com o cliente ${os.cliente.nome}`);
    }
    const status = os.status ?? 'Aberta';
    if (!bloco.includes(status)) {
      problemas.push(`"${titulo}" devia estar "${status}" e o crachá diz outra coisa`);
    }
    const total = os.checklist?.length ?? 0;
    if (total) {
      const chip = `${os.feitos ?? 0}/${total}`;
      if (!bloco.includes(chip)) {
        problemas.push(`"${titulo}" devia estar com o checklist ${chip}`);
      }
    }
  });

  if (problemas.length) {
    throw new Error(
      `a lista de ordens de serviço não bate com o elenco:\n  - ${problemas.join('\n  - ')}\n` +
        'Isto é gravação perdida, não tela vazia. Não capture por cima.',
    );
  }
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

  log('ordens de serviço');
  // SEM `.catch()` aqui, ao contrário da agenda: a 4ª screenshot da vitrine é a
  // lista de ordens de serviço, e semeadura silenciosamente pulada é justamente
  // como aquela tela foi parar na loja com 70% de fundo chapado. Falhar a
  // rodada custa uma execução; publicar a tela oca custa a listagem.
  await semearOrdens(page, base, (o) => log(`  ${o}`));

  return feito;
}
