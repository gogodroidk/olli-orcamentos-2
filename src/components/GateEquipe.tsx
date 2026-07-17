/**
 * Muro do plano Empresa para as telas de Equipe — com F0d (grandfathering).
 *
 * Por que não usar `<GatePro>` direto: o GatePro só sabe de PLANO. Depois da decisão
 * F0d (2026-07-17), "pode usar Equipe" deixou de ser sinônimo de "assina o Empresa":
 * as orgs que já existiam quando o paywall entrou continuam podendo. Quem responde
 * isso é `acessoEquipe()` (`services/entitlementEquipe.ts`), que junta plano + org.
 *
 * A ordem dos estados aqui é a regra da casa aplicada à UI:
 *  - pode (plano ou grandfathered) → conteúdo, sem muro;
 *  - NÃO pode, com certeza         → muro do GatePro (vende o Empresa);
 *  - INDETERMINADO                 → conteúdo, SEM muro. Mostrar "assine" para quem
 *    talvez seja grandfathered é acusar o usuário por causa de uma falha de rede. O
 *    worker é quem nega de verdade (503/402) — e ele tem o dado na mão.
 *
 * Isto é UX. O enforcement está no worker (`orgTemEmpresaAtivo` → 402/503).
 */
import React, { useEffect, useState } from 'react';
import { GatePro } from './GatePro';
import { usePlano } from '../hooks/usePlano';
import { carregarMinhaOrganizacao, type LeituraOrganizacao } from '../services/equipe';
import { acessoEquipe, mostrarMuroEquipe } from '../services/entitlementEquipe';
import type { Recurso } from '../services/planos';

interface Props {
  /** `equipe` (gestão) ou `mapa_equipe` (ao vivo) — entitlements distintos. */
  recurso: Extract<Recurso, 'equipe' | 'mapa_equipe'>;
  beneficio: string;
  children: React.ReactNode;
}

export function GateEquipe({ recurso, beneficio, children }: Props) {
  const { temAcesso, carregando } = usePlano();
  // `erro` como piso: até a primeira leitura terminar, "não sei" é a verdade — e é
  // o estado que NÃO mostra muro (ver mostrarMuroEquipe).
  const [org, setOrg] = useState<LeituraOrganizacao>({ status: 'erro' });

  useEffect(() => {
    let vivo = true;
    carregarMinhaOrganizacao()
      .then((r) => {
        if (vivo) setOrg(r);
      })
      .catch(() => {
        // carregarMinhaOrganizacao já não lança; o catch é cinto de segurança e
        // mantém o estado em 'erro' = indeterminado.
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Enquanto o PLANO carrega, deixa o GatePro decidir (ele já mostra o preview
  // bloqueado sem piscar conteúdo pago). Depois, quem manda é o acessoEquipe.
  if (!carregando) {
    const acesso = acessoEquipe(temAcesso(recurso), org);
    if (acesso.pode) return <>{children}</>;
    if (!mostrarMuroEquipe(acesso)) return <>{children}</>; // indeterminado
  }

  return (
    <GatePro recurso={recurso} plano="empresa" beneficio={beneficio}>
      {children}
    </GatePro>
  );
}

export default GateEquipe;
