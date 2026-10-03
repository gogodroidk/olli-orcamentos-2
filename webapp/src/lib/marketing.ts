import {
	ambienteDoNavegador,
	capturarAtribuicao,
	lerAtribuicaoSalva,
	montarOrigemUtm,
	type OrigemUtm,
} from "@atribuicao";
import { consentimentoAtual, mostrarBannerConsentimento } from "@consentimento";
import { googleConversaoCadastro, googlePageView, iniciarGoogleTag } from "@google-tag";
import { iniciarPixel, pageView, rastrear } from "@meta-pixel";
import { supabase } from "@/lib/supabase";

/**
 * Marketing do painel: origem do cadastro (UTM/fbclid/gclid) + Meta Pixel.
 *
 * Fonte das regras: `web/src/lib/atribuicao.ts` e `metaPixel.ts` (alias `@atribuicao`
 * e `@meta-pixel`), as MESMAS que a landing usa. A landing grava a origem num cookie de
 * `.olliorcamentos.online`; aqui ela é lida, somada à URL de chegada e guardada também
 * em localStorage — a URL do painel muda depois do login, o localStorage não.
 *
 * Medição NUNCA pode quebrar o cadastro: tudo aqui engole exceção.
 *
 * PIXEL E GOOGLE TAG NO PAINEL: só as telas de entrada (`/auth/*`) mandam page view, e só
 * com consentimento (banner, `consentimento.ts`). A área logada mostra dado dos clientes
 * do usuário; nem a URL dela vai para o Meta ou o Google.
 *
 * TRÊS ESTADOS NO BANCO (erro nunca vira vazio): todo cadastro feito pelo painel grava
 * `medicao_anuncios` (versão + consentimento). Assim, no `gestor_trafego.py`:
 *   - sem `medicao_anuncios`            → origem DESCONHECIDA (app nativo ou antes da medição);
 *   - com `medicao_anuncios`, sem toque  → visita sem campanha (orgânico/direto);
 *   - com `origem_utm.*_toque`           → campanha conhecida.
 */

const LINK_PRIVACIDADE = "https://olliorcamentos.online/legal/privacidade/";
const VERSAO_MEDICAO = 1;

/** Pixel + Google tag das telas de entrada. Cada um só carrega com consentimento "sim". */
function iniciarTerceiros(): void {
	if (iniciarPixel()) pageView();
	if (iniciarGoogleTag(false)) googlePageView();
}

/** Uma conta social só é "nova" se foi criada há pouco — login de conta antiga não conta. */
const JANELA_CONTA_NOVA_MS = 10 * 60 * 1000;
const CHAVE_CONTA_REGISTRADA = "olli_attr_conta";

/** Chamada uma vez no boot (main.tsx), antes do router. */
export function iniciarMarketing(): void {
	try {
		const ambiente = ambienteDoNavegador();
		if (!ambiente) return;
		capturarAtribuicao(ambiente);
		if (!ambiente.pathname.startsWith("/auth")) return;
		iniciarTerceiros();
		mostrarBannerConsentimento(iniciarTerceiros, LINK_PRIVACIDADE);
	} catch {
		// Sem medição, o painel abre igual.
	}
}

/** Marcador gravado em TODO cadastro do painel (ver "três estados" acima). */
export interface MedicaoAnuncios {
	versao: number;
	/** "sim" | "nao" | "sem_resposta" — o servidor só manda CAPI com "sim". */
	consentimento: "sim" | "nao" | "sem_resposta";
	/** User agent do navegador do cadastro: exigido pela Conversions API. Só com "sim". */
	ua?: string;
}

function montarMedicao(): MedicaoAnuncios {
	const consentimento = consentimentoAtual() ?? "sem_resposta";
	const medicao: MedicaoAnuncios = { versao: VERSAO_MEDICAO, consentimento };
	if (consentimento === "sim" && typeof navigator !== "undefined") medicao.ua = navigator.userAgent.slice(0, 400);
	return medicao;
}

/**
 * `{ origem_utm, medicao_anuncios }` para o `options.data` do cadastro (vira
 * `user_metadata`, sem migration). `origem_utm` só vem quando há algo a gravar;
 * `medicao_anuncios` vem sempre. Falha aqui nunca derruba o cadastro: devolve só o
 * marcador com consentimento "sem_resposta".
 */
export function origemUtmParaCadastro(): { origem_utm?: OrigemUtm; medicao_anuncios: MedicaoAnuncios } {
	try {
		const medicao_anuncios = montarMedicao();
		const ambiente = ambienteDoNavegador();
		if (!ambiente) return { medicao_anuncios };
		const origem = montarOrigemUtm(lerAtribuicaoSalva(ambiente), ambiente.lerCookies());
		return origem ? { origem_utm: origem, medicao_anuncios } : { medicao_anuncios };
	} catch {
		return { medicao_anuncios: { versao: VERSAO_MEDICAO, consentimento: "sem_resposta" } };
	}
}

/**
 * Cadastro concluído: CompleteRegistration (Meta) + conversão "Cadastro" (Google Ads).
 * `metodo` = "email" | "google" | "apple". O id do evento é `cadastro-<id do usuário>`,
 * o MESMO que o worker manda pela Conversions API (worker/src/anunciosConversoes.js):
 * o Meta conta um só. No Google, o mesmo valor vai como transaction_id.
 */
export function registrarCadastroConcluido(metodo: string, userId: string | undefined): void {
	try {
		if (!userId) return;
		if (iniciarPixel()) {
			rastrear("CompleteRegistration", { status: true, registration_method: metodo }, `cadastro-${userId}`);
		}
		if (iniciarGoogleTag(false)) googleConversaoCadastro(userId);
	} catch {
		// idem
	}
}

interface UsuarioAuth {
	id: string;
	created_at?: string;
	app_metadata?: { provider?: string };
	user_metadata?: Record<string, unknown>;
}

function contaJaRegistrada(id: string): boolean {
	try {
		if (window.localStorage.getItem(CHAVE_CONTA_REGISTRADA) === id) return true;
		window.localStorage.setItem(CHAVE_CONTA_REGISTRADA, id);
	} catch {
		// Sem storage não dá para deduplicar; a janela de 10 min limita o estrago.
	}
	return false;
}

/**
 * Cadastro por Google/Apple: `signInWithOAuth` não aceita `data`, então a origem é
 * gravada logo após o PRIMEIRO login da conta (`updateUser` faz merge em
 * `user_metadata`, o nome vindo do provedor é preservado) e o CompleteRegistration
 * é disparado aqui, uma vez por conta. Cadastro por e-mail não passa por aqui: a origem
 * já foi no `signUp` e o evento foi disparado no formulário.
 */
export async function registrarNovaContaSocial(user: UsuarioAuth): Promise<void> {
	try {
		const provedor = user.app_metadata?.provider;
		if (!provedor || provedor === "email") return;
		const criadoEm = Date.parse(user.created_at ?? "");
		if (!Number.isFinite(criadoEm) || Date.now() - criadoEm > JANELA_CONTA_NOVA_MS) return;
		if (contaJaRegistrada(user.id)) return;

		registrarCadastroConcluido(provedor, user.id);

		if (user.user_metadata?.medicao_anuncios) return;
		const dados: Record<string, unknown> = { ...origemUtmParaCadastro() };
		// `updateUser` faz merge: não sobrescreve uma origem já gravada.
		if (user.user_metadata?.origem_utm) delete dados.origem_utm;
		const { error } = await supabase.auth.updateUser({ data: dados });
		if (error) console.warn("[marketing] não foi possível gravar a origem do cadastro:", error.message);
	} catch {
		// idem
	}
}
