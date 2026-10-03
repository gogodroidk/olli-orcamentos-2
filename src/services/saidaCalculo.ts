/**
 * "A que horas eu preciso SAIR" — o MIOLO PURO, agora 100% GRÁTIS (Onda I2).
 *
 * Até 30/09/2026 o número vinha da Routes API do Google (via worker). O billing do
 * Google foi desligado e o dono proibiu pagar: a hora de sair passa a ser uma
 * ESTIMATIVA feita no aparelho (`etaEstimado.ts`), a partir das coordenadas que
 * o app já tem — `clientes.lat/lon` (BrasilAPI/Nominatim) e a base da empresa
 * localizada uma vez pelo mesmo serviço grátis (`baseSaida.ts`).
 *
 * Este arquivo só importa módulos PUROS (`etaEstimado.ts`, `utils/geoCliente.ts`):
 * o `node` roda direto em `scripts/teste-eta-saida-app.ts`, que prova o
 * comportamento real, não a presença de um trecho no fonte.
 *
 * ─── A REGRA DURA ──────────────────────────────────────────────────────────
 * Todo `estado:'ok'` daqui é ESTIMATIVA SEM TRÂNSITO e a frase diz isso
 * (`ROTULO_ESTIMATIVA`). Nunca "com trânsito", nunca "trânsito ok". Para compensar
 * a incerteza, a folga é maior (max(8 min, 20%)) e a janela avisada ao cliente é
 * mais larga. E não existe número sem coordenada: "não sei onde fica" é
 * `endereco_insuficiente`, nunca um "~10 min, pertinho".
 *
 * ─── TRÊS ESTADOS, sempre (regra da casa `olli-gate-erro-vira-vazio`) ───────
 *   { estado: 'ok', ... }                              → estimativa, com rótulo
 *   { estado: 'indisponivel', erro }                   → "não deu para estimar"
 *   { estado: 'endereco_insuficiente', qual }          → "falta o local no mapa". Ação: corrigir.
 * Os dois estados de falha levam a ações diferentes e nunca são achatados.
 */
import type { Agendamento, Cliente, Empresa } from '../types';
import { coordenadaValida, lerGeoPrecisao, textoComparavel, logradouroDoEndereco, type GeoPrecisao } from '../utils/geoCliente.ts';
import {
  ROTULO_ESTIMATIVA,
  estimarParaChegar,
  estimarViagem,
  folgaEstimativaMin,
  type Ponto,
} from './etaEstimado.ts';

// ─── Tipos ─────────────────────────────────────────────────────────────────

/** Um ponto do mapa com a precisão de onde ele veio (a tela usa para dizer "aproximado"). */
export interface PontoVisita extends Ponto {
  precisao: GeoPrecisao;
}

export interface SaidaOk {
  estado: 'ok';
  /** Duração estimada da viagem, em minutos (>= 5). */
  minutos: number;
  /** Km de rua estimados. */
  distanciaKm: number;
  /** A resposta à pergunta do dono: a que horas sair. */
  sairEm: Date;
  chegarEm: Date;
  /** Se sair AGORA, chega por volta desta hora. É o que salva o caso `atrasado`. */
  sairAgoraChegaEm: Date;
  folgaMin: number;
  /** `true` = a hora de sair já passou. Sucesso com uma verdade desconfortável, não um 4º estado. */
  atrasado: boolean;
  /** Sempre `true`: o número é estimado no aparelho, sem trânsito. A UI PRECISA dizer. */
  estimado: true;
  /** De onde ele sai: a visita anterior ou a base da empresa. */
  origemDe: 'visita_anterior' | 'base';
  /** Algum dos dois pontos é aproximado (CEP/bairro): a frase ganha "aproximado". */
  aproximado: boolean;
  calculadoEm: Date;
}

export type ResultadoSaida =
  | SaidaOk
  | { estado: 'indisponivel'; erro: string }
  | { estado: 'endereco_insuficiente'; qual: 'origem' | 'destino' | 'ambos' };

/** De onde o prestador sai. `de` existe para a UI poder dizer a premissa em voz alta. */
export interface OrigemVisita {
  ponto: PontoVisita;
  de: 'visita_anterior' | 'base';
}

// ─── Constantes de política ────────────────────────────────────────────────

/** Agenda de prestador é de dias, não de meses. Além disso a estimativa não vale nada. */
export const MAX_HORIZONTE_MS = 14 * 24 * 3600 * 1000;

