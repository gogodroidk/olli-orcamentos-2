import { CloudOff, RotateCw, TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ehErroDeChunk } from "./carregar-chunk";

type Props = {
	children: ReactNode;
	/** `inline` cabe dentro de um card; `bloco` ocupa a área da tela. */
	variante?: "bloco" | "inline";
	/** O que falhou, em palavras do usuário. Ex.: "o gráfico", "esta tela". */
	oQue?: string;
};

type State = { erro: unknown | null };

/**
 * Fronteira para pedaço do painel que chega pela rede DEPOIS da primeira tela.
 *
 * Sem ela, um chunk que não baixa (4G que caiu, deploy novo que trocou os arquivos
 * com a aba velha aberta) sobe até o ErrorBoundary da rota — que é o do template
 * slash-admin: título em inglês e pilha de stack trace. Para um prestador com luva
 * suja e sol na tela isso é indistinguível de "o OLLI quebrou".
 *
 * Aqui a falha vira uma frase em português e um botão grande que RESOLVE de fato.
 * Recarregar é a saída honesta: depois que um `lazy` rejeita, o React guarda a
 * rejeição e re-renderizar não busca o arquivo de novo — um "tentar de novo" que
 * só re-renderiza pareceria quebrado duas vezes.
 */
export class ChunkBoundary extends Component<Props, State> {
	state: State = { erro: null };

	static getDerivedStateFromError(erro: unknown): State {
		return { erro };
	}

	componentDidCatch(erro: unknown, info: ErrorInfo) {
		// O Sentry entra por import() (ver main.tsx). Se ele próprio não baixar, o
		// catch segura: perder o relatório não pode custar a tela de recuperação.
		import("@sentry/react")
			.then((Sentry) => {
				Sentry.captureException(erro, {
					tags: { origem: "chunk-boundary", tipo: ehErroDeChunk(erro) ? "download" : "execucao" },
					extra: { componentStack: info.componentStack },
				});
			})
			.catch(() => {});
	}

	private recarregar = () => {
		window.location.reload();
	};

	render() {
		const { erro } = this.state;
		if (!erro) return this.props.children;

		const { variante = "bloco", oQue = "esta parte do painel" } = this.props;
		const deRede = ehErroDeChunk(erro);

		const titulo = deRede ? "Sua conexão caiu no meio do caminho" : `Não foi possível abrir ${oQue}`;
		const detalhe = deRede
			? `Faltou baixar um pedaço do painel. Confira a internet e recarregue — seus dados estão salvos.`
			: "Recarregue a página. Se continuar, já avisamos a equipe automaticamente.";

		const Icone = deRede ? CloudOff : TriangleAlert;

		return (
			<div
				role="alert"
				className={
					variante === "inline"
						? "flex flex-col items-center justify-center gap-3 px-4 py-10 text-center"
						: "flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 py-12 text-center"
				}
			>
				<Icone className="size-8 text-warning" aria-hidden />
				<div className="space-y-1">
					<p className="text-base font-semibold text-text-primary">{titulo}</p>
					<p className="mx-auto max-w-[34ch] text-sm text-text-secondary">{detalhe}</p>
				</div>
				<button
					type="button"
					onClick={this.recarregar}
					className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
				>
					<RotateCw className="size-4" aria-hidden />
					Recarregar
				</button>
			</div>
		);
	}
}
