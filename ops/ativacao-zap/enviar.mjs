// Manda no máximo UMA mensagem por execução, pelo WhatsApp da OLLI (caixa do Chatwoot).
//   node enviar.mjs --seco                 mostra a fila, não chama a API de envio e não grava a lista
//   node enviar.mjs --seco --gravar        reescreve LISTA-ENVIO.md (só sem --teste)
//   node enviar.mjs --teste                só o número da casa (11 98603-2309); recusa o resto; não grava a lista
//   node enviar.mjs                        uma mensagem, se a janela, os tetos e os freios deixarem
// O timer do systemd chama sem flag. Sem --now do Maestro, ele não roda.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cw as cwPadrao } from './cw.mjs';
import { evolutionAberta as evolutionPadrao } from './evolution.mjs';
import { e164, mascara } from './telefones.mjs';
import { mensagemAtivacao, id8 } from './mensagens.mjs';

export const TEXTO_TESTE_CASA = 'Oi, aqui é a Lívia, da OLLI. Isto é um teste interno do envio. Pode ignorar.';

export function textoEnvio(pessoa) {
  if (pessoa?.conta_id === 'teste-casa') return TEXTO_TESTE_CASA;
  return mensagemAtivacao(pessoa);
}

export function textoDoFreio(motivo) {
  if (motivo === '2_paradas') {
    return { mensagem: 'Ativação WhatsApp: 2 pessoas pediram para parar hoje. Fila pausada.', url: 'http://127.0.0.1:8086', tipo: 'erro' };
  }
  if (motivo === 'evolution_desconectada') {
    return { mensagem: 'WhatsApp da OLLI (final 7487) desconectou. Ativação pausada.', url: 'http://127.0.0.1:8086', tipo: 'login' };
  }
  return { mensagem: `Ativação WhatsApp pausada (${motivo || 'freio'}).`, url: 'http://127.0.0.1:8086', tipo: 'erro' };
}
import { decidir, intervaloAleatorioMin, montarFila } from './fila.mjs';
import { carregarHashes, syncFresca, idadeSyncHoras } from './supressao.mjs';
import { gerarLista } from './relatorio.mjs';
import { gravarContato, preparar } from './importar.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const DATA = '/home/igor/chatwoot-central/data';
const BASE = path.join(DIR, 'base.json');
const ESTADO = path.join(DATA, 'ativacao-estado.json');
const LOG = path.join(DATA, 'ativacao.log');
const FREIO = path.join(DATA, 'ativacao-freio.json');
const TRAVA = path.join(DATA, 'ativacao.lock');
const LISTA = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-13-ativacao-zap/LISTA-ENVIO.md';
const INBOX_NOME = 'OLLI Orçamentos';

function argTem(nome) { return process.argv.includes(nome); }

function limpar(texto) {
  return String(texto ?? '')
    .replace(/\+?\d[\d\s()-]{7,}\d/g, (m) => `****${m.replace(/\D/g, '').slice(-4)}`)
    .replace(/\s+/g, ' ')
    .slice(0, 240);
}

function logar(mensagem) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${limpar(mensagem)}\n`);
}

function lerJson(arquivo, padrao) {
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return padrao; }
}

function gravarJson(arquivo, valor) {
  const tmp = `${arquivo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(valor));
  fs.renameSync(tmp, arquivo);
}

function listaDe(resposta) {
  if (Array.isArray(resposta)) return resposta;
  if (Array.isArray(resposta?.payload)) return resposta.payload;
  return [];
}

async function comTrava(fn) {
  fs.mkdirSync(DATA, { recursive: true });
  try {
    if (fs.existsSync(TRAVA) && Date.now() - fs.statSync(TRAVA).mtimeMs > 15 * 60 * 1000) fs.unlinkSync(TRAVA);
  } catch { /* outra execução limpa */ }
  let fd;
  try { fd = fs.openSync(TRAVA, 'wx'); } catch { return { ocupado: true }; }
  try { return await fn(); } finally {
    try { fs.closeSync(fd); } catch { /* já fechado */ }
    try { fs.unlinkSync(TRAVA); } catch { /* já saiu */ }
  }
}

