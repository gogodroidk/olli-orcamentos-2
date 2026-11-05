/**
 * Prospecção no mapa (D-1438 G19).
 *
 *     node scripts/teste-prospeccao-mapa-d1438.ts
 *
 * Prova a regra (raio, rota, nicho, só dado da conta) e que a tela não chama
 * API paga do Google. Nenhuma rede.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { distanciaRetaKm } from '../src/services/etaEstimado.ts';
import {
  NICHO_SEM,
  NICHO_TODOS,
  TEXTO_ESQUEMA_PAINEL,
  TEXTO_SO_CADASTRO,
  clienteParaMapa,
  montarProspeccao,
  projetarNoRetangulo,
  textoKm,
  urlRotaProspeccao,
  type ClienteMapa,
} from '../src/utils/prospeccaoMapa.ts';

const ORIGEM = { lat: -23.561, lon: -46.656 };

function cliente(parcial: Partial<ClienteMapa> & Pick<ClienteMapa, 'id' | 'nome'>): ClienteMapa {
  return {
    endereco: `${parcial.nome}, São Paulo, SP`,
    cidade: 'São Paulo, SP',
    lat: null,
    lon: null,
    precisao: null,
    aproximado: false,
    nichos: [],
    ...parcial,
  };
}

const perto = cliente({
  id: 'perto',
  nome: 'Padaria do Zé',
  lat: -23.565,
  lon: -46.66,
  precisao: 'numero',
  nichos: [{ id: 'split', rotulo: 'Split' }],
});
const meio = cliente({
  id: 'meio',
  nome: 'Ana Refrigeração',
  lat: -23.59,
  lon: -46.68,
  precisao: 'rua',
  nichos: [{ id: 'split', rotulo: 'Split' }],
});
const longe = cliente({
  id: 'longe',
  nome: 'Oficina do Rio',
  endereco: 'Av. Rio Branco, 1, Rio de Janeiro, RJ',
  cidade: 'Rio de Janeiro, RJ',
  lat: -22.903,
  lon: -43.177,
  precisao: 'cidade',
  aproximado: true,
  nichos: [{ id: 'geladeira', rotulo: 'Geladeira' }],
});
const semPonto = cliente({ id: 'sem', nome: 'Sem endereço', endereco: '', nichos: [] });

function exigirPonto(c: ClienteMapa): { lat: number; lon: number } {
  if (c.lat === null || c.lon === null) throw new Error(`sem ponto: ${c.id}`);
  return { lat: c.lat, lon: c.lon };
}

const dPerto = distanciaRetaKm(ORIGEM, exigirPonto(perto));
const dMeio = distanciaRetaKm(ORIGEM, exigirPonto(meio));
const raioQueCabePertoEMeio = Math.max(dPerto, dMeio) + 0.05;

const base = montarProspeccao({
  origem: ORIGEM,
  clientes: [longe, semPonto, meio, perto],
  raioKm: raioQueCabePertoEMeio,
  nicho: NICHO_TODOS,
});

assert.deepEqual(base.dentro.map((i) => i.cliente.id), ['perto', 'meio'], 'vizinho mais próximo: o mais perto primeiro');
assert.equal(base.dentro[0].ordem, 1);
assert.ok(base.dentro[0].distanciaKm !== null && base.dentro[0].distanciaKm <= dPerto + 0.001);
assert.deepEqual(base.fora.map((i) => i.cliente.id), ['longe']);
assert.deepEqual(base.semPonto.map((c) => c.id), ['sem']);
assert.equal(base.raioAplicado, true);
assert.ok(base.kmLinhaReta !== null && base.kmLinhaReta > 0);
assert.equal(base.nichos.find((n) => n.id === 'split')?.quantidade, 2);
assert.equal(base.nichos.at(-1)?.id, NICHO_SEM);

const noLimite = montarProspeccao({
  origem: ORIGEM,
  clientes: [perto],
  raioKm: dPerto,
  nicho: NICHO_TODOS,
});
assert.equal(noLimite.dentro.length, 1, 'quem está exatamente no raio entra');

const soSplit = montarProspeccao({
  origem: ORIGEM,
  clientes: [perto, meio, longe, semPonto],
  raioKm: 50,
  nicho: 'split',
});
assert.deepEqual(soSplit.dentro.map((i) => i.cliente.id), ['perto', 'meio']);
assert.equal(soSplit.fora.length, 0, 'geladeira no Rio não é split, nem entra em fora');
assert.equal(soSplit.semPonto.length, 0);

const semEquipamento = montarProspeccao({
  origem: ORIGEM,
  clientes: [perto, semPonto],
  raioKm: 50,
  nicho: NICHO_SEM,
});
assert.deepEqual(semEquipamento.semPonto.map((c) => c.id), ['sem']);
assert.equal(semEquipamento.dentro.length, 0);

const semOrigem = montarProspeccao({
  origem: null,
  clientes: [longe, perto, semPonto],
  raioKm: 1,
  nicho: NICHO_TODOS,
});
assert.equal(semOrigem.raioAplicado, false);
assert.equal(semOrigem.fora.length, 0, 'sem posição, o raio não esconde ninguém');
assert.deepEqual(semOrigem.dentro.map((i) => i.cliente.nome), ['Oficina do Rio', 'Padaria do Zé']);
assert.equal(semOrigem.dentro[0].distanciaKm, null);
assert.equal(semOrigem.kmLinhaReta, null);

const origemNula = montarProspeccao({
  origem: { lat: 0, lon: 0 },
  clientes: [perto],
  raioKm: 10,
  nicho: NICHO_TODOS,
});
assert.equal(origemNula.raioAplicado, false, '0,0 não é a posição de ninguém');
assert.equal(origemNula.dentro[0].distanciaKm, null);

const raioLixo = montarProspeccao({
  origem: ORIGEM,
  clientes: [perto],
  raioKm: Number.NaN,
  nicho: NICHO_TODOS,
});
assert.equal(raioLixo.dentro.length, 0);
assert.equal(raioLixo.fora.length, 1);

const nichoQuebrado = montarProspeccao({
  origem: ORIGEM,
  clientes: [perto, longe],
  raioKm: 5,
  nicho: 'split',
  nichosConfiaveis: false,
});
assert.equal(nichoQuebrado.nichoIndisponivel, true);
assert.equal(nichoQuebrado.nichos.length, 0);
assert.equal(nichoQuebrado.dentro.length, 1, 'falha ao ler equipamento não finge que o split sumiu');

const empateA = cliente({ id: 'b', nome: 'Bruno', lat: -23.57, lon: -46.66, precisao: 'numero' });
const empateB = cliente({ id: 'a', nome: 'Ana', lat: -23.57, lon: -46.66, precisao: 'numero' });
const empate = montarProspeccao({
  origem: ORIGEM,
  clientes: [empateA, empateB],
  raioKm: 20,
  nicho: NICHO_TODOS,
});
assert.deepEqual(empate.dentro.map((i) => i.cliente.nome), ['Ana', 'Bruno'], 'empate de lugar: nome em pt-BR');

const convertido = clienteParaMapa({
  id: 'c1',
  nome: '  ',
  endereco: 'Rua A, 10',
  complemento: '',
  cidade: 'Campinas',
  estado: 'SP',
  cep: '13000-000',
  lat: 0,
  lon: 0,
  geoPrecisao: 'numero',
  nichos: ['Split', ' split ', null, ''],
}, { split: 'Split' });
assert.equal(convertido.nome, 'Cliente sem nome');
assert.equal(convertido.endereco, 'Rua A, 10, Campinas, SP, 13000-000');
assert.equal(convertido.lat, null, '0,0 não vira ponto');
assert.deepEqual(convertido.nichos, [{ id: 'split', rotulo: 'Split' }]);

const cidadeSo = clienteParaMapa({
  id: 'c2',
  nome: 'Mercado',
  cidade: 'Santos',
  estado: 'SP',
  lat: -23.96,
  lon: -46.33,
  geoPrecisao: 'cidade',
});
assert.equal(cidadeSo.aproximado, true);
assert.equal(cidadeSo.precisao, 'cidade');

const meia = clienteParaMapa({ id: 'c3', nome: 'Meia', lat: -23.5, lon: null, geoPrecisao: 'numero' });
assert.equal(meia.lat, null);

assert.equal(textoKm(0.4), '400 m');
assert.equal(textoKm(3.24), '3,2 km');
assert.equal(textoKm(null), '—');

const muitos = Array.from({ length: 11 }, (_, i) => `Rua ${i + 1}, Centro`);
const link = urlRotaProspeccao([...muitos, '', 'x']);
assert.equal(link.usadas, 10);
assert.equal(link.deForaDoLink, 1);
assert.equal(link.semEndereco, 2);
assert.ok(link.url?.startsWith('https://www.google.com/maps/dir/?api=1'));
assert.equal(link.url?.includes('key='), false);
assert.equal(link.url?.includes('maps.googleapis'), false);

const vazio = urlRotaProspeccao(['', 'a']);
assert.equal(vazio.url, null);

const tela = projetarNoRetangulo(
  [{ id: 'sul', lat: -24, lon: -46 }, { id: 'norte', lat: -23, lon: -46 }],
  640,
  360,
);
const norte = tela?.find((p) => p.id === 'norte');
const sul = tela?.find((p) => p.id === 'sul');
assert.ok(norte && sul);
assert.ok(norte.y < sul.y, 'norte fica acima');
assert.equal(projetarNoRetangulo([], 640, 360), null);
assert.equal(projetarNoRetangulo([{ id: 'so', lat: -23, lon: -46 }], 640, 360)?.[0].x, 320);

const telaApp = readFileSync('src/screens/ProspeccaoScreen.tsx', 'utf8');
const pagina = readFileSync('webapp/src/pages/olli/prospeccao/index.tsx', 'utf8');
const regra = readFileSync('src/utils/prospeccaoMapa.ts', 'utf8');
const nav = readFileSync('webapp/src/layouts/dashboard/nav/nav-data/nav-data-frontend.tsx', 'utf8');
const rotas = readFileSync('webapp/src/routes/sections/dashboard/frontend.tsx', 'utf8');
const stack = readFileSync('src/navigation/AppNavigator.tsx', 'utf8');
for (const arquivo of [telaApp, pagina, regra]) {
  assert.equal(/maps\.googleapis/i.test(arquivo), false, arquivo);
  assert.equal(/places\.googleapis/i.test(arquivo), false);
  assert.equal(/AIza/.test(arquivo), false);
  assert.equal(/EXPO_PUBLIC_MAPS_KEY/.test(arquivo), false);
  assert.equal(/maps\/api\/js/.test(arquivo), false);
}
assert.ok(telaApp.includes('TEXTO_SO_CADASTRO'));
assert.ok(pagina.includes('TEXTO_SO_CADASTRO'));
assert.ok(pagina.includes('TEXTO_ESQUEMA_PAINEL'));
assert.equal(TEXTO_SO_CADASTRO.includes('API paga'), true);
assert.equal(TEXTO_ESQUEMA_PAINEL.includes('Sem mapa de fundo'), true);
assert.ok(nav.includes('path: "/prospeccao"'));
assert.ok(rotas.includes('path: "prospeccao"'));
assert.ok(stack.includes('name="Prospeccao"'));
assert.equal(/(?<![\w$])fetch\(/.test(telaApp), false, 'a tela não geocodifica');
assert.equal(/(?<![\w$])fetch\(/.test(pagina), false, 'o painel não geocodifica');

console.log('ok prospeccao mapa D1438-G19');
