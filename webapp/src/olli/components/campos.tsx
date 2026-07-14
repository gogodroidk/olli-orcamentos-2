import type { ReactNode } from "react";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { cn } from "@/utils";

/**
 * Campos do formulário — versão brasileira.
 *
 * Regra de ouro deste arquivo: **a máscara é só aparência; o VALOR guardado é limpo.**
 * Dinheiro vira `number` (2480.5, não "R$ 2.480,50"), documento e telefone viram
 * dígitos. Guardar o texto formatado é o erro clássico: some a possibilidade de
 * somar, comparar e buscar — e o app do celular, que espera número, quebra.
 */

/* ─────────────────────────────  Casca de campo  ────────────────────────────── */

export function Campo({
	rotulo,
	erro,
	dica,
	obrigatorio,
	children,
	className,
}: {
	rotulo: string;
	erro?: string;
	dica?: string;
	obrigatorio?: boolean;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("space-y-1.5", className)}>
			<Label className="text-sm font-medium text-text-primary">
				{rotulo}
				{obrigatorio && <span className="ml-0.5 text-error">*</span>}
			</Label>
			{children}
			{erro ? (
				<p role="alert" className="text-xs font-medium text-error">
					{erro}
				</p>
			) : (
				dica && <p className="text-xs text-text-secondary">{dica}</p>
			)}
		</div>
	);
}

/* ────────────────────────────────  Dinheiro  ───────────────────────────────── */

const BRL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "R$ 2.480,50" ← 2480.5 */
export function formatarMoeda(valor: number): string {
	return BRL.format(Number.isFinite(valor) ? valor : 0);
}

/**
 * Campo de dinheiro que se digita da direita para a esquerda (como maquininha):
 * cada dígito empurra as casas decimais. É o comportamento que quem trabalha com
 * valores espera — bem menos erro do que deixar o usuário posicionar a vírgula.
 * Emite SEMPRE um `number`.
 */
export function CampoMoeda({
	valor,
	aoMudar,
	id,
	placeholder = "0,00",
	disabled,
}: {
	valor: number;
	aoMudar: (v: number) => void;
	id?: string;
	placeholder?: string;
	disabled?: boolean;
}) {
	return (
		<div className="relative">
			<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-text-secondary">
				R$
			</span>
			<Input
				id={id}
				inputMode="numeric"
				disabled={disabled}
				className="pl-9 text-right font-medium tabular-nums"
				placeholder={placeholder}
				value={formatarMoeda(valor)}
				onChange={(e) => {
					// Só os dígitos importam; os 2 últimos são os centavos.
					const digitos = e.target.value.replace(/\D/g, "").slice(0, 12);
					aoMudar(digitos ? Number(digitos) / 100 : 0);
				}}
			/>
		</div>
	);
}

/* ─────────────────────────  Telefone / CPF / CNPJ / CEP  ───────────────────── */

const soDigitos = (s: string) => s.replace(/\D/g, "");

export function mascaraTelefone(v: string): string {
	const d = soDigitos(v).slice(0, 11);
	if (d.length <= 2) return d;
	if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
	if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
	return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; // celular com 9
}

export function mascaraCpf(v: string): string {
	const d = soDigitos(v).slice(0, 11);
	return d
		.replace(/(\d{3})(\d)/, "$1.$2")
		.replace(/(\d{3})(\d)/, "$1.$2")
		.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function mascaraCnpj(v: string): string {
	const d = soDigitos(v).slice(0, 14);
	return d
		.replace(/(\d{2})(\d)/, "$1.$2")
		.replace(/(\d{3})(\d)/, "$1.$2")
		.replace(/(\d{3})(\d)/, "$1/$2")
		.replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function mascaraCep(v: string): string {
	const d = soDigitos(v).slice(0, 8);
	return d.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

/**
 * Campo mascarado. O `onChange` entrega o valor **limpo** (só dígitos); a máscara
 * fica só no que aparece na tela.
 */
export function CampoMascarado({
	tipo,
	valor,
	aoMudar,
	id,
	placeholder,
	disabled,
}: {
	tipo: "telefone" | "cpf" | "cnpj" | "cep";
	valor: string;
	aoMudar: (limpo: string) => void;
	id?: string;
	placeholder?: string;
	disabled?: boolean;
}) {
	const mascaras = { telefone: mascaraTelefone, cpf: mascaraCpf, cnpj: mascaraCnpj, cep: mascaraCep };
	const padroes = {
		telefone: "(11) 98765-4321",
		cpf: "000.000.000-00",
		cnpj: "00.000.000/0000-00",
		cep: "00000-000",
	};
	return (
		<Input
			id={id}
			inputMode="numeric"
			disabled={disabled}
			placeholder={placeholder ?? padroes[tipo]}
			value={mascaras[tipo](valor ?? "")}
			onChange={(e) => aoMudar(soDigitos(e.target.value))}
		/>
	);
}

/* ───────────────────────────────  Validações  ──────────────────────────────── */

/** CPF de verdade (dígito verificador) — impede o clássico "111.111.111-11". */
export function cpfValido(cpf: string): boolean {
	const d = soDigitos(cpf);
	if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
	const calc = (ate: number) => {
		let soma = 0;
		for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
		const r = (soma * 10) % 11;
		return r === 10 ? 0 : r;
	};
	return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** CNPJ de verdade (dígito verificador). */
export function cnpjValido(cnpj: string): boolean {
	const d = soDigitos(cnpj);
	if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
	const calc = (ate: number) => {
		const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
		let soma = 0;
		for (let i = 0; i < ate; i++) soma += Number(d[i]) * pesos[i];
		const r = soma % 11;
		return r < 2 ? 0 : 11 - r;
	};
	return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