function avisarIgor(mensagem, url, tipo) {
  execFileSync('/home/igor/.local/bin/precisa-igor', [mensagem, url, tipo], { stdio: 'ignore', timeout: 60000 });
}

function jaRespondeu(mensagens) {
  return listaDe(mensagens).some((m) => m.message_type === 0 || m.message_type === 'incoming');
}

function etiquetasDe(resposta) {
  return listaDe(resposta).map((x) => (typeof x === 'string' ? x : x.title)).filter(Boolean);
}

async function conversaDoContato(api, contatoId, inboxId) {
  const lista = listaDe(await api('GET', `/contacts/${contatoId}/conversations`));
  return lista.find((c) => Number(c.inbox_id) === Number(inboxId)) || null;
}

async function garantirConversa(api, contato, inboxId, fone) {
  const existente = await conversaDoContato(api, contato.id, inboxId);
  if (existente?.id) return existente;
  const digitos = e164(fone).replace('+', '');
  const criada = await api('POST', '/conversations', {
    source_id: `${digitos}@s.whatsapp.net`,
    inbox_id: inboxId,
    contact_id: contato.id,
    status: 'pending',
  });
  return criada?.payload || criada;
}

async function etiquetarConversa(api, conversaId) {
  const atuais = etiquetasDe(await api('GET', `/conversations/${conversaId}/labels`));
  if (atuais.includes('ativacao')) return;
  await api('POST', `/conversations/${conversaId}/labels`, { labels: [...atuais, 'ativacao'] });
}

function bloqueioDeEtiqueta(nomes) {
  if (nomes.includes('parar-contato')) return 'parar-contato';
  if (nomes.includes('cliente-antigo')) return 'cliente-antigo';
  return '';
}

export async function enviarUma({
  api,
  pessoas,
  estado,
  hashesCsv,
  syncOk,
  teste,
  evolutionOk,
  freio,
  agora = new Date(),
  aleatorio = Math.random,
  inboxId,
}) {
  const { fila } = montarFila(pessoas, { hashesCsv, syncFresca: syncOk, teste, estado });
  const d = decidir({ agora, estado, fila, freio, evolutionAberta: evolutionOk });
  if (d.acao !== 'enviar') return d;

  const pessoa = d.pessoa;
  const fone = e164(pessoa.telefone_e164);
  const contato = await gravarContato(api, pessoa, inboxId);
  const etiquetasContato = etiquetasDe(await api('GET', `/contacts/${contato.id}/labels`));
  const bloco = bloqueioDeEtiqueta(etiquetasContato);
  if (bloco) {
    estado.itens[pessoa.conta_id] = { status: 'pulado', motivo: bloco, em: agora.toISOString(), contato: contato.id };
    return { acao: 'pular', motivo: bloco, pessoa };
  }
  const conversa = await garantirConversa(api, { id: contato.id }, inboxId, fone);
  if (!conversa?.id) return { acao: 'erro', motivo: 'sem_conversa', pessoa };
  const etiquetasConv = etiquetasDe(await api('GET', `/conversations/${conversa.id}/labels`));
  const blocoConv = bloqueioDeEtiqueta(etiquetasConv);
  if (blocoConv) {
    estado.itens[pessoa.conta_id] = { status: 'pulado', motivo: blocoConv, em: agora.toISOString(), conversa: conversa.id };
    return { acao: 'pular', motivo: blocoConv, pessoa };
  }
  if (jaRespondeu(await api('GET', `/conversations/${conversa.id}/messages`))) {
    estado.itens[pessoa.conta_id] = { status: 'pulado', motivo: 'ja_respondeu', em: agora.toISOString(), conversa: conversa.id };
    return { acao: 'pular', motivo: 'ja_respondeu', pessoa };
  }
  const texto = textoEnvio(pessoa);
  await api('POST', `/conversations/${conversa.id}/messages`, { content: texto, message_type: 'outgoing', private: false });
  await etiquetarConversa(api, conversa.id);
  const minutos = intervaloAleatorioMin(aleatorio);
  estado.proximo_em = new Date(agora.getTime() + minutos * 60 * 1000).toISOString();
  estado.itens[pessoa.conta_id] = { status: 'enviado', em: agora.toISOString(), conversa: conversa.id, contato: contato.id };
  return { acao: 'enviou', pessoa, conversa: conversa.id, minutos, fone: mascara(fone) };
}

