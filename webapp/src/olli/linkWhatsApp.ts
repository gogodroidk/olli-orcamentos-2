/**
 * Link `wa.me` para abrir o WhatsApp do CLIENTE com a mensagem pronta (painel web).
 *
 * Por que existe: no painel não há `Linking` do celular; o jeito honesto de "enviar" é abrir o
 * WhatsApp (Web ou app, o sistema decide) com o texto escrito. Abrir NÃO é enviar — quem manda é
 * a pessoa, e só depois ela confirma ("Já enviei"), igual ao app.
 *
 * Regras do número:
 *  - só dígitos (a máscara `(11) 98123-4567` e o `+55` são normalizados);
 *  - Brasil: 10 dígitos (fixo) ou 11 (celular) ganham o DDI 55; 12–13 começando em 55 já vêm com ele;
 *  - qualquer outra coisa → `null`. Número duvidoso NÃO vira link: o chamador pede para corrigir o
 *    cadastro do cliente em vez de abrir o WhatsApp de um desconhecido.
 */
export function numeroParaWhatsApp(telefone: string | null | undefined): string | null {
	const digitos = String(telefone ?? "")
		.replace(/\D/g, "")
		.replace(/^0+/, "");
	return nacionalValido(digitos) ? `55${digitos}` : comDdi(digitos);
}

/** DDD válido (11–99, sem zero) + celular de 11 dígitos começa com 9; fixo de 10 começa com 2–9. */
function nacionalValido(d: string): boolean {
	if (!/^[1-9][1-9]/.test(d)) return false;
	if (d.length === 11) return d[2] === "9";
	if (d.length === 10) return /[2-9]/.test(d[2]);
	return false;
}

function comDdi(d: string): string | null {
	if ((d.length === 12 || d.length === 13) && d.startsWith("55") && nacionalValido(d.slice(2))) return d;
	return null;
}

export function linkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
	const numero = numeroParaWhatsApp(telefone);
	if (!numero) return null;
	return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
