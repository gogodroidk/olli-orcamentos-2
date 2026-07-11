/**
 * Serviço de PMOC Fase 2 — o MOTOR do plano de manutenção recorrente.
 *
 * Superfície única que as telas de PMOC consomem. Aqui vivem TRÊS coisas:
 *   1. O cálculo de PERÍODOS (funções puras, alinhadas ao calendário).
 *   2. A GERAÇÃO IDEMPOTENTE de ordens de serviço (reserve → depois construa).
 *   3. O CRUD de planos/versões apoiado no versionamento append-only do banco.
 *
 * CAVEAT LEGAL (inegociável, herdado da fundação PMOC): NADA aqui declara
 * conformidade legal. `situacao` do plano é ESTADO OPERACIONAL, nunca "conforme
 * com a norma X". Periodicidades, atividades e referências normativas são DADOS
 * versionados (vivem em `PmocPlanoVersao`), jamais constantes de código nem
 * afirmação do app. Quem valida o plano é o responsável técnico habilitado — o
 * app apenas registra quem assinou (`aprovarVersao`). Por isso `frequencia` é
 * `string` validada em runtime contra `FREQUENCIAS_PMOC` (o vocabulário que o app
 * sabe CALCULAR hoje), e uma frequência desconhecida é ignorada em silêncio pelo
 * cálculo (retorna []/'' e NÃO lança) — a tela avisa; o app não inventa período.
 */
import {
  getPmocPlano,
  getPmocPlanos,
  savePmocPlano,
  getPmocVersoes,
  getPmocVersaoVigente,
  savePmocVersao,
  proximoNumeroVersaoPmoc,
  registrarOrdemGerada,
  getOrdensGeradas,
  houveExclusaoDefinitiva,
  getClientes,
} from '../database/database';
import { getEquipamentos } from './equipamentos';
import { criarOSManual, getOrdem } from './ordemServico';
import { agendarLembretesPmoc, cancelarLembretesPmoc } from './pmocLembretes';
import { generateId } from '../utils/id';
import { FREQUENCIAS_PMOC, CATEGORIAS_HVAC } from '../types';
import type {
  PmocPlano,
  PmocPlanoVersao,
  PmocPeriodicidade,
  ItemChecklist,
  Equipamento,
} from '../types';

// ─── 1) CÁLCULO DE PERÍODOS (calendário, sem âncora arbitrária) ───────────────
//
// Os blocos são ALINHADOS AO CALENDÁRIO do ano: indice = floor((mes-1)/meses)+1.
// Alinhar ao calendário (e não a uma data de início) é o que garante que dois
// aparelhos calculem o MESMO rótulo para a mesma visita — exatamente o que a
// chave de idempotência (plano, ativo, período, periodicidade) exige. Todas as
// extrações de ano/mês usam UTC de propósito: `criadoEm`/`vencimento` são ISO em
// UTC (toISOString), então UTC dá o mesmo resultado em qualquer fuso.

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Entrada de FREQUENCIAS_PMOC que o app sabe calcular, ou undefined se desconhecida. */
function frequenciaConhecida(frequencia: string): { id: string; label: string; meses: number } | undefined {
  return FREQUENCIAS_PMOC.find((f) => f.id === frequencia);
}

