import { useEffect } from 'react';

/**
 * O TERMOSTATO da página. Traduz o progresso de rolagem em `--temp` (0=quente,
 * 1=frio) na raiz — a única fonte do "resfriamento" do site SETPOINT. Custo ~zero:
 * um listener passivo coalescido por rAF que só escreve uma custom property (o
 * navegador interpola cor via color-mix no CSS). Sem canvas, sem WebGL, sem
 * reflow. A página esfria por completo em ~60% da rolagem, deixando as últimas
 * seções (prova, preço, CTA) já no clima frio — o clique acontece no alívio.
 */
export default function ThermalScroll() {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const aplicar = () => {
      raf = 0;
      const max = document.body.scrollHeight - window.innerHeight;
      const t = max > 0 ? Math.min(1, Math.max(0, window.scrollY / (max * 0.6))) : 1;
      root.style.setProperty('--temp', t.toFixed(3));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(aplicar); };
    aplicar();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
