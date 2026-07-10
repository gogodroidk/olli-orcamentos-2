import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  COR_MARCA_PADRAO,
  criarGradientes,
  criarPaleta,
  sombrasDe,
  type Cores,
  type Gradientes,
  type ModoTema,
} from './cores';

/**
 * Estado do tema: modo (claro/escuro) e cor de marca escolhida pelo usuário.
 *
 * DECISÃO DO DONO: o app abre SEMPRE no claro. Não seguimos `useColorScheme()` do
 * sistema — se seguíssemos, "abrir sempre no claro" viraria mentira no primeiro
 * celular configurado em escuro. O usuário liga o escuro explicitamente, e a
 * escolha dele é a única fonte de verdade.
 *
 * Persistência LOCAL (AsyncStorage), não na nuvem: tema é preferência de
 * aparelho. O mesmo dono pode querer escuro no celular do campo e claro no
 * desktop, e sincronizar isso seria uma surpresa desagradável.
 *
 * A leitura do disco é assíncrona. Enquanto ela não volta, `carregando` é true e
 * o tema é o padrão (claro). Como o padrão É o valor mais provável, não piscamos:
 * quem tem escuro salvo vê no máximo um frame claro no cold start.
 */

const CHAVE = 'olli.tema.v1';

interface EstadoSalvo {
  modo?: ModoTema;
  corMarca?: string;
}

export interface TemaContexto {
  modo: ModoTema;
  corMarca: string;
  cores: Cores;
  gradientes: Gradientes;
  /** `true` enquanto a preferência salva ainda não foi lida do disco. */
  carregando: boolean;
  definirModo: (modo: ModoTema) => void;
  alternarModo: () => void;
  definirCorMarca: (hex: string) => void;
  /** Volta ao padrão: claro + azul OLLI. */
  restaurarPadrao: () => void;
}

const Ctx = createContext<TemaContexto | null>(null);

/** `#RGB` ou `#RRGGBB`. Cor inválida vinda do disco não pode derrubar o app. */
function corValida(hex: unknown): hex is string {
  return typeof hex === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);
}

export function TemaProvider({ children }: { children: React.ReactNode }) {
  const [modo, setModo] = useState<ModoTema>('claro');
  const [corMarca, setCorMarca] = useState<string>(COR_MARCA_PADRAO);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const bruto = await AsyncStorage.getItem(CHAVE);
        if (!vivo || !bruto) return;
        const salvo = JSON.parse(bruto) as EstadoSalvo;
        // Validação: um JSON corrompido não pode pintar o app de undefined.
        if (salvo.modo === 'claro' || salvo.modo === 'escuro') setModo(salvo.modo);
        if (corValida(salvo.corMarca)) setCorMarca(salvo.corMarca);
      } catch {
        // Preferência ilegível: fica o padrão. Nunca derruba o boot.
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const persistir = useCallback((proximo: EstadoSalvo) => {
    // Fire-and-forget: a UI já refletiu a escolha; gravar é consequência.
    void AsyncStorage.setItem(CHAVE, JSON.stringify(proximo)).catch(() => {});
  }, []);

  const definirModo = useCallback((m: ModoTema) => {
    setModo(m);
    setCorMarca((cor) => { persistir({ modo: m, corMarca: cor }); return cor; });
  }, [persistir]);

  const alternarModo = useCallback(() => {
    setModo((m) => {
      const proximo: ModoTema = m === 'claro' ? 'escuro' : 'claro';
      setCorMarca((cor) => { persistir({ modo: proximo, corMarca: cor }); return cor; });
      return proximo;
    });
  }, [persistir]);

  const definirCorMarca = useCallback((hex: string) => {
    if (!corValida(hex)) return;
    setCorMarca(hex);
    setModo((m) => { persistir({ modo: m, corMarca: hex }); return m; });
  }, [persistir]);

  const restaurarPadrao = useCallback(() => {
    setModo('claro');
    setCorMarca(COR_MARCA_PADRAO);
    persistir({ modo: 'claro', corMarca: COR_MARCA_PADRAO });
  }, [persistir]);

  // A paleta inteira é recalculada só quando modo ou cor mudam. Cada tela a
  // memoiza de novo para montar seus estilos — ver o padrão em `useEstilos`.
  const cores = useMemo(() => criarPaleta(modo, corMarca), [modo, corMarca]);
  const gradientes = useMemo(() => criarGradientes(modo, corMarca), [modo, corMarca]);

  const valor = useMemo<TemaContexto>(
    () => ({ modo, corMarca, cores, gradientes, carregando, definirModo, alternarModo, definirCorMarca, restaurarPadrao }),
    [modo, corMarca, cores, gradientes, carregando, definirModo, alternarModo, definirCorMarca, restaurarPadrao],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * Tema completo. Lança fora do provider de propósito: um componente que lê tema
 * sem provider renderizaria com cores erradas em silêncio, e isso é pior que
 * quebrar no primeiro boot do desenvolvedor.
 */
export function useTema(): TemaContexto {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTema precisa estar dentro de <TemaProvider>.');
  return ctx;
}

/** Só a paleta — o que 90% das telas precisam. */
export function useCores(): Cores {
  return useTema().cores;
}

/** Só os gradientes. */
export function useGradientes(): Gradientes {
  return useTema().gradientes;
}

/**
 * Sombras do modo atual. Existe para a migração não ter 70 versões diferentes de
 * "como faço sombra agora" — no escuro a sombra preta some no fundo e a elevação
 * vem da superfície; no claro ela é neutra e suave.
 */
export function useSombras() {
  const { modo, cores } = useTema();
  void modo; // o modo já está embutido na paleta
  return useMemo(() => sombrasDe(cores), [cores]);
}

/**
 * Monta os estilos da tela a partir da paleta, recriando-os só quando o tema muda.
 *
 * É por causa disto que a migração existe: `StyleSheet.create` no ESCOPO DO MÓDULO
 * é avaliado uma única vez, no import, e congela as cores daquele instante. Nem
 * remontar a árvore o reexecuta. Mover a criação para dentro do render é a única
 * forma de o tema alcançar o estilo.
 *
 *   const estilos = useEstilos(criarEstilos);
 *   const criarEstilos = (c: Cores) => StyleSheet.create({ ... });
 */
export function useEstilos<T>(fabrica: (cores: Cores) => T): T {
  const cores = useCores();
  return useMemo(() => fabrica(cores), [cores, fabrica]);
}
