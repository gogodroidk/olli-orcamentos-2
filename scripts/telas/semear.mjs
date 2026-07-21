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
import {
  AGENDAMENTOS,
  AGORA,
  CLIENTES,
  CLIENTES_EXTRA,
  DETALHES_ORCAMENTO_HEROI,
  EMPRESA,
  ITENS_ORCAMENTO,
  ORCAMENTOS_EXTRA,
  ORDENS_SERVICO,
} from './elenco.mjs';

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
export async function criarOrcamento(
  page,
  base,
  { cliente, itens, clienteJaExiste = false, pararEm = null, detalhes = null },
) {
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

  // Passo 3 (Detalhes). Fica nos padrões do app para TODO orçamento — é o que o
  // prestador apressado vê — menos quando `detalhes` é passado, que é o caso do
  // orçamento-herói: sem garantia e sem condições de pagamento, a tela de
  // orçamento aprovado (2ª screenshot da vitrine) publicava um painel "2/5
  // sinais de confiança configurados" com três fichas de alerta. Ver
  // `DETALHES_ORCAMENTO_HEROI` em elenco.mjs.
  if (detalhes) {
    // Âncora do passo 3: o título da seção só existe nele. Sem isto, o
    // `preencher` abaixo poderia rodar antes de o passo trocar e falhar por
    // "placeholder não encontrado" — que seria um erro honesto, mas tardio.
    await esperarTexto(page, 'Condições e garantia');
    if (detalhes.condicoesPagamento) {
      await preencher(page, 'Ex: 50% de entrada, restante na entrega', detalhes.condicoesPagamento);
    }
    if (detalhes.garantia) {
      await preencher(page, 'Ex: 90 dias para mão de obra', detalhes.garantia);
    }
  }

  // Passo 4 (Personalizar) fica sempre no padrão.
  await clicar(page, 'Avançar');
  await esperarTexto(page, 'Modelo do PDF');
  await clicar(page, 'Gerar orçamento');

  // `(?!novo$)`: sem isso a espera casa a própria URL de origem
  // (/orcamentos/novo) e volta na hora, antes de o orçamento existir.
  await page.waitForURL(/\/orcamentos\/(?!novo$)[0-9a-zA-Z-]+$/, { timeout: 60000 });
  await dispensarDicas(page);
  return page.url();
}

/**
 * Define a HORA DE INÍCIO da visita que está no formulário aberto.
 *
 * O campo de hora não é campo de texto: é um botão que abre o `TimePickerModal`
 * do `react-native-paper-dates`, e ele abre no RELÓGIO ANALÓGICO — arrastar
 * ponteiro é a definição de captura que muda a cada rodada. O próprio modal traz
 * a saída: um botão de alternar para teclado, com `accessibilityLabel="toggle
 * keyboard"` (`TimePickerModal.js:127`), e nesse modo os dois campos viram
 * `<input>` de verdade, ambos com `placeholder="00"` — hora primeiro, minuto
 * depois (`TimeInputs.js:57,110`).
 *
 * No modo relógio esses mesmos inputs existem mas ficam COBERTOS por um
 * `TouchableRipple` em `absoluteFill` (`TimeInput.js:79-86`), então preencher
 * direto sem trocar o modo falharia por elemento coberto. Trocar o modo primeiro
 * não é preciosismo: é o que torna o preenchimento possível.
 *
 * ─── Por que DIGITAR e não `fill()` ────────────────────────────────────────
 *
 * `fill()` limpa e insere de uma vez, e este campo é controlado com uma volta
 * pelo pai: cada caractere vira `Number(e)` e volta como valor novo
 * (`TimeInput.js:37-40`), com `maxLength: 2`. Medido com a sonda: `fill('08')`
 * deixava o campo da HORA com **"00"** — a limpeza mandava `Number('') = NaN`,
 * o React reescrevia o campo no meio da inserção e o que sobrava não era o que
 * eu pedi. E o pior é o modo da falha: a hora ficava errada em silêncio, porque
 * "00" é um horário válido.
 *
 * Digitar sobre a seleção é o que uma pessoa faz, e é o que o componente espera:
 * '0' vira 0, '8' vira '08' e o pai recebe 8.
 *
 * Sem nada disto, toda visita nascia com o padrão `09:00`
 * (`AgendaScreen.tsx:270`) e a screenshot da Play saiu com as duas visitas do
 * dia no MESMO horário.
 */
