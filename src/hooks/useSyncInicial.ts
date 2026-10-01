import { useCallback, useEffect, useRef, useState } from 'react';
import {
  downloadInicialJaConfirmado,
  estadoPullDaSessao,
  onEstadoPull,
  pullInicialConcluido,
  syncOnLogin,
} from '../services/cloudSync';

/**
 * useSyncInicial — o primeiro download da nuvem desta conta já terminou?
 *
 * Existe porque o app é local-first: num aparelho novo (ou logo depois do login)
 * o SQLite ainda está vazio quando o Início abre. Ler esse vazio como "a conta
 * não tem orçamento" mostrava "Seu primeiro orçamento em 1 minuto" para quem já
 * tinha 12 na nuvem — o "não sei" virando "não tem".
 *
 *  • 'baixando' — o primeiro download ainda não terminou (ou não sabemos): quem
 *                 consome NÃO afirma "nenhum" — mostra carregando.
 *  • 'falhou'   — o download terminou, mas a nuvem não entregou alguma tabela:
 *                 a tela oferece "tentar de novo", nunca o estado vazio.
 *  • 'pronto'   — carimbo `pull_inicial_ok_<userId>` gravado (todas as tabelas
 *                 vieram) ou um pull desta sessão deu ok: o vazio local é real.
 *
 * Depois que o carimbo existe, ele vale para sempre nesta partição: um sync de
 * fundo que falha depois (sem sinal na rua) não volta a conta para "baixando".
 */
export type EstadoSyncInicial = 'baixando' | 'falhou' | 'pronto';

export function useSyncInicial(): { estado: EstadoSyncInicial; tentarDeNovo: () => void } {
  const [estado, setEstado] = useState<EstadoSyncInicial>(() =>
    downloadInicialJaConfirmado() ? 'pronto' : 'baixando',
  );
  const montado = useRef(true);

  const avaliar = useCallback(async () => {
    // Sem atalho síncrono aqui: `pullInicialConcluido` confere o carimbo do
    // usuário DA SESSÃO (o atalho só serve para o estado inicial, sem piscar).
    // Lê a sessão ANTES do storage: se o pull terminar enquanto o storage é lido,
    // o listener abaixo reavalia — nunca fica preso num estado antigo.
    const sessao = estadoPullDaSessao();
    const concluido = await pullInicialConcluido();
    if (!montado.current) return;
    if (concluido) setEstado('pronto');
    else setEstado(sessao === 'falhou' ? 'falhou' : 'baixando');
  }, []);

  useEffect(() => {
    montado.current = true;
    void avaliar();
    const cancelar = onEstadoPull(() => {
      void avaliar();
    });
    return () => {
      montado.current = false;
      cancelar();
    };
  }, [avaliar]);

  const tentarDeNovo = useCallback(() => {
    setEstado('baixando');
    // Reentrância é do próprio sync (flag): tocar duas vezes não dispara dois.
    void syncOnLogin();
  }, []);

  return { estado, tentarDeNovo };
}
