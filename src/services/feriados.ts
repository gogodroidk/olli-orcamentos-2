/**
 * feriados.ts — feriados nacionais na agenda, app-side.
 *
 * Contrato do endpoint (worker `olli-diagnostico`, `GET /feriados/<ano>` — ver
 * `worker/src/brasil.js` → `handleFeriados`):
 *
 *   200 { ok:true, estado:'ok', ano, feriados:[{data,nome,tipo,diaSemana}],
 *         fonte:'calculo_local', municipaisIncluidos:false, estaduaisIncluidos:false }
 *   400 { ok:false, estado:'invalido', erro:'ano_invalido', intervalo:[1900,2199] }
 *
 * ─── ONDE ISTO APARECE, E POR QUÊ SÓ AÍ ────────────────────────────────────
 * Num único lugar: no formulário de agendar visita, ao lado do aviso de
 * sobreposição de horário. É o instante em que a informação MUDA A DECISÃO —
 * ele está escolhendo o dia. Um feriado descoberto depois de marcado já custou
 * a ligação de remarcação; descoberto no dia, custou a viagem.
 *
 * Não existe card de feriado na Home nem na lista da agenda de propósito.
 * Informação verdadeira no lugar errado vira ruído, e ruído mata a atenção do
 * aviso que importa.
 *
 * ─── POR QUE BAIXAR UM ANO INTEIRO ─────────────────────────────────────────
 * Porque é a única forma de funcionar sem sinal, que é onde este app vive. O
 * ano inteiro cabe em ~14 itens e não muda: baixa uma vez, guarda, e a agenda
 * sabe que segunda é feriado no meio do mato. Consultar por dia jogaria fora a
 * única vantagem que importa.
 *
 * ─── POR QUE NÃO CALCULAR AQUI TAMBÉM ──────────────────────────────────────
 * A tentação é óbvia: o worker calcula sem rede (datas fixas em lei + Páscoa),
 * e o mesmo algoritmo no aparelho dispensaria a primeira consulta. Não foi
 * feito, e a razão é a lição do <SinalizarIA> deste repo: DUAS cópias da mesma
 * regra divergem. E aqui a regra é jurídica e datada — a Consciência Negra só
 * virou feriado nacional em 2024 (Lei 14.759/2023), Carnaval e Corpus Christi
 * são ponto facultativo e não feriado (Portaria MGI nº 11.460/2025). No dia em
 * que uma lei mudar, uma tabela vai ser atualizada e a outra não, e o app vai
 * afirmar duas coisas diferentes sobre o mesmo dia. Uma fonte só.
 *
 * ─── TRÊS ESTADOS ──────────────────────────────────────────────────────────
 * `ok` (com ou sem feriado no dia) · `indisponivel` (nunca baixei este ano e
 * não consigo agora). O `indisponivel` APARECE na tela: sem ele, silêncio seria
 * lido como "não é feriado", que é o bug `olli-gate-erro-vira-vazio` na versão
 * mais fácil de deixar passar — a ausência de aviso parece uma resposta.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DIAGNOSTICO_URL } from '../config';
import { supabase } from './supabase';
import { FERIADOS_ANO_KEY_PREFIX } from './storageKeys';

/**
 * `nacional` = quase tudo fecha; o cliente provavelmente não recebe ninguém.
 * `facultativo` = comércio costuma abrir, indústria não. Para o prestador a
 * diferença é operacional, não jurídica — e é por isso que ela existe aqui:
 * em feriado nacional não vale marcar, em facultativo vale perguntar antes.
 */
export type TipoFeriado = 'nacional' | 'facultativo';

export interface Feriado {
  /** 'AAAA-MM-DD' */
  data: string;
  nome: string;
  tipo: TipoFeriado;
  diaSemana: string;
}

export type ResultadoFeriados =
  | {
      estado: 'ok';
      ano: number;
      feriados: Feriado[];
      /** Ambos `false` hoje. A tela PRECISA dizer isso — ver `AvisoFeriado`. */
      municipaisIncluidos: boolean;
      estaduaisIncluidos: boolean;
    }
  | { estado: 'indisponivel' };

const TIMEOUT_MS = 8000;

/**
 * Revalidação preguiçosa. O calendário de um ano é estável, mas não é eterno:
 * feriado nacional nasce de lei (a Consciência Negra virou nacional em 2024), e
 * um aparelho que guardou 2026 antes de uma lei nova ficaria errado para sempre.
 * 60 dias é o meio-termo: o cache SEMPRE serve na hora (offline primeiro), e a
 * atualização acontece atrás, sem o usuário esperar por ela.
 */
