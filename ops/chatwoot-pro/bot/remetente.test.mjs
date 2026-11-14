import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenDoMapa } from './remetente.js';

test('usa o token da caixa quando o mapa tem a chave', () => {
  assert.equal(tokenDoMapa({ 'OLLI Orçamentos': 'livia', 'GR Tech': 'caio' }, 'GR Tech', 'antigo'), 'caio');
});

test('sem mapa ou sem a caixa, segue o token único', () => {
  assert.equal(tokenDoMapa(null, 'GR Tech', 'antigo'), 'antigo');
  assert.equal(tokenDoMapa({}, 'Segundo Andar', 'antigo'), 'antigo');
  assert.equal(tokenDoMapa({ 'GR Tech': '' }, 'GR Tech', 'antigo'), 'antigo');
  assert.equal(tokenDoMapa({ 'GR Tech': 'caio' }, 'Pessoal do Igor', 'antigo'), 'antigo');
});
