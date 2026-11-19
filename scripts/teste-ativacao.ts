/**
 * Ativação até o 1º orçamento enviado (src/services/ativacao.ts): o exemplo por
 * ofício, o checklist de 4 passos (3 estados) e a regra do aviso "Liberamos o Pro".
 * Também confere que app (mobile + desktop) e painel usam a MESMA regra.
 * A parte de banco (o teste iniciado pelo servidor) está em teste-trial-automatico-sql.ts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ATRASO_ESQUELETO_MS,
  AVISO_EXEMPLO,
  EXEMPLOS_POR_VERTICAL,
  STATUS_JA_ENVIADO,
  TITULO_PRIMEIRO_ORCAMENTO,
  avisoTrialAutomatico,
  calcularChecklistAtivacao,
  contaMadura,
  dataCurtaBr,
  exemploOrcamentoPara,
  fatosDaEmpresa,
  fraseDoPrimeiroCliente,
  itensPrefillDoExemplo,
  mostrarCartaoPrimeiroOrcamento,
  mostrarEsqueletoAtivacao,
  statusFoiEnviado,
  totalDoExemplo,
  verticalDoExemplo,
} from '../src/services/ativacao.ts';
import { TRIAL_PRO_DIAS } from '../src/services/limitesComerciais.ts';
import { VERTICAIS, VERTICAL_GERAL } from '../src/services/verticais.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

// ─── 1. Exemplo por ofício ────────────────────────────────────────────────────
const UNIDADES = ['un', 'm', 'm²', 'm³', 'kg', 'L', 'h', 'dia', 'pç', 'cx'];
for (const v of [...VERTICAIS, VERTICAL_GERAL]) {
  const exemplo = exemploOrcamentoPara(v.id);
  assert.ok(exemplo, `o ofício ${v.id} precisa de um exemplo`);
  assert.equal(exemplo.vertical, v.id);
  assert.ok(exemplo.itens.length >= 2 && exemplo.itens.length <= 3, `${v.id}: exemplo curto (2–3 itens)`);
  for (const item of exemplo.itens) {
    assert.ok(item.nome.trim().length > 3, `${v.id}: item com nome`);
    assert.ok(Number.isFinite(item.valorReferencia) && item.valorReferencia > 0, `${v.id}: valor de referência positivo`);
    assert.ok(Number.isInteger(item.quantidade) && item.quantidade > 0, `${v.id}: quantidade inteira positiva`);
    assert.ok(UNIDADES.includes(item.unidade), `${v.id}: unidade do domínio`);
    assert.doesNotMatch(`${item.nome} ${item.descricao ?? ''}`, /oficial|tabela|mercado|garantid/i, `${v.id}: exemplo não promete preço oficial`);
  }
  assert.ok(totalDoExemplo(exemplo) > 0);
}
assert.equal(Object.keys(EXEMPLOS_POR_VERTICAL).length, VERTICAIS.length + 1, 'nenhum exemplo órfão');
assert.equal(exemploOrcamentoPara(undefined), null, 'sem ofício, a tela PERGUNTA (não chuta)');
assert.equal(exemploOrcamentoPara(null), null);

// Total em centavos: 180 + 80 = 260 (refrigeração); pintura 30×25 + 30×12 = 1110.
assert.equal(totalDoExemplo(EXEMPLOS_POR_VERTICAL.refrigeracao), 260);
assert.equal(totalDoExemplo(EXEMPLOS_POR_VERTICAL.pintura), 1110);

// Pré-carga no formato que as duas telas entendem, com o valor como SUGESTÃO.
const prefill = itensPrefillDoExemplo(EXEMPLOS_POR_VERTICAL.eletrica);
assert.equal(prefill.length, 3);
assert.deepEqual(prefill[1], { tipo: 'servico', nome: 'Instalação de tomada (mão de obra)', quantidade: 2, unidade: 'un', precoSugerido: 60 });
assert.equal(prefill[2].tipo, 'produto');
assert.equal('descricao' in prefill[0], false, 'descrição vazia é omitida (regra da omissão do blob)');

// Aviso honesto: diz que é exemplo, que se troca, e que não é tabela de preço.
assert.match(AVISO_EXEMPLO, /exemplo/i);
assert.match(AVISO_EXEMPLO, /troque/i);
assert.match(AVISO_EXEMPLO, /não uma tabela de preços/i);
assert.match(TITULO_PRIMEIRO_ORCAMENTO, /primeiro orçamento em 1 minuto/i);

// Z-62: a frase do cartão mora numa função só. O gancho é quem pediu preço;
// não afirma que a pessoa já tem cliente, não promete prazo novo nem preço de plano.
const fraseRefri = fraseDoPrimeiroCliente(EXEMPLOS_POR_VERTICAL.refrigeracao.titulo.toLowerCase(), 'R$ 260,00');
assert.equal(
  fraseRefri,
  'Preparamos um exemplo de higienização de ar-condicionado (R$ 260,00). Pense em quem te pediu preço esta semana: ponha o nome e os valores dele e envie.',
);
assert.match(fraseRefri, /quem te pediu preço esta semana/);
assert.doesNotMatch(fraseRefri, /Troque o cliente e os valores/);
assert.doesNotMatch(fraseRefri, /R\$ 39|R\$ 99|1 minuto/);

// Z-112: o esqueleto só reserva o lugar de quem ainda espera e ainda não é maduro.
assert.equal(ATRASO_ESQUELETO_MS, 100);
assert.equal(mostrarEsqueletoAtivacao({ ehDono: true, erro: false, madura: false, aguardando: true }), true);
assert.equal(mostrarEsqueletoAtivacao({ ehDono: false, erro: false, madura: false, aguardando: true }), false, 'papel desconhecido ou membro não vê esqueleto');
assert.equal(mostrarEsqueletoAtivacao({ ehDono: true, erro: true, madura: false, aguardando: true }), false, 'erro e download que falhou não viram esqueleto eterno');
assert.equal(mostrarEsqueletoAtivacao({ ehDono: true, erro: false, madura: true, aguardando: true }), false, 'conta madura não ganha convite falso');
assert.equal(mostrarEsqueletoAtivacao({ ehDono: true, erro: false, madura: false, aguardando: false }), false, 'leitura pronta não fica em esqueleto');

// Ofício: `verticais` explícitas vencem; senão o `segmento` legado; senão pergunta.
assert.equal(verticalDoExemplo({ verticais: ['pintura'], segmento: 'eletrica' }), 'pintura');
assert.equal(verticalDoExemplo({ segmento: 'ar-condicionado' }), 'refrigeracao');
assert.equal(verticalDoExemplo({ segmento: 'outro' }), 'geral');
assert.equal(verticalDoExemplo({ verticais: [] }), undefined);
assert.equal(verticalDoExemplo({ segmento: 'inventado' }), undefined, 'segmento desconhecido não vira ofício');
assert.equal(verticalDoExemplo(null), undefined);
assert.equal(verticalDoExemplo(undefined), undefined);

// O cartão só com ZERO orçamentos CONFIRMADO.
assert.equal(mostrarCartaoPrimeiroOrcamento(0), true);
assert.equal(mostrarCartaoPrimeiroOrcamento(3), false);
assert.equal(mostrarCartaoPrimeiroOrcamento(null), false, 'leitura não confirmada não vira "conta nova"');

// ─── 2. Checklist ─────────────────────────────────────────────────────────────
assert.deepEqual(STATUS_JA_ENVIADO.includes('rascunho'), false);
assert.equal(statusFoiEnviado('enviado'), true);
assert.equal(statusFoiEnviado('aprovado'), true);
assert.equal(statusFoiEnviado('rascunho'), false);
assert.equal(statusFoiEnviado('cancelado'), false, 'cancelado pode ter morrido como rascunho');
assert.equal(statusFoiEnviado(null), false);

const nada = { empresaComLogo: false, primeiroOrcamentoEnviado: false, chavePix: false, primeiroRecibo: false };
const inicial = calcularChecklistAtivacao(nada);
assert.equal(inicial.estado, 'pendente');
if (inicial.estado === 'pendente') {
  assert.equal(inicial.total, 4);
  assert.equal(inicial.feitos, 0);
  assert.deepEqual(inicial.passos.map((p) => p.id), ['empresa', 'primeiro_envio', 'pix', 'primeiro_recibo']);
  assert.equal(inicial.proximo.id, 'empresa');
}
const meio = calcularChecklistAtivacao({ ...nada, empresaComLogo: true, primeiroOrcamentoEnviado: true });
assert.equal(meio.estado, 'pendente');
if (meio.estado === 'pendente') {
  assert.equal(meio.feitos, 2);
  assert.equal(meio.proximo.id, 'pix');
  assert.equal(meio.passos.find((p) => p.id === 'primeiro_envio')?.feito, true);
}
assert.deepEqual(
  calcularChecklistAtivacao({ empresaComLogo: true, primeiroOrcamentoEnviado: true, chavePix: true, primeiroRecibo: true }),
  { estado: 'concluido', total: 4 },
  'tudo feito: o checklist some',
);
for (const fato of Object.keys(nada) as (keyof typeof nada)[]) {
  assert.deepEqual(
    calcularChecklistAtivacao({ ...nada, [fato]: null }),
    { estado: 'indisponivel' },
    `fato "${fato}" não confirmado: não desenha nada (nem pendente falso)`,
  );
}

// Fatos do cadastro: undefined = não sei; null = sei que não tem.
assert.deepEqual(fatosDaEmpresa(undefined), { empresaComLogo: null, chavePix: null, chavePixInvalida: null });
assert.deepEqual(fatosDaEmpresa(null), { empresaComLogo: false, chavePix: false, chavePixInvalida: false });
assert.deepEqual(fatosDaEmpresa({ nome: 'Clima Bom', logoUri: 'data:image/png;base64,AAA', chavePix: 'a@b.com' }), {
  empresaComLogo: true,
  chavePix: true,
  chavePixInvalida: false,
});
assert.deepEqual(fatosDaEmpresa({ nome: 'Clima Bom', logoUri: '', chavePix: '   ' }), { empresaComLogo: false, chavePix: false, chavePixInvalida: false });
assert.deepEqual(fatosDaEmpresa({ nome: '  ', logoUri: 'file://logo.png' }), { empresaComLogo: false, chavePix: false, chavePixInvalida: false });

// Chave Pix: só conta a que `normalizarChavePix` reconhece (a mesma régua da cobrança).
// O CNPJ da demo GR Tech tem dígito verificador errado: antes riscava "Chave Pix cadastrada".
const cnpjInvalido = fatosDaEmpresa({ nome: 'GR Tech', logoUri: 'x', chavePix: '41.882.109/0001-55' });
assert.deepEqual(cnpjInvalido, { empresaComLogo: true, chavePix: false, chavePixInvalida: true }, 'chave que não reconhecemos não conta');
assert.equal(fatosDaEmpresa({ nome: 'A', logoUri: 'x', chavePix: '11.222.333/0001-81' }).chavePix, true, 'CNPJ válido conta');
assert.equal(fatosDaEmpresa({ nome: 'A', logoUri: 'x', chavePix: '123e4567-e89b-12d3-a456-426614174000' }).chavePix, true, 'chave aleatória conta');
const comPixInvalido = calcularChecklistAtivacao({ empresaComLogo: true, primeiroOrcamentoEnviado: true, primeiroRecibo: false, ...cnpjInvalido });
assert.equal(comPixInvalido.estado, 'pendente');
if (comPixInvalido.estado === 'pendente') {
  const pix = comPixInvalido.passos.find((p) => p.id === 'pix');
  assert.equal(pix?.feito, false);
  assert.equal(pix?.titulo, 'Corrigir chave Pix', 'chave inválida vira "Corrigir", não "cadastrar"');
  assert.match(pix?.descricao ?? '', /sem Pix/);
  assert.equal(comPixInvalido.proximo.id, 'pix');
}
if (inicial.estado === 'pendente') {
  assert.equal(inicial.passos.find((p) => p.id === 'pix')?.titulo, 'Chave Pix cadastrada', 'sem chave: o texto de cadastro continua');
}

// Conta madura (3+ orçamentos e 1 recibo): o checklist some — só com leitura confirmada.
assert.equal(contaMadura(3, true), true);
assert.equal(contaMadura(12, true), true);
assert.equal(contaMadura(2, true), false);
assert.equal(contaMadura(3, false), false, 'sem recibo ainda não é madura');
assert.equal(contaMadura(null, true), false, 'total desconhecido nunca decide');
assert.equal(contaMadura(5, null), false, 'recibo desconhecido nunca decide');
assert.deepEqual(
  calcularChecklistAtivacao({ ...nada, primeiroOrcamentoEnviado: true, primeiroRecibo: true }, { totalOrcamentos: 12 }),
  { estado: 'madura' },
  'GR Tech (12 orçamentos, 8 recibos, sem logo): o checklist não ocupa mais o topo',
);
assert.equal(
  calcularChecklistAtivacao({ ...nada, primeiroOrcamentoEnviado: true, primeiroRecibo: true }, { totalOrcamentos: 2 }).estado,
  'pendente',
  'abaixo de 3 orçamentos o checklist continua',
);
assert.equal(
  calcularChecklistAtivacao({ ...nada, primeiroRecibo: true }).estado,
  'pendente',
  'sem informar a maturidade (painel), a regra antiga vale',
);

// Cartão "primeiro orçamento": no app, o zero do SQLite só vale depois do 1º download.
assert.equal(mostrarCartaoPrimeiroOrcamento(0, false), false, 'SQLite vazio antes do download não é conta nova');
assert.equal(mostrarCartaoPrimeiroOrcamento(0, true), true);
assert.equal(mostrarCartaoPrimeiroOrcamento(5, true), false);

// ─── 3. Aviso do teste do Pro liberado no 1º envio ───────────────────────────
const agora = Date.parse('2026-09-30T15:00:00.000Z');
const terminaEm = '2026-10-14T15:00:00.000Z';
const reservaGratis = { motivo: 'dentro_da_cota' as const, planoEfetivo: 'gratis' as const };
const ofertaAtiva = { trialEstado: 'active' as const, trialTerminaEm: terminaEm, planoEfetivo: 'pro' as const };

const aviso = avisoTrialAutomatico(reservaGratis, ofertaAtiva, agora);
assert.ok(aviso, 'envio pela cota + teste ativo confirmado = aviso');
assert.equal(aviso.titulo, `Liberamos o Pro por ${TRIAL_PRO_DIAS} dias`);
assert.match(aviso.mensagem, /até 14\/10\/2026/);
assert.match(aviso.mensagem, /Sem cartão e sem cobrança automática/);
assert.match(aviso.mensagem, /dados continuam salvos/);
assert.equal(aviso.terminaEm, terminaEm);
assert.equal(dataCurtaBr('2026-10-14T02:00:00.000Z'), '13/10/2026', 'data no fuso do Brasil, não em UTC');

assert.equal(avisoTrialAutomatico(reservaGratis, null, agora), null, 'leitura da oferta falhou: nada é anunciado');
assert.equal(avisoTrialAutomatico(null, ofertaAtiva, agora), null);
assert.equal(
  avisoTrialAutomatico({ motivo: 'trial_ativo', planoEfetivo: 'pro' }, ofertaAtiva, agora),
  null,
  'quem já estava no teste não é "liberado" de novo a cada envio',
);
assert.equal(avisoTrialAutomatico({ motivo: 'plano_pago', planoEfetivo: 'pro' }, ofertaAtiva, agora), null);
assert.equal(avisoTrialAutomatico({ motivo: 'ambiente_local', planoEfetivo: 'gratis' }, ofertaAtiva, agora), null);
assert.equal(avisoTrialAutomatico(reservaGratis, { ...ofertaAtiva, trialEstado: 'eligible' }, agora), null, 'não iniciou: sem aviso');
assert.equal(avisoTrialAutomatico(reservaGratis, { ...ofertaAtiva, trialEstado: 'ended' }, agora), null);
assert.equal(avisoTrialAutomatico(reservaGratis, { ...ofertaAtiva, planoEfetivo: 'gratis' }, agora), null);
assert.equal(avisoTrialAutomatico(reservaGratis, { ...ofertaAtiva, trialTerminaEm: null }, agora), null, 'sem data de término, sem aviso');
assert.equal(avisoTrialAutomatico(reservaGratis, { ...ofertaAtiva, trialTerminaEm: 'amanhã' }, agora), null);
assert.equal(
  avisoTrialAutomatico(reservaGratis, { ...ofertaAtiva, trialTerminaEm: '2026-09-29T00:00:00.000Z' }, agora),
  null,
  'término no passado não é anunciado',
);

// ─── 4. Paridade e fiação (app mobile + desktop, painel, servidor) ───────────
const migration = ler('../supabase/migrations/20260930120000_trial_pro_automatico_primeiro_envio.sql');
assert.match(migration, new RegExp(`interval '${TRIAL_PRO_DIAS} days'`), 'servidor e app concordam nos dias do teste');

const componenteApp = ler('../src/components/AtivacaoInicio.tsx');
assert.match(componenteApp, /from '\.\.\/services\/ativacao'/, 'app usa a regra única');
assert.match(componenteApp, /fraseDoPrimeiroCliente\(/, 'app usa a frase única do primeiro cliente');
assert.doesNotMatch(componenteApp, /Troque o cliente e os valores/, 'app não guarda a frase velha');
assert.match(componenteApp, /pode\('gerenciar_faturamento'\)/, 'só o dono vê a ativação no app');
assert.match(componenteApp, /leitura\.estado === 'erro' \|\| download === 'falhou'/, 'erro de leitura ou download que falhou não desenha o convite');
assert.match(componenteApp, /leitura\.estado !== 'pronto' \|\| download !== 'pronto'\) return null/, 'o convite só entra com a leitura e o download fechados');
assert.match(componenteApp, /onSyncAplicado\(/, 'app relê a ativação quando o pull da nuvem grava (SQLite vazio no 1º login não é conta vazia)');
assert.match(componenteApp, /useSyncInicial\(\)/, 'app espera o 1º download antes de afirmar "conta nova"');
assert.match(componenteApp, /mostrarEsqueletoAtivacao\(/, 'app usa a regra única do esqueleto');
assert.match(componenteApp, /ATRASO_ESQUELETO_MS/, 'app espera 100 ms antes do esqueleto');
assert.match(componenteApp, /Carregando o início/, 'leitor de tela anuncia a espera do cartão');
assert.doesNotMatch(componenteApp, /Baixando seus dados da nuvem/, 'a frase de espera saiu do cartão');
assert.doesNotMatch(componenteApp, /ActivityIndicator/, 'o cartão não usa spinner');
assert.match(componenteApp, /totalOrcamentos: total \}/, 'app informa o total para a regra de conta madura');
assert.doesNotMatch(componenteApp, /navigate\('Planos'|navigate\('Assinatura'/, 'regra das lojas: a ativação não leva a compra');
assert.match(ler('../src/screens/HomeScreen.tsx'), /<AtivacaoInicio\b/, 'Início do celular mostra a ativação');
assert.match(ler('../src/screens/desktop/InicioDesktopScreen.tsx'), /<AtivacaoInicio\b/, 'Início do desktop mostra a ativação');

const novoOrc = ler('../src/screens/NovoOrcamentoScreen.tsx');
assert.match(novoOrc, /exemploVertical/, 'editor do app reconhece o orçamento de exemplo');
assert.match(novoOrc, /AVISO_EXEMPLO/, 'editor do app avisa que é exemplo');
assert.match(novoOrc, /precoSugerido/, 'editor do app aceita o valor de referência');
assert.match(novoOrc, /Carregando o orçamento/, 'editor anuncia a espera');
assert.match(novoOrc, /OlliSkeleton/, 'editor espera no formato do miolo');
assert.doesNotMatch(novoOrc, /Preparando o orçamento/, 'a frase do spinner saiu do editor');
assert.doesNotMatch(novoOrc, /ActivityIndicator/, 'o editor não centra um spinner');

const visualizar = ler('../src/screens/VisualizarOrcamentoScreen.tsx');
assert.match(visualizar, /avisoTrialAutomatico\(reserva, oferta\)/, 'app avisa o teste liberado com a regra única');
assert.match(visualizar, /const confirmou = await confirmarEnvioOrcamento/, 'só avisa depois da confirmação aceita');

const cardPainel = ler('../webapp/src/pages/olli/inicio/AtivacaoCard.tsx');
assert.match(cardPainel, /from "@ativacao"/, 'painel usa a regra única');
assert.match(cardPainel, /fraseDoPrimeiroCliente\(/, 'painel usa a frase única do primeiro cliente');
assert.doesNotMatch(cardPainel, /Troque o cliente e os valores/, 'painel não guarda a frase velha');
assert.match(cardPainel, /ehDonoDaConta/, 'só o dono vê a ativação no painel');
assert.match(cardPainel, /isSuccess/, 'painel respeita os 3 estados');
assert.match(cardPainel, /isLoading: boolean/, 'o contrato da leitura do painel inclui carregando');
assert.match(cardPainel, /isError: boolean/, 'o contrato da leitura do painel inclui erro');
assert.match(cardPainel, /isLoading/, 'painel reserva o lugar enquanto a leitura carrega');
assert.match(cardPainel, /isError/, 'erro no painel não vira esqueleto eterno');
assert.match(cardPainel, /mostrarEsqueletoAtivacao\(/, 'painel usa a regra única do esqueleto');
assert.match(cardPainel, /ATRASO_ESQUELETO_MS/, 'painel espera 100 ms antes do esqueleto');
assert.match(cardPainel, /Carregando o início/, 'leitor de tela anuncia a espera do cartão no painel');
assert.match(cardPainel, /motion-reduce:animate-none|@\/ui\/skeleton/, 'painel usa o esqueleto que já para com reduzir movimento');
assert.match(ler('../webapp/src/pages/olli/inicio/index.tsx'), /<AtivacaoCard\b/, 'Início do painel mostra a ativação');
const orcPainel = ler('../webapp/src/pages/olli/orcamentos/index.tsx');
assert.match(orcPainel, /avisoTrialAutomatico\(reserva, oferta\)/, 'painel avisa o teste liberado com a regra única');
assert.match(orcPainel, /exemploVertical/, 'painel abre o exemplo no editor');
assert.match(ler('../webapp/src/pages/olli/orcamentos/FormOrcamento.tsx'), /AVISO_EXEMPLO/, 'editor do painel avisa que é exemplo');
assert.match(ler('../webapp/tsconfig.json'), /"@ativacao": \["\.\.\/src\/services\/ativacao\.ts"\]/);
assert.match(ler('../webapp/vite.config.ts'), /"@ativacao": ativacaoFonte/, 'alias de VALOR precisa estar no Vite também');

// ─── CQ-ATIVA-1O-ORCAMENTO: lista de Orçamentos vazia guiada ───
import { ativaPrimeiroOrcamentoLigada, decidirVazioOrcamentos } from '../src/services/ativacao.ts';
for (const v of [undefined, null, '', '0', 'false', 'sim', 'ligado']) assert.equal(ativaPrimeiroOrcamentoLigada(v), false, `chave desligada para ${String(v)}`);
for (const v of ['1', 'true', ' TRUE ']) assert.equal(ativaPrimeiroOrcamentoLigada(v), true);
const base = { ligado: true, filtrado: false, totalConfirmado: 0, vertical: 'refrigeracao' as const };
assert.equal(decidirVazioOrcamentos({ ...base, ligado: false }).tipo, 'padrao', 'chave desligada = tela de sempre');
assert.equal(decidirVazioOrcamentos({ ...base, filtrado: true }).tipo, 'padrao', 'com busca/filtro não convida');
assert.equal(decidirVazioOrcamentos({ ...base, totalConfirmado: null }).tipo, 'padrao', 'zero não confirmado não convida');
assert.equal(decidirVazioOrcamentos({ ...base, totalConfirmado: 3 }).tipo, 'padrao', 'quem tem orçamento não vê convite');
const comExemplo = decidirVazioOrcamentos(base);
assert.equal(comExemplo.tipo, 'exemplo');
assert.equal(comExemplo.tipo === 'exemplo' && comExemplo.vertical, 'refrigeracao');
assert.equal(decidirVazioOrcamentos({ ...base, vertical: undefined }).tipo, 'pergunta', 'sem ofício, pergunta');
const telaOrc = ler('../src/screens/OrcamentosScreen.tsx');
assert.match(telaOrc, /ligado: ATIVA_1O_ORCAMENTO &&/, 'app só guia com a chave ligada');
assert.match(telaOrc, /podePapel\('gerenciar_faturamento'\)/, 'só o dono vê o guia no app');
assert.match(ler('../src/config.ts'), /EXPO_PUBLIC_ATIVA_1O_ORCAMENTO/, 'chave local do app');
const painelOrc = ler('../webapp/src/pages/olli/orcamentos/index.tsx');
assert.match(painelOrc, /ativaPrimeiroOrcamentoLigada\(import\.meta\.env\.VITE_ATIVA_1O_ORCAMENTO\)/, 'painel só guia com a chave ligada');
assert.match(painelOrc, /ehDonoDaConta\(contextoEscrita/, 'só o dono vê o guia no painel');
assert.match(painelOrc, /AVISO_EXEMPLO/, 'painel diz que o valor é exemplo');

console.log('OK — ativação: exemplo por ofício, checklist em 3 estados e aviso do teste do Pro validados.');