const REVALIDAR_APOS_MS = 60 * 24 * 3600 * 1000;

interface Guardado {
  v: 1;
  ano: number;
  feriados: Feriado[];
  municipaisIncluidos: boolean;
  estaduaisIncluidos: boolean;
  /** ISO de quando este aparelho baixou. Só serve para a revalidação preguiçosa. */
  baixadoEm: string;
}

/** Cache de processo: a agenda remonta o formulário a cada troca de data. */
const memoria = new Map<number, Guardado>();
/** Anos com revalidação em voo — evita disparar dez fetches ao arrastar a data. */
const revalidando = new Set<number>();

/** Só para teste (o mapa é de módulo; teste que herda cache do vizinho não prova nada). */
export function limparCacheFeriados(): void {
  memoria.clear();
  revalidando.clear();
}

function chaveStorage(ano: number): string {
  return `${FERIADOS_ANO_KEY_PREFIX}${ano}`;
}

/**
 * 'AAAA-MM-DD' a partir dos componentes LOCAIS da data.
 *
 * NUNCA `toISOString().slice(0,10)`: no Brasil (UTC-3) a meia-noite local vira
 * 03:00 UTC do MESMO dia, mas qualquer horário antes das 21h vira o dia
 * seguinte em UTC — e um agendamento das 22h de 6 de setembro seria comparado
 * contra 7 de setembro. O feriado apareceria (ou sumiria) um dia fora do lugar.
 */
