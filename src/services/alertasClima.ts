/**
 * alertasClima.ts — alertas oficiais de tempo (INMET + Defesa Civil), app-side.
 * Onda I1 do plano "OLLI inteligente".
 *
 * Contrato: worker `olli-diagnostico`, `GET /alertas?ibge=&lat=&lon=` (público,
 * sem login — ver `worker/src/alertas.js`). O worker só LÊ o que um cron
 * próprio coleta a cada 20 min; o app nunca chama INMET/IDAP direto. A lógica
 * pura (validação, frases, cruzamento com a hora da visita) mora em
 * `alertasClimaTexto.ts`, testável por `node`.
 *
 * ─── TRÊS ESTADOS (regra da casa `olli-gate-erro-vira-vazio`) ──────────────
 *   'carregando'          → ainda buscando
 *   { ok:false, motivo }  → "Alertas indisponíveis agora" / "Alertas oficiais
 *                            desligados" / "Sem a cidade do cliente…" — NUNCA
 *                            "sem alertas"
 *   DadosAlertas          → { ok:true, avisos, completo, nota, resumo… }
 * Mesmo com dados, "sem alertas" só é dito quando `semAlertasConfirmado(estado)`:
 * as duas fontes no ar e nenhum alerta da Defesa Civil pendente de conferência.
 *
 * ─── DE ONDE VEM O MUNICÍPIO ───────────────────────────────────────────────
 * Do cadastro do cliente (código IBGE de 7 dígitos, que o CEP v2 da BrasilAPI
 * devolve). A coordenada é opcional e melhora a resposta: alertas da Defesa
 * Civil desenhados só por área (≈2/3 dos que chegam) precisam dela para serem
 * conferidos. Sem coordenada, eles aparecem como "Pode haver alerta da Defesa
 * Civil na região" — nunca somem.
 *
 * Uso típico (componente isolado — a tela encaixa):
 *   const alertas = useAlertasClima(cliente.ibge, cliente.lat != null ? { lat, lon } : null);
 *   <Text>{textoAlertas(alertas)}</Text>
 *   {atribuicaoAlertas(alertas) && <Text>{atribuicaoAlertas(alertas)}</Text>}
 */
import { useEffect, useState } from 'react';
import { DIAGNOSTICO_URL } from '../config';
import {
  ibgeValido,
  motivoDeFalhaAlertas,
  normalizarRespostaAlertas,
  type DadosAlertas,
  type EstadoAlertas,
  type FalhaAlertas,
} from './alertasClimaTexto';

export type {
  AvisoOficial,
  DadosAlertas,
  EstadoAlertas,
  FalhaAlertas,
  FonteAlerta,
  MotivoFalhaAlertas,
  NivelAlerta,
} from './alertasClimaTexto';
export {
  ATRIBUICAO_ALERTAS,
  atribuicaoAlertas,
  avisosNoPeriodo,
  fraseDoAviso,
  horaDoAlerta,
  ibgeValido,
  nivelMaisGrave,
  quandoDoAlerta,
  rotuloNivel,
  semAlertasConfirmado,
  textoAlertas,
} from './alertasClimaTexto';

export interface CoordenadaAlerta {
  lat: number;
  lon: number;
}

const TIMEOUT_MS = 8000;

/**
 * Cache de processo: 10 min por município (+ ponto arredondado a ~110 m). O
 * worker renova os dados a cada 20 min; isto só evita refazer a ida e volta ao
 * trocar de aba. Só SUCESSO é guardado — falha nunca fica "presa" na memória.
 */
const CACHE_MS = 10 * 60 * 1000;
const memoria = new Map<string, { exp: number; dados: DadosAlertas }>();

/** Só para teste. */
export function limparCacheAlertas(): void {
  memoria.clear();
}

function coordValida(c: CoordenadaAlerta | null | undefined): c is CoordenadaAlerta {
  return (
    !!c &&
    typeof c.lat === 'number' &&
    typeof c.lon === 'number' &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lon) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lon) <= 180 &&
    !(c.lat === 0 && c.lon === 0)
  );
}

/**
 * Alertas para um município (e, se houver, o ponto do cliente). NUNCA lança:
 * resolve `DadosAlertas` ou `{ ok:false, motivo }`.
 */
export async function buscarAlertas(
  ibgeBruto: string | number | null | undefined,
  coord?: CoordenadaAlerta | null,
): Promise<DadosAlertas | FalhaAlertas> {
  if (ibgeBruto === null || ibgeBruto === undefined || String(ibgeBruto).trim() === '') {
    return { ok: false, motivo: 'sem_municipio' };
  }
  const ibge = ibgeValido(ibgeBruto);
  if (!ibge) return { ok: false, motivo: 'ibge_invalido' };
  if (coord !== null && coord !== undefined && !coordValida(coord)) return { ok: false, motivo: 'coordenadas_invalidas' };
  if (!DIAGNOSTICO_URL) return { ok: false, motivo: 'nao_configurado' };

  const ponto = coordValida(coord) ? `&lat=${coord.lat.toFixed(4)}&lon=${coord.lon.toFixed(4)}` : '';
  const chave = `${ibge}${coordValida(coord) ? `@${coord.lat.toFixed(3)},${coord.lon.toFixed(3)}` : ''}`;
  const guardado = memoria.get(chave);
  if (guardado && guardado.exp > Date.now()) return guardado.dados;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${DIAGNOSTICO_URL}/alertas?ibge=${ibge}${ponto}`, { method: 'GET', signal: controller.signal });
    const data: any = await r.json().catch(() => null);
    if (!r.ok || !data || data.ok !== true) return { ok: false, motivo: motivoDeFalhaAlertas(data?.motivo) };
    const dados = normalizarRespostaAlertas(data);
    if (!dados) return { ok: false, motivo: 'alertas_indisponiveis' };
    if (memoria.size > 100) memoria.clear();
    memoria.set(chave, { exp: Date.now() + CACHE_MS, dados });
    return dados;
  } catch {
    return { ok: false, motivo: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Alertas do município do cliente para qualquer tela (chip da visita, Hoje,
 * Agenda, Painel da Rua). Mostre com `textoAlertas(estado)`: nunca devolve
 * "nada" para a tela.
 */
export function useAlertasClima(
  ibge: string | number | null | undefined,
  coord?: CoordenadaAlerta | null,
): EstadoAlertas {
  const [estado, setEstado] = useState<EstadoAlertas>('carregando');
  const lat = coord?.lat;
  const lon = coord?.lon;

  useEffect(() => {
    let vivo = true;
    setEstado('carregando');
    const ponto = typeof lat === 'number' && typeof lon === 'number' ? { lat, lon } : null;
    buscarAlertas(ibge, ponto)
      .then((r) => {
        if (vivo) setEstado(r);
      })
      // Nada acima lança, mas se lançar é "não sei" e precisa CHEGAR na tela —
      // não pode ficar em 'carregando' para sempre.
      .catch(() => {
        if (vivo) setEstado({ ok: false, motivo: 'alertas_indisponiveis' });
      });
    return () => {
      vivo = false;
    };
  }, [ibge, lat, lon]);

  return estado;
}