/** Endereço com menos que isso não é endereço; é ruído. */
export const MIN_ENDERECO = 5;

/** Precisões que servem para hora de sair. "Cidade" erra por quilômetros: não serve. */
const PRECISOES_PARA_ETA: ReadonlySet<GeoPrecisao> = new Set<GeoPrecisao>(['numero', 'rua', 'cep', 'bairro']);
const PRECISOES_APROXIMADAS: ReadonlySet<GeoPrecisao> = new Set<GeoPrecisao>(['cep', 'bairro']);

// ─── Texto ─────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `14:23` no fuso do aparelho. Mesmo formato que a agenda já usa (`agenda.ts` → `horaTxt`). */
export function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ─── Endereço (texto) — continua servindo o link do Maps e a localização da base ──

/**
 * Endereço da EMPRESA como texto. Exige RUA: cidade/UF sozinhas viram o centro do
 * município, um ponto que existe e está a quilômetros de onde o prestador sai.
 */
export function enderecoDaEmpresa(e: Empresa | null | undefined): string | null {
  const rua = (e?.endereco ?? '').trim();
  if (rua.length < MIN_ENDERECO) return null;
  const cidade = (e?.cidade ?? '').trim();
  const uf = (e?.estado ?? '').trim();
  const local = cidade && uf ? `${cidade}/${uf}` : cidade || uf;
  return local ? `${rua}, ${local}` : rua;
}

/** Endereço do CLIENTE como texto (CEP no meio quando existe; complemento fora). */
export function enderecoDoCliente(c: Cliente | null | undefined): string | null {
  const rua = (c?.endereco ?? '').trim();
  if (rua.length < MIN_ENDERECO) return null;
  const partes: string[] = [rua];
  const cepDigitos = (c?.cep ?? '').replace(/\D/g, '');
  if (cepDigitos.length === 8) partes.push(`${cepDigitos.slice(0, 5)}-${cepDigitos.slice(5)}`);
  const cidade = (c?.cidade ?? '').trim();
  const uf = (c?.estado ?? '').trim();
  const local = cidade && uf ? `${cidade}/${uf}` : cidade || uf;
  if (local) partes.push(local);
  return partes.join(', ');
}

/** Endereço de destino de um agendamento (texto): o próprio e, vazio, o do cliente. */
export function enderecoDoAgendamento(
  a: Agendamento | null | undefined,
  clientes: readonly Cliente[] = [],
): string | null {
  const proprio = (a?.endereco ?? '').trim();
  if (proprio.length >= MIN_ENDERECO) return proprio;
  if (!a?.clienteId) return null;
  const c = clientes.find((x) => x.id === a.clienteId);
  return enderecoDoCliente(c);
}

// ─── Pontos no mapa ────────────────────────────────────────────────────────

/** O ponto salvo do cliente, se ele presta para ETA. */
export function pontoDoCliente(c: Cliente | null | undefined): PontoVisita | null {
  if (!c) return null;
  const coord = coordenadaValida(c.lat, c.lon);
  const precisao = lerGeoPrecisao(c.geoPrecisao);
  if (!coord || !precisao || !PRECISOES_PARA_ETA.has(precisao)) return null;
  return { lat: coord.lat, lon: coord.lon, precisao };
}

/**
 * O ponto de um agendamento = o ponto do cliente dele. COM UMA RESSALVA que evita
 * o erro mais sorrateiro desta feature: quando a visita tem um endereço PRÓPRIO
 * diferente do cadastro (a obra é em outro lugar), o ponto do cliente é de OUTRO
 * lugar — e uma hora de sair calculada para lá teria cara de certa. Nesse caso,
 * `null` ("sem local no mapa"), nunca o ponto errado.
 */
export function pontoDoAgendamento(
  a: Pick<Agendamento, 'clienteId' | 'endereco'> | null | undefined,
  clientes: readonly Cliente[] = [],
): PontoVisita | null {
  if (!a?.clienteId) return null;
  const c = clientes.find((x) => x.id === a.clienteId);
  const ponto = pontoDoCliente(c);
  if (!ponto) return null;
  const proprio = textoComparavel(a.endereco);
  if (proprio.length >= MIN_ENDERECO) {
    const ruaCliente = textoComparavel(logradouroDoEndereco(c?.endereco));
    const ruaVisita = textoComparavel(logradouroDoEndereco(a.endereco));
    // Os DOIS logradouros precisam existir: uma rua vazia está "contida" em
    // qualquer outra, e a visita "', Centro'" viraria o ponto do cadastro.
    const mesmoLugar = ruaCliente.length >= 3 && ruaVisita.length >= 3
      && (ruaVisita.includes(ruaCliente) || ruaCliente.includes(ruaVisita));
    if (!mesmoLugar) return null;
  }
  return ponto;
}

