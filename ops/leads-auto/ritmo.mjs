// Uma página por vez. O intervalo é o piso; crawl-delay do site soma em cima.

export function criarRitmo({
  intervaloMs = 2500,
  agora = () => Date.now(),
  esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let proximo = 0;
  return {
    async vez(extraMs = 0) {
      const agoraMs = agora();
      const falta = Math.max(0, proximo - agoraMs, extraMs);
      if (falta > 0) await esperar(falta);
      proximo = agora() + intervaloMs;
    },
  };
}
