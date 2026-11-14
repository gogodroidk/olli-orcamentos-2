// Caçador semanal. Acha empresa de serviço, confere o telefone no site e grava o CSV do motor.
// Não manda mensagem, não lê a base de CNPJ e não raspa mapa nem rede social.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { caminhosPadrao } from './caminhos.mjs';
import { hashesDaCentral } from './central.mjs';
import { pracaDe, parseCidadeUf, cidadeCanonica, proximaPraca, semAcento } from './cidades.mjs';
import { conferir, nomeLimpo } from './conferir.mjs';
import { chaveNome, lerTabela, linhaProspect, textoCsv } from './csv.mjs';
import { carregarDedupe } from './dedupe.mjs';
import {
  associadosDeHtml,
  consultasDaPraca,
  hostDe,
  linksDuckDuckGo,
  urlAbrava,
  urlBusca,
  urlDeEmpresa,
} from './fontes.mjs';
import { criarCliente } from './http.mjs';
import { nichoDoDepartamento } from './nicho.mjs';
import { montarAmostra, montarRelatorio } from './relatorio.mjs';
import { formatoComercial, hashes12 } from './telefone.mjs';

const METAS = { refrigeracao: 10, eletrica: 10, predial: 10 };
const ALFABETO = 'abcdefghijklmnopqrstuvwxyz';
const NAO_PERSISTE = new Set(['orcamento', 'site_indisponivel', 'robots_indisponivel', 'nao_achou']);

function escolher(contagem, esgotada) {
  const abertos = Object.keys(METAS).filter((n) => !esgotada[n]);
  if (!abertos.length) return '';
  const abaixo = abertos.filter((n) => contagem[n] < METAS[n]);
  const pool = abaixo.length ? abaixo : abertos;
  pool.sort((a, b) => (METAS[b] - contagem[b]) - (METAS[a] - contagem[a]) || a.localeCompare(b));
  return pool[0];
}

function lerEstado(caminho) {
  try {
    const bruto = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return bruto && typeof bruto === 'object' ? bruto : {};
  } catch {
    return {};
  }
}

function gravarJson(caminho, valor) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(valor));
  fs.renameSync(tmp, caminho);
}

