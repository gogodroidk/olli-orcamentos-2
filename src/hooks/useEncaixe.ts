/**
 * useEncaixe — liga o Encaixe Inteligente (`services/encaixe.ts`, puro) à agenda
 * do aparelho: lê as visitas dos próximos 7 dias (séries já expandidas) e o
 * ponto de cada cliente, e devolve até 3 horários perto de onde o prestador já
 * vai estar. Nada sai do aparelho.
 *
 * Três estados, nunca "vazio" por engano (regra `olli-gate-erro-vira-vazio`):
 *  - 'carregando' enquanto a agenda sai do banco local;
 *  - 'erro' se a leitura falhou ("não deu para ler sua agenda", não "nenhum encaixe");
 *  - o `ResultadoEncaixe` (cliente sem coordenada já vem como `ok:false`).
 *
 * Só lê o banco quando `ativo` e o cliente tem coordenada (sem ponto, a resposta
 * é imediata: "cadastre o CEP do cliente").
 */
import { useEffect, useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { getAgendamentosExpandidos } from '../services/agenda';
import { getClientes } from '../database/database';
import { sugerirEncaixe, type ResultadoEncaixe, type VisitaAgenda } from '../services/encaixe';
import { semHoraMarcada } from '../utils/agendaDominio';
import { temCoordenada, type ClienteGeo } from '../utils/climaNaAgenda';
import type { Cliente } from '../types';

export type EstadoEncaixe = ResultadoEncaixe | 'carregando' | 'erro';

export interface OpcoesUseEncaixe {
  /** Ponto do cliente que vai ser encaixado. */
  cliente: ClienteGeo | null | undefined;
  /** Só calcula quando a sugestão está na tela. */
  ativo: boolean;
  /** Duração do serviço novo (min). Padrão 60. */
  duracaoMin?: number;
  /** Visita que está sendo remarcada: não conta como "ocupado" nem como âncora. */
  ignorarId?: string;
  /** Técnico da visita: o encaixe é perto de onde ELE vai estar. Ausente = a agenda toda. */
  responsavelId?: string;
  /** Clientes já carregados pela tela (evita reler o banco). */
  clientes?: Cliente[];
}

type Leitura = 'carregando' | 'erro' | { visitas: VisitaAgenda[]; lidoEm: number };

export function useEncaixe({ cliente, ativo, duracaoMin, ignorarId, responsavelId, clientes }: OpcoesUseEncaixe): EstadoEncaixe {
  const comPonto = temCoordenada(cliente);
  const [leitura, setLeitura] = useState<Leitura>('carregando');
  const precisaLer = ativo && comPonto;

  useEffect(() => {
    if (!precisaLer) return;
    let vivo = true;
    setLeitura('carregando');
    (async () => {
      const agora = new Date();
      const [ocorrencias, cls] = await Promise.all([
        getAgendamentosExpandidos(agora.toISOString(), addDays(agora, 8).toISOString()),
        clientes ? Promise.resolve(clientes) : getClientes(),
      ]);
      const ponto = new Map(cls.map((c) => [c.id, c] as const));
      const visitas: VisitaAgenda[] = ocorrencias
        .filter((o) => o.id !== ignorarId && !semHoraMarcada(o))
        .filter((o) => !responsavelId || o.responsavelId === responsavelId)
        .map((o) => {
          const c = o.clienteId ? ponto.get(o.clienteId) : undefined;
          return {
            id: o.id,
            clienteNome: o.clienteNome,
            inicio: o.inicio,
            fim: o.fim ?? null,
            lat: c?.lat ?? null,
            lon: c?.lon ?? null,
            status: o.status,
          };
        });
      if (vivo) setLeitura({ visitas, lidoEm: Date.now() });
    })().catch(() => {
      if (vivo) setLeitura('erro');
    });
    return () => {
      vivo = false;
    };
  }, [precisaLer, ignorarId, responsavelId, clientes]);

  const lat = cliente?.lat;
  const lon = cliente?.lon;
  return useMemo<EstadoEncaixe>(() => {
    if (!comPonto) return { ok: false, motivo: 'cliente_sem_localizacao' };
    if (leitura === 'carregando' || leitura === 'erro') return leitura;
    return sugerirEncaixe({ lat: lat as number, lon: lon as number }, leitura.visitas, { duracaoMin: duracaoMin ?? 60, agora: new Date(leitura.lidoEm) });
  }, [comPonto, leitura, lat, lon, duracaoMin]);
}