/** Ano + mês (1-based) de uma data, em UTC. `null` se a data for inválida. */
function partesUTC(data: Date | string): { ano: number; mes: number } | null {
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return null;
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

/** Monta o rótulo do bloco a partir de ano, mês (1-based) e tamanho do bloco (meses). */
function rotuloPara(ano: number, mes: number, meses: number): string {
  const indice = Math.floor((mes - 1) / meses) + 1;
  switch (meses) {
    case 1:
      return `${ano}-${pad2(indice)}`; // indice === mes aqui → '2026-07'
    case 2:
      return `${ano}-B${indice}`; // bimestre → '2026-B4'
    case 3:
      return `${ano}-T${indice}`; // trimestre → '2026-T3'
    case 6:
      return `${ano}-S${indice}`; // semestre → '2026-S2'
    case 12:
      return `${ano}`; // ano → '2026'
    default:
      // Defensivo: uma futura frequência com outro `meses` ainda produz rótulo
      // determinístico (a idempotência depende só de ser estável, não do formato).
      return `${ano}-P${meses}-${indice}`;
  }
}

/** Extrai ano + índice do bloco a partir do rótulo do período. `null` se não casar. */
function parsePeriodo(periodo: string, meses: number): { ano: number; indice: number } | null {
  let m: RegExpExecArray | null;
  switch (meses) {
    case 1:
      m = /^(\d{4})-(\d{2})$/.exec(periodo);
      return m ? { ano: Number(m[1]), indice: Number(m[2]) } : null;
    case 2:
      m = /^(\d{4})-B(\d+)$/.exec(periodo);
      return m ? { ano: Number(m[1]), indice: Number(m[2]) } : null;
    case 3:
      m = /^(\d{4})-T(\d+)$/.exec(periodo);
      return m ? { ano: Number(m[1]), indice: Number(m[2]) } : null;
    case 6:
      m = /^(\d{4})-S(\d+)$/.exec(periodo);
      return m ? { ano: Number(m[1]), indice: Number(m[2]) } : null;
    case 12:
      m = /^(\d{4})$/.exec(periodo);
      return m ? { ano: Number(m[1]), indice: 1 } : null;
    default:
      m = /^(\d{4})-P\d+-(\d+)$/.exec(periodo);
      return m ? { ano: Number(m[1]), indice: Number(m[2]) } : null;
  }
}

/**
 * Rótulo do bloco de calendário em que `data` cai, para a `frequencia`.
 * Frequência desconhecida (não está em FREQUENCIAS_PMOC) ou data inválida → ''.
 * NÃO lança: o vocabulário é DADO, não enum — a tela é quem avisa.
 */
export function periodoDe(data: Date | string, frequencia: string): string {
  const freq = frequenciaConhecida(frequencia);
  if (!freq) return '';
  const p = partesUTC(data);
  if (!p) return '';
  return rotuloPara(p.ano, p.mes, freq.meses);
}

/**
 * Vencimento (ISO curta 'YYYY-MM-DD') = ÚLTIMO DIA do bloco daquele `periodo`.
 * Frequência desconhecida ou rótulo malformado → ''. NÃO lança.
 */
export function vencimentoDe(periodo: string, frequencia: string): string {
  const freq = frequenciaConhecida(frequencia);
  if (!freq) return '';
  const parsed = parsePeriodo(periodo, freq.meses);
  if (!parsed) return '';
  const ultimoMes = parsed.indice * freq.meses; // 1-based (meses=1 → indice é o próprio mês)
  // Date.UTC(ano, ultimoMes /*como 0-based → mês seguinte*/, 0) = último dia do bloco.
  const ultimoDia = new Date(Date.UTC(parsed.ano, ultimoMes, 0)).getUTCDate();
  return `${parsed.ano}-${pad2(ultimoMes)}-${pad2(ultimoDia)}`;
}

/**
 * Todos os rótulos de período DEVIDOS no intervalo [desde, ate] (inclusive), em
 * ordem cronológica e sem repetição. Frequência desconhecida, datas inválidas ou
 * desde > ate → [] (NÃO lança). Itera mês a mês e deduplica: cobre blocos de
 * qualquer tamanho com a mesma lógica de alinhamento ao calendário.
 */
export function periodosDevidos(desde: Date | string, ate: Date | string, frequencia: string): string[] {
  const freq = frequenciaConhecida(frequencia);
  if (!freq) return [];
  const ini = partesUTC(desde);
  const fim = partesUTC(ate);
  if (!ini || !fim) return [];
  if (ini.ano > fim.ano || (ini.ano === fim.ano && ini.mes > fim.mes)) return [];

  const vistos = new Set<string>();
  const out: string[] = [];
  let ano = ini.ano;
  let mes = ini.mes; // 1-based
  while (ano < fim.ano || (ano === fim.ano && mes <= fim.mes)) {
    const rotulo = rotuloPara(ano, mes, freq.meses);
    if (!vistos.has(rotulo)) {
      vistos.add(rotulo);
      out.push(rotulo);
    }
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return out;
}

// ─── 3) PERMISSÃO ─────────────────────────────────────────────────────────────
//
// Gerar ordens é ação de DONO/GESTOR, não de técnico. Isto é SERVIÇO: não importa
// hooks. A TELA deve gatear a ação com `usePermissao(...)` e só chamar
// `gerarOrdensDoPlano` quando `podeGerarPmoc(pode) === true`. Se um técnico
// contornar a tela, a RLS multi-tenant ainda barra a escrita na nuvem — mas isso
// é a última linha de defesa, não a primeira; NÃO conte com ela para o gate de UX.

/** Predicado de permissão: recebe o booleano já resolvido pela tela (via usePermissao). */
export function podeGerarPmoc(pode: boolean): boolean {
  return pode === true;
}

// ─── Descrições legíveis para a OS gerada ─────────────────────────────────────

/** Rótulo PT-BR da categoria HVAC (cai no texto livre se o id não estiver no catálogo). */
function rotuloCategoria(categoria?: string): string {
  if (!categoria) return '';
  const c = CATEGORIAS_HVAC.find((x) => x.id === categoria);
  return c ? c.label : categoria;
}

/** Nome curto e legível do equipamento para o título da OS (ex.: 'Split Sala 302'). */
function descreverEquipamento(eq: Equipamento): string {
  const partes = [rotuloCategoria(eq.categoria), eq.localizacao?.trim()].filter(
    (s): s is string => !!s && s.length > 0,
  );
  if (partes.length) return partes.join(' ');
  return (
    eq.modelo?.trim() ||
    eq.codigoInterno?.trim() ||
    eq.patrimonio?.trim() ||
    eq.numeroSerie?.trim() ||
    'Equipamento'
  );
}

/** Escopo de equipamentos de uma periodicidade (ids finos vencem categorias; vazio = os da versão). */
function resolverEscopo(
  per: PmocPeriodicidade,
  versao: PmocPlanoVersao,
  mapaEquip: Map<string, Equipamento>,
): string[] {
  if (per.equipamentoIds && per.equipamentoIds.length) return per.equipamentoIds;
  const base = versao.equipamentoIds ?? [];
  if (per.categorias && per.categorias.length) {
    const cats = new Set(per.categorias);
    return base.filter((id) => {
      const e = mapaEquip.get(id);
      return !!e && !!e.categoria && cats.has(e.categoria);
    });
  }
  return base;
}

/** Teto defensivo de períodos gerados por combinação (periodicidade × equipamento). */
export const MAX_PERIODOS_POR_COMBINACAO = 24;

/**
 * Resultado da geração. Cada campo existe porque o usuário precisa saber o que o
 * botão fez de verdade — silêncio aqui vira confiança mal colocada.
 *
 * `jaExistiam` NÃO é erro: é a chave de idempotência funcionando. `recuperadas`
 * são visitas cuja reserva existia sem OS (falha entre as duas escritas) e que
 * este comando consertou. `omitidas` são períodos antigos que o teto descartou —
 * um cap silencioso lê como "cobri tudo" quando não cobriu.
 */
export interface ResultadoGeracao {
  /** OS novas, criadas agora. */
  criadas: number;
  /** Reservas órfãs (sem OS) reconstruídas com o id já reservado. */
  recuperadas: number;
  /** Visitas que já tinham OS ativa. Não é erro — é a proteção contra duplicar. */
  jaExistiam: number;
  /** Visitas cuja OS está na LIXEIRA. Não ressuscitamos: restaure por lá. */
  naLixeira: number;
  /** Visitas cuja OS foi excluída DEFINITIVAMENTE. Não recriamos (há tombstone). */
  removidas: number;
  /** Equipamento fantasma no escopo, ou frequência que o app não sabe calcular. */
  ignoradas: number;
  /** Períodos antigos descartados pelo teto de {@link MAX_PERIODOS_POR_COMBINACAO}. */
  omitidas: number;
}

/** Chave lógica da visita — a mesma do índice UNIQUE do banco. */
function chaveVisita(equipamentoId: string, periodo: string, periodicidadeId: string): string {
  return `${equipamentoId}|${periodo}|${periodicidadeId}`;
}

// ─── 2) GERAÇÃO IDEMPOTENTE — RESERVE, DEPOIS CONSTRUA ────────────────────────

/**
 * Gera as ordens de serviço recorrentes do plano, de forma IDEMPOTENTE.
 *
 * Para cada periodicidade (da versão vigente) × cada equipamento no escopo × cada
 * período DEVIDO (do `criadoEm` do plano até hoje; NUNCA período futuro; teto de
 * {@link MAX_PERIODOS_POR_COMBINACAO} por combinação), a ordem das operações é:
 *
 *   1. reserva a visita em `pmoc_ordens_geradas` (INSERT OR IGNORE + índice UNIQUE);
 *   2. SÓ SE reservou, cria a OS.
 *
 * NUNCA cria a OS antes de reservar: se criasse primeiro e a reserva colidisse
 * (a visita já existe), sobraria uma OS ÓRFÃ que o técnico veria sem plano nenhum.
 * A restrição UNIQUE do banco é a trava de concorrência; a ORDEM das operações é o
 * que impede lixo. Rodar de novo é seguro — o que já existe cai em `jaExistiam`.
 *
 * PERMISSÃO: ação de dono/gestor. A tela DEVE gatear com `podeGerarPmoc(...)`
 * antes de chamar (ver nota de permissão acima). Este serviço não importa hooks.
 *
 * @param ateData opcional; limita o intervalo, mas nunca ultrapassa "agora"
 *        (período futuro jamais é gerado).
 */
export async function gerarOrdensDoPlano(
  planoId: string,
  ateData?: string,
): Promise<ResultadoGeracao> {
  const plano = await getPmocPlano(planoId);
  if (!plano) {
    throw new Error('Plano PMOC não encontrado para gerar as ordens.');
  }
  if (plano.excluidoEm) {
    throw new Error('Este plano está na lixeira. Restaure-o antes de gerar ordens.');
  }
  const versao = await getPmocVersaoVigente(planoId);
  if (!versao) {
    throw new Error('O plano ainda não tem uma versão com periodicidades. Salve as periodicidades antes de gerar ordens.');
  }

  // "hoje" é o teto absoluto: período futuro nunca é gerado. `ateData` só pode
  // ENCURTAR o intervalo, nunca estendê-lo para o futuro.
  const agoraDate = new Date();
  const ateSolicitado = ateData ? new Date(ateData) : agoraDate;
  const ate =
    Number.isNaN(ateSolicitado.getTime()) || ateSolicitado > agoraDate ? agoraDate : ateSolicitado;
  const agoraIso = agoraDate.toISOString();

  // Equipamentos ativos (a service já exclui os da lixeira): um ativo removido do
  // inventário não recebe manutenção — cai em `ignoradas`.
  const equipamentos = await getEquipamentos();
  const mapaEquip = new Map<string, Equipamento>(equipamentos.map((e) => [e.id, e]));

  // Nome do cliente do plano (o plano guarda só o id; a OS precisa do nome).
  const clientes = await getClientes();
  const nomePorCliente = new Map<string, string>(clientes.map((c) => [c.id, c.nome]));
  const clienteNome = plano.clienteId ? nomePorCliente.get(plano.clienteId) ?? '' : '';

  // Snapshot das reservas já existentes, indexado pela MESMA chave lógica do índice
  // UNIQUE. É o que permite reconciliar uma reserva órfã: `registrarOrdemGerada` faz
  // commit (e espelha na nuvem) ANTES de `criarOSManual`, então se a criação da OS
  // falhar no meio — SQLITE_BUSY com o sync concorrente, ou o SO matando o app em
  // background — sobra reserva sem OS. Sem reconciliar, a tentativa seguinte veria
  // `false` no INSERT OR IGNORE, contaria "já existia", e a visita NUNCA ganharia
  // ordem. Silenciosamente.
  const reservas = await getOrdensGeradas(planoId);
  const mapaReservas = new Map(
    reservas.map((r) => [chaveVisita(r.equipamentoId, r.periodo, r.periodicidadeId), r]),
  );

  let criadas = 0;
  let recuperadas = 0;
  let jaExistiam = 0;
  let naLixeira = 0;
  let removidas = 0;
  let ignoradas = 0;
  let omitidas = 0;

  for (const per of versao.periodicidades ?? []) {
    // Um cálculo por periodicidade (é o mesmo para todos os equipamentos dela).
    // Frequência desconhecida → periodosDevidos retorna [] (sem lançar).
    const devidos = periodosDevidos(plano.criadoEm, ate, per.frequencia);
    // Teto defensivo: mantém os mais RECENTES. O descarte é contado e devolvido —
    // truncar em silêncio faria o resultado ler como "cobri tudo" sem ter coberto.
    const periodos = devidos.slice(-MAX_PERIODOS_POR_COMBINACAO);
    const descartadosPorCombinacao = Math.max(0, devidos.length - periodos.length);
    const escopo = resolverEscopo(per, versao, mapaEquip);
    const checklistBase = (per.atividades ?? [])
      .map((t) => t?.trim())
      .filter((t): t is string => !!t && t.length > 0);

    for (const eqId of escopo) {
      const eq = mapaEquip.get(eqId);
      if (!eq) {
        // Equipamento do escopo não existe mais (removido/na lixeira): não dá para
        // titular a OS de um ativo fantasma. Pula e reporta.
        ignoradas += 1;
        continue;
      }
      if (!periodos.length) {
        // Frequência desconhecida OU nenhum bloco no intervalo: nada a agendar.
        ignoradas += 1;
        continue;
      }

      const nomeEquip = descreverEquipamento(eq);
      omitidas += descartadosPorCombinacao;

      for (const periodo of periodos) {
        const vencimento = vencimentoDe(periodo, per.frequencia);

        // Monta a OS uma vez só; serve tanto para criar quanto para reconstruir.
        const construirOS = (id: string) => {
          const checklist: ItemChecklist[] = checklistBase.map((texto) => ({
            id: generateId(),
            texto,
            feito: false,
          }));
          const observacoes = `Gerada automaticamente pelo plano PMOC ${
            plano.numero ? `nº ${plano.numero} ` : ''
          }"${plano.titulo}" — período ${periodo} (${per.nome}).`;
          return criarOSManual({
            id,
            clienteId: plano.clienteId,
            clienteNome,
            titulo: `PMOC ${periodo} - ${nomeEquip}`,
            status: 'agendada',
            dataAgendada: vencimento || undefined,
            checklist,
            observacoes,
          });
        };

        // (a) id da OS que ESTA visita vai criar (referenciado já na reserva).
        const osId = generateId();

        // (b) RESERVA primeiro. `false` = já existe reserva para esta visita.
        const reservou = await registrarOrdemGerada({
          id: generateId(),
          planoId: plano.id,
          equipamentoId: eq.id,
          periodo,
          periodicidadeId: per.id,
          ordemId: osId,
          vencimento: vencimento || undefined,
          criadoEm: agoraIso,
        });

        if (!reservou) {
          // (b.1) RECONCILIAÇÃO. Existir reserva não prova que a OS existe: as duas
          // escritas não são atômicas. Pergunta ao mundo em que estado ele está.
          const reserva = mapaReservas.get(chaveVisita(eq.id, periodo, per.id));
          if (!reserva) {
            // Reserva criada por outro aparelho entre o snapshot e agora. A OS dela
            // virá pelo sync; não duplicamos.
            jaExistiam += 1;
            continue;
          }

          if (!reserva.ordemId) {
            // `criarOSManual` faz `id: parcial.id ?? generateId()`, e `??` NÃO pega
            // string vazia — uma reserva corrompida (ordem_id = '') faria a OS nascer
            // com id vazio, e todo INSERT OR REPLACE seguinte a sobrescreveria. Este
            // projeto já perdeu um inventário inteiro por essa diferença.
            ignoradas += 1;
            continue;
          }

          const os = await getOrdem(reserva.ordemId); // não filtra soft-delete
          if (os && !os.excluidoEm) {
            jaExistiam += 1; // caminho normal: a idempotência funcionando
          } else if (os?.excluidoEm) {
            // O usuário mandou a OS para a lixeira. Recriá-la aqui desfaria uma
            // exclusão deliberada; o caminho é restaurar pela Lixeira.
            naLixeira += 1;
          } else if (await houveExclusaoDefinitiva('ordens_servico', reserva.ordemId)) {
            // Excluída de vez: existe tombstone. Recriar com o mesmo id faria o
            // tombstone matá-la de novo no próximo sync (ping-pong).
            removidas += 1;
          } else {
            // Reserva ÓRFÃ: nunca houve OS. Reconstrói com o id já reservado —
            // reusar o id é seguro justamente porque não há tombstone.
            await construirOS(reserva.ordemId);
            recuperadas += 1;
            // Lembrete de vencimento (15/7/1 dias antes) para a visita reconstruída.
            // Fire-and-forget: notificação nunca pode travar a geração de ordens.
            void agendarLembretesPmoc({
              ordemId: reserva.ordemId,
              vencimento: reserva.vencimento,
              tituloEquipamento: nomeEquip,
              clienteNome,
            }).catch(() => {});
          }
          continue;
        }

        // (c) SÓ agora constrói a OS, com o MESMO id reservado.
        await construirOS(osId);
        criadas += 1;
        // Lembrete proativo de vencimento (item 1.2): agenda os avisos de
        // 15/7/1 dias antes do vencimento desta visita, reaproveitando o mesmo
        // mecanismo de notificação local da agenda (ver services/pmocLembretes).
        // Fire-and-forget: notificação nunca pode travar a geração de ordens.
        void agendarLembretesPmoc({
          ordemId: osId,
          vencimento: vencimento || undefined,
          tituloEquipamento: nomeEquip,
          clienteNome,
        }).catch(() => {});
      }
    }
  }

  return { criadas, recuperadas, jaExistiam, naLixeira, removidas, ignoradas, omitidas };
}

// ─── 4) CRUD de planos e versões (apoiado no versionamento append-only) ───────

function mensagemErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Planos ATIVOS (fora da lixeira), do mais recente ao mais antigo. */
export function listarPlanos(): Promise<PmocPlano[]> {
  return getPmocPlanos();
}

/**
 * Cria um plano PMOC a partir de um parcial. Defaults sãos: situação 'rascunho'
 * (estado OPERACIONAL, nunca "conforme"), título aparado. Usa `||` no id porque a
 * tela monta um cadastro novo com id:'' (string vazia) — `??` não a trataria como
 * ausente e todo plano novo colidiria no mesmo id.
 */
export async function criarPlano(parcial: Partial<PmocPlano>): Promise<PmocPlano> {
  const agora = new Date().toISOString();
  const plano: PmocPlano = {
    id: parcial.id || generateId(),
    clienteId: parcial.clienteId,
    contratoId: parcial.contratoId,
    numero: parcial.numero,
    titulo: parcial.titulo?.trim() || 'Plano PMOC',
    situacao: parcial.situacao ?? 'rascunho',
    versaoVigente: parcial.versaoVigente,
    criadoEm: parcial.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  await savePmocPlano(plano);
  return plano;
}

/**
 * Grava as periodicidades + escopo do plano na VERSÃO DE TRABALHO (a de maior
 * número). Regra de versionamento:
 *
 *   • sem nenhuma versão ainda → cria a versão 1 (rascunho);
 *   • última versão AINDA NÃO aprovada → edita no lugar (mesmo id/número);
 *   • última versão JÁ APROVADA → cria uma NOVA versão (número+1). Versão aprovada
 *     é APPEND-ONLY: é a prova do que o responsável técnico assinou, então `save`
 *     no banco LANÇA se tentarmos alterá-la. Por isso ramificamos numa versão nova
 *     e limpa (sem responsável/doc/aprovação herdados; carrega só as referências
 *     normativas como ponto de partida). O plano volta a 'em_revisao'.
 *
 * NÃO mexe em `versaoVigente`: esse ponteiro é o da versão EM VIGOR (a última
 * aprovada) e só muda em `aprovarVersao`. Enquanto não houver aprovação,
 * `getPmocVersaoVigente` cai na versão mais recente por conta própria.
 */
export async function salvarPeriodicidades(
  planoId: string,
  periodicidades: PmocPeriodicidade[],
  equipamentoIds: string[],
): Promise<PmocPlanoVersao> {
  const plano = await getPmocPlano(planoId);
  if (!plano) {
    throw new Error('Plano PMOC não encontrado.');
  }
  const agora = new Date().toISOString();
  const versoes = await getPmocVersoes(planoId);
  const ultima = versoes[0] ?? null; // ordenadas por número DESC

  // Ramifica numa versão nova quando não há versão OU a última já foi aprovada.
  if (!ultima || ultima.aprovadoEm) {
    const nova: PmocPlanoVersao = {
      id: generateId(),
      planoId,
      numeroVersao: await proximoNumeroVersaoPmoc(planoId),
      periodicidades,
      equipamentoIds,
      referencias: ultima?.referencias ?? [],
      criadoEm: agora,
    };
    try {
      await savePmocVersao(nova);
    } catch (e) {
      throw new Error(`Não foi possível salvar as periodicidades: ${mensagemErro(e)}`);
    }
    // Ramificar de uma versão aprovada reabre o plano para revisão.
    if (ultima?.aprovadoEm) {
      await savePmocPlano({ ...plano, situacao: 'em_revisao', atualizadoEm: agora });
    }
    return nova;
  }

  // Última versão ainda em rascunho: edita no lugar (savePmocVersao não lança
  // porque a linha existente não tem aprovado_em).
  const editada: PmocPlanoVersao = {
    ...ultima,
    periodicidades,
    equipamentoIds,
  };
  try {
    await savePmocVersao(editada);
  } catch (e) {
    throw new Error(`Não foi possível salvar as periodicidades: ${mensagemErro(e)}`);
  }
  return editada;
}

/**
 * APROVAÇÃO TÉCNICA (operacional) de uma versão: registra QUEM assinou e o
 * documento de responsabilidade (ART/RRT/TRT — o conselho varia), carimba
 * `aprovadoEm` e aponta o plano para essa versão como VIGENTE.
 *
 * IMPORTANTE (caveat legal): isto NÃO é uma declaração de conformidade legal do
 * app. Aprovar apenas grava que um responsável técnico habilitado — não o app —
 * validou o conteúdo do plano. A partir daqui a versão vira append-only: o banco
 * recusa qualquer alteração; uma revisão futura nasce como versão nova.
 */
export async function aprovarVersao(
  planoId: string,
  numeroVersao: number,
  responsavelTecnico: string,
  docResponsabilidade: string,
): Promise<PmocPlanoVersao> {
  if (!responsavelTecnico || !responsavelTecnico.trim()) {
    throw new Error('Informe o responsável técnico habilitado para aprovar a versão.');
  }
  if (!docResponsabilidade || !docResponsabilidade.trim()) {
    throw new Error('Informe o documento de responsabilidade (ART/RRT/TRT) para aprovar a versão.');
  }
  const versoes = await getPmocVersoes(planoId);
  const alvo = versoes.find((v) => v.numeroVersao === numeroVersao);
  if (!alvo) {
    throw new Error('Versão não encontrada para aprovar.');
  }
  if (alvo.aprovadoEm) {
    throw new Error('Esta versão já está aprovada e não pode ser reaprovada. Crie uma nova versão.');
  }

  const aprovada: PmocPlanoVersao = {
    ...alvo,
    responsavelTecnico: responsavelTecnico.trim(),
    docResponsabilidade: docResponsabilidade.trim(),
    aprovadoEm: new Date().toISOString(),
  };
  try {
    // Transição rascunho → aprovada: a linha existente ainda não tem aprovado_em,
    // então savePmocVersao aceita esta ÚNICA escrita que a carimba.
    await savePmocVersao(aprovada);
  } catch (e) {
    throw new Error(`Não foi possível aprovar a versão: ${mensagemErro(e)}`);
  }

  const plano = await getPmocPlano(planoId);
  if (plano) {
    await savePmocPlano({
      ...plano,
      versaoVigente: numeroVersao,
      situacao: 'vigente', // estado OPERACIONAL do plano, jamais afirmação de conformidade
      atualizadoEm: new Date().toISOString(),
    });
  }
  return aprovada;
}

// ─── 5) RECONCILIAÇÃO DE LEMBRETES (gancho de sync) ───────────────────────────

/**
 * Reconcilia os lembretes locais de vencimento PMOC com o estado atual (planos
 * ativos × visitas geradas × status da OS de cada uma). Cancela o lembrete de
 * visitas cuja OS já não existe, está na lixeira ou terminou
 * (concluída/cancelada) e (re)agenda as demais. Mesmo motivo da reconciliação
 * de agenda (`agenda.ts.resincronizarLembretes`): o PULL do sync grava
 * `ordens_servico`/`pmoc_ordens_geradas` direto no SQLite (localUpsert*, em
 * cloudSync.ts), sem passar por `atualizarStatusOS`/`gerarOrdensDoPlano` — sem
 * isto, uma OS concluída em OUTRO aparelho continuaria lembrando neste depois
 * do sync. NUNCA lança.
 *
 * GAP CONHECIDO (aceito, minimal): só varre planos ATIVOS (`getPmocPlanos`) —
 * um plano movido para a lixeira com visitas pendentes não tem o lembrete
 * cancelado por aqui (a OS em si segue ativa). Caminho raro e fora do escopo
 * pedido; documentado para não parecer descuido.
 */
export async function resincronizarLembretesPmoc(): Promise<void> {
  try {
    const planos = await getPmocPlanos();
    const equipamentos = await getEquipamentos();
    const mapaEquip = new Map(equipamentos.map((e) => [e.id, e]));
    const clientes = await getClientes();
    const nomePorCliente = new Map(clientes.map((c) => [c.id, c.nome]));

    for (const plano of planos) {
      const clienteNome = plano.clienteId ? nomePorCliente.get(plano.clienteId) : undefined;
      const geradas = await getOrdensGeradas(plano.id);
      for (const g of geradas) {
        try {
          const os = await getOrdem(g.ordemId); // não filtra soft-delete
          if (!os || os.excluidoEm || os.status === 'concluida' || os.status === 'cancelada') {
            await cancelarLembretesPmoc(g.ordemId);
            continue;
          }
          const eq = mapaEquip.get(g.equipamentoId);
          await agendarLembretesPmoc({
            ordemId: g.ordemId,
            vencimento: g.vencimento,
            tituloEquipamento: eq ? descreverEquipamento(eq) : 'Equipamento',
            clienteNome,
          });
        } catch {
          // pula visita problemática, segue o resto
        }
      }
    }
  } catch {
    // best-effort: reconciliação de lembretes PMOC nunca afeta os dados locais
  }
}
