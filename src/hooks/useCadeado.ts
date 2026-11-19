import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useRecursoPlano } from '../components/RecursoPlano';
import { recursoTrancado } from '../services/cadeadoRecurso';
import type { Recurso } from '../services/entitlements';

/**
 * Cadeado de um recurso do plano (D-2267). `trancado` diz se mostra o cadeado; `abrirGate()` leva à
 * tela "Disponível no Pro". Use em botões que CRIAM/EDITAR; ver o que já existe nunca passa por aqui.
 */
export function useCadeado(recurso: Recurso) {
  const { estado } = useRecursoPlano(recurso);
  const nav = useNavigation<any>();
  const trancado = recursoTrancado(estado);
  const abrirGate = useCallback(() => nav.navigate('RecursoTrancado', { recurso }), [nav, recurso]);
  return { trancado, estado, abrirGate };
}
