/**
 * AGENDA NÍVEL TOP (2.9) — regras PURAS das visões Dia/Semana/Mês, do arrastar
 * para remarcar e da edição de uma ocorrência de série.
 *
 * Só `import type` daqui para fora: o `node` dos testes (scripts/teste-agenda-top.ts)
 * apaga os tipos e roda este arquivo sem React Native.
 */
import type { Agendamento, TipoAgendamento } from '../types';
import type { AlcanceEdicaoRecorrente, MudancaOcorrencia } from './contratoRecorrente';

export type VisaoAgenda = 'dia' | 'semana' | 'mes';

// ─── Cores por técnico ────────────────────────────────────────────────────────

/**
 * Matizes bem separados entre si, legíveis como BARRA/BOLINHA sobre o fundo claro e
 * o escuro (nunca como cor de texto: texto continua com os tokens do tema).
 */
export const PALETA_TECNICOS = [
  '#34C6D9', '#F5A524', '#A78BFA', '#22C55E', '#F472B6', '#60A5FA', '#FB7185', '#2DD4BF',
] as const;

/** "Sem responsável": cinza neutro (não é de ninguém, não compete com as cores da equipe). */
export const COR_SEM_RESPONSAVEL = '#94A3B8';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Cor do técnico. Com a `ordem` da equipe (ids na ordem em que aparecem), cada
 * membro ganha uma cor DIFERENTE enquanto a equipe couber na paleta; quem não está
 * na lista (ex.: saiu da equipe) cai num matiz estável pelo id. Sem id = cinza.
 */
export function corDoTecnico(id: string | null | undefined, ordem: readonly string[] = []): string {
  if (!id) return COR_SEM_RESPONSAVEL;
  const i = ordem.indexOf(id);
  if (i >= 0) return PALETA_TECNICOS[i % PALETA_TECNICOS.length];
  return PALETA_TECNICOS[hash(id) % PALETA_TECNICOS.length];
}

// ─── Grade do dia ─────────────────────────────────────────────────────────────

/** Encaixe do arrastar: de 15 em 15 minutos. */
export const MINUTOS_SNAP = 15;
const MIN_DIA = 24 * 60;

export interface BlocoDia<T> {
  item: T;
  /** Minutos desde a meia-noite do dia (0..1440). */
  iniMin: number;
  fimMin: number;
  /** Coluna do bloco dentro do grupo de sobrepostos (0 = mais à esquerda). */
  coluna: number;
  /** Quantas colunas o grupo de sobrepostos tem. */
  colunas: number;
}

/**
 * Posição de cada compromisso COM hora na grade do dia `dia` (meia-noite local).
 * Sem fim (ou fim inválido) → duração estimada do tipo. Sobrepostos ficam lado a
 * lado (colunas), como no calendário do iPhone. Itens fora do dia são cortados nas
 * bordas; item sem início legível fica de fora (não inventa horário).
 */
export function layoutDoDia<T extends Pick<Agendamento, 'inicio' | 'fim' | 'tipo'>>(
  itens: readonly T[],
  dia: Date,
  duracaoMin: (tipo: TipoAgendamento) => number,
): BlocoDia<T>[] {
  const zero = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate()).getTime();
  const base: { item: T; iniMin: number; fimMin: number }[] = [];
  for (const item of itens) {
    const ini = new Date(item.inicio).getTime();
    if (!Number.isFinite(ini)) continue;
    const fimBruto = item.fim ? new Date(item.fim).getTime() : NaN;
    const fim = Number.isFinite(fimBruto) && fimBruto > ini ? fimBruto : ini + duracaoMin(item.tipo) * 60_000;
    const iniMin = Math.max(0, Math.round((ini - zero) / 60_000));
    const fimMin = Math.min(MIN_DIA, Math.round((fim - zero) / 60_000));
    if (fimMin <= 0 || iniMin >= MIN_DIA) continue;
    base.push({ item, iniMin, fimMin: Math.max(fimMin, iniMin + 1) });
  }
  base.sort((a, b) => a.iniMin - b.iniMin || b.fimMin - a.fimMin);

  const out: BlocoDia<T>[] = [];
  let grupo: BlocoDia<T>[] = [];
  let fimDoGrupo = -1;
  let fimPorColuna: number[] = [];
  const fecharGrupo = () => {
    const n = fimPorColuna.length;
    for (const b of grupo) b.colunas = n;
    out.push(...grupo);
    grupo = [];
    fimPorColuna = [];
  };
  for (const b of base) {
    if (grupo.length && b.iniMin >= fimDoGrupo) fecharGrupo();
    let coluna = fimPorColuna.findIndex((f) => f <= b.iniMin);
    if (coluna < 0) {
      coluna = fimPorColuna.length;
      fimPorColuna.push(b.fimMin);
    } else {
      fimPorColuna[coluna] = b.fimMin;
    }
    grupo.push({ ...b, coluna, colunas: 1 });
    fimDoGrupo = Math.max(grupo.length === 1 ? 0 : fimDoGrupo, b.fimMin);
  }
  if (grupo.length) fecharGrupo();
  return out;
}

