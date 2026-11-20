// Ligação ao vivo com a assistente da OLLI. O token de confirmação de recado fica no navegador.
const API = "/ligar/api/";
const MSG_LIMITE = "O limite do Gemini foi atingido. Aguarde antes de tocar em Ligar de novo.";
const WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=";

const $ = (id) => document.getElementById(id);
// mesma regra do servidor (lib/ferramentas.mjs → confirmou); o servidor confere de novo
const PERGUNTOU = /\bconfirma\s*\?/i;
const CONFIRMA = /^\s*(sim|confirmo|confirmado|pode mandar|pode sim|pode ir|manda|isso( mesmo| a[íi])?|positivo|fechado|ok)\b[^?]{0,40}$/i;
// pergunta embutida (a transcrição nem sempre põe "?"): "ok, como está…", "sim, e a fila" não confirmam
const PERGUNTA_DENTRO = /\b(o que|como|qual|quais|quando|quem|onde|quant[oa]s?|por ?qu[eê]|me fal\w*|me diz\w*|e a|e o|e os|e as)\b/i;
const NEGA = /\b(n[ãa]o|nada|cancela|esquece|deixa)\b/i;
// A leitura só arma a voz se repetir a frase do servidor, com os mesmos termos, ordem e pontuação.
const normalizarLeitura = (s) => String(s).normalize("NFC").toLocaleLowerCase("pt-BR").trim().replace(/\s+/g, " ");
const el = { ligar: $("ligar"), desligar: $("desligar"), mudo: $("mudo"), status: $("status"), tempo: $("tempo"), anel: $("anel"), legenda: $("legenda"),
  cartao: $("cartao"), pedidoTitulo: $("cartao-titulo"), pedidoTexto: $("pedido-texto"), confirmar: $("confirmar"), cancelar: $("cancelar") };

let ws = null, modelo = "", handle = null, ativo = false, inicio = 0, relogio = null, travaTela = null;
let ctxMic = null, ctxSom = null, noMic = null, fluxo = null, proxTempo = 0, fontes = [], mudo = false;
let uso = [], falaTurno = "", falaDele = "", estadoDepois = false, reconectando = false, pendentes = new Set();
let ligacao = "";      // id da ligação aberto pelo servidor (preso ao login do Access)
let pend = null;       // { pedido, token, texto, perguntado } — o token NUNCA vai ao modelo
let timerVoz = null, timerPend = null;
let conexaoPronta = false, filaFerramentas = Promise.resolve();
const avisos = [];
let leituraNaFila = "";
let fimVoz = 0, inicioIgor = 0; // eco no viva-voz (P3 LIVRE): "sim" que chega < 700 ms depois da fala da voz não vale
const ECO_MS = 700;

async function post(rota, corpo) {
  const r = await fetch(API + rota, { method: "POST", headers: { "content-type": "application/json", "x-ligar": "1" }, body: JSON.stringify({ ...(corpo || {}), ligacao }), credentials: "same-origin" });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(j.erro || j.resultado || `erro ${r.status}`), { status: r.status });
  return j;
}

function estado(txt, anel) { el.status.textContent = txt; if (anel) el.anel.dataset.estado = anel; }
function legenda(txt, classe) {
  const p = document.createElement("p"); p.textContent = txt; if (classe) p.className = classe;
  el.legenda.append(p); while (el.legenda.children.length > 6) el.legenda.firstChild.remove();
  return p;
}
let pIgor = null, pDele = null;