/**
 * DE ONDE o prestador sai para a visita `alvo` — sem GPS: a visita ANTERIOR do
 * mesmo dia ou, se `alvo` é a primeira, a BASE da empresa (localizada uma vez).
 *
 * Quando existe visita anterior mas ela não tem ponto, a resposta é `null` — NÃO
 * cai para a base. Cair seria estimar a partir de um lugar de onde ele
 * comprovadamente não vai sair, com a mesma cara de certeza da hora certa.
 */
export function origemParaVisita(
  alvo: Agendamento | null | undefined,
  doDia: readonly Agendamento[],
  base: PontoVisita | null | undefined,
  clientes: readonly Cliente[] = [],
): OrigemVisita | null {
  if (!alvo) return null;
  const iniAlvo = Date.parse(alvo.inicio);
  if (!Number.isFinite(iniAlvo)) return null;

  let anterior: Agendamento | null = null;
  let iniAnterior = -Infinity;
  for (const a of doDia) {
    if (a.id === alvo.id || a.status === 'cancelado' || a.excluidoEm) continue;
    const ini = Date.parse(a.inicio);
    if (!Number.isFinite(ini) || ini >= iniAlvo) continue;
    if (ini > iniAnterior) {
      anterior = a;
      iniAnterior = ini;
    }
  }

  if (anterior) {
    const ponto = pontoDoAgendamento(anterior, clientes);
    return ponto ? { ponto, de: 'visita_anterior' } : null;
  }
  return base && coordenadaValida(base.lat, base.lon) ? { ponto: base, de: 'base' } : null;
}

// ─── A conta ───────────────────────────────────────────────────────────────

export interface EntradaSaida {
  origem: OrigemVisita | null;
  destino: PontoVisita | null;
  chegarEm: Date;
  agora: Date;
}

/**
 * A hora de sair, estimada. NUNCA lança — sempre um dos 3 estados. Tudo que
 * depende de "agora" (`sairAgoraChegaEm`, `atrasado`) é calculado agora.
 */
export function estimarSaida(e: EntradaSaida): ResultadoSaida {
  try {
    if (!e.origem && !e.destino) return { estado: 'endereco_insuficiente', qual: 'ambos' };
    if (!e.origem) return { estado: 'endereco_insuficiente', qual: 'origem' };
    if (!e.destino) return { estado: 'endereco_insuficiente', qual: 'destino' };

    const chegarMs = e.chegarEm?.getTime?.();
    const agoraMs = e.agora?.getTime?.();
    if (!Number.isFinite(chegarMs) || !Number.isFinite(agoraMs)) return { estado: 'indisponivel', erro: 'horario_invalido' };
    if (chegarMs <= agoraMs) return { estado: 'indisponivel', erro: 'chegar_em_passado' };
    if (chegarMs - agoraMs > MAX_HORIZONTE_MS) return { estado: 'indisponivel', erro: 'chegar_em_distante' };

    const est = estimarParaChegar(e.origem.ponto, e.destino, chegarMs);
    // Ponto inválido ou distância implausível (> 600 km entre visitas do mesmo
    // dia): é endereço errado, não viagem. O prestador conserta; nós não chutamos.
    if (!est) return { estado: 'endereco_insuficiente', qual: 'ambos' };
    const agoraEst = estimarViagem(e.origem.ponto, e.destino, agoraMs) ?? est;

    const folgaMin = folgaEstimativaMin(est.minutos);
    const sairEmMs = chegarMs - (est.minutos + folgaMin) * 60_000;
    return {
      estado: 'ok',
      minutos: est.minutos,
      distanciaKm: est.distanciaKm,
      sairEm: new Date(sairEmMs),
      chegarEm: new Date(chegarMs),
      sairAgoraChegaEm: new Date(agoraMs + agoraEst.minutos * 60_000),
      folgaMin,
      atrasado: sairEmMs < agoraMs,
      estimado: true,
      origemDe: e.origem.de,
      aproximado: PRECISOES_APROXIMADAS.has(e.origem.ponto.precisao) || PRECISOES_APROXIMADAS.has(e.destino.precisao),
      calculadoEm: new Date(agoraMs),
    };
  } catch {
    return { estado: 'indisponivel', erro: 'calculo' };
  }
}

