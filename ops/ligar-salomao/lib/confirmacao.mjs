// Confirmação de ordem feita no SERVIDOR (P1 do LIVRE no PR #395, CQ-LIGAR-SALOMAO-P1, 18/11/2026).
//
// Antes, a decisão "o Igor confirmou" vinha do texto do modelo e da transcrição repassada pelo navegador, e o
// texto enviado não ficava preso ao que foi lido para ele confirmar. Agora:
//  1) Cada ligação tem um id gerado no servidor, ligado à identidade de quem abriu a ligação (Access: e-mail e sub).
//     Toda chamada das ferramentas precisa do id da ligação E da mesma identidade.
//  2) A ferramenta da voz (mandar_recado) só PREPARA o pedido. O servidor guarda o texto exato e gera um token
//     aleatório de uso único (3 min). O token vai só para o código da página, nunca para o modelo.
//  3) Só /api/confirmar envia, e só com token + ligação + identidade certos. Quem chama o confirmar é a página, a
//     partir de um ato do Igor (toque no botão "Confirmar envio" ou um "sim" falado depois de a voz ler o pedido).
//     O texto enviado é o que o servidor guardou, não o que alguém manda depois.
//  4) O conteúdo lido do grupo e das decisões entra como DADO: o servidor guarda o que foi lido em cada ligação e
//     recusa preparar um pedido que copie esse conteúdo ou que atribua uma ordem ao Igor em 3ª pessoa
//     ("o Igor mandou pagar X").
import { randomUUID, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { mascarar } from "./acesso.mjs";
import { leuDestino, resolverLider, textoConfirmacao } from "./lideres.mjs";

export const VIDA_LIGACAO = 2 * 3600e3; // teto de uma ligação (o token do Google vale 30 min; a retomada reaproveita a ligação)
export const VIDA_PEDIDO = 3 * 60e3;
const MAX_ERROS_TOKEN = 3;

const ligacoes = new Map(); // id -> { dono, criada, encerrada, dados: Set<string> (n-gramas do conteúdo não confiável) }
const pedidos = new Map(); // id -> { ligacao, dono, destino, texto, hash, criado, estado, erros }

/** Identidade estável da requisição (posta por acesso.mjs → guarda). */
export const donoDe = (identidade) => String(identidade?.chave || "");

const hashToken = (token, p) => createHash("sha256")
  .update(JSON.stringify([p.ligacao, p.dono, p.destino, p.texto, token])).digest();

export function abrirLigacao(identidade, agora = Date.now()) {
  const dono = donoDe(identidade);
  if (!dono) return null;
  limparVelhos(agora);
  const id = randomUUID();
  ligacoes.set(id, { dono, criada: agora, encerrada: false, dados: new Set() });
  return id;
}

/** A ligação existe, está aberta, não passou do teto e pertence a esta identidade. */
export function ligacaoValida(id, identidade, agora = Date.now()) {
  const l = ligacoes.get(String(id || ""));
  if (!l || l.encerrada || agora - l.criada > VIDA_LIGACAO) return null;
  if (!donoDe(identidade) || l.dono !== donoDe(identidade)) return null;
  return l;
}

export function encerrarLigacao(id, identidade) {
  const l = ligacaoValida(id, identidade);
  if (!l) return false;
  l.encerrada = true;
  for (const p of pedidos.values()) if (p.ligacao === id && p.estado === "aguardando") p.estado = "cancelado";
  return true;
}

// ---------- texto normalizado ----------
export function palavras(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9$]+/g, " ").trim().split(" ").filter(Boolean);
}
const N = 4;
function ngramas(ps, n = N) {
  const out = [];
  for (let i = 0; i + n <= ps.length; i++) out.push(ps.slice(i, i + n).join(" "));
  return out;
}