function b64(buf) { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function deB64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

function tocar(base64, mime) {
  const taxa = Number((/rate=(\d+)/.exec(mime || "") || [])[1]) || 24000;
  const bytes = deB64(base64), amostras = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
  const buf = ctxSom.createBuffer(1, amostras.length, taxa), d = buf.getChannelData(0);
  for (let i = 0; i < amostras.length; i++) d[i] = amostras[i] / 32768;
  const f = ctxSom.createBufferSource(); f.buffer = buf; f.connect(ctxSom.destination);
  const agora = ctxSom.currentTime; if (proxTempo < agora + 0.03) proxTempo = agora + 0.03;
  f.start(proxTempo); proxTempo += buf.duration; fontes.push(f);
  f.onended = () => {
    fontes = fontes.filter((x) => x !== f);
    if (!fontes.length && ativo) {
      estado("Ouvindo…", "ouvindo");
      if (leituraNaFila) registrarFimVoz(leituraNaFila);
    }
  };
  estado("Assistente falando", "falando");
}
function calar() { for (const f of fontes) { try { f.stop(); } catch {} } fontes = []; proxTempo = 0; }

function invalidarLeitura() {
  leituraNaFila = "";
  if (pend) pend.perguntado = "";
  clearTimeout(timerVoz);
}

function registrarFimVoz(frase) {
  leituraNaFila = "";
  falaTurno = "";
  estadoDepois = false;
  fimVoz = Date.now();
  inicioIgor = 0;
  if (pend) {
    const confere = normalizarLeitura(frase) === normalizarLeitura(pend.leitura);
    pend.perguntado = confere ? frase : "";
    if (!confere && PERGUNTOU.test(frase)) {
      estado("A leitura saiu diferente. Peça para repetir ou confirme na tela.", "ouvindo");
    }
  }
}

function enviar(obj) {
  if (ws?.readyState !== 1) return false;
  try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
}

function erroGemini(evento) {
  const motivo = String(evento?.message || evento?.reason || evento?.status || "");
  if (evento?.code === 429 || evento?.status === "RESOURCE_EXHAUSTED" ||
      /\b429\b|quota|resource[_ ]exhausted|rate.?limit|too many requests/i.test(motivo)) {
    return Object.assign(new Error(MSG_LIMITE), { status: 429 });
  }
  return new Error("A conexão com o Google foi interrompida.");
}

async function abrirMic() {
  fluxo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  ctxMic = new AudioContext();
  await ctxMic.audioWorklet.addModule("/ligar/mic-worklet.js");
  noMic = new AudioWorkletNode(ctxMic, "microfone");
  noMic.port.postMessage({ mudo });
  noMic.port.onmessage = (e) => {
    if (conexaoPronta) enviar({ realtimeInput: { audio: { data: b64(e.data), mimeType: "audio/pcm;rate=16000" } } });
  };
  ctxMic.createMediaStreamSource(fluxo).connect(noMic);
  // o worklet precisa estar ligado a um destino para processar em alguns navegadores; ganho 0 = silêncio
  const g = ctxMic.createGain(); g.gain.value = 0; noMic.connect(g).connect(ctxMic.destination);
}

async function conectar(retomada) {
  const t = await post("token", { retomada: !!retomada });
  modelo = t.modelo; ligacao = t.ligacao;
  return new Promise((ok, falha) => {
    const socket = new WebSocket(WS_URL + encodeURIComponent(t.token));
    ws = socket;
    conexaoPronta = false;
    const falhou = (erro) => {
      if (ws !== socket) return;
      clearTimeout(timerSetup);
      if (!conexaoPronta) falha(erro);
      else {
        conexaoPronta = false;
        if (ativo && !reconectando) void retomar(erro);
      }
    };
    const timerSetup = setTimeout(() => falhou(new Error("O Google demorou a abrir a ligação.")), 10000);
    socket.onopen = () => {
      if (ws === socket) enviar({ setup: { model: `models/${modelo}`, sessionResumption: handle ? { handle } : {} } });
    };
    socket.onclose = (e) => falhou(erroGemini(e));
    socket.onmessage = async (m) => {
      if (ws !== socket || !ativo) return;
      let d; try { d = JSON.parse(typeof m.data === "string" ? m.data : await m.data.text()); } catch { return; }
      if (ws !== socket || !ativo) return;
      if (d.error) { falhou(erroGemini(d.error)); return; }
      if (d.setupComplete) {
        clearTimeout(timerSetup);
        conexaoPronta = true;
        ok();
        if (!retomada) enviar({ realtimeInput: { text: "[A ligação abriu. Cumprimente o Igor e diga que é a assistente da OLLI.]" } });
        if (avisos.length) aviso(avisos.splice(0).join(" "));
      }
      if (d.sessionResumptionUpdate?.resumable && d.sessionResumptionUpdate.newHandle) handle = d.sessionResumptionUpdate.newHandle;
      if (d.goAway && !reconectando) { void retomar(new Error("Renovando a linha.")); return; }
      if (d.usageMetadata) uso.push(d.usageMetadata);
      if (d.toolCall) {
        const chamada = ligacao;
        for (const fc of d.toolCall.functionCalls || []) {
          filaFerramentas = filaFerramentas.then(() => {
            if (ativo && ligacao === chamada && ws === socket) return ferramenta(fc, socket);
          });
        }
      }
      const sc = d.serverContent; if (!sc) return;
      if (sc.interrupted) {
        invalidarLeitura();
        calar();
        falaDele = "";
        pDele = null;
      }
      if (sc.inputTranscription?.text) {
        if (!inicioIgor) inicioIgor = Date.now();
        falaTurno = (falaTurno + sc.inputTranscription.text).slice(-300);
        if (!pIgor) pIgor = legenda("", ""); pIgor.textContent = `Você: ${falaTurno.slice(-200)}`;
        agendarVoz();
      }
      if (!sc.interrupted && sc.outputTranscription?.text) {
        if (!falaDele && !leituraNaFila) invalidarLeitura();
        falaDele += sc.outputTranscription.text;
        if (!pDele) pDele = legenda("", "dele"); pDele.textContent = `Assistente: ${falaDele.slice(-260)}`;
        pIgor = null;
      }
      if (!sc.interrupted) {
        for (const p of sc.modelTurn?.parts || []) if (p.inlineData?.data) tocar(p.inlineData.data, p.inlineData.mimeType);
        if (sc.turnComplete) {
          pDele = null;
          if (falaDele.trim()) {
            if (fontes.length) leituraNaFila = falaDele;
            else registrarFimVoz(falaDele);
          }
          falaDele = "";
        }
      }
    };
  });
}

async function retomar(erro) {
  if (reconectando || !ativo) return;
  if (erro.status === 429) { await desligar(erro.message); return; }
  reconectando = true;
  conexaoPronta = false;
  invalidarLeitura();
  calar();
  falaDele = "";
  pDele = null;
  estado("Reconectando…", "pensando");
  const velho = ws;
  ws = null;
  try { velho?.close(); } catch {}
  try {
    await conectar(true);
    if (ativo) estado("Ouvindo…", "ouvindo");
  } catch (e) {
    if (ativo) await desligar(e.status === 429 ? e.message : "A linha caiu. Toque em Ligar para tentar novamente.");
  } finally {
    reconectando = false;
  }
}

// "sim" falado: só depois de a voz ler o pedido guardado e perguntar "confirma?", sem leitura do estado no meio
function vozConfirma(t) { return !estadoDepois && inicioIgor - fimVoz >= ECO_MS && CONFIRMA.test(t) && !NEGA.test(t) && !PERGUNTA_DENTRO.test(t); }
function agendarVoz() {
  clearTimeout(timerVoz);
  if (!pend?.perguntado) return;
  timerVoz = setTimeout(() => {
    const t = falaTurno.trim();
    if (!pend?.perguntado || !t) return;
    if (vozConfirma(t) && PERGUNTOU.test(pend.perguntado)) confirmarPedido("voz");
    else if (NEGA.test(t)) cancelarPedido("o Igor disse não");
  }, 900);
}

function mostrarCartao(p) {
  el.pedidoTitulo.textContent = p ? `Recado para ${p.para} · aguardando confirmação` : "Confirmar recado";
  el.pedidoTexto.textContent = p ? p.texto : "";
  el.cartao.hidden = !p;
  el.confirmar.disabled = el.cancelar.disabled = false;
}

function aviso(texto) {
  if (!conexaoPronta || !enviar({ realtimeInput: { text: `[Aviso do sistema, não é fala do Igor] ${texto}` } })) {
    if (ativo && avisos.length < 10) avisos.push(texto);
  }
}

function comunicar(texto) {
  legenda(texto, "sistema");
  aviso(`Leia esta informação operacional para o Igor: “${texto}”`);
}

async function confirmarPedido(via) {
  const p = pend;
  if (!p) return;
  const chamada = ligacao;
  pend = null;
  clearTimeout(timerPend); clearTimeout(timerVoz);
  mostrarCartao(null);
  estado(`Encaminhando para ${p.para}…`, "pensando");
  let r;
  try {
    r = await post("confirmar", { pedido: p.pedido, token: p.token, destino: p.destino, via, fala: falaTurno, pergunta: p.perguntado });
  } catch (e) {
    r = { estado: "recusado", resultado: `Não consegui confirmar o envio. ${e.message}` };
  }
  if (!ativo || ligacao !== chamada) return;
  estado("Ouvindo…", "ouvindo");
  comunicar(r.resultado);
  if (r.estado === "esperando" && r.id) acompanhar(r.id, chamada);
}

async function cancelarPedido(motivo) {
  const p = pend; if (!p) return;
  const chamada = ligacao;
  pend = null; clearTimeout(timerPend); clearTimeout(timerVoz); mostrarCartao(null);
  try { await post("cancelar", { pedido: p.pedido }); } catch {}
  if (!ativo || ligacao !== chamada) return;
  legenda("Pedido cancelado. Nada foi enviado.", "sistema");
  aviso(`Pedido cancelado (${motivo}). Nada foi enviado. Diga isso ao Igor em poucas palavras.`);
}

async function ferramenta(fc, socket) {
  const chamada = ligacao;
  estado("Consultando…", "pensando");
  let resposta;
  try {
    if (fc.name === "estado_empresa") {
      estadoDepois = true;
      resposta = { resultado: (await post("estado")).resultado };
    } else if (fc.name === "mandar_recado") {
      const r = await post("preparar", { destino: fc.args?.destino, texto: fc.args?.texto });
      if (!ativo || ligacao !== chamada || ws !== socket) return;
      if (r.estado !== "aguardando") resposta = { erro: r.resultado };
      else {
        pend = { pedido: r.pedido, token: r.token, destino: r.destino, para: r.para, texto: r.texto, leitura: r.leitura, perguntado: "" };
        mostrarCartao(pend);
        clearTimeout(timerPend);
        timerPend = setTimeout(() => cancelarPedido("passou o tempo de confirmar"), 170e3);
        resposta = { resultado: "Recado preparado. Leia a frase de confirmação e espere o Igor.", leitura: r.leitura };
      }
    } else {
      resposta = { erro: "ferramenta inexistente" };
    }
  } catch (e) {
    resposta = { erro: String(e.message || e).slice(0, 200) };
  }
  if (!ativo || ligacao !== chamada || ws !== socket) return;
  estado(pend ? "Aguardando confirmação" : "Ouvindo…", "ouvindo");
  enviar({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: resposta }] } });
}

