// Manda no máximo UMA mensagem por execução, pela caixa Segundo Andar.
//   node enviar.mjs --seco              mostra a fila, não chama a API
//   node enviar.mjs --seco --gravar     também reescreve LISTA-ENVIO.md
//   node enviar.mjs --teste             só o número da casa, e só dentro da janela
//   node enviar.mjs                     uma mensagem, se a janela, os tetos e os freios deixarem
// O timer chama sem flag. Não liga sozinho.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cw as cwPadrao } from '../../ativacao/cw.mjs';
import { e164, mascara } from '../../ativacao/telefones.mjs';
import { carregarHashes, syncFresca, idadeSyncHoras } from '../../ativacao/supressao.mjs';
import { lerProspects, lerHashesLog, montarLeads, leadDeTeste } from './leads.mjs';
import { textoDaVez, textoProibido } from './mensagens.mjs';
import { janelaAberta } from '../../ativacao/fila.mjs';
import { decidirCampanha, intervaloCampanha } from './ritmo.mjs';
import { gerarLista } from './lista.mjs';

const DATA = '/home/igor/chatwoot-central/data';
const CSV = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-07-prospeccao-servicos/PROSPECTS.csv';
const LOG_ANTIGO = '/home/igor/Desktop/Entregas Claude/OLLI/2026-10-24-envios/LOG.csv';
const ESTADO = path.join(DATA, 'prospeccao-estado.json');
const LOG = path.join(DATA, 'prospeccao.log');
const FREIO = path.join(DATA, 'prospeccao-freio.json');
const TRAVA = path.join(DATA, 'prospeccao.lock');
const VIGIA = path.join(DATA, 'vigia-estado.json');
const LISTA = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-13-prospeccao-zap/LISTA-ENVIO.md';
const INBOX_NOME = 'Segundo Andar';
const ETIQUETA = 'prospeccao';
const VIGIA_MAX_MIN = 30;

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
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(valor));
  fs.renameSync(tmp, arquivo);
}

function listaDe(resposta) {
  if (Array.isArray(resposta)) return resposta;
  if (Array.isArray(resposta?.payload)) return resposta.payload;
  return [];
}

export function segundoAndarAberto(vigia, { fresco = true } = {}) {
  if (!fresco) return false;
  const s = vigia?.['segundo-andar'];
  return Boolean(s?.jaConectou && !s?.caido);
}

export function vigiaFresca(caminho = VIGIA, agora = new Date(), maxMin = VIGIA_MAX_MIN) {
  try {
    const st = fs.statSync(caminho);
    return agora.getTime() - st.mtimeMs < maxMin * 60 * 1000;
  } catch {
    return false;
  }
}

export function textoDoFreio(motivo) {
  if (motivo === '2_paradas') {
    return { mensagem: 'Prospecção OLLI Serviços: 2 pessoas pediram para parar hoje. Fila pausada.', url: 'http://127.0.0.1:8086', tipo: 'erro' };
  }
  if (motivo === 'evolution_desconectada' || motivo === 'vigia_velha') {
    return { mensagem: 'WhatsApp do Segundo Andar (final 3507) desconectou ou o vigia está velho. Prospecção pausada.', url: 'http://127.0.0.1:8086', tipo: 'login' };
  }
  return { mensagem: `Prospecção OLLI Serviços pausada (${motivo || 'freio'}).`, url: 'http://127.0.0.1:8086', tipo: 'erro' };
}

function etiquetasDe(resposta) {
  return listaDe(resposta).map((x) => (typeof x === 'string' ? x : x.title || x.name)).filter(Boolean);
}

function bloqueioDeEtiqueta(nomes) {
  if (nomes.includes('parar-contato')) return 'parar-contato';
  return '';
}

function jaRespondeu(mensagens) {
  return listaDe(mensagens).some((m) => m.message_type === 0 || m.message_type === 'incoming');
}

