// Ligar pro Salomão — cliente da chamada ao vivo (Gemini Live direto do celular, token efêmero vindo do PC).
// O áudio vai do celular ao Google; o PC só entrega o token e executa as 2 ferramentas (estado_empresa, mandar_ao_salomao).
const API = "/ligar/api/";
const WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=";

const $ = (id) => document.getElementById(id);
const NEGA = /\b(n[ãa]o|nada|cancela|esquece|deixa)\b/i;
const CONFIRMA = /\b(sim|confirm[oa]?|confirmado|pode( mandar| sim)?|manda|isso( a[íi])?|ok|okay|positivo|claro|beleza|fechado|certo)\b/i;
const el = { ligar: $("ligar"), desligar: $("desligar"), mudo: $("mudo"), status: $("status"), tempo: $("tempo"), anel: $("anel"), legenda: $("legenda") };

let ws = null, modelo = "", handle = null, ativo = false, inicio = 0, relogio = null, travaTela = null;
let ctxMic = null, ctxSom = null, noMic = null, fluxo = null, proxTempo = 0, fontes = [], mudo = false;
let uso = [], falaIgor = "", falaTurno = "", falaDele = "", reconectando = false, pendentes = new Set();

async function post(rota, corpo) {
  const r = await fetch(API + rota, { method: "POST", headers: { "content-type": "application/json", "x-ligar": "1" }, body: JSON.stringify(corpo || {}), credentials: "same-origin" });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j.erro || j.resultado || `erro ${r.status}`);
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
  f.onended = () => { fontes = fontes.filter((x) => x !== f); if (!fontes.length && ativo) estado("Ouvindo…", "ouvindo"); };
  estado("Salomão falando", "falando");
}
function calar() { for (const f of fontes) { try { f.stop(); } catch {} } fontes = []; proxTempo = 0; }

function enviar(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

async function abrirMic() {
  fluxo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  ctxMic = new AudioContext();
  await ctxMic.audioWorklet.addModule("/ligar/mic-worklet.js");
  noMic = new AudioWorkletNode(ctxMic, "microfone");
  noMic.port.onmessage = (e) => enviar({ realtimeInput: { audio: { data: b64(e.data), mimeType: "audio/pcm;rate=16000" } } });
  ctxMic.createMediaStreamSource(fluxo).connect(noMic);
  // o worklet precisa estar ligado a um destino para processar em alguns navegadores; ganho 0 = silêncio
  const g = ctxMic.createGain(); g.gain.value = 0; noMic.connect(g).connect(ctxMic.destination);
}

async function conectar(retomada) {
  const t = await post("token", { retomada: !!retomada });
  modelo = t.modelo;
  return new Promise((ok, falha) => {
    let pronto = false;
    ws = new WebSocket(WS_URL + encodeURIComponent(t.token));
    ws.onopen = () => enviar({ setup: { model: `models/${modelo}`, sessionResumption: handle ? { handle } : {} } });
    ws.onerror = () => { if (!pronto) falha(new Error("não consegui conectar ao Google")); };
    ws.onclose = (e) => {
      if (!pronto) return falha(new Error(e.reason || "linha recusada"));
      if (ativo && !reconectando) retomar(e.reason || "a linha caiu");
    };
    ws.onmessage = async (m) => {
      let d; try { d = JSON.parse(typeof m.data === "string" ? m.data : await m.data.text()); } catch { return; }
      if (d.setupComplete) {
        pronto = true; ok();
        if (!retomada) enviar({ realtimeInput: { text: "[A ligação abriu. Cumprimente o Igor.]" } });
      }
      if (d.sessionResumptionUpdate?.resumable && d.sessionResumptionUpdate.newHandle) handle = d.sessionResumptionUpdate.newHandle;
      if (d.goAway) retomar("renovando a linha");
      if (d.usageMetadata) uso.push(d.usageMetadata);
      if (d.toolCall) for (const fc of d.toolCall.functionCalls || []) ferramenta(fc);
      const sc = d.serverContent; if (!sc) return;
      if (sc.interrupted) calar();
      if (sc.inputTranscription?.text) {
        falaIgor = (falaIgor + sc.inputTranscription.text).slice(-600);
        falaTurno = (falaTurno + sc.inputTranscription.text).slice(-300);
        if (!pIgor) pIgor = legenda("", ""); pIgor.textContent = `Você: ${(falaTurno || falaIgor).slice(-200)}`;
      }
      if (sc.outputTranscription?.text) {
        falaDele += sc.outputTranscription.text;
        if (!pDele) pDele = legenda("", "dele"); pDele.textContent = `Salomão: ${falaDele.slice(-260)}`;
        pIgor = null;
      }
      for (const p of sc.modelTurn?.parts || []) if (p.inlineData?.data) tocar(p.inlineData.data, p.inlineData.mimeType);
      if (sc.turnComplete) { pDele = null; falaDele = ""; falaTurno = ""; }   // falaTurno = só o que o Igor disse depois da última fala da voz
    };
  });
}

async function retomar(motivo) {
  if (reconectando || !ativo) return;
  reconectando = true;
  estado(`Reconectando… (${motivo})`, "pensando");
  const velho = ws; ws = null; try { velho?.close(); } catch {}
  for (let i = 0; i < 4 && ativo; i++) {
    try { await conectar(true); reconectando = false; estado("Ouvindo…", "ouvindo"); return; }
    catch { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  reconectando = false;
  if (ativo) { legenda("A linha caiu e não voltou. Toque em Ligar de novo.", "sistema"); desligar(); }
}

// a transcrição da fala do Igor pode chegar um pouco depois do pedido de ferramenta: espera até 2 s
async function confirmou() {
  for (let i = 0; i < 10 && !falaTurno.trim(); i++) await new Promise((r) => setTimeout(r, 200));
  const t = falaTurno;
  return CONFIRMA.test(t) && !(NEGA.test(t) && !/\bsim\b/i.test(t));
}

async function ferramenta(fc) {
  estado("Consultando…", "pensando");
  let resposta;
  try {
    if (fc.name === "estado_empresa") {
      resposta = { resultado: (await post("estado")).resultado };
    } else if (fc.name === "mandar_ao_salomao" && !(await confirmou())) {
      // trava que não depende do modelo: só sai recado se a última fala do Igor foi uma confirmação
      resposta = { erro: "O Igor ainda não confirmou em voz. Repita a ordem em uma frase, pergunte 'confirma?' e espere ele dizer sim. Nada foi enviado." };
    } else if (fc.name === "mandar_ao_salomao") {
      legenda(`Recado ao Salomão: ${String(fc.args?.texto || "").slice(0, 160)}`, "sistema");
      const r = await post("mandar", { texto: String(fc.args?.texto || ""), falaIgor, confirmacao: falaTurno });
      resposta = { resultado: r.resultado };
      if (r.estado === "esperando" && r.id) acompanhar(r.id);
    } else {
      resposta = { erro: "ferramenta inexistente" };
    }
  } catch (e) { resposta = { erro: String(e.message || e).slice(0, 200) }; }
  enviar({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: resposta }] } });
}

