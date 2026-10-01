/**
 * climaVisitaRegra.ts — a regra PURA do "Chuva na Visita" (Onda I1, jogada 1).
 *
 * Sem React, sem rede: `climaVisita.ts` busca o `/clima` (via `clima.ts`) e chama
 * estas funções; `scripts/teste-clima-visita.ts` roda tudo isto em `node`. Só
 * importa módulos que também não importam nada em runtime (`climaTexto.ts` e
 * `telefoneWhatsapp.ts`).
 *
 * O que decide:
 *  1. CRUZAR A HORA DA VISITA COM A SÉRIE DO MET. O worker devolve
 *     `chuvaPorHora` (milímetros + símbolo por hora, horário de Brasília) para as
 *     próximas 12h. A visita ocupa as horas de `inicio` até `fim` (sem `fim`,
 *     1h). A pior hora da janela manda no chip.
 *  2. CHUVA FORTE = 2 mm/h ou mais, OU símbolo de chuva forte/trovoada do MET
 *     ('heavyrain…', '…thunder'). O limite é ajustável (`limiarForteMm`).
 *  3. ALERTA OFICIAL (INMET / Defesa Civil), quando a rota de alertas existir e a
 *     tela passar o estado: alerta que cobre o horário da visita pinta o chip de
 *     laranja (perigo potencial/perigo) ou vermelho (grande perigo).
 *  4. REMARCAR. Visita marcada como EXTERNA com chuva forte ou alerta oficial no
 *     horário → `sugerirRemarcar: true` (a tela abre a `FolhaRemarcarChuva`).
 *
 * ─── A REGRA DURA DA CASA (`olli-gate-erro-vira-vazio`) ────────────────────
 *  - clima que falhou → "Clima indisponível", nunca "sem chuva";
 *  - hora sem milímetro (`mm: null`) → "previsão incompleta", nunca "sem chuva";
 *  - visita fora da janela de 12h → "a previsão sai mais perto da visita",
 *    nunca "sem chuva";
 *  - feed de alertas caído → "Alertas oficiais indisponíveis", NUNCA "sem
 *    alertas". Feed ainda não ligado (`alertas` ausente) → o chip simplesmente
 *    não fala de alerta nenhum: não afirma que não há.
 *
 * ─── FUSO ──────────────────────────────────────────────────────────────────
 * O worker monta as horas em America/Sao_Paulo. O Brasil não tem horário de
 * verão desde 2019, então Brasília é UTC−3 fixo — a conta é feita na mão (sem
 * `Intl` com timeZone, que o Hermes do APK não garante).
 */
import {
  ATRIBUICAO_CLIMA,
  LIMIAR_MM_CHUVA,
  LIMIAR_MM_TALVEZ,
  horaCurta,
  mmCurto,
  simboloEhChuva,
  type EstadoClima,
  type HoraChuva,
  type MotivoFalhaClima,
} from './climaTexto.ts';
import { linkApiWhatsApp, numeroWhatsAppBR } from '../utils/telefoneWhatsapp.ts';

const MS_MIN = 60_000;
const MS_HORA = 3_600_000;
/** Brasília = UTC−3 (sem horário de verão desde 2019). */
const OFFSET_BRASILIA_MS = -3 * MS_HORA;

/** mm/h a partir do qual a chuva é FORTE (sugere remarcar serviço externo). */
export const LIMIAR_MM_CHUVA_FORTE = 2;
/** Duração assumida da visita sem `fim`. */
export const DURACAO_VISITA_PADRAO_MIN = 60;
/** Teto de horas olhadas numa visita longa (o dia inteiro de obra não vira 12 chips). */
const MAX_HORAS_JANELA = 8;

// ─── Entradas ──────────────────────────────────────────────────────────────

export interface VisitaParaClima {
  /** ISO com fuso (como o `Agendamento.inicio`). */
  inicio: string;
  /** ISO com fuso. Ausente = `DURACAO_VISITA_PADRAO_MIN`. */
  fim?: string | null;
  /** Coordenada do cliente (colunas `clientes.lat/lon` da migration da I1). */
  lat?: number | null;
  lon?: number | null;
  /** Serviço na parte externa / em altura (`agendamentos.externa`). */
  externa?: boolean | null;
  /** Bairro ou rótulo curto do lugar, para o chip ("Chuva forte às 15h · Jardim X"). */
  local?: string | null;
}

