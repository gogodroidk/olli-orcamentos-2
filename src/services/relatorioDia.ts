import * as Speech from 'expo-speech';
import {
  getOrcamentos, getRecibos, getClientes, saveRelatorioDia, getRelatorioDia as getRelatorioDiaRow,
} from '../database/database';
import { getAgendamentosDoDia } from './agenda';
import { escopoAgendaAtual } from './escopoAgendaAtual';
import { todayISO } from '../utils/date';
import {
  agendaIndisponivel, notaComoTexto, relatorioParaTexto, resumirAgendaDoDia, type RelatorioDia,
} from '../utils/relatorioDiaTexto';

// Tipo e narrativa moram no util puro (testável em node); a tela e o ritual
// continuam importando daqui.
export { notaComoTexto, relatorioParaTexto, type RelatorioDia };

/** true se o ISO/timestamp cai no dia local `dataChave` ('YYYY-MM-DD'). */
function ehDoDia(iso: string | undefined | null, dataChave: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}` === dataChave;
}

/**
 * Compila o relatório do dia a partir do banco local. Sem parâmetro, usa hoje.
 * Ao gerar o relatório do DIA CORRENTE (hoje), salva automaticamente o snapshot
 * (saveRelatorioDia) para entrar no histórico — dias passados não são resalvos.
 */
export async function gerarRelatorioDia(data?: string): Promise<RelatorioDia> {
  const hoje = todayISO();
  const dataChave = data ?? hoje;

  const [orcamentos, recibos, clientes, agendaDaEquipe, escopo] = await Promise.all([
    getOrcamentos(),
    getRecibos(),
    getClientes(),
    // Só sabemos buscar agenda por Date; se for outro dia, reconstrói a partir da chave.
    getAgendamentosDoDia(dataChave === hoje ? new Date() : new Date(`${dataChave}T00:00:00`)),
    // A leitura acima é da EQUIPE inteira. O técnico conta só as visitas dele
    // (mesma regra da Agenda/Hoje); papel desconhecido = agenda fora do resumo.
    escopoAgendaAtual(),
  ]);
  const agendamentos = resumirAgendaDoDia(agendaDaEquipe, escopo);

  const orcamentosDoDia = orcamentos.filter(o => ehDoDia(o.criadoEm, dataChave));
  const criados = orcamentosDoDia;
  // 'recusado' fica fora: a narrativa trata 'enviados' como aguardando resposta,
  // e um orcamento ja recusado nao esta aguardando nada.
  const enviados = orcamentosDoDia.filter(o => o.status === 'enviado' || o.status === 'aguardando_assinatura' || o.status === 'aprovado');
  const aprovados = orcamentosDoDia.filter(o => o.status === 'aprovado');

  const recibosDoDia = recibos.filter(r => ehDoDia(r.dataRecebimento, dataChave) || ehDoDia(r.criadoEm, dataChave));
  const clientesNovosDoDia = clientes.filter(c => ehDoDia(c.criadoEm, dataChave));

  const relatorio: RelatorioDia = {
    data: dataChave,
    orcamentos: {
      criados: criados.length,
      criadosValor: criados.reduce((s, o) => s + o.valorTotal, 0),
      enviados: enviados.length,
      enviadosValor: enviados.reduce((s, o) => s + o.valorTotal, 0),
      aprovados: aprovados.length,
      aprovadosValor: aprovados.reduce((s, o) => s + o.valorTotal, 0),
    },
    recibos: {
      emitidos: recibosDoDia.length,
      totalRecebido: recibosDoDia.reduce((s, r) => s + r.valorRecebido, 0),
    },
    agendamentos,
    clientesNovos: clientesNovosDoDia.length,
    // Agenda ilegível no escopo certo não é "sem agenda": o dia não vira vazio.
    semMovimentos:
      criados.length === 0 && recibosDoDia.length === 0 &&
      agendamentos.total === 0 && !agendaIndisponivel({ agendamentos }) && clientesNovosDoDia.length === 0,
  };

  // Snapshot automático só do dia CORRENTE — histórico de dias passados não se
  // reescreve sozinho (o usuário revisita o passado, não o recalcula).
  if (dataChave === hoje) {
    try {
      // PRESERVA a nota manual já escrita (nota + carimbo autoral): a regeração
      // recomputa os números, mas a nota do dono não pode ser apagada por um foco
      // de tela nem por um sync.
      const anterior = await getRelatorioDiaRow(dataChave);
      const prev = anterior?.dados as RelatorioDia | undefined;
      if (prev?.nota) relatorio.nota = prev.nota;
      if (prev?.notaEm) relatorio.notaEm = prev.notaEm;
      // PRESERVA o criado_em anterior: uma simples VISUALIZAÇÃO não pode gerar um
      // carimbo mais novo que a nota autorada em outro aparelho (senão o LWW do
      // sync a apagaria). Só a autoria (salvarNotaDia) avança o carimbo.
      // Sem o escopo da agenda, não regrava: um retrato bom de mais cedo vale
      // mais que um com a agenda de fora (a próxima abertura com papel salva).
      if (!agendaIndisponivel(relatorio)) await saveRelatorioDia(dataChave, relatorio, anterior?.criadoEm);
    } catch {
      // salvar o snapshot é best-effort: nunca deve quebrar a geração/leitura do relatório
    }
  }

  return relatorio;
}

/**
 * Salva a nota manual do dono para um dia, preservando os números já compilados.
 * Lê o snapshot existente (ou compila na hora, se ainda não houver) e reescreve
 * só a nota — o `criado_em` novo faz a nota vencer no LWW da sincronização.
 */
export async function salvarNotaDia(data: string, nota: string): Promise<void> {
  const row = await getRelatorioDiaRow(data);
  const base = (row?.dados as RelatorioDia | undefined) ?? await gerarRelatorioDia(data);
  const limpa = nota.trim();
  // Autoria da nota: carimba notaEm=agora (LWW próprio da nota) E deixa o
  // saveRelatorioDia avançar o criado_em (sem passar criadoEm) — a autoria vence.
  await saveRelatorioDia(data, { ...base, nota: limpa || undefined, notaEm: new Date().toISOString() });
}

/** Lê o snapshot salvo de um dia anterior (histórico), ou null se nunca foi gerado/salvo. */
export async function getRelatorioDiaSalvo(data: string): Promise<RelatorioDia | null> {
  const row = await getRelatorioDiaRow(data);
  return row ? (row.dados as RelatorioDia) : null;
}

/**
 * Fala o relatório em voz alta (PT-BR) usando expo-speech. Interrompe qualquer
 * fala anterior antes de começar (evita sobrepor áudio se o usuário reabrir a tela).
 * `onFim` é chamado quando a fala termina naturalmente OU dá erro — a tela usa
 * para voltar o botão de "Parar" para "Ouvir relatório" sem esperar um toque.
 */
export async function falarRelatorio(r: RelatorioDia, onFim?: () => void): Promise<void> {
  const texto = relatorioParaTexto(r) + notaComoTexto(r);
  try {
    await Speech.stop();
  } catch {
    // stop antes de falar é best-effort
  }
  Speech.speak(texto, {
    language: 'pt-BR',
    onDone: onFim,
    onStopped: onFim,
    onError: onFim,
  });
}

/** Interrompe a fala em andamento (usado no botão "Parar" e no cleanup da tela). */
export function pararFala(): void {
  try {
    Speech.stop();
  } catch {
    // nunca deve quebrar o cleanup
  }
}
