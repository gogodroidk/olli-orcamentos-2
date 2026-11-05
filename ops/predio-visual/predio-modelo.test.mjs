import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  agrupar,
  arquivoRosto,
  ceuDaHora,
  conversasNovas,
  cortar,
  empresasDeCimaParaBaixo,
  fichaMesa,
  mesmaFila,
  resumo,
  textoResumo,
  textoSinal,
  validarEstado,
} from './predio-modelo.mjs';

const mapa = JSON.parse(readFileSync(new URL('./andares.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const leia = readFileSync(new URL('./LEIA.md', import.meta.url), 'utf8');
const pacote = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

function contraste(hexA, hexB) {
  const canal = (cor) => {
    const valor = cor / 255;
    return valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = (hex) => {
    const numero = Number.parseInt(hex.slice(1), 16);
    const r = canal((numero >> 16) & 255);
    const g = canal((numero >> 8) & 255);
    const b = canal(numero & 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const clara = Math.max(luminancia(hexA), luminancia(hexB));
  const escura = Math.min(luminancia(hexA), luminancia(hexB));
  return (clara + 0.05) / (escura + 0.05);
}

test('três andares, de cima para baixo, sem empresa inventada', () => {
  assert.deepEqual(
    empresasDeCimaParaBaixo(mapa).map((empresa) => empresa.id),
    ['grtech', 'servicos', 'orcamentos'],
  );
  const agentes = [
    { id: 'a', nome: 'Ana', andar: 'tech' },
    { id: 'b', nome: 'Bia', andar: 'vendas' },
    { id: 'c', nome: 'Caio', andar: 'criacao' },
    { id: 'd', nome: 'Duda', andar: 'fantasma' },
  ];
  const grupos = agrupar(agentes, mapa);
  assert.equal(grupos.andares.find((andar) => andar.id === 'orcamentos').pessoas[0].id, 'a');
  assert.equal(grupos.andares.find((andar) => andar.id === 'servicos').pessoas[0].id, 'b');
  assert.equal(grupos.andares.find((andar) => andar.id === 'grtech').pessoas[0].id, 'c');
  assert.deepEqual(grupos.semMapa.map((agente) => agente.id), ['d']);
  assert.equal(grupos.andares.length, 3);
});

test('as nove áreas conhecidas entram em uma empresa só', () => {
  const areas = ['diretoria', 'tech', 'produto', 'marketing', 'vendas', 'operacoes', 'legal', 'pesquisa', 'criacao'];
  for (const area of areas) {
    const donos = Object.values(mapa.empresas).filter((empresa) => empresa.areas.includes(area));
    assert.equal(donos.length, 1, area);
  }
});

test('mesa usa o estado real e não promove desconhecido a trabalhando', () => {
  const ficha = fichaMesa(
    { id: 'a', nome: 'Ana Paula', papel: 'Jurídico', status: 'bloqueado', tarefa: 'Parecer longo demais para o balão da mesa inteiro' },
    { a: 'paulo-juridico.webp' },
  );
  assert.equal(ficha.status, 'bloqueado');
  assert.equal(ficha.monitor, 'bloqueado');
  assert.equal(ficha.balao.startsWith('! '), true);
  assert.equal(ficha.balao.length <= 42, true);
  assert.equal(ficha.iniciais, 'AP');
  assert.equal(fichaMesa({ id: 'p', nome: 'Dr. Paulo', status: 'parado' }, {}).iniciais, 'P');
  assert.equal(ficha.rosto, 'rostos/paulo-juridico.webp');
  assert.match(ficha.aria, /bloqueado/);
  const estranho = fichaMesa({ id: 'z', nome: 'Zé', status: 'inventado', tarefa: '' }, {});
  assert.equal(estranho.status, 'sem estado');
  assert.equal(estranho.monitor, 'apagado');
  assert.equal(estranho.balao, '—');
});

test('rosto rejeita URL e caminho fora da pasta', () => {
  assert.equal(arquivoRosto({ id: 'a', rosto: 'https://exemplo.test/a.webp' }, {}), null);
  assert.equal(arquivoRosto({ id: 'a', rosto: 'rostos/../segredo.webp' }, {}), null);
  assert.equal(arquivoRosto({ id: 'a' }, { a: '../segredo.webp' }), null);
  assert.equal(arquivoRosto({ id: 'a', rosto: 'rostos/a.webp' }, {}), 'rostos/a.webp');
});

test('contagem, sinal e conversa nova não inventam gente', () => {
  assert.deepEqual(resumo([{ status: 'trabalhando' }, { status: 'parado' }, { status: 'bloqueado' }, { status: 'outro' }]), {
    trabalhando: 1,
    parado: 1,
    bloqueado: 1,
    outro: 1,
  });
  assert.equal(textoSinal({ ok: false, agoraMs: 0, ultimoOkMs: 0 }), 'sem sinal');
  assert.equal(textoSinal({ ok: false, agoraMs: 12_000, ultimoOkMs: 2_000 }), 'sem sinal há 10 s');
  assert.equal(textoSinal({ ok: true, agoraMs: 1, ultimoOkMs: 0 }), 'atualizado agora');
  assert.equal(textoResumo({ trabalhando: 2, parado: 1, bloqueado: 1 }), '2 trabalhando · 1 parado · 1 bloqueado');
  const vistas = new Set(['c1']);
  const novas = conversasNovas(vistas, [{ id: 'c1', de: 'a', para: 'b' }, { id: 'c2', de: 'b', para: 'a' }]);
  assert.deepEqual(novas.map((conversa) => conversa.id), ['c2']);
  assert.equal(validarEstado({ agentes: [{ id: 1, nome: 'não' }, { id: 'a', nome: 'Ana' }], conversas: 'não' }).agentes.length, 1);
  assert.equal(validarEstado(null), null);
  assert.equal(mesmaFila([{ id: 'a' }], [{ id: 'a' }]), true);
  assert.equal(mesmaFila([{ id: 'a' }], [{ id: 'b' }]), false);
  assert.equal(cortar('abc', 2), 'a…');
});

test('céu local muda por hora, sem rede', () => {
  assert.equal(ceuDaHora(6), 'dia');
  assert.equal(ceuDaHora(15), 'dia');
  assert.equal(ceuDaHora(16), 'tarde');
  assert.equal(ceuDaHora(18), 'tarde');
  assert.equal(ceuDaHora(19), 'noite');
  assert.equal(ceuDaHora(5), 'noite');
});

test('a página não busca modelo, não usa dado fictício e declara o teste', () => {
  assert.equal(html.includes('MOCK'), false);
  assert.equal(/fetch\(\s*['"]https?:/.test(html), false);
  assert.equal(/src\s*=\s*['"]https?:/.test(html), false);
  assert.equal(html.includes('https://'), false);
  assert.equal(html.includes('EventSource'), false);
  assert.equal(html.includes('WebSocket'), false);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /lerJson\('estado\.json'\)/);
  assert.match(html, /lerJson\('andares\.json'\)/);
  assert.match(html, /lerJson\('rostos\.json'\)/);
  assert.equal((html.match(/fetch\(/g) || []).length, 1);
  assert.match(html, /document\.hidden/);
  assert.match(html, /noindex/);
  assert.match(html, /Sala em montagem\./);
  assert.match(html, /atualizarSala\('sem-mapa', grupos\.semMapa\)/);
  assert.match(leia, /python3 -m http\.server 8766 --bind 127\.0\.0\.1/);
  for (const par of [
    ['#F4F7FB', '#16233F'],
    ['#FECACA', '#4A1D24'],
    ['#0A1020', '#67E8F9'],
  ]) {
    assert.equal(html.includes(par[0]), true, par[0]);
    assert.equal(html.includes(par[1]), true, par[1]);
    assert.equal(contraste(par[0], par[1]) >= 4.5, true, par.join(' '));
  }
  assert.match(pacote.scripts.test, /test:predio-visual/);
  assert.match(pacote.scripts['test:predio-visual'], /ops\/predio-visual\/predio-modelo\.test\.mjs/);
});
