import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import type { useAcessoCodigo } from "../use-acesso-codigo";
import { BotaoReenviar } from "./BotaoReenviar";
import { CodigoOtp } from "./CodigoOtp";

interface Props {
	trilho: ReturnType<typeof useAcessoCodigo>;
	titulo: string;
	descricao: ReactNode;
	rotuloEnviar: string;
	/** Texto de sucesso do campo do código ("Entrando…", "Agora crie a senha nova…"). */
	textoSucesso?: string;
	/** Rodapé extra (ex.: "Não tem conta? Criar conta"). */
	rodape?: ReactNode;
}

const EMAIL_VALIDO = /^\S+@\S+\.\S+$/;

/**
 * As duas etapas do painel — e-mail, depois o código de 6 dígitos — usadas pelo
 * login por código e pelo "esqueci a senha". O estado vem de `useAcessoCodigo`.
 */
export function TrilhoCodigo({ trilho, titulo, descricao, rotuloEnviar, textoSucesso, rodape }: Props) {
	const t = trilho;

	if (t.etapa === "email") {
		const valido = EMAIL_VALIDO.test(t.email.trim());
		return (
			<form
				className="space-y-4"
				noValidate
				onSubmit={(e) => {
					e.preventDefault();
					if (valido) void t.enviar();
				}}
			>
				<div className="flex flex-col items-center gap-2 text-center">
					<h1 className="text-2xl font-bold">{titulo}</h1>
					<p className="text-balance text-sm text-muted-foreground">{descricao}</p>
				</div>
				<div className="space-y-2">
					<Label htmlFor="trilho-email">E-mail</Label>
					<Input
						id="trilho-email"
						type="email"
						autoComplete="email"
						inputMode="email"
						placeholder="voce@empresa.com.br"
						value={t.email}
						onChange={(e) => t.setEmail(e.target.value)}
						aria-invalid={t.email.length > 0 && !valido ? true : undefined}
						autoFocus
					/>
				</div>
				<Button type="submit" className="w-full" disabled={!valido || t.enviando || t.segundos > 0} aria-busy={t.enviando}>
					{t.enviando && <Loader2 className="mr-2 animate-spin" size={16} />}
					{t.segundos > 0 ? `${rotuloEnviar} em ${t.segundos}s` : rotuloEnviar}
				</Button>
				<p aria-live="polite" className="min-h-5 text-center text-sm font-medium">
					{t.aviso}
				</p>
				{rodape}
			</form>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-col items-center gap-2 text-center">
				<h1 className="text-2xl font-bold">Digite o código</h1>
				<p className="text-balance text-sm text-muted-foreground">{t.aviso}</p>
				<p className="max-w-full truncate text-sm font-semibold">{t.email}</p>
			</div>
			<CodigoOtp
				valor={t.codigo}
				onMudar={t.mudarCodigo}
				onCompleto={(c) => void t.verificar(c)}
				estado={t.estado}
				erro={t.erro}
				textoSucesso={textoSucesso}
			/>
			{t.estado === "erro" && (
				<Button type="button" variant="outline" className="w-full" onClick={() => void t.verificar(t.codigo)}>
					Tentar de novo
				</Button>
			)}
			<div className="flex items-center justify-between">
				<BotaoReenviar segundos={t.segundos} enviando={t.enviando} onClick={() => void t.enviar()} />
				<Button type="button" variant="link" size="sm" onClick={t.trocarEmail} disabled={t.estado === "verificando"}>
					Trocar e-mail
				</Button>
			</div>
			{rodape}
		</div>
	);
}
