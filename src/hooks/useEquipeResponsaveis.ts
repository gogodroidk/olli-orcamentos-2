/**
 * Quem pode ser RESPONSÁVEL por uma visita (agenda e contrato): os membros ativos da
 * equipe. Três estados de verdade — `listarMembros` (services/equipe) engole a falha e
 * devolve `[]`, e "não consegui ler a equipe" não pode virar "você não tem equipe"
 * (o seletor sumiria e a visita seria salva sem técnico). Aqui, falha = `erro`.
 *
 * `semEquipe: true` só quando a leitura DEU CERTO e a conta é pessoal (sem org):
 * aí o seletor nem aparece.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { carregarMinhaOrganizacao } from '../services/equipe';

export interface Responsavel {
  userId: string;
  nome: string;
  papel: string;
}

export type EstadoEquipe =
  | { status: 'carregando' }
  | { status: 'erro' }
  | { status: 'ok'; semEquipe: boolean; membros: Responsavel[] };

const PESO: Record<string, number> = { tecnico: 0, gestor: 1, admin: 2, owner: 3 };

export async function carregarResponsaveis(): Promise<EstadoEquipe> {
  if (!supabase) return { status: 'ok', semEquipe: true, membros: [] };
  const org = await carregarMinhaOrganizacao();
  if (org.status !== 'ok') return { status: 'erro' };
  if (!org.org) return { status: 'ok', semEquipe: true, membros: [] };
  try {
    const view = await supabase
      .from('organizacao_membros_perfil')
      .select('user_id, papel, ativo, nome, email')
      .eq('org_id', org.org.id)
      .eq('ativo', true);
    let linhas = view.data as { user_id: string; papel?: string; nome?: string; email?: string }[] | null;
    if (view.error || !Array.isArray(linhas)) {
      const tabela = await supabase
        .from('organizacao_membros')
        .select('user_id, papel, ativo')
        .eq('org_id', org.org.id)
        .eq('ativo', true);
      if (tabela.error) return { status: 'erro' };
      linhas = (tabela.data ?? []) as typeof linhas;
    }
    const membros = (linhas ?? [])
      .map((r) => ({
        userId: r.user_id,
        // Sem nome nem e-mail ainda precisa de um rótulo estável (vai gravado na visita).
        nome: r.nome?.trim() || r.email?.trim() || `Membro ${r.user_id.slice(0, 8)}`,
        papel: r.papel ?? 'tecnico',
      }))
      .sort((a, b) => (PESO[a.papel] ?? 9) - (PESO[b.papel] ?? 9) || a.nome.localeCompare(b.nome, 'pt-BR'));
    return { status: 'ok', semEquipe: false, membros };
  } catch {
    return { status: 'erro' };
  }
}

export function useEquipeResponsaveis(): { estado: EstadoEquipe; recarregar: () => void } {
  const [estado, setEstado] = useState<EstadoEquipe>({ status: 'carregando' });
  // Só a leitura MAIS RECENTE pode escrever o estado (tela desmontada ou "tentar de
  // novo" no meio de uma leitura lenta não deixam a resposta velha vencer).
  const leitura = useRef(0);
  const recarregar = useCallback(() => {
    const minha = ++leitura.current;
    setEstado({ status: 'carregando' });
    carregarResponsaveis()
      .then((e) => {
        if (leitura.current === minha) setEstado(e);
      })
      .catch(() => {
        if (leitura.current === minha) setEstado({ status: 'erro' });
      });
  }, []);
  useEffect(() => {
    recarregar();
    return () => {
      leitura.current += 1;
    };
  }, [recarregar]);
  return { estado, recarregar };
}
