import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { anexarNoMotor, executar, main } from './cacador.mjs';
import { hashesDaCentral, hashesDePaginas, pedirCw } from './central.mjs';
import { pracaDe } from './cidades.mjs';
import { avaliar, nomeLimpo } from './conferir.mjs';
import { lerTabela, textoCsv } from './csv.mjs';
import { carregarDedupe, lerSupressao, motivoDedupe, vazio } from './dedupe.mjs';
import { associadosDeHtml, hostProibido, linksDuckDuckGo, urlDeEmpresa, urlPublica } from './fontes.mjs';
import { criarCliente } from './http.mjs';
import { nomeForaDoNicho } from './nicho.mjs';
import { parseRobots, permitido } from './robots.mjs';
import { montarAmostra, montarRelatorio } from './relatorio.mjs';
import { celularesNoHtml, e164, formatoComercial, hashes64, mascara, temFixoComercial } from './telefone.mjs';

const FONE_A = '(11) 98888-7771';
const FONE_B = '(11) 98888-7772';

function site(nome, fone) {
  const digitos = `55${fone.replace(/\D/g, '')}`;
  return `<!doctype html><html><head><title>${nome}</title></head><body>
<p>Manutenção de ar-condicionado e PMOC em São Paulo. Fale no WhatsApp.</p>
<a href="tel:+${digitos}">telefone</a>
</body></html>`;
}

function abrava() {
  return `
<div class="col-md-4 associado"><h4>Frio A</h4><p>Cidade: São Paulo (SP)
Departamento: DN Instalação e Manutenção
Site: https://frio-a.example/</p></div>
<div class="col-md-4 associado"><h4>Frio B</h4><p>Cidade: Guarulhos (SP)
Departamento: DN Instalação e Manutenção
Site: https://frio-b.example/</p></div>
<div class="col-md-4 associado"><h4>Quimica Fora</h4><p>Cidade: São Paulo (SP)
Departamento: DN Tratamento de Água
Site: https://agua.example/</p></div>`;
}

function clienteRoteado() {
  let n = 0;
  return {
    async texto(url) {
      n += 1;
      if (url.includes('duckduckgo')) return { ok: false, motivo: 'site_bloqueou', body: '', finalUrl: url };
      if (url.includes('abrava.com.br')) return { ok: true, body: abrava(), finalUrl: url };
      if (url.includes('frio-a.example')) return { ok: true, body: site('Frio A Refrigeração', FONE_A), finalUrl: url };
      if (url.includes('frio-b.example')) return { ok: true, body: site('Frio B Refrigeração', FONE_B), finalUrl: url };
      return { ok: false, motivo: 'nao_achou', body: '', finalUrl: url };
    },
    usados: () => n,
    restante: () => 100,
  };
}

function resposta(status, body, url, tipo = 'text/html') {
  return {
    status,
    url,
    headers: { get: (nome) => (String(nome).toLowerCase() === 'content-type' ? tipo : '') },
    text: async () => body,
  };
}

test('celular comercial entra e fixo, número da casa e particular ficam de fora', () => {
  const html = `<p>WhatsApp <a href="tel:+5511988887771">(11) 98888-7771</a></p>`;
  const achados = celularesNoHtml(html);
  assert.equal(achados.length, 1);
  assert.equal(achados[0].e164, '+5511988887771');
  assert.equal(formatoComercial(achados[0].e164), FONE_A);
  assert.equal(mascara(FONE_A), '****7771');
  assert.equal(celularesNoHtml('<p>endereço 11988887771 sem rótulo</p>').length, 0);
  assert.equal(celularesNoHtml('<p>meu celular particular (11) 98888-7773</p>').length, 0);
  assert.equal(temFixoComercial('<p>Telefone (11) 3333-4444</p>'), true);
  assert.equal(celularesNoHtml('<p>Telefone (11) 3333-4444</p>').length, 0);
});

