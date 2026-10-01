/**
 * Regras PURAS da tela Agenda do celular (sem React Native, sem banco, sem rede):
 * quem vê o quê, que hora um compromisso novo nasce, quanto ele dura, o que é
 * "Dia todo" e a busca de cliente. Ficam aqui, fora da tela, para o teste
 * (`scripts/teste-agenda-tela.ts`) rodar no `node` puro.
 *
 * A duração por tipo e o "sem hora marcada" são as MESMAS regras do painel web
 * (`webapp/src/pages/olli/agenda/dominio.ts`). Mudou lá, muda aqui: um
 * compromisso não pode ter 1h no celular e 3h no painel.
 *
 * Só `import type` daqui para fora: o `node` dos testes apaga os tipos e não
 * precisa resolver o caminho.
 */
import type { Agendamento, TipoAgendamento } from '../types';

/* ─────────────────────────────  Duração por tipo  ──────────────────────────── */

/**
 * DURAÇÃO PADRÃO POR TIPO (minutos). Cópia de `DURACAO_MIN` do painel. Serve para
 * sugerir o horário de fim de um compromisso novo (o usuário pode mudar).
 */
export const DURACAO_MIN: Record<TipoAgendamento, number> = {
  orcamento: 30,
  visita: 60,
  limpeza: 60,
  manutencao: 60,
  instalacao: 180,
  outro: 60,
};

export function duracaoEstimadaMin(tipo: TipoAgendamento): number {
  return DURACAO_MIN[tipo] ?? 60;
}

/** "1h", "30min", "3h" — mesmo rótulo do painel. */
export function rotuloDuracao(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/**
 * O dia de uma ocorrência projetada (`<base>@YYYY-MM-DD`, ver
 * `utils/contratoRecorrente.ts:expandirRecorrencia`), no fuso local. `null` quando
 * o id é de uma linha comum (sem `@`) ou a data não é válida.
 */
export function diaDaOcorrencia(id: string): Date | null {
  const m = /@(\d{4})-(\d{2})-(\d{2})$/.exec(id);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

/* ─────────────────────────────  Sem hora marcada  ──────────────────────────── */

/**
 * O compromisso que só tem DIA. O painel grava o início à meia-noite exata e sem
 * `fim` para dizer "sem horário" (a faixa "Sem hora" da grade). No celular isso
 * aparecia como "00:00". A regra é a mesma do painel: com `fim`, é horário de
 * verdade; sem `fim` e fora da meia-noite, também.
 */
export function semHoraMarcada(a: Pick<Agendamento, 'inicio' | 'fim'>): boolean {
  if (a.fim) return false;
  const d = new Date(a.inicio);
  if (Number.isNaN(d.getTime())) return false;
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
}

/** Itens do dia: os "Dia todo" primeiro, depois pela hora de início. */
export function ordenarDoDia<T extends Pick<Agendamento, 'inicio' | 'fim'>>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => {
    const sa = semHoraMarcada(a) ? 0 : 1;
    const sb = semHoraMarcada(b) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.inicio.localeCompare(b.inicio);
  });
}

/* ──────────────────────────  Horário de um compromisso novo  ───────────────── */

const dd = (n: number) => String(n).padStart(2, '0');

/** Date → 'HH:mm' no fuso local. */
export function paraHHMM(d: Date): string {
  return `${dd(d.getHours())}:${dd(d.getMinutes())}`;
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** O próximo :00 ou :30 DEPOIS de agora (15:10 → 15:30; 15:30 → 16:00). */
export function proximoMeioHora(agora: Date): Date {
  const d = new Date(agora);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(m + (30 - (m % 30)));
  return d;
}

/**
 * Quando um compromisso novo começa. Hoje: no próximo meio-hora (às 15h10 o
 * padrão era 09:00, um horário que já passou, sem lembrete). Depois das 23h30
 * não sobra meio-hora hoje: vai para amanhã às 09:00 (nunca para a meia-noite,
 * que é a marca de "sem hora"). Outro dia: 09:00 desse dia.
 */
export function inicioPadraoNovo(dia: Date, agora: Date): Date {
  if (mesmoDia(dia, agora)) {
    const prox = proximoMeioHora(agora);
    if (mesmoDia(prox, agora)) return prox;
    return new Date(prox.getFullYear(), prox.getMonth(), prox.getDate(), 9, 0, 0, 0);
  }
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 9, 0, 0, 0);
}

/**
 * Fim sugerido ('HH:mm') = início + duração do tipo. Se passar da meia-noite,
 * devolve '' (o formulário só guarda horário dentro do mesmo dia).
 */
