// Custo da ligação a partir do usageMetadata que o Gemini Live devolve a cada turno.
// Preço oficial (ai.google.dev/gemini-api/docs/pricing, lido em 18/11/2026), Gemini 3.8 Live, camada paga, US$ por 1M tokens:
//   entrada: texto 0,75 · áudio 3,00 (= US$ 0,005/min) · imagem/vídeo 1,00
//   saída (inclui pensamento): texto 4,50 · áudio 12,00 (= US$ 0,018/min)
// No Live, cada turno cobra o contexto inteiro de novo (promptTokenCount cresce ao longo da ligação).
export const PRECO = { entTexto: 0.75, entAudio: 3.0, saiTexto: 4.5, saiAudio: 12.0 };

const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.min(Number(v), 5e7) : 0);

/** Soma os usageMetadata de uma lista (cada item = 1 turno). */
export function somarUso(lista) {
  const s = { entTexto: 0, entAudio: 0, saiTexto: 0, saiAudio: 0, pensamento: 0, turnos: 0 };
  for (const u of Array.isArray(lista) ? lista.slice(0, 2000) : []) {
    if (!u || typeof u !== "object") continue;
    s.turnos++;
    const det = (arr, mod) => (Array.isArray(arr) ? arr : []).filter((d) => d && d.modality === mod).reduce((a, d) => a + n(d.tokenCount), 0);
    const pa = det(u.promptTokensDetails, "AUDIO"), pt = det(u.promptTokensDetails, "TEXT");
    s.entAudio += pa; s.entTexto += pt || Math.max(0, n(u.promptTokenCount) - pa);
    const ra = det(u.responseTokensDetails, "AUDIO"), rt = det(u.responseTokensDetails, "TEXT");
    s.saiAudio += ra; s.saiTexto += rt || Math.max(0, n(u.responseTokenCount) - ra);
    s.pensamento += n(u.thoughtsTokenCount);
  }
  return s;
}

export function custoDaLigacao(b = {}) {
  const segundos = n(b.segundos);
  const s = somarUso(b.uso);
  const usd = (s.entTexto * PRECO.entTexto + s.entAudio * PRECO.entAudio + (s.saiTexto + s.pensamento) * PRECO.saiTexto + s.saiAudio * PRECO.saiAudio) / 1e6;
  const minutos = segundos / 60;
  return { segundos: Math.round(segundos), tokens: s, usd: Number(usd.toFixed(5)), usdPorMinuto: minutos > 0 ? Number((usd / minutos).toFixed(5)) : null };
}
