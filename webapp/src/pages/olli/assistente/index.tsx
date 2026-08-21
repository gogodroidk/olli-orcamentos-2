import { Bot } from "lucide-react";
import { AssistenteConversa } from "@/layouts/components/assistente-global";
import { Card } from "@/ui/card";

export default function AssistentePage() {
	return (
		<div className="mx-auto flex h-[calc(100svh-var(--layout-header-height)-2rem)] w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
			<header>
				<div className="flex items-center gap-2.5">
					<div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
						<Bot className="size-5" />
					</div>
					<div>
						<h1 className="text-2xl font-bold text-text-primary">Assistente OLLI</h1>
						<p className="text-sm text-text-secondary">Seu espaço para pensar o atendimento e preparar o orçamento.</p>
					</div>
				</div>
			</header>
			<Card className="flex min-h-0 flex-1 overflow-hidden p-0">
				<AssistenteConversa />
			</Card>
		</div>
	);
}