async function preparar(api) {
  const labels = listaDe(await api('GET', '/labels')).map((l) => l.title || l.name);
  if (!labels.includes(ETIQUETA)) {
    await api('POST', '/labels', {
      title: ETIQUETA,
      description: 'Empresa de serviço abordada pela OLLI Serviços. O Rafa conduz. Sem preço na conversa.',
      color: '#7C3AED',
      show_on_sidebar: true,
    });
  }
  const defs = listaDe(await api('GET', '/custom_attribute_definitions'));
  if (!defs.some((d) => d.attribute_key === 'nicho')) {
    await api('POST', '/custom_attribute_definitions', {
      attribute_display_name: 'Nicho',
      attribute_display_type: 'text',
      attribute_description: 'Nicho da prospecção OLLI Serviços',
      attribute_key: 'nicho',
      attribute_model: 'contact_attribute',
    });
  }
  const inboxes = listaDe(await api('GET', '/inboxes'));
  const inbox = inboxes.find((i) => i.name === INBOX_NOME);
  if (!inbox?.id) throw new Error('caixa_segundo_andar_nao_encontrada');
  return { inboxId: inbox.id };
}

async function acharContato(api, lead) {
  const fone = e164(lead.telefone_e164).replace('+', '');
  const termo = lead.id === 'teste-casa' ? fone : (lead.id || fone);
  const achados = listaDe(await api('GET', `/contacts/search?q=${encodeURIComponent(termo)}`));
  const nossos = new Set([fone, lead.id]);
  return achados.find((c) => {
    const dig = String(c.phone_number || '').replace(/\D/g, '');
    return nossos.has(dig) || c.identifier === `pros-${lead.id}` || c.identifier === lead.id;
  }) || null;
}

async function gravarContato(api, lead, inboxId) {
  const fone = e164(lead.telefone_e164);
  const existente = await acharContato(api, lead);
  const custom = { ...(existente?.custom_attributes || {}), nicho: lead.nicho, campanha: ETIQUETA };
  let contato = existente;
  if (!existente) {
    const criado = await api('POST', '/contacts', {
      inbox_id: inboxId,
      name: String(lead.nome || 'Empresa').slice(0, 80),
      phone_number: fone,
      identifier: `pros-${lead.id}`,
      custom_attributes: custom,
    });
    contato = criado?.payload?.contact || criado?.payload || criado;
  } else {
    const atualizado = await api('PUT', `/contacts/${existente.id}`, {
      name: existente.name || String(lead.nome || 'Empresa').slice(0, 80),
      custom_attributes: custom,
    });
    contato = atualizado?.payload || atualizado || existente;
  }
  const id = contato?.id || existente?.id;
  if (!id) throw new Error('contato_sem_id');
  const nomes = etiquetasDe(await api('GET', `/contacts/${id}/labels`));
  if (bloqueioDeEtiqueta(nomes)) return { id, etiquetas: nomes };
  if (!nomes.includes(ETIQUETA)) {
    await api('POST', `/contacts/${id}/labels`, { labels: [...nomes, ETIQUETA] });
  }
  return { id, etiquetas: nomes.includes(ETIQUETA) ? nomes : [...nomes, ETIQUETA] };
}

async function garantirConversa(api, contatoId, inboxId, fone) {
  const lista = listaDe(await api('GET', `/contacts/${contatoId}/conversations`));
  const existente = lista.find((c) => Number(c.inbox_id) === Number(inboxId));
  if (existente?.id) return existente;
  const digitos = e164(fone).replace('+', '');
  const criada = await api('POST', '/conversations', {
    source_id: `${digitos}@s.whatsapp.net`,
    inbox_id: inboxId,
    contact_id: contatoId,
    status: 'pending',
  });
  return criada?.payload || criada;
}

async function etiquetarConversa(api, conversaId) {
  const atuais = etiquetasDe(await api('GET', `/conversations/${conversaId}/labels`));
  if (atuais.includes(ETIQUETA)) return atuais;
  const labels = [...atuais, ETIQUETA];
  await api('POST', `/conversations/${conversaId}/labels`, { labels });
  return labels;
}

