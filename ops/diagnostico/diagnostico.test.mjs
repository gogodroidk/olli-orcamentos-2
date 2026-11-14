import test from 'node:test';
import assert from 'node:assert/strict';
import { ofertaDaLacuna, ofertasDoTexto, carregarOfertas } from './catalogo.mjs';
import { classificar } from './sinais.mjs';
import { fraseDoDiagnostico, fraseSeLimpa } from './frase.mjs';
import { criarBusca, motivoUrl, robotsPermite } from './buscar.mjs';
import { concluir } from './diagnostico.mjs';
import { anexarDiagnostico } from './cache.mjs';
import { mascarar, relatorioMarkdown } from './relatorio.mjs';
import { idLocal, lerLeadsCsv, nichoLocal } from './rodar.mjs';

const PROIBIDO = [
  /R\$\s*\d/,
  /\bgaranto\b/i,
  /100\s*%/,
  /todo cliente na hora/i,
  /OLLI Orçamentos/i,
  /Receita Federal/i,
  /\bdobr/i,
];

const PAGINA = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>
<a href="https://wa.me/5511999999999">WhatsApp</a>
<a href="https://instagram.com/oficina">Instagram</a>
<a href="https://www.google.com/maps?q=oficina">Mapa</a>
<form action="/contato"><input type="email" name="email"></form>
<a href="mailto:contato@oficina.com.br">email</a>
</body></html>`;

function leitura(html, finalUrl = 'https://oficina.com.br/') {
  return { motivo: '', status: 200, finalUrl, html, site: finalUrl };
}

function lead(extra = {}) {
  return { id: 'abc123abc123', nome: 'Oficina do Ar', cidade: 'São Paulo - SP', nicho: 'refrigeracao', ...extra };
}

test('página completa vira atendimento, sem inventar lacuna', () => {
  const item = concluir(lead(), leitura(PAGINA), []);
  assert.equal(item.diagnostico.principal, 'completo');
  assert.equal(item.diagnostico.servico, 2);
  assert.equal(item.diagnostico.ofertaId, 'atendimento');
  const frase = fraseSeLimpa(item, (t) => PROIBIDO.some((re) => re.test(t)));
  assert.match(frase, /Rafa, da OLLI/);
  assert.match(frase, /equipe da Oficina do Ar/);
  assert.match(frase, /WhatsApp/);
  assert.equal(frase.endsWith('?'), true);
});

test('sem botão de WhatsApp cita essa lacuna e escolhe o site', () => {
  const html = PAGINA.replace(/<a href="https:\/\/wa\.me[^>]*>WhatsApp<\/a>/, '');
  const item = concluir(lead(), leitura(html), []);
  assert.equal(item.diagnostico.principal, 'sem_whatsapp');
  assert.equal(item.diagnostico.servico, 1);
  assert.match(fraseDoDiagnostico(item), /não achei botão de WhatsApp/);
});

test('a palavra WhatsApp solta no texto não conta como botão', () => {
  const html = `<html><head><meta name="viewport" content="width=device-width"></head><body><p>chame no whatsapp</p><form></form></body></html>`;
  const classe = classificar(leitura(html));
  assert.equal(classe.sinais.whatsapp, false);
  assert.equal(classe.principal, 'sem_whatsapp');
});

test('wa.me dentro do script conta como botão', () => {
  const html = `<html><head><meta name="viewport" content="width=device-width"><script>var u="https://wa.me/5511";</script></head><body><form></form></body></html>`;
  assert.equal(classificar(leitura(html)).sinais.whatsapp, true);
});

test('sem viewport vem antes do WhatsApp e os dois ficam na lista', () => {
  const html = `<html><body><form></form><a href="https://instagram.com/a">i</a><a href="https://maps.google.com/maps?q=1">g</a></body></html>`;
  const classe = classificar(leitura(html));
  assert.equal(classe.principal, 'sem_viewport');
  assert.ok(classe.lacunas.includes('sem_whatsapp'));
  assert.equal(ofertaDaLacuna(classe.principal).servico, 1);
});

test('http sem cadeado é a lacuna principal', () => {
  const classe = classificar(leitura(PAGINA, 'http://oficina.com.br/'));
  assert.equal(classe.principal, 'sem_https');
  assert.equal(classe.sinais.abre, true);
  assert.match(fraseDoDiagnostico({ ...lead(), diagnostico: { ...classe, evidencia: true } }), /sem o cadeado/);
});

test('sem site, maps e rede social não são raspados e viram página nova', () => {
  assert.equal(motivoUrl('https://maps.google.com/maps?q=oficina'), 'maps');
  assert.equal(motivoUrl('https://instagram.com/oficina'), 'rede_social');
  assert.equal(motivoUrl('http://127.0.0.1/admin'), 'url_proibida');
  assert.equal(motivoUrl('http://192.168.0.8/'), 'url_proibida');
  assert.equal(classificar({ motivo: 'sem_site' }).principal, 'sem_site');
  assert.equal(ofertaDaLacuna('sem_site').servico, 1);
});

test('robots que proíbe não vira lacuna inventada e a frase fica vazia', () => {
  const classe = classificar({ motivo: 'robots', status: 200, finalUrl: 'https://oficina.com.br/', html: '' });
  assert.equal(classe.evidencia, false);
  assert.equal(classe.principal, 'robots');
  assert.equal(fraseDoDiagnostico({ ...lead(), diagnostico: classe }), '');
  assert.equal(ofertaDaLacuna('robots').servico, 0);
});

test('frase proibida não passa no gancho do 1º toque', () => {
  const item = { nome: 'Oficina', diagnostico: { principal: 'sem_whatsapp', evidencia: true } };
  assert.equal(fraseSeLimpa(item, () => true), '');
  assert.match(fraseSeLimpa(item, () => false), /não achei botão de WhatsApp/);
});

test('nenhuma frase pronta promete resultado nem cita preço', () => {
  const chaves = ['sem_site', 'site_nao_abre', 'pediu_login', 'nao_html', 'sem_https', 'sem_viewport', 'sem_whatsapp', 'sem_google', 'sem_instagram', 'email_amador', 'sem_formulario', 'completo'];
  for (const principal of chaves) {
    const frase = fraseDoDiagnostico({ nome: 'Empresa Teste', cidade: 'Campinas - SP', diagnostico: { principal, evidencia: true } });
    assert.equal(PROIBIDO.some((re) => re.test(frase)), false, principal);
    assert.match(frase, /Aqui é o Rafa, da OLLI/);
    assert.equal(frase.endsWith('?'), true);
  }
});

test('catálogo real alimenta o nome do serviço 1 e a lista provisória cobre a falta', () => {
  const texto = '### Serviço 1: Landing de teste\n### Serviço 2: Zap\n### Serviço 4: Google\n### Serviço 6: Meta\n### Serviço 7: Logo\n### Serviço 8: Posts\n### Serviço 9: Mail\n### Serviço 12: Agenda\n';
  const ofertas = ofertasDoTexto(texto);
  assert.equal(ofertas[0].nome, 'Landing de teste');
  assert.equal(ofertaDaLacuna('sem_whatsapp', ofertas).ofertaNome, 'Landing de teste');
  assert.equal(ofertasDoTexto('sem servico'), null);
  const real = carregarOfertas();
  assert.match(real.origem, /CATALOGO\.md$/);
  assert.equal(real.ofertas.find((o) => o.servico === 1).id, 'site');
  assert.equal('preco' in real.ofertas[0], false);
});

test('relatório esconde telefone e e-mail', () => {
  const item = concluir({ ...lead(), telefone: '+5511988887777' }, leitura(PAGINA), []);
  const md = relatorioMarkdown([item], { origem: 'teste' });
  assert.equal(md.includes('988887777'), false);
  assert.equal(md.includes('11988887777'), false);
  const sujo = mascarar('Gerado 2026-11-14T09:34:14.892Z. Fale com (11) 98888-7777 ou a@b.com. Pasta 2026-11-14-agencia-ia.');
  assert.match(sujo, /2026-11-14T09:34:14/);
  assert.match(sujo, /2026-11-14-agencia-ia/);
  assert.equal(sujo.includes('98888'), false);
  assert.equal(sujo.includes('a@b.com'), false);
});

test('o csv público não devolve o telefone e o id é estável', () => {
  const csv = 'nome,cidade,site,telefone comercial público,motivo_nota\nOficina Nova,São Paulo - SP,https://oficina.com.br,(11) 98888-7777,hipótese: nicho:refrigeracao\n';
  const leads = lerLeadsCsv(csv);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].nicho, 'refrigeracao');
  assert.equal('telefone' in leads[0], false);
  assert.equal(leads[0].id, idLocal('(11) 98888-7777'));
  assert.match(leads[0].id, /^[0-9a-f]{12}$/);
  assert.equal(nichoLocal('Grupo Elétrica', ''), 'eletrica');
});

test('o id local usa a mesma conta do motor quando ele está ao lado', async () => {
  try {
    const motor = await import('../prospeccao/leads.mjs');
    assert.equal(idLocal('(11) 98888-7777'), motor.idDeTelefone('(11) 98888-7777'));
    assert.equal(idLocal('1133334444'), motor.idDeTelefone('1133334444'));
  } catch (erro) {
    if (erro?.code !== 'ERR_MODULE_NOT_FOUND') throw erro;
  }
});

test('o cache gruda no lead e some quando não há leitura', () => {
  const leads = anexarDiagnostico(
    [{ id: 'abc', nome: 'A' }, { id: 'sem', nome: 'B' }],
    { itens: { abc: { principal: 'sem_whatsapp', evidencia: true } } },
  );
  assert.equal(leads[0].diagnostico.principal, 'sem_whatsapp');
  assert.equal(leads[1].diagnostico, undefined);
});

test('robots proibido não pede a página; 404 de robots pede', async () => {
  const pedidos = [];
  const html = PAGINA;
  const busca = criarBusca({
    intervaloMs: 0,
    aleatorio: () => 0,
    esperar: async () => {},
    fetchImpl: async (url) => {
      pedidos.push(url);
      if (String(url).includes('proibido') && String(url).endsWith('/robots.txt')) {
        return http(200, 'User-agent: *\nDisallow: /\n', url);
      }
      if (String(url).endsWith('/robots.txt')) return http(404, '', url);
      return http(200, html, url);
    },
  });
  const negado = await busca.pagina('https://proibido.example/');
  assert.equal(negado.motivo, 'robots');
  assert.equal(pedidos.some((u) => u === 'https://proibido.example/'), false);
  const ok = await busca.pagina('https://aberto.example/');
  assert.equal(ok.motivo, '');
  assert.match(ok.html, /wa\.me/);
  assert.equal(robotsPermite('User-agent: *\nCrawl-delay: 20\nDisallow:\n', '/', 'x').lento, true);
});

test('login e desafio não são lidos como site da empresa', async () => {
  const busca = criarBusca({
    intervaloMs: 0,
    esperar: async () => {},
    fetchImpl: async (url) => {
      if (String(url).endsWith('/robots.txt')) return http(404, '', url);
      if (String(url).includes('login')) return http(200, PAGINA, 'https://login.example/wp-login.php');
      return http(200, '<html>Just a moment...</html>', url);
    },
  });
  const login = await busca.pagina('https://login.example/');
  assert.equal(login.login, true);
  assert.equal(classificar(login).principal, 'pediu_login');
  const muro = await busca.pagina('https://muro.example/');
  assert.equal(muro.motivo, 'bloqueou');
  assert.equal(classificar(muro).evidencia, false);
});

function http(status, body, url, tipo = 'text/html') {
  return {
    status,
    url,
    headers: { get: (nome) => (nome === 'content-type' ? tipo : '') },
    text: async () => body,
  };
}