export async function enviarComPulos(opcoes) {
  let ultimo = null;
  for (let i = 0; i < 30; i += 1) {
    ultimo = await enviarUma(opcoes);
    if (ultimo.acao !== 'pular') return ultimo;
  }
  return ultimo;
}

/** A lista oficial só sai de --seco --gravar, e nunca no modo teste. */
export function podeGravarListaOficial({ seco = false, teste = false, gravar = false } = {}) {
  return seco === true && gravar === true && teste !== true;
}

/**
 * Grava LISTA-ENVIO.md só quando a flag é a oficial.
 * No modo teste devolve false e não toca no arquivo.
 */
export function escreverListaOficial({ seco, teste, gravar, markdown, caminho, escrever = null }) {
  if (!podeGravarListaOficial({ seco, teste, gravar })) return false;
  if (/\+\d{10,}/.test(markdown)) throw new Error('lista_vazou_telefone');
  const gravarArquivo = escrever || ((alvo, texto) => {
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, texto);
  });
  gravarArquivo(caminho, markdown);
  return true;
}

function escreverLista(pessoas, ctx, trava, flags) {
  const md = gerarLista(pessoas, ctx, { quando: new Date().toISOString(), trava });
  return escreverListaOficial({ ...flags, markdown: md, caminho: LISTA });
}