test('nome não leva telefone e diretório ou pintura não entram', () => {
  assert.equal(nomeLimpo('Eletricista Guarulhos 24h 98884-0073 agora'), 'Eletricista Guarulhos 24h agora');
  assert.equal(nomeLimpo('Eletricista Guarulhos 24h 98884-0073 Agora no Whats'), 'Eletricista Guarulhos 24h');
  assert.equal(nomeForaDoNicho('RPMendes Pintura', 'refrigeracao'), true);
  assert.throws(
    () => montarAmostra([{
      nome: 'Eletricista 98884-0073', cidade: 'São Paulo - SP', nicho: 'eletrica',
      telefone: FONE_A, site: 'https://frio-a.example/',
    }], '2026-11-14T05:40'),
    /amostra_vazou_telefone/,
  );
});

test('o site da empresa passa no critério e o fixo sozinho não', () => {
  const dedupe = vazio();
  const praca = pracaDe('grande-sp');
  const ok = avaliar(site('Frio A Refrigeração', FONE_A), {
    nome: 'Frio A',
    cidade: 'São Paulo',
    site: 'https://frio-a.example/',
    origem: 'abrava',
  }, { praca, dedupe });
  assert.equal(ok.lead.nicho, 'refrigeracao');
  assert.equal(ok.lead.cidade, 'São Paulo - SP');
  assert.equal(ok.lead.telefone, FONE_A);
  assert.match(ok.lead.motivo, /^hipótese: nicho:refrigeracao\./);
  const fixo = avaliar('<p>Manutenção de ar-condicionado em São Paulo. Telefone (11) 3333-4444</p>', {
    nome: 'Frio Fixo', cidade: 'São Paulo', site: 'https://fixo.example/',
  }, { praca, dedupe });
  assert.equal(fixo.motivo, 'sem_celular_comercial');
});

test('associação, busca e endereço proibido', () => {
  const cards = associadosDeHtml(abrava());
  assert.equal(cards.length, 3);
  assert.equal(cards[0].site, 'https://frio-a.example/');
  assert.equal(cards[2].departamento.toLowerCase().includes('água') || cards[2].departamento.includes('Água'), true);
  const links = linksDuckDuckGo(`
    <a href="/l/?uddg=https%3A%2F%2Fwww.instagram.com%2Ffoo"></a>
    <a href="/l/?uddg=https%3A%2F%2Fmaps.google.com%2Fmaps"></a>
    <a href="/l/?uddg=https%3A%2F%2Ffrio-a.example%2Fcontato"></a>`);
  assert.deepEqual(links, ['https://frio-a.example/contato']);
  assert.equal(hostProibido('maps.google.com'), true);
  assert.equal(hostProibido('guia.barueri.br'), true);
  assert.equal(hostProibido('listamais.com.br'), true);
  assert.equal(hostProibido('eguias.net'), true);
  assert.equal(urlPublica('http://127.0.0.1/admin'), false);
  assert.equal(urlPublica('https://frio-a.example/'), true);
  assert.equal(urlPublica('https://abrava.com.br/associados-2/?letra=a'), true);
  assert.equal(urlDeEmpresa('https://abrava.com.br/associados-2/?letra=a'), false);
  assert.equal(urlDeEmpresa('https://html.duckduckgo.com/html/'), false);
});

test('robots: disallow perde para allow mais longo e atraso alto fica registrado', () => {
  const grupos = parseRobots(`User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nCrawl-delay: 2\n`);
  assert.equal(permitido(grupos, '/wp-admin/admin-ajax.php', 'OLLILeadsAuto').ok, true);
  assert.equal(permitido(grupos, '/wp-admin/edit.php', 'OLLILeadsAuto').ok, false);
  assert.equal(permitido(grupos, '/associados-2/', 'OLLILeadsAuto').atrasoSeg, 2);
  assert.equal(permitido(parseRobots('User-agent: *\nDisallow: /\n'), '/', 'x').ok, false);
});

