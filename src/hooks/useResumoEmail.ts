/**
 * Estado do botão "Receber resumo diário por e-mail" no app (mobile e desktop).
 *
 * Três estados, sem atalho (regra da casa: "não sei" nunca vira "desligado"):
 *   carregando → erro (com "tentar de novo") → valor.
 * Mais um honesto: `indisponivel` quando o app roda sem conta na nuvem (o resumo é
 * enviado pelo servidor a partir dos dados sincronizados; sem conta, não existe).
 *
 * Alternar NÃO é otimista: o interruptor só muda depois que o banco confirma — a
 * pessoa nunca vê "ligado" num resumo que não vai chegar (nem o contrário).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import {
  interpretarEstadoResumoEmail,
  type EstadoResumoEmail,
  type OrigemPreferenciaResumo,
} from '../services/resumoEmailPreferencia';

export type SituacaoResumoEmail =
  | { tipo: 'carregando' }
  | { tipo: 'erro' }
  | { tipo: 'indisponivel' }
  | { tipo: 'valor'; estado: EstadoResumoEmail };

export function useResumoEmail(origem: OrigemPreferenciaResumo = 'app') {
  const [situacao, setSituacao] = useState<SituacaoResumoEmail>({ tipo: 'carregando' });
  const [salvando, setSalvando] = useState(false);
  const [erroAoSalvar, setErroAoSalvar] = useState(false);
  const montado = useRef(true);

  const carregar = useCallback(async () => {
    if (!supabase) {
      setSituacao({ tipo: 'indisponivel' });
      return;
    }
    setSituacao({ tipo: 'carregando' });
    try {
      // Sem sessão não há conta para ter preferência (é "indisponível", não erro).
      const { data: sessao } = await supabase.auth.getSession();
      if (!sessao.session) {
        if (montado.current) setSituacao({ tipo: 'indisponivel' });
        return;
      }
      const { data, error } = await supabase.rpc('meu_resumo_dinheiro_email');
      const estado = error ? null : interpretarEstadoResumoEmail(data);
      if (!montado.current) return;
      setSituacao(estado ? { tipo: 'valor', estado } : { tipo: 'erro' });
    } catch {
      if (montado.current) setSituacao({ tipo: 'erro' });
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    void carregar();
    return () => {
      montado.current = false;
    };
  }, [carregar]);

  const alternar = useCallback(async (ligar: boolean) => {
    if (!supabase || salvando) return;
    setSalvando(true);
    setErroAoSalvar(false);
    try {
      const { data, error } = await supabase.rpc('definir_resumo_dinheiro_email', { p_ativo: ligar, p_origem: origem });
      const estado = error ? null : interpretarEstadoResumoEmail(data);
      if (!montado.current) return;
      if (estado) setSituacao({ tipo: 'valor', estado });
      else setErroAoSalvar(true);
    } catch {
      if (montado.current) setErroAoSalvar(true);
    } finally {
      if (montado.current) setSalvando(false);
    }
  }, [origem, salvando]);

  return { situacao, salvando, erroAoSalvar, alternar, recarregar: carregar };
}
