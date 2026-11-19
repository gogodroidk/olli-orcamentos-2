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
const SENSIVEL = [
  [/\b(cpf|rg|cnh)\b/, 'documento (CPF/RG)'], [/\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, 'número de CPF'],
  [/\b(senha|password|token|pin)\b/, 'senha'], [/\b(cartao|credito|debito|cvv|validade do cartao)\b/, 'cartão'], [/(\d[ -]?){13,19}/, 'número de cartão'],
  [/(saude|doenc|diagnostic|cancer|diabet|depress|ansiedade|hiv|aids|gravidez|gravida|remedio|medicamento|tratamento medico|deficien|cirurgia|laudo|psiqui|transtorno)/, 'saúde'],
  [/(religi|igreja|evangelic|catolic|umbanda|candomble|espirit|ateu|ateia|judeu|muculmano|islam|budis|pastor|crente)/, 'religião'],
  [/(politic|partido|eleicao|eleitor|filiad|sindicat|voto|lula|bolsonar|petista|esquerda|direita)/, 'opinião política'],
  [/(orientacao|homossex|heterossex|bissex|\bgay\b|lesbica|\blgbt|transgenero|identidade de genero)/, 'orientação sexual/gênero'],
  [/(biometri|impressao digital|reconhecimento facial|\bdna\b|genetic)/, 'biometria/genético'],
  [/(\bnegro\b|\bnegra\b|\braca\b|etnia|origem racial)/, 'origem racial/étnica'],
];
/** null se pode entrar; senão o motivo (texto simples). */
export function motivoSensivel(fato) {
  const t = sem(fato);
  for (const [re, nome] of SENSIVEL) if (re.test(t)) return nome;
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

/** Evento de webhook (message_created do cliente OU conversation_updated com a etiqueta) → apaga e carimba a etiqueta. */
export async function tratarEventoParar(ev, { api, tok, ficha, log = () => {} }) {
  const conv = ev?.conversation || (ev?.event === 'conversation_updated' ? ev : null);
  if (!conv?.id) return { acao: 'nada' };
  const ehCliente = ev.event === 'message_created' && !ev.private && (ev.message_type === 'incoming' || ev.message_type === 0);
  const texto = ehCliente ? ev.content : '';
  if (!pedidoDeParar({ labels: conv.labels || [], texto })) return { acao: 'nada' };
  const c = { id: conv.id, inbox_id: ev.inbox?.id ?? conv.inbox_id, meta: { sender: conv.meta?.sender || ev.sender }, labels: conv.labels || [] };
  const r = apagarFicha({ c, ficha });
  log({ parar: r.ok ? 'ficha apagada e bloqueada' : r.motivo, conversa: conv.id });
  if (r.ok && !(conv.labels || []).includes('parar-contato')) {
    await api(tok, `/conversations/${conv.id}/labels`, 'POST', { labels: [...new Set([...(conv.labels || []), 'parar-contato'])] }).catch((e) => log({ erro: 'etiqueta parar-contato', conversa: conv.id, msg: e.message }));
  }
  return { acao: r.ok ? 'apagada' : 'nada', ...r };
}