test('não lê página proibida pelo robots nem segue redirect interno', async () => {
  const bloqueado = criarCliente({
    intervaloMs: 0,
    orcamento: 5,
    esperar: async () => {},
    agora: () => 0,
    fetchImpl: async (url) => {
      if (String(url).endsWith('/robots.txt')) {
        return resposta(200, 'User-agent: *\nDisallow: /\n', url, 'text/plain');
      }
      return resposta(200, 'nao devia', url);
    },
  });
  const negado = await bloqueado.texto('https://frio-a.example/contato');
  assert.equal(negado.motivo, 'robots');
  assert.equal(bloqueado.usados(), 1);

  const interno = criarCliente({
    intervaloMs: 0,
    orcamento: 5,
    esperar: async () => {},
    agora: () => 0,
    fetchImpl: async (url) => {
      if (String(url).endsWith('/robots.txt')) return resposta(404, '', url, 'text/plain');
      return resposta(200, '<html>oi</html>', 'http://127.0.0.1/secreto');
    },
  });
  const foi = await interno.texto('https://frio-a.example/');
  assert.equal(foi.motivo, 'url_proibida');
});

test('teto guarda a empresa que ainda não foi conferida', async () => {
  const resultado = await executar({
    cliente: clienteRoteado(),
    praca: pracaDe('grande-sp'),
    dedupe: vazio(),
    estado: {},
    teto: 1,
    data: '14/11/2026',
  });
  assert.equal(resultado.aceitos.length, 1);
  assert.equal(resultado.aceitos[0].nicho, 'refrigeracao');
  assert.equal(resultado.estado.pendentes.length, 1);
  assert.equal(resultado.estado.pendentes[0].site, 'https://frio-b.example/');
  assert.ok(resultado.descartes.nao_e_servico >= 1);
  assert.ok(resultado.descartes.busca_bloqueada >= 1);
});

