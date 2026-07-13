import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getEmpresa } from '../database/database';
import { empresaMostraVertical, empresaMostraHvac, type VerticalId } from '../services/verticais';
import { SEGMENTO_PARA_VERTICAL } from '../services/verticalSegmento';
import type { Empresa } from '../types';

/**
 * Verticais EFETIVOS da empresa: os explícitos (`verticais`), senão DERIVADOS do `segmento`
 * escolhido. A maioria das contas tem segmento (ex.: ar-condicionado) mas pode não ter
 * `verticais` preenchido (dado anterior à personalização) — sem isto, o gate caía no
 * backward-compat "sem ofício = mostra TUDO" e um HVAC via as ferramentas de pintura/ANVISA.
 * Sem NENHUM dos dois = conta realmente sem nicho = mostra tudo (backward-compat de verdade).
 */
function verticaisEfetivos(emp: Empresa | null): VerticalId[] | undefined {
  if (emp?.verticais && emp.verticais.length > 0) return emp.verticais;
  if (emp?.segmento) return [SEGMENTO_PARA_VERTICAL[emp.segmento]];
  return undefined;
}

/**
 * useVerticais — o GATE central da personalização por vertical (docs/SISTEMA_SUPERIOR.md).
 *
 * Lê as `verticais` do "ofício" da empresa (Empresa.verticais, deduzido do CNAE no
 * onboarding, editável em "Meu ofício") e responde "esta empresa deve ver as ferramentas
 * da vertical X?". BACKWARD-COMPAT: empresa SEM ofício definido (todo usuário existente)
 * vê TUDO, exatamente como hoje — o gate só ESCONDE para quem escolheu outra vertical.
 *
 * Desenho igual ao `usePlano`: um store leve em nível de módulo (sem Provider) + um
 * único listener de AppState que revalida ao voltar do background. Todos os consumidores
 * (SidebarNav, HojeScreen, tela de Ferramentas) compartilham o mesmo estado — 1 leitura,
 * não N. `recarregar()` força uma releitura (ex.: depois de salvar o ofício).
 */

let cache: VerticalId[] | undefined = undefined;
let carregou = false;
const ouvintes = new Set<(v: VerticalId[] | undefined) => void>();
let leituraEmAndamento: Promise<void> | null = null;

async function revalidar(): Promise<void> {
  if (leituraEmAndamento) return leituraEmAndamento;
  leituraEmAndamento = (async () => {
    try {
      const emp = await getEmpresa();
      cache = verticaisEfetivos(emp);
    } catch {
      // mantém o último valor bom — nunca derruba para "sem ofício" por erro de leitura.
    } finally {
      carregou = true;
      leituraEmAndamento = null;
      for (const l of ouvintes) l(cache);
    }
  })();
  return leituraEmAndamento;
}

let appStateInscrito = false;
function garantirAppStateListener(): void {
  if (appStateInscrito) return;
  appStateInscrito = true;
  AppState.addEventListener('change', (s: AppStateStatus) => {
    if (s === 'active') void revalidar();
  });
}

/** Força uma releitura do ofício — chamável FORA de componente (ex.: após salvar em MeuNegócio). */
export function recarregarVerticais(): Promise<void> {
  return revalidar();
}

/**
 * O ofício atual (1º vertical) para MANDAR À IA — a OLLI fala a língua do segmento.
 * Usa o cache do módulo quando quente (o app quase sempre já leu via useVerticais);
 * só toca o banco na primeira chamada fria. `undefined` = sem ofício → a IA usa o
 * default (ar-condicionado, backward-compat no worker). Nunca lança.
 */
export async function verticalParaIA(): Promise<VerticalId | undefined> {
  if (carregou) return cache?.[0];
  try {
    const emp = await getEmpresa();
    return verticaisEfetivos(emp)?.[0];
  } catch {
    return undefined;
  }
}

export interface UseVerticais {
  /** O ofício da empresa (undefined/vazio = genérico, vê tudo). */
  verticais: VerticalId[] | undefined;
  /** `true` até a primeira leitura real. */
  carregando: boolean;
  /** A empresa deve ver as ferramentas/telas da vertical `id`? */
  mostraVertical: (id: VerticalId) => boolean;
  /** Atalho: mostrar as ferramentas de HVAC (PMOC, equipamentos, códigos de erro, diagnóstico)? */
  mostraHvac: boolean;
  /** Força uma releitura (ex.: após salvar o ofício em "Meu negócio"). */
  recarregar: () => Promise<void>;
}

export function useVerticais(): UseVerticais {
  const [v, setV] = useState<VerticalId[] | undefined>(cache);
  const [pronto, setPronto] = useState(carregou);

  useEffect(() => {
    const ouvinte = (nv: VerticalId[] | undefined) => {
      setV(nv);
      setPronto(true);
    };
    ouvintes.add(ouvinte);
    garantirAppStateListener();
    // Sincroniza com o store atual e dispara a 1ª leitura se ninguém leu ainda.
    setV(cache);
    setPronto(carregou);
    if (!carregou) void revalidar();
    return () => {
      ouvintes.delete(ouvinte);
    };
  }, []);

  return {
    verticais: v,
    carregando: !pronto,
    mostraVertical: (id) => empresaMostraVertical(v, id),
    mostraHvac: empresaMostraHvac(v),
    recarregar: revalidar,
  };
}