/**
 * Digita num dos dois campos do seletor de hora, com duas conferências.
 *
 * A PRIMEIRA é o foco. No modo relógio o input está coberto por um
 * `TouchableRipple` em `absoluteFill`, e o clique cai nele: o Playwright
 * considera o clique bem-sucedido (o alvo do teste de acerto ainda é a caixa do
 * input), mas quem recebe o `onPress` é o ripple — o campo NÃO ganha foco. Aí o
 * `Control+a` e os dígitos vão para o corpo da página e somem. Foi exatamente
 * isso: a rodada terminava com "pedi 08:00 e o formulário ficou com 09:00",
 * porque a troca para o modo teclado ainda não tinha renderizado quando o
 * clique aconteceu. Perguntar ao DOM quem está com o foco é mais barato e mais
 * honesto do que esperar um tempo fixo e torcer.
 *
 * A SEGUNDA é o valor. `00` é hora válida, então uma digitação que se perde
 * produz uma screenshot errada sem erro nenhum — o modo de falha mais caro que
 * existe aqui. O campo tem de terminar com o que eu pedi.
 */
async function digitarNoCampo(page, campo, texto) {
  const focado = () =>
    page.evaluate(() => {
      const e = document.activeElement;
      return !!e && e.tagName === 'INPUT' && e.placeholder === '00';
    });

  for (let tentativa = 1; ; tentativa++) {
    await campo.click();
    if (await focado()) break;
    if (tentativa === 5) {
      throw new Error('o campo de hora não aceita foco — o modo teclado do seletor não abriu');
    }
    await page.waitForTimeout(200);
  }

  await page.keyboard.press('Control+a');
  await campo.pressSequentially(texto, { delay: 60 });

  const ficou = await campo.inputValue();
  if (Number(ficou) !== Number(texto)) {
    throw new Error(`digitei "${texto}" no seletor de hora e o campo ficou com "${ficou}"`);
  }
}

async function definirHoraDeInicio(page, hora) {
  await page.getByLabel('Escolher horário de início').last().click();
  await page.getByLabel('toggle keyboard').last().click();

  const campos = page.getByPlaceholder('00', { exact: true });
  await campos.first().waitFor({ state: 'visible', timeout: ESPERA });
  const quantos = await campos.count();
  if (quantos !== 2) {
    // Duas caixas é o contrato deste modal (hora e minuto). Qualquer outro
    // número significa que o componente mudou — e escrever a hora no campo
    // errado produz uma screenshot silenciosamente errada, que é pior do que
    // uma rodada que falha.
    throw new Error(`o seletor de hora devia ter 2 campos "00" (hora e minuto), achei ${quantos}`);
  }

  const [hh, mm] = hora.split(':');
  await digitarNoCampo(page, campos.first(), hh);
  await digitarNoCampo(page, campos.last(), mm);
  await clicar(page, 'Definir');

  // ÂNCORA: o botão do formulário passa a imprimir a hora escolhida. Esperar o
  // modal "sumir" não bastaria — ele some antes de o estado do formulário
  // acompanhar, e o `Confirmar agendamento` seguinte gravaria a hora antiga.
  try {
    await page.getByText(hora, { exact: true }).last().waitFor({ state: 'visible', timeout: ESPERA });
  } catch {
    // Um timeout cru aqui diz "não achei 08:00" e manda adivinhar o resto. O que
    // resolve é saber QUE hora ficou na tela — se ficou a antiga, o clique em
    // "Definir" não pegou; se ficou outra, foi a digitação.
    const naTela = (await page.evaluate(() => document.body.innerText))
      .split('\n')
      .map((s) => s.trim())
      .filter((l) => /^\d{1,2}:\d{2}$/.test(l));
    throw new Error(
      `pedi ${hora} e o formulário ficou com ${naTela.length ? naTela.join(', ') : 'nenhuma hora visível'}`,
    );
  }
}

/** Abreviações de mês que o `date-fns` com `ptBR` imprime no cabeçalho da data. */
const MESES_ABREVIADOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * O trecho "15 de jul de 2026" que o formulário deve estar mostrando para um
 * deslocamento de `dias` a partir de AGORA.
 *
 * Derivado do relógio congelado e do fuso da captura, nunca escrito à mão: o
 * elenco já teve um comentário jurando "sexta-feira" para um sábado, e a lição
 * é que data conferida de cabeça é data errada. O Brasil não tem horário de
 * verão desde 2019, então somar 24 h por dia é exato aqui.
 */