/**
 * Horas que a grade mostra: 07h–20h por padrão (o expediente de quem atende em
 * campo), alargada para caber todo compromisso do dia e o "agora".
 */
export function faixaDeHoras(blocos: readonly Pick<BlocoDia<unknown>, 'iniMin' | 'fimMin'>[], agoraMin?: number | null): { de: number; ate: number } {
  let de = 7;
  let ate = 20;
  for (const b of blocos) {
    de = Math.min(de, Math.floor(b.iniMin / 60));
    ate = Math.max(ate, Math.ceil(b.fimMin / 60));
  }
  if (typeof agoraMin === 'number' && Number.isFinite(agoraMin)) {
    de = Math.min(de, Math.floor(agoraMin / 60));
    ate = Math.max(ate, Math.ceil(agoraMin / 60) + 1);
  }
  return { de: Math.max(0, de), ate: Math.min(24, Math.max(ate, de + 1)) };
}

/** Arredonda para o passo do encaixe (15 min). */
export function ajustarAoPasso(minutos: number, passo: number = MINUTOS_SNAP): number {
  return Math.round(minutos / passo) * passo;
}

/**
 * Novo início (minutos do dia) depois de arrastar `deltaPx` na grade: encaixe de
 * 15 min e preso ao próprio dia (o compromisso não "vaza" para o dia seguinte nem
 * começa antes da meia-noite). Só no mesmo dia: trocar de dia é pelo formulário.
 */
export function inicioArrastado(iniMin: number, deltaPx: number, pxPorHora: number, duracaoMin: number): number {
  if (!Number.isFinite(deltaPx) || pxPorHora <= 0) return iniMin;
  const bruto = iniMin + (deltaPx / pxPorHora) * 60;
  const teto = Math.max(0, MIN_DIA - Math.max(MINUTOS_SNAP, duracaoMin));
  const tetoNoPasso = teto - (teto % MINUTOS_SNAP);
  return Math.min(tetoNoPasso, Math.max(0, ajustarAoPasso(bruto)));
}

