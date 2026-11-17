/**
 * Flags de interface da v1.3 (PLANO V1). Desligadas por padrão: com a flag
 * desligada o app é EXATAMENTE o de hoje.
 *
 * `ui_v2_nav` liga:
 * - celular: abas Início · Orçamentos · ＋ · Agenda · Mais (Hoje vira seção do Início);
 * - lista de orçamentos com 3 filtros (Com o cliente / Aprovados / Rascunhos);
 * - desktop: 5 itens na barra lateral + grupo "Mais" recolhido.
 *
 * Como ligar:
 * - build: `EXPO_PUBLIC_UI_V2_NAV=1`;
 * - web (teste local): `?ui_v2_nav=1` na URL grava a escolha no navegador;
 *   `?ui_v2_nav=0` desliga de novo.
 *
 * Este arquivo é puro (sem React) para os testes em node rodarem direto.
 */
import type { StatusOrcamento } from '../types';

declare const process: { env: { EXPO_PUBLIC_UI_V2_NAV?: string } };

const CHAVE_WEB = 'olli:ui_v2_nav';

type ArmazemWeb = { getItem(k: string): string | null; setItem(k: string, v: string): void };
type JanelaWeb = { location?: { search?: string }; localStorage?: ArmazemWeb };

/** Regra pura: env do build, sobrescrita pelo parâmetro/armazenamento da web. */
export function resolverUiV2Nav(env: string | undefined, janela?: JanelaWeb | null): boolean {
  let valor = env === '1';
  if (!janela) return valor;
  try {
    const m = /[?&]ui_v2_nav=([01])/.exec(janela.location?.search ?? '');
    if (m) janela.localStorage?.setItem(CHAVE_WEB, m[1]);
    const salvo = janela.localStorage?.getItem(CHAVE_WEB);
    if (salvo === '1' || salvo === '0') valor = salvo === '1';
  } catch {
    // armazenamento bloqueado: fica com o valor do build
  }
  return valor;
}

function janelaAtual(): JanelaWeb | null {
  const g = globalThis as { window?: JanelaWeb; document?: unknown };
  return g.window && g.document ? g.window : null;
}

export const UI_V2_NAV: boolean = resolverUiV2Nav(process.env.EXPO_PUBLIC_UI_V2_NAV, janelaAtual());

export type AbaMobile = 'Home' | 'OrcamentosLista' | 'Orcar' | 'Agenda' | 'Hoje' | 'Conta';

/**
 * Ordem das abas do celular. `mostrarOrcar` = papel conhecido e não técnico
 * (mesma regra de hoje para o botão central).
 */
export function abasMobile(uiV2Nav: boolean, mostrarOrcar: boolean): AbaMobile[] {
  const abas: AbaMobile[] = uiV2Nav
    ? ['Home', 'OrcamentosLista', 'Orcar', 'Agenda', 'Conta']
    : ['Home', 'Agenda', 'Orcar', 'Hoje', 'Conta'];
  return mostrarOrcar ? abas : abas.filter((a) => a !== 'Orcar');
}

/** Rótulo visível de cada aba do celular. */
export function rotuloAbaMobile(aba: AbaMobile, uiV2Nav: boolean): string {
  switch (aba) {
    case 'Home': return 'Início';
    case 'OrcamentosLista': return 'Orçamentos';
    case 'Orcar': return '';
    case 'Agenda': return 'Agenda';
    case 'Hoje': return 'Hoje';
    case 'Conta': return uiV2Nav ? 'Mais' : 'Conta';
  }
}

// ─── Filtros da lista (V1) ────────────────────────────────────────────────
export type GrupoOrcamentos = 'todos' | 'com_cliente' | 'aprovados' | 'rascunhos';

export const GRUPOS_ORCAMENTOS: { id: GrupoOrcamentos; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'com_cliente', label: 'Com o cliente' },
  { id: 'aprovados', label: 'Aprovados' },
  { id: 'rascunhos', label: 'Rascunhos' },
];

/** Os 10 status existentes agrupados em 3 filtros (status fora de grupo só aparecem em "Todos"). */
export const STATUS_DO_GRUPO: Record<Exclude<GrupoOrcamentos, 'todos'>, StatusOrcamento[]> = {
  com_cliente: ['enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura'],
  aprovados: ['aprovado', 'convertido'],
  rascunhos: ['rascunho'],
};

export function statusDoGrupo(grupo: GrupoOrcamentos): StatusOrcamento[] | null {
  return grupo === 'todos' ? null : STATUS_DO_GRUPO[grupo];
}

// ─── Barra lateral do desktop (V1) ────────────────────────────────────────
/** Com a flag: só estas 5 rotas ficam à vista; o resto vai para "Mais" (recolhido). */
export const ROTAS_SIDEBAR_V2 = ['Home', 'OrcamentosTab', 'ClientesTab', 'Agenda', 'RelatoriosTab'] as const;

export function dividirSidebar<T extends { rota: string }>(itens: T[], uiV2Nav: boolean): { principais: T[]; mais: T[] } {
  if (!uiV2Nav) return { principais: itens, mais: [] };
  const fixas = ROTAS_SIDEBAR_V2 as readonly string[];
  const principais = fixas
    .map((r) => itens.find((i) => i.rota === r))
    .filter((i): i is T => !!i);
  return { principais, mais: itens.filter((i) => !fixas.includes(i.rota)) };
}
