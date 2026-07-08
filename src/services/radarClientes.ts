/**
 * Radar de clientes — ideia do dono do produto: "esse cliente faz 6 meses que
 * você não vai lá". Identifica clientes que já tiveram algum atendimento mas
 * sumiram do radar, para o prestador reativar a manutenção ANTES do cliente
 * chamar o concorrente.
 *
 * Fonte da "última interação" (a mais recente entre as três):
 *  - orçamento aprovado ou enviado (aguardando_assinatura entra como "enviado");
 *  - agendamento concluído;
 *  - recibo emitido.
 * Cliente sem NENHUMA dessas três nunca entra no radar — é lead frio, não
 * manutenção (o dono foi claro: reconquista é de quem JÁ foi atendido).
 *
 * Volume é pequeno (app local, uso de um autônomo) — por isso montamos tudo a
 * partir das listagens já existentes em database.ts/services/agenda.ts, sem
 * criar query nova nem tocar em database.ts.
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
import { montarMensagemReconquista } from '../utils/mensagensOrcamento';
import { pushExtraChave } from './cloudSync';

/** Limiar de dias sem contato para o cliente entrar no radar (~5 meses). */
const DIAS_LIMIAR = 150;
const MS_POR_DIA = 86400000;

// Nome do prestador (getEmpresa) cacheado em memória por processo: a
// mensagem de reconquista precisa ser SÍNCRONA (chamada direto no onPress do
// botão "Chamar no WhatsApp"), então buscamos a empresa uma vez em
// `clientesParaReconquistar` — que já roda a cada carregamento da tela — e
// guardamos aqui para `mensagemReconquista` ler sem precisar de await.
let nomePrestadorCache: string | null = null;

export interface ClienteParaReconquistar {
  cliente: Cliente;
  ultimaInteracao: string | null;
  mesesSemContato: number;
  motivo: string;
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

/** Data (ISO) mais recente entre as fornecidas, ignorando valores vazios/invalidos. */
function maisRecente(...datas: (string | undefined | null)[]): string | null {
  let melhor: string | null = null;
  let melhorMs = -Infinity;
  for (const d of datas) {
    if (!d) continue;
    const ms = new Date(d).getTime();
    if (isNaN(ms)) continue;
    if (ms > melhorMs) { melhorMs = ms; melhor = d; }
  }
  return melhor;
}

/**
 * Monta, para cada cliente, a data da última interação real (orçamento
 * aprovado/enviado, agendamento concluído ou recibo) — ou null se nunca houve.
 */
async function mapaUltimaInteracao(): Promise<Map<string, string | null>> {
  const [orcamentos, agendamentos, recibos] = await Promise.all([
    getOrcamentos(), getAgendamentos(), getRecibos(),
  ]);

  const mapa = new Map<string, string | null>();

  for (const o of orcamentos) {
    if (!o.clienteId) continue;
    if (o.status !== 'aprovado' && o.status !== 'enviado' && o.status !== 'aguardando_assinatura') continue;
    const atual = mapa.get(o.clienteId) ?? null;
    mapa.set(o.clienteId, maisRecente(atual, o.criadoEm));
  }

  for (const a of agendamentos) {
    if (!a.clienteId || a.status !== 'concluido') continue;
    const atual = mapa.get(a.clienteId) ?? null;
    mapa.set(a.clienteId, maisRecente(atual, a.fim || a.inicio));
  }

  for (const r of recibos) {
    if (!r.clienteId) continue;
    const atual = mapa.get(r.clienteId) ?? null;
    mapa.set(r.clienteId, maisRecente(atual, r.dataRecebimento || r.criadoEm));
  }

  return mapa;
}

function mesesEntre(dataISO: string): number {
  const dias = Math.floor((Date.now() - new Date(dataISO).getTime()) / MS_POR_DIA);
  return Math.max(1, Math.round(dias / 30));
}

/**
 * Clientes candidatos a reconquista: >= 150 dias sem interação, ordenados do
 * mais antigo (maior tempo sumido primeiro). Respeita adiamentos ativos.
 * Cliente sem nenhuma interação NUNCA entra (lead frio não é manutenção).
 */
export async function clientesParaReconquistar(): Promise<ClienteParaReconquistar[]> {
  const [clientes, ultimaInteracaoPorCliente, snooze, empresa] = await Promise.all([
    getClientes(), mapaUltimaInteracao(), lerSnooze(), getEmpresa().catch(() => null),
  ]);
  nomePrestadorCache = empresa?.nomePrestador || empresa?.nome || null;

  const agora = Date.now();
  const resultado: ClienteParaReconquistar[] = [];

  for (const cliente of clientes) {
    const ultima = ultimaInteracaoPorCliente.get(cliente.id);
    if (!ultima) continue; // nunca interagiu → lead frio, fora do radar

    const dataAteSnooze = snooze[cliente.id];
    if (dataAteSnooze && new Date(dataAteSnooze).getTime() > agora) continue; // adiado

    const dias = Math.floor((agora - new Date(ultima).getTime()) / MS_POR_DIA);
    if (dias < DIAS_LIMIAR) continue;

    const meses = mesesEntre(ultima);
    resultado.push({
      cliente,
      ultimaInteracao: ultima,
      mesesSemContato: meses,
      motivo: `${meses} meses sem contato`,
    });
  }

  // Mais antigo primeiro (quem sumiu há mais tempo precisa de atenção primeiro).
  resultado.sort((a, b) => new Date(a.ultimaInteracao ?? 0).getTime() - new Date(b.ultimaInteracao ?? 0).getTime());
  return resultado;
}

/**
 * Mensagem de WhatsApp pronta para reconquistar o cliente — calorosa e
 * profissional, com o nome do prestador (getEmpresa) quando disponível.
 * Síncrona de propósito (usada direto no onPress do botão "Chamar no
 * WhatsApp"): o nome do prestador vem do cache preenchido pela última
 * chamada a `clientesParaReconquistar` (sempre chamada antes, ao carregar a
 * tela). Sem cache ainda (ex.: uso isolado), a mensagem sai sem o nome.
 */
export function mensagemReconquista(nome: string, meses: number): string {
  return montarMensagemReconquista(nome, meses, nomePrestadorCache);
}
