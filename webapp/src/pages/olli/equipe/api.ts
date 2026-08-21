import { supabase } from "@/lib/supabase";
import type { Papel } from "./useEquipe";

const WORKER = ((import.meta.env.VITE_DIAGNOSTICO_URL as string | undefined) ?? "https://diagnostico.olliorcamentos.online").replace(/\/+$/, "");
export interface ConviteCriado { token: string; link: string }

export async function criarConviteEquipe(papel: Exclude<Papel, "owner">, email?: string): Promise<ConviteCriado> {
	const { data, error } = await supabase.auth.getSession();
	const token = data.session?.access_token;
	if (error || !token) throw new Error("Sua sessão expirou. Entre de novo para convidar.");
	let resposta: Response;
	try {
		resposta = await fetch(`${WORKER}/equipe/convite`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ papel, email: email?.trim() || undefined }) });
	} catch { throw new Error("Sem conexão. Confira a internet e tente de novo."); }
	const dados = (await resposta.json().catch(() => ({}))) as { erro?: string; token?: string; link?: string };
	if (!resposta.ok || !dados.token) {
		const mensagens: Record<string, string> = { sem_permissao: "Só o dono ou um administrador pode convidar.", sem_organizacao: "Crie a conta empresa antes de convidar sua equipe.", papel_invalido: "Escolha um papel válido.", muitas_requisicoes: "Muitos convites em pouco tempo. Aguarde um instante.", nao_autorizado: "Sua sessão expirou. Entre de novo para convidar.", plano_requer_empresa: "Novos convites fazem parte do plano Empresa. Confira sua assinatura em Planos." };
		throw new Error(mensagens[dados.erro ?? ""] ?? (resposta.status >= 500 ? "O serviço de convites está indisponível agora." : "Não consegui criar o convite agora."));
	}
	return { token: dados.token, link: dados.link || `https://link.olliorcamentos.online/equipe/convite/${dados.token}` };
}
