/**
 * Diagnóstico unificado (item 2.14) — a parte PURA, testável no Node.
 *
 * Fluxo de uma tela só: buscar o código → resultado da base offline
 * (assets/codigos_erro.json → tabela local `codigos_erro`) → "Perguntar à OLLI
 * sobre este caso", que abre o chat já com o que a base achou.
 *
 * Aqui ficam: o estado da busca (carregando | erro | resultado — sem resultado
 * é um `resultado` vazio, dito com todas as letras), a montagem do contexto que
 * vai ao Worker (o servidor sanitiza de novo e recalcula o que falta — isto só
 * evita mandar lixo) e o repasse do contexto da tela de diagnóstico para o
 * chat. O repasse é em MEMÓRIA, de propósito: params de rota viram query string
 * no web (o sintoma digitado iria parar na URL e no histórico do navegador).
 *
 * Sem import de React Native: roda em `scripts/teste-diagnostico-unificado.ts`.
 */
import type { CodigoErro } from '../types';

// ─── Estado da busca ─────────────────────────────────────
export type EstadoBuscaDiagnostico =
  | { tipo: 'ocioso' }
  /** `itens` = o resultado anterior, mantido na tela enquanto a nova busca roda (sem piscar). */
  | { tipo: 'carregando'; itens: CodigoErro[] }
  | { tipo: 'erro' }
  | { tipo: 'resultado'; itens: CodigoErro[] };

export const ESTADO_OCIOSO: EstadoBuscaDiagnostico = { tipo: 'ocioso' };

/** Passa a `carregando` preservando o que já estava na tela. */
export function iniciarCarregamento(anterior: EstadoBuscaDiagnostico): EstadoBuscaDiagnostico {
  const itens = anterior.tipo === 'resultado' || anterior.tipo === 'carregando' ? anterior.itens : [];
  return { tipo: 'carregando', itens };
}

/** O que a lista mostra: resultado, ou o anterior durante o carregamento. */
export function itensVisiveis(estado: EstadoBuscaDiagnostico): CodigoErro[] {
  return estado.tipo === 'resultado' || estado.tipo === 'carregando' ? estado.itens : [];
}

/** `resultado` sem itens = a base offline não tem o código (não é erro). */
export function semResultadoNaBase(estado: EstadoBuscaDiagnostico): boolean {
  return estado.tipo === 'resultado' && estado.itens.length === 0;
}

/**
 * Guarda de corrida: a busca tem debounce e é assíncrona, então uma resposta
 * antiga ("E" com 200 linhas) pode chegar DEPOIS da nova ("E4"). Só a última
 * busca disparada pode escrever o estado.
 */
export function criarSequenciaBusca() {
  let atual = 0;
  return {
    proxima(): number { atual += 1; return atual; },
    ehAtual(id: number): boolean { return id === atual; },
  };
}

// ─── Contexto para o chat ────────────────────────────────
/** Espelho de CONTEXTO_DIAGNOSTICO_LIMITES do Worker (worker/src/ai.js). */
export const LIMITES_CONTEXTO = Object.freeze({
  codigos: 5,
  causas: 4,
  campoCurto: 80,
  campoLongo: 300,
  sintoma: 400,
});

export interface CodigoNoContexto {
  marca?: string;
  familia?: string;
  codigo?: string;
  descricao?: string;
  causas?: string[];
  acao?: string;
  severidade?: string;
  confianca?: string;
}

export interface ContextoDiagnostico {
  marca?: string;
  modelo?: string;
  codigoBuscado?: string;
  sintoma?: string;
  encontradoNaBase: boolean;
  codigos: CodigoNoContexto[];
}

function cortar(valor: unknown, limite: number): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const limpo = valor.replace(/\s+/g, ' ').trim();
  if (!limpo) return undefined;
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo;
}

function semVazios<T extends object>(obj: T): T {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    saida[k] = v;
  }
  return saida as T;
}

export function codigoParaContexto(c: CodigoErro): CodigoNoContexto {
  const L = LIMITES_CONTEXTO;
  const causa = cortar(c.causa, L.campoLongo);
  return semVazios({
    marca: cortar(c.marca, L.campoCurto),
    familia: cortar(c.familia, L.campoCurto),
    codigo: cortar(c.codigo, L.campoCurto),
    descricao: cortar(c.falha, L.campoLongo),
    causas: causa ? [causa] : [],
    acao: cortar(c.acao, L.campoLongo),
    severidade: cortar(c.severidade, 20),
    confianca: cortar(c.confianca, 20),
  });
}

/**
 * Monta o contexto do caso a partir do que a tela tem. `codigos` são os
 * registros achados (o aberto no detalhe, ou os primeiros da lista); vazio =
 * a base não tem o código, e o chat precisa saber disso para não inventar.
 */
