/**
 * Triagem de lead e leitura de uma ideia.
 * Manda só o texto mascarado. SAIR e dado sensível não saem da máquina.
 * O retorno ordena uma fila humana. Não há ação de contato.
 */

import { custoUsd, systemone, type RespostaJev, type Uso } from './cliente.ts';
import { aindaTemIdentificador, prepararTexto } from './limpar.ts';
import { PERGUNTAS_IDEIA, PERGUNTAS_LEAD } from './perguntas.ts';
import {
  decisaoLocal,
  pontuarIdeia,
  triarPelasRespostas,
  type Decisao,
  type PontuacaoIdeia,
  type RespostaChoice,
  type RespostaNoul,
  type RespostaScore,
} from './probabilidade.ts';

export type ResultadoLead = {
  decisao: Decisao;
  textoEnviado: string | null;
  usage: Uso | null;
  custoUsd: number;
  modelo: string | null;
};

type Deps = {
  chave: string;
  fetchImpl?: typeof fetch;
  tentativas?: number;
  esperar?: (ms: number) => Promise<void>;
};

function embrulho(decisao: Decisao): ResultadoLead {
  return { decisao, textoEnviado: null, usage: null, custoUsd: 0, modelo: null };
}

export async function classificarLead(texto: string, deps: Deps): Promise<ResultadoLead> {
  const prep = prepararTexto(texto);
  if (prep.optOut) return embrulho(decisaoLocal('saida'));
  if (prep.sensivel) return embrulho(decisaoLocal('dado_sensivel'));
  if (aindaTemIdentificador(prep.texto)) return embrulho(decisaoLocal('limpeza_incompleta'));
  const resp = await systemone({
    chave: deps.chave,
    state: prep.texto,
    questions: PERGUNTAS_LEAD,
    fetchImpl: deps.fetchImpl,
    tentativas: deps.tentativas,
    esperar: deps.esperar,
  });
  return deResposta(prep.texto, resp);
}

function deResposta(texto: string, resp: RespostaJev): ResultadoLead {
  const tokens = resp.usage?.input_tokens ?? 0;
  return {
    decisao: triarPelasRespostas(resp.answers),
    textoEnviado: texto,
    usage: resp.usage ?? null,
    custoUsd: custoUsd(tokens),
    modelo: typeof resp.model === 'string' ? resp.model : null,
  };
}

export async function classificarIdeia(id: string, texto: string, deps: Deps): Promise<PontuacaoIdeia | null> {
  const prep = prepararTexto(texto);
  if (prep.optOut || prep.sensivel || aindaTemIdentificador(prep.texto)) return null;
  const resp = await systemone({
    chave: deps.chave,
    state: prep.texto,
    questions: PERGUNTAS_IDEIA,
    fetchImpl: deps.fetchImpl,
    tentativas: deps.tentativas,
    esperar: deps.esperar,
  });
  const answers = resp.answers;
  return pontuarIdeia(id, {
    impacto: answers.impacto as RespostaScore | undefined,
    risco_legal: answers.risco_legal as RespostaNoul | undefined,
    esforco: answers.esforco as RespostaChoice | undefined,
  });
}
