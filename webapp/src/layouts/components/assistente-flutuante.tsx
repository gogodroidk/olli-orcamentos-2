import { BookOpen, MessageSquareText } from "lucide-react";
import { Link } from "react-router";

/** Atalho persistente e discreto para ajuda e IA; não envia mensagem nem dispara crédito sozinho. */
export default function AssistenteFlutuante() {
	return (
		<div className="fixed bottom-4 right-4 z-40 flex items-center gap-2" aria-label="Ajuda e assistente OLLI">
			<a
				href="https://olliorcamentos.online/ajuda/"
				target="_blank"
				rel="noreferrer"
				aria-label="Abrir Central de Ajuda pública"
				className="grid size-11 place-items-center rounded-full border border-border bg-card text-text-secondary shadow-lg transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
			>
				<BookOpen className="size-5" />
			</a>
			<Link
				to="/assistente"
				aria-label="Abrir robô assistente OLLI"
				className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/25 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2"
			>
				<MessageSquareText className="size-6" strokeWidth={2} />
			</Link>
		</div>
	);
}
