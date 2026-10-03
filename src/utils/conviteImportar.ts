/**
 * CONVITE "TRAZER MEUS DADOS DO APP ANTIGO" — regra pura (sem React, sem rede).
 *
 * A tela `Importar` (contatos do celular, planilha e foto de orçamento antigo)
 * existe desde a importação "troque em 5 minutos". Este módulo decide ONDE o
 * convite aparece fora dela e guarda a copy única, para Home, Conta e Onboarding
 * dizerem a mesma coisa (o texto vem das três entradas reais da ImportarScreen).
 *
 * Home: o convite é para o PRIMEIRO ACESSO — conta com poucos dados. Ele some
 * sozinho quando a base cresce (não precisa de "dispensar" para sumir), e também
 * pode ser dispensado. Os números chegam em TRÊS estados: `null` = "ainda não sei"
 * (carregando, falhou, nuvem ainda não baixou). Sem saber, o convite NÃO aparece:
 * dizer "sua conta está vazia, traga seus dados" para quem só não baixou ainda
 * seria tratar "não sei" como "não tem".
 */

export const TEXTO_CONVITE_IMPORTAR = {
  titulo: 'Trazer meus dados do app antigo',
  descricao: 'Contatos do celular, planilha ou foto de orçamento antigo',
} as const;

/** Até quantos clientes a conta ainda conta como "começando". */
export const POUCOS_CLIENTES = 3;
/** Até quantos orçamentos a conta ainda conta como "começando". */
export const POUCOS_ORCAMENTOS = 2;

export interface DadosConviteImportar {
  /** Clientes cadastrados; `null` = ainda não sei. */
  clientes: number | null;
  /** Orçamentos ativos; `null` = ainda não sei. */
  orcamentos: number | null;
  /** O convite foi dispensado neste aparelho; `null` = ainda não li a preferência. */
  dispensado: boolean | null;
}

/**
 * `true` só com os TRÊS números conhecidos, a conta ainda começando (poucos
 * clientes E poucos orçamentos) e o convite não dispensado.
 */
export function deveConvidarImportar({ clientes, orcamentos, dispensado }: DadosConviteImportar): boolean {
  if (clientes === null || orcamentos === null || dispensado === null) return false;
  if (dispensado) return false;
  if (!Number.isFinite(clientes) || !Number.isFinite(orcamentos)) return false;
  return clientes <= POUCOS_CLIENTES && orcamentos <= POUCOS_ORCAMENTOS;
}

/**
 * Chave (por usuário, como a do onboarding concluído) do "Agora não" do convite
 * na Home. Por usuário: outra conta no mesmo aparelho ainda vê o convite.
 */
export function chaveConviteImportarDispensado(userId: string): string {
  return `olli.conviteImportar.dispensado.${userId}`;
}
