/**
 * GERAÇÃO IDEMPOTENTE das visitas do contrato recorrente — reserve, construa, confirme.
 *
 * Quem grava é uma PORTA (`PortaGeracaoContratos`): o app e o painel passam uma
 * porta sobre o supabase-js (RLS do usuário logado), o worker passa uma sobre o
 * PostgREST com service_role (cron), os testes passam uma em memória. A ordem das
 * operações é a mesma em todos, e é ela — mais o índice UNIQUE do banco — que impede
 * visita dupla:
 *
 *   1. RESERVA a visita em `contrato_visitas` (insert que ignora duplicata; chave
 *      única = tenant + contrato + mês). Só UM gerador ganha a reserva.
 *   2. CONSTRÓI a OS e o agendamento com ids DETERMINÍSTICOS (derivados de contrato +
 *      mês), também com insert que ignora duplicata. Se dois geradores chegarem aqui
 *      (um recuperando uma reserva órfã do outro), a segunda escrita é no-op.
 *   3. CONFIRMA a reserva (`ordem_criada_em`). Só depois disso a visita conta como
 *      "já existe" — uma reserva sem confirmação é ÓRFÃ (o app morreu entre 1 e 2) e é
 *      reconstruída na próxima execução. Uma reserva confirmada NUNCA é reconstruída:
 *      se o prestador apagou aquela OS, apagar foi uma decisão dele.
 *
 * Falha numa visita não derruba as outras: conta em `falhas` e a próxima execução
 * tenta de novo (a reserva fica órfã, não some). Nunca lança por visita; lança só se
 * a leitura das reservas falhar (sem saber o que existe, não se gera nada — fail-closed).
 */
import type { ContratoRecorrente } from '../types/index.ts';
import { type Linha, linhasDaVisita, visitasParaGerar } from './contratoRecorrente.ts';

export interface ReservaExistente {
  id: string;
  contratoId: string;
  periodo: string;
  /** Preenchido quando a OS e o agendamento foram gravados com sucesso. */
  ordemCriadaEm: string | null;
}

export interface PortaGeracaoContratos {
  /** Reservas já existentes destes contratos. Deve LANÇAR se não conseguir ler. */
  reservas(contratoIds: string[]): Promise<ReservaExistente[]>;
  /** Insere a reserva se não existir. `true` = esta chamada criou; `false` = já existia. */
  reservar(linha: Linha): Promise<boolean>;
  /** Insere a OS se não existir (id determinístico). */
  inserirOrdem(linha: Linha): Promise<void>;
  /** Insere o agendamento se não existir (id determinístico). */
  inserirAgendamento(linha: Linha): Promise<void>;
  /** Marca a reserva como construída. */
  confirmar(reservaId: string, quando: string): Promise<void>;
  /** Próximo sequencial de OS do tenant (o número `OS-0001` sai daqui). */
  proximoSequencialOs(userId: string): Promise<number>;
}

export interface ResultadoGeracaoContratos {
  /** Visitas novas (OS + agendamento) criadas agora. */
  criadas: number;
  /** Reservas órfãs reconstruídas (a execução anterior caiu no meio). */
  recuperadas: number;
  /** Visitas que já existiam. Não é erro: é a idempotência funcionando. */
  jaExistiam: number;
  /** Visitas que falharam agora e serão tentadas de novo na próxima execução. */
  falhas: number;
  /** Contratos sem dono conhecido (linha sem user_id) — não dá para saber o tenant. */
  ignorados: number;
  /** Visitas devidas deixadas para a próxima execução por causa do teto `limite`. */
  adiadas: number;
}

export function numeroOs(sequencial: number): string {
  return `OS-${String(Math.max(1, Math.floor(sequencial))).padStart(4, '0')}`;
}

/**
 * Gera as visitas devidas dos contratos. `userIdPadrao` é o tenant de quem está
 * gerando pelo app/painel quando a linha não trouxe `user_id` (não acontece em
 * leitura do banco; existe para os testes e para o contrato recém-criado).
 */
