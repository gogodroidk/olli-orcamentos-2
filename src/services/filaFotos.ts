/**
 * Fila de envio das fotos da OS — a regra pura (sem RN, sem rede, sem disco).
 *
 *     testada por: node scripts/teste-confianca-offline.ts
 *
 * A FOTO NASCE NO APARELHO. Toda foto de OS é comprimida e copiada para a pasta
 * permanente do app (`utils/fotosOrcamento.ts`) ANTES de qualquer tentativa de
 * subir. Sem sinal, ela continua lá, inteira. Esta fila só registra o que ainda
 * falta mandar para a nuvem (bucket privado `olli-fotos`) e o que já foi.
 *
 * O SELO DE CADA FOTO sai daqui, e só daqui:
 *   no_aparelho → está salva neste celular e ainda não subiu;
 *   enviada     → a cópia está na nuvem (o upload respondeu OK);
 *   recusada    → a nuvem recusou o arquivo (tipo/tamanho). Continua no aparelho;
 *   ausente     → o arquivo não está neste celular (foi tirada em outro aparelho,
 *                 ou o sistema apagou). Não conta como pendência: não há o que subir.
 *
 * ERRO NUNCA VIRA VAZIO. Se a fila salva estiver corrompida, `lerFila` devolve
 * `ok: false` — a tela mostra "não consegui conferir", nunca "tudo enviado".
 */

export type EstadoFoto = 'no_aparelho' | 'enviada' | 'recusada' | 'ausente';

export interface RegistroFoto {
  uri: string;
  ordemId: string;
  registradaEm: number;
  estado: EstadoFoto;
  tentativas: number;
  ultimaTentativaEm?: number;
  ultimoMotivo?: string;
  enviadaEm?: number;
  /** Chave no storage da nuvem (`olli-fotos/<tenant>/foto_servico/<uuid>.jpg`). */
  chave?: string;
}

export interface Fila {
  v: 1;
  fotos: RegistroFoto[];
}

export const FILA_VAZIA: Fila = { v: 1, fotos: [] };

/** Prazo a partir do qual uma foto parada vira alerta com [Tentar agora]. */
export const ATRASO_ALERTA_MS = 24 * 60 * 60 * 1000;

/** Quantas fotos já enviadas guardamos para o selo (as mais recentes). */
export const MAX_ENVIADAS_GUARDADAS = 500;

/** Espera mínima entre tentativas automáticas de UMA foto (cresce até o teto). */
const ESPERA_BASE_MS = 30 * 1000;
const ESPERA_TETO_MS = 30 * 60 * 1000;

const ESTADOS: ReadonlySet<string> = new Set(['no_aparelho', 'enviada', 'recusada', 'ausente']);

export type LeituraFila = { ok: true; fila: Fila } | { ok: false };

/** Texto salvo → fila. Ausente = fila vazia (de verdade). Corrompido = erro. */
export function lerFila(bruto: string | null | undefined): LeituraFila {
  if (bruto === null || bruto === undefined || bruto === '') return { ok: true, fila: { v: 1, fotos: [] } };
  try {
    const f = JSON.parse(bruto) as Partial<Fila>;
    if (f?.v !== 1 || !Array.isArray(f.fotos)) return { ok: false };
    const fotos = f.fotos.filter((r): r is RegistroFoto =>
      !!r && typeof r.uri === 'string' && typeof r.ordemId === 'string'
      && typeof r.registradaEm === 'number' && ESTADOS.has(r.estado as string)
      && typeof r.tentativas === 'number');
    return { ok: true, fila: { v: 1, fotos } };
  } catch {
    return { ok: false };
  }
}

export function serializarFila(fila: Fila): string {
  return JSON.stringify(podar(fila));
}

/** Mantém todas as não enviadas e só as N enviadas mais recentes. */
export function podar(fila: Fila): Fila {
  const enviadas = fila.fotos.filter((f) => f.estado === 'enviada');
  if (enviadas.length <= MAX_ENVIADAS_GUARDADAS) return fila;
  const manter = new Set(
    enviadas
      .sort((a, b) => (b.enviadaEm ?? 0) - (a.enviadaEm ?? 0))
      .slice(0, MAX_ENVIADAS_GUARDADAS)
      .map((f) => f.uri),
  );
  return { v: 1, fotos: fila.fotos.filter((f) => f.estado !== 'enviada' || manter.has(f.uri)) };
}

/** Só fotos locais (arquivo do aparelho) entram na fila. */
export function ehFotoLocal(uri: string): boolean {
  return typeof uri === 'string' && uri.startsWith('file:');
}

/** Registra uma foto nova (idempotente pela URI). */
export function registrar(fila: Fila, ordemId: string, uri: string, agora: number): Fila {
  if (!ehFotoLocal(uri) || fila.fotos.some((f) => f.uri === uri)) return fila;
  return {
    v: 1,
    fotos: [...fila.fotos, { uri, ordemId, registradaEm: agora, estado: 'no_aparelho', tentativas: 0 }],
  };
}