test('dedupe tira lista, log, supressão e Central, e recusa a base da Receita', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leads-auto-'));
  const fone = FONE_A;
  const hash12 = createHash('sha256').update('5511988887771').digest('hex').slice(0, 12);
  const hash64 = createHash('sha256').update('5511988887771').digest('hex');
  const prospects = path.join(dir, 'lista.csv');
  const log = path.join(dir, 'log.csv');
  const sup = path.join(dir, 'sup.csv');
  fs.writeFileSync(prospects, textoCsv([{
    nome: 'Frio A Refrigeração', cidade: 'São Paulo - SP', site: 'https://frio-a.example/',
    telefone: fone, onde: 'https://frio-a.example/', data: '14/11/2026', nota: 4,
    motivo: 'hipótese: nicho:refrigeracao. teste.',
  }]));
  fs.writeFileSync(log, `data,id_hash_contato\n2026-10-23,${hash12}\n`);
  fs.writeFileSync(sup, `sha256,data,motivo\n${hash64},2026-11-01,teste\n`);
  const dedupe = carregarDedupe({ prospects, log, supressao: sup, auto: path.join(dir, 'ainda-nao.csv') });
  assert.equal(motivoDedupe(dedupe, { telefone: fone, nome: 'Outra', dominio: 'outra.example' }), 'ja_na_lista');
  assert.equal(motivoDedupe(vazio(), { telefone: fone, nome: 'Nova', dominio: 'nova.example' }), '');
  const soLog = vazio();
  soLog.log12.add(hash12);
  assert.equal(motivoDedupe(soLog, { telefone: fone, nome: 'Nova', dominio: 'nova.example' }), 'ja_no_log');
  const soSup = vazio();
  soSup.supressao64.add(hash64);
  assert.equal(motivoDedupe(soSup, { telefone: fone, nome: 'Nova', dominio: 'nova.example' }), 'supressao');
  assert.equal(lerSupressao(fs.readFileSync(sup, 'utf8')).has(hash64), true);
  assert.throws(
    () => carregarDedupe({ prospects: '/home/igor/dados-receita/empresas.csv', log, supressao: sup }),
    /base_receita_proibida/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('anexar no CSV do motor não duplica e não grava fixo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leads-auto-anexar-'));
  const arquivo = path.join(dir, 'PROSPECTS.csv');
  fs.writeFileSync(arquivo, `# nota\n${textoCsv([{
    nome: 'Ja Esta', cidade: 'São Paulo - SP', site: 'https://ja.example/',
    telefone: FONE_A, onde: 'https://ja.example/', data: '07/11/2026', nota: 4,
    motivo: 'hipótese: nicho:refrigeracao. antiga.',
  }])}`);
  const n = anexarNoMotor(arquivo, [
    { nome: 'Ja Esta', cidade: 'São Paulo - SP', site: 'https://ja.example/', telefone: FONE_A, onde: 'https://ja.example/', data: '14/11/2026', nota: 4, motivo: 'hipótese: nicho:refrigeracao. de novo.' },
    { nome: 'Frio B Refrigeração', cidade: 'Guarulhos - SP', site: 'https://frio-b.example/', telefone: FONE_B, onde: 'https://frio-b.example/', data: '14/11/2026', nota: 4, motivo: 'hipótese: nicho:refrigeracao. nova.' },
    { nome: 'So Fixo', cidade: 'São Paulo - SP', site: 'https://fixo.example/', telefone: '(11) 3333-4444', onde: 'https://fixo.example/', data: '14/11/2026', nota: 4, motivo: 'hipótese: nicho:refrigeracao. fixo.' },
  ]);
  assert.equal(n, 1);
  const texto = fs.readFileSync(arquivo, 'utf8');
  assert.match(texto, /^# nota/);
  const tabela = lerTabela(texto);
  assert.equal(tabela.length, 2);
  assert.equal(tabela[1].nome, 'Frio B Refrigeração');
  assert.equal(tabela[1].data, '14/11/2026');
  assert.equal(anexarNoMotor(arquivo, [{ nome: 'Frio B Refrigeração', telefone: FONE_B, site: 'https://frio-b.example/', cidade: 'Guarulhos - SP', onde: 'https://frio-b.example/', data: '14/11/2026', nota: 4, motivo: 'hipótese: x' }]), 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a Central vira só hash e página inválida não sai', async () => {
  const paginas = [{
    meta: { count: 1 },
    payload: [{ id: 7, phone_number: '+5511988887771', name: 'nao guardar' }],
  }];
  const hashes = hashesDePaginas(paginas);
  assert.equal(hashes.contatos, 1);
  assert.equal(hashes.h12.size > 0, true);
  assert.equal([...hashes.h12].every((h) => /^[0-9a-f]{12}$/.test(h)), true);
  await assert.rejects(hashesDaCentral({
    pedir: async () => ({ meta: { count: 3 }, payload: [{ id: 1, phone_number: '11988887771' }] }),
    pausa: async () => {},
  }), /central_incompleta/);
  assert.throws(() => pedirCw(0, () => '{}'), /pagina_invalida/);
  assert.throws(() => pedirCw(1, () => { throw new Error('segredo na mensagem'); }), /central_indisponivel/);
});

test('relatório e amostra não mostram telefone inteiro', () => {
  const lead = {
    nome: 'Frio A Refrigeração', cidade: 'São Paulo - SP', nicho: 'refrigeracao',
    telefone: FONE_A, site: 'https://frio-a.example/',
  };
  const relatorio = montarRelatorio({
    quando: '2026-11-14T05:40', praca: 'Grande São Paulo', teto: 30, aceitos: [lead],
    acumulado: 1, descartes: { sem_celular_comercial: 2 }, usados: 4, orcamento: 180,
    abaixo: true, anexadas: null,
  });
  assert.match(relatorio, /sem_celular_comercial \(o site só publica telefone fixo/);
  assert.equal(relatorio.includes('98888'), false);
  const amostra = montarAmostra([lead], '2026-11-14T05:40');
  assert.match(amostra, /7771/);
  assert.equal(amostra.includes('98888'), false);
});

test('rodada seca não busca e a rodada falsa grava o arquivo que o leitor aceita', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leads-auto-main-'));
  const caminhos = {
    entrega: path.join(dir, 'entrega'),
    auto: path.join(dir, 'entrega', 'PROSPECTS-AUTO.csv'),
    prospects: path.join(dir, 'lista.csv'),
    log: path.join(dir, 'log.csv'),
    supressao: path.join(dir, 'sup.csv'),
    estado: path.join(dir, 'estado.json'),
  };
  fs.writeFileSync(caminhos.prospects, 'nome,cidade,telefone comercial público,nota_precisa_kit,motivo_nota\n');
  fs.writeFileSync(caminhos.log, 'data,id_hash_contato\n');
  fs.writeFileSync(caminhos.supressao, 'sha256,data,motivo\n');
  let saida = '';
  const seco = await main(['--seco'], { caminhos, sair: (t) => { saida += t; }, agora: new Date('2026-11-14T08:40:00Z') });
  assert.equal(seco.seco, true);
  assert.match(saida, /anexar nao/);
  assert.equal(fs.existsSync(caminhos.auto), false);

  const resultado = await main(['--teto', '1', '--anexar'], {
    caminhos,
    agora: new Date('2026-11-14T08:40:00Z'),
    central: async () => ({ h12: new Set(), h64: new Set() }),
    cliente: clienteRoteado(),
    sair: () => {},
  });
  assert.equal(resultado.aceitos.length, 1);
  const csv = fs.readFileSync(caminhos.auto, 'utf8');
  assert.match(csv, /Frio A,/);
  assert.equal(fs.readFileSync(caminhos.prospects, 'utf8').includes('Frio A'), true);
  const relatorio = fs.readFileSync(path.join(caminhos.entrega, 'RELATORIO.md'), 'utf8');
  assert.equal(/\+55\d{8,}|\(\d{2}\)\s?\d{4,5}-?\d{4}/.test(relatorio), false);
  assert.match(relatorio, /Nenhuma mensagem foi enviada/);
  const amostra = fs.readFileSync(path.join(caminhos.entrega, 'AMOSTRA.md'), 'utf8');
  assert.equal(amostra.includes('98888'), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('o leads.mjs do motor lê o CSV e põe a empresa na fila', async (t) => {
  const base = '/home/igor/chatwoot-central/campanhas/prospeccao';
  if (!fs.existsSync(path.join(base, 'leads.mjs'))) {
    t.skip();
    return;
  }
  const { lerProspects, motivoFora } = await import(pathToFileURL(path.join(base, 'leads.mjs')).href);
  const { hashesDeTelefone, e164: e164Motor } = await import(pathToFileURL('/home/igor/chatwoot-central/ativacao/telefones.mjs').href);
  assert.equal(e164(FONE_A), e164Motor(FONE_A));
  assert.deepEqual([...hashes64(FONE_A)].sort(), [...hashesDeTelefone(FONE_A)].sort());
  const csv = textoCsv([{
    nome: 'Frio A Refrigeração',
    cidade: 'São Paulo - SP',
    site: 'https://frio-a.example/',
    telefone: FONE_A,
    onde: 'https://frio-a.example/',
    data: '14/11/2026',
    nota: 4,
    motivo: 'hipótese: nicho:refrigeracao. há WhatsApp no site e não há sinal de triagem automática. Telefone comercial publicado no próprio site.',
  }]);
  const leads = lerProspects(csv);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].nicho, 'refrigeracao');
  assert.equal(leads[0].telefone_e164, '+5511988887771');
  assert.equal(leads[0].nota, 4);
  assert.equal(motivoFora(leads[0], {
    hashesCsv: new Set(), syncFresca: true, hashesLog: new Set(), teste: false,
  }), '');
});

test('o código não aponta para a base de CNPJ', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  for (const nome of fs.readdirSync(dir)) {
    if (nome === 'leads-auto.test.mjs') continue;
    if (!nome.endsWith('.mjs') && !nome.endsWith('.sh')) continue;
    const texto = fs.readFileSync(path.join(dir, nome), 'utf8');
    assert.equal(/dados-receita\/(?!supressao-telefones\.csv)/.test(texto), false, nome);
  }
});

test('ligar.sh sem flag não chama o systemctl', () => {
  const saida = execFileSync('bash', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'ligar.sh')], { encoding: 'utf8' });
  assert.match(saida, /Não liguei/);
  assert.equal(saida.includes('--ligar'), true);
});
