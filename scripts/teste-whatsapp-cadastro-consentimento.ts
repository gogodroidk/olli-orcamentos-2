/**
 * D1438-G24 — consentimento para estudar conversa e sugerir cadastro.
 * Não abre sessão e não grava.
 *
 *     node scripts/teste-whatsapp-cadastro-consentimento.ts
 * Exit 0 = passou; 1 = falhou.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { cnpjValido, cpfValido } from '../src/utils/pixBrCode.ts';
import { PRECO_EMPRESA, PRECO_PRO } from '../src/services/precosPlanos.ts';
import {
  CAIXA_LIMITES,
  CAIXA_PARTICIPA,
  CONEXAO_AO_VIVO,
  ORIGEM_ARQUIVO,
  RETENCAO_RASCUNHO_DIAS,
  RETENCAO_TEXTO_BRUTO_DIAS,
  TEXTO_CONSENTIMENTO_WHATSAPP_CADASTRO,
  TEXTO_MAX,
  VERSAO_TEXTO_WHATSAPP_CADASTRO,
  classificarConsentimento,
  conexaoAoVivoPermitida,
  estudarConversa,
  registrarConsentimento,
  revogarConsentimento,
  whatsappCadastroLigado,
  type PedidoEstudo,
  type RascunhoWhatsappCadastro,
  type RegistroConsentimento,
} from '../src/services/whatsappCadastroConsentimento.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes += 1;
    console.log(`  ok   ${nome}`);
  } else {
    falhas += 1;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

function verdadeiro(nome: string, ok: boolean): void {
  checar(nome, ok, true);
}

function ler(caminho: string): string {
  return readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');
}

const QUANDO = new Date('2026-11-03T12:00:00.000Z');

function vigente(): RegistroConsentimento {
  return registrarConsentimento(true, true, QUANDO);
}

function pedido(parcial: Partial<PedidoEstudo> & Pick<PedidoEstudo, 'texto'>): PedidoEstudo {
  return {
    flag: '1',
    consentimento: vigente(),
    origem: ORIGEM_ARQUIVO,
    nomeDaConta: 'Igor',
    texto: parcial.texto,
    ...parcial,
  };
}

function rascunhoDe(texto: string, extra: Partial<PedidoEstudo> = {}): RascunhoWhatsappCadastro {
  const saida = estudarConversa(pedido({ texto, ...extra }));
  if (!saida.ok) throw new Error(`esperava rascunho, veio ${saida.motivo}`);
  return saida.rascunho;
}

function jsonSem(nome: string, valor: unknown, segredo: string): void {
  verdadeiro(`${nome} não ecoa ${segredo}`, !JSON.stringify(valor).includes(segredo));
}

console.log('\n1) FLAG E CONEXÃO');
for (const apagado of [undefined, null, '', '0', 'true', 'yes', 'on', 'sim', ' 1', '1 ']) {
  checar(`desligada com ${JSON.stringify(apagado)}`, whatsappCadastroLigado(apagado), false);
}
checar('ligada com "1"', whatsappCadastroLigado('1'), true);
checar('conexão ao vivo é falsa', conexaoAoVivoPermitida(), false);
checar('constante de conexão', CONEXAO_AO_VIVO, false);
checar('texto bruto não fica guardado', RETENCAO_TEXTO_BRUTO_DIAS, 0);
checar('rascunho não confirmado expira em 7 dias', RETENCAO_RASCUNHO_DIAS, 7);
checar('versão do texto', VERSAO_TEXTO_WHATSAPP_CADASTRO, 1);

console.log('\n2) TEXTO DAS CAIXAS');
verdadeiro('o texto diz que o WhatsApp não está ligado', TEXTO_CONSENTIMENTO_WHATSAPP_CADASTRO.includes('ainda não liga no seu WhatsApp'));
verdadeiro('o texto exige o arquivo exportado pela pessoa', TEXTO_CONSENTIMENTO_WHATSAPP_CADASTRO.includes('arquivo de conversa que você mesmo exportou'));
verdadeiro('o texto fala em confirmar antes de cadastrar', TEXTO_CONSENTIMENTO_WHATSAPP_CADASTRO.includes('confirma antes de qualquer cadastro'));
verdadeiro('caixa de participar', CAIXA_PARTICIPA.includes('só o arquivo que eu mesmo entregar'));
verdadeiro('caixa de limites', CAIXA_LIMITES.includes('não usa isso para anúncio'));
verdadeiro('caixa de limites cobre treino e mensagem', CAIXA_LIMITES.includes('treinar modelo') && CAIXA_LIMITES.includes('falar com essas pessoas'));

console.log('\n3) CONSENTIMENTO');
checar('sem resposta', classificarConsentimento(null), 'sem_resposta');
checar('sem resposta undefined', classificarConsentimento(undefined), 'sem_resposta');
const umaCaixa = registrarConsentimento(true, false, QUANDO);
checar('uma caixa não aceita', classificarConsentimento(umaCaixa), 'recusado');
checar('uma caixa não ganha data de aceite', umaCaixa.aceitoEm, null);
checar('as duas caixas aceitam', classificarConsentimento(vigente()), 'vigente');
checar('data do aceite', vigente().aceitoEm, '2026-11-03T12:00:00.000Z');
const velho = { ...vigente(), versaoTexto: 0 };
checar('texto velho', classificarConsentimento(velho), 'texto_velho');
const semData = { ...vigente(), aceitoEm: null };
checar('sem data', classificarConsentimento(semData), 'incompleto');
const dataTorta = { ...vigente(), aceitoEm: 'ontem' };
checar('data inválida', classificarConsentimento(dataTorta), 'incompleto');
const revogado = revogarConsentimento(vigente(), new Date('2026-11-03T15:00:00.000Z'));
checar('revogado', classificarConsentimento(revogado), 'revogado');
checar('revogar guarda a prova do aceite', revogado.aceitoEm, '2026-11-03T12:00:00.000Z');
checar('revogar carimba a hora', revogado.revogadoEm, '2026-11-03T15:00:00.000Z');

console.log('\n4) TRAVA ANTES DE LER');
const marcador = 'MARCADOR-SESSAO-7f3a';
const sessao = estudarConversa(pedido({ origem: 'sessao', texto: marcador }));
checar('sessão proibida', sessao, { ok: false, motivo: 'origem_proibida' });
jsonSem('sessão', sessao, marcador);
for (const origem of ['webhook', 'caixa_olli', 'ollizap', 'outro_tenant', 'qr', '']) {
  checar(`origem ${JSON.stringify(origem)}`, estudarConversa(pedido({ origem, texto: marcador })).ok, false);
}
const desligado = estudarConversa(pedido({ flag: '0', origem: 'sessao', texto: marcador }));
checar('flag apagada nem chega na origem', desligado, { ok: false, motivo: 'desligado' });
jsonSem('flag apagada', desligado, marcador);
checar(
  'pedir envio',
  estudarConversa(pedido({ texto: 'oi', querEnviar: true })),
  { ok: false, motivo: 'pede_envio' },
);
checar(
  'pedir gravar',
  estudarConversa(pedido({ texto: 'oi', querGravar: true })),
  { ok: false, motivo: 'pede_gravar' },
);
checar(
  'sessão ganha de pedido de envio',
  estudarConversa(pedido({ origem: 'sessao', texto: marcador, querEnviar: true })),
  { ok: false, motivo: 'origem_proibida' },
);
checar(
  'sem consentimento',
  estudarConversa(pedido({ consentimento: null, texto: marcador })),
  { ok: false, motivo: 'sem_resposta' },
);
checar(
  'revogado não estuda',
  estudarConversa(pedido({ consentimento: revogado, texto: marcador })),
  { ok: false, motivo: 'revogado' },
);
jsonSem('revogado', estudarConversa(pedido({ consentimento: revogado, texto: marcador })), marcador);

console.log('\n5) RASCUNHO FELIZ');
verdadeiro('CPF de teste é válido', cpfValido('11144477735'));
verdadeiro('telefone de teste não é CPF', cpfValido('11988887777') === false);
verdadeiro('CNPJ de teste é válido', cnpjValido('11444777000161'));

const feliz = rascunhoDe(
  [
    '[27/10/2026, 14:32] Maria Souza: O split parou. Meu telefone é (11) 98888-7777.',
    '[27/10/2026, 14:40] Igor: A carga fica 450 reais e o filtro 80 reais. O split é 12 mil BTU.',
  ].join('\n'),
);
checar('não grava', feliz.grava, false);
checar('não envia', feliz.enviaMensagem, false);
checar('origem do arquivo', feliz.origem, ORIGEM_ARQUIVO);
checar('um cliente', feliz.clientes.map((c) => c.nome), ['Maria Souza']);
checar('telefone da Maria', feliz.clientes[0]?.telefone, '5511988887777');
checar('dois preços', feliz.precos.map((p) => p.valor), [450, 80]);
checar('moeda', feliz.precos[0]?.moeda, 'BRL');
verdadeiro('12 mil BTU não virou preço', !feliz.precos.some((p) => p.valor === 12000 || p.valor === 12));

const traco = rascunhoDe('27/10/2026 14:32 - João Lima: troca do capacitor por R$ 1.250,50');
checar('formato com traço', traco.clientes[0]?.nome, 'João Lima');
checar('milhar brasileiro', traco.precos[0]?.valor, 1250.5);

const mil = rascunhoDe('27/10/2026 14:32 - Igor: o VRF ficou 2 mil reais');
checar('mil reais', mil.precos[0]?.valor, 2000);
checar('a conta não vira cliente', mil.clientes.length, 0);

const cortesia = rascunhoDe('27/10/2026 14:32 - Igor: visita de cortesia');
checar('cortesia falada pode ser zero', cortesia.precos[0]?.valor, 0);

const gratis = rascunhoDe('27/10/2026 14:32 - Igor: a revisão foi de graça');
checar('de graça pode ser zero', gratis.precos[0]?.valor, 0);

const semPreco = rascunhoDe('[27/10/2026, 14:32] Maria Souza: troca de capacitor');
checar('sem preço não inventa item', semPreco.precos.length, 0);
checar('sem preço ainda cadastra a pessoa', semPreco.clientes[0]?.nome, 'Maria Souza');

const continuacao = rascunhoDe(
  ['[27/10/2026, 14:32] Maria Souza: pode vir amanhã', 'a carga fica 90 reais'].join('\n'),
);
checar('continuação fica na mesma pessoa', continuacao.clientes.length, 1);
checar('preço na linha de baixo', continuacao.precos[0]?.valor, 90);

console.log('\n6) MINIMIZAÇÃO');
const comCpf = rascunhoDe(
  '[27/10/2026, 14:32] Maria Souza: CPF 111.444.777-35 e o fone (11) 98888-7777. A visita é 70 reais.',
);
checar('CPF entra na lista do que saiu', comCpf.descartado.includes('cpf'), true);
jsonSem('CPF formatado', comCpf, '111.444.777-35');
jsonSem('CPF só dígitos', comCpf, '11144477735');
checar('telefone segue', comCpf.clientes[0]?.telefone, '5511988887777');
checar('preço segue depois do CPF', comCpf.precos[0]?.valor, 70);

const comCnpj = rascunhoDe('[27/10/2026, 14:32] Maria Souza: CNPJ 11.444.777/0001-61');
checar('CNPJ descartado', comCnpj.descartado.includes('cnpj'), true);
jsonSem('CNPJ', comCnpj, '11444777000161');
jsonSem('CNPJ formatado', comCnpj, '11.444.777/0001-61');

const comCartao = rascunhoDe(
  '[27/10/2026, 14:32] Maria Souza: aceita cartão 4111 1111 1111 1111 e a visita fica 80 reais',
);
checar('cartão descartado', comCartao.descartado.includes('cartao'), true);
jsonSem('PAN', comCartao, '4111111111111111');
jsonSem('PAN espaçado', comCartao, '4111 1111 1111 1111');
checar('a palavra cartão sem número não apaga o preço', comCartao.precos[0]?.valor, 80);

const comPix = rascunhoDe(
  '[27/10/2026, 14:32] Igor: chave pix maria@example.com e a visita 80 reais',
);
checar('pix descartado', comPix.descartado.includes('pix'), true);
jsonSem('e-mail da chave', comPix, 'maria@example.com');
checar('preço no pix sem chave falsa', comPix.precos[0]?.valor, 80);

const pixSemChave = rascunhoDe('[27/10/2026, 14:32] Igor: pago no pix, fica 80 reais');
checar('a palavra pix não vira descarte', pixSemChave.descartado.includes('pix'), false);
checar('preço com a palavra pix', pixSemChave.precos[0]?.valor, 80);

const saude = rascunhoDe(
  '[27/10/2026, 14:32] Maria Souza: tenho alergia e a consulta foi 200 reais',
);
checar('saúde descartada', saude.descartado, ['dado_sensivel']);
checar('preço da mensagem sensível não entra', saude.precos.length, 0);
jsonSem('alergia', saude, 'alergia');
jsonSem('200 da consulta', saude, '200');
checar('o nome da pessoa continua', saude.clientes[0]?.nome, 'Maria Souza');

const soDocumento = rascunhoDe('111.444.777-35');
checar('documento solto não vira cliente', soDocumento.clientes.length, 0);
checar('documento solto avisa o descarte', soDocumento.descartado, ['cpf']);

console.log('\n7) NÃO CHUTAR E NÃO CRIAR SEM DONO');
const grupo = rascunhoDe(
  [
    '[27/10/2026, 14:32] Maria Souza: oi',
    '[27/10/2026, 14:33] João Lima: oi',
    '[27/10/2026, 14:34] Igor: o número é (11) 98888-7777',
  ].join('\n'),
);
checar('grupo tem as duas pessoas', grupo.clientes.map((c) => c.nome), ['Maria Souza', 'João Lima']);
checar('telefone do grupo não é chutado', grupo.clientes.map((c) => c.telefone), [null, null]);

const umSo = rascunhoDe(
  [
    '[27/10/2026, 14:32] Maria Souza: pode vir',
    '[27/10/2026, 14:34] Igor: teu número (11) 98888-7777, a carga fica 450 reais',
  ].join('\n'),
);
checar('com uma pessoa o telefone cola nela', umSo.clientes[0]?.telefone, '5511988887777');
checar('preço da conta entra', umSo.precos[0]?.valor, 450);

const prefereODela = rascunhoDe(
  [
    '[27/10/2026, 14:32] Maria Souza: meu telefone é (11) 98888-7777',
    '[27/10/2026, 14:34] Igor: liga no (21) 97777-6666',
  ].join('\n'),
);
checar('o telefone que ela falou ganha', prefereODela.clientes[0]?.telefone, '5511988887777');

const semDono = rascunhoDe('[27/10/2026, 14:32] Maria Souza: a carga fica 80 reais', { nomeDaConta: ' ' });
checar('sem nome da conta não cria cliente', semDono.clientes.length, 0);
checar('sem nome da conta o preço ainda aparece', semDono.precos[0]?.valor, 80);

console.log('\n8) CONTEÚDO, VAZIO E TAMANHO');
const proibido = estudarConversa(
  pedido({ texto: '[27/10/2026, 14:32] Maria Souza: MARCADOR-PROIBIDO criança sexo' }),
);
checar('conteúdo proibido', proibido, { ok: false, motivo: 'conteudo_proibido' });
jsonSem('proibido', proibido, 'MARCADOR-PROIBIDO');
jsonSem('proibido não devolve o nome', proibido, 'Maria');

const separado = rascunhoDe(
  [
    '[27/10/2026, 14:32] Maria Souza: a criança está em casa',
    '[27/10/2026, 14:33] Igor: a carga fica 80 reais',
  ].join('\n'),
);
checar('palavras em mensagens diferentes não derrubam o preço', separado.precos[0]?.valor, 80);

checar('vazio', estudarConversa(pedido({ texto: '   ' })), { ok: false, motivo: 'vazio' });
checar('sem formato não inventa cliente', estudarConversa(pedido({ texto: 'oi Maria' })), { ok: false, motivo: 'vazio' });

const longo = estudarConversa(pedido({ texto: `z${'a'.repeat(TEXTO_MAX)}` }));
checar('texto longo demais', longo, { ok: false, motivo: 'excesso' });

console.log('\n9) O QUE ESTE BRANCH NÃO MEXE');
const fonte = ler('src/services/whatsappCadastroConsentimento.ts');
for (const trecho of ['process.env', 'fetch(', 'WebSocket', 'baileys', 'whatsapp-web', 'puppeteer', 'wrangler']) {
  verdadeiro(`fonte sem ${trecho}`, !fonte.includes(trecho));
}
verdadeiro('app não chama o módulo', !ler('App.tsx').includes('whatsappCadastroConsentimento'));
verdadeiro('worker não chama o módulo', !ler('worker/src/index.js').includes('whatsappCadastroConsentimento'));
verdadeiro('política publicada não ganhou este texto', !ler('src/content/legal/privacidade.ts').includes('arquivo de conversa que você mesmo exportou'));
verdadeiro('eas.json sem a flag', !ler('eas.json').includes('WHATSAPP_CADASTRO'));
verdadeiro('app.json sem a flag', !ler('app.json').includes('WHATSAPP_CADASTRO'));

const spec = ler('docs/ENXAME/WHATSAPP_CADASTRO_AUTOMATICO.md');
verdadeiro('spec pede o parecer', spec.includes('Dr. Paulo'));
verdadeiro('spec cita a base', spec.includes('art. 7º, I'));
verdadeiro('spec manda não aplicar o SQL', spec.includes('NÃO APLICAR'));

const sql = ler('docs/ENXAME/sql/whatsapp_cadastro_consentimento_NAO_APLICAR.sql');
verdadeiro('SQL avisa que não é para aplicar', sql.includes('NÃO APLICAR'));
verdadeiro('SQL não tem coluna de conversa', !sql.includes('texto_conversa') && !sql.includes('mensagem'));
const migs = readdirSync(new URL('../supabase/migrations', import.meta.url));
verdadeiro(
  'SQL não está na pasta que o banco aplica',
  migs.every((nome) => !nome.includes('whatsapp_cadastro_consentimento')),
);

checar('Pro continua 3900 centavos', PRECO_PRO.mensalCentavos, 3900);
checar('Empresa continua 9900 centavos', PRECO_EMPRESA.mensalCentavos, 9900);

console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