export async function enviarUma({
  api,
  pessoas,
  estado,
  teste = false,
  evolutionOk = true,
  freio = null,
  agora = new Date(),
  aleatorio = Math.random,
  inboxId,
}) {
  const d = decidirCampanha({ agora, estado, fila: pessoas, freio, evolutionAberta: evolutionOk });
  if (d.acao !== 'enviar') return d;
  const lead = d.pessoa;
  if (teste && lead.id !== 'teste-casa') return { acao: 'pular', motivo: 'teste_so_numero_da_casa', pessoa: lead };
  const fone = e164(lead.telefone_e164);
  const contato = await gravarContato(api, lead, inboxId);
  if (bloqueioDeEtiqueta(contato.etiquetas)) {
    estado.itens[lead.id] = { status: 'pulado', motivo: 'parar-contato', em: agora.toISOString(), contato: contato.id, nicho: lead.nicho };
    return { acao: 'pular', motivo: 'parar-contato', pessoa: lead };
  }
  const conversa = await garantirConversa(api, contato.id, inboxId, fone);
  if (!conversa?.id) return { acao: 'erro', motivo: 'sem_conversa', pessoa: lead };
  const etiquetasConv = etiquetasDe(await api('GET', `/conversations/${conversa.id}/labels`));
  if (bloqueioDeEtiqueta(etiquetasConv)) {
    estado.itens[lead.id] = { status: 'pulado', motivo: 'parar-contato', em: agora.toISOString(), conversa: conversa.id, nicho: lead.nicho };
    return { acao: 'pular', motivo: 'parar-contato', pessoa: lead };
  }
  const mensagens = await api('GET', `/conversations/${conversa.id}/messages`);
  if (jaRespondeu(mensagens)) {
    estado.itens[lead.id] = { status: 'pulado', motivo: 'ja_respondeu', em: agora.toISOString(), conversa: conversa.id, nicho: lead.nicho, respondeu: true };
    return { acao: 'pular', motivo: 'ja_respondeu', pessoa: lead };
  }
  const texto = textoDaVez(lead, d.toque);
  if (textoProibido(texto)) return { acao: 'erro', motivo: 'texto_proibido', pessoa: lead };
  await api('POST', `/conversations/${conversa.id}/messages`, { content: texto, message_type: 'outgoing', private: false });
  await etiquetarConversa(api, conversa.id);
  const minutos = intervaloCampanha(aleatorio);
  estado.proximo_em = new Date(agora.getTime() + minutos * 60 * 1000).toISOString();
  const anterior = estado.itens[lead.id] || {};
  if (d.toque === 2) {
    estado.itens[lead.id] = { ...anterior, status: 'enviado', followup_em: agora.toISOString(), conversa: conversa.id, contato: contato.id, nicho: lead.nicho };
  } else {
    estado.itens[lead.id] = { status: 'enviado', em: agora.toISOString(), toque: 1, conversa: conversa.id, contato: contato.id, nicho: lead.nicho };
  }
  return { acao: 'enviou', pessoa: lead, conversa: conversa.id, minutos, toque: d.toque, fone: mascara(fone) };
}

export async function enviarComPulos(opcoes) {
  let ultimo = null;
  for (let i = 0; i < 30; i += 1) {
    ultimo = await enviarUma(opcoes);
    if (ultimo.acao !== 'pular') return ultimo;
  }
  return ultimo;
}

function contextoDe(teste) {
  const hashesCsv = carregarHashes();
  const hashesLog = lerHashesLog(fs.readFileSync(LOG_ANTIGO, 'utf8'));
  return { hashesCsv, hashesLog, syncFresca: syncFresca(), teste };
}

