import { Card } from "@/ui/card";
import { Hammer } from "lucide-react";

/** Tela ainda não portada do app do OLLI — honesta, não quebrada. */
export default function OlliPlaceholderPage({ title, hint }: { title: string; hint?: string }) {
	return (
		<div className="mx-auto w-full max-w-7xl p-4 md:p-6">
			<h1 className="text-2xl font-bold text-text-primary">{title}</h1>
			<Card className="mt-5 flex flex-col items-center justify-center gap-3 p-16 text-center">
				<div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
					<Hammer className="size-6" />
				</div>
				<p className="font-semibold text-text-primary">Chegando já</p>
				<p className="max-w-md text-sm text-text-secondary">
					{hint ?? "Esta tela está sendo trazida do app do OLLI e conectada aos seus dados. Em breve ela aparece aqui, completa."}
				</p>
			</Card>
		</div>
	);
}
