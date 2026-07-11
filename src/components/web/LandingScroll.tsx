import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Platform } from 'react-native';

/**
 * Fonte única da posição de rolagem da LandingScreen (WEB).
 *
 * Por que isto existe: no web, a `ScrollView` da LandingScreen é o único
 * `onScroll` real — a JANELA não rola (`body` fica com `overflow:hidden`,
 * ver public/index.html, o reset recomendado pelo react-native-web). Qualquer
 * efeito que precise da posição de rolagem (parallax do hero, CTA fixa ao
 * passar do hero) tem que assinar AQUI em vez de abrir `window.addEventListener
 * ('scroll', ...)` — que nunca dispararia.
 *
 * A notificação já sai throttled a 1×/frame via `requestAnimationFrame`
 * (`useLandingScrollHandler`), então os assinantes (`useLandingScrollY`) nunca
 * fazem trabalho de mais de uma vez por frame, não importa a frequência real
 * do evento de scroll do navegador.
 */

type OuvinteScroll = (y: number) => void;

interface LandingScrollCtxValue {
  inscrever: (fn: OuvinteScroll) => () => void;
  notificar: (y: number) => void;
  /** Altura acumulada (Topo + Hero) — a partir daqui a CTA fixa aparece. Escrita por `useDefinirLimiarLanding`. */
  limiarRef: React.MutableRefObject<number>;
}

const LandingScrollCtx = createContext<LandingScrollCtxValue | null>(null);

export function LandingScrollProvider({ children }: { children: React.ReactNode }) {
  const limiarRef = useRef(Number.POSITIVE_INFINITY);
  const ouvintes = useRef(new Set<OuvinteScroll>()).current;

  const notificar = useCallback((y: number) => {
    ouvintes.forEach((fn) => fn(y));
  }, [ouvintes]);

  const inscrever = useCallback((fn: OuvinteScroll) => {
    ouvintes.add(fn);
    return () => { ouvintes.delete(fn); };
  }, [ouvintes]);

  const value = useMemo<LandingScrollCtxValue>(() => ({ inscrever, notificar, limiarRef }), [inscrever, notificar]);

  return <LandingScrollCtx.Provider value={value}>{children}</LandingScrollCtx.Provider>;
}

/**
 * Handler para o `onScroll` da ScrollView da landing — throttled a 1×/frame
 * via `requestAnimationFrame` antes de notificar os assinantes. Só ativo na
 * web (native nem tem os efeitos que consomem isto).
 */
export function useLandingScrollHandler() {
  const ctx = useContext(LandingScrollCtx);
  const agendado = useRef(false);
  const ultimoY = useRef(0);
  return useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!ctx || Platform.OS !== 'web') return;
    ultimoY.current = e.nativeEvent.contentOffset.y;
    if (agendado.current) return;
    agendado.current = true;
    requestAnimationFrame(() => {
      agendado.current = false;
      ctx.notificar(ultimoY.current);
    });
  }, [ctx]);
}

/** Assina atualizações de posição de scroll (já throttled). No-op fora do provider. */
export function useLandingScrollY(ouvinte: OuvinteScroll) {
  const ctx = useContext(LandingScrollCtx);
  const ouvinteRef = useRef(ouvinte);
  ouvinteRef.current = ouvinte;
  useEffect(() => {
    if (!ctx) return;
    return ctx.inscrever((y) => ouvinteRef.current(y));
  }, [ctx]);
}

/** O Hero chama isto no próprio `onLayout` para registrar até onde rolar mostra a CTA fixa. */
export function useDefinirLimiarLanding() {
  const ctx = useContext(LandingScrollCtx);
  return useCallback((altura: number) => {
    if (ctx) ctx.limiarRef.current = altura;
  }, [ctx]);
}

/** Ref (mutável, sem re-render) com o limiar atual — leitura pontual dentro de um `useLandingScrollY`. */
export function useLimiarLandingRef(): React.MutableRefObject<number> | undefined {
  const ctx = useContext(LandingScrollCtx);
  return ctx?.limiarRef;
}
