import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  completouTrintaDias,
  diaLocal,
  escolherDica,
  estadoDeJson,
  estadoInicial,
  marcarApresentada,
  registrarEvento,
  registrarPrimeiroUso,
  type Escolha,
  type EstadoRoteiro,
  type EventoDica,
  type LocalDica,
} from './dicasRoteiro';
import { ROTEIRO_DICAS } from './dicasRoteiro';
import { desligarAjuda, estaAtiva, dicaFoiVista, marcarDicaVista } from './onboarding';
import { track, Eventos } from './analytics';

/**
 * dicasRoteiroStore.ts — onde o roteiro de dicas (dicasRoteiro.ts) mora no aparelho.
 *
 * Como as outras preferências de ajuda (`services/onboarding.ts`), é estado do
 * APARELHO, não da conta: sobrevive à troca de conta e não sobe para a nuvem.
 * Nenhum dado de cliente entra aqui — só ids de evento e datas.
 *
 * Tudo é best-effort: falha de leitura/escrita nunca quebra a tela; no pior caso
 * a dica não aparece (é ajuda, não dado).
 *
 * Quem registra um evento avisa os ouvintes: a `<DicaDoRoteiro>` já montada na
 * mesma tela reavalia na hora (ex.: o cliente abriu o link e o detalhe recarregou).
 */

const ROTEIRO_KEY = 'olli.ajuda.roteiro';

let cache: EstadoRoteiro | null = null;
let fila: Promise<unknown> = Promise.resolve();
const ouvintes = new Set<() => void>();

async function ler(): Promise<EstadoRoteiro> {
  if (cache) return cache;
  try {
    cache = estadoDeJson(await AsyncStorage.getItem(ROTEIRO_KEY));
  } catch {
    cache = estadoInicial();
  }
  return cache;
}

/** Serializa as escritas: dois eventos no mesmo instante não se apagam. */
function mudar(fn: (e: EstadoRoteiro) => EstadoRoteiro): Promise<void> {
  const proxima = fila.then(async () => {
    const atual = await ler();
    const novo = fn(atual);
    if (novo === atual) return;
    cache = novo;
    try { await AsyncStorage.setItem(ROTEIRO_KEY, JSON.stringify(novo)); } catch { /* best-effort */ }
    for (const o of ouvintes) { try { o(); } catch { /* ouvinte nunca derruba o registro */ } }
  });
  fila = proxima.catch(() => undefined);
  return proxima.catch(() => undefined);
}

/** Avisa que um evento do roteiro aconteceu (só a primeira vez conta). Nunca lança. */
export function registrarEventoDica(evento: EventoDica): void {
  void mudar((e) => registrarEvento(registrarPrimeiroUso(e, diaLocal()), evento, diaLocal()));
}

/**
 * Marca o primeiro uso e, passados 30 dias, registra o evento da dica de dados.
 * Chamado pela Conta (onde a dica aparece) — sem timer, sem trabalho em segundo plano.
 */
export function registrarUsoDiario(): void {
  void mudar((e) => {
    const hoje = diaLocal();
    const comUso = registrarPrimeiroUso(e, hoje);
    return completouTrintaDias(comUso, hoje) ? registrarEvento(comUso, 'uso_30_dias', hoje) : comUso;
  });
}

/** Escuta mudanças no roteiro. Devolve a função que para de escutar. */
export function ouvirRoteiro(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

/**
 * A dica deste lugar agora (ou `null`). Quando é a NOVA do dia, já grava a
 * apresentação — é isso que segura o limite de 1 por dia.
 */
export async function dicaParaLocal(local: LocalDica, contexto?: readonly EventoDica[]): Promise<Escolha | null> {
  try {
    const [estado, ajudaAtiva] = await Promise.all([ler(), estaAtiva()]);
    const candidatas = ROTEIRO_DICAS.filter((d) => d.local === local);
    const vistasLista = await Promise.all(candidatas.map(async (d) => ((await dicaFoiVista(d.id)) ? d.id : null)));
    const vistas = new Set(vistasLista.filter((v): v is string => !!v));
    const hoje = diaLocal();
    const escolha = escolherDica({ estado, local, hoje, vistas, ajudaAtiva, contexto });
    if (escolha?.nova) {
      await mudar((e) => marcarApresentada(e, escolha.dica.id, hoje));
      track(Eventos.dicaMostrada, { id: escolha.dica.id, numero: escolha.dica.numero });
    }
    return escolha;
  } catch {
    return null;
  }
}

/** "Entendi": some para sempre (mesmo conjunto do DicaContextual). */
export async function dispensarDicaRoteiro(id: string, numero: number): Promise<void> {
  track(Eventos.dicaEntendida, { id, numero });
  await marcarDicaVista(id);
  for (const o of ouvintes) { try { o(); } catch { /* idem */ } }
}

/** "Não mostrar mais dicas": desliga o interruptor da Conta (religa por lá). */
export async function desligarDicas(origemId: string): Promise<void> {
  track(Eventos.dicasDesligadas, { id: origemId });
  await desligarAjuda();
  for (const o of ouvintes) { try { o(); } catch { /* idem */ } }
}

/**
 * "Rever apresentação e dicas": esquece as APRESENTAÇÕES (as "vistas" são zeradas
 * por `resetarAjuda`). Os eventos ficam: o que a pessoa já viveu (primeiro envio,
 * primeira visita…) volta a mostrar a dica, uma por dia, sem precisar acontecer de novo.
 */
export async function resetarRoteiro(): Promise<void> {
  await mudar((e) => (Object.keys(e.apresentadas).length ? { ...e, apresentadas: {} } : e));
  for (const o of ouvintes) { try { o(); } catch { /* idem */ } }
}
