/**
 * "A câmera mata o app e a OS volta igual" — a regra pura da retomada.
 *
 *     testada por: node scripts/teste-confianca-offline.ts
 *     roteiro manual: e2e/sobrevive-morte-camera.md
 *
 * O QUE ACONTECE NO ANDROID. Abrir a câmera põe o OLLI em segundo plano. Com
 * pouca memória (ou "Não manter atividades" ligado nas opções de desenvolvedor)
 * o sistema DESTRÓI a tela do OLLI enquanto a pessoa fotografa. Ao voltar:
 *  - a promessa do `launchCameraAsync` nunca resolve (quem esperava por ela morreu);
 *  - o app remonta do zero, na tela inicial, sem saber que havia uma OS aberta;
 *  - a foto tirada fica guardada no módulo do picker, à espera de alguém pedir
 *    (`ImagePicker.getPendingResultAsync`). Se ninguém pedir, ela se perde.
 *
 * A RETOMADA, EM TRÊS PASSOS:
 *  1. ANTES de abrir a câmera, a OS grava um marcador no aparelho
 *     ("estou fotografando para a OS X desde HH:MM");
 *  2. se a câmera voltar normalmente, a OS apaga o marcador ao terminar;
 *  3. se o app renascer com o marcador ainda lá (e recente), o boot recupera a
 *     foto pendente, anexa à OS X e REABRE a OS X — exatamente onde estava.
 *
 * Sem marcador, a retomada NÃO toca no resultado pendente do picker: ele pode
 * ser de outra tela (a foto do orçamento, a logo), e consumi-lo aqui faria a
 * foto de outra pessoa sumir em silêncio.
 */

// A chave do marcador no AsyncStorage é `CAPTURA_OS_KEY` (storageKeys.ts): dado
// de conta, some no logout. Quem lê/grava é `capturaFotoOSNativa.ts`.

/** Depois disso o marcador é velho demais para significar "acabei de sair da câmera". */
export const CAPTURA_VALIDADE_MS = 30 * 60 * 1000;

export type OrigemCaptura = 'camera' | 'galeria';

export interface MarcadorCaptura {
  v: 1;
  ordemId: string;
  origem: OrigemCaptura;
  iniciadaEm: number;
}

export function serializarMarcador(ordemId: string, origem: OrigemCaptura, agora: number): string {
  const m: MarcadorCaptura = { v: 1, ordemId, origem, iniciadaEm: agora };
  return JSON.stringify(m);
}

/** Marcador válido e recente, ou null. Nunca lança. */
export function lerMarcador(bruto: string | null | undefined, agora: number): MarcadorCaptura | null {
  if (!bruto) return null;
  try {
    const m = JSON.parse(bruto) as Partial<MarcadorCaptura>;
    if (m?.v !== 1 || typeof m.ordemId !== 'string' || !m.ordemId) return null;
    if (m.origem !== 'camera' && m.origem !== 'galeria') return null;
    if (typeof m.iniciadaEm !== 'number') return null;
    const idade = agora - m.iniciadaEm;
    if (idade < 0 || idade > CAPTURA_VALIDADE_MS) return null;
    return m as MarcadorCaptura;
  } catch {
    return null;
  }
}

/**
 * Formato do `getPendingResultAsync` do expo-image-picker (SDK 57): o mesmo
 * resultado do launch*, OU um erro `{ code, message }`, OU null.
 */
export type ResultadoPendentePicker =
  | { canceled: boolean; assets?: { uri: string }[] | null }
  | { code: string; message: string }
  | null
  | undefined;

/** URIs de foto num resultado pendente (vazio se cancelou, deu erro ou não há). */
export function urisDoResultadoPendente(r: ResultadoPendentePicker): string[] {
  if (!r || typeof r !== 'object') return [];
  if (!('canceled' in r)) return []; // erro do picker
  if (r.canceled || !Array.isArray(r.assets)) return [];
  return r.assets.map((a) => a?.uri).filter((u): u is string => typeof u === 'string' && u.length > 0);
}

export interface DependenciasRetomada {
  lerMarcador: () => Promise<string | null>;
  apagarMarcador: () => Promise<void>;
  /** Pede ao picker a foto que ficou sem dono. Só chamado com marcador válido. */
  resultadoPendente: () => Promise<ResultadoPendentePicker>;
  /** Comprime e copia para a pasta permanente; null se falhou. */
  processar: (uriTemporaria: string) => Promise<string | null>;
  /** Anexa a foto (já permanente) à OS e a põe na fila de envio. */
  anexar: (ordemId: string, uri: string) => Promise<void>;
  agora: () => number;
}

export type Retomada =
  | { tipo: 'nada' }
  | { tipo: 'reabrir'; ordemId: string; fotosRecuperadas: number; fotosPerdidas: number };

/**
 * Roda no boot. Nunca lança. Se havia captura em andamento, devolve qual OS
 * reabrir e quantas fotos voltaram (ou não). O marcador é apagado no fim, em
 * qualquer caso — senão um resultado que falhou viraria um laço de reabertura.
 */
export async function retomarCapturaInterrompida(deps: DependenciasRetomada): Promise<Retomada> {
  let marcador: MarcadorCaptura | null = null;
  try {
    marcador = lerMarcador(await deps.lerMarcador(), deps.agora());
  } catch {
    marcador = null;
  }
  if (!marcador) {
    // Marcador velho/corrompido também sai do caminho.
    await deps.apagarMarcador().catch(() => {});
    return { tipo: 'nada' };
  }

  let uris: string[] = [];
  try {
    uris = urisDoResultadoPendente(await deps.resultadoPendente());
  } catch {
    uris = [];
  }

  let recuperadas = 0;
  let perdidas = 0;
  for (const uri of uris) {
    try {
      const permanente = await deps.processar(uri);
      if (!permanente) {
        perdidas += 1;
        continue;
      }
      await deps.anexar(marcador.ordemId, permanente);
      recuperadas += 1;
    } catch {
      perdidas += 1;
    }
  }

  await deps.apagarMarcador().catch(() => {});
  return { tipo: 'reabrir', ordemId: marcador.ordemId, fotosRecuperadas: recuperadas, fotosPerdidas: perdidas };
}
