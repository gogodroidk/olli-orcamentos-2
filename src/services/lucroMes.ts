/**
 * LUCRO REAL — a CASCA que lê o banco local e monta as entradas da regra pura
 * (`lucroVisita.ts`). Nada de rede: tudo vem do SQLite (o mesmo dado que a
 * nuvem espelha).
 *
 * O que conta como "visita feita com preço" no mês:
 *  1. OS concluída no mês (`concluidoEm`) — preço = `valor` da OS, ou o total do
 *     orçamento de origem; material = a baixa da OS, ou os produtos do orçamento;
 *  2. visita da agenda concluída no mês, ligada a um orçamento e SEM OS (quem não
 *     usa OS também vê o lucro) — preço = total do orçamento.
 * Visita com OS, de contrato (tem OS determinística) ou cujo orçamento já entrou
 * por uma OS não conta duas vezes.
 */
import { getClientes, getEmpresa, getOrcamento, getOrdensServico, getProdutos } from '../database/database';
import { getAgendamentosExpandidos } from './agenda';
import {
  calcularLucroVisita,
  mesDeBrasilia,
  resumirMes,
  type CustosNegocio,
  type EntradaLucro,
  type ResultadoLucro,
  type ResumoMes,
  type VisitaDoMes,
} from './lucroVisita';
import type { Cliente, Empresa, Orcamento, OrdemServico } from '../types';

export interface ContextoLucro {
  negocio: CustosNegocio;
  clientes: Map<string, Cliente>;
  orcamentos: Map<string, Orcamento>;
  custoProduto: (id: string) => number | undefined;
}

/** Os custos de Meu Negócio no formato da regra. */
export function custosDaEmpresa(e: Empresa | null | undefined): CustosNegocio {
  return {
    custoKm: e?.custoKm,
    comissaoPercentual: e?.comissaoPercentual,
    base: e && typeof e.baseLat === 'number' && typeof e.baseLon === 'number' ? { lat: e.baseLat, lon: e.baseLon } : null,
  };
}

/**
 * Lê o que o cálculo precisa. Os orçamentos vêm UM a UM, só os pedidos (o blob
 * inteiro de orçamentos — itens, fotos, assinaturas — não é carregado a cada
 * foco do Painel). Lança se o banco falhar (a tela mostra o erro).
 */
export async function carregarContextoLucro(orcamentoIds: Iterable<string> = []): Promise<ContextoLucro> {
  const ids = [...new Set(orcamentoIds)];
  const [empresa, clientes, produtos, orcamentos] = await Promise.all([
    getEmpresa(), getClientes(), getProdutos(), Promise.all(ids.map((id) => getOrcamento(id))),
  ]);
  const custos = new Map(produtos.map((p) => [p.id, p.custo] as const));
  const porId = new Map<string, Orcamento>();
  for (const o of orcamentos) if (o && !o.excluidoEm) porId.set(o.id, o);
  return {
    negocio: custosDaEmpresa(empresa),
    clientes: new Map(clientes.map((c) => [c.id, c] as const)),
    orcamentos: porId,
    custoProduto: (id) => custos.get(id),
  };
}

/** Entrada da regra para uma OS. */
export function entradaDaOS(os: OrdemServico, ctx: ContextoLucro): EntradaLucro {
  const orc = os.orcamentoId ? ctx.orcamentos.get(os.orcamentoId) : undefined;
  const cliente = os.clienteId ? ctx.clientes.get(os.clienteId) : undefined;
  return {
    valor: typeof os.valor === 'number' ? os.valor : orc?.valorTotal,
    materiais: os.materiais,
    itensOrcamento: orc ? orc.itens : null,
    custoProduto: ctx.custoProduto,
    cliente: cliente ?? null,
    negocio: ctx.negocio,
  };
}

/** O lucro de uma OS (tela da OS). */
export function lucroDaOS(os: OrdemServico, ctx: ContextoLucro): ResultadoLucro {
  return calcularLucroVisita(entradaDaOS(os, ctx));
}

/** Limites [início, fim) do mês de Brasília que contém `agora`, em ISO UTC. */
export function limitesMes(agora: Date): { mes: string; inicio: string; fim: string } {
  const mes = mesDeBrasilia(agora.toISOString()) as string;
  const [a, m] = mes.split('-').map(Number);
  const inicio = new Date(Date.UTC(a, m - 1, 1, 3, 0, 0));
  const fim = new Date(Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1, 3, 0, 0));
  return { mes, inicio: inicio.toISOString(), fim: fim.toISOString() };
}

/** "Quanto sobrou" do mês corrente. Lança se a leitura falhar. */
export async function resumoLucroDoMes(agora: Date = new Date()): Promise<ResumoMes> {
  const { mes, inicio, fim } = limitesMes(agora);
  const [ordens, visitas] = await Promise.all([getOrdensServico(), getAgendamentosExpandidos(inicio, fim)]);
  const orcamentosComOS = new Set<string>();
  for (const os of ordens) if (os.orcamentoId) orcamentosComOS.add(os.orcamentoId);
  const ordensDoMes = ordens.filter(
    (os) => os.status === 'concluida' && !!os.concluidoEm && mesDeBrasilia(os.concluidoEm) === mes,
  );
  const visitasDoMes = visitas.filter((v) =>
    v.status === 'concluido' && !!v.orcamentoId && !v.ordemServicoId && !v.contratoId
    && !orcamentosComOS.has(v.orcamentoId) && mesDeBrasilia(v.fim || v.inicio) === mes);
  const ctx = await carregarContextoLucro([
    ...ordensDoMes.map((os) => os.orcamentoId).filter((x): x is string => !!x),
    ...visitasDoMes.map((v) => v.orcamentoId as string),
  ]);
  const doMes: VisitaDoMes[] = [];
  for (const os of ordensDoMes) {
    doMes.push({
      id: os.id,
      titulo: os.titulo,
      clienteNome: os.clienteNome,
      quando: os.concluidoEm as string,
      resultado: lucroDaOS(os, ctx),
      origem: 'os',
    });
  }
  for (const v of visitasDoMes) {
    const quando = v.fim || v.inicio;
    const orc = ctx.orcamentos.get(v.orcamentoId as string);
    const cliente = v.clienteId ? ctx.clientes.get(v.clienteId) : undefined;
    doMes.push({
      id: v.id,
      titulo: v.titulo,
      clienteNome: v.clienteNome,
      quando,
      resultado: calcularLucroVisita({
        valor: orc?.valorTotal,
        itensOrcamento: orc ? orc.itens : null,
        custoProduto: ctx.custoProduto,
        cliente: cliente ?? null,
        negocio: ctx.negocio,
      }),
      origem: 'visita',
    });
  }
  return resumirMes(doMes);
}