/** 'HH:mm' de minutos do dia. */
export function minutosParaHHMM(min: number): string {
  const m = Math.max(0, Math.min(MIN_DIA - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Remarcar no MESMO dia: novo início e novo fim (a duração se mantém; sem fim continua sem fim). */
export function remarcarNoDia(
  item: Pick<Agendamento, 'inicio' | 'fim'>,
  novoIniMin: number,
): { inicio: string; fim?: string } | null {
  const ini = new Date(item.inicio);
  if (!Number.isFinite(ini.getTime())) return null;
  const novo = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate(), 0, 0, 0, 0);
  novo.setMinutes(novoIniMin);
  const fimMs = item.fim ? new Date(item.fim).getTime() : NaN;
  const dur = Number.isFinite(fimMs) && fimMs > ini.getTime() ? fimMs - ini.getTime() : null;
  return {
    inicio: novo.toISOString(),
    fim: dur !== null ? new Date(novo.getTime() + dur).toISOString() : undefined,
  };
}

// ─── Editar uma ocorrência de série ──────────────────────────────────────────

/** Campos que valem para a SÉRIE (não existem por ocorrência). */
export interface CamposSerie {
  tipo?: TipoAgendamento;
  clienteId?: string | null;
  clienteNome?: string;
  endereco?: string | null;
  /**
   * Serviço externo (pega chuva). `null` = voltou para "não sei" — NUNCA vira
   * `false` ("interna"); ausente = não mudou.
   */
  externa?: boolean | null;
}

export type EstadoOcorrencia = Pick<Agendamento,
  'inicio' | 'fim' | 'status' | 'titulo' | 'observacao' | 'responsavelId' | 'responsavelNome' | 'tipo'
  | 'clienteId' | 'clienteNome' | 'endereco' | 'recorrencia' | 'recorrenciaAte' | 'externa'>;

export interface DiferencaOcorrencia {
  /** O que muda na ocorrência (vai para `editarRecorrente`). */
  mudanca: MudancaOcorrencia;
  /** Campos de série que mudaram (cliente, tipo, endereço). */
  camposSerie: CamposSerie;
  /** A REGRA da repetição mudou (frequência ou "repetir até"). */
  mudouRegra: boolean;
  /** Nada mudou. */
  vazia: boolean;
}

const ms = (iso: string | undefined | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

/** Compara a ocorrência como abriu com o que o formulário vai gravar. Puro. */
export function diferencaDaOcorrencia(original: EstadoOcorrencia, editado: EstadoOcorrencia): DiferencaOcorrencia {
  const mudanca: MudancaOcorrencia = {};
  if (ms(original.inicio) !== ms(editado.inicio)) mudanca.inicio = editado.inicio;
  if (ms(original.fim) !== ms(editado.fim)) mudanca.fim = editado.fim ?? null;
  if (original.status !== editado.status) mudanca.status = editado.status;
  if (original.titulo !== editado.titulo) mudanca.titulo = editado.titulo;
  if ((original.observacao ?? '') !== (editado.observacao ?? '')) mudanca.observacao = editado.observacao ?? '';
  if ((original.responsavelId || null) !== (editado.responsavelId || null)) {
    mudanca.responsavelId = editado.responsavelId || null;
    if (editado.responsavelId && editado.responsavelNome) mudanca.responsavelNome = editado.responsavelNome;
  }
  const camposSerie: CamposSerie = {};
  if (original.tipo !== editado.tipo) camposSerie.tipo = editado.tipo;
  if ((original.clienteId || null) !== (editado.clienteId || null) || original.clienteNome !== editado.clienteNome) {
    camposSerie.clienteId = editado.clienteId || null;
    camposSerie.clienteNome = editado.clienteNome;
  }
  if ((original.endereco || null) !== (editado.endereco || null)) camposSerie.endereco = editado.endereco || null;
  // "Externa?" é da série (como o endereço): o lugar do serviço não muda numa ocorrência só.
  if ((original.externa ?? null) !== (editado.externa ?? null)) camposSerie.externa = editado.externa ?? null;
  const mudouRegra = (original.recorrencia || null) !== (editado.recorrencia || null)
    || (original.recorrenciaAte || null) !== (editado.recorrenciaAte || null);
  const vazia = !Object.keys(mudanca).length && !Object.keys(camposSerie).length && !mudouRegra;
  return { mudanca, camposSerie, mudouRegra, vazia };
}

/**
 * Quais alcances fazem sentido para a mudança. Cliente/tipo/endereço/"externa?" não existem
 * por ocorrência (só a série os tem): "só esta" sai da lista. Mudar a REGRA da
 * repetição é da série inteira.
 */
export function alcancesPermitidos(d: Pick<DiferencaOcorrencia, 'camposSerie' | 'mudouRegra'>): AlcanceEdicaoRecorrente[] {
  if (d.mudouRegra) return ['toda_serie'];
  if (Object.keys(d.camposSerie).length) return ['esta_e_proximas', 'toda_serie'];
  return ['so_esta', 'esta_e_proximas', 'toda_serie'];
}

/** Aplica os campos de série a uma linha (série nova ou base). Puro. */
export function aplicarCamposSerie<T extends Pick<Agendamento, 'tipo' | 'clienteId' | 'clienteNome' | 'endereco' | 'externa'>>(a: T, c: CamposSerie): T {
  const b = { ...a };
  if (c.tipo) b.tipo = c.tipo;
  if (c.clienteId !== undefined) b.clienteId = c.clienteId || undefined;
  if (c.clienteNome !== undefined) b.clienteNome = c.clienteNome;
  if (c.endereco !== undefined) b.endereco = c.endereco || undefined;
  // `null` = "não sei": a chave fica, com `undefined` (o save grava NULL, não mantém o antigo).
  if (c.externa !== undefined) b.externa = c.externa === null ? undefined : c.externa;
  return b;
}

/** Mudanças de SÉRIE que acompanham a edição de uma ocorrência. */
export interface ExtrasEdicaoSerie {
  camposSerie?: CamposSerie;
  /** Nova regra da repetição (só com "toda a série"). `recorrencia` ausente = deixa de repetir. */
  regra?: Pick<Agendamento, 'recorrencia' | 'recorrenciaAte'>;
}

/**
 * Leva cliente/tipo/endereço (e a regra) para a linha certa do plano de
 * `planejarEdicaoRecorrente`: a série NOVA em "esta e as próximas", a base em
 * "toda a série" (ou quando a ocorrência editada é a 1ª). LANÇA quando o pedido não
 * cabe no alcance ("só esta" não tem cliente próprio): nada é gravado pela metade.
 */
export function aplicarExtrasAoPlano<P extends { base: Agendamento; novaSerie?: Agendamento }>(
  plano: P,
  alcance: AlcanceEdicaoRecorrente,
  extras: ExtrasEdicaoSerie | undefined,
): P {
  const campos = extras?.camposSerie && Object.keys(extras.camposSerie).length ? extras.camposSerie : null;
  const regra = extras?.regra ?? null;
  if (!campos && !regra) return plano;
  if (alcance === 'so_esta') throw new Error('Cliente, tipo, endereço e repetição valem para a série: escolha "esta e as próximas" ou "toda a série".');
  if (regra && alcance !== 'toda_serie') throw new Error('Mudar a repetição vale para a série inteira.');
  const out = { ...plano };
  if (plano.novaSerie) {
    out.novaSerie = campos ? aplicarCamposSerie(plano.novaSerie, campos) : plano.novaSerie;
    return out;
  }
  let b = campos ? aplicarCamposSerie(plano.base, campos) : plano.base;
  if (regra) {
    b = { ...b, recorrencia: regra.recorrencia, recorrenciaAte: regra.recorrencia ? regra.recorrenciaAte : undefined };
    if (!regra.recorrencia) b.excecoes = undefined;
  }
  out.base = b;
  return out;
}

// ─── Atualizar da nuvem (puxar para atualizar) ───────────────────────────────

export type ResultadoAtualizacao = 'ok' | 'falhou' | 'demorou';

export interface DepsAtualizacao {
  /** O sync que já está rodando (o do boot, por exemplo), ou null. */
  emVoo: () => Promise<void> | null;
  /** Dispara um sync novo (pull + push). Não lança. */
  sincronizar: () => Promise<void>;
  /** Resultado do último pull ({ em, falhas, abortado }) ou null. */
  ultimoPull: () => { em: string; falhas: string[]; abortado: boolean } | null;
  tetoMs: number;
  agora: () => number;
  esperar: (ms: number) => Promise<void>;
}

/** Etapas do pull cuja falha significa "a agenda não veio da nuvem". */
const FALHAS_QUE_IMPORTAM = ['sessao', 'exclusoes', 'agendamentos', 'inesperado'];

/**
 * Puxar para atualizar: ESPERA o sync que já estiver rodando e então roda um NOVO
 * (o que estava em voo pode ter feito o pull antes da visita nova existir — era por
 * isso que a visita recém-atribuída só aparecia reabrindo o app). Responde em 3
 * estados honestos: veio da nuvem, não veio (o que está na tela é o do aparelho), ou
 * passou do teto (segue em segundo plano; a tela recarrega sozinha ao terminar).
 */
export async function atualizarDaNuvem(d: DepsAtualizacao): Promise<ResultadoAtualizacao> {
  const desde = d.agora();
  const trabalho = (async () => {
    const voo = d.emVoo();
    if (voo) {
      try { await voo; } catch { /* o sync em voo nunca deveria lançar */ }
    }
    try { await d.sincronizar(); } catch { /* idem */ }
    // Outro sync entrou no meio (ex.: o app voltou do fundo) e a trava de
    // reentrância devolveu na hora: espera ESSE terminar antes de ler o resultado,
    // senão o pull dele ainda não aconteceu e a resposta seria "falhou" sem motivo.
    const outro = d.emVoo();
    if (outro && outro !== voo) {
      try { await outro; } catch { /* idem */ }
    }
    return 'feito' as const;
  })();
  const venceu = await Promise.race([trabalho, d.esperar(d.tetoMs).then(() => 'teto' as const)]);
  if (venceu === 'teto') return 'demorou';
  const p = d.ultimoPull();
  const em = p ? new Date(p.em).getTime() : NaN;
  if (!p || p.abortado || !Number.isFinite(em) || em < desde) return 'falhou';
  return p.falhas.some((f) => FALHAS_QUE_IMPORTAM.includes(f)) ? 'falhou' : 'ok';
}
