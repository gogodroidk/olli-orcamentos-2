/**
 * Verificador de probabilidade do Jev: limpeza, triagem e ranking.
 * Não chama a rede. A classificação paga fica em scripts/jev-classificar-uma.ts.
 *
 *     node scripts/teste-jev-verificador.ts
 */
import assert from 'node:assert/strict';
import { classificarIdeia, classificarLead } from './jev-verificador/classificar.ts';
import { ENDPOINT, MODELO, systemone } from './jev-verificador/cliente.ts';
import { aindaTemIdentificador, prepararTexto } from './jev-verificador/limpar.ts';
import { PERGUNTAS_IDEIA, PERGUNTAS_LEAD, TEXTO_SINTETICO_LEAD } from './jev-verificador/perguntas.ts';
import { ordenarIdeias, pontuarIdeia, triarPelasRespostas, valorEsperado } from './jev-verificador/probabilidade.ts';

const CHAVE = 'chave-falsa-de-teste';

function respostaHttp(status: number, corpo: string): Response {
  return new Response(corpo, { status, headers: { 'content-type': 'application/json' } });
}

function answersLead(parcial: {
  pedido?: number;
  curiosidade?: number;
  reclamacao?: number;
  fora?: number;
  saida?: number;
  confInt?: number;
  urg?: [number, number, number];
  confUrg?: number;
  noul?: number;
}) {
  const pedido = parcial.pedido ?? 0;
  const curiosidade = parcial.curiosidade ?? 0;
  const reclamacao = parcial.reclamacao ?? 0;
  const fora = parcial.fora ?? 0;
  const saida = parcial.saida ?? 0;
  const urg = parcial.urg ?? [0, 0, 1];
  return {
    intencao: {
      type: 'choice',
      choice: 'pedido_servico',
      confidence: parcial.confInt ?? 0.9,
      probabilities: {
        pedido_servico: pedido,
        curiosidade,
        reclamacao,
        fora_do_nicho: fora,
        saida,
      },
    },
    urgencia: {
      type: 'score',
      score: 2,
      confidence: parcial.confUrg ?? 0.9,
      probabilities: { '0': urg[0], '1': urg[1], '2': urg[2] },
    },
    opt_out: { type: 'noul', noul: parcial.noul ?? 0.02 },
  };
}

function fetchQueFalharia(): typeof fetch {
  return async () => {
    throw new Error('a rede não devia ser chamada');
  };
}

const prep = prepararTexto(
  'João joao@exemplo.com tel 11 98888-7777 cpf 123.456.789-09 cnpj 12.345.678/0001-90 cep 01310-100 https://exemplo.com/a',
);
assert.equal(prep.texto.includes('joao@exemplo.com'), false);
assert.equal(prep.texto.includes('98888'), false);
assert.equal(prep.texto.includes('123.456.789-09'), false);
assert.equal(prep.texto.includes('12.345.678'), false);
assert.equal(prep.texto.includes('01310-100'), false);
assert.equal(prep.texto.includes('https://'), false);
assert.equal(prep.mascarou, true);
assert.equal(aindaTemIdentificador(prep.texto), false);

assert.equal(prepararTexto('o ar da loja parou de gelar ontem').optOut, false);
assert.equal(prepararTexto('SAIR por favor').optOut, true);
assert.equal(prepararTexto('meu filho está com calor').sensivel, true);

const sintetico = prepararTexto(TEXTO_SINTETICO_LEAD);
assert.equal(sintetico.optOut, false);
assert.equal(sintetico.sensivel, false);
assert.equal(sintetico.mascarou, false);
assert.equal(PERGUNTAS_LEAD.intencao.type, 'choice');
assert.equal(PERGUNTAS_LEAD.urgencia.type, 'score');
assert.equal(PERGUNTAS_LEAD.opt_out.type, 'noul');
assert.equal(PERGUNTAS_IDEIA.impacto.type, 'score');

const semRede = await classificarLead('SAIR', { chave: CHAVE, fetchImpl: fetchQueFalharia() });
assert.equal(semRede.decisao.acao, 'descartar');
assert.equal(semRede.decisao.motivo, 'saida');
assert.equal(semRede.decisao.chamaApi, false);
assert.equal(semRede.textoEnviado, null);

const sensivel = await classificarLead('meu filho pediu orçamento', {
  chave: CHAVE,
  fetchImpl: fetchQueFalharia(),
});
assert.equal(sensivel.decisao.motivo, 'dado_sensivel');
assert.equal(sensivel.decisao.chamaApi, false);

let corpoEnviado = '';
let autorizacao = '';
const mascarado = await classificarLead('quero orçamento no email joao@exemplo.com hoje', {
  chave: CHAVE,
  tentativas: 1,
  fetchImpl: async (url, init) => {
    assert.equal(String(url), ENDPOINT);
    const headers = init?.headers as Record<string, string>;
    autorizacao = headers.authorization;
    corpoEnviado = String(init?.body);
    return respostaHttp(
      200,
      JSON.stringify({
        model: 'jev-1.14.0',
        answers: answersLead({ pedido: 0.86, curiosidade: 0.1, fora: 0.04, urg: [0, 0.2, 0.8], confInt: 0.8, confUrg: 0.75 }),
        usage: { input_tokens: 400, output_tokens: 40 },
      }),
    );
  },
});
const jsonEnviado = JSON.parse(corpoEnviado) as { model: string; state: string };
assert.equal(jsonEnviado.model, MODELO);
assert.equal(jsonEnviado.state.includes('joao@exemplo.com'), false);
assert.equal(jsonEnviado.state.includes('[EMAIL]'), true);
assert.equal(autorizacao, `Bearer ${CHAVE}`);
assert.equal(mascarado.decisao.acao, 'revisar_humano');
assert.equal(mascarado.decisao.motivo, 'triagem');
assert.equal(mascarado.decisao.chamaApi, true);
assert.ok(Math.abs((mascarado.decisao.urgenciaEsperada ?? 0) - 1.8) < 1e-9);
assert.ok(Math.abs(mascarado.decisao.prioridade - 0.86 * (1 + 1.8)) < 1e-9);
assert.equal(mascarado.custoUsd, 400 * (0.042 / 1e6));
assert.notEqual(mascarado.decisao.acao, 'enviar');