/** Guarda (como n-gramas) o conteúdo NÃO confiável que a voz leu nesta ligação. */
export function registrarDado(id, identidade, texto) {
  const l = ligacaoValida(id, identidade);
  if (!l) return false;
  l.versaoEstado = (l.versaoEstado || 0) + 1;
  for (const linha of String(texto || "").split("\n")) {
    const ps = palavras(linha);
    // 4-gramas (pedidos normais) e 3-gramas (pedido curto de 3 palavras)
    for (const n of [3, N]) for (const g of ngramas(ps, n)) l.dados.add(g);
  }
  if (l.dados.size > 20000) l.dados = new Set([...l.dados].slice(-20000));
  return true;
}

// ordem atribuída ao Igor em 3ª pessoa: é assim que uma injeção no grupo se disfarça de ordem do dono
export const ORDEM_DE_TERCEIRO = /\b(o\s+)?igor\s+(j[aá]\s+)?(mandou|manda|pediu|pede|autorizou|aprovou|liberou|ordenou|disse|falou|quer|mandar|decidiu)\b|\b(ordem|pedido|recado|autoriza[cç][aã]o)\s+do\s+igor\b/i;
const MARCAS = /dado_nao_confiavel|\[LIGA[CÇ][AÃ]O|R-L[0-9A-F]{8}/i;

/** Motivo para recusar um pedido cujo texto veio do conteúdo lido (e não da boca do Igor). "" = ok. */
export function origemSuspeita(texto, l) {
  if (MARCAS.test(String(texto || ""))) return "o pedido traz marcas do sistema";
  if (ORDEM_DE_TERCEIRO.test(String(texto || ""))) return "o pedido diz que 'o Igor mandou'; ordem do Igor é a que ele fala agora, em 1ª pessoa";
  const ps = palavras(texto);
  if (l?.dados?.size && ps.length >= 3) {
    for (const g of ngramas(ps, Math.min(N, ps.length))) if (l.dados.has(g)) return "o pedido copia um trecho do que foi lido do grupo ou das decisões";
  }
  return "";
}

/** A pergunta lida em voz cobre o texto guardado? (≥ 60% das palavras com 4+ letras). */
const VAZIAS = new Set("para pela pelo como esta este essa esse isso aqui agora voce voces mais menos muito muita sobre entre depois antes ainda tambem quer quero manda mandar recado salomao igor confirma".split(" "));
export function cobre(pergunta, texto) {
  const alvo = [...new Set(palavras(texto).filter((p) => p.length >= 4 && !VAZIAS.has(p)))];
  const ouvido = new Set(palavras(pergunta));
  if (!alvo.length) return palavras(pergunta).join(" ").includes(palavras(texto).join(" "));
  return alvo.filter((p) => ouvido.has(p)).length / alvo.length >= 0.6;
}

/** Cria o pedido pendente. Devolve { ok, pedido, token, texto } ou { ok:false, motivo }. */
export function prepararPedido(id, identidade, destino, texto, agora = Date.now()) {
  const l = ligacaoValida(id, identidade, agora);
  if (!l) return { ok: false, motivo: "ligação inválida" };
  const lider = resolverLider(destino);
  if (!lider) return { ok: false, motivo: "escolha um dos oito líderes da OLLI" };
  const t = String(texto || "").trim();
  if (t.length < 3) return { ok: false, motivo: "pedido vazio" };
  const suspeito = origemSuspeita(t, l);
  if (suspeito) return { ok: false, motivo: suspeito, suspeito: true };
  if (mascarar(t) !== t || /(?:R\$|\b(?:BRL|USD|reais)\s*)\s*\d|\b\d[\d.,]*\s+reais\b/i.test(t)) {
    return { ok: false, motivo: "use apenas texto operacional, sem dados pessoais ou valores" };
  }
  limparVelhos(agora);
  // Uma nova leitura substitui o recado anterior desta ligação, mesmo se o navegador ainda exibir o cartão antigo.
  for (const p of pedidos.values()) {
    if (p.ligacao === id && p.estado === "aguardando") p.estado = "cancelado";
  }
  const pedido = randomUUID(), token = randomBytes(32).toString("base64url");
  const p = { ligacao: id, dono: l.dono, destino: lider.terminal, texto: t, versaoEstado: l.versaoEstado, criado: agora, estado: "aguardando", erros: 0 };
  p.hash = hashToken(token, p);
  pedidos.set(pedido, p);
  return { ok: true, pedido, token, destino: p.destino, para: lider.fala, texto: t, leitura: textoConfirmacao(lider, t) };
}

/**
 * Confere e CONSOME o token. Só depois disto o recado pode sair.
 * via "botao": o toque do Igor é o ato humano. via "voz": além do token, a fala tem de ser confirmação depois de a voz
 * ler o pedido (`confirmouFn(fala, pergunta)`) e a pergunta tem de cobrir o texto guardado.
 */
export function confirmarPedido({ ligacao, pedido, token, destino, identidade, via, fala = "", pergunta = "", confirmouFn }, agora = Date.now()) {
  const l = ligacaoValida(ligacao, identidade, agora);
  if (!l) return { ok: false, motivo: "ligação inválida" };
  const p = pedidos.get(String(pedido || ""));
  if (!p || p.ligacao !== ligacao || p.dono !== l.dono) return { ok: false, motivo: "pedido não existe nesta ligação" };
  if (p.estado !== "aguardando") return { ok: false, motivo: p.estado === "usado" ? "pedido já confirmado (token de uso único)" : `pedido ${p.estado}` };
  if (agora - p.criado > VIDA_PEDIDO) { p.estado = "expirado"; return { ok: false, motivo: "pedido expirado" }; }
  const dado = hashToken(String(token || ""), p);
  if (!token || !timingSafeEqual(dado, p.hash)) {
    p.erros += 1;
    if (p.erros >= MAX_ERROS_TOKEN) p.estado = "cancelado";
    return { ok: false, motivo: "token de confirmação inválido" };
  }
  if (destino !== p.destino) {
    p.estado = "cancelado";
    return { ok: false, motivo: "o destino do recado mudou; prepare um novo pedido" };
  }
  const lider = resolverLider(p.destino);
  if (via !== "botao" && via !== "voz") return { ok: false, motivo: "confirmação sem ato do Igor" };
  if (via === "voz") {
    if (typeof confirmouFn !== "function" || !confirmouFn(fala, pergunta)) return { ok: false, motivo: "a fala não é uma confirmação depois de 'confirma?'" };
    if (!leuDestino(pergunta, lider)) return { ok: false, motivo: "a voz leu outro destinatário; escute o recado novamente" };
    if (!cobre(pergunta, p.texto)) return { ok: false, motivo: "o que a voz leu não bate com o pedido guardado" };
    // conferido pelo SERVIDOR (não vem do navegador): se a voz leu o estado depois do pedido, o "sim" falado não vale
    if (l.versaoEstado !== p.versaoEstado) return { ok: false, motivo: "o estado da empresa foi lido depois do pedido; confirme no botão da tela" };
  }
  p.estado = "usado";
  return { ok: true, destino: p.destino, para: lider.fala, texto: p.texto, leitura: textoConfirmacao(lider, p.texto) };
}

export function cancelarPedido(ligacao, pedido, identidade) {
  const l = ligacaoValida(ligacao, identidade);
  const p = pedidos.get(String(pedido || ""));
  if (!l || !p || p.ligacao !== ligacao || p.estado !== "aguardando") return false;
  p.estado = "cancelado";
  return true;
}

function limparVelhos(agora) {
  for (const [k, p] of pedidos) if (agora - p.criado > 3600e3) pedidos.delete(k);
  for (const [k, l] of ligacoes) if (agora - l.criada > VIDA_LIGACAO + 3600e3) ligacoes.delete(k);
}
export const _zerarConfirmacao = () => { ligacoes.clear(); pedidos.clear(); };