// resposta do Salomão que demorou: consulta a cada 5 s (até 11 min) e entrega à voz para ler
function acompanhar(id) {
  if (pendentes.has(id)) return; pendentes.add(id);
  const ini = Date.now();
  const tick = async () => {
    if (!ativo) { pendentes.delete(id); return; }
    try {
      const r = await post("resposta", { id });
      if (r.estado === "pronto" || r.estado === "erro") {
        pendentes.delete(id);
        legenda("Salomão respondeu.", "sistema");
        enviar({ realtimeInput: { text: `[Aviso do sistema, não é fala do Igor] Chegou a resposta do Salomão ao recado anterior: "${r.resposta}". Leia para o Igor de forma curta.` } });
        return;
      }
    } catch {}
    if (Date.now() - ini < 11 * 60e3) setTimeout(tick, 5000); else pendentes.delete(id);
  };
  setTimeout(tick, 5000);
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
    ativo = true; handle = null; uso = []; falaIgor = ""; falaTurno = ""; inicio = Date.now();
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
  calar();
  try { ws?.close(); } catch {} ws = null;
  try { fluxo?.getTracks().forEach((t) => t.stop()); } catch {}
  try { ctxMic && (await ctxMic.close()); } catch {}
  try { ctxSom && (await ctxSom.close()); } catch {}
  ctxMic = ctxSom = noMic = fluxo = null;
  try { travaTela && (await travaTela.release()); } catch {} travaTela = null;
  clearInterval(relogio);
}

async function desligar() {
  const segundos = ativo ? (Date.now() - inicio) / 1000 : 0;
  ativo = false; await limpar();
  el.ligar.hidden = false; el.ligar.disabled = false; el.desligar.hidden = true; el.mudo.hidden = true;
  estado("Ligação encerrada", "parado");
  if (segundos > 0) {
    try {
      const c = await post("fim", { segundos, uso });
      if (c && c.usd != null) legenda(`Duração ${Math.round(segundos)} s · custo estimado US$ ${c.usd.toFixed(3)}`, "sistema");
    } catch {}
  }
}

el.ligar.addEventListener("click", ligar);
el.desligar.addEventListener("click", desligar);
el.mudo.addEventListener("click", () => {
  mudo = !mudo; noMic?.port.postMessage({ mudo });
  el.mudo.setAttribute("aria-pressed", String(mudo)); el.mudo.textContent = mudo ? "Microfone mudo (toque para falar)" : "Microfone ligado";
});
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && ativo && !travaTela) { try { travaTela = await navigator.wakeLock?.request("screen"); } catch {} }
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/ligar/sw.js", { scope: "/ligar/" }).catch(() => {});
