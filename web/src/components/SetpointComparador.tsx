import { useState } from 'react';

/**
 * A LINHA DE SETPOINT — a seção-assinatura interativa. Uma régua de temperatura
 * arrastável (38.0°C → 23.0°C) revela o MESMO serviço nos dois mundos: o caos
 * quente (WhatsApp/papel) à esquerda, a ordem fria (OLLI) à direita. Arrastar
 * "climatiza" a cena em tempo real. Acessível de teclado (input range real:
 * setas movem o setpoint). Sem canvas, sem WebGL — só clip-path + uma variável.
 */
export default function SetpointComparador() {
  const [x, setX] = useState(50); // 0 = tudo caos (quente) · 100 = tudo ordem (frio)
  const frio = x / 100;
  const temp = (38 - frio * (38 - 23)).toFixed(1);

  return (
    <div className="mx-auto max-w-4xl">
      {/* leitura do setpoint */}
      <div className="mb-4 flex items-end justify-between">
        <span className="etiqueta">◄ arraste o termostato ►</span>
        <div className="mono text-right leading-none">
          <span
            className="text-4xl font-semibold transition-colors"
            style={{ color: `color-mix(in oklab, var(--color-laranja), var(--color-fluido) ${frio * 100}%)` }}
          >
            {temp}
          </span>
          <span className="ml-1 text-lg text-gelo/50">°C</span>
        </div>
      </div>

      {/* palco: duas cenas sobrepostas, reveladas pelo clip */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl ring-1 ring-cobre/20 sm:aspect-[2/1]">
        {/* CENA QUENTE (caos) — embaixo, cobre tudo; conteúdo comprometido com a DIREITA */}
        <div className="absolute inset-0 bg-graxa p-6 sm:p-8">
          <div className="ml-auto flex h-full max-w-[54%] flex-col items-end text-right">
            <span className="etiqueta !border-laranja/40 !text-laranja">Quinta, 15h — sem a OLLI</span>
            <div className="mt-5 space-y-3">
              <div className="w-fit rotate-[1deg] rounded-2xl rounded-br-sm bg-[#221a15] px-4 py-2.5 text-sm text-gelo/80 shadow-lg">
                "manda o orçamento aí pra gente ver 🙏"
              </div>
              <div className="ml-auto w-fit rotate-[-1deg] rounded-2xl rounded-br-sm bg-[#2a2018] px-4 py-2.5 text-sm text-gelo/70 shadow-lg">
                rabisco no papel · foto tremida · "depois passo a limpo"
              </div>
              <div className="ml-auto w-fit rounded-2xl bg-[#221a15] px-4 py-2.5 text-sm text-laranja/90 shadow-lg">
                3 dias depois: "e aí, fechou?"
              </div>
            </div>
            <div className="mono mt-auto text-xs text-laranja/70">
              R$ 840,00 <span className="text-gelo/40">esfriando na incerteza</span>
            </div>
          </div>
        </div>

        {/* CENA FRIA (ordem) — em cima, revelada da esquerda até x%; conteúdo à ESQUERDA */}
        <div
          className="absolute inset-0 bg-maquinas p-6 sm:p-8"
          style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}
        >
          <div className="flex h-full max-w-[54%] flex-col">
            <span className="etiqueta !border-fluido/40 !text-fluido">Mesma quinta — com a OLLI</span>
            <div className="mt-5 w-full rounded-2xl bg-papel p-4 text-tinta shadow-xl">
              <div className="flex items-center justify-between border-b border-tinta/10 pb-2">
                <span className="mono text-xs font-semibold tracking-wider text-tinta/60">ORÇAMENTO Nº 0472</span>
                <span className="etiqueta !border-fluido-forte/40 !text-fluido-forte">Enviado</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-tinta/70">Diagnóstico + higienização</span>
                <span className="mono font-bold">R$ 840,00</span>
              </div>
              <div className="mt-3 rounded-lg bg-maquinas px-3 py-2 text-xs text-gelo">
                <span className="text-fluido">IA:</span> capacitor do compressor <span className="mono">45/5 µF · 82%</span>
              </div>
            </div>
            <div className="mono mt-auto flex items-center gap-2 text-xs text-fluido">
              <span>✓ fechado em</span> <span className="text-gelo">07:42</span>
            </div>
          </div>
        </div>

        {/* divisor + alça (na fronteira x%) */}
        <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${x}%` }}>
          <div className="absolute inset-y-0 -left-px w-0.5 bg-fluido/70 shadow-[0_0_20px_var(--color-fluido)]"></div>
          <div className="absolute top-1/2 -left-5 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-fluido text-maquinas shadow-xl">
            <span className="text-sm">⇄</span>
          </div>
        </div>

        {/* input range real por cima: acessível (teclado) e arrastável */}
        <input
          type="range"
          min={0}
          max={100}
          value={x}
          onChange={(e) => setX(Number(e.target.value))}
          aria-label="Termostato: arraste do caos (38°C) para a ordem da OLLI (23°C)"
          className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>

      <p className="mt-5 text-center text-sm text-gelo/50">
        O mesmo serviço, R$ 840,00. À esquerda ele esfria na incerteza; à direita, fecha em{' '}
        <span className="mono text-gelo/70">07:42</span>.
      </p>
    </div>
  );
}
