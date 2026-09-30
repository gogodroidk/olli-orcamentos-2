/**
 * Radar de clientes — PÓS-VENDA, "Clientes para lembrar". Ideia do dono do produto:
 * "esse cliente faz 6 meses que você não vai lá". Identifica clientes que já tiveram
 * um SERVIÇO CONCLUÍDO e estão na hora de repetir (pelo ofício do prestador), para ele
 * lembrar o cliente ANTES de o cliente chamar o concorrente.
 *
 * A REGRA mora em `utils/posVenda.ts` (TS puro, a MESMA que o painel web usa). Aqui
 * fica só a leitura local e a conversão em "serviços concluídos":
 *  - orçamento aprovado ou convertido (data da aprovação ≈ `atualizadoEm`, como no
 *    radar de cobrança; cai para `criadoEm` em registro legado);
 *  - agendamento concluído (fim, ou início);
 *  - recibo emitido (data do recebimento, ou criação).
 * Proposta só enviada NÃO conta mais (até 30/09 contava): lead que nunca fechou não é
 * manutenção a lembrar — é o follow-up (`radarFollowUp.ts`) que cuida dele.
 *
 * O INTERVALO vem do ofício (`retorno.meses` em `verticais.ts`: ar-condicionado 6,
 * elétrica 12, jardim 3…). Sem ofício escolhido, 6 meses — o mesmo ritmo (~150 dias)
 * que o radar tinha para todo mundo.
 *
 * "Lembrar no WhatsApp" registra o envio (`registroEnvios.ts`): o cliente sai da lista
 * por 30 dias. "Adiar" continua existindo (30 dias, sincronizado em `radar.snooze`).
 *
 * GATE DE PLANO (Onda 1): este service SEMPRE devolve a lista completa —
 * ele não conhece plano nem faz corte nenhum. Quem decide quantos itens
 * mostrar de graça (1 cliente completo + "+N no Pro") é a tela que consome
 * `clientesParaReconquistar()` (hoje: HomeScreen, via
 * `usePlano().temAcesso('radar_clientes')`). Mantém a regra de negócio do
 * radar isolada de billing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getClientes, getOrcamentos, getRecibos, getEmpresa } from '../database/database';
import { getAgendamentos } from './agenda';
import { Cliente } from '../types';
import { RADAR_SNOOZE_KEY } from './storageKeys';
import { pushExtraChave } from './cloudSync';
import { lerLembretesEnviados, registrarLembreteEnviado } from './registroEnvios';
import type { VerticalId } from './verticais';
import {
  listarClientesParaLembrar,
  mensagemLembrete,
  msDe,
  msDoRecibo,
  retornoDoOficio,
  type ServicoConcluido,
} from '../utils/posVenda';
import { abrirWhatsApp } from '../utils/exportarDocumento';

const MS_POR_DIA = 86400000;

// Nome do prestador e ofício (getEmpresa) cacheados em memória por processo: a
// mensagem de lembrete precisa ser SÍNCRONA (chamada direto no onPress do botão
// "Lembrar no WhatsApp"), então buscamos a empresa uma vez em
// `clientesParaReconquistar` — que já roda a cada carregamento da tela — e
// guardamos aqui para `mensagemReconquista` ler sem precisar de await.
let nomePrestadorCache: string | null = null;
let verticaisCache: VerticalId[] | undefined;

export interface ClienteParaReconquistar {
  cliente: Cliente;
  /** ISO do último serviço concluído (a data-base do lembrete). */
  ultimaInteracao: string | null;
  mesesSemContato: number;
  motivo: string;
  /** ISO do último lembrete enviado por aqui, ou null. */
  lembradoEm: string | null;
}