function escreverLista(fila, fora, trava) {
  fs.mkdirSync(path.dirname(LISTA), { recursive: true });
  const md = gerarLista(fila, fora, { quando: new Date().toISOString(), trava });
  if (/\+55\d{8,}/.test(md) || /\(\d{2}\)\s?\d{4,5}-?\d{4}/.test(md)) throw new Error('lista_vazou_telefone');
  fs.writeFileSync(LISTA, md);
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

function carregarPessoas(teste) {
  if (teste) return [leadDeTeste()];
  return lerProspects(fs.readFileSync(CSV, 'utf8'));
}

async function main() {
  const seco = argTem('--seco');
  const teste = argTem('--teste');
  const gravar = argTem('--gravar');
  const pessoas = carregarPessoas(teste);
  const ctx = contextoDe(teste);
  const idade = idadeSyncHoras();
  const trava = !ctx.syncFresca
    ? `TRAVA: supressão ${idade == null ? 'ilegível' : `com ${idade.toFixed(0)} h (limite 24 h)`}. Nenhum envio sai.`
    : 'Supressão dentro de 24 h.';
  const { fila, fora } = montarLeads(pessoas, ctx);
  if (seco || gravar) escreverLista(fila, fora, trava);
  if (seco) {
    console.log(`${trava} fila ${fila.length}; de fora ${fora.length}`);
    for (const lead of fila.slice(0, 10)) {
      console.log(`${lead.id} ${mascara(lead.telefone_e164)} ${lead.nicho} | ${textoDaVez(lead, 1)}`);
    }
    if (fila.length > 10) console.log(`… e mais ${fila.length - 10}`);
    return;
  }

  const estado = lerJson(ESTADO, { itens: {}, proximo_em: null, freio_avisado: false });
  if (!estado.itens) estado.itens = {};
  if (!janelaAberta(new Date())) {
    logar('fora_janela fora_do_horario');
    console.log('fora_janela fora_do_horario');
    return;
  }
  const freio = lerJson(FREIO, null);
  const vigia = lerJson(VIGIA, null);
  const fresco = vigiaFresca(VIGIA);
  const evolutionOk = segundoAndarAberto(vigia, { fresco });
  const antes = decidirCampanha({
    agora: new Date(),
    estado,
    fila,
    freio: freio?.motivo ? freio : null,
    evolutionAberta: evolutionOk,
  });
  if (!evolutionOk && antes.acao !== 'fora_janela' && antes.acao !== 'fila_vazia' && !freio?.motivo) {
    antes.acao = 'frear';
    antes.motivo = fresco ? 'evolution_desconectada' : 'vigia_velha';
  }

  const rodou = await comTrava(async () => {
    if (antes.acao !== 'enviar') {
      if (antes.acao === 'frear' && !estado.freio_avisado) {
        try {
          const aviso = textoDoFreio(antes.motivo);
          avisarIgor(aviso.mensagem, aviso.url, aviso.tipo);
          estado.freio_avisado = true;
        } catch { /* o log registra a execução */ }
        if (!freio?.motivo) gravarJson(FREIO, { motivo: antes.motivo, em: new Date().toISOString() });
      }
      gravarJson(ESTADO, estado);
      logar(`${antes.acao} ${antes.motivo || ''}`);
      console.log(`${antes.acao} ${antes.motivo || ''}`);
      return antes;
    }
    const prep = await preparar(cwPadrao);
    const resultado = await enviarComPulos({
      api: cwPadrao,
      pessoas: fila,
      estado,
      teste,
      evolutionOk: true,
      freio: null,
      inboxId: prep.inboxId,
    });
    if (resultado.acao === 'enviou') {
      logar(`ENVIADO id=${resultado.pessoa.id} fone=${resultado.fone} toque=${resultado.toque} conversa=${resultado.conversa} proximo=${resultado.minutos}min`);
      console.log(`enviado ${resultado.pessoa.id} ${resultado.fone} toque ${resultado.toque}`);
    } else {
      logar(`${resultado.acao} ${resultado.motivo || ''} ${resultado.pessoa?.id || ''}`);
      console.log(`${resultado.acao} ${resultado.motivo || ''}`);
    }
    gravarJson(ESTADO, estado);
    return resultado;
  });
  if (rodou?.ocupado) console.log('outra execução está com a trava; saí sem mandar');
}

const direto = process.argv[1] && process.argv[1].endsWith('enviar.mjs');
if (direto) main().catch((e) => { try { logar(`ERRO ${e.message || e}`); } catch { /* sem pasta de log */ } console.error(limpar(e.message || e)); process.exitCode = 1; });
