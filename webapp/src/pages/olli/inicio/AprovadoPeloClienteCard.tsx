import { CalendarPlus, CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useUserInfo } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { formatBRL, type OrcamentoRow, plural } from "./helpers";
import { useAprovacoesDoCliente } from "./useAprovacoesDoCliente";

const PREFIXO = "olli.aprovacoes.vistoAte.";

interface Props {
	/** A MESMA leitura de orçamentos do Início — é dela que saem cliente, número e valor. */
	orcamentos: OrcamentoRow[] | undefined;
}

/**
 * O MOMENTO "ORÇAMENTO APROVADO" — o cliente aprovou pelo link enquanto o dono
 * estava fora, e o painel conta isso na primeira coisa que ele vê.
 *
 * O que é celebrado: só aprovação do CLIENTE (ver `useAprovacoesDoCliente`) que
 * chegou DEPOIS da última vez que o dono dispensou este aviso neste navegador. Na
 * primeira visita nada é celebrado — marcamos "visto até agora" em silêncio, para
 * não soltar o histórico inteiro de uma vez como se fosse novidade.
 *
 * Toda celebração termina numa AÇÃO: "Agendar o serviço" (o próximo passo de quem
 * fechou negócio). Tocar nela ou no X marca como visto.
 *
 * Movimento (tokens.css), ≤ 700 ms e uma vez só: o card surge (`surgir`), o ícone
 * assenta na mola (`assentar`) e um anel abre e some (`anel-celebracao`). Nada de
 * confete, nada em loop. "Reduzir movimento": tudo já nasce no lugar.
 *
 * Leitura carregando, com erro, ou orçamento que não está na lista (excluído, de
 * outra conta) = não desenha. É um aviso de algo que as listas já mostram; na
 * dúvida ele cala, nunca inventa um cliente ou um valor.
 */
export function AprovadoPeloClienteCard({ orcamentos }: Props) {
	const uid = useUserInfo().id;
	const chave = uid ? `${PREFIXO}${uid}` : null;
	const aprovacoes = useAprovacoesDoCliente();
	const [vistoAte, setVistoAte] = useState<string | null>(() => lerVisto(chave));

	// Relê quando a conta chega (o id pode faltar no 1º render) — e só na PRIMEIRA
	// visita de verdade (nada gravado) marca "visto até agora", sem celebrar o passado.
	// Ler antes de gravar: gravar direto apagaria uma aprovação ainda não vista.
	useEffect(() => {
		if (!chave) return;
		const salvo = lerVisto(chave);
		if (salvo) {
			setVistoAte(salvo);
			return;
		}
		const agora = new Date().toISOString();
		gravarVisto(chave, agora);
		setVistoAte(agora);
	}, [chave]);

	if (!chave || vistoAte === null || !aprovacoes.isSuccess || !orcamentos) return null;

	const porId = new Map(orcamentos.map((o) => [String(o.id), o]));
	const novas = aprovacoes.data
		// Por instante, não por texto: o Postgres devolve "+00:00" e microssegundos, o
		// navegador grava "Z" — comparar string erraria na borda.
		.filter((a) => Date.parse(a.respondido_em) > Date.parse(vistoAte))
		.map((a) => ({ ...a, orcamento: porId.get(String(a.orcamento_id)) }))
		.filter((a): a is typeof a & { orcamento: OrcamentoRow } => a.orcamento !== undefined);
	if (novas.length === 0) return null;

	const [ultima, ...outras] = novas;
	const o = ultima.orcamento;
	const cliente = o.cliente_nome?.trim() || "Seu cliente";
	const numero = o.numero?.trim();
	// Sem valor no cadastro = sem número na tela (nunca "R$ 0,00" inventado).
	const bruto = o.valor_total === null || o.valor_total === undefined ? Number.NaN : Number(o.valor_total);
	const valor = Number.isFinite(bruto) ? bruto : null;

	const dispensar = () => {
		// Até a aprovação MAIS NOVA mostrada (a lista vem da mais nova para a mais velha).
		gravarVisto(chave, ultima.respondido_em);
		setVistoAte(ultima.respondido_em);
	};

	return (
		<Card aria-live="polite" className="surgir gap-0 overflow-hidden border-success/30 p-0 shadow-sm">
			<div className="flex flex-col gap-4 bg-success/5 px-5 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
				<div className="flex min-w-0 flex-1 items-start gap-3">
					<span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-success/15 text-success">
						<span
							aria-hidden="true"
							className="anel-celebracao absolute inset-0 rounded-full border-2 border-success/50"
						/>
						<CheckCircle2 aria-hidden="true" className="assentar size-6" strokeWidth={2.2} />
					</span>
					<div className="min-w-0">
						<p className="text-sm font-semibold text-success-darker dark:text-success-light">
							Orçamento aprovado pelo cliente
						</p>
						{valor !== null && (
							<p className="mt-0.5 font-serif text-2xl font-bold leading-tight tabular-nums text-text-primary">
								{formatBRL(valor)}
							</p>
						)}
						<p className="mt-0.5 text-sm text-text-secondary">
							{cliente} aprovou {numero ? `o orçamento ${numero}` : "o orçamento"} {quando(ultima.respondido_em)}.
							{outras.length > 0 &&
								` E mais ${plural(outras.length, "aprovação", "aprovações")} desde a sua última visita.`}
						</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Button asChild className="min-h-11">
						<Link to="/agenda" onClick={dispensar}>
							<CalendarPlus />
							Agendar o serviço
						</Link>
					</Button>
					{outras.length > 0 && (
						<Button asChild variant="ghost" className="min-h-11">
							<Link to="/orcamentos?status=aprovado" onClick={dispensar}>
								Ver aprovados
							</Link>
						</Button>
					)}
					<Button
						variant="ghost"
						size="icon"
						className="alvo-toque"
						aria-label="Dispensar aviso de aprovação"
						onClick={dispensar}
					>
						<X />
					</Button>
				</div>
			</div>
		</Card>
	);
}

const DIA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "hoje às 14:32" · "ontem às 09:10" · "em 27/09". Data ilegível = "" (não chuta). */
function quando(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	const hoje = new Date();
	const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
	const mesmoDia = (a: Date, b: Date) =>
		a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
	if (mesmoDia(d, hoje)) return `hoje às ${HORA.format(d)}`;
	if (mesmoDia(d, ontem)) return `ontem às ${HORA.format(d)}`;
	return `em ${DIA.format(d)}`;
}

function lerVisto(chave: string | null): string | null {
	if (!chave) return null;
	try {
		return window.localStorage.getItem(chave);
	} catch {
		return null;
	}
}

function gravarVisto(chave: string, iso: string): void {
	try {
		window.localStorage.setItem(chave, iso);
	} catch {
		// Armazenamento bloqueado (aba anônima): sem memória de "visto", toda visita é a
		// primeira e o aviso não aparece. As listas continuam mostrando o aprovado.
	}
}
