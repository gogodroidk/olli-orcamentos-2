import { useCallback } from 'react';
import { useTipoConta } from './useTipoConta';
import type { Papel } from '../services/equipe';
import { podeComPapel, type Acao } from '../utils/permissoesPapel';

// A matriz mora em utils/permissoesPapel (sem React); re-exporta para quem já importa daqui.
export { podeComPapel, type Acao };

/**
 * usePermissao — o que o usuário PODE fazer, dado o papel dele na organização
 * (Onda 2, frente "Convites + papéis"). Conta pessoal (sem org) = dono de si
 * mesmo: pode tudo do próprio negócio (o gate de PLANO é outra dimensão, ver
 * usePlano — permissão ≠ plano).
 *
 * CONTRATO DE PERMISSÕES (do roadmap):
 *   owner   = tudo
 *   admin   = tudo, menos faturamento (billing) e excluir a organização
 *   gestor  = relatórios, metas, agenda de TODOS; NÃO configura equipe
 *   tecnico = só a própria agenda + criar orçamentos + clientes
 *             (sem relatórios, sem valores agregados, sem Planos)
 *
 * Uso: const { papel, pode } = usePermissao(); if (pode('gerenciar_equipe')) …
 */

export interface UsePermissao {
  /** Papel do usuário na org, ou null quando conta pessoal. `null` também enquanto indeterminado — cheque `carregando`. */
  papel: Papel | null;
  /**
   * `true` enquanto NÃO SABEMOS o papel (primeira leitura em voo, ou leitura que
   * falhou e não há cache). A UI deve mostrar "carregando", nunca o conteúdo
   * protegido e nunca "acesso negado" — é ignorância, não negação.
   */
  carregando: boolean;
  /** `true` se a conta é empresa (pertence a uma organização). */
  ehEmpresa: boolean;
  /** `true` se o usuário pode executar a `acao`. Nega por padrão o desconhecido. */
  pode: (acao: Acao) => boolean;
}

export function usePermissao(): UsePermissao {
  const { tipo, org, carregando, resolvido } = useTipoConta();
  const papel = tipo === 'empresa' && org ? org.papel : null;

  const pode = useCallback(
    (acao: Acao): boolean =>
      // Papel INDETERMINADO nega tudo. Sem isto, `papel === null` cairia na matriz
      // PESSOAL — que é a MAIS permissiva (relatórios, valores agregados,
      // faturamento) — e um técnico com a leitura da org ainda em voo, ou offline,
      // seria promovido a dono. "Não sei" nunca pode valer mais que "sou técnico".
      // Conta pessoal usa a matriz do solo (dono de si). Regra em `podeComPapel`.
      podeComPapel(acao, { tipo, org, resolvido }) === true,
    [tipo, org, resolvido],
  );

  return {
    papel,
    // Enquanto o papel não é conhecido, a tela está "carregando" — mesmo que a
    // requisição já tenha terminado (em erro). É o que evita mostrar um "acesso
    // negado" falso para o dono autônomo que abriu o app sem sinal.
    carregando: carregando || !resolvido,
    ehEmpresa: tipo === 'empresa',
    pode,
  };
}