function trocar(fila: Fila, uri: string, f: (r: RegistroFoto) => RegistroFoto): Fila {
  return { v: 1, fotos: fila.fotos.map((r) => (r.uri === uri ? f(r) : r)) };
}

export function marcarEnviada(fila: Fila, uri: string, chave: string, agora: number): Fila {
  return trocar(fila, uri, (r) => ({
    ...r, estado: 'enviada', chave, enviadaEm: agora, ultimaTentativaEm: agora,
    tentativas: r.tentativas + 1, ultimoMotivo: undefined,
  }));
}

/** Falha de envio. `invalido` = a nuvem recusou o arquivo: não adianta insistir sozinho. */
export function marcarFalha(fila: Fila, uri: string, motivo: string, agora: number): Fila {
  return trocar(fila, uri, (r) => ({
    ...r,
    estado: motivo === 'invalido' ? 'recusada' : 'no_aparelho',
    tentativas: r.tentativas + 1,
    ultimaTentativaEm: agora,
    ultimoMotivo: motivo,
  }));
}

export function marcarAusente(fila: Fila, uri: string, agora: number): Fila {
  return trocar(fila, uri, (r) => ({ ...r, estado: 'ausente', ultimaTentativaEm: agora }));
}

/** Espera antes da próxima tentativa automática (30 s, 1 min, 2 min… até 30 min). */
export function esperaParaTentar(tentativas: number): number {
  if (tentativas <= 0) return 0;
  return Math.min(ESPERA_BASE_MS * 2 ** (tentativas - 1), ESPERA_TETO_MS);
}

/**
 * O que tentar agora. Automático respeita a espera crescente; `forcar` (o
 * botão [Tentar agora]) tenta tudo que está no aparelho, inclusive as recusadas.
 */
export function elegiveis(fila: Fila, agora: number, forcar = false): RegistroFoto[] {
  return fila.fotos
    .filter((r) => {
      if (r.estado === 'no_aparelho') {
        if (forcar || r.ultimaTentativaEm === undefined) return true;
        return agora - r.ultimaTentativaEm >= esperaParaTentar(r.tentativas);
      }
      return forcar && r.estado === 'recusada';
    })
    .sort((a, b) => a.registradaEm - b.registradaEm);
}

export interface ResumoPendencias {
  /** Fotos no aparelho esperando subir. */
  aguardando: number;
  /** Fotos que a nuvem recusou (continuam no aparelho). */
  recusadas: number;
  /** Desde quando a pendência mais antiga espera (ms epoch), se houver. */
  maisAntigaDesde?: number;
  /** Alguma pendência passou de 24h? Dispara o alerta com [Tentar agora]. */
  atrasada: boolean;
}

export function resumir(fila: Fila, agora: number): ResumoPendencias {
  let aguardando = 0;
  let recusadas = 0;
  let maisAntiga: number | undefined;
  for (const r of fila.fotos) {
    if (r.estado !== 'no_aparelho' && r.estado !== 'recusada') continue;
    if (r.estado === 'no_aparelho') aguardando += 1;
    else recusadas += 1;
    if (maisAntiga === undefined || r.registradaEm < maisAntiga) maisAntiga = r.registradaEm;
  }
  return {
    aguardando,
    recusadas,
    maisAntigaDesde: maisAntiga,
    atrasada: maisAntiga !== undefined && agora - maisAntiga >= ATRASO_ALERTA_MS,
  };
}

/** Estado de UMA foto para o selo. Sem registro = foto local que nunca entrou na fila. */
export function estadoDaFoto(fila: Fila, uri: string): EstadoFoto | 'sem_registro' {
  return fila.fotos.find((f) => f.uri === uri)?.estado ?? 'sem_registro';
}

// ─── Motor (IO injetado) ───────────────────────────────────────────────────

export type ResultadoEnvio = { ok: true; chave: string } | { ok: false; motivo: string };

export interface DependenciasFila {
  ler: () => Promise<string | null>;
  gravar: (texto: string) => Promise<void>;
  /** Sobe o arquivo. Nunca deve lançar; se lançar, conta como falha 'desconhecido'. */
  enviar: (registro: RegistroFoto) => Promise<ResultadoEnvio>;
  existe: (uri: string) => Promise<boolean>;
  agora: () => number;
}

export interface ResultadoProcessamento {
  enviadas: number;
  falhas: number;
  ausentes: number;
  /** A fila salva não pôde ser lida: nada foi tentado (e nada foi apagado). */
  erroLeitura: boolean;
}

/**
 * `sem_conta` = ninguém conectado neste aparelho: não há para onde subir, então a
 * tela diz "só neste celular" em vez de prometer "sobe quando a internet voltar".
 */
