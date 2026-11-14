import test from 'node:test';
import assert from 'node:assert/strict';
import { corpoEtiqueta, corpoVisao, garantirVisao, ETIQUETA, NOME_VISAO } from './visao.mjs';

test('a visão salva filtra a etiqueta interessado e não manda mensagem', () => {
  const etiqueta = corpoEtiqueta();
  const visao = corpoVisao();
  assert.equal(etiqueta.title, ETIQUETA);
  assert.equal(etiqueta.show_on_sidebar, true);
  assert.equal(visao.custom_filter.name, NOME_VISAO);
  assert.equal(visao.custom_filter.filter_type, 'conversation');
  assert.deepEqual(visao.custom_filter.query.payload[0].values, ['interessado']);
  assert.equal(JSON.stringify(visao).includes('/messages'), false);
});

test('garantir a visão só cria o que falta', async () => {
  const chamadas = [];
  const api = async (metodo, caminho, corpo) => {
    chamadas.push({ metodo, caminho, corpo });
    if (caminho === '/labels') return { payload: [{ title: 'prospeccao' }] };
    if (caminho.startsWith('/custom_filters')) return [];
    return { ok: true };
  };
  const r = await garantirVisao(api);
  assert.equal(r.etiquetaNova, true);
  assert.equal(r.visaoNova, true);
  assert.equal(chamadas.filter((c) => c.metodo === 'POST').length, 2);
  assert.equal(chamadas.some((c) => String(c.caminho).includes('messages')), false);

  const deNovo = [];
  const apiCheia = async (metodo, caminho) => {
    deNovo.push(metodo + caminho);
    if (caminho === '/labels') return [{ title: 'interessado' }];
    return [{ name: 'Interessados' }];
  };
  const s = await garantirVisao(apiCheia);
  assert.equal(s.etiquetaNova, false);
  assert.equal(s.visaoNova, false);
  assert.equal(deNovo.some((c) => c.startsWith('POST')), false);
});
