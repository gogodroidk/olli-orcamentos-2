// Microfone: converte o áudio do navegador (44,1/48 kHz, float) em PCM 16 bits 16 kHz mono, em blocos de ~64 ms.
class Microfone extends AudioWorkletProcessor {
  constructor() {
    super();
    this.razao = sampleRate / 16000;
    this.pos = 0;
    this.buf = new Int16Array(1024);
    this.n = 0;
    this.mudo = false;
    this.port.onmessage = (e) => { if (e.data && typeof e.data.mudo === "boolean") this.mudo = e.data.mudo; };
  }
  process(entradas) {
    const canal = entradas[0]?.[0];
    if (!canal) return true;
    // reamostragem simples com média (anti-serrilhado básico) — suficiente para voz
    while (this.pos < canal.length) {
      const ini = Math.floor(this.pos), fim = Math.min(canal.length, Math.floor(this.pos + this.razao));
      let soma = 0, q = 0;
      for (let i = ini; i < Math.max(fim, ini + 1); i++) { soma += canal[i]; q++; }
      let v = this.mudo ? 0 : soma / q;
      v = Math.max(-1, Math.min(1, v));
      this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.buffer.slice(0)); this.n = 0; }
      this.pos += this.razao;
    }
    this.pos -= canal.length;
    return true;
  }
}
registerProcessor("microfone", Microfone);
