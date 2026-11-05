/**
 * Agenda do OLLI em iCalendar (RFC 5545), sem rede e sem OAuth.
 *
 * Serve o arquivo .ics (cópia de agora) e o corpo do link de assinatura que o
 * Google Agenda, o calendário do iPhone e o Outlook buscam sozinhos. A mudança
 * feita nesses calendários NÃO volta para o OLLI: o arquivo é mão única.
 *
 * Fuso: Brasília é UTC−3 o ano todo (sem horário de verão desde 2019). A conta
 * usa esse deslocamento fixo, no mesmo espírito de `contratoRecorrente.ts`,
 * para o dia "sem hora" não depender de `Intl` no Hermes.
 */

const DESLOCAMENTO_BRASIL_MS = 3 * 60 * 60 * 1000;
const DURACAO_PADRAO_MS = 60 * 60 * 1000;
const JANELA_PASSADO_DIAS = 30;
const TETO_EVENTOS = 2000;
const PRODID = '-//OLLI Orcamentos//Agenda//PT-BR';

export type RecorrenciaIcs =
  | 'semanal'
  | 'quinzenal'
  | 'mensal'
  | 'bimestral'
  | 'trimestral'
  | 'semestral'
  | 'anual';

export interface ExcecaoIcs {
  cancelada?: true;
  inicio?: string;
  fim?: string;
  status?: string;
  titulo?: string;
  observacao?: string;
}

/** O mínimo de um compromisso para virar VEVENT. Campos a mais são ignorados. */
export interface EventoIcs {
  id: string;
  clienteNome?: string;
  titulo?: string;
  inicio: string;
  fim?: string;
  endereco?: string;
  status?: string;
  observacao?: string;
  recorrencia?: RecorrenciaIcs | string;
  recorrenciaAte?: string;
  excecoes?: Record<string, ExcecaoIcs> | null;
  atualizadoEm?: string;
  excluidoEm?: string;
}

export interface OpcoesIcs {
  agora?: Date;
  /**
   * `evento` = um compromisso (o botão que já existia). Sem nome de calendário
   * e sem janela: o dia inteiro só entra se `forcarSemHora` for true.
   * `agenda` = a agenda inteira, para baixar ou assinar.
   */
  modo?: 'evento' | 'agenda';
  forcarSemHora?: boolean;
}

const RRULE: Record<RecorrenciaIcs, string> = {
  semanal: 'FREQ=WEEKLY',
  quinzenal: 'FREQ=WEEKLY;INTERVAL=2',
  mensal: 'FREQ=MONTHLY',
  bimestral: 'FREQ=MONTHLY;INTERVAL=2',
  trimestral: 'FREQ=MONTHLY;INTERVAL=3',
  semestral: 'FREQ=MONTHLY;INTERVAL=6',
  anual: 'FREQ=YEARLY',
};

function dataValida(iso: string | undefined): Date | null {
  if (!iso) return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : data;
}

function utcCompacto(data: Date): string {
  return data.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function partesBrasil(data: Date): { ano: number; mes: number; dia: number; h: number; min: number; s: number } {
  const d = new Date(data.getTime() - DESLOCAMENTO_BRASIL_MS);
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
  };
}