export async function executar(op) {
  const filas = { refrigeracao: [], eletrica: [], predial: [] };
  const esgotada = { refrigeracao: false, eletrica: false, predial: false };
  const contagem = { refrigeracao: 0, eletrica: 0, predial: 0 };
  const descartes = {};
  const aceitos = [];
  const pacote = consultasDaPraca(op.praca);
  const consultas = {
    refrigeracao: Number(op.estado.consulta?.refrigeracao) || 0,
    eletrica: Number(op.estado.consulta?.eletrica) || 0,
    predial: Number(op.estado.consulta?.predial) || 0,
  };
  let iLetra = op.estado.letra === '' ? ALFABETO.length : ALFABETO.indexOf(op.estado.letra || 'a');
  if (iLetra < 0) iLetra = 0;
  let parar = false;
  for (const item of op.estado.pendentes || []) {
    if (!filas[item?.nicho] || !item.site || !urlDeEmpresa(item.site)) continue;
    filas[item.nicho].push({
      nome: item.nome || '',
      cidade: item.cidade || '',
      uf: item.uf || '',
      site: item.site,
      origem: item.origem || 'fila',
    });
  }

  const anotar = (motivo) => {
    if (!motivo) return;
    descartes[motivo] = (descartes[motivo] || 0) + 1;
  };

  const buscaAcabou = (nicho) => consultas[nicho] >= (pacote[nicho] || []).length;

  async function lerLetra() {
    const letra = ALFABETO[iLetra];
    const pagina = await op.cliente.texto(urlAbrava(letra));
    if (pagina.motivo === 'orcamento') {
      parar = true;
      return;
    }
    iLetra += 1;
    if (!pagina.ok) {
      anotar(pagina.motivo || 'fonte_abrava');
      return;
    }
    for (const item of associadosDeHtml(pagina.body)) {
      const nicho = nichoDoDepartamento(item.departamento);
      if (!nicho) {
        anotar('nao_e_servico');
        continue;
      }
      const { cidade, uf } = parseCidadeUf(item.cidadeBruta);
      const canon = cidadeCanonica(cidade, op.praca.cidades);
      const cidadeOk = op.praca.id === 'grande-sp'
        ? Boolean(canon) && (!uf || uf === 'SP')
        : semAcento(cidade) === semAcento(op.praca.cidades[0]) && (!uf || uf === op.praca.uf);
      if (!cidadeOk) {
        anotar('fora_da_praca');
        continue;
      }
      if (!item.site || !urlDeEmpresa(item.site)) {
        anotar('sem_site');
        continue;
      }
      filas[nicho].push({
        nome: item.nome,
        cidade: canon || cidade,
        uf: uf || op.praca.uf,
        site: item.site,
        origem: 'abrava',
      });
    }
  }

  async function lerBusca(nicho) {
    const lista = pacote[nicho] || [];
    const i = consultas[nicho] || 0;
    if (i >= lista.length) return;
    const pagina = await op.cliente.texto(urlBusca(lista[i]));
    if (pagina.motivo === 'orcamento') {
      parar = true;
      return;
    }
    const corpo = pagina.body || '';
    const bloqueada = /captcha|anomaly-modal|bots use duckduckgo/i.test(corpo)
      || pagina.motivo === 'site_bloqueou'
      || pagina.status === 403
      || pagina.status === 429;
    if (bloqueada) {
      anotar('busca_bloqueada');
      esgotada[nicho] = true;
      return;
    }
    if (!pagina.ok) {
      anotar(pagina.motivo || 'fonte_busca');
      consultas[nicho] = i + 1;
      return;
    }
    consultas[nicho] = i + 1;
    const links = linksDuckDuckGo(pagina.body);
    if (!links.length) anotar('busca_vazia');
    for (const link of links) {
      filas[nicho].push({ nome: '', cidade: '', uf: '', site: link, origem: 'busca' });
    }
  }

  async function encher(nicho) {
    if (nicho === 'refrigeracao' && iLetra < ALFABETO.length) {
      await lerLetra();
      return;
    }
    if (!buscaAcabou(nicho)) {
      await lerBusca(nicho);
      return;
    }
    esgotada[nicho] = true;
  }

  let voltas = 0;
  while (aceitos.length < op.teto && op.cliente.restante() > 0 && !parar && voltas < 500) {
    voltas += 1;
    const nicho = escolher(contagem, esgotada);
    if (!nicho) break;
    if (!filas[nicho].length) {
      await encher(nicho);
      if (parar) break;
      if (!filas[nicho].length) {
        const letrasAcabaram = nicho !== 'refrigeracao' || iLetra >= ALFABETO.length;
        if (letrasAcabaram && buscaAcabou(nicho)) esgotada[nicho] = true;
        continue;
      }
    }
    const candidato = filas[nicho].shift();
    const resultado = await conferir(candidato, op);
    if (resultado.motivo === 'orcamento') {
      parar = true;
      break;
    }
    if (voltas % 8 === 0 && op.avisar) op.avisar(`paginas ${op.cliente.usados()} aceitas ${aceitos.length}`);
    if (resultado.lead) {
      aceitos.push({ ...resultado.lead, data: op.data });
      contagem[resultado.lead.nicho] += 1;
      const dominio = resultado.lead.dominio || hostDe(resultado.lead.site);
      if (dominio) op.dedupe.vistos.add(dominio);
      const nome = chaveNome(resultado.lead.nome);
      if (nome) op.dedupe.autoNomes.add(nome);
      for (const h of hashes12(resultado.lead.telefone)) op.dedupe.auto12.add(h);
      if (dominio) op.dedupe.autoDominios.add(dominio);
    } else {
      anotar(resultado.motivo || 'descarte');
      const dominio = hostDe(candidato.site);
      if (dominio && !NAO_PERSISTE.has(resultado.motivo)) op.dedupe.vistos.add(dominio);
    }
  }

  const letrasAcabaram = iLetra >= ALFABETO.length;
  const buscasAcabaram = Object.keys(METAS).every((n) => buscaAcabou(n));
  const pendentes = [];
  for (const nicho of Object.keys(filas)) {
    for (const item of filas[nicho]) {
      if (pendentes.length >= 300) break;
      pendentes.push({
        nicho,
        nome: item.nome || '',
        cidade: item.cidade || '',
        uf: item.uf || '',
        site: item.site,
        origem: item.origem || '',
      });
    }
  }
  const estado = {
    praca: op.praca.id,
    letra: iLetra >= ALFABETO.length ? '' : ALFABETO[iLetra],
    consulta: consultas,
    dominios: [...op.dedupe.vistos].slice(-5000),
    pendentes,
    atualizado: op.data,
  };
  if (letrasAcabaram && buscasAcabaram && pendentes.length === 0 && aceitos.length < 10) {
    estado.praca = proximaPraca(op.praca.id);
    estado.letra = 'a';
    estado.consulta = { refrigeracao: 0, eletrica: 0, predial: 0 };
  }
  return { aceitos, descartes, estado, usados: op.cliente.usados() };
}

