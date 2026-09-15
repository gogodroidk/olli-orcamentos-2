import assert from 'node:assert/strict';
import { limparBreadcrumbSentry, limparEventoSentry, redigirTextoSentry } from '../src/services/sentryScrub.ts';

console.log('\nSentry OLLI — redator de PII antes da rede');

const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMTExMTExMSJ9', 'assinatura_falsa_12345678'].join('.');
const original = {
  message: `Falha para cliente@exemplo.com, CPF 123.456.789-09, tel (11) 99999-8888, Bearer ${jwt}`,
  request: {
    method: 'post',
    url: 'https://app.olliorcamentos.online/orcamentos?id=123.456.789-09#segredo',
    headers: { authorization: `Bearer ${jwt}`, cookie: 'sessao=segredo' },
    data: { cliente: 'Pessoa Real', prompt: 'conteúdo privado' },
  },
  user: { email: 'cliente@exemplo.com', id: '111' },
  extra: { payload: 'orçamento completo' },
  contexts: { cliente: { nome: 'Pessoa Real' } },
  exception: { values: [{ type: 'Error', value: `token ${jwt} de cliente@exemplo.com` }] },
  breadcrumbs: [
    { category: 'ui.input', message: 'Rua particular, 10' },
    { category: 'console', message: 'cliente@exemplo.com' },
    { category: 'navigation', message: 'indo para /planos?email=cliente@exemplo.com', data: { token: jwt } },
  ],
};

const limpo = limparEventoSentry(original);
const serializado = JSON.stringify(limpo);
for (const proibido of ['cliente@exemplo.com', '123.456.789-09', '99999-8888', jwt, 'Pessoa Real', 'conteúdo privado', 'sessao=segredo', '?email=', '?id=', '#segredo']) {
  assert.equal(serializado.includes(proibido), false, `não pode sobreviver: ${proibido}`);
}
assert.equal('user' in limpo, false);
assert.equal('extra' in limpo, false);
assert.equal('contexts' in limpo, false);
assert.deepEqual(limpo.request, { method: 'POST', url: 'https://app.olliorcamentos.online/orcamentos' });
assert.equal((limpo.breadcrumbs as unknown[]).length, 1, 'input e console são descartados');
assert.equal(original.user.email, 'cliente@exemplo.com', 'o redator não muta o evento original');
assert.equal(limparBreadcrumbSentry({ category: 'ui.click', message: 'Cliente João' }), null);
assert.match(redigirTextoSentry('veja https://host.test/x?token=abc'), /^veja https:\/\/host\.test\/x$/);

console.log('PASSOU: PII, autenticação, corpos, contexto, query e breadcrumbs sensíveis removidos.');
