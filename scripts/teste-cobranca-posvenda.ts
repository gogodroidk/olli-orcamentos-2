/**
 * Cobrança e pós-venda com 1 toque — o que vai para o CLIENTE do prestador.
 *
 * Trava: (1) o Pix Copia e Cola (chave reconhecida, CRC, txid, valor) e a regra de
 * "sem chave → sem Pix, nunca Pix vazio"; (2) a mensagem de cobrança (valor
 * formatado, referência, saldo em pagamento parcial); (3) o registro "cobrado hoje";
 * (4) a regra de "Clientes para lembrar" por ofício; (5) a migration do "Já paguei".
 * O link público (worker) tem o teste gêmeo em worker/scripts/teste-link-pix.js.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  crc16,
  gerarPixCopiaECola,
  normalizarChavePix,
  pixCopiaEColaValido,
  cpfValido,
  cnpjValido,
} from '../src/utils/pixBrCode.ts';
import {
  avisoPix,
  enviadoHoje,
  lerMapaEnvios,
  ordenarParaCobrar,
  prepararCobranca,
  registrarEnvio,
} from '../src/utils/cobrancaCliente.ts';
import {
  DIAS_ENTRE_LEMBRETES,
  listarClientesParaLembrar,
  mensagemLembrete,
  msDoRecibo,
  retornoDoOficio,
  somarMeses,
} from '../src/utils/posVenda.ts';
import { VERTICAIS, VERTICAL_GERAL } from '../src/services/verticais.ts';
import type { Empresa, Orcamento } from '../src/types/index.ts';

let passos = 0;
function caso(nome: string, fn: () => void) {
  fn();
  passos++;
  console.log(`  ok  ${nome}`);
}

const PIX_GUI = '0014br.gov.bcb.pix';

// ─── 1. BR Code ──────────────────────────────────────────────────────────────
caso('CRC16-CCITT bate com o vetor de referência e com o exemplo do manual do BACEN', () => {
  assert.equal(crc16('123456789'), '29B1');
  const exemploBacen =
    '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000' +
    '5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
  assert.equal(crc16(exemploBacen), '1D3D');
  assert.ok(pixCopiaEColaValido(exemploBacen + '1D3D'));
});

caso('chave Pix: CPF, CNPJ, e-mail, celular e aleatória viram o formato do DICT', () => {
  assert.equal(cpfValido('52998224725'), true);
  assert.equal(cpfValido('11111111111'), false);
  assert.equal(cnpjValido('11222333000181'), true);
  assert.deepEqual(normalizarChavePix('529.982.247-25'), { chave: '52998224725', tipo: 'cpf' });
  assert.deepEqual(normalizarChavePix('11.222.333/0001-81'), { chave: '11222333000181', tipo: 'cnpj' });
  assert.deepEqual(normalizarChavePix(' Joao.Silva@Exemplo.com.br '), { chave: 'joao.silva@exemplo.com.br', tipo: 'email' });
  assert.deepEqual(normalizarChavePix('(11) 98888-7777'), { chave: '+5511988887777', tipo: 'telefone' });
  assert.deepEqual(normalizarChavePix('11988887777'), { chave: '+5511988887777', tipo: 'telefone' });
  assert.deepEqual(normalizarChavePix('+55 11 98888-7777'), { chave: '+5511988887777', tipo: 'telefone' });
  assert.deepEqual(
    normalizarChavePix('123E4567-E12B-12D1-A456-426655440000'),
    { chave: '123e4567-e12b-12d1-a456-426655440000', tipo: 'aleatoria' },
  );
});

caso('chave Pix duvidosa NÃO é reconhecida (fail-closed)', () => {
  for (const ruim of ['', '   ', '123', '111.111.111-11', '11.111.111/1111-11', 'pix do joão', 'joao@', '<script>', '+1 555 1234567']) {
    assert.equal(normalizarChavePix(ruim), null, `deveria recusar: ${JSON.stringify(ruim)}`);
  }
});

caso('BR Code gerado é válido, com valor em 2 casas e txid só alfanumérico', () => {
  const codigo = gerarPixCopiaECola({ chave: '+5511988887777', valor: 1234.5, nome: 'Refrigeração São João', cidade: 'São Paulo', txid: '2026-0012' });
  assert.ok(pixCopiaEColaValido(codigo));
  assert.ok(codigo.includes('54071234.50'), 'valor 1234.50 no campo 54');
  assert.ok(codigo.includes('6212050820260012'), 'txid "20260012" (sem hífen) no campo 62/05');
  assert.ok(codigo.includes('5921REFRIGERACAO SAO JOAO'), 'nome sem acento, maiúsculo');
  assert.ok(!codigo.includes('-0012'));
});

caso('BR Code adulterado (1 dígito do valor) é recusado pela conferência', () => {
  const codigo = gerarPixCopiaECola({ chave: '52998224725', valor: 150, nome: 'X', cidade: 'Y', txid: '1' });
  assert.ok(pixCopiaEColaValido(codigo));
  const adulterado = codigo.replace('150.00', '160.00');
  assert.notEqual(adulterado, codigo);
  assert.equal(pixCopiaEColaValido(adulterado), false);
  assert.equal(pixCopiaEColaValido(''), false);
  assert.equal(pixCopiaEColaValido('000201'), false);
});

// ─── 2. Mensagem de cobrança ─────────────────────────────────────────────────
function orc(parcial: Partial<Orcamento> = {}): Orcamento {
  return {
    id: 'o1', numero: '2026-0012', clienteId: 'c1', clienteNome: 'Maria Souza', clienteTelefone: '11999990000',
    itens: [], subtotalServicos: 0, subtotalProdutos: 0, subtotal: 1234.5, desconto: 0, descontoTipo: 'valor',
    valorTotal: 1234.5, status: 'aprovado', dataEmissao: '2026-09-01', formasPagamento: {} as Orcamento['formasPagamento'],
    exibirAssinatura: true, solicitarAssinaturaCliente: false, exibirAprovacao: true, exibirRecusa: true,
    criadoEm: '2026-09-01T12:00:00Z', atualizadoEm: '2026-09-20T12:00:00Z',
    ...parcial,
  } as Orcamento;
}
function empresa(chavePix: string): Empresa {
  return { nome: 'Frio Bom', nomePrestador: 'Carlos', cidade: 'Campinas', chavePix } as Empresa;
}
const reais = (txt: string, valor: string) => new RegExp(`R\\$\\s${valor.replace(/\./g, '\\.')}`).test(txt);

caso('cobrança COM chave: valor formatado, nº do orçamento e Pix válido com o valor', () => {
  const c = prepararCobranca({ orcamento: orc(), empresa: empresa('529.982.247-25'), diasParado: 10 });
  assert.equal(c.situacaoPix, 'com_pix');
  assert.ok(pixCopiaEColaValido(c.pixCopiaECola));
  assert.ok(c.pixCopiaECola.includes('0111' + '52998224725'), 'chave normalizada (sem máscara) no BR Code');
  assert.ok(c.texto.includes(c.pixCopiaECola), 'o Pix vai no texto');
  assert.ok(c.texto.trim().endsWith(c.pixCopiaECola), 'Pix sozinho na última linha (fácil de copiar)');
  assert.ok(reais(c.texto, '1.234,50'), 'valor em pt-BR');
  assert.ok(c.texto.includes('nº 2026-0012'));
  assert.ok(c.texto.startsWith('Olá, Maria!'));
  assert.ok(c.texto.includes('10 dias'), 'tom escalonado cita os dias');
  assert.equal(avisoPix(c.situacaoPix), null);
});

caso('cobrança SEM chave: nunca manda Pix vazio e pede cadastro', () => {
  const c = prepararCobranca({ orcamento: orc(), empresa: empresa(''), diasParado: 1 });
  assert.equal(c.situacaoPix, 'sem_chave');
  assert.equal(c.pixCopiaECola, '');
  assert.ok(!c.texto.includes(PIX_GUI) && !c.texto.includes('Pix copiando'));
  assert.ok(c.texto.includes('forma de pagamento'));
  assert.equal(avisoPix(c.situacaoPix)?.acao, 'Cadastrar chave Pix');
  // Sem empresa carregada: mesmo comportamento, sem lançar.
  assert.equal(prepararCobranca({ orcamento: orc(), empresa: null, diasParado: 0 }).situacaoPix, 'sem_chave');
});

caso('cobrança com chave INVÁLIDA: sem Pix e pede para conferir', () => {
  const c = prepararCobranca({ orcamento: orc(), empresa: empresa('meu pix'), diasParado: 3 });
  assert.equal(c.situacaoPix, 'chave_invalida');
  assert.ok(!c.texto.includes(PIX_GUI));
  assert.equal(avisoPix(c.situacaoPix)?.acao, 'Conferir chave Pix');
});

caso('chave do ORÇAMENTO vence a da empresa', () => {
  const c = prepararCobranca({ orcamento: orc({ chavePix: 'cobranca@frio.com' }), empresa: empresa('529.982.247-25'), diasParado: 0 });
  assert.ok(c.pixCopiaECola.includes('cobranca@frio.com'));
});

caso('pagamento PARCIAL: mensagem diz quanto falta e o Pix leva só o saldo', () => {
  const c = prepararCobranca({ orcamento: orc({ valorTotal: 1000 }), empresa: empresa('529.982.247-25'), diasParado: 4, valorEmAberto: 600 });
  assert.ok(c.pixCopiaECola.includes('5406600.00'), 'Pix com R$ 600,00');
  assert.ok(!c.pixCopiaECola.includes('1000.00'));
  assert.ok(reais(c.texto, '1.000,00') && reais(c.texto, '600,00'));
  assert.ok(/Falta R\$\s600,00/.test(c.texto));
  assert.equal(c.valor, 600);
});

caso('orçamento sem valor: sem Pix (não gera cobrança de R$ 0)', () => {
  const c = prepararCobranca({ orcamento: orc({ valorTotal: 0 }), empresa: empresa('529.982.247-25'), diasParado: 0 });
  assert.equal(c.situacaoPix, 'sem_valor');
  assert.equal(c.pixCopiaECola, '');
});

// ─── 3. Registro de envio ────────────────────────────────────────────────────
caso('registro "cobrado hoje": grava, reconhece o mesmo dia e poda o velho', () => {
  const agora = new Date(2026, 8, 30, 15, 0);
  const velho = new Date(2026, 0, 1).toISOString();
  const mapa = registrarEnvio({ antigo: velho, lixo: 'x' as string }, 'o1', agora);
  assert.deepEqual(Object.keys(mapa), ['o1'], 'podou o de 9 meses e o valor ilegível');
  assert.equal(enviadoHoje(mapa.o1, agora), true);
  assert.equal(enviadoHoje(mapa.o1, new Date(2026, 9, 1, 8, 0)), false, 'no dia seguinte volta a cobrar');
  assert.equal(enviadoHoje(null, agora), false);
  assert.deepEqual(lerMapaEnvios(['x']), {});
  assert.deepEqual(lerMapaEnvios({ a: 1, b: '2026-09-30T10:00:00Z' }), { b: '2026-09-30T10:00:00Z' });
});

caso('radar: quem ainda não foi cobrado hoje vem antes; dentro do grupo, o mais parado', () => {
  const lista = ordenarParaCobrar([
    { id: 'a', diasParado: 20, cobradoHoje: true },
    { id: 'b', diasParado: 2, cobradoHoje: false },
    { id: 'c', diasParado: 9, cobradoHoje: false },
  ]);
  assert.deepEqual(lista.map(i => i.id), ['c', 'b', 'a']);
});

// ─── 4. Clientes para lembrar ────────────────────────────────────────────────
caso('todo ofício tem intervalo de retorno e serviço nomeado', () => {
  for (const v of [...VERTICAIS, VERTICAL_GERAL]) {
    assert.ok(v.retorno.meses >= 1 && Number.isInteger(v.retorno.meses), v.id);
    assert.ok(v.retorno.servico.trim().length > 5, v.id);
  }
  assert.equal(retornoDoOficio(['refrigeracao']).meses, 6);
  assert.equal(retornoDoOficio(['eletrica', 'refrigeracao']).meses, 12, 'o ofício principal manda');
  assert.equal(retornoDoOficio(undefined).meses, 6, 'sem ofício = 6 meses (o ritmo antigo do radar)');
  assert.equal(retornoDoOficio([]).vertical, 'geral');
});

caso('somarMeses não transborda o fim do mês', () => {
  const base = new Date(2026, 7, 31, 12).getTime(); // 31/08/2026
  const d = new Date(somarMeses(base, 6));
  assert.equal(d.getMonth(), 1);
  assert.equal(d.getDate(), 28);
});

caso('data do recibo em DD/MM/AAAA não é lida como MM/DD', () => {
  const t = msDoRecibo('10/07/2026', '2026-09-01T00:00:00Z');
  const d = new Date(t as number);
  assert.equal(d.getUTCMonth(), 6);
  assert.equal(d.getUTCDate(), 10);
  assert.equal(msDoRecibo('31/02/2026', '2026-09-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z').getTime(), 'data impossível cai na criação');
  assert.equal(msDoRecibo(undefined, undefined), null);
});

const agora = new Date(2026, 8, 30, 12);
const mesesAtras = (m: number, dias = 0) => {
  const d = new Date(agora);
  d.setMonth(d.getMonth() - m);
  d.setDate(d.getDate() - dias);
  return d.getTime();
};
const clientes = [
  { id: 'ana', nome: 'Ana Lima', telefone: '11911112222' },
  { id: 'bia', nome: 'Bia', telefone: '11933334444' },
  { id: 'caio', nome: 'Caio', telefone: '' },
  { id: 'davi', nome: 'Davi', telefone: '11955556666' },
  { id: 'eva', nome: 'Eva', telefone: '11977778888' },
];

caso('pra lembrar: só quem teve serviço concluído há >= intervalo do ofício', () => {
  const lista = listarClientesParaLembrar({
    clientes,
    servicos: [
      { clienteId: 'ana', quando: mesesAtras(7) },      // venceu (6)
      { clienteId: 'bia', quando: mesesAtras(5) },      // ainda não
      { clienteId: 'caio', quando: mesesAtras(6, 1) },  // venceu ontem
      { clienteId: 'davi', quando: mesesAtras(9) },
      { clienteId: 'davi', quando: mesesAtras(1) },     // serviço recente zera o ciclo
      { clienteId: 'fantasma', quando: mesesAtras(12) },// cliente excluído: não entra
      { clienteId: 'ana', quando: null },               // data ilegível: ignorada
    ],
    mesesIntervalo: 6,
    agora,
  });
  assert.deepEqual(lista.map(c => c.id), ['ana', 'caio'], 'mais atrasado primeiro');
  assert.equal(lista[0].meses, 7);
  assert.equal(lista[0].nome, 'Ana Lima');
});

caso('pra lembrar: intervalo do ofício muda quem entra (elétrica 12 meses)', () => {
  const lista = listarClientesParaLembrar({
    clientes,
    servicos: [{ clienteId: 'ana', quando: mesesAtras(7) }, { clienteId: 'eva', quando: mesesAtras(13) }],
    mesesIntervalo: retornoDoOficio(['eletrica']).meses,
    agora,
  });
  assert.deepEqual(lista.map(c => c.id), ['eva']);
});

caso('lembrado há pouco sai da lista; lembrete velho ou de ciclo anterior não bloqueia', () => {
  const base = { clientes, mesesIntervalo: 6, agora, servicos: [{ clienteId: 'ana', quando: mesesAtras(8) }, { clienteId: 'eva', quando: mesesAtras(8) }] };
  const recente = new Date(agora.getTime() - 3 * 86_400_000).toISOString();
  const velho = new Date(agora.getTime() - (DIAS_ENTRE_LEMBRETES + 1) * 86_400_000).toISOString();
  const lista = listarClientesParaLembrar({ ...base, lembrados: { ana: recente, eva: velho } });
  assert.deepEqual(lista.map(c => c.id), ['eva'], 'ana foi lembrada há 3 dias: não insiste');
  assert.equal(lista[0].lembradoEm, velho);
  // Lembrete ANTERIOR ao último serviço é de outro ciclo: não conta.
  const cicloVelho = new Date(mesesAtras(9)).toISOString();
  assert.deepEqual(listarClientesParaLembrar({ ...base, lembrados: { ana: cicloVelho } }).map(c => c.id).sort(), ['ana', 'eva']);
  // Adiado pelo prestador (vigente) também sai.
  const ate = new Date(agora.getTime() + 5 * 86_400_000).toISOString();
  assert.deepEqual(listarClientesParaLembrar({ ...base, adiados: { eva: ate } }).map(c => c.id), ['ana']);
});

caso('mensagem de lembrete: nome, meses, serviço do ofício e o prestador', () => {
  const msg = mensagemLembrete({ nome: 'Ana Lima', meses: 7 }, ['refrigeracao'], 'Carlos da Frio Bom');
  assert.ok(msg.startsWith('Oi, Ana! Aqui é Carlos da Frio Bom.'));
  assert.ok(msg.includes('7 meses'));
  assert.ok(msg.includes('a limpeza do ar-condicionado'));
  const semNome = mensagemLembrete({ nome: 'Bia', meses: 1 }, undefined, null);
  assert.ok(semNome.includes('Tudo bem?') && semNome.includes('1 mês') && semNome.includes('uma revisão do serviço'));
});

// ─── 5. Migration do "Já paguei" ─────────────────────────────────────────────
caso('migration: coluna pagamento_informado_em + CHECK com pagamento_informado', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260930120000_link_pagamento_informado.sql', import.meta.url), 'utf8');
  assert.match(sql, /add column if not exists pagamento_informado_em timestamptz/);
  assert.match(sql, /check \(evento in \('visualizado', 'aprovado', 'recusado', 'pagamento_informado'\)\)/);
  assert.match(sql, /drop constraint if exists eventos_orcamento_publico_evento_check/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)/i, 'nenhuma escrita nova para authenticated');
});

console.log(`\nteste-cobranca-posvenda: ${passos} casos OK`);