/** Nível do alerta como o INMET publica: perigo potencial / perigo / grande perigo. */
export type NivelAlerta = 'amarelo' | 'laranja' | 'vermelho';

export interface AlertaOficial {
  /** 'INMET' ou 'Defesa Civil'. */
  fonte: string;
  /** "Tempestade", "Chuvas intensas"… */
  evento: string;
  nivel: NivelAlerta;
  /** ISO com fuso. */
  inicio: string;
  /** ISO com fuso; `null` = sem fim informado. */
  fim: string | null;
}

/**
 * Estado dos alertas oficiais, com os mesmos 3 estados do clima. `undefined`
 * (a tela não passou nada) = feed ainda não ligado: o chip não fala de alerta.
 */
export type EstadoAlertas =
  | 'carregando'
  | { ok: false; motivo: 'indisponivel' | 'offline' }
  | { ok: true; alertas: AlertaOficial[] };

export interface OpcoesClimaVisita {
  /** Relógio (teste). */
  agora?: Date;
  /** mm/h que contam como chuva forte. Padrão `LIMIAR_MM_CHUVA_FORTE` (2). */
  limiarForteMm?: number;
  alertas?: EstadoAlertas;
}

// ─── Saída ─────────────────────────────────────────────────────────────────

export type NivelChuvaVisita = 'forte' | 'chuva' | 'talvez' | 'seco' | 'incerto';

export type EstadoClimaVisita =
  | 'carregando'
  | 'indisponivel'
  | 'sem_local'
  | 'passada'
  | 'fora_da_janela'
  | 'previsao';

/** Tom do chip. `mudo` = não há o que afirmar; `perigo`/`aviso` = alerta oficial. */
export type TomClimaVisita = 'neutro' | 'chuva' | 'aviso' | 'perigo' | 'mudo';

export interface ResultadoClimaVisita {
  estado: EstadoClimaVisita;
  /** Só em `estado: 'previsao'`. */
  nivel: NivelChuvaVisita | null;
  /** 'HH:MM' da hora que decidiu o nível (a 1ª com o pior nível). */
  hora: string | null;
  /** mm previstos nessa hora (`null` = não informado). */
  mm: number | null;
  /** Frase do chip: "Chuva forte às 15h · Jardim X". Nunca vazia, salvo em 'passada'. */
  texto: string;
  /** Alerta oficial que cobre a visita, se houver. */
  alerta: AlertaOficial | null;
  /** "Alerta INMET: tempestade até 18h". */
  textoAlerta: string | null;
  /** O feed de alertas foi consultado e falhou — a tela diz isso, não "sem alertas". */
  alertasIndisponiveis: boolean;
  tom: TomClimaVisita;
  /** Visita externa com chuva forte ou alerta: oferecer a folha "Remarcar por chuva". */
  sugerirRemarcar: boolean;
  /** Crédito a mostrar junto (CC BY 4.0 do MET e a fonte do alerta). `null` = nada de terceiro na tela. */
  atribuicao: string | null;
  /** Texto completo para leitor de tela. */
  acessibilidade: string;
}

// ─── Hora de Brasília ──────────────────────────────────────────────────────