/** Lê o mapa clienteId→dataAte (ISO) de adiamentos. Nunca lança: falha = mapa vazio. */
async function lerSnooze(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(RADAR_SNOOZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Adia um cliente do radar por N dias (default 30) a partir de agora. */
export async function adiarClienteRadar(clienteId: string, dias = 30): Promise<void> {
  try {
    const mapa = await lerSnooze();
    const dataAte = new Date(Date.now() + dias * MS_POR_DIA).toISOString();
    mapa[clienteId] = dataAte;
    await AsyncStorage.setItem(RADAR_SNOOZE_KEY, JSON.stringify(mapa));
    // Espelha o adiamento na nuvem (extras_sync) — best-effort, nunca trava a tela.
    void pushExtraChave('radar.snooze').catch(() => {});
  } catch {
    // adiar é best-effort: falha aqui não deve travar a tela
  }
}

/** Serviços concluídos (cliente + quando) a partir das listagens locais. */
async function servicosConcluidos(): Promise<ServicoConcluido[]> {
  const [orcamentos, agendamentos, recibos] = await Promise.all([
    getOrcamentos(), getAgendamentos(), getRecibos(),
  ]);
  const servicos: ServicoConcluido[] = [];
  for (const o of orcamentos) {
    if (o.status !== 'aprovado' && o.status !== 'convertido') continue;
    servicos.push({ clienteId: o.clienteId, quando: msDe(o.atualizadoEm || o.criadoEm) });
  }
  for (const a of agendamentos) {
    if (a.status !== 'concluido') continue;
    servicos.push({ clienteId: a.clienteId, quando: msDe(a.fim || a.inicio) });
  }
  for (const r of recibos) {
    if (r.estornadoEm) continue; // recebimento estornado não prova serviço
    servicos.push({ clienteId: r.clienteId, quando: msDoRecibo(r.dataRecebimento, r.criadoEm) });
  }
  return servicos;
}

/**
 * Clientes na hora de ser lembrados (pós-venda), do mais atrasado primeiro.
 * Respeita adiamentos e lembretes recentes. Quem nunca teve serviço concluído
 * NUNCA entra. Mantém o nome antigo (`clientesParaReconquistar`) porque Home,
 * Início do desktop, Clientes e o Ritual diário já o consomem.
 */
export async function clientesParaReconquistar(): Promise<ClienteParaReconquistar[]> {
  const [clientes, servicos, snooze, lembrados, empresa] = await Promise.all([
    getClientes(), servicosConcluidos(), lerSnooze(), lerLembretesEnviados(), getEmpresa().catch(() => null),
  ]);
  nomePrestadorCache = empresa?.nomePrestador || empresa?.nome || null;
  verticaisCache = empresa?.verticais;

  const porId = new Map(clientes.map(c => [c.id, c] as const));
  const lista = listarClientesParaLembrar({
    clientes,
    servicos,
    mesesIntervalo: retornoDoOficio(empresa?.verticais).meses,
    lembrados,
    adiados: snooze,
  });

  const resultado: ClienteParaReconquistar[] = [];
  for (const item of lista) {
    const cliente = porId.get(item.id);
    if (!cliente) continue;
    resultado.push({
      cliente,
      ultimaInteracao: item.ultimoServico,
      mesesSemContato: item.meses,
      motivo: `Último serviço há ${item.meses} ${item.meses === 1 ? 'mês' : 'meses'}`,
      lembradoEm: item.lembradoEm,
    });
  }
  return resultado;
}

/**
 * Mensagem de WhatsApp pronta para lembrar o cliente da manutenção — em nome do
 * prestador, citando o serviço do ofício dele. Síncrona de propósito (usada direto
 * no onPress): nome e ofício vêm do cache preenchido pela última chamada a
 * `clientesParaReconquistar` (sempre chamada antes, ao carregar a tela). Sem cache
 * ainda, a mensagem sai sem o nome e com o serviço genérico.
 */
export function mensagemReconquista(nome: string, meses: number): string {
  return mensagemLembrete({ nome, meses }, verticaisCache, nomePrestadorCache);
}

/**
 * Lembrar com 1 toque: abre o WhatsApp com a mensagem pronta e registra o lembrete
 * (o cliente sai da lista por 30 dias). `false` = sem telefone (a tela avisa).
 */
export async function lembrarNoWhatsApp(item: ClienteParaReconquistar): Promise<boolean> {
  const telefone = (item.cliente.telefone || '').trim();
  if (!telefone) return false;
  await abrirWhatsApp(telefone, mensagemReconquista(item.cliente.nome, item.mesesSemContato));
  await registrarLembreteEnviado(item.cliente.id);
  return true;
}
