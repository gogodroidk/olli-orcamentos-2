import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { aoSinalDoCliente, lerInteracoesDoDono, type LeituraInteracoes } from '../services/termometro';

/** Três estados, nunca dois: lendo, leu (com ou sem sinal) ou NÃO conseguiu ler. */
export type EstadoLeituraTermometro = 'carregando' | 'ok' | 'erro';

export interface UsoTermometro {
  estado: EstadoLeituraTermometro;
  leitura: LeituraInteracoes | null;
  /** Relê ignorando o cache (puxar para atualizar, "Tentar de novo"). */
  recarregar: () => void;
}

/** Sinais em rajada (abriu + viu o preço + tempo) viram UMA releitura. */
const ESPERA_RAJADA_MS = 1200;

/**
 * Lê os sinais do link do cliente para a tela — só quando `ativo` (o plano libera
 * o termômetro). Relê no foco e quando o Realtime avisa que o cliente fez algo
 * (`aoSinalDoCliente`), sem piscar: uma releitura que falha depois de uma leitura
 * boa mantém o último dado e só marca `erro` se nunca leu.
 *
 * `filtro` (opcional): só reage a sinal destes orçamentos (o detalhe passa o seu id).
 */
export function useTermometro(ativo: boolean, filtro?: string): UsoTermometro {
  const [estado, setEstado] = useState<EstadoLeituraTermometro>('carregando');
  const [leitura, setLeitura] = useState<LeituraInteracoes | null>(null);
  const vivo = useRef(true);
  const leuUmaVez = useRef(false);

  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const ler = useCallback((forcar: boolean) => {
    if (!ativo) return;
    if (!leuUmaVez.current) setEstado('carregando');
    lerInteracoesDoDono({ forcar })
      .then((l) => {
        if (!vivo.current) return;
        leuUmaVez.current = true;
        setLeitura(l);
        setEstado('ok');
      })
      .catch(() => {
        if (!vivo.current) return;
        // Já tinha um retrato bom: mantém (o dado não "some" por uma falha de rede).
        if (!leuUmaVez.current) setEstado('erro');
      });
  }, [ativo]);

  useFocusEffect(useCallback(() => { ler(false); }, [ler]));

  useEffect(() => {
    if (!ativo) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const parar = aoSinalDoCliente((orcamentoId) => {
      if (filtro && orcamentoId !== filtro) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; ler(true); }, ESPERA_RAJADA_MS);
    });
    return () => {
      parar();
      if (timer) clearTimeout(timer);
    };
  }, [ativo, filtro, ler]);

  const recarregar = useCallback(() => {
    leuUmaVez.current = false;
    ler(true);
  }, [ler]);

  return { estado: ativo ? estado : 'carregando', leitura, recarregar };
}
