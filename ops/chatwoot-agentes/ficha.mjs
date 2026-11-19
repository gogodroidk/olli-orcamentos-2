// Ficha por cliente dentro do atendimento (CQ-CENTRAL-FICHA, D-2578). Liga o cerebro/ficha-cliente.mjs (RADAR) ao Chatwoot.
// Regras: chave = telefone; sem telefone não nasce; sem ficha não põe nota (nunca nota vazia); a nota é PRIVADA e marcada [ficha];
// se já existe [ficha] na conversa, troca o texto em vez de duplicar; só caixas 7487 (4) e 3507 (3); dado só local.
// Nada de extração automática por modelo: o fato só entra por `cw.mjs ficha <AGENTE> <conversa> "fato"`, escrito pelo agente.
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { CFG } from './lib.mjs';

export const MARCA = '[ficha]';
export const ETIQUETAS_PARAR = ['parar-contato'];
export const RESPOSTA_PARAR = /(^|[^a-z0-9])sair[-_ ]?lgpd($|[^a-z0-9])/i;

/** Caminho do módulo da ficha. Trocável por FICHA_CLIENTE (testes usam cópia + pasta temporária). */
export const caminhoFicha = () => process.env.FICHA_CLIENTE || '/home/igor/Desktop/Sistema/cerebro/ficha-cliente.mjs';
const cache = new Map();
export async function carregarFicha(caminho = caminhoFicha()) {
  if (!existsSync(caminho)) throw new Error(`módulo da ficha não encontrado (FICHA_CLIENTE): ${caminho}`);
  if (!cache.has(caminho)) cache.set(caminho, import(pathToFileURL(caminho).href));
  return cache.get(caminho);
}

const caixasOk = () => new Set(Object.values(CFG.caixas)); // 4 (7487) e 3 (3507); 2 e 5 nunca entram
export const caixaPermitida = (inboxId) => caixasOk().has(Number(inboxId));
export const telefoneDaConversa = (c) => c?.meta?.sender?.phone_number || c?.contact?.phone_number || null;

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Categorias que a ficha não guarda (LGPD art. 5º II e 11): saúde, religião, política, orientação, biometria + CPF, senha, cartão.
const luhn = (d) => { if (d.length < 13 || d.length > 19) return false; let soma = 0; for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } soma += n; } return soma % 10 === 0; };
const SENSIVEL = [
  [/\b(cpf|rg|cnh)\b/, 'documento (CPF/RG)'], [/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/, 'número de CPF'],
  [/\b(senha|password|token|pin)\b/, 'senha'], [/\b(cvv|validade do cartao)\b/, 'cartão'], [/\b(cartao|credito|debito)\b[^.;]{0,25}(\bfinal\b|\bnumero\b|\bn[o°º]\b|\d{4})/, 'cartão'],
  // forma de pagamento ("paga no cartão", "crédito em 3x") é fato comercial e passa; só NÚMERO de cartão (Luhn) é recusado.
  [(t) => (t.match(/\d(?:[ -]?\d){12,18}/g) || []).some((n) => luhn(n.replace(/\D/g, ''))), 'número de cartão'],
  [/(saude|doenc|diagnostic|cancer|diabet|depress|ansiedade|hiv|aids|gravidez|gravida|remedio|medicamento|tratamento medico|deficien|cirurgia|laudo|psiqui|transtorno)/, 'saúde'],
  [/(religi|igreja|evangelic|catolic|umbanda|candomble|espirit|ateu|ateia|judeu|muculmano|islam|budis|pastor(?! alemao)|crente)/, 'religião'],
  // "cano partido", "política de garantia" e "devoto" são fala comum de climatização/comércio: só a forma política conta.
  [/(partido politic|politica partidaria|eleicao|eleitor|filiad|sindicat|\bvot(o|ou|ar|ei)\b|lula|bolsonar|petista)/, 'opinião política'],
  [/(orientacao|homossex|heterossex|bissex|\bgay\b|lesbica|\blgbt|transgenero|identidade de genero)/, 'orientação sexual/gênero'],
  [/(biometri|impressao digital|reconhecimento facial|\bdna\b|genetic)/, 'biometria/genético'],
  [/(\bnegro\b|\bnegra\b|\braca\b|etnia|origem racial)/, 'origem racial/étnica'],
];
/** null se pode entrar; senão o motivo (texto simples). */
export function motivoSensivel(fato) {
  const t = sem(fato);
  for (const [re, nome] of SENSIVEL) if (typeof re === 'function' ? re(t) : re.test(t)) return nome;
  return null;
}

