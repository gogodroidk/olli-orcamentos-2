/**
 * Aba Integrações (D1438-G14).
 *
 * O catálogo é a fonte da tela. O teste trava três coisas:
 * - tudo que a aba oferece custa zero para a OLLI;
 * - "já no OLLI" aponta para uma rota que existe, e "em breve" não tem ação;
 * - a página, o menu e a rota foram registrados juntos.
 *
 *     node scripts/teste-integracoes-d1438.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FORA_DESTA_LEVA,
  INTEGRACOES,
  ROTAS_INTEGRACAO,
  listarDisponiveis,
  listarEmBreve,
} from '../webapp/src/pages/olli/integracoes/catalogo.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

const ids = INTEGRACOES.map((item) => item.id);
assert.equal(new Set(ids).size, ids.length, 'id repetido no catálogo');
assert.ok(INTEGRACOES.length >= 6, 'catálogo curto demais para a aba');

for (const item of INTEGRACOES) {
  assert.equal(item.custoOlli, 'zero', `${item.id} não pode ter custo para a OLLI`);
  assert.equal(item.nome.trim().length > 0 && item.resumo.trim().length > 0 && item.detalhe.trim().length > 0, true, `${item.id} sem texto`);
  assert.doesNotMatch(`${item.nome} ${item.resumo} ${item.detalhe} ${item.rotuloAcao ?? ''}`, /conectar|cole a chave|api key|senha do google/i, `${item.id} promete uma ligação que não existe`);
  assert.doesNotMatch(`${item.nome} ${item.detalhe}`, /R\$\s*39|R\$\s*99/, `${item.id} mexe em preço publicado`);
}

const disponiveis = listarDisponiveis();
assert.ok(disponiveis.length >= 4, 'pouco do que já existe');
for (const item of disponiveis) {
  assert.equal(item.estado, 'disponivel');
  assert.equal(item.prioridade, null, `${item.id} disponível não entra na fila de construção`);
  assert.ok(item.rota && (ROTAS_INTEGRACAO as readonly string[]).includes(item.rota), `${item.id} sem rota real`);
  assert.ok(item.rotuloAcao && item.rotuloAcao.length > 0, `${item.id} sem rótulo de ação`);
}

const emBreve = listarEmBreve();
assert.deepEqual(emBreve.map((item) => item.prioridade), emBreve.map((_, indice) => indice + 1), 'prioridade da fila em breve precisa ser 1, 2, 3… sem buraco');
for (const item of emBreve) {
  assert.equal(item.estado, 'em_breve');
  assert.equal(item.rota, undefined, `${item.id} em breve não abre tela`);
  assert.equal(item.rotuloAcao, undefined, `${item.id} em breve não tem botão`);
  assert.match(item.detalhe, /não|ainda/i, `${item.id} precisa dizer que ainda não funciona`);
}

const idsFora = new Set(FORA_DESTA_LEVA.map((item) => item.id));
assert.equal(idsFora.size, FORA_DESTA_LEVA.length, 'id repetido fora da leva');
for (const item of FORA_DESTA_LEVA) {
  assert.equal(ids.includes(item.id), false, `${item.id} não pode estar na fila e fora dela`);
  assert.match(item.motivo, /cobr|mensalidade|taxa|paga/i, `${item.id} saiu da leva sem motivo de custo`);
}

const pagina = ler('../webapp/src/pages/olli/integracoes/index.tsx');
const rotas = ler('../webapp/src/routes/sections/dashboard/frontend.tsx');
const menu = ler('../webapp/src/layouts/dashboard/nav/nav-data/nav-data-frontend.tsx');
const agenda = ler('../webapp/src/pages/olli/agenda/index.tsx');
const recibos = ler('../webapp/src/pages/olli/recibos/index.tsx');
const negocio = ler('../webapp/src/pages/olli/meu-negocio/index.tsx');

assert.match(pagina, /listarDisponiveis/);
assert.match(pagina, /listarEmBreve/);
assert.match(pagina, /FORA_DESTA_LEVA/);
assert.match(pagina, /Já no OLLI/);
assert.match(pagina, /Em breve/);
assert.match(pagina, /Fora desta leva/);
assert.doesNotMatch(pagina, /Conectar|type="password"|cole a chave/i);
assert.match(pagina, /item\.estado === "disponivel"/, 'botão só no que já existe');
assert.match(rotas, /path: "integracoes"/);
assert.match(rotas, /\/pages\/olli\/integracoes/);
assert.match(menu, /title: "Integrações"/);
assert.match(menu, /path: "\/integracoes"/);
assert.match(agenda, /Adicionar no Google Agenda/);
assert.match(agenda, /Baixar evento \(\.ics\)/);
assert.match(recibos, /Preparar nota fiscal/);
assert.match(negocio, /Chave Pix/);
assert.match(negocio, /Link de avaliação no Google/);

console.log('OK — aba Integrações: o que já existe, em breve sem botão, e o que fica de fora por custo.');
