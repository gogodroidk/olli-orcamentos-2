/**
 * Ponte SEM React Native para "qual é o papel de quem está usando", para
 * serviços que rodam fora de componente (`escopoAgendaAtual.ts`).
 *
 * Por que uma ponte e não importar `hooks/useTipoConta` direto: os serviços que
 * precisam disso (relatório do dia, ritual diário) também entram, por tabela, no
 * type-check do painel web (`webapp`, via `database.ts`), que não tem
 * `AppState` nem AsyncStorage. Quem conhece o papel (`hooks/usePermissao.ts`,
 * carregado no boot pelo AppNavigator) registra o leitor aqui; quem consulta
 * só depende deste arquivo, que não importa nada.
 *
 * Sem leitor registrado (ou leitor que falhou) = papel DESCONHECIDO. Nunca
 * vira "pode" nem "é pessoal".
 */

export interface PapelAtual {
  /** O papel é conhecido (rede ou cache do último login). */
  resolvido: boolean;
  /** `pode('ver_agenda_equipe')`. Só vale com `resolvido`. */
  podeVerAgendaEquipe: boolean;
}

const DESCONHECIDO: PapelAtual = { resolvido: false, podeVerAgendaEquipe: false };

let leitor: (() => Promise<PapelAtual>) | null = null;

/** Chamado uma vez por `hooks/usePermissao.ts` ao carregar. */
export function registrarLeitorPapel(fn: () => Promise<PapelAtual>): void {
  leitor = fn;
}

/** O papel atual, esperando resolver. NUNCA lança; desconhecido = `resolvido: false`. */
export async function lerPapelAtual(): Promise<PapelAtual> {
  if (!leitor) return DESCONHECIDO;
  try {
    const p = await leitor();
    return p.resolvido ? p : DESCONHECIDO;
  } catch {
    return DESCONHECIDO;
  }
}
