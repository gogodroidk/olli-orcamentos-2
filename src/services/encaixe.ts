/**
 * encaixe.ts — Encaixe Inteligente e "Clientes perto de mim" (Onda I1, jogada 4).
 *
 * "Você já vai estar a 1,2 km daqui na terça às 14h (cliente Maria). Encaixar
 * às 15h30?" — sem API nenhuma: só as coordenadas já geocodificadas dos
 * clientes (colunas `clientes.lat/lon` da I1) e a distância em linha reta
 * (haversine), calculada no aparelho. Nada sai do celular.
 *
 * Arquivo PURO (nenhum import): `scripts/teste-encaixe.ts` roda tudo em node.
 *
 * ─── COMO SUGERE ───────────────────────────────────────────────────────────
 *  1. Pega as visitas AGENDADAS dos próximos 7 dias que têm coordenada (as
 *     ocorrências de série já expandidas por quem chama — `expandirRecorrencia`).
 *  2. Mede a distância de cada uma até o cliente novo e fica com as do raio.
 *  3. Para cada visita perto, propõe a janela logo DEPOIS (fim + deslocamento)
 *     e logo ANTES (início − deslocamento − duração), alinhadas em 30 min.
 *  4. Descarta janela fora do expediente (8h–18h, seg a sáb, padrão), no
 *     passado/em cima da hora, ou que bata com outra visita (contando o
 *     deslocamento até ela).
 *  5. Devolve as 3 melhores: mais perto primeiro, depois a mais cedo.
 *
 * O deslocamento é ESTIMADO (linha reta × 1,4 de sinuosidade a 30 km/h, mínimo
 * de 10 min). É uma sugestão para o prestador confirmar, não um ETA: o texto
 * fala em distância, nunca promete tempo de trânsito.
 *
 * ─── ERRO NÃO VIRA VAZIO ───────────────────────────────────────────────────
 *  - cliente novo sem coordenada → `{ ok:false, motivo:'cliente_sem_localizacao' }`
 *    (a tela diz "cadastre o CEP do cliente para ver encaixes"), nunca "nenhum
 *    encaixe";
 *  - visitas da agenda sem coordenada são CONTADAS (`visitasSemLocalizacao`) e
 *    a tela diz quantas ficaram de fora.
 *
 * ─── FUSO ──────────────────────────────────────────────────────────────────
 * Expediente em hora de Brasília, UTC−3 fixo (sem horário de verão desde 2019;
 * sem `Intl` com timeZone, que o Hermes não garante).
 */

const MS_MIN = 60_000;
const MS_HORA = 3_600_000;
const MS_DIA = 86_400_000;
const OFFSET_BRASILIA_MS = -3 * MS_HORA;
const RAIO_TERRA_KM = 6371;

export interface Coordenada {
  lat: number;
  lon: number;
}

export interface VisitaAgenda {
  id: string;
  clienteNome: string;
  /** ISO com fuso. */
  inicio: string;
  /** ISO com fuso. Ausente = `duracaoVisitaPadraoMin`. */
  fim?: string | null;
  lat?: number | null;
  lon?: number | null;
  /** 'agendado' | 'concluido' | 'cancelado'. Só 'agendado' (ou ausente) conta. */
  status?: string | null;
}

export interface OpcoesEncaixe {
  agora?: Date;
  /** Quantos dias à frente olhar. Padrão 7. */
  dias?: number;
  /** Duração do serviço novo (média do catálogo). Padrão 60 min. */
  duracaoMin?: number;
  /** Duração assumida das visitas sem `fim`. Padrão 60 min. */
  duracaoVisitaPadraoMin?: number;
  /** Expediente em hora de Brasília, [inicio, fim). Padrão 8 → 18. */
  expediente?: { inicioHora: number; fimHora: number };
  /** Dias da semana atendidos (0 = domingo). Padrão seg a sáb. */
  diasSemana?: number[];
  /** Raio, em km de linha reta, para considerar "perto". Padrão 15. */
  raioKm?: number;
  /** Quantas sugestões. Padrão 3. */
  quantidade?: number;
  /** Grade de horários (min). Padrão 30. */
  passoMin?: number;
  /** Antecedência mínima a partir de agora (min). Padrão 60. */
  antecedenciaMin?: number;
  /** Folga mínima entre duas visitas quando não dá para medir a distância (min). Padrão 15. */
  folgaMin?: number;
}

export interface SugestaoEncaixe {
  /** ISO (UTC) do início sugerido. */
  inicio: string;
  /** ISO (UTC) do fim (início + duração). */
  fim: string;
  /** A visita perto de onde o prestador já vai estar. */
  ancora: {
    visitaId: string;
    clienteNome: string;
    /** ISO do início da visita âncora. */
    inicio: string;
    distanciaKm: number;
    posicao: 'antes' | 'depois';
  };
  /** Deslocamento estimado entre a âncora e o cliente novo (min). */
  deslocamentoMin: number;
  /** "terça, 07/10 às 15h30" */
  quando: string;
  /** "a 1,2 km da visita de Maria (14h)" */
  motivo: string;
}