function juntarCsv(caminho, novos) {
  const anteriores = fs.existsSync(caminho) ? lerTabela(fs.readFileSync(caminho, 'utf8')) : [];
  const linhas = [
    ...anteriores.map((linha) => ({
      nome: linha.nome,
      cidade: linha.cidade,
      site: linha.site,
      telefone: linha.telefone,
      onde: linha.onde,
      data: linha.data || '',
      nota: linha.nota,
      motivo: linha.motivo,
    })),
    ...novos,
  ];
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  fs.writeFileSync(tmp, textoCsv(linhas));
  fs.renameSync(tmp, caminho);
  return linhas.length;
}

export function anexarNoMotor(caminho, linhas) {
  if (String(caminho).includes('dados-receita')) throw new Error('base_receita_proibida');
  const atual = fs.readFileSync(caminho, 'utf8');
  const ja = lerTabela(atual);
  const nomes = new Set(ja.map((l) => chaveNome(l.nome)).filter(Boolean));
  const fones = new Set();
  for (const l of ja) for (const h of hashes12(l.telefone)) fones.add(h);
  const novas = [];
  for (const linha of linhas) {
    if (!formatoComercial(linha.telefone)) continue;
    const nome = chaveNome(linha.nome);
    const hs = [...hashes12(linha.telefone)];
    if ((nome && nomes.has(nome)) || hs.some((h) => fones.has(h))) continue;
    novas.push(linha);
    if (nome) nomes.add(nome);
    for (const h of hs) fones.add(h);
  }
  if (!novas.length) return 0;
  const extra = `${novas.map(linhaProspect).join('\n')}\n`;
  const corpo = atual.endsWith('\n') || atual.length === 0 ? atual : `${atual}\n`;
  const tmp = `${caminho}.tmp`;
  fs.writeFileSync(tmp, corpo + extra);
  fs.renameSync(tmp, caminho);
  return novas.length;
}

function escreverSaida(caminhos, { relatorio, amostra, quando }) {
  fs.mkdirSync(caminhos.entrega, { recursive: true });
  const dia = quando.slice(0, 10).split('-').reverse().join('-');
  fs.writeFileSync(path.join(caminhos.entrega, 'RELATORIO.md'), relatorio);
  fs.writeFileSync(path.join(caminhos.entrega, `RELATORIO-${dia}.md`), relatorio);
  fs.writeFileSync(path.join(caminhos.entrega, 'AMOSTRA.md'), amostra);
}