// ─── Copy (derivada da fonte, nunca de memória) ────────────────────────────

/** O rótulo de TODO número: estimativa, sem trânsito (e "local aproximado" quando é). */
export function rotuloEstimativa(r: Pick<SaidaOk, 'aproximado'>): string {
  return r.aproximado ? `${ROTULO_ESTIMATIVA}, local aproximado` : ROTULO_ESTIMATIVA;
}

/**
 * A frase que o dono pediu, em uma linha: "Saia às 14:23 para chegar às 15:00 ·
 * ~32 min (estimativa, sem trânsito)". Atrasado muda de tempo verbal e ganha a
 * chegada se sair agora — a informação acionável nesse momento.
 */
export function fraseSaida(r: SaidaOk, _agora?: Date): string {
  if (r.atrasado) {
    return `Era para sair às ${hhmm(r.sairEm)} · saindo agora chega por volta de ${hhmm(r.sairAgoraChegaEm)} (${rotuloEstimativa(r)})`;
  }
  return `Saia às ${hhmm(r.sairEm)} para chegar às ${hhmm(r.chegarEm)} · ~${r.minutos} min (${rotuloEstimativa(r)})`;
}

/** Texto da notificação "hora de sair". Só existe com `estado:'ok'`. */
export function textoNotificacaoSaida(
  r: SaidaOk,
  a: Pick<Agendamento, 'clienteNome' | 'titulo'>,
  _agora?: Date,
): { titulo: string; corpo: string } {
  const quem = (a.clienteNome || a.titulo || '').trim();
  const pedacos = [
    quem ? `${quem} às ${hhmm(r.chegarEm)}` : `Chegada às ${hhmm(r.chegarEm)}`,
    `~${r.minutos} min, ${rotuloEstimativa(r)}`,
  ];
  return { titulo: `Saia às ${hhmm(r.sairEm)}`, corpo: pedacos.join(' · ') };
}

/**
 * A linha que o "Bom dia da OLLI" ganha. `null` quando não há número — e aí o
 * "Bom dia" sai EXATAMENTE como já saía. Falha de estimativa nunca piora uma
 * notificação que já funciona.
 */
export function linhaBomDiaSaida(r: ResultadoSaida | null, _agora?: Date): string | null {
  if (!r || r.estado !== 'ok' || r.atrasado) return null;
  return `saia às ${hhmm(r.sairEm)} (~${r.minutos} min, ${rotuloEstimativa(r)})`;
}

/**
 * O que a tela diz quando não deu para estimar (horário ilegível, visita já
 * começou). Duas versões porque, assim que uma estimativa dá certo, o aviso
 * calculado SUBSTITUI o lembrete fixo de 1h — dizer que ele "vale" seria apontar
 * para um lembrete que não existe mais.
 */
export function textoIndisponivel(avisoAgendado: boolean): string {
  return avisoAgendado
    ? 'Não deu para estimar agora. Vale o horário calculado antes.'
    : 'Não deu para estimar a hora de sair. Vale o lembrete de 1h antes.';
}

/** Dizer QUAL local falta é o ponto inteiro: senão ele conserta o que estava certo. */
export function textoEnderecoInsuficiente(qual: 'origem' | 'destino' | 'ambos'): string {
  if (qual === 'destino') return 'Esta visita ainda não tem local no mapa. Confira o CEP e o endereço do cliente.';
  if (qual === 'origem') {
    return 'Não sei de onde você sai: a visita anterior está sem local no mapa, ou falta o endereço da empresa em Meu negócio.';
  }
  return 'Faltam os locais de saída e de chegada no mapa. Confira o CEP do cliente e o endereço da empresa.';
}

/**
 * JANELA de chegada para avisar o CLIENTE: "chego entre 14:45 e 15:15". Com
 * estimativa sem trânsito, a janela é mais larga do que era com a Routes API:
 * meia-largura de 20% da viagem, piso de 10 e teto de 30 min.
 */
export function janelaChegada(chegada: Date, minutos: number): { de: Date; ate: Date } | null {
  const m = typeof minutos === 'number' && Number.isFinite(minutos) ? minutos : null;
  const base = chegada?.getTime?.();
  if (m === null || m <= 0 || !Number.isFinite(base)) return null;
  const meia = Math.min(30, Math.max(10, Math.round(m * 0.2)));
  return { de: new Date(base - meia * 60_000), ate: new Date(base + meia * 60_000) };
}
