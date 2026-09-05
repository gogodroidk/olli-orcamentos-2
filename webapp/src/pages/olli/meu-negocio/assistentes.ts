import { supabase } from "@/lib/supabase";
import { perguntarAoAssistente } from "@/pages/olli/diagnostico/chat";

const WORKER_URL = (
	(import.meta.env.VITE_DIAGNOSTICO_URL as string | undefined) ?? "https://diagnostico.olliorcamentos.online"
).replace(/\/+$/, "");

export interface EmpresaCnpjWeb {
	razaoSocial: string;
	nomeFantasia: string;
	cnaePrincipal: { codigo: string; descricao: string };
	logradouro: string;
	bairro: string;
	municipio: string;
	uf: string;
}

export type ResultadoCnpjWeb =
	| { estado: "ok"; empresa: EmpresaCnpjWeb }
	| { estado: "invalido" | "nao_encontrado" | "indisponivel" };

export interface SugestaoMarcaWeb {
	especialidade: string;
	slogan: string;
	explicacao: string;
}

export type ResultadoMarcaWeb =
	| { estado: "ok"; sugestao: SugestaoMarcaWeb }
	| { estado: "erro" | "sem_creditos"; mensagem: string };

function textoCurto(valor: unknown, limite: number): string {
	return typeof valor === "string"
		? valor.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, limite)
		: "";
}

export function extrairSugestaoMarcaWeb(resposta: string): SugestaoMarcaWeb | null {
	const bloco = resposta.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? resposta.match(/\{[\s\S]*\}/)?.[0];
	if (!bloco) return null;
	try {
		const objeto = JSON.parse(bloco) as Record<string, unknown>;
		const especialidade = textoCurto(objeto.especialidade, 120);
		const slogan = textoCurto(objeto.slogan, 90);
		const explicacao = textoCurto(objeto.explicacao, 240);
		return especialidade && slogan ? { especialidade, slogan, explicacao } : null;
	} catch {
		return null;
	}
}

export async function consultarCnpjWeb(valor: string): Promise<ResultadoCnpjWeb> {
	const cnpj = valor.replace(/\D/g, "");
	if (cnpj.length !== 14) return { estado: "invalido" };
	let token: string | null = null;
	try {
		const { data } = await supabase.auth.getSession();
		token = data.session?.access_token ?? null;
	} catch {
		token = null;
	}
	if (!token) return { estado: "indisponivel" };

	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), 15_000);
	try {
		const resposta = await fetch(`${WORKER_URL}/cnpj/${cnpj}`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: controller.signal,
		});
		if (resposta.status === 404) return { estado: "nao_encontrado" };
		if (!resposta.ok) return { estado: "indisponivel" };
		const dados = (await resposta.json().catch(() => null)) as { ok?: boolean; empresa?: Record<string, unknown> } | null;
		if (!dados?.ok || !dados.empresa) return { estado: "indisponivel" };
		const e = dados.empresa as Record<string, unknown>;
		const cnae = (e.cnaePrincipal ?? {}) as Record<string, unknown>;
		return {
			estado: "ok",
			empresa: {
				razaoSocial: textoCurto(e.razaoSocial, 180),
				nomeFantasia: textoCurto(e.nomeFantasia, 180),
				cnaePrincipal: { codigo: textoCurto(cnae.codigo, 20), descricao: textoCurto(cnae.descricao, 180) },
				logradouro: textoCurto(e.logradouro, 180),
				bairro: textoCurto(e.bairro, 100),
				municipio: textoCurto(e.municipio, 100),
				uf: textoCurto(e.uf, 2).toUpperCase(),
			},
		};
	} catch {
		return { estado: "indisponivel" };
	} finally {
		window.clearTimeout(timer);
	}
}

export async function sugerirMarcaWeb(contexto: {
	nomeEmpresa?: string;
	segmento?: string;
	especialidadeAtual?: string;
	sloganAtual?: string;
	pedido: string;
	vertical?: string;
}): Promise<ResultadoMarcaWeb> {
	if (!contexto.pedido.trim()) return { estado: "erro", mensagem: "Conte como você quer posicionar sua empresa." };
	const prompt = [
		"Você é uma especialista em posicionamento de marca para prestadores de serviço brasileiros.",
		"Crie uma especialidade clara e um slogan curto, profissional e fácil de entender.",
		"Não invente certificações, anos de experiência, garantias, liderança de mercado nem fatos não informados.",
		"Responda SOMENTE com JSON válido, sem markdown, no formato:",
		'{"especialidade":"...","slogan":"...","explicacao":"..."}',
		`Empresa: ${contexto.nomeEmpresa?.trim() || "nome ainda não definido"}`,
		`Segmento: ${contexto.segmento?.trim() || "segmento geral"}`,
		`Especialidade atual: ${contexto.especialidadeAtual?.trim() || "vazia"}`,
		`Slogan atual: ${contexto.sloganAtual?.trim() || "vazio"}`,
		`Pedido do usuário: ${contexto.pedido.trim().slice(0, 700)}`,
	].join("\n");

	const resposta = await perguntarAoAssistente([{ role: "user", texto: prompt }], { vertical: contexto.vertical });
	if (!resposta.ok) {
		return {
			estado: resposta.erro.tipo === "creditos" ? "sem_creditos" : "erro",
			mensagem: `${resposta.erro.titulo}. ${resposta.erro.mensagem}`,
		};
	}
	const sugestao = extrairSugestaoMarcaWeb(resposta.resposta);
	return sugestao
		? { estado: "ok", sugestao }
		: { estado: "erro", mensagem: "A OLLI respondeu, mas não montou campos seguros para aplicar. Tente descrever sua empresa de outra forma." };
}