function dataCivil(partes: { ano: number; mes: number; dia: number }): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${partes.ano}${p(partes.mes)}${p(partes.dia)}`;
}

function diaCivilValido(dia: string | undefined): { ano: number; mes: number; dia: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia ?? '');
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(ano, mes - 1, d));
  if (probe.getUTCFullYear() !== ano || probe.getUTCMonth() !== mes - 1 || probe.getUTCDate() !== d) return null;
  return { ano, mes, dia: d };
}

function proximoDiaCivil(partes: { ano: number; mes: number; dia: number }): string {
  const seguinte = new Date(Date.UTC(partes.ano, partes.mes - 1, partes.dia + 1));
  return dataCivil({
    ano: seguinte.getUTCFullYear(),
    mes: seguinte.getUTCMonth() + 1,
    dia: seguinte.getUTCDate(),
  });
}

/** Meia-noite em Brasília e sem fim = "sem hora marcada" (a mesma marca do painel). */
export function semHoraBrasil(evento: Pick<EventoIcs, 'inicio' | 'fim'>): boolean {
  if (evento.fim) return false;
  const inicio = dataValida(evento.inicio);
  if (!inicio) return false;
  const p = partesBrasil(inicio);
  return p.h === 0 && p.min === 0 && p.s === 0;
}

function limparLinha(valor: string | undefined): string {
  let saida = '';
  for (const ch of valor ?? '') {
    const c = ch.codePointAt(0) ?? 0;
    saida += c < 0x20 || c === 0x7f ? ' ' : ch;
  }
  return saida.replace(/\s+/g, ' ').trim();
}

function escaparIcs(valor: string): string {
  return valor.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function tamanhoUtf8(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c < 0x10000) n += 3;
    else n += 4;
  }
  return n;
}

function dobrarLinhaIcs(linha: string): string {
  const pedacos: string[] = [];
  let restante = linha;
  while (tamanhoUtf8(restante) > 73) {
    let corte = Math.min(70, restante.length);
    while (corte > 1 && tamanhoUtf8(restante.slice(0, corte)) > 73) corte--;
    pedacos.push(restante.slice(0, corte));
    restante = restante.slice(corte);
  }
  pedacos.push(restante);
  return pedacos.join('\r\n ');
}

function descricao(evento: EventoIcs): string {
  const texto = [
    evento.clienteNome ? `Cliente: ${limparLinha(evento.clienteNome)}` : '',
    evento.observacao ? limparLinha(evento.observacao) : '',
    'Criado no OLLI Orçamentos.',
  ]
    .filter(Boolean)
    .join('\n');
  return texto.length > 1500 ? `${texto.slice(0, 1499)}…` : texto;
}

function recorrenciaConhecida(valor: string | undefined): RecorrenciaIcs | null {
  if (!valor) return null;
  return valor in RRULE ? (valor as RecorrenciaIcs) : null;
}

function instanteNoDia(master: Date, dia: { ano: number; mes: number; dia: number }): Date {
  const relogio = partesBrasil(master);
  return new Date(Date.UTC(dia.ano, dia.mes - 1, dia.dia, relogio.h, relogio.min, relogio.s) + DESLOCAMENTO_BRASIL_MS);
}

function untilUtc(dia: { ano: number; mes: number; dia: number }): string {
  // Fim daquele dia civil em Brasília, inclusive, para a última ocorrência entrar.
  return utcCompacto(new Date(Date.UTC(dia.ano, dia.mes - 1, dia.dia, 23, 59, 59) + DESLOCAMENTO_BRASIL_MS));
}

function sequencia(evento: EventoIcs): number {
  const marca = dataValida(evento.atualizadoEm);
  if (!marca) return 0;
  const n = Math.floor(marca.getTime() / 1000);
  return n > 0 ? n : 0;
}

interface Normalizado {
  evento: EventoIcs;
  inicio: Date;
  semHora: boolean;
}

function normalizar(evento: EventoIcs, forcarSemHora: boolean | undefined): Normalizado | null {
  if (evento.excluidoEm) return null;
  const inicio = dataValida(evento.inicio);
  if (!inicio || !evento.id) return null;
  const semHora = forcarSemHora === true ? true : forcarSemHora === false ? false : semHoraBrasil(evento);
  return { evento, inicio, semHora };
}

function linhasQuando(inicio: Date, fim: Date | null, semHora: boolean): string[] {
  if (semHora) {
    const civil = partesBrasil(inicio);
    return [
      `DTSTART;VALUE=DATE:${dataCivil(civil)}`,
      `DTEND;VALUE=DATE:${proximoDiaCivil(civil)}`,
    ];
  }
  const termino = fim ?? new Date(inicio.getTime() + DURACAO_PADRAO_MS);
  return [`DTSTART:${utcCompacto(inicio)}`, `DTEND:${utcCompacto(termino)}`];
}

function linhaRrule(evento: EventoIcs, semHora: boolean): string | null {
  if (evento.status === 'cancelado') return null;
  const freq = recorrenciaConhecida(evento.recorrencia);
  if (!freq) return null;
  const ate = diaCivilValido(evento.recorrenciaAte);
  const until = ate ? (semHora ? `UNTIL=${dataCivil(ate)}` : `UNTIL=${untilUtc(ate)}`) : '';
  return `RRULE:${RRULE[freq]}${until ? `;${until}` : ''}`;
}

function exdates(evento: EventoIcs, inicio: Date, semHora: boolean): string[] {
  if (!evento.excecoes) return [];
  const datas: string[] = [];
  for (const [dia, ex] of Object.entries(evento.excecoes)) {
    if (!ex || (!ex.cancelada && ex.status !== 'cancelado')) continue;
    const civil = diaCivilValido(dia);
    if (!civil) continue;
    datas.push(semHora ? dataCivil(civil) : utcCompacto(instanteNoDia(inicio, civil)));
  }
  if (datas.length === 0) return [];
  const prefixo = semHora ? 'EXDATE;VALUE=DATE:' : 'EXDATE:';
  return [`${prefixo}${datas.join(',')}`];
}

function veventBase(item: Normalizado, agora: Date): string[] {
  const { evento, inicio, semHora } = item;
  const fim = semHora ? null : dataValida(evento.fim);
  const uid = `UID:${escaparIcs(evento.id)}@olliorcamentos.online`;
  const corpo = [
    'BEGIN:VEVENT',
    uid,
    `DTSTAMP:${utcCompacto(agora)}`,
    ...linhasQuando(inicio, fim, semHora),
    `SUMMARY:${escaparIcs(limparLinha(evento.titulo) || 'Compromisso OLLI')}`,
    `DESCRIPTION:${escaparIcs(descricao(evento))}`,
    ...(limparLinha(evento.endereco) ? [`LOCATION:${escaparIcs(limparLinha(evento.endereco))}`] : []),
    ...(evento.status === 'cancelado' ? ['STATUS:CANCELLED'] : []),
    linhaRrule(evento, semHora) ?? '',
    ...exdates(evento, inicio, semHora),
    `SEQUENCE:${sequencia(evento)}`,
    'END:VEVENT',
  ].filter((l) => l !== '');
  return corpo;
}

function overrides(item: Normalizado, agora: Date): string[][] {
  const { evento, inicio, semHora } = item;
  if (!evento.excecoes || evento.status === 'cancelado' || !recorrenciaConhecida(evento.recorrencia)) return [];
  const saida: string[][] = [];
  const fimMaster = dataValida(evento.fim);
  const duracao = fimMaster ? fimMaster.getTime() - inicio.getTime() : DURACAO_PADRAO_MS;
  for (const [dia, ex] of Object.entries(evento.excecoes)) {
    if (!ex || ex.cancelada || ex.status === 'cancelado') continue;
    const mudou = !!(ex.inicio || ex.fim || ex.titulo || ex.observacao);
    if (!mudou) continue;
    const civil = diaCivilValido(dia);
    if (!civil) continue;
    const novoInicio = dataValida(ex.inicio) ?? instanteNoDia(inicio, civil);
    const novoFim = dataValida(ex.fim) ?? new Date(novoInicio.getTime() + (duracao > 0 ? duracao : DURACAO_PADRAO_MS));
    const novoSemHora = semHora && !ex.inicio && !ex.fim;
    const copia: EventoIcs = {
      ...evento,
      titulo: ex.titulo || evento.titulo,
      observacao: ex.observacao || evento.observacao,
      recorrencia: undefined,
      excecoes: undefined,
      status: ex.status || evento.status,
    };
    const rec: string[] = [
      'BEGIN:VEVENT',
      `UID:${escaparIcs(evento.id)}@olliorcamentos.online`,
      `DTSTAMP:${utcCompacto(agora)}`,
      novoSemHora
        ? `RECURRENCE-ID;VALUE=DATE:${dataCivil(civil)}`
        : `RECURRENCE-ID:${utcCompacto(instanteNoDia(inicio, civil))}`,
      ...linhasQuando(novoInicio, novoSemHora ? null : novoFim, novoSemHora),
      `SUMMARY:${escaparIcs(limparLinha(copia.titulo) || 'Compromisso OLLI')}`,
      `DESCRIPTION:${escaparIcs(descricao(copia))}`,
      ...(limparLinha(evento.endereco) ? [`LOCATION:${escaparIcs(limparLinha(evento.endereco))}`] : []),
      `SEQUENCE:${sequencia(evento)}`,
      'END:VEVENT',
    ];
    saida.push(rec);
  }
  return saida;
}

function dentroDaJanela(item: Normalizado, agora: Date): boolean {
  if (recorrenciaConhecida(item.evento.recorrencia)) return true;
  const limite = agora.getTime() - JANELA_PASSADO_DIAS * 86_400_000;
  return item.inicio.getTime() >= limite;
}

/**
 * Monta o VCALENDAR. No modo `evento`, devolve null se o compromisso não tem
 * data válida. No modo `agenda`, devolve o calendário mesmo vazio (não é o
 * mesmo que "a leitura falhou").
 */
export function criarIcsAgenda(eventos: readonly EventoIcs[], opcoes: OpcoesIcs = {}): string | null {
  const modo = opcoes.modo ?? 'agenda';
  const agora = opcoes.agora ?? new Date();
  const forcar = modo === 'evento' ? (opcoes.forcarSemHora ?? false) : opcoes.forcarSemHora;
  let itens = eventos
    .map((e) => normalizar(e, forcar))
    .filter((e): e is Normalizado => !!e);
  if (modo === 'evento') {
    if (itens.length === 0) return null;
    itens = itens.slice(0, 1);
  } else {
    itens = itens.filter((e) => dentroDaJanela(e, agora)).slice(0, TETO_EVENTOS);
  }

  const cabecalho = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (modo === 'agenda') {
    cabecalho.push(
      'X-WR-CALNAME:Agenda OLLI',
      'X-WR-CALDESC:Cópia da agenda do OLLI. Mudança feita no Google ou no iPhone não volta para o OLLI.',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
    );
  }
  const vevents = itens.flatMap((item) => [veventBase(item, agora), ...overrides(item, agora)]);
  const linhas = [...cabecalho, ...vevents.flat(), 'END:VCALENDAR'];
  return `${linhas.map(dobrarLinhaIcs).join('\r\n')}\r\n`;
}

/** https e webcal do mesmo link. Recusa token frouxo e base que não é https. */
export function urlsAssinaturaIcal(baseHttps: string, token: string): { https: string; webcal: string } | null {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  let url: URL;
  try {
    url = new URL(baseHttps);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  const prefixo = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  const https = `${prefixo}/ical/${token}.ics`;
  const webcal = `webcal://${url.host}${url.pathname.replace(/\/+$/, '')}/ical/${token}.ics`;
  return { https, webcal };
}
