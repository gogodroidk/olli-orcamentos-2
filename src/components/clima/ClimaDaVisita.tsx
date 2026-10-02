/**
 * ClimaDaVisita — o encaixe do "Chuva na Visita" numa visita da Agenda/Hoje.
 *
 * Junta as três peças isoladas da Onda I1 num lugar só, para as telas só
 * passarem a visita e o cliente:
 *  1. `useClimaVisita` (MET Norway na coordenada do cliente) + `ClimaVisitaChip`;
 *  2. chip tocável quando `sugerirRemarcar` (visita EXTERNA com chuva forte ou
 *     alerta): abre a `FolhaRemarcarChuva` (avisar o cliente no WhatsApp, com
 *     os horários do Encaixe na mensagem);
 *  3. "Remarcar e avisar" → `FolhaNovaDataVisita` (Encaixe ou dia/hora) →
 *     `remarcarVisita` (série: só esta ocorrência, via `editarRecorrente`).
 *
 * Não polui: só aparece quando há o que dizer agora (`climaMereceEspaco`) —
 * previsão, carregando, clima indisponível ou alerta. Visita da semana que vem,
 * passada ou "Dia todo" não ganha linha. Crédito "Previsão: MET Norway" sai no
 * chip, salvo quando a tela já mostra o crédito uma vez (`mostrarAtribuicao`).
 */
import { useEffect, useRef, useState } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { ClimaVisitaChip } from './ClimaVisitaChip';
import { FolhaRemarcarChuva } from './FolhaRemarcarChuva';
import { FolhaNovaDataVisita } from './FolhaNovaDataVisita';
import { useClimaVisita } from '../../services/climaVisita';
import { useEncaixe } from '../../hooks/useEncaixe';
import { getEmpresa } from '../../database/database';
import { alternativasDoEncaixe, climaMereceEspaco, visitaParaClima } from '../../utils/climaNaAgenda';
import { duracaoEstimadaMin, semHoraMarcada } from '../../utils/agendaDominio';
import type { OcorrenciaAgendamento } from '../../utils/contratoRecorrente';
import type { Cliente } from '../../types';

export interface ClimaDaVisitaProps {
  visita: OcorrenciaAgendamento;
  /** Cadastro do cliente da visita (ponto + WhatsApp). Ausente = sem cadastro. */
  cliente?: Cliente | null;
  /** Clientes já carregados pela tela (o Encaixe não relê o banco). */
  clientes?: Cliente[];
  /** Depois de remarcar (ou desfazer): a tela relê a agenda. */
  aoRemarcado: () => void;
  mostrarAtribuicao?: boolean;
  indice?: number;
  style?: StyleProp<ViewStyle>;
}

/** No iOS um Modal só sobe depois que o anterior terminou de descer. */
const ESPERA_TROCA_FOLHA_MS = Platform.OS === 'ios' ? 450 : 0;

function duracaoDaVisita(v: OcorrenciaAgendamento): number {
  const ini = Date.parse(v.inicio);
  const fim = v.fim ? Date.parse(v.fim) : NaN;
  if (Number.isFinite(ini) && Number.isFinite(fim) && fim > ini) return Math.round((fim - ini) / 60_000);
  return duracaoEstimadaMin(v.tipo);
}

export function ClimaDaVisita({ visita, cliente, clientes, aoRemarcado, mostrarAtribuicao = true, indice = 0, style }: ClimaDaVisitaProps) {
  const analise = useClimaVisita(visitaParaClima(visita, cliente));
  const [etapa, setEtapa] = useState<'avisar' | 'data' | null>(null);
  const [empresaNome, setEmpresaNome] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const encaixe = useEncaixe({
    cliente,
    ativo: etapa !== null,
    duracaoMin: duracaoDaVisita(visita),
    ignorarId: visita.id,
    responsavelId: visita.responsavelId,
    clientes,
  });

  // Nome do negócio para a mensagem ("Aqui é da …"): só quando a folha abre.
  useEffect(() => {
    if (etapa === null || empresaNome !== null) return;
    let vivo = true;
    getEmpresa()
      .then((e) => { if (vivo) setEmpresaNome(e?.nome?.trim() ?? ''); })
      .catch(() => { if (vivo) setEmpresaNome(''); });
    return () => { vivo = false; };
  }, [etapa, empresaNome]);

  // Visita concluída/cancelada não tem mais o que prever.
  if (visita.status !== 'agendado') return null;
  if (!climaMereceEspaco(analise, { externa: visita.externa, diaTodo: semHoraMarcada(visita) })) return null;

  const podeRemarcar = analise.sugerirRemarcar;

  return (
    <View style={style}>
      <ClimaVisitaChip
        analise={analise}
        indice={indice}
        mostrarAtribuicao={mostrarAtribuicao}
        onPress={podeRemarcar ? () => setEtapa('avisar') : undefined}
      />
      {podeRemarcar ? (
        <>
          <FolhaRemarcarChuva
            visivel={etapa === 'avisar'}
            analise={analise}
            visita={{
              inicio: visita.inicio,
              clienteNome: cliente?.nome ?? visita.clienteNome,
              clienteTelefone: cliente?.telefone ?? null,
              servico: visita.titulo,
            }}
            empresaNome={empresaNome}
            alternativas={alternativasDoEncaixe(encaixe)}
            aoRemarcar={() => {
              setEtapa(null);
              timer.current = setTimeout(() => setEtapa('data'), ESPERA_TROCA_FOLHA_MS);
            }}
            aoManter={() => setEtapa(null)}
          />
          <FolhaNovaDataVisita
            visivel={etapa === 'data'}
            visita={visita}
            encaixe={encaixe}
            aoFechar={() => setEtapa(null)}
            aoRemarcado={aoRemarcado}
          />
        </>
      ) : null}
    </View>
  );
}