export type ResultadoEncaixe =
  | { ok: false; motivo: 'cliente_sem_localizacao' }
  | {
      ok: true;
      sugestoes: SugestaoEncaixe[];
      /** Visitas futuras com coordenada que entraram na conta. */
      visitasConsideradas: number;
      /** Visitas futuras SEM coordenada (ficaram de fora — a tela avisa). */
      visitasSemLocalizacao: number;
    };

// ─── Geometria ─────────────────────────────────────────────────────────────

export function coordenadaValida(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

/** Distância em linha reta (km) pela fórmula de haversine. */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "800 m" / "1,2 km" / "12 km". */
export function textoDistancia(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/** Fator de sinuosidade: rua não é linha reta. */
const FATOR_RUA = 1.4;
/** Velocidade média urbana assumida (km/h). */
const VELOCIDADE_KMH = 30;
const DESLOCAMENTO_MIN_MIN = 10;

/** Deslocamento ESTIMADO (min) para uma distância em linha reta. */
export function deslocamentoEstimadoMin(km: number): number {
  const min = Math.ceil(((km * FATOR_RUA) / VELOCIDADE_KMH) * 60);
  return Math.max(DESLOCAMENTO_MIN_MIN, min);
}

// ─── Hora de Brasília ──────────────────────────────────────────────────────

function msDe(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function brasilia(ms: number): { data: string; minutoDoDia: number; diaSemana: number; hora: string } {
  const d = new Date(ms + OFFSET_BRASILIA_MS);
  return {
    data: d.toISOString().slice(0, 10),
    minutoDoDia: d.getUTCHours() * 60 + d.getUTCMinutes(),
    diaSemana: d.getUTCDay(),
    hora: d.toISOString().slice(11, 16),
  };
}

function horaCurta(hhmm: string): string {
  const h = String(Number(hhmm.slice(0, 2)));
  return hhmm.slice(3, 5) === '00' ? `${h}h` : `${h}h${hhmm.slice(3, 5)}`;
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "hoje às 15h30", "amanhã às 9h", "terça, 07/10 às 14h". */
export function textoQuando(ms: number, agoraMs: number): string {
  const p = brasilia(ms);
  const hoje = brasilia(agoraMs).data;
  const amanha = brasilia(agoraMs + MS_DIA).data;
  const dia =
    p.data === hoje
      ? 'hoje'
      : p.data === amanha
        ? 'amanhã'
        : `${DIAS_SEMANA[p.diaSemana]}, ${p.data.slice(8, 10)}/${p.data.slice(5, 7)}`;
  return `${dia} às ${horaCurta(p.hora)}`;
}

// ─── Encaixe ───────────────────────────────────────────────────────────────

interface VisitaNormal {
  v: VisitaAgenda;
  ini: number;
  fim: number;
  coord: Coordenada | null;
}

/**
 * Até 3 horários para encaixar um cliente novo perto de onde o prestador já vai
 * estar nos próximos 7 dias. Nunca lança.
 */
export function sugerirEncaixe(
  cliente: Partial<Coordenada> | null | undefined,
  visitas: VisitaAgenda[],
  opcoes: OpcoesEncaixe = {},
): ResultadoEncaixe {
  if (!cliente || !coordenadaValida(cliente.lat, cliente.lon)) return { ok: false, motivo: 'cliente_sem_localizacao' };
  const alvo: Coordenada = { lat: cliente.lat as number, lon: cliente.lon as number };

  const agoraMs = (opcoes.agora ?? new Date()).getTime();
  const dias = opcoes.dias ?? 7;
  const duracao = (opcoes.duracaoMin ?? 60) * MS_MIN;
  const duracaoPadrao = (opcoes.duracaoVisitaPadraoMin ?? 60) * MS_MIN;
  const exp = opcoes.expediente ?? { inicioHora: 8, fimHora: 18 };
  const diasSemana = opcoes.diasSemana ?? [1, 2, 3, 4, 5, 6];
  const raio = opcoes.raioKm ?? 15;
  const quantidade = opcoes.quantidade ?? 3;
  const passo = (opcoes.passoMin ?? 30) * MS_MIN;
  const antecedencia = (opcoes.antecedenciaMin ?? 60) * MS_MIN;
  const folga = (opcoes.folgaMin ?? 15) * MS_MIN;
  const limiteMs = agoraMs + dias * MS_DIA;

  // Todas as visitas ativas (inclusive as de hoje que já começaram) contam como OCUPADO.
  const ativas: VisitaNormal[] = [];
  for (const v of visitas ?? []) {
    if (v.status && v.status !== 'agendado') continue;
    const ini = msDe(v.inicio);
    if (ini === null) continue;
    const fimInf = msDe(v.fim);
    const fim = fimInf !== null && fimInf > ini ? fimInf : ini + duracaoPadrao;
    if (fim <= agoraMs || ini >= limiteMs) continue;
    ativas.push({ v, ini, fim, coord: coordenadaValida(v.lat, v.lon) ? { lat: v.lat as number, lon: v.lon as number } : null });
  }
  const comCoord = ativas.filter((a) => a.coord !== null);
  const visitasSemLocalizacao = ativas.length - comCoord.length;

  const perto = comCoord
    .map((a) => ({ a, km: distanciaKm(a.coord as Coordenada, alvo) }))
    .filter((x) => x.km <= raio)
    .sort((x, y) => x.km - y.km || x.a.ini - y.a.ini);

  const cabe = (ini: number, fim: number): boolean => {
    if (ini < agoraMs + antecedencia || fim > limiteMs) return false;
    const pi = brasilia(ini);
    if (!diasSemana.includes(pi.diaSemana)) return false;
    // Expediente [inicioHora, fimHora) no MESMO dia: começa depois da abertura e termina até o fechamento.
    const fimMinutoDoDia = pi.minutoDoDia + (fim - ini) / MS_MIN;
    if (pi.minutoDoDia < exp.inicioHora * 60 || fimMinutoDoDia > exp.fimHora * 60) return false;
    for (const o of ativas) {
      const margem = o.coord ? deslocamentoEstimadoMin(distanciaKm(o.coord, alvo)) * MS_MIN : folga;
      if (ini < o.fim + margem && fim + margem > o.ini) return false;
    }
    return true;
  };

  const vistos = new Set<number>();
  const sugestoes: SugestaoEncaixe[] = [];
  for (const { a, km } of perto) {
    if (sugestoes.length >= quantidade) break;
    const desl = deslocamentoEstimadoMin(km);
    const candidatos: Array<{ ini: number; posicao: 'antes' | 'depois' }> = [
      { ini: Math.ceil((a.fim + desl * MS_MIN) / passo) * passo, posicao: 'depois' },
      { ini: Math.floor((a.ini - desl * MS_MIN - duracao) / passo) * passo, posicao: 'antes' },
    ];
    for (const c of candidatos) {
      if (sugestoes.length >= quantidade) break;
      const fim = c.ini + duracao;
      if (vistos.has(c.ini) || !cabe(c.ini, fim)) continue;
      vistos.add(c.ini);
      const horaAncora = horaCurta(brasilia(a.ini).hora);
      sugestoes.push({
        inicio: new Date(c.ini).toISOString(),
        fim: new Date(fim).toISOString(),
        ancora: {
          visitaId: a.v.id,
          clienteNome: a.v.clienteNome,
          inicio: a.v.inicio,
          distanciaKm: Math.round(km * 10) / 10,
          posicao: c.posicao,
        },
        deslocamentoMin: desl,
        quando: textoQuando(c.ini, agoraMs),
        motivo: `a ${textoDistancia(km)} da visita de ${String(a.v.clienteNome ?? '').trim() || 'outro cliente'} (${horaAncora})`,
      });
    }
  }

  // Mais perto primeiro; empate de distância → mais cedo.
  sugestoes.sort((x, y) => x.ancora.distanciaKm - y.ancora.distanciaKm || Date.parse(x.inicio) - Date.parse(y.inicio));
  return { ok: true, sugestoes, visitasConsideradas: comCoord.length, visitasSemLocalizacao };
}

// ─── Clientes perto de mim ─────────────────────────────────────────────────

export interface ClienteComLocal {
  id: string;
  nome: string;
  lat?: number | null;
  lon?: number | null;
}

export type ResultadoPerto<T> =
  | { ok: false; motivo: 'origem_sem_localizacao' }
  | { ok: true; clientes: Array<T & { distanciaKm: number }>; semLocalizacao: number };

/**
 * Clientes num raio de um ponto (a visita de agora, a base do prestador). Os
 * sem coordenada são CONTADOS, não somem calados.
 */
export function clientesPerto<T extends ClienteComLocal>(
  origem: Partial<Coordenada> | null | undefined,
  clientes: T[],
  opcoes: { raioKm?: number; limite?: number; ignorarIds?: string[] } = {},
): ResultadoPerto<T> {
  if (!origem || !coordenadaValida(origem.lat, origem.lon)) return { ok: false, motivo: 'origem_sem_localizacao' };
  const o: Coordenada = { lat: origem.lat as number, lon: origem.lon as number };
  const raio = opcoes.raioKm ?? 10;
  const limite = opcoes.limite ?? 10;
  const ignorar = new Set(opcoes.ignorarIds ?? []);
  let semLocalizacao = 0;
  const lista: Array<T & { distanciaKm: number }> = [];
  for (const c of clientes ?? []) {
    if (ignorar.has(c.id)) continue;
    if (!coordenadaValida(c.lat, c.lon)) {
      semLocalizacao++;
      continue;
    }
    const km = distanciaKm(o, { lat: c.lat as number, lon: c.lon as number });
    if (km <= raio) lista.push({ ...c, distanciaKm: Math.round(km * 10) / 10 });
  }
  lista.sort((a, b) => a.distanciaKm - b.distanciaKm || a.nome.localeCompare(b.nome));
  return { ok: true, clientes: lista.slice(0, limite), semLocalizacao };
}