function acompanhar(id, chamada) {
  if (pendentes.has(id)) return;
  pendentes.add(id);
  const ate = Date.now() + 20 * 60e3 + 5000;
  const tick = async () => {
    if (!ativo || ligacao !== chamada || !pendentes.has(id)) return;
    try {
      const r = await post("resposta", { id });
      if (!ativo || ligacao !== chamada) return;
      if (r.estado !== "esperando") {
        pendentes.delete(id);
        comunicar(r.resultado || "A resposta deste recado ficou indisponível.");
        return;
      }
    } catch (e) {
      if (!ativo || ligacao !== chamada) return;
      if (e.status === 429 || e.status === 403) {
        pendentes.delete(id);
        comunicar("Não consegui acompanhar a resposta. Consulte o terminal do líder.");
        return;
      }
    }
    if (Date.now() >= ate) {
      pendentes.delete(id);
      comunicar("Não chegou resposta nesta ligação. Consulte o terminal do líder.");
      return;
    }
    setTimeout(tick, 5000);
  };
  setTimeout(tick, 1000);
}

function cronometro() {
  const s = Math.floor((Date.now() - inicio) / 1000);
  el.tempo.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function ligar() {
  if (ativo) return;
  el.ligar.disabled = true; estado("Chamando…", "pensando");
  try {
    ctxSom = new AudioContext(); await ctxSom.resume();   // destrava o som no toque do usuário (iOS/Android)
    await abrirMic();
    ativo = true; handle = null; uso = []; falaTurno = ""; falaDele = ""; fimVoz = inicioIgor = 0; estadoDepois = false; inicio = Date.now();
    ligacao = ""; pend = null; mostrarCartao(null);
    await conectar(false);
    el.ligar.hidden = true; el.desligar.hidden = false; el.mudo.hidden = false; el.tempo.hidden = false;
    relogio = setInterval(cronometro, 1000); cronometro();
    try { travaTela = await navigator.wakeLock?.request("screen"); } catch {}
    estado("Na linha", "ouvindo");
  } catch (e) {
    ativo = false; await limpar();
    const msg = /Permission|NotAllowed/i.test(e.name + e.message) ? "Preciso do microfone: libere nas permissões do navegador." : String(e.message || e);
    estado(msg, "erro"); el.ligar.disabled = false;
  }
}

async function limpar() {
  conexaoPronta = false;
  pendentes.clear(); avisos.length = 0;
  invalidarLeitura();
  calar();
  pend = null; clearTimeout(timerPend); clearTimeout(timerVoz); mostrarCartao(null);
  const anterior = ws;
  ws = null;
  try { anterior?.close(); } catch {}
  try { fluxo?.getTracks().forEach((t) => t.stop()); } catch {}
  try { ctxMic && (await ctxMic.close()); } catch {}
  try { ctxSom && (await ctxSom.close()); } catch {}
  ctxMic = ctxSom = noMic = fluxo = null;
  try { travaTela && (await travaTela.release()); } catch {} travaTela = null;
  clearInterval(relogio);
}

async function desligar(mensagem = "") {
  const chamada = ligacao;
  const segundos = ativo ? (Date.now() - inicio) / 1000 : 0;
  ativo = false; await limpar();
  el.ligar.hidden = false; el.ligar.disabled = false; el.desligar.hidden = true; el.mudo.hidden = true;
  estado(mensagem || "Ligação encerrada", mensagem ? "erro" : "parado");
  if (segundos > 0) {
    try {
      const c = await post("fim", { segundos, uso });
      if (c && ligacao === chamada) legenda(`Duração ${Math.round(segundos)} s`, "sistema");
    } catch {}
  }
}

el.ligar.addEventListener("click", ligar);
el.confirmar.addEventListener("click", () => confirmarPedido("botao"));
el.cancelar.addEventListener("click", () => cancelarPedido("o Igor tocou em Cancelar"));
el.desligar.addEventListener("click", () => desligar());
el.mudo.addEventListener("click", () => {
  mudo = !mudo; noMic?.port.postMessage({ mudo });
  el.mudo.setAttribute("aria-pressed", String(mudo)); el.mudo.textContent = mudo ? "Microfone mudo (toque para falar)" : "Microfone ligado";
});
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && ativo && !travaTela) { try { travaTela = await navigator.wakeLock?.request("screen"); } catch {} }
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/ligar/sw.js", { scope: "/ligar/" }).catch(() => {});
