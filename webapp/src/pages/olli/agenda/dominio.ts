/**
 * AGENDA — as regras que a tela e o formulário compartilham.
 *
 * Existe como módulo próprio (e não dentro do index) por um motivo chato mas real:
 * o `index.tsx` importa o `FormAgendamento.tsx`, então qualquer helper que o
 * formulário precise puxar do index viraria import circular.
 *
 * Tudo aqui é derivado de `@dominio` (os tipos do app do celular). Se o app ganhar
 * um `TipoAgendamento` novo, os `Record<TipoAgendamento, …>` abaixo PARAM DE
 * COMPILAR — que é exatamente o que queremos: melhor quebrar o build do que
 * renderizar um agendamento cinza sem duração e sem nome.
 */
import { type Agendamento, type StatusAgendamento, TIPOS_AGENDAMENTO, type TipoAgendamento } from "@dominio";

/* ──────────────────────────  1. A linha do Supabase  ───────────────────────── */

/**
 * A linha crua de `agendamentos`. Os campos que importam são tipados a partir do
 * DOMÍNIO (`tipo`, `status`), não como `string` solta: assim, um valor novo no app
 * aparece aqui como erro de compilação em vez de virar um evento sem cor.
 *
 * Espelha `agendamentoToRow` (olli/contrato.ts) ao contrário.
 */
export interface LinhaAgendamento {
	id: string;
	cliente_id: string | null;
	cliente_nome: string;
	titulo: string;
	tipo: TipoAgendamento;
	inicio: string;
	fim: string | null;
	endereco: string | null;
	status: StatusAgendamento;
	orcamento_id: string | null;
	observacao: string | null;
	criado_em: string;
	atualizado_em: string | null;
	excluido_em: string | null;
}

/**
 * Linha → objeto de domínio.
 *
 * ⚠️ REGRA 4 DO PROJETO: o app OMITE a chave quando não há valor (JSON.stringify
 * descarta `undefined`). Por isso aqui é `if (x) obj.x = x` e NUNCA `x: r.x ?? null`
 * — gravar `null` explícito onde o app grava ausência faz o painel e o celular
 * divergirem no mesmo registro.
 */
export function linhaParaAgendamento(r: LinhaAgendamento): Agendamento {
	const a: Agendamento = {
		id: r.id,
		clienteNome: r.cliente_nome,
		titulo: r.titulo,
		tipo: r.tipo,
		inicio: r.inicio,
		status: r.status,
		criadoEm: r.criado_em,
		atualizadoEm: r.atualizado_em ?? r.criado_em,
	};
	if (r.cliente_id) a.clienteId = r.cliente_id;
	if (r.fim) a.fim = r.fim;
	if (r.endereco) a.endereco = r.endereco;
	if (r.orcamento_id) a.orcamentoId = r.orcamento_id;
	if (r.observacao) a.observacao = r.observacao;
	if (r.excluido_em) a.excluidoEm = r.excluido_em;
	return a;
}

/* ─────────────────────  2. Tipo: cor, rótulo e ícone  ──────────────────────── */

/** Índice de `TIPOS_AGENDAMENTO` (a fonte da verdade de rótulo e cor). */
export const INFO_TIPO = Object.fromEntries(TIPOS_AGENDAMENTO.map((t) => [t.id, t])) as Record<
	TipoAgendamento,
	(typeof TIPOS_AGENDAMENTO)[number]
>;

/**
 * O ÍCONE, com o prefixo do Iconify.
 *
 * `TIPOS_AGENDAMENTO[].icon` guarda nomes do Material Community Icons (o app é
 * React Native) — o MESMO conjunto que o Iconify publica sob o prefixo `mdi:`.
 * Então o glifo aqui é literalmente o do celular, sem "equivalente aproximado".
 *
 * Por que escrito por extenso, e não `` `mdi:${t.icon}` ``: o gerador offline
 * (`scripts/gerar-icones-offline.mjs`) varre STRINGS LITERAIS do código para saber
 * o que baixar. Um nome montado em runtime não entraria no pacote — e como o CSP
 * bloqueia a busca de ícone em runtime, o ícone simplesmente NÃO APARECERIA em
 * produção. A `satisfies` abaixo garante que a lista continua completa.
 */