function diaEsperadoNoFormulario(dias) {
  const d = new Date(new Date(AGORA).getTime() + (dias ?? 0) * 86400000);
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(d);
  const parte = (t) => partes.find((p) => p.type === t).value;
  return `${Number(parte('day'))} de ${MESES_ABREVIADOS[Number(parte('month')) - 1]} de ${parte('year')}`;
}

/**
 * Põe o formulário no dia certo — em termos ABSOLUTOS, não relativos ao que
 * estava aberto antes.
 *
 * ─── O defeito que isto corrige, achado na imagem ──────────────────────────
 *
 * O formulário não começa "hoje": `abrirNovo` usa o dia que a TELA está
 * mostrando (`AgendaScreen.tsx:261`), e a tela pula para o dia do último
 * agendamento salvo (`:395`). Ou seja, o ponto de partida CHEIA da visita
 * anterior. Contando setas a partir dele, os deslocamentos viram uma soma
 * acumulada.
 *
 * Foi assim que "Carga de gás R-410A", declarado para AMANHÃ, foi parar HOJE na
 * screenshot publicada: a visita anterior era de ONTEM, o formulário abriu em
 * ontem, e uma seta para a frente devolveu hoje. Ninguém notou porque uma
 * agenda com cinco visitas parece tão saudável quanto uma com quatro — e o
 * conferidor só olhava as de hoje, então não viu a intrusa.
 *
 * Clicar em "Hoje" antes de contar as setas torna o deslocamento absoluto, e a
 * conferência do rótulo da data transforma qualquer surpresa futura em falha.
 */
async function definirDiaDoAgendamento(page, dias) {
  // O "Hoje" do formulário faz `set({ data: new Date() })` — o relógio
  // congelado. O `.last()` é o do modal; o outro "Hoje" é o da tela atrás.
  await clicar(page, 'Hoje');
  // As setas de dia têm `accessibilityLabel`, que em RN-web vira `aria-label` —
  // é o único identificador estável desses dois botões (o resto é ícone).
  for (let i = 0; i < Math.abs(dias ?? 0); i++) {
    await page.getByLabel(dias < 0 ? 'Dia anterior' : 'Próximo dia').last().click();
  }

  const esperado = diaEsperadoNoFormulario(dias);
  try {
    await page.getByText(esperado, { exact: false }).last().waitFor({ state: 'visible', timeout: ESPERA });
  } catch {
    const naTela = (await page.evaluate(() => document.body.innerText))
      .split('\n')
      .map((s) => s.trim())
      .filter((l) => / de \w{3} de \d{4}$/.test(l));
    throw new Error(
      `o formulário devia estar em "${esperado}" e está em "${naTela.join(', ') || 'data ilegível'}"`,
    );
  }
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
    await definirDiaDoAgendamento(page, ag.dias);
    if (ag.hora) await definirHoraDeInicio(page, ag.hora);
    // O endereço não é enfeite: é ele que faz aparecer o marcador de mapa e o
    // botão de traçar rota no cartão (`AgendaScreen.tsx:701-717`) — e é ele que
    // torna verdadeira a legenda da landing, que promete "cliente, horário e
    // endereço".
    if (ag.endereco) await preencher(page, 'Rua, número, bairro', ag.endereco);
    await clicar(page, 'Confirmar agendamento');
    // O formulário FECHAR é a âncora que serve para os dois casos: a visita de
    // hoje aparece na lista, a de ontem não — esperar pelo título só funcionaria
    // para metade delas.
    await page
      .getByText('Confirmar agendamento', { exact: true })
      .last()
      .waitFor({ state: 'hidden', timeout: ESPERA });
  }
  await conferirAgendaDoDia(page, base);
}

