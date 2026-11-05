/**
 * Cliente mínimo do POST /v1/systemone. Contrato público em docs.typesafe.ai/api.
 * A chave entra só pelo argumento. Erro nunca devolve o valor dela.
 * Preço de lista em docs.typesafe.ai/models.md: US$ 0,042 por milhão de tokens
 * de entrada; saída não cobra. Não há faixa grátis publicada.
 */

export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const MODELO = 'jev-latest';
export const PRECO_USD_POR_TOKEN = 0.042 / 1e6;

export type Uso = {
  input_tokens?: number;
  output_tokens?: number;
};

export type RespostaJev = {
  model?: string;
  answers: Record<string, unknown>;
  usage?: Uso;
};

export type OpcoesSystemone = {
  chave: string;
  state: string;
  questions: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  tentativas?: number;
  esperar?: (ms: number) => Promise<void>;
};

function semChave(texto: string, chave: string): string {
  const limpo = chave ? texto.split(chave).join('[redigido]') : texto;
  return limpo.slice(0, 180);
}

const esperarPadrao = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function custoUsd(tokensEntrada: number): number {
  return tokensEntrada * PRECO_USD_POR_TOKEN;
}

export async function systemone(opcoes: OpcoesSystemone): Promise<RespostaJev> {
  const chave = opcoes.chave.trim();
  if (!chave) throw new Error('sem chave');
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const tentativas = opcoes.tentativas ?? 4;
  const esperar = opcoes.esperar ?? esperarPadrao;
  let ultimo = 'falha sem resposta';
  for (let i = 0; i < tentativas; i++) {
    const resposta = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${chave}`,
      },
      body: JSON.stringify({
        model: MODELO,
        state: opcoes.state,
        questions: opcoes.questions,
      }),
    });
    if (resposta.ok) {
      const json = (await resposta.json()) as RespostaJev;
      if (!json || typeof json !== 'object' || !json.answers) {
        throw new Error('resposta sem answers');
      }
      return json;
    }
    const corpo = semChave(await resposta.text(), chave);
    ultimo = `HTTP ${resposta.status}: ${corpo}`;
    if ((resposta.status === 429 || resposta.status === 529) && i < tentativas - 1) {
      await esperar(1000 * 2 ** i);
      continue;
    }
    throw new Error(ultimo);
  }
  throw new Error(ultimo);
}