export const ICONE_TIPO = {
	orcamento: "mdi:file-document-outline",
	limpeza: "mdi:spray-bottle",
	instalacao: "mdi:tools",
	manutencao: "mdi:wrench-outline",
	visita: "mdi:map-marker-radius-outline",
	outro: "mdi:calendar-blank-outline",
} satisfies Record<TipoAgendamento, string>;

/**
 * Fundo do evento: a cor do tipo em ~15% de opacidade.
 *
 * As cores de `TIPOS_AGENDAMENTO` são MATIZES DE CATEGORIA (o próprio domínio avisa:
 * medem 1.88:1 a 2.05:1 sobre branco). Usá-las como fundo SÓLIDO com texto por cima
 * seria ilegível no tema claro. Como preenchimento translúcido + borda, o valor cru
 * está certo — e é o que o comentário do domínio autoriza.
 */
export function corDeFundo(hex: string): string {
	return `${hex}26`; // 0x26 ≈ 15%
}

/* ──────────────────────────  3. Duração e "sem fim"  ───────────────────────── */

/**
 * DURAÇÃO PADRÃO POR TIPO (minutos), quando o agendamento não tem `fim`.
 *
 * `fim` é opcional no domínio e o app deixa em branco o tempo todo (o técnico sabe
 * quando começa, não quando acaba). Num calendário, "sem fim" renderizado como
 * duração ZERO vira um bloco de 0px: o compromisso some da tela. Então estimamos.
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

/** "1h", "30min", "3h" — para dizer ao usuário que a duração é ESTIMADA. */
export function rotuloDuracao(min: number): string {
	if (min < 60) return `${min}min`;
	const h = Math.floor(min / 60);
	const m = min % 60;
	return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/**
 * O fim EFETIVO: o real quando existe; senão, início + duração do tipo.
 * Usado para desenhar o bloco e para detectar conflito — nunca é gravado.
 */
export function fimEfetivo(a: Pick<Agendamento, "inicio" | "fim" | "tipo">): Date {
	const ini = new Date(a.inicio);
	if (a.fim) {
		const f = new Date(a.fim);
		// Fim antes/igual ao início (dado velho, fuso torto) não pode virar bloco de
		// altura zero: cai na estimativa em vez de sumir da tela.
		if (!Number.isNaN(f.getTime()) && f.getTime() > ini.getTime()) return f;
	}
	return new Date(ini.getTime() + duracaoEstimadaMin(a.tipo) * 60_000);
}

/**
 * SEM HORA MARCADA — o agendamento que só tem DIA.
 *
 * O app sempre grava uma hora de início (o formulário dele nasce às 09:00), então
 * isto é raro. Mas importação/integração pode gerar um `inicio` à meia-noite exata
 * e sem `fim`: isso não é "compromisso à 00:00", é "compromisso sem horário". Vai
 * para a FAIXA DO TOPO do dia, em vez de fingir uma reunião na madrugada.
 *
 * ⚠️ O que NÃO é "sem hora marcada": um agendamento com hora e sem `fim`. Esse tem
 * início de verdade e continua no grid, na hora certa, com duração estimada (a
 * borda tracejada avisa). Jogá-lo na faixa do topo esconderia a informação mais
 * importante que o registro tem — a hora em que o técnico precisa estar lá.
 */
export function semHoraMarcada(a: Pick<Agendamento, "inicio" | "fim">): boolean {
	if (a.fim) return false;
	const d = new Date(a.inicio);
	if (Number.isNaN(d.getTime())) return false;
	return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
}

/* ─────────────────────────────  4. Conflito  ───────────────────────────────── */

/**
 * Achou dois compromissos que se sobrepõem? Devolve o PRIMEIRO conflitante.
 *
 * Cópia de `encontrarConflitoDeHorario` (src/services/agenda.ts) — inclusive o
 * "cancelado não conflita". A única diferença: lá o fim ausente vale 1h fixa; aqui
 * vale a duração DO TIPO (instalação = 3h). Uma instalação das 8h às 11h que colide
 * com uma visita das 10h é um conflito de verdade, e o app não o vê. É AVISO, nunca
 * bloqueio — o dono pode ter dois técnicos.
 */
export function encontrarConflito(
	itens: Agendamento[],
	candidato: Pick<Agendamento, "inicio" | "fim" | "tipo">,
	ignorarId?: string,
): Agendamento | null {
	const ini = new Date(candidato.inicio).getTime();
	if (Number.isNaN(ini)) return null;
	const fim = fimEfetivo(candidato).getTime();

	for (const a of itens) {
		if (a.id === ignorarId || a.status === "cancelado") continue;
		const aIni = new Date(a.inicio).getTime();
		if (Number.isNaN(aIni)) continue;
		const aFim = fimEfetivo(a).getTime();
		if (ini < aFim && fim > aIni) return a;
	}
	return null;
}

/* ────────────────────  5. Datas: <input type="datetime-local">  ────────────── */

const dd = (n: number) => String(n).padStart(2, "0");

/**
 * Date → 'YYYY-MM-DDTHH:mm' no fuso LOCAL — o formato que o `datetime-local` exige.
 *
 * NÃO use `toISOString().slice(0,16)`: isso é UTC. No Brasil (UTC-3), um
 * agendamento das 09:00 apareceria no formulário como 12:00 — e ao salvar, o
 * usuário "corrigiria" para 09:00 UTC, ou seja, 06:00 na vida real. O caminho de
 * volta (string → ISO) é o `localParaIso` de `olli/datas.ts`.
 */
export function paraInputLocal(d: Date): string {
	return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}T${dd(d.getHours())}:${dd(d.getMinutes())}`;
}

/** ISO do banco → valor do `datetime-local`. String vazia quando não há data. */
export function isoParaInputLocal(iso: string | undefined): string {
	if (!iso) return "";
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? "" : paraInputLocal(d);
}

/* ─────────────────────────  6. Formatação de leitura  ──────────────────────── */

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
const DIA_LONGO = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const DIA_CURTO = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function hhmm(iso: string | Date): string {
	const d = iso instanceof Date ? iso : new Date(iso);
	return Number.isNaN(d.getTime()) ? "--:--" : HORA.format(d);
}

export function diaLongo(iso: string | Date): string {
	const d = iso instanceof Date ? iso : new Date(iso);
	return Number.isNaN(d.getTime()) ? "—" : DIA_LONGO.format(d);
}

export function diaCurto(iso: string | Date): string {
	const d = iso instanceof Date ? iso : new Date(iso);
	return Number.isNaN(d.getTime()) ? "—" : DIA_CURTO.format(d);
}

/**
 * SÓ o horário, sem a data — para quando o dia já está escrito ao lado.
 *
 * Repare que o texto NUNCA finge um término: sem `fim`, ele diz "≈ 1h (sem término
 * definido)". A duração estimada serve para desenhar o bloco; escrevê-la como se
 * fosse um horário marcado ("09:00 – 10:00") faria o dono prometer ao cliente uma
 * hora que o técnico nunca confirmou.
 */
export function horarioDoDia(a: Agendamento): string {
	if (semHoraMarcada(a)) return "sem hora marcada";
	if (a.fim) return `${hhmm(a.inicio)} – ${hhmm(a.fim)}`;
	return `${hhmm(a.inicio)} · ≈ ${rotuloDuracao(duracaoEstimadaMin(a.tipo))} (sem término definido)`;
}

/** "14/07/2026 09:00 – 10:00" — dia + horário, para listas e diálogos. */
export function faixaDeHorario(a: Agendamento): string {
	const separador = semHoraMarcada(a) ? " · " : " ";
	return `${diaCurto(a.inicio)}${separador}${horarioDoDia(a)}`;
}

/** Os rótulos de status são do DOMÍNIO — reexportados, nunca reescritos: uma cópia
 *  local diria "Concluido" no dia em que o app dissesse outra coisa. */
export { STATUS_AGENDAMENTO_LABELS } from "@dominio";
