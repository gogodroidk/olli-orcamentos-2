import { Banknote, Percent, Send, Wallet } from "lucide-react";
import { useMemo } from "react";
import { useMinhaEmpresa, useOlliList } from "@/olli/data";
import { FaixaHoje } from "./FaixaHoje";
import {
	calcularAReceber,
	calcularEmJogo,
	calcularRecebidoNoMes,
	calcularTaxaAprovacao,
	paramStatus,
	STATUS_A_RECEBER,
	STATUS_EM_JOGO,
} from "./financeiro";
import { formatBRL, formatPct, mesPorExtenso, type OrcamentoRow, plural, type ReciboRow } from "./helpers";
import { KpiDinheiroCard } from "./KpiDinheiroCard";
import { ParadosCard } from "./ParadosCard";
import { RecentOrcamentosCard } from "./RecentOrcamentosCard";
import { StatusDonutCard } from "./StatusDonutCard";
import { WelcomeHeader } from "./WelcomeHeader";

/**
 * INÍCIO — o painel de DINHEIRO do OLLI.
 *
 * Antes esta tela mostrava contagens ("Orçamentos: 42", "Produtos: 7"). Ninguém
 * decide nada com isso. Agora ela responde às 4 perguntas que o dono realmente faz:
 *
 *   EM JOGO ............ quanto está na mão do cliente e ainda pode fechar
 *   A RECEBER .......... quanto já ganhei e ainda não entrou (menos os recibos)
 *   RECEBIDO NO MÊS .... quanto entrou de fato
 *   TAXA DE APROVAÇÃO .. de cada 100 propostas enviadas, quantas viram serviço
 *
 * — e, logo abaixo, mostra O QUE FAZER: os orçamentos parados esperando cobrança
 * (com WhatsApp pronto) e os compromissos de hoje.
 *
 * Duas leituras só (orçamentos + recibos) alimentam TODOS os cartões, o donut e a
 * lista de recentes — nada de N consultas de contagem. Se uma delas falhar, os
 * cartões dependentes mostram ERRO com "Tentar de novo"; NUNCA "R$ 0,00" (um zero
 * falso faz o dono achar que não tem nada a receber e parar de cobrar).
 */
export default function Inicio() {
	const orcQ = useOlliList<OrcamentoRow>("orcamentos", { orderBy: "criado_em", ascending: false });
	const recQ = useOlliList<ReciboRow>("recibos", { orderBy: "criado_em", ascending: false });
	const { data: empresa } = useMinhaEmpresa();

	const nomeEmpresa = ((empresa?.nome as string | undefined) ?? "").trim() || undefined;

	const emJogo = useMemo(() => (orcQ.data ? calcularEmJogo(orcQ.data) : null), [orcQ.data]);
	const aReceber = useMemo(
		() => (orcQ.data && recQ.data ? calcularAReceber(orcQ.data, recQ.data) : null),
		[orcQ.data, recQ.data],
	);
	const recebido = useMemo(() => (recQ.data ? calcularRecebidoNoMes(recQ.data) : null), [recQ.data]);
	const taxa = useMemo(() => (orcQ.data ? calcularTaxaAprovacao(orcQ.data, 30) : null), [orcQ.data]);

	const recarregarTudo = () => {
		orcQ.refetch();
		recQ.refetch();
	};

	// Aviso âmbar = dado que ficou FORA da conta. Some quando não há nada a avisar.
	const avisoSemValor = (n?: number) =>
		n && n > 0 ? `${plural(n, "orçamento")} sem valor no cadastro — fora da conta.` : undefined;

	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
			<WelcomeHeader />

			{/* Os 4 números que decidem o mês. Cada um leva à lista já filtrada. */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<KpiDinheiroCard
					label="Em jogo"
					valor={emJogo ? formatBRL(emJogo.total) : "—"}
					detalhe={
						emJogo
							? emJogo.itens > 0
								? `${plural(emJogo.itens, "proposta")} na mão do cliente`
								: "Nenhuma proposta em aberto"
							: "—"
					}
					aviso={avisoSemValor(emJogo?.semValor)}
					to={`/orcamentos?status=${paramStatus(STATUS_EM_JOGO)}`}
					Icon={Send}
					color="#0B6FCE"
					isLoading={orcQ.isLoading}
					isError={orcQ.isError}
					onRetry={() => orcQ.refetch()}
				/>

				<KpiDinheiroCard
					label="A receber"
					valor={aReceber ? formatBRL(aReceber.total) : "—"}
					detalhe={
						aReceber
							? aReceber.itens > 0
								? `${plural(aReceber.itens, "orçamento ganho", "orçamentos ganhos")} · já entrou ${formatBRL(aReceber.jaRecebido)}`
								: "Tudo que foi aprovado já foi pago"
							: "—"
					}
					aviso={avisoSemValor(aReceber?.semValor)}
					to={`/orcamentos?status=${paramStatus(STATUS_A_RECEBER)}`}
					Icon={Wallet}
					color="#F59E0B"
					isLoading={orcQ.isLoading || recQ.isLoading}
					isError={orcQ.isError || recQ.isError}
					onRetry={recarregarTudo}
				/>

				<KpiDinheiroCard
					label="Recebido no mês"
					valor={recebido ? formatBRL(recebido.total) : "—"}
					detalhe={
						recebido
							? `${plural(recebido.itens, "recibo")} em ${mesPorExtenso()}`
							: `Recebimentos de ${mesPorExtenso()}`
					}
					aviso={
						recebido && recebido.semData > 0
							? `${plural(recebido.semData, "recibo")} sem data de recebimento — fora da conta.`
							: undefined
					}
					to="/recibos"
					Icon={Banknote}
					color="#2BE39A"
					isLoading={recQ.isLoading}
					isError={recQ.isError}
					onRetry={() => recQ.refetch()}
				/>

				<KpiDinheiroCard
					label="Taxa de aprovação"
					valor={formatPct(taxa?.taxa ?? null)}
					detalhe={
						taxa
							? taxa.propostas > 0
								? `${taxa.aprovados} de ${plural(taxa.propostas, "proposta")} nos últimos 30 dias`
								: "Nenhuma proposta enviada nos últimos 30 dias"
							: "Últimos 30 dias"
					}
					to={`/orcamentos?status=${paramStatus(STATUS_A_RECEBER)}`}
					Icon={Percent}
					color="#8B5CF6"
					isLoading={orcQ.isLoading}
					isError={orcQ.isError}
					onRetry={() => orcQ.refetch()}
				/>
			</div>

			{/* O dia de hoje, antes de qualquer gráfico. */}
			<FaixaHoje />

			{/* AÇÃO (cobrar) à esquerda; leitura (funil) à direita. */}
			<div className="grid gap-5 lg:grid-cols-5">
				<div className="lg:col-span-3">
					<ParadosCard
						rows={orcQ.data}
						isLoading={orcQ.isLoading}
						isError={orcQ.isError}
						onRetry={() => orcQ.refetch()}
						empresa={nomeEmpresa}
					/>
				</div>
				<div className="lg:col-span-2">
					<StatusDonutCard rows={orcQ.data} isLoading={orcQ.isLoading} isError={orcQ.isError} />
				</div>
			</div>

			<RecentOrcamentosCard rows={orcQ.data} isLoading={orcQ.isLoading} isError={orcQ.isError} />
		</div>
	);
}