export function horaFimSugerida(inicio: Date, tipo: TipoAgendamento): string {
  if (Number.isNaN(inicio.getTime())) return '';
  const fim = new Date(inicio.getTime() + duracaoEstimadaMin(tipo) * 60_000);
  if (!mesmoDia(fim, inicio)) return '';
  return paraHHMM(fim);
}

/**
 * O compromisso já passou? Com hora: o início é antes de agora. "Dia todo"
 * (`horaDefinida = false`): só quando o DIA inteiro já passou.
 */
export function agendamentoNoPassado(inicio: Date, horaDefinida: boolean, agora: Date): boolean {
  if (Number.isNaN(inicio.getTime())) return false;
  if (horaDefinida) return inicio.getTime() < agora.getTime();
  const fimDoDia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 23, 59, 59, 999);
  return fimDoDia.getTime() < agora.getTime();
}

/* ─────────────────────────────  Quem vê o quê  ─────────────────────────────── */

/**
 * O que a agenda pode mostrar para quem está usando. Três estados de verdade,
 * mais o caso do técnico:
 * - `carregando`: ainda não sei o papel (ou quem é o usuário). Não mostro nada.
 * - `erro`: não consegui saber o papel. Aviso e deixo tentar de novo. Nunca
 *   viro "agenda vazia" (o técnico acharia que não tem visita) nem "agenda da
 *   equipe" (não sei se ele pode).
 * - `equipe`: gestão ou conta pessoal. Vê tudo e filtra por técnico.
 * - `propria`: técnico. Vê só o que é dele (matriz em `hooks/usePermissao.ts`).
 */
export type EscopoAgenda =
  | { status: 'carregando' }
  | { status: 'erro' }
  | { status: 'equipe' }
  | { status: 'propria'; userId: string };

export interface EntradaEscopo {
  /** O papel é conhecido (rede ou cache do último login). */
  papelResolvido: boolean;
  /** A leitura do papel ainda está em voo. */
  papelCarregando: boolean;
  /** `pode('ver_agenda_equipe')`. Só vale com `papelResolvido`. */
  podeVerEquipe: boolean;
  /** Quem está logado: ainda lendo, ou o id (null = sem sessão). */
  usuario: { status: 'carregando' } | { status: 'ok'; id: string | null };
}

export function resolverEscopoAgenda(e: EntradaEscopo): EscopoAgenda {
  if (!e.papelResolvido) return e.papelCarregando ? { status: 'carregando' } : { status: 'erro' };
  if (e.podeVerEquipe) return { status: 'equipe' };
  if (e.usuario.status === 'carregando') return { status: 'carregando' };
  // Técnico sem sessão legível: não sei de quem filtrar. Erro, não lista vazia.
  if (!e.usuario.id) return { status: 'erro' };
  return { status: 'propria', userId: e.usuario.id };
}

/** Aplica o escopo à lista carregada. Fora de `equipe`/`propria`, não mostra nada. */
export function aplicarEscopo<T extends Pick<Agendamento, 'responsavelId'>>(itens: readonly T[], escopo: EscopoAgenda): T[] {
  if (escopo.status === 'equipe') return [...itens];
  if (escopo.status === 'propria') return itens.filter((i) => i.responsavelId === escopo.userId);
  return [];
}

/* ─────────────────────────────  Busca de cliente  ──────────────────────────── */

/**
 * Acentos que o `normalize('NFD')` separa da letra. Escape em texto (não o
 * caractere combinante literal, invisível no editor e apagado calado por um
 * salvamento com encoding errado). Mesma regra de `services/cep.ts`.
 */
const DIACRITICOS = new RegExp('[\u0300-\u036f]', 'g');

/** Minúsculas e sem acento: "José" acha "jose" e vice-versa. */
export function normalizarBusca(s: string): string {
  return s.normalize('NFD').replace(DIACRITICOS, '').toLowerCase().trim();
}

/**
 * Filtra clientes pelo nome (sem acento, sem caixa) ou pelos dígitos do telefone.
 * Busca vazia devolve a lista inteira, sem corte: a FlatList cuida da rolagem.
 */
export function filtrarClientes<T extends { nome: string; telefone?: string }>(clientes: readonly T[], busca: string): T[] {
  const q = normalizarBusca(busca);
  if (!q) return [...clientes];
  const digitos = busca.replace(/\D/g, '');
  return clientes.filter((c) => {
    if (normalizarBusca(c.nome).includes(q)) return true;
    return digitos.length >= 3 && (c.telefone ?? '').replace(/\D/g, '').includes(digitos);
  });
}