export type LeituraResumo =
  | { status: 'ok'; resumo: ResumoPendencias }
  | { status: 'indisponivel' }
  | { status: 'sem_conta' };

export interface MotorFila {
  registrar: (ordemId: string, uri: string) => Promise<void>;
  processar: (opcoes?: { forcar?: boolean }) => Promise<ResultadoProcessamento>;
  resumo: () => Promise<LeituraResumo>;
  estados: (uris: string[]) => Promise<Record<string, EstadoFoto | 'sem_registro'> | null>;
  ouvir: (fn: (leitura: LeituraResumo) => void) => () => void;
}

/**
 * Motor da fila: serializa TODA mutação numa corrente de promessas (registrar
 * uma foto no meio de um envio não pode apagar o registro do outro), sobe uma
 * foto por vez e para na primeira falha de rede (a próxima também falharia).
 */
export function criarMotorFila(deps: DependenciasFila): MotorFila {
  let corrente: Promise<unknown> = Promise.resolve();
  let processando: Promise<ResultadoProcessamento> | null = null;
  const ouvintes = new Set<(l: LeituraResumo) => void>();

  function emSerie<T>(tarefa: () => Promise<T>): Promise<T> {
    const proxima = corrente.then(tarefa, tarefa);
    corrente = proxima.catch(() => undefined);
    return proxima;
  }

  async function lerAtual(): Promise<LeituraFila> {
    try {
      return lerFila(await deps.ler());
    } catch {
      return { ok: false };
    }
  }

  function avisar(leitura: LeituraResumo): void {
    for (const fn of ouvintes) {
      try {
        fn(leitura);
      } catch {
        // um ouvinte quebrado não derruba os outros
      }
    }
  }

  async function lerResumo(): Promise<LeituraResumo> {
    const l = await lerAtual();
    return l.ok ? { status: 'ok', resumo: resumir(l.fila, deps.agora()) } : { status: 'indisponivel' };
  }

  /** Aplica `f` sobre a fila salva. Fila ilegível: NÃO sobrescreve (não apaga pendência). */
  function mutar(f: (fila: Fila) => Fila): Promise<boolean> {
    return emSerie(async () => {
      const l = await lerAtual();
      if (!l.ok) return false;
      const nova = f(l.fila);
      if (nova !== l.fila) await deps.gravar(serializarFila(nova));
      return true;
    });
  }

  async function processarUmaVez(forcar: boolean): Promise<ResultadoProcessamento> {
    const r: ResultadoProcessamento = { enviadas: 0, falhas: 0, ausentes: 0, erroLeitura: false };
    const l = await emSerie(lerAtual);
    if (!l.ok) {
      r.erroLeitura = true;
      return r;
    }
    for (const reg of elegiveis(l.fila, deps.agora(), forcar)) {
      let existe = true;
      try {
        existe = await deps.existe(reg.uri);
      } catch {
        existe = true; // na dúvida, tenta subir; o envio dirá
      }
      if (!existe) {
        await mutar((f) => marcarAusente(f, reg.uri, deps.agora())).catch(() => false);
        r.ausentes += 1;
        continue;
      }
      let res: ResultadoEnvio;
      try {
        res = await deps.enviar(reg);
      } catch {
        res = { ok: false, motivo: 'desconhecido' };
      }
      if (res.ok) {
        await mutar((f) => marcarEnviada(f, reg.uri, res.chave, deps.agora())).catch(() => false);
        r.enviadas += 1;
        continue;
      }
      const motivo = res.motivo;
      await mutar((f) => marcarFalha(f, reg.uri, motivo, deps.agora())).catch(() => false);
      r.falhas += 1;
      // Recusa é do ARQUIVO; o resto (rede, sessão, servidor) vale para todos.
      if (motivo !== 'invalido') break;
    }
    return r;
  }

  return {
    async registrar(ordemId, uri) {
      await mutar((f) => registrar(f, ordemId, uri, deps.agora())).catch(() => false);
      avisar(await lerResumo());
    },
    async processar(opcoes) {
      // Um envio por vez: o segundo pedido espera o primeiro e reaproveita.
      if (processando) return processando;
      processando = processarUmaVez(!!opcoes?.forcar);
      try {
        return await processando;
      } finally {
        processando = null;
        avisar(await lerResumo());
      }
    },
    resumo: lerResumo,
    async estados(uris) {
      const l = await lerAtual();
      if (!l.ok) return null;
      const out: Record<string, EstadoFoto | 'sem_registro'> = {};
      for (const u of uris) out[u] = estadoDaFoto(l.fila, u);
      return out;
    },
    ouvir(fn) {
      ouvintes.add(fn);
      return () => {
        ouvintes.delete(fn);
      };
    },
  };
}