function argsDe(argv) {
  const tem = (nome) => argv.includes(nome);
  const valor = (nome, padrao) => {
    const i = argv.indexOf(nome);
    if (i < 0 || !argv[i + 1]) return padrao;
    return Number(argv[i + 1]);
  };
  const pracaArg = argv.indexOf('--praca');
  return {
    seco: tem('--seco'),
    anexar: tem('--anexar'),
    teto: valor('--teto', 30),
    orcamento: valor('--orcamento', 180),
    intervaloMs: valor('--intervalo-ms', 2500),
    praca: pracaArg >= 0 ? argv[pracaArg + 1] : '',
  };
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const args = argsDe(argv);
  const caminhos = io.caminhos || caminhosPadrao();
  const agora = io.agora || new Date();
  const quando = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(agora).replace(' ', 'T');
  const data = quando.slice(0, 10).split('-').reverse().join('/');
  const estadoDisco = lerEstado(caminhos.estado);
  const praca = pracaDe(args.praca || estadoDisco.praca || 'grande-sp');
  if (!praca) throw new Error('praca_invalida');
  if (args.seco) {
    const texto = `seco. praca ${praca.rotulo}. teto ${args.teto}. orcamento ${args.orcamento}. intervalo ${args.intervaloMs} ms. anexar ${args.anexar ? 'sim' : 'nao'}. csv ${caminhos.auto}\n`;
    (io.sair || ((t) => process.stdout.write(t)))(texto);
    return { seco: true };
  }
  let central;
  try {
    central = await (io.central || hashesDaCentral)();
  } catch (e) {
    const motivo = e?.message === 'central_incompleta' ? 'central_incompleta' : 'central_indisponivel';
    const relatorio = montarRelatorio({
      quando, praca: praca.rotulo, teto: args.teto, aceitos: [], acumulado: 0,
      descartes: { [motivo]: 1 }, usados: 0, orcamento: args.orcamento, abaixo: true, anexadas: null,
    });
    escreverSaida(caminhos, { relatorio, amostra: montarAmostra([], quando), quando });
    return { erro: motivo };
  }
  const dedupe = carregarDedupe(caminhos, { central });
  for (const dominio of estadoDisco.dominios || []) dedupe.vistos.add(dominio);
  const cliente = io.cliente || criarCliente({
    orcamento: args.orcamento,
    intervaloMs: args.intervaloMs,
    fetchImpl: io.fetchImpl,
  });
  const resultado = await executar({
    cliente,
    praca,
    dedupe,
    estado: estadoDisco,
    teto: args.teto,
    data,
    avisar: (linha) => (io.sair || ((t) => process.stdout.write(t)))(`${linha}\n`),
  });
  const acumulado = juntarCsv(caminhos.auto, resultado.aceitos);
  let anexadas = null;
  if (args.anexar) {
    const todas = lerTabela(fs.readFileSync(caminhos.auto, 'utf8'));
    anexadas = anexarNoMotor(caminhos.prospects, todas);
  }
  gravarJson(caminhos.estado, resultado.estado);
  const relatorio = montarRelatorio({
    quando,
    praca: praca.rotulo,
    teto: args.teto,
    aceitos: resultado.aceitos,
    acumulado,
    descartes: resultado.descartes,
    usados: resultado.usados,
    orcamento: args.orcamento,
    abaixo: acumulado < 20,
    anexadas,
  });
  const amostra = montarAmostra(lerTabela(fs.readFileSync(caminhos.auto, 'utf8')).map((linha) => ({
    nome: nomeLimpo(linha.nome),
    cidade: linha.cidade,
    nicho: (String(linha.motivo).match(/nicho:(refrigeracao|eletrica|predial)/) || [])[1] || '',
    telefone: linha.telefone,
    site: linha.site,
  })), quando);
  escreverSaida(caminhos, { relatorio, amostra, quando });
  (io.sair || ((t) => process.stdout.write(t)))(
    `novas ${resultado.aceitos.length}; acumuladas ${acumulado}; paginas ${resultado.usados}\n`,
  );
  return resultado;
}

const ehCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ehCli) {
  main().then((r) => {
    if (r?.erro) process.exitCode = 2;
  }).catch((e) => {
    const motivo = String(e?.message || 'erro').split(':')[0].slice(0, 80);
    process.stderr.write(`${motivo}\n`);
    process.exitCode = 2;
  });
}