const baixa = triarPelasRespostas(
  answersLead({ pedido: 0.42, curiosidade: 0.4, fora: 0.18, confInt: 0.22, confUrg: 0.8, urg: [0.5, 0.3, 0.2] }),
);
assert.equal(baixa.motivo, 'confianca_baixa');
assert.equal(baixa.acao, 'revisar_humano');

const fora = triarPelasRespostas(
  answersLead({ pedido: 0.2, fora: 0.7, curiosidade: 0.1, confInt: 0.8, confUrg: 0.8 }),
);
assert.equal(fora.motivo, 'fora_do_nicho');
assert.equal(fora.acao, 'descartar');

const saidaModelo = triarPelasRespostas(
  answersLead({ pedido: 0.8, saida: 0.05, noul: 0.91, confInt: 0.9, confUrg: 0.9 }),
);
assert.equal(saidaModelo.motivo, 'saida');
assert.equal(saidaModelo.prioridade, 0);

assert.equal(triarPelasRespostas({ intencao: {} }).motivo, 'resposta_incompleta');

let tentativas = 0;
const esperas: number[] = [];
await systemone({
  chave: CHAVE,
  state: 'texto',
  questions: { opt_out: PERGUNTAS_LEAD.opt_out },
  tentativas: 2,
  esperar: async (ms) => {
    esperas.push(ms);
  },
  fetchImpl: async () => {
    tentativas += 1;
    if (tentativas === 1) return respostaHttp(429, `calma ${CHAVE}`);
    return respostaHttp(200, JSON.stringify({ model: 'jev-1.14.0', answers: { opt_out: { noul: 0.1 } }, usage: { input_tokens: 10 } }));
  },
});
assert.equal(tentativas, 2);
assert.deepEqual(esperas, [1000]);

await assert.rejects(
  () =>
    systemone({
      chave: CHAVE,
      state: 'texto',
      questions: {},
      tentativas: 1,
      fetchImpl: async () => respostaHttp(500, `vazou ${CHAVE} no corpo`),
    }),
  (erro: unknown) => {
    const msg = erro instanceof Error ? erro.message : String(erro);
    assert.equal(msg.includes(CHAVE), false);
    assert.equal(msg.includes('[redigido]'), true);
    assert.equal(msg.startsWith('HTTP 500'), true);
    return true;
  },
);

const ideiaA = pontuarIdeia('A', {
  impacto: { probabilities: { '0': 0.05, '1': 0.15, '2': 0.45, '3': 0.35 }, confidence: 0.4 },
  risco_legal: { noul: 0.2 },
  esforco: { choice: 'M', probabilities: { P: 0.2, M: 0.6, G: 0.2 }, confidence: 0.5 },
});
const ideiaB = pontuarIdeia('B', {
  impacto: { probabilities: { '0': 0, '1': 0.1, '2': 0.5, '3': 0.4 }, confidence: 0.8 },
  risco_legal: { noul: 0.9 },
  esforco: { choice: 'P', probabilities: { P: 0.8, M: 0.2, G: 0 }, confidence: 0.7 },
});
assert.ok(ideiaA && ideiaB);
assert.ok(Math.abs(ideiaA.impactoEsperado - valorEsperado({ '0': 0.05, '1': 0.15, '2': 0.45, '3': 0.35 })) < 1e-9);
assert.ok(ideiaB.impactoEsperado > ideiaA.impactoEsperado);
assert.equal(ideiaA.soPista, true);
assert.equal(ideiaB.soPista, false);
assert.equal(ideiaB.precisaParecer, true);
assert.equal(ideiaA.precisaParecer, false);
const ordem = ordenarIdeias([ideiaA, ideiaB]).map((item) => item.id);
assert.deepEqual(ordem, ['B', 'A']);

let stateIdeia = '';
const pontuada = await classificarIdeia('pmoc', 'seção curta de PMOC na landing, com preço de tabela', {
  chave: CHAVE,
  tentativas: 1,
  fetchImpl: async (_url, init) => {
    stateIdeia = JSON.parse(String(init?.body)).state as string;
    return respostaHttp(
      200,
      JSON.stringify({
        model: 'jev-1.14.0',
        answers: {
          impacto: { probabilities: { '0': 0, '1': 0.2, '2': 0.5, '3': 0.3 }, confidence: 0.7 },
          risco_legal: { noul: 0.1 },
          esforco: { choice: 'P', probabilities: { P: 0.7, M: 0.2, G: 0.1 }, confidence: 0.6 },
        },
        usage: { input_tokens: 120 },
      }),
    );
  },
});
assert.equal(stateIdeia.includes('PMOC'), true);
assert.equal(pontuada?.esforco, 'P');
assert.equal(pontuada?.precisaParecer, false);
assert.ok((pontuada?.impactoEsperado ?? 0) > 2);

const bloqueada = await classificarIdeia('x', 'meu filho quer um app', {
  chave: CHAVE,
  fetchImpl: fetchQueFalharia(),
});
assert.equal(bloqueada, null);

console.log('teste-jev-verificador: OK');