async function main() {
  const seco = argTem('--seco');
  const teste = argTem('--teste');
  const gravar = argTem('--gravar');
  const flagsLista = { seco, teste, gravar };
  if (!fs.existsSync(BASE)) {
    const texto = 'base.json ainda não existe. Nada a enviar. O Salomão roda mapa.sql e salva o array em ativacao/base.json.';
    console.log(texto);
    escreverListaOficial({
      ...flagsLista,
      caminho: LISTA,
      markdown: `# LISTA DE ENVIO — ativação pelo WhatsApp da OLLI\n\n${texto}\n\nO comando de prévia, quando o arquivo existir: \`node enviar.mjs --seco --gravar\`.\n`,
    });
    process.exitCode = 2;
    return;
  }
  let pessoas = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  if (!Array.isArray(pessoas)) throw new Error('base_nao_e_lista');
  if (teste) {
    // Sempre o contato sintético da casa. Não pega a linha de um cliente que por acaso tenha o mesmo número.
    pessoas = [{
      conta_id: 'teste-casa', nome: 'Igor', telefone_e164: '+5511986032309', especialidade: '',
      cidade: '', etapa: 'cadastrou', cadastro: '', plano: 'gratis', orcamentos: 0, paga: false, suprimido: false, prioridade: 2,
    }];
  }
  let hashesCsv = null;
  try { hashesCsv = carregarHashes(); } catch { hashesCsv = null; }
  const syncOk = Boolean(hashesCsv) && syncFresca();
  const idade = idadeSyncHoras();
  const trava = !syncOk
    ? `TRAVA: supressão ${idade == null ? 'ilegível' : `com ${idade.toFixed(0)} h (limite 24 h)`}. Nenhum envio sai até o Salomão rodar sincronizar_supressao.py.`
    : 'Supressão dentro de 24 h.';
  const estado = lerJson(ESTADO, { itens: {}, proximo_em: null, freio_avisado: false });
  if (!estado.itens) estado.itens = {};
  const ctx = { hashesCsv: hashesCsv || new Set(), syncFresca: syncOk, teste, estado };
  escreverLista(pessoas, { ...ctx, syncFresca: syncOk }, trava, flagsLista);
  if (seco) {
    const previa = montarFila(pessoas, { ...ctx, syncFresca: true });
    const real = montarFila(pessoas, ctx);
    console.log(`${trava} prévia ${previa.fila.length}; liberada agora ${real.fila.length}`);
    for (const p of previa.fila.slice(0, 12)) {
      console.log(`${id8(p.conta_id)} ${mascara(p.telefone_e164)} ${p.etapa} | ${textoEnvio(p)}`);
    }
    if (previa.fila.length > 12) console.log(`… e mais ${previa.fila.length - 12}`);
    return;
  }

  const rodou = await comTrava(async () => {
    const freio = lerJson(FREIO, null);
    const filaAgora = montarFila(pessoas, { hashesCsv: hashesCsv || new Set(), syncFresca: syncOk, teste, estado }).fila;
    const antes = decidir({ agora: new Date(), estado, fila: filaAgora, freio: freio?.motivo ? freio : null, evolutionAberta: true });
    if (antes.acao !== 'enviar') {
      if (antes.acao === 'frear' && !estado.freio_avisado) {
        try {
          const aviso = textoDoFreio(antes.motivo);
          avisarIgor(aviso.mensagem, aviso.url, aviso.tipo);
          estado.freio_avisado = true;
        } catch { /* o log abaixo registra a falha se o processo cair */ }
      }
      gravarJson(ESTADO, estado);
      logar(`${antes.acao} ${antes.motivo || ''}`);
      console.log(`${antes.acao} ${antes.motivo || ''}`);
      return antes;
    }
    const evolutionOk = await evolutionPadrao();
    if (!evolutionOk) {
      const resultado = { acao: 'frear', motivo: 'evolution_desconectada' };
      if (!estado.freio_avisado) {
        try {
          const aviso = textoDoFreio('evolution_desconectada');
          avisarIgor(aviso.mensagem, aviso.url, aviso.tipo);
          estado.freio_avisado = true;
        } catch { /* segue o freio em arquivo */ }
      }
      gravarJson(FREIO, { motivo: 'evolution_desconectada', em: new Date().toISOString() });
      gravarJson(ESTADO, estado);
      logar('frear evolution_desconectada');
      console.log('frear evolution_desconectada');
      return resultado;
    }
    const prep = await preparar(cwPadrao);
    const resultado = await enviarComPulos({
      api: cwPadrao,
      pessoas,
      estado,
      hashesCsv: hashesCsv || new Set(),
      syncOk,
      teste,
      evolutionOk: true,
      freio: null,
      inboxId: prep.inboxId,
    });
    if (resultado.acao === 'enviou') {
      logar(`ENVIADO conta=${id8(resultado.pessoa.conta_id)} fone=${resultado.fone} conversa=${resultado.conversa} proximo=${resultado.minutos}min`);
      console.log(`enviado ${id8(resultado.pessoa.conta_id)} ${resultado.fone}`);
    } else if (resultado.acao === 'pular') {
      logar(`PULOU conta=${id8(resultado.pessoa.conta_id)} motivo=${resultado.motivo}`);
      console.log(`pulou ${id8(resultado.pessoa.conta_id)} ${resultado.motivo}`);
    } else {
      logar(`${resultado.acao} ${resultado.motivo || ''}`);
      console.log(`${resultado.acao} ${resultado.motivo || ''}`);
    }
    gravarJson(ESTADO, estado);
    return resultado;
  });
  if (rodou?.ocupado) console.log('outra execução está com a trava; saí sem mandar');
}

const direto = process.argv[1] && process.argv[1].endsWith('enviar.mjs');
if (direto) main().catch((e) => { try { logar(`ERRO ${e.message || e}`); } catch { /* sem pasta de log */ } console.error(limpar(e.message || e)); process.exitCode = 1; });