export function chaveDoDia(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Valida item a item: worker mais novo/velho não pode virar feriado fantasma. */
function normalizarLista(bruto: unknown): Feriado[] {
  if (!Array.isArray(bruto)) return [];
  const out: Feriado[] = [];
  for (const f of bruto) {
    const data = String((f as any)?.data ?? '');
    const nome = String((f as any)?.nome ?? '').trim();
    const tipo = String((f as any)?.tipo ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !nome) continue;
    // Tipo desconhecido NÃO vira 'nacional' por padrão: chutar para o lado mais
    // forte faria o app desaconselhar um dia de trabalho por um campo que ele
    // não entendeu. Fica de fora, e o dia segue normal.
    if (tipo !== 'nacional' && tipo !== 'facultativo') continue;
    out.push({ data, nome, tipo, diaSemana: String((f as any)?.diaSemana ?? '') });
  }
  return out;
}

async function tokenAtual(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Busca no worker. `null` = não consegui (offline, sem sessão, worker fora, corpo estranho). */
async function baixarDoWorker(ano: number): Promise<Guardado | null> {
  if (!DIAGNOSTICO_URL) return null;
  const token = await tokenAtual();
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${DIAGNOSTICO_URL}/feriados/${ano}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!r.ok) return null;
    const data: any = await r.json().catch(() => null);
    if (!data || data.ok !== true || data.estado !== 'ok') return null;
    const feriados = normalizarLista(data.feriados);
    // Ano sem NENHUM feriado válido é resposta quebrada, não ano sem feriado —
    // o Brasil não tem ano assim. Tratar como sucesso vazio afirmaria que
    // nenhum dia do ano é feriado, que é "não sei" virando "não tem".
    if (feriados.length === 0) return null;
    return {
      v: 1,
      ano,
      feriados,
      // Default `true` seria mentir a favor do app: na dúvida sobre o campo,
      // assumimos que NÃO incluímos, que é o que faz a tela avisar.
      municipaisIncluidos: data.municipaisIncluidos === true,
      estaduaisIncluidos: data.estaduaisIncluidos === true,
      baixadoEm: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lerDoDisco(ano: number): Promise<Guardado | null> {
  try {
    const raw = await AsyncStorage.getItem(chaveStorage(ano));
    if (!raw) return null;
    const g = JSON.parse(raw) as Guardado;
    // Versão diferente = formato de outra época. Reconsulta em vez de adivinhar.
    if (!g || g.v !== 1 || g.ano !== ano) return null;
    const feriados = normalizarLista(g.feriados);
    if (feriados.length === 0) return null;
    return { ...g, feriados };
  } catch {
    return null;
  }
}

async function gravarNoDisco(g: Guardado): Promise<void> {
  try {
    await AsyncStorage.setItem(chaveStorage(g.ano), JSON.stringify(g));
  } catch {
    // Sem disco o recurso ainda funciona nesta sessão (cache de memória).
  }
}

/** Atualiza em segundo plano, sem ninguém esperando. Falhou? O cache velho continua servindo. */
function revalidarAtras(ano: number): void {
  if (revalidando.has(ano)) return;
  revalidando.add(ano);
  void baixarDoWorker(ano)
    .then(novo => {
      if (novo) {
        memoria.set(ano, novo);
        void gravarNoDisco(novo);
      }
    })
    .catch(() => {})
    .then(() => {
      revalidando.delete(ano);
    });
}

/**
 * Feriados de um ano. NUNCA lança. Ordem: memória → disco → worker.
 * O disco responde na hora mesmo velho (offline primeiro) e dispara a
 * revalidação atrás.
 */
export async function carregarFeriados(ano: number): Promise<ResultadoFeriados> {
  if (!Number.isInteger(ano)) return { estado: 'indisponivel' };

  const daMemoria = memoria.get(ano);
  if (daMemoria) return paraResultado(daMemoria);

  const doDisco = await lerDoDisco(ano);
  if (doDisco) {
    memoria.set(ano, doDisco);
    const idade = Date.now() - new Date(doDisco.baixadoEm).getTime();
    // `NaN > x` é `false`, então carimbo ilegível NÃO dispara revalidação em
    // loop — e o dado velho continua servindo, que é o comportamento certo.
    if (idade > REVALIDAR_APOS_MS) revalidarAtras(ano);
    return paraResultado(doDisco);
  }

  const doWorker = await baixarDoWorker(ano);
  if (!doWorker) return { estado: 'indisponivel' };
  memoria.set(ano, doWorker);
  void gravarNoDisco(doWorker);
  return paraResultado(doWorker);
}

function paraResultado(g: Guardado): ResultadoFeriados {
  return {
    estado: 'ok',
    ano: g.ano,
    feriados: g.feriados,
    municipaisIncluidos: g.municipaisIncluidos,
    estaduaisIncluidos: g.estaduaisIncluidos,
  };
}

/**
 * Deixa o ano corrente (e o próximo) prontos para uso offline. Chamado quando a
 * Agenda ganha foco — que é quando ele quase sempre ainda tem sinal, antes de
 * sair para a rua. O ano seguinte entra junto porque quem agenda em dezembro
 * agenda para janeiro. Nunca lança, nunca bloqueia a tela.
 */
export function prefetchFeriados(hoje: Date = new Date()): void {
  const ano = hoje.getFullYear();
  void carregarFeriados(ano).catch(() => {});
  void carregarFeriados(ano + 1).catch(() => {});
}

/** O feriado que cai neste dia, ou `null`. Puro. */
export function feriadoDoDia(resultado: ResultadoFeriados, dia: Date): Feriado | null {
  if (resultado.estado !== 'ok') return null;
  const chave = chaveDoDia(dia);
  return resultado.feriados.find(f => f.data === chave) ?? null;
}

export interface EstadoFeriado {
  /** `carregando` no primeiro frame; `indisponivel` quando nunca baixei este ano. */
  estado: 'carregando' | 'ok' | 'indisponivel';
  feriado: Feriado | null;
  municipaisIncluidos: boolean;
}

/**
 * Hook para o formulário de agendamento: dado um dia, diz se é feriado.
 * Reconsulta só quando muda de ANO (o resto é lookup em memória).
 */
export function useFeriadoDoDia(dia: Date): EstadoFeriado {
  const ano = dia.getFullYear();
  const [resultado, setResultado] = useState<ResultadoFeriados | null>(null);

  useEffect(() => {
    let vivo = true;
    setResultado(null);
    carregarFeriados(ano)
      .then(r => { if (vivo) setResultado(r); })
      // `carregarFeriados` não lança, mas se um dia lançar isto é "não sei" e
      // precisa CHEGAR na tela — não pode ficar em `carregando` para sempre.
      .catch(() => { if (vivo) setResultado({ estado: 'indisponivel' }); });
    return () => { vivo = false; };
  }, [ano]);

  if (!resultado) return { estado: 'carregando', feriado: null, municipaisIncluidos: false };
  if (resultado.estado !== 'ok') return { estado: 'indisponivel', feriado: null, municipaisIncluidos: false };
  return {
    estado: 'ok',
    feriado: feriadoDoDia(resultado, dia),
    municipaisIncluidos: resultado.municipaisIncluidos,
  };
}
