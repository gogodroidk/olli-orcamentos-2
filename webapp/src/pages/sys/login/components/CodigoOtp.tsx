import { codigoCompleto, type EstadoCampoCodigo, normalizarCodigo, TAMANHO_CODIGO } from "@acesso-codigo";
import { OTPInputContext, REGEXP_ONLY_DIGITS } from "input-otp";
import { CheckCircle2 } from "lucide-react";
import { type CSSProperties, useContext, useEffect, useId, useRef, useState } from "react";
import { InputOTP, InputOTPGroup } from "@/ui/input-otp";
import { cn } from "@/utils";
import "./codigo-otp.css";

interface Props {
	valor: string;
	onMudar: (codigo: string) => void;
	/** Chamado quando os 6 dígitos estão completos (digitados, colados ou autopreenchidos). */
	onCompleto: (codigo: string) => void;
	estado: EstadoCampoCodigo;
	/** Mensagem de erro em pt-BR (anunciada pelo leitor de tela). */
	erro?: string | null;
	/** O que acontece depois do sucesso ("Entrando…", "Agora crie a senha nova…"). */
	textoSucesso?: string;
	autoFocus?: boolean;
}

function Casa({ index, estado }: { index: number; estado: EstadoCampoCodigo }) {
	const ctx = useContext(OTPInputContext);
	const { char, hasFakeCaret, isActive } = ctx?.slots[index] ?? {};
	return (
		<div
			data-active={isActive}
			aria-hidden
			style={{ "--codigo-otp-i": index } as CSSProperties}
			className={cn(
				"codigo-otp__casa relative flex h-12 w-10 items-center justify-center rounded-md border border-input bg-background text-lg font-semibold tabular-nums shadow-xs outline-none sm:w-11",
				"data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50",
				estado === "erro" && "border-destructive data-[active=true]:border-destructive data-[active=true]:ring-destructive/20",
				estado === "sucesso" && "border-success text-success-dark dark:text-success",
			)}
		>
			{char ? (
				<span key={char} className="codigo-otp__digito">
					{char}
				</span>
			) : null}
			{hasFakeCaret && (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<div className="animate-caret-blink h-5 w-px bg-foreground duration-1000" />
				</div>
			)}
		</div>
	);
}

/**
 * Campo do código de 6 dígitos (login por código e "esqueci a senha").
 *
 * Usa o `input-otp` que já estava no painel (0 KB novos): um `<input>` real por
 * baixo das casas, então o foco automático, o colar, o autopreenchimento do
 * sistema (`autocomplete="one-time-code"`) e o teclado numérico do celular
 * funcionam como num campo comum — e o leitor de tela lê UM campo, não seis.
 * O colar aceita a frase inteira do e-mail ("Seu código é 123456").
 *
 * Movimento: codigo-otp.css (tokens --motion-*, só transform/opacity, caminho
 * sem movimento em `prefers-reduced-motion`).
 */
export function CodigoOtp({
	valor,
	onMudar,
	onCompleto,
	estado,
	erro,
	textoSucesso = "Código confirmado. Entrando…",
	autoFocus = true,
}: Props) {
	const idMensagem = useId();
	// Alterna "a"/"b" a cada NOVO erro: trocar o nome da animação faz a tremida
	// rodar de novo sem remontar o input (ver codigo-otp.css).
	const [tremida, setTremida] = useState<"a" | "b" | null>(null);
	const estadoAnterior = useRef(estado);
	useEffect(() => {
		if (estado === "erro" && estadoAnterior.current !== "erro") setTremida((t) => (t === "a" ? "b" : "a"));
		estadoAnterior.current = estado;
	}, [estado]);

	const bloqueado = estado === "verificando" || estado === "sucesso";

	return (
		<div className="codigo-otp flex flex-col items-center gap-3" data-estado={estado}>
			<div className="codigo-otp__tremida flex items-center gap-2" data-tremida={tremida ?? undefined}>
				<InputOTP
					maxLength={TAMANHO_CODIGO}
					pattern={REGEXP_ONLY_DIGITS}
					inputMode="numeric"
					autoComplete="one-time-code"
					autoFocus={autoFocus}
					disabled={bloqueado}
					value={valor}
					// O "completo" sai daqui, e não do `onComplete` do input-otp: aquele não
					// dispara quando a pessoa cola um código novo por cima do anterior.
					onChange={(v) => {
						const novo = normalizarCodigo(v);
						onMudar(novo);
						if (novo !== valor && codigoCompleto(novo)) onCompleto(novo);
					}}
					pasteTransformer={(colado) => normalizarCodigo(colado)}
					aria-label={`Código de ${TAMANHO_CODIGO} dígitos`}
					aria-invalid={estado === "erro" || undefined}
					aria-describedby={idMensagem}
					aria-busy={estado === "verificando" || undefined}
					containerClassName="gap-2"
				>
					<InputOTPGroup className="gap-1.5 sm:gap-2">
						{Array.from({ length: TAMANHO_CODIGO }, (_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: as casas são posições fixas.
							<Casa key={i} index={i} estado={estado} />
						))}
					</InputOTPGroup>
				</InputOTP>
				{estado === "sucesso" && (
					<CheckCircle2 className="codigo-otp__check size-6 text-success-dark dark:text-success" aria-hidden />
				)}
			</div>
			<p id={idMensagem} aria-live="polite" className="min-h-5 text-center text-sm">
				{estado === "erro" && erro ? <span className="font-medium text-destructive">{erro}</span> : null}
				{estado === "verificando" ? <span className="text-muted-foreground">Confirmando o código…</span> : null}
				{estado === "sucesso" ? (
					<span className="font-medium text-success-dark dark:text-success">{textoSucesso}</span>
				) : null}
			</p>
		</div>
	);
}

export default CodigoOtp;