/**
 * Confere que a agenda de HOJE ficou EXATAMENTE com o que o elenco mandou.
 *
 * Três perguntas, e a terceira é a que faltava:
 *
 *  1. cada visita de hoje está lá, com a SUA hora e o SEU endereço? Perguntar
 *     "existe algum 08:00 na tela?" seria a busca global que já deixou passar
 *     uma OS com o checklist trocado — por isso o par (hora, título) é
 *     conferido dentro do bloco do cartão, não na tela inteira;
 *  2. nenhuma visita de OUTRO dia vazou para hoje?
 *  3. a CONTA bate?
 *
 * A pergunta 2 não é teórica: "Carga de gás R-410A", declarada para amanhã,
 * apareceu na screenshot publicada como a segunda visita de hoje. A versão
 * anterior desta conferência só procurava as de hoje, então uma intrusa passava
 * — uma agenda com uma visita a mais parece tão saudável quanto a certa, e é
 * justamente por parecer saudável que ninguém olha duas vezes.
 *
 * Recarrega a página antes de medir de propósito: ao salvar, a tela PULA para o
 * dia do agendamento gravado (`AgendaScreen.tsx:395`), então ao fim do laço ela
 * está mostrando o dia da última visita, não hoje. Conferir sem recarregar seria
 * conferir o dia errado.
 */
async function conferirAgendaDoDia(page, base) {
  await page.goto(`${base}/agenda`, { waitUntil: 'domcontentloaded' });
  await esperarTexto(page, 'Agenda', 60000);
  await dispensarDicas(page);

  const deHoje = AGENDAMENTOS.filter((a) => (a.dias ?? 0) === 0);
  const deOutroDia = AGENDAMENTOS.filter((a) => (a.dias ?? 0) !== 0);

  // Âncora antes de ler: sem isto o `innerText` sai da tela ainda montando e a
  // conferência reprovaria por corrida, não por dado errado.
  await esperarTexto(page, deHoje[0].titulo.slice(0, 24));

  const linhas = (await page.evaluate(() => document.body.innerText))
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const problemas = [];
  for (const ag of deHoje) {
    const i = linhas.indexOf(ag.titulo);
    if (i < 0) {
      problemas.push(`"${ag.titulo}" não está na agenda de hoje`);
      continue;
    }
    // O cartão imprime hora, título, cliente, tipo e endereço em nós vizinhos.
    const bloco = linhas.slice(Math.max(0, i - 3), i + 6);
    if (ag.hora && !bloco.includes(ag.hora)) {
      problemas.push(`"${ag.titulo}" devia estar às ${ag.hora} e o cartão mostra outra hora`);
    }
    if (ag.endereco && !bloco.some((l) => l.includes(ag.endereco))) {
      problemas.push(`"${ag.titulo}" está sem o endereço "${ag.endereco}" no cartão`);
    }
  }

  for (const ag of deOutroDia) {
    if (linhas.includes(ag.titulo)) {
      problemas.push(
        `"${ag.titulo}" é de outro dia (dias: ${ag.dias}) e está aparecendo HOJE`,
      );
    }
  }

  // O cabeçalho imprime "N compromissos no período" — a conta fechada, que pega
  // qualquer coisa que os dois laços acima não previram.
  const contagem = linhas.find((l) => /^\d+ compromissos? no período$/.test(l));
  if (!contagem) {
    problemas.push('o cabeçalho da agenda não imprimiu a contagem do período');
  } else if (parseInt(contagem, 10) !== deHoje.length) {
    problemas.push(`o cabeçalho diz "${contagem}" e o elenco tem ${deHoje.length} para hoje`);
  }

  if (problemas.length) {
    throw new Error(
      `a agenda de hoje não bate com o elenco:\n  - ${problemas.join('\n  - ')}\n` +
        'Isto é gravação perdida ou dia errado, não tela vazia. Não capture por cima.',
    );
  }
}

/**
 * Cadastra os clientes que só existem na carteira, pela tela de Clientes.
 *
 * Roda por ÚLTIMO de propósito: é a única semeadura que não alimenta nenhuma
 * outra tela, e criar cliente no meio dos orçamentos mudaria a lista do seletor
 * de cliente sem necessidade.
 */
