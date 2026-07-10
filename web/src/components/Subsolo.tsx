import { useEffect, useRef, useState } from 'react';

const ITENS = [
  'Foto da condensadora',
  'Pressão de sucção · 62 psi',
  'Troca do capacitor · 45/5 µF',
  'Assinatura do cliente',
];

/**
 * O SUBSOLO — offline-first como teatro de confiança. O sinal cai barra a barra
 * até SEM SINAL, mas a OLLI CONTINUA preenchendo a ordem de serviço; quando o
 * sinal volta, pisca "✓ SINCRONIZADO". Prova a dor real (casa de máquinas,
 * subsolo, zona rural) que nenhum concorrente 100%-online entrega — a Gestão
 * Click tem reclamação pública disso no Reclame Aqui. Anima só quando visível;
 * reduced-motion recebe o estado final estático (offline, tudo feito).
 */
export default function Subsolo() {
  const ref = useRef<HTMLDivElement>(null);
  const [ativo, setAtivo] = useState(false);
  const [barras, setBarras] = useState(4);
  const [feitos, setFeitos] = useState(0);
  const [sinc, setSinc] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setAtivo(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!ativo) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBarras(0); setFeitos(ITENS.length); setSinc(false);
      return;
    }
    const t: number[] = [];
    const run = () => {
      setSinc(false); setFeitos(0); setBarras(4);
      t.push(window.setTimeout(() => setBarras(2), 800));
      t.push(window.setTimeout(() => setBarras(0), 1500)); // perdeu o sinal
      ITENS.forEach((_, i) => t.push(window.setTimeout(() => setFeitos(i + 1), 2300 + i * 750)));
      t.push(window.setTimeout(() => setBarras(3), 5700)); // sinal volta
      t.push(window.setTimeout(() => setSinc(true), 6100)); // sincronizou
      t.push(window.setTimeout(run, 8600)); // recomeça
    };
    run();
    return () => t.forEach((id) => clearTimeout(id));
  }, [ativo]);

  const semSinal = barras === 0;

  return (
    <div ref={ref} className="mx-auto max-w-md">
      <div className="relative overflow-hidden rounded-3xl border border-cobre/25 bg-maquinas p-5 shadow-2xl">
        {/* "tubulação" de cobre decorativa */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cobre/50 to-transparent"></div>

        {/* barra de status: sinal */}
        <div className="flex items-center justify-between">
          <div className="flex items-end gap-[3px]" aria-hidden="true">
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className="w-1.5 rounded-sm transition-all duration-500"
                style={{
                  height: `${6 + n * 4}px`,
                  background: n <= barras ? 'var(--color-gelo)' : 'rgba(255,255,255,0.14)',
                }}
              ></span>
            ))}
          </div>
          <span
            className="mono text-xs transition-colors duration-300"
            style={{ color: semSinal ? 'var(--color-laranja)' : 'rgba(223,246,241,0.6)' }}
          >
            {semSinal ? 'SEM SINAL' : `SINAL: ${barras} barras`}
          </span>
        </div>

        <div className="mt-4 border-t border-white/5 pt-4">
          <span className="etiqueta">OS Nº 118 · em campo</span>
          <ul className="mt-3 space-y-2">
            {ITENS.map((item, i) => {
              const feito = i < feitos;
              return (
                <li key={item} className="flex items-center gap-3 text-sm transition-opacity" style={{ opacity: feito ? 1 : 0.4 }}>
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] transition-all"
                    style={{
                      background: feito ? 'var(--color-fluido)' : 'transparent',
                      border: feito ? 'none' : '1px solid rgba(223,246,241,0.25)',
                      color: 'var(--color-maquinas)',
                    }}
                  >{feito ? '✓' : ''}</span>
                  <span className={feito ? 'text-gelo' : 'text-gelo/50'}>{item}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* rodapé de sincronização */}
        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
          <span className="mono text-xs text-gelo/40">
            {semSinal ? 'salvando no aparelho…' : 'na fila de sincronização'}
          </span>
          <span
            className="mono text-xs font-semibold transition-all duration-300"
            style={{
              color: sinc ? 'var(--color-fluido)' : 'rgba(223,246,241,0.3)',
              opacity: sinc ? 1 : 0.5,
            }}
          >
            {sinc ? '✓ SINCRONIZADO' : '⟳ aguardando sinal'}
          </span>
        </div>
      </div>

      <p className="mt-5 text-center text-sm text-gelo/50">
        Casa de máquinas, subsolo, zona rural. A OLLI trabalha no aparelho e
        <span className="text-gelo/70"> sincroniza quando a internet volta</span> — sem perder nada.
      </p>
    </div>
  );
}
