/**
 * Código de erro vira orçamento em 1 toque (jogada B2).
 *
 *     node scripts/teste-orcamento-do-defeito.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - itens sugeridos por família de defeito, ligados ao CATÁLOGO do prestador
 *    (nome e preço dele); sem item parecido → sem preço (nunca preço inventado);
 *  - defeito de placa sugere DIAGNÓSTICO da placa, nunca "troca de placa";
 *  - "sobrecarga" não vira carga de gás; status/"operação normal" não vira peça;
 *  - o laudo diz causa provável + "confirmado com teste" e leva o equipamento do QR;
 *  - toda a base offline (assets/codigos_erro.json) gera rascunho sem lançar;
 *  - a tela, a rota e o editor estão ligados a isso (contrato de código).
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CodigoErro } from '../src/types/index.ts';
import {
  MAX_ITENS_SUGERIDOS,
  casarNoCatalogo,
  familiasDoCodigo,
  itensParaPrefill,
  linhaDoEquipamento,
  montarLaudoDoDefeito,
  montarRascunhoDoDefeito,
  normalizarTexto,
  totalSugerido,
} from '../src/utils/orcamentoDoDefeito.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

let verificacoes = 0;
function ok(nome: string, fn: () => void) {
  fn();
  verificacoes += 1;
  console.log(`  ok   ${nome}`);
}

function codigo(p: Partial<CodigoErro>): CodigoErro {
  return {
    id: 1, marca: 'Midea', familia: 'Split Hi-Wall', tipo: 'Split', codigo: 'E5', exibicao: 'Display',
    falha: '', catBruta: '', catApp: '', severidade: 'Alta', causa: '', acao: '', confianca: 'Alta',
    fonteId: 'S1', url: '', obs: '', ...p,
  };
}

const sensorE5 = codigo({
  codigo: 'E5', catApp: 'Sensor/Termistor', catBruta: 'Sensor',
  falha: 'Falha no sensor de temperatura da serpentina', causa: 'Termistor aberto ou em curto, conector solto',
  acao: 'Medir a resistência do sensor e conferir o conector',
});
const SERVICOS = [
  { id: 's1', nome: 'Visita técnica', preco: 120 },
  { id: 's2', nome: 'Troca de sensor', preco: 180 },
  { id: 's3', nome: 'Carga de gás R410A', preco: 350 },
  { id: 's4', nome: 'Limpeza completa split', preco: 200 },
];
const PRODUTOS = [
  { id: 'p1', nome: 'Termistor universal 10k', preco: 35, unidade: 'un' },
  { id: 'p2', nome: 'Capacitor 35uF', preco: 45 },
];

console.log('\n1) itens ligados ao catálogo do prestador');
ok('sensor: visita + termistor + troca, com os preços DELE', () => {
  const r = montarRascunhoDoDefeito({ codigo: sensorE5, servicos: SERVICOS, produtos: PRODUTOS });
  assert.deepEqual(r.itens.map((i) => i.chave), ['visita_diagnostico', 'sensor_temperatura', 'troca_sensor']);
  const [visita, termistor, troca] = r.itens;
  assert.equal(visita.origem, 'catalogo'); assert.equal(visita.preco, 120); assert.equal(visita.catalogoId, 's1');
  assert.equal(termistor.nome, 'Termistor universal 10k'); assert.equal(termistor.tipo, 'produto'); assert.equal(termistor.preco, 35);
  assert.equal(troca.nome, 'Troca de sensor'); assert.equal(troca.preco, 180);
  assert.equal(r.comPrecoDoCatalogo, 3);
  assert.equal(totalSugerido(r.itens), 335);
});
ok('catálogo vazio: os mesmos itens, SEM preço (nada inventado)', () => {
  const r = montarRascunhoDoDefeito({ codigo: sensorE5, servicos: [], produtos: [] });
  assert.equal(r.itens.length, 3);
  for (const i of r.itens) {
    assert.equal(i.origem, 'sugestao');
    assert.equal(i.preco, 0);
    assert.equal(i.catalogoId, undefined);
  }
  assert.equal(r.comPrecoDoCatalogo, 0);
  assert.equal(totalSugerido(r.itens), 0);
});
ok('catálogo inválido (null/lixo) não lança', () => {
  const r = montarRascunhoDoDefeito({ codigo: sensorE5, servicos: null, produtos: undefined });
  assert.ok(r.itens.length > 0);
  const lixo = montarRascunhoDoDefeito({ codigo: sensorE5, servicos: [{ id: '', nome: '', preco: Number.NaN }] as never });
  assert.ok(lixo.itens.every((i) => i.preco === 0));
});
ok('preço negativo/NaN no catálogo vira "sem preço", não R$ -10', () => {
  const r = montarRascunhoDoDefeito({ codigo: sensorE5, servicos: [{ id: 's1', nome: 'Visita', preco: -10 }], produtos: [] });
  assert.equal(r.itens[0].origem, 'catalogo');
  assert.equal(r.itens[0].preco, 0);
});
ok('um item do catálogo não é usado duas vezes', () => {
  const r = montarRascunhoDoDefeito({ codigo: sensorE5, servicos: [{ id: 'x', nome: 'Sensor geral', preco: 50 }], produtos: [] });
  const ids = r.itens.map((i) => i.catalogoId).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
});
ok('busca sem acento e do termo mais específico para o genérico', () => {
  assert.equal(normalizarTexto('  Diagnóstico   ÉLÉTRICO '), 'diagnostico eletrico');
  const achado = casarNoCatalogo({ termosCatalogo: ['carga de gas', 'gas'] }, [
    { id: 'a', nome: 'Gás para solda', preco: 10 },
    { id: 'b', nome: 'Carga de Gás R32', preco: 300 },
  ]);
  assert.equal(achado?.id, 'b');
  assert.equal(casarNoCatalogo({ termosCatalogo: ['bomba de dreno'] }, PRODUTOS), null);
});
ok('procura no outro tipo quando o prestador cadastrou diferente', () => {
  const gas = codigo({ catApp: 'Circuito frigorífico', falha: 'Baixa carga de refrigerante', causa: 'Falta de gás, vazamento' });
  const r = montarRascunhoDoDefeito({ codigo: gas, servicos: [], produtos: [{ id: 'pg', nome: 'Carga de gás R32', preco: 280 }] });
  const carga = r.itens.find((i) => i.chave === 'carga_gas');
  assert.equal(carga?.catalogoId, 'pg');
  assert.equal(carga?.tipo, 'produto');
});
ok(`no máximo ${MAX_ITENS_SUGERIDOS} itens`, () => {
  const tudo = codigo({ catApp: 'Proteção elétrica/Inverter', falha: 'Falha do motor ventilador e placa', causa: 'Capacitor, sujeira na serpentina, sensor, dreno' });
  assert.ok(montarRascunhoDoDefeito({ codigo: tudo }).itens.length <= MAX_ITENS_SUGERIDOS);
});

console.log('\n2) honestidade técnica');
ok('placa/inverter: diagnóstico da placa, nunca "troca de placa"', () => {
  const placa = codigo({ catApp: 'Placa/EEPROM', falha: 'Erro de EEPROM', causa: 'Placa com defeito' });
  const r = montarRascunhoDoDefeito({
    codigo: placa,
    servicos: [{ id: 't', nome: 'Troca de placa', preco: 900 }, { id: 'd', nome: 'Reparo de placa', preco: 250 }],
  });
  const diag = r.itens.find((i) => i.chave === 'diagnostico_placa');
  assert.equal(diag?.catalogoId, 'd', 'o reparo do catálogo entra; a troca não');
  assert.equal(r.itens.some((i) => /troca de placa/i.test(i.nome)), false);
  assert.match(diag?.motivo ?? '', /Testar a placa antes de trocar/);
  // Só "Troca de placa" no catálogo: a sugestão fica sem preço, não vira troca.
  const so = montarRascunhoDoDefeito({ codigo: placa, servicos: [{ id: 't', nome: 'Troca de placa', preco: 900 }] });
  assert.equal(so.itens.find((i) => i.chave === 'diagnostico_placa')?.origem, 'sugestao');
});
ok('"sobrecarga" não vira carga de gás', () => {
  const sobre = codigo({ catApp: 'Proteção elétrica', falha: 'Sobrecarga de corrente no compressor', causa: 'Tensão baixa' });
  assert.equal(familiasDoCodigo(sobre).includes('refrigerante'), false);
  assert.ok(familiasDoCodigo(sobre).includes('eletrica'));
});
ok('"operação normal" (status) só leva a visita', () => {
  const st = codigo({ codigo: '00', catApp: 'Status/Diagnóstico', falha: 'Operação normal', causa: 'Sem falha detectada' });
  assert.deepEqual(montarRascunhoDoDefeito({ codigo: st }).itens.map((i) => i.chave), ['visita_diagnostico']);
});
ok('laudo: código, causa provável, procedimento e "confirmado com teste"', () => {
  const laudo = montarLaudoDoDefeito(sensorE5);
  assert.match(laudo, /Defeito apresentado: código E5 \(Midea Split Hi-Wall\): Falha no sensor/);
  assert.match(laudo, /Causa provável: Termistor aberto/);
  assert.match(laudo, /Procedimento: Medir a resistência/);
  assert.match(laudo, /confirmado com teste no local/);
  assert.equal(/confiança|base offline|OLLI/i.test(laudo), false, 'o laudo é para o cliente: sem jargão interno');
});
ok('laudo leva o equipamento do QR', () => {
  const eq = { fabricante: 'Midea', modelo: 'Xtreme 12', capacidadeBtu: 12000, numeroSerie: 'AB123', localizacao: 'Sala 2' };
  assert.equal(linhaDoEquipamento(eq), 'Midea Xtreme 12 · 12.000 BTU/h · nº de série AB123 · Sala 2');
  assert.match(montarLaudoDoDefeito(sensorE5, eq), /^Equipamento: Midea Xtreme 12/);
  assert.equal(linhaDoEquipamento(null), '');
});
ok('prefill: sem preço vai sem precoSugerido; com catálogo leva catalogoId', () => {
  const r = montarRascunhoDoDefeito({ codigo: sensorE5, servicos: SERVICOS, produtos: [] });
  const p = itensParaPrefill(r.itens);
  const termistor = p.find((i) => i.nome === 'Sensor de temperatura (termistor)');
  assert.ok(termistor && termistor.precoSugerido === undefined && termistor.catalogoId === undefined);
  const visita = p.find((i) => i.nome === 'Visita técnica');
  assert.equal(visita?.precoSugerido, 120);
  assert.equal(visita?.catalogoId, 's1');
});

console.log('\n3) a base offline inteira');
ok('todo código da base gera rascunho com a visita e laudo, sem lançar', () => {
  const base = JSON.parse(ler('assets/codigos_erro.json')) as Array<Record<string, string>>;
  assert.ok(base.length > 600);
  let comPeca = 0;
  base.forEach((r, i) => {
    const c = codigo({ ...r, id: i } as Partial<CodigoErro>);
    const rasc = montarRascunhoDoDefeito({ codigo: c });
    assert.equal(rasc.itens[0].chave, 'visita_diagnostico');
    assert.ok(rasc.itens.length <= MAX_ITENS_SUGERIDOS);
    assert.ok(rasc.laudoTecnico.length > 0);
    if (rasc.itens.length > 1) comPeca += 1;
  });
  // A grande maioria dos códigos tem família reconhecida (não é só "visita").
  assert.ok(comPeca / base.length > 0.85, `só ${comPeca}/${base.length} com sugestão além da visita`);
});

console.log('\n4) contrato de código: tela, rota e editor ligados');
const tela = ler('src/screens/DiagnosticoScreen.tsx');
const rotas = ler('src/navigation/AppNavigator.tsx');
const editor = ler('src/screens/NovoOrcamentoScreen.tsx');
const equip = ler('src/screens/EquipamentoScreen.tsx');
ok('o detalhe do código tem "Gerar orçamento deste defeito" com o rascunho', () => {
  assert.match(tela, /label="Gerar orçamento deste defeito"/);
  assert.match(tela, /montarRascunhoDoDefeito\(\{/);
  assert.match(tela, /prefillItems: itensParaPrefill\(r\.itens\)/);
  assert.match(tela, /laudoTecnico: r\.laudoTecnico/);
  assert.equal(tela.includes('Criar orçamento com este reparo'), false, 'o botão antigo (1 item genérico) saiu');
});
ok('catálogo em 3 estados (erro não vira "sem itens") e dica da 1ª vez', () => {
  assert.match(tela, /estado: 'erro'/);
  assert.match(tela, /Não consegui ler o seu catálogo agora/);
  assert.match(tela, /id="diagnostico\.orcamento-do-defeito"/);
});
ok('veio do QR: cliente do equipamento vai junto; falha do QR é dita', () => {
  assert.match(tela, /clienteId: atendimento\.equipamento\.clienteId/);
  assert.match(tela, /Não consegui abrir o equipamento do QR/);
  assert.match(rotas, /Diagnostico: \{ equipamentoId\?: string \} \| undefined/);
  assert.match(equip, /nav\.navigate\('Diagnostico', \{ equipamentoId \}\)/);
  // Base de códigos é de ar-condicionado: o atalho só aparece para o ofício (gate de vertical).
  assert.match(equip, /\{mostraHvac \? \(\s*<OlliButton\s*label="Código de erro deste equipamento"/);
});
ok('o editor aceita laudo e catalogoId no pré-preenchimento', () => {
  assert.match(rotas, /laudoTecnico\?: string \}/);
  assert.match(rotas, /catalogoId\?: string;/);
  assert.match(editor, /laudoTecnico: laudo/);
  assert.match(editor, /catalogoId: typeof item\.catalogoId === 'string' \? item\.catalogoId : ''/);
});

console.log(`\nPASSOU: ${verificacoes} verificações\n`);