export function montarContextoDiagnostico(entrada: {
  marca?: string | null;
  modelo?: string | null;
  codigoBuscado?: string | null;
  sintoma?: string | null;
  codigos?: CodigoErro[];
}): ContextoDiagnostico {
  const L = LIMITES_CONTEXTO;
  const codigos = (entrada.codigos ?? []).slice(0, L.codigos).map(codigoParaContexto);
  return {
    ...semVazios({
      marca: cortar(entrada.marca ?? undefined, L.campoCurto),
      modelo: cortar(entrada.modelo ?? undefined, L.campoCurto),
      codigoBuscado: cortar(entrada.codigoBuscado ?? undefined, L.campoCurto),
      sintoma: cortar(entrada.sintoma ?? undefined, L.sintoma),
    }),
    // Sempre presente, mesmo vazio: "a base não tem" é informação, não ausência.
    encontradoNaBase: codigos.length > 0,
    codigos,
  };
}

/** Marca efetiva: a informada ou, se todos os códigos são da mesma, essa. */
export function marcaDoContexto(ctx: ContextoDiagnostico): string | undefined {
  if (ctx.marca) return ctx.marca;
  const marcas = [...new Set((ctx.codigos ?? []).map(c => c.marca).filter(Boolean))];
  return marcas.length === 1 ? marcas[0] : undefined;
}

/** O que falta para a OLLI responder com segurança (mesma regra do Worker). */
export function faltandoNoContexto(ctx: ContextoDiagnostico): Array<'marca' | 'modelo'> {
  const falta: Array<'marca' | 'modelo'> = [];
  if (!marcaDoContexto(ctx)) falta.push('marca');
  if (!ctx.modelo) falta.push('modelo');
  return falta;
}

/** Título curto do caso, para o cartão do chat. */
export function tituloDoCaso(ctx: ContextoDiagnostico): string {
  const codigo = ctx.codigos?.[0]?.codigo ?? ctx.codigoBuscado;
  const marca = marcaDoContexto(ctx);
  const partes = [codigo ? `Código ${codigo}` : 'Caso de diagnóstico', marca, ctx.modelo].filter(Boolean);
  return partes.join(' · ');
}

/**
 * Primeira fala LOCAL da OLLI no chat (não gasta IA): resume o que a base
 * offline achou e, se faltar marca/modelo, PERGUNTA antes de qualquer
 * resposta da IA — é a regra de ouro da tela ("peça marca + modelo").
 */
export function aberturaDoCaso(ctx: ContextoDiagnostico): string {
  const linhas: string[] = [];
  if (ctx.encontradoNaBase) {
    const n = ctx.codigos.length;
    linhas.push(n === 1
      ? 'Peguei o caso do Diagnóstico. Na base offline:'
      : `Peguei o caso do Diagnóstico. A base offline achou ${n} registros parecidos:`);
    for (const c of ctx.codigos) {
      const cab = [c.marca, c.familia].filter(Boolean).join(' ');
      linhas.push(`• ${c.codigo ?? '—'}${cab ? ` (${cab})` : ''}: ${c.descricao ?? 'sem descrição'}`
        + (c.causas?.length ? ` — causa provável: ${c.causas.join('; ')}` : ''));
    }
  } else {
    const alvo = ctx.codigoBuscado ? `o código “${ctx.codigoBuscado}”` : 'esse caso';
    linhas.push(`Peguei o caso do Diagnóstico. A base offline não tem ${alvo}${ctx.marca ? ` da ${ctx.marca}` : ''} — então não vou chutar o significado oficial.`);
  }
  const falta = faltandoNoContexto(ctx);
  if (falta.length) {
    linhas.push('');
    linhas.push(`Antes de eu responder: qual ${falta.length === 2 ? 'a marca e o modelo' : falta[0] === 'marca' ? 'a marca' : 'o modelo'} do equipamento? Está na etiqueta da evaporadora/condensadora. Código genérico não é diagnóstico.`);
  } else {
    linhas.push('');
    linhas.push('Me conta o sintoma (o que a máquina faz) e eu sugiro os testes em ordem.');
  }
  return linhas.join('\n');
}

/** Pergunta sugerida para o campo de texto quando marca e modelo já existem. */
export function perguntaSugerida(ctx: ContextoDiagnostico): string {
  if (faltandoNoContexto(ctx).length) return '';
  const codigo = ctx.codigos?.[0]?.codigo ?? ctx.codigoBuscado;
  return codigo
    ? `Código ${codigo} na ${marcaDoContexto(ctx)} ${ctx.modelo}: o que testo primeiro?`
    : `${marcaDoContexto(ctx)} ${ctx.modelo}: o que testo primeiro?`;
}

// ─── Repasse em memória: Diagnóstico → Chat ──────────────
let contextoPendente: ContextoDiagnostico | null = null;

/** A tela Diagnóstico deixa o caso aqui antes de navegar para o chat. */
export function entregarCasoAoChat(ctx: ContextoDiagnostico): void {
  contextoPendente = ctx;
}

/** O chat retira UMA vez (ao ganhar foco). Depois disso o repasse esvazia. */
export function retirarCasoDoDiagnostico(): ContextoDiagnostico | null {
  const ctx = contextoPendente;
  contextoPendente = null;
  return ctx;
}