export async function gerarVisitasDosContratos(
  porta: PortaGeracaoContratos,
  contratos: readonly ContratoRecorrente[],
  opcoes: {
    agora?: Date;
    userIdPadrao?: string | null;
    /**
     * Teto de visitas ESCRITAS nesta execução (o cron tem limite de requisições por
     * invocação). O que passar do teto fica em `adiadas` e sai na próxima rodada.
     */
    limite?: number;
  } = {},
): Promise<ResultadoGeracaoContratos> {
  const agora = opcoes.agora ?? new Date();
  const limite = Number.isFinite(opcoes.limite) && (opcoes.limite as number) > 0 ? Math.floor(opcoes.limite as number) : Infinity;
  const resultado: ResultadoGeracaoContratos = { criadas: 0, recuperadas: 0, jaExistiam: 0, falhas: 0, ignorados: 0, adiadas: 0 };
  let escritas = 0;

  const planos = contratos
    .map((c) => ({ c, visitas: visitasParaGerar(c, agora), userId: c.userId || opcoes.userIdPadrao || '' }))
    .filter((p) => p.visitas.length > 0);
  if (!planos.length) return resultado;

  // Sem saber o que já existe, não se gera nada (lança para quem chamou mostrar erro).
  const existentes = await porta.reservas(planos.map((p) => p.c.id));
  const mapa = new Map(existentes.map((r) => [`${r.contratoId}|${r.periodo}`, r]));

  // Numeração lazy e por tenant: só lê a sequência se houver OS nova para criar.
  const proximoPorTenant = new Map<string, number>();
  const tirarNumero = async (userId: string): Promise<string> => {
    let seq = proximoPorTenant.get(userId);
    if (seq === undefined) seq = await porta.proximoSequencialOs(userId);
    proximoPorTenant.set(userId, seq + 1);
    return numeroOs(seq);
  };

  for (const { c, visitas, userId } of planos) {
    if (!userId) {
      resultado.ignorados += 1;
      continue;
    }
    for (const visita of visitas) {
      const existente = mapa.get(`${c.id}|${visita.periodo}`);
      if (existente?.ordemCriadaEm) {
        resultado.jaExistiam += 1;
        continue;
      }
      if (escritas >= limite) {
        resultado.adiadas += 1;
        continue;
      }
      escritas += 1;
      try {
        const linhas = linhasDaVisita(c, visita, { userId, numeroOs: '', agora });
        if (!existente) {
          const reservou = await porta.reservar(linhas.reserva);
          if (!reservou) {
            // Outro gerador reservou entre a leitura e agora: ele constrói.
            resultado.jaExistiam += 1;
            continue;
          }
        }
        // O número só é tirado DEPOIS da reserva: perder a corrida não queima número.
        await porta.inserirOrdem({ ...linhas.ordem, numero: await tirarNumero(userId) });
        await porta.inserirAgendamento(linhas.agendamento);
        await porta.confirmar(String(linhas.reserva.id), agora.toISOString());
        if (existente) resultado.recuperadas += 1;
        else resultado.criadas += 1;
      } catch {
        resultado.falhas += 1;
      }
    }
  }
  return resultado;
}

/** Frase honesta do resultado para a tela ("2 visitas novas na agenda"). '' = nada a dizer. */
export function resumoDaGeracao(r: ResultadoGeracaoContratos): string {
  const partes: string[] = [];
  const novas = r.criadas + r.recuperadas;
  if (novas) partes.push(novas === 1 ? '1 visita nova na agenda' : `${novas} visitas novas na agenda`);
  if (r.falhas) partes.push(r.falhas === 1 ? '1 visita não foi gerada (tento de novo depois)' : `${r.falhas} visitas não foram geradas (tento de novo depois)`);
  if (r.adiadas) partes.push(r.adiadas === 1 ? '1 visita fica para a próxima rodada' : `${r.adiadas} visitas ficam para a próxima rodada`);
  return partes.join(' · ');
}