export async function semearClientesExtra(page, base, log = () => {}) {
  await page.goto(`${base}/clientes`, { waitUntil: 'domcontentloaded' });
  await esperarTexto(page, 'Clientes', 60000);
  await dispensarDicas(page);

  for (const cliente of CLIENTES_EXTRA) {
    log(`cliente ${cliente.nome}`);
    // O "+" é ícone puro; o `accessibilityLabel` é o único apanhador estável.
    await page.getByLabel('Novo cliente').last().click();
    await esperarTexto(page, 'Novo Cliente');
    await preencher(page, 'Ex: João da Silva', cliente.nome);
    await preencher(page, '(11) 99999-9999', cliente.telefone);
    await preencher(page, 'Rua, número', cliente.endereco);
    await preencher(page, 'São Paulo', cliente.cidade);
    await preencher(page, 'SP', cliente.estado);
    await clicar(page, 'Salvar cliente');
    // O nome na LISTA é a âncora de gravação. O nome também está no formulário
    // que acabei de preencher, então esperar por ele sem antes esperar o modal
    // fechar passaria na hora, antes de o banco responder.
    await page
      .getByText('Salvar cliente', { exact: true })
      .last()
      .waitFor({ state: 'hidden', timeout: ESPERA });
    await esperarTexto(page, cliente.nome);
  }

  // Confere a carteira inteira de volta: os três do elenco principal (que
  // nasceram pelos orçamentos) mais estes. Cliente que não gravou é cartão que
  // falta na screenshot — e a tela sairia mais vazia sem ninguém saber por quê.
  const texto = await page.evaluate(() => document.body.innerText);
  const faltando = [...CLIENTES, ...CLIENTES_EXTRA].map((c) => c.nome).filter((n) => !texto.includes(n));
  if (faltando.length) {
    throw new Error(`clientes que não chegaram na carteira: ${faltando.join(', ')}`);
  }
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

  /**
   * Quem JÁ foi cadastrado. Sem este controle, o 3º orçamento extra — que é do
   * mesmo cliente do herói — cadastrava "Clínica Vida & Saúde" uma SEGUNDA vez,
   * e a screenshot `08-clientes.png` foi para a pasta da loja com o mesmo
   * cliente duplicado, mesmo telefone e tudo. Cliente repetido é exatamente o
   * problema que um cadastro de clientes existe para resolver: a vitrine
   * mostrava o produto criando a bagunça que ele promete arrumar.
   *
   * O conjunto é derivado do próprio elenco em tempo de execução, e não uma
   * bandeira escrita à mão em cada entrada: bandeira à mão é o que dessincroniza
   * na próxima vez que alguém acrescentar um orçamento.
   */
  const jaCadastrados = new Set();
  const criar = async (rotulo, cliente, opcoes) => {
    log(rotulo);
    const url = await criarOrcamento(page, base, {
      cliente,
      clienteJaExiste: jaCadastrados.has(cliente.nome),
      ...opcoes,
    });
    jaCadastrados.add(cliente.nome);
    return url;
  };

  feito.orcamentoHeroi = await criar('orçamento-herói (Clínica Vida & Saúde, R$ 2.480)', CLIENTES[0], {
    itens: ITENS_ORCAMENTO,
    // Só o herói leva os detalhes preenchidos: é o único que a vitrine
    // fotografa na tela de orçamento aprovado.
    detalhes: DETALHES_ORCAMENTO_HEROI,
  });
  await mudarStatus(page, 'Rascunho', 'Aprovado');

  for (const extra of ORCAMENTOS_EXTRA) {
    await criar(`orçamento ${extra.cliente.nome}`, extra.cliente, { itens: extra.itens });
    if (extra.status && extra.status !== 'Rascunho') {
      await mudarStatus(page, 'Rascunho', extra.status);
    }
  }

  log('agendamentos');
  // SEM `.catch()`. A versão anterior engolia a falha com um `console.warn` e
  // seguia — e a agenda é a 5ª screenshot da vitrine da Play. Com o aviso
  // perdido no meio do log, uma agenda não semeada viraria uma tela vazia
  // publicada, que é o mesmo defeito que "erro vira vazio" em outro disfarce.
  // Se a agenda não semear, a rodada TEM de parar.
  await criarAgendamentos(page, base);

  log('ordens de serviço');
  // SEM `.catch()` aqui, ao contrário da agenda: a 4ª screenshot da vitrine é a
  // lista de ordens de serviço, e semeadura silenciosamente pulada é justamente
  // como aquela tela foi parar na loja com 70% de fundo chapado. Falhar a
  // rodada custa uma execução; publicar a tela oca custa a listagem.
  await semearOrdens(page, base, (o) => log(`  ${o}`));

  log('clientes da carteira');
  await semearClientesExtra(page, base, (o) => log(`  ${o}`));

  return feito;
}
