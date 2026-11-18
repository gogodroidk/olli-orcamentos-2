/**
 * Lê o contato que o WhatsApp compartilhou com o painel instalado (D-2245).
 * O `sw-compartilhar.js` guardou o(s) .vcf no Cache Storage e mandou para
 * /clientes?compartilhado=1. Aqui lemos, APAGAMOS (nada fica guardado) e
 * entregamos à prévia — a pessoa ainda confere antes de virar cliente.
 */
import { lerArquivoDeContatos } from "./contatos";

const CACHE = "olli-compartilhado";
const CHAVE = "/compartilhado/contatos.json";

type Guardado = { itens?: Array<{ nome?: string; texto?: string }>; falhou?: boolean };
export type Recebido = { ok: true; contatos: Array<{ nome: string; telefones: string[] }> } | { ok: false; motivo: string };

export async function lerContatosCompartilhados(): Promise<Recebido> {
	// Tira o ?compartilhado=1 da barra: recarregar a página não reabre a prévia.
	const url = new URL(window.location.href);
	url.searchParams.delete("compartilhado");
	window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);

	let guardado: Guardado | null = null;
	try {
		const cache = await caches.open(CACHE);
		const resp = await cache.match(CHAVE);
		await cache.delete(CHAVE);
		guardado = resp ? ((await resp.json()) as Guardado) : null;
	} catch {
		guardado = null;
	}
	if (!guardado || guardado.falhou || !guardado.itens?.length) {
		return { ok: false, motivo: "Não recebi o contato compartilhado. Compartilhe de novo pelo WhatsApp ou use Importar dos contatos." };
	}
	const contatos: Array<{ nome: string; telefones: string[] }> = [];
	for (const item of guardado.itens) {
		const r = lerArquivoDeContatos(item.nome ?? "contato.vcf", new TextEncoder().encode(item.texto ?? ""));
		if (r.ok) contatos.push(...r.contatos);
	}
	return contatos.length ? { ok: true, contatos } : { ok: false, motivo: "O contato compartilhado veio sem nome nem telefone que eu consiga ler." };
}