export function textoNota(linhas) {
  return `${MARCA} O que já sabemos deste cliente (só nossa equipe vê; mostre em palavras simples se ele perguntar):\n${linhas.map((l) => `• ${l}`).join('\n')}`;
}

/** Pega a ficha pelo telefone e põe/atualiza UMA nota privada [ficha] na conversa. Nunca nota vazia.
 *  @returns {{acao:'criada'|'atualizada'|'igual'|'nada', motivo?:string}} */
export async function anexarFicha({ api, tok, c, ficha }) {
  const id = c?.id;
  if (!caixaPermitida(c?.inbox_id)) return { acao: 'nada', motivo: `caixa ${c?.inbox_id} fora (só 7487 e 3507)` };
  const tel = telefoneDaConversa(c);
  if (!ficha.chave(tel)) return { acao: 'nada', motivo: 'contato sem telefone: ficha não nasce' };
  const linhas = ficha.ver(tel);
  if (!linhas.length) return { acao: 'nada', motivo: 'sem ficha' };
  const texto = textoNota(linhas);
  const r = await api(tok, `/conversations/${id}/messages`);
  const antigas = (r?.payload || []).filter((m) => m.private && !m.content_attributes?.deleted && String(m.content || '').startsWith(MARCA));
  if (antigas.length === 1 && antigas[0].content === texto) return { acao: 'igual' };
  // O Chatwoot não deixa editar o texto de uma nota: troca = apaga a antiga e põe a nova (nunca ficam duas [ficha] vivas).
  for (const m of antigas) await api(tok, `/conversations/${id}/messages/${m.id}`, 'DELETE');
  await api(tok, `/conversations/${id}/messages`, 'POST', { content: texto, message_type: 'outgoing', private: true });
  return { acao: antigas.length ? 'atualizada' : 'criada' };
}

/** Registra UM fato. Origem = id da conversa (obrigatória). Recusa sensível e sem origem. */
export function registrarFato({ c, fato, ficha, dia }) {
  const id = c?.id;
  if (!caixaPermitida(c?.inbox_id)) return { ok: false, motivo: `caixa ${c?.inbox_id} fora (só 7487 e 3507)` };
  if (!id) return { ok: false, motivo: 'sem origem (conversa): não entra' };
  const f = String(fato || '').trim();
  if (!f) return { ok: false, motivo: 'fato vazio' };
  const tel = telefoneDaConversa(c);
  if (!ficha.chave(tel)) return { ok: false, motivo: 'contato sem telefone: a ficha não nasce' };
  const s = motivoSensivel(f);
  if (s) return { ok: false, motivo: `dado sensível (${s}): a ficha não guarda` };
  return ficha.adicionar(tel, f, { origem: `conversa Chatwoot #${id}`, chatwoot: id, data: dia });
}

/** Pedido de parar/LGPD? (etiqueta na conversa OU cliente escreveu "sair-lgpd") */
export function pedidoDeParar({ labels = [], texto = '' }) {
  return labels.some((e) => ETIQUETAS_PARAR.includes(e)) || RESPOSTA_PARAR.test(String(texto));
}

/** Apaga a ficha do telefone e bloqueia nova. Sem telefone válido não faz nada. */
export function apagarFicha({ c, ficha }) {
  if (!caixaPermitida(c?.inbox_id)) return { ok: false, motivo: `caixa ${c?.inbox_id} fora (só 7487 e 3507)` };
  const tel = telefoneDaConversa(c);
  if (!ficha.chave(tel)) return { ok: false, motivo: 'contato sem telefone: nada a apagar' };
  return ficha.apagar(tel);
}

const textoDoFato = (linha) => String(linha).replace(/^\S+ · /, '').replace(/ \([^()]*\)$/, '').trim();

async function contatoDe({ api, tok, c, ficha }) {
  const id = c?.meta?.sender?.id ?? c?.contact?.id;
  if (id) return id;
  const tel = telefoneDaConversa(c);
  const r = await api(tok, `/contacts/search?q=${encodeURIComponent(String(tel || '').replace(/\D/g, ''))}`);
  const alvo = ficha.chave(tel);
  const achados = (r?.payload || []).filter((x) => alvo && ficha.chave(x?.phone_number) === alvo);
  return achados.length === 1 ? achados[0].id : null;
}