function msDe(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Partes da hora de Brasília de um instante. */
function partesBrasilia(ms: number): { data: string; hora: string; chaveHora: string; diaSemana: number } {
  const d = new Date(ms + OFFSET_BRASILIA_MS);
  const iso = d.toISOString(); // AAAA-MM-DDTHH:MM, já deslocado para Brasília
  return {
    data: iso.slice(0, 10),
    hora: iso.slice(11, 16),
    chaveHora: `${iso.slice(0, 13)}:00`,
    diaSemana: d.getUTCDay(),
  };
}

/** 'HH:MM' de Brasília de um ISO. */
export function horaBrasilia(iso: string): string | null {
  const t = msDe(iso);
  return t === null ? null : partesBrasilia(t).hora;
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "hoje", "amanhã" ou "terça, 07/10" (Brasília). */
export function diaRelativo(iso: string, agora: Date = new Date()): string {
  const t = msDe(iso);
  if (t === null) return '';
  const alvo = partesBrasilia(t);
  const hoje = partesBrasilia(agora.getTime());
  const amanha = partesBrasilia(agora.getTime() + 24 * MS_HORA);
  if (alvo.data === hoje.data) return 'hoje';
  if (alvo.data === amanha.data) return 'amanhã';
  return `${DIAS_SEMANA[alvo.diaSemana]}, ${alvo.data.slice(8, 10)}/${alvo.data.slice(5, 7)}`;
}

// ─── Chuva ─────────────────────────────────────────────────────────────────

/** Símbolo do MET de chuva FORTE: 'heavyrain…', 'heavysleet…' ou qualquer trovoada. */
export function simboloEhChuvaForte(simbolo: string | null | undefined): boolean {
  if (typeof simbolo !== 'string') return false;
  if (simbolo.includes('thunder')) return true;
  return /^heavy(rain|sleet)/.test(simbolo);
}

const PESO: Record<NivelChuvaVisita, number> = { seco: 0, incerto: 1, talvez: 2, chuva: 3, forte: 4 };

function nivelDaHora(h: HoraChuva, limiarForte: number): NivelChuvaVisita {
  if (simboloEhChuvaForte(h.simbolo) || (h.mm !== null && h.mm >= limiarForte)) return 'forte';
  if (simboloEhChuva(h.simbolo) || (h.mm !== null && h.mm >= LIMIAR_MM_CHUVA)) return 'chuva';
  if (h.mm !== null && h.mm >= LIMIAR_MM_TALVEZ) return 'talvez';
  if (h.mm === null) return 'incerto';
  return 'seco';
}

// ─── Alertas ───────────────────────────────────────────────────────────────

const PESO_ALERTA: Record<NivelAlerta, number> = { amarelo: 1, laranja: 2, vermelho: 3 };

/** O alerta mais grave que cobre [ini, fim) da visita. */
export function alertaDaVisita(alertas: AlertaOficial[], iniMs: number, fimMs: number): AlertaOficial | null {
  let melhor: AlertaOficial | null = null;
  for (const a of alertas) {
    const ai = msDe(a.inicio);
    if (ai === null || !(a.nivel in PESO_ALERTA)) continue;
    const af = a.fim === null ? Number.POSITIVE_INFINITY : msDe(a.fim);
    if (af === null) continue;
    if (ai < fimMs && af > iniMs && (!melhor || PESO_ALERTA[a.nivel] > PESO_ALERTA[melhor.nivel])) melhor = a;
  }
  return melhor;
}

/** "Alerta INMET: tempestade até 18h" (ou "até 02/10 6h" quando o fim é outro dia). */
export function textoDoAlerta(a: AlertaOficial, referenciaMs: number): string {
  const evento = a.evento.trim().toLowerCase() || 'tempo severo';
  const base = `Alerta ${a.fonte}: ${evento}`;
  const fim = msDe(a.fim);
  if (fim === null) return base;
  const pf = partesBrasilia(fim);
  const pr = partesBrasilia(referenciaMs);
  const dia = pf.data === pr.data ? '' : `${pf.data.slice(8, 10)}/${pf.data.slice(5, 7)} `;
  return `${base} até ${dia}${horaCurta(pf.hora)}`;
}

// ─── A análise ─────────────────────────────────────────────────────────────

function resultado(parcial: Partial<ResultadoClimaVisita> & { estado: EstadoClimaVisita; texto: string }): ResultadoClimaVisita {
  const r: ResultadoClimaVisita = {
    nivel: null,
    hora: null,
    mm: null,
    alerta: null,
    textoAlerta: null,
    alertasIndisponiveis: false,
    tom: 'mudo',
    sugerirRemarcar: false,
    atribuicao: null,
    acessibilidade: '',
    ...parcial,
  };
  const partes = [r.textoAlerta, r.texto, r.alertasIndisponiveis ? 'Alertas oficiais indisponíveis' : null];
  r.acessibilidade = partes.filter((p): p is string => !!p).join('. ');
  return r;
}

function coordValida(lat: unknown, lon: unknown): boolean {
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

const TEXTO_FALHA: Record<MotivoFalhaClima, string> = {
  sem_localizacao: 'Clima indisponível',
  nao_configurado: 'Clima indisponível',
  coordenadas_invalidas: 'Clima indisponível',
  muitas_requisicoes: 'Clima indisponível',
  clima_indisponivel: 'Clima indisponível',
  offline: 'Clima indisponível sem internet',
};

/**
 * Cruza uma visita com o clima (e com os alertas, quando a tela tiver).
 * NUNCA lança e NUNCA devolve texto vazio para uma visita futura.
 */
export function analisarClimaVisita(
  visita: VisitaParaClima,
  clima: EstadoClima,
  opcoes: OpcoesClimaVisita = {},
): ResultadoClimaVisita {
  const agoraMs = (opcoes.agora ?? new Date()).getTime();
  const limiarForte =
    typeof opcoes.limiarForteMm === 'number' && opcoes.limiarForteMm > 0 ? opcoes.limiarForteMm : LIMIAR_MM_CHUVA_FORTE;

  const iniMs = msDe(visita.inicio);
  if (iniMs === null) return resultado({ estado: 'indisponivel', texto: 'Clima indisponível: visita sem horário' });
  const fimInformado = msDe(visita.fim);
  const fimMs = fimInformado !== null && fimInformado > iniMs ? fimInformado : iniMs + DURACAO_VISITA_PADRAO_MIN * MS_MIN;

  if (fimMs <= agoraMs) return resultado({ estado: 'passada', texto: '' });
  if (!coordValida(visita.lat, visita.lon)) {
    return resultado({ estado: 'sem_local', texto: 'Clima: endereço do cliente sem localização' });
  }

  // Alertas (independentes do clima: um pode falhar e o outro não).
  let alerta: AlertaOficial | null = null;
  let alertasIndisponiveis = false;
  const al = opcoes.alertas;
  if (al !== undefined && al !== 'carregando') {
    if (al.ok === false) alertasIndisponiveis = true;
    else alerta = alertaDaVisita(al.alertas, iniMs, fimMs);
  }
  const textoAlerta = alerta ? textoDoAlerta(alerta, iniMs) : null;
  const tomAlerta: TomClimaVisita | null = alerta ? (alerta.nivel === 'vermelho' ? 'perigo' : 'aviso') : null;
  const externa = visita.externa === true;
  const local = typeof visita.local === 'string' && visita.local.trim() ? ` · ${visita.local.trim()}` : '';
  const comum = {
    alerta,
    textoAlerta,
    alertasIndisponiveis,
    sugerirRemarcar: externa && alerta !== null,
  };
  const creditoAlerta = alerta ? `Alerta: ${alerta.fonte}` : null;

  if (clima === 'carregando') {
    return resultado({ ...comum, estado: 'carregando', texto: 'Carregando clima…', tom: tomAlerta ?? 'mudo', atribuicao: creditoAlerta });
  }
  if (clima.ok === false) {
    return resultado({
      ...comum,
      estado: 'indisponivel',
      texto: TEXTO_FALHA[clima.motivo] ?? 'Clima indisponível',
      tom: tomAlerta ?? 'mudo',
      atribuicao: creditoAlerta,
    });
  }

  // Horas da visita, na chave 'AAAA-MM-DDTHH:00' de Brasília (a mesma do worker).
  const porChave = new Map<string, HoraChuva>();
  for (const h of clima.chuvaPorHora) porChave.set(`${h.inicio.slice(0, 13)}:00`, h);
  const primeiraHoraMs = Math.max(Math.floor(iniMs / MS_HORA) * MS_HORA, Math.floor(agoraMs / MS_HORA) * MS_HORA);
  const janela: HoraChuva[] = [];
  let faltando = 0;
  for (let t = primeiraHoraMs; t < fimMs && janela.length + faltando < MAX_HORAS_JANELA; t += MS_HORA) {
    const p = partesBrasilia(t);
    const h = porChave.get(p.chaveHora);
    if (h) janela.push(h);
    else faltando++;
  }

  const ultima = clima.chuvaPorHora[clima.chuvaPorHora.length - 1];
  if (janela.length === 0) {
    // A visita está além da série (o worker dá as próximas 12h).
    const horas = clima.chuvaPorHora.length || 12;
    return resultado({
      ...comum,
      estado: 'fora_da_janela',
      texto: `Previsão de chuva sai ${horas}h antes da visita`,
      tom: tomAlerta ?? 'mudo',
      atribuicao: creditoAlerta,
      hora: ultima ? ultima.hora : null,
    });
  }

  let pior: NivelChuvaVisita = 'seco';
  let decisiva: HoraChuva = janela[0];
  for (const h of janela) {
    const n = nivelDaHora(h, limiarForte);
    if (PESO[n] > PESO[pior]) {
      pior = n;
      decisiva = h;
    }
  }
  // Hora da janela que o worker não cobre é "não sei": seco + falta = incerto.
  if (pior === 'seco' && faltando > 0) pior = 'incerto';

  const hc = horaCurta(decisiva.hora);
  const horaVisita = horaCurta(partesBrasilia(iniMs).hora);
  let texto: string;
  switch (pior) {
    case 'forte':
      texto = `Chuva forte às ${hc}${local}`;
      break;
    case 'chuva':
      texto = `Chuva prevista às ${hc}${local}`;
      break;
    case 'talvez':
      texto = `Pode chover às ${hc}${decisiva.mm !== null ? ` (${mmCurto(decisiva.mm)})` : ''}${local}`;
      break;
    case 'incerto':
      texto = `Previsão incompleta para as ${horaVisita}`;
      break;
    default:
      texto = `Sem chuva prevista às ${horaVisita}${local}`;
  }

  const tomChuva: TomClimaVisita = pior === 'seco' ? 'neutro' : pior === 'incerto' ? 'mudo' : 'chuva';
  return resultado({
    ...comum,
    estado: 'previsao',
    nivel: pior,
    hora: pior === 'seco' || pior === 'incerto' ? null : decisiva.hora,
    mm: pior === 'seco' || pior === 'incerto' ? null : decisiva.mm,
    texto,
    tom: tomAlerta ?? tomChuva,
    sugerirRemarcar: externa && (pior === 'forte' || alerta !== null),
    atribuicao: creditoAlerta ? `${ATRIBUICAO_CLIMA} · ${creditoAlerta}` : ATRIBUICAO_CLIMA,
  });
}

// ─── WhatsApp de remarcação ────────────────────────────────────────────────

export interface DadosMensagemRemarcar {
  clienteNome?: string | null;
  /** Nome do negócio do prestador ("Refrigeração Silva"). */
  empresaNome?: string | null;
  /** Serviço da visita ("limpeza do split"). */
  servico?: string | null;
  /** ISO da visita. */
  inicio: string;
  analise: ResultadoClimaVisita;
  /** Horários alternativos já calculados (ex.: do Encaixe), em texto curto: "quarta, 08/10 às 9h". */
  alternativas?: string[];
  agora?: Date;
}

function primeiroNome(nome: string | null | undefined): string | null {
  const n = String(nome ?? '').trim().split(/\s+/)[0];
  return n ? n : null;
}

/**
 * Mensagem pronta para o cliente. Fala do que a previsão DIZ (chuva forte /
 * alerta oficial), nunca inventa probabilidade, e pede um novo horário.
 */
export function mensagemRemarcarChuva(d: DadosMensagemRemarcar): string {
  const agora = d.agora ?? new Date();
  const nome = primeiroNome(d.clienteNome);
  const saudacao = nome ? `Olá, ${nome}!` : 'Olá!';
  const quem = d.empresaNome?.trim() ? ` Aqui é da ${d.empresaNome.trim()}.` : '';
  const dia = diaRelativo(d.inicio, agora);
  const hora = horaBrasilia(d.inicio);
  const quando = `${dia}${hora ? ` às ${horaCurta(hora)}` : ''}`;
  const servico = d.servico?.trim() ? ` (${d.servico.trim()})` : '';

  let motivo: string;
  if (d.analise.alerta) {
    const a = d.analise.alerta;
    motivo = `Há um alerta oficial do ${a.fonte} de ${a.evento.trim().toLowerCase()} para ${quando}, no horário da nossa visita${servico}.`;
  } else if (d.analise.nivel === 'forte') {
    motivo = `A previsão indica chuva forte para ${quando}, no horário da nossa visita${servico}.`;
  } else {
    motivo = `A previsão indica chuva para ${quando}, no horário da nossa visita${servico}.`;
  }
  const alternativas = (d.alternativas ?? []).filter((a) => a.trim());
  const pedido = alternativas.length
    ? ` Tenho estes horários: ${alternativas.join('; ')}. Algum fica bom para você?`
    : ' Qual dia e horário ficam bons para você?';
  return `${saudacao}${quem} ${motivo} Como o serviço é feito na parte externa, prefiro remarcar para fazer com segurança e com qualidade.${pedido}`;
}

/**
 * Link do WhatsApp pronto. O número passa pela regra única (`numeroWhatsAppBR`):
 * sem número brasileiro válido, abre o seletor de contato com a mensagem — e
 * `temNumero: false` deixa a folha dizer isso ao prestador.
 */
export function whatsappRemarcarChuva(telefone: unknown, mensagem: string): { link: string; temNumero: boolean } {
  return { link: linkApiWhatsApp(telefone, mensagem), temNumero: numeroWhatsAppBR(telefone) !== null };
}
