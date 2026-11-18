// Etiqueta e visão salva no Chatwoot. Não envia mensagem.

import { ETIQUETA, NOME_VISAO } from './interesse.mjs';

export { ETIQUETA, NOME_VISAO };

export function listaDe(resposta) {
  if (Array.isArray(resposta)) return resposta;
  if (Array.isArray(resposta?.payload)) return resposta.payload;
  if (Array.isArray(resposta?.data?.payload)) return resposta.data.payload;
  if (Array.isArray(resposta?.data)) return resposta.data;
  return [];
}

export function corpoEtiqueta() {
  return {
    title: ETIQUETA,
    description: 'OLLI Serviços: pediu preço, pediu para ver ou aceitou conversa. O Igor olha. Sem preço na mensagem.',
    color: '#F7B23B',
    show_on_sidebar: true,
  };
}

export function corpoVisao() {
  return {
    custom_filter: {
      name: NOME_VISAO,
      filter_type: 'conversation',
      query: {
        payload: [
          {
            attribute_key: 'labels',
            filter_operator: 'equal_to',
            values: [ETIQUETA],
            query_operator: null,
          },
        ],
      },
    },
  };
}

export async function garantirVisao(api) {
  const labels = listaDe(await api('GET', '/labels')).map((l) => l.title || l.name);
  let etiquetaNova = false;
  if (!labels.includes(ETIQUETA)) {
    await api('POST', '/labels', corpoEtiqueta());
    etiquetaNova = true;
  }
  const filtros = listaDe(await api('GET', '/custom_filters?filter_type=conversation'));
  const existe = filtros.some((f) => (f.name || f.title) === NOME_VISAO);
  let visaoNova = false;
  if (!existe) {
    await api('POST', '/custom_filters', corpoVisao());
    visaoNova = true;
  }
  return { etiquetaNova, visaoNova, etiqueta: ETIQUETA, visao: NOME_VISAO };
}