async function todasMensagens({ api, tok, conv }) {
  const vistas = new Map();
  let antes = null;
  for (let pag = 0; pag < 200; pag++) {
    const r = await api(tok, `/conversations/${conv}/messages${antes ? `?before=${antes}` : ''}`);
    const lote = (r?.payload || []).filter((m) => !vistas.has(m.id));
    if (!lote.length) break;
    for (const m of lote) vistas.set(m.id, m);
    antes = Math.min(...lote.map((m) => m.id));
  }
  return [...vistas.values()];
}

/** LGPD art. 18: apaga do Chatwoot as notas [ficha] de TODAS as conversas do contato (caixas 4 e 3) e qualquer outra nota
 *  privada que repita um fato da ficha. `fatos` = linhas da ficha lidas ANTES de apagar. Falha em uma não para as outras.
 *  @returns {{conversas:number, apagadas:number, falhas:string[]}} */
export async function apagarNotasFicha({ api, tok, c, ficha, fatos = [], log = () => {} }) {
  const falhas = [];
  let apagadas = 0;
  let convs = [];
  try {
    const contato = await contatoDe({ api, tok, c, ficha });
    if (contato) convs = ((await api(tok, `/contacts/${contato}/conversations`))?.payload || []).filter((x) => caixaPermitida(x.inbox_id));
  } catch (e) { falhas.push(`lista de conversas do contato: ${e.message}`); }
  if (!convs.some((x) => x.id === c?.id) && c?.id && caixaPermitida(c.inbox_id)) convs.push({ id: c.id, inbox_id: c.inbox_id }); // a conversa de origem sempre entra
  const trechos = fatos.map(textoDoFato).filter((t) => t.length >= 8).map((t) => t.toLowerCase());
  for (const x of convs) {
    try {
      for (const m of await todasMensagens({ api, tok, conv: x.id })) {
        if (!m.private || m.content_attributes?.deleted) continue;
        const txt = String(m.content || '');
        if (!(txt.startsWith(MARCA) || trechos.some((t) => txt.toLowerCase().includes(t)))) continue;
        await api(tok, `/conversations/${x.id}/messages/${m.id}`, 'DELETE');
        apagadas++;
      }
    } catch (e) { falhas.push(`conversa ${x.id}: ${e.message}`); log({ erro: 'apagar nota ficha', conversa: x.id, msg: e.message }); }
  }
  return { conversas: convs.length, apagadas, falhas };
}

/** Parar de verdade: ficha local + bloqueio + notas [ficha] no Chatwoot. */
export async function pararContato({ api, tok, c, ficha, log = () => {} }) {
  const tel = telefoneDaConversa(c);
  const fatos = caixaPermitida(c?.inbox_id) && ficha.chave(tel) ? ficha.ver(tel) : [];
  const r = apagarFicha({ c, ficha });
  if (!r.ok) return r;
  const notas = await apagarNotasFicha({ api, tok, c, ficha, fatos, log });
  return { ...r, notas };
}

/** Evento de webhook (message_created do cliente OU conversation_updated com a etiqueta) → apaga e carimba a etiqueta. */
export async function tratarEventoParar(ev, { api, tok, ficha, log = () => {} }) {
  const conv = ev?.conversation || (ev?.event === 'conversation_updated' ? ev : null);
  if (!conv?.id) return { acao: 'nada' };
  const ehCliente = ev.event === 'message_created' && !ev.private && (ev.message_type === 'incoming' || ev.message_type === 0);
  const texto = ehCliente ? ev.content : '';
  if (!pedidoDeParar({ labels: conv.labels || [], texto })) return { acao: 'nada' };
  const c = { id: conv.id, inbox_id: ev.inbox?.id ?? conv.inbox_id, meta: { sender: conv.meta?.sender || ev.sender }, labels: conv.labels || [] };
  const r = await pararContato({ api, tok, c, ficha, log });
  log({ parar: r.ok ? 'ficha apagada e bloqueada' : r.motivo, conversa: conv.id, notas_apagadas: r.notas?.apagadas, falhas: r.notas?.falhas });
  if (r.ok && !(conv.labels || []).includes('parar-contato')) {
    await api(tok, `/conversations/${conv.id}/labels`, 'POST', { labels: [...new Set([...(conv.labels || []), 'parar-contato'])] }).catch((e) => log({ erro: 'etiqueta parar-contato', conversa: conv.id, msg: e.message }));
  }
  return { acao: r.ok ? 'apagada' : 'nada', ...r };
}
