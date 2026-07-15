/**
 * MEU NEGÓCIO — o cadastro que sai em TODO documento que o cliente recebe.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * A REGRA QUE MANDA NESTE ARQUIVO: MERGE, NUNCA SUBSTITUIÇÃO
 * ═══════════════════════════════════════════════════════════════════════════════
 * A tabela `empresa` tem exatamente TRÊS colunas — `user_id`, `dados` (jsonb) e
 * `atualizado_em` (conferido no banco de produção). Ou seja: **tudo** mora no blob:
 * logo, assinatura digitalizada, licenças da ANVISA, ofício/verticais, modelos de
 * PDF… muita coisa que esta tela NEM MOSTRA.
 *
 * Se salvássemos "o objeto da tela" por cima de `dados`, apagaríamos em silêncio o
 * que o dono cadastrou no celular — a assinatura sumiria do PDF e ele não saberia
 * por quê. Por isso o salvamento (1) RELÊ a linha, (2) escreve só as chaves desta
 * tela sobre o objeto lido e (3) recusa gravar se a linha mudou desde que a tela
 * abriu (outro aparelho salvou no meio do caminho) — mesma guarda do `cloudSync`
 * do app, que também se recusa a sobrescrever uma edição que nunca viu.
 *
 * OUTRAS DECISÕES QUE PARECEM DETALHE E NÃO SÃO:
 * • CNPJ e CPF são AMBOS opcionais. O público é MEI e informal; exigir documento
 *   trava o cadastro de quem o produto quer atender. Mas se digitar, tem que ser
 *   válido (dígito verificador) — documento errado no PDF é pior que nenhum.
 * • COR DA MARCA: paleta fechada, não color picker. A cor pinta o cabeçalho do PDF
 *   com TEXTO BRANCO em cima; amarelo livre = orçamento ilegível na mão do cliente.
 * • LOGO: sem upload. Não há bucket de storage, e o que o celular grava é um
 *   `file://` do próprio aparelho — que o navegador não consegue exibir. Fingir um
 *   upload aqui geraria um logo que some. Dizemos a verdade e mostramos o que dá.
 * • ESCRITA SÓ DO DONO (RLS `empresa_owner_write`): um membro da equipe que salvasse
 *   aqui criaria uma SEGUNDA linha `empresa` (a dele) em vez de editar a do dono.
 *   Então: quem não é dono vê a tela em leitura. E se não der para SABER o papel,
 *   bloqueamos — chutar "é o dono" é como o dado se corrompe.
 */
import type { Empresa } from "@dominio";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Check, CheckCircle2, ImageOff, Loader2, Lock, RotateCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useBlocker } from "react-router";
import { supabase } from "@/lib/supabase";
import { applyBrandColor } from "@/olli/branding";
import { Campo, CampoMascarado, cnpjValido, cpfValido } from "@/olli/components/campos";
import { useMinhaEmpresa } from "@/olli/data";
import { useContextoDeEscrita } from "@/olli/mutacoes";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Input } from "@/ui/input";
import { Skeleton } from "@/ui/skeleton";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils";
import {
	CORES_MARCA,
	contrasteTextoSobre,
	empresaEmBranco,
	GARANTIAS_PADRAO,
	logoExibivel,
	VALIDADE_DIAS_DEFAULT,
	VALIDADES_PADRAO,
} from "./constantes";

const HEX = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A linha crua de `empresa` (as 3 colunas reais). */
interface LinhaEmpresa {
	dados?: Empresa | null;
	atualizado_em?: string | null;
}

/** Erros de validação, por campo. */
type Erros = Partial<Record<"nome" | "cnpj" | "cpf" | "email", string>>;

function validar(f: Empresa): Erros {
	const e: Erros = {};
	if (!f.nome.trim()) e.nome = "O nome da empresa aparece no topo de todo orçamento. Preencha.";
	// Documento é OPCIONAL (MEI/informal) — mas, se preenchido, precisa ser real.
	if (f.cnpj.trim() && !cnpjValido(f.cnpj)) e.cnpj = "Esse CNPJ não existe (dígito verificador). Confira os números.";
	if (f.cpf.trim() && !cpfValido(f.cpf)) e.cpf = "Esse CPF não existe (dígito verificador). Confira os números.";
	if (f.email.trim() && !EMAIL.test(f.email.trim())) e.email = "E-mail inválido.";
	return e;
}

/**
 * Valor de um campo OPCIONAL na hora de gravar.
 * - preenchido            → grava o valor
 * - apagado, mas existia  → grava '' (limpar TEM que persistir; senão o merge devolve o antigo)
 * - vazio e nunca existiu → `undefined` = chave OMITIDA (o app omite; não gravamos chave vazia à toa)
 */
function opcional(valor: string | undefined, base: string | undefined): string | undefined {
	const v = (valor ?? "").trim();
	if (v) return v;
	return base === undefined ? undefined : "";
}

export default function MeuNegocio() {
	const empresaQ = useMinhaEmpresa();
	const contexto = useContextoDeEscrita();
	const qc = useQueryClient();

	const linha = empresaQ.data as LinhaEmpresa | null | undefined;
	const carregadoEm = linha?.atualizado_em ?? null;

	const [form, setForm] = useState<Empresa | null>(null);
	const [semeadoEm, setSemeadoEm] = useState<string | null>(null);
	const [erros, setErros] = useState<Erros>({});
	const [salvoEm, setSalvoEm] = useState<string | null>(null);

	// Semeia o formulário com o blob REAL (e o mantém alinhado quando a linha
	// recarrega). `empresaEmBranco()` embaixo garante que nenhuma string obrigatória
	// do tipo Empresa entre como `undefined` num cadastro que ainda não existe.
	const revisao = empresaQ.dataUpdatedAt;
	useEffect(() => {
		if (empresaQ.isLoading || empresaQ.isError) return;
		setForm((atual) => {
			// Nunca sobrescreve o que o usuário está digitando: se já há rascunho, mantém.
			if (atual) return atual;
			return { ...empresaEmBranco(), ...(linha?.dados ?? {}) };
		});
		setSemeadoEm((s) => s ?? carregadoEm ?? "novo");
	}, [empresaQ.isLoading, empresaQ.isError, linha, carregadoEm]);

	const cor = (form?.corMarca ?? "").trim();

	// PRÉVIA DA MARCA: a cor escolhida repinta o painel na hora — é o que a pessoa
	// está comprando (white-label). `pickBrandColor` (olli/branding.ts) já olha
	// `dados.corMarca` no blob, então o `useApplyBranding` do layout reaplica a
	// MESMA cor salva a cada refetch — este efeito só cobre a prévia de uma cor
	// ainda não salva (rascunho), sem precisar de setTimeout.
	useEffect(() => {
		// `revisao` (dataUpdatedAt) é dependência DE PROPÓSITO: cada refetch da empresa
		// é um momento em que o layout reaplica a cor salva — e esta prévia tem que
		// vencer de novo se houver um rascunho diferente na tela.
		void revisao;
		if (HEX.test(cor)) applyBrandColor(cor);
	}, [cor, revisao]);

	const sujo = useMemo(() => {
		if (!form || empresaQ.isLoading || empresaQ.isError) return false;
		const base = { ...empresaEmBranco(), ...(linha?.dados ?? {}) };
		return JSON.stringify(form) !== JSON.stringify(base);
	}, [form, linha, empresaQ.isLoading, empresaQ.isError]);

	// Fechar a aba com alteração não salva pede confirmação (o navegador mostra o
	// aviso padrão). Perder o cadastro por um Ctrl+W é frustração barata de evitar.
	useEffect(() => {
		if (!sujo) return;
		const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", aviso);
		return () => window.removeEventListener("beforeunload", aviso);
	}, [sujo]);

	// `beforeunload` só cobre fechar/recarregar a ABA — navegar pelo MENU (SPA,
	// react-router) não passa por lá, e o rascunho some sem aviso nenhum. `useBlocker`
	// intercepta a troca de rota dentro do próprio app.
	const bloqueador = useBlocker(
		({ currentLocation, nextLocation }) => sujo && currentLocation.pathname !== nextLocation.pathname,
	);
	useEffect(() => {
		if (bloqueador.state !== "blocked") return;
		if (window.confirm("Você tem alterações não salvas. Sair mesmo assim?")) {
			bloqueador.proceed();
		} else {
			bloqueador.reset();
		}
	}, [bloqueador]);

	/* ─────────────  Quem pode gravar (RLS: escrita só do dono)  ───────────── */
	const papel = contexto.data?.papel;
	const ehDono = papel === "owner" || papel === "pessoal";
	const permissaoDesconhecida = contexto.isLoading || contexto.isError || !papel;
	const somenteLeitura = !permissaoDesconhecida && !ehDono;
	const bloqueado = permissaoDesconhecida || somenteLeitura;

	const salvar = useMutation({
		mutationFn: async (f: Empresa) => {
			if (contexto.isLoading) throw new Error("Carregando seu perfil… tente de novo em um instante.");
			if (contexto.isError || !papel) {
				throw new Error("Não consegui confirmar se você é o dono desta empresa. Recarregue a página e tente de novo.");
			}
			if (!ehDono) {
				throw new Error("Só o dono da empresa pode alterar este cadastro. Peça a ele, ou fale com o suporte.");
			}

			// 1. RELÊ a linha: é dela que sai a base do merge (e o teste de conflito).
			const { data, error } = await supabase.from("empresa").select("dados, atualizado_em").limit(1).maybeSingle();
			if (error) {
				throw new Error("Não consegui conferir a versão mais recente do seu cadastro. Tente de novo.");
			}
			const atual = data as LinhaEmpresa | null;
			const atualEm = atual?.atualizado_em ?? null;

			// 2. CONFLITO: alguém (o celular, outro navegador) salvou depois que esta tela
			//    abriu. Gravar por cima descartaria a edição do outro sem ninguém ver.
			if ((semeadoEm ?? "novo") !== (atualEm ?? "novo")) {
				throw new Error(
					"Este cadastro foi alterado em outro aparelho depois que você abriu a tela. Recarregue para ver a versão mais nova (suas alterações desta tela serão descartadas).",
				);
			}

			// 3. MERGE campo a campo sobre o objeto do banco. As chaves que esta tela não
			//    conhece (assinatura, licenças, ofício, modelos de PDF…) vêm de `base` e
			//    ficam intactas.
			const base: Empresa = { ...empresaEmBranco(), ...(atual?.dados ?? {}) };
			const dados: Empresa = {
				...base,
				nome: f.nome.trim(),
				nomePrestador: f.nomePrestador.trim(),
				especialidade: f.especialidade.trim(),
				slogan: f.slogan.trim(),
				cnpj: f.cnpj.trim(),
				cpf: f.cpf.trim(),
				endereco: f.endereco.trim(),
				cidade: f.cidade.trim(),
				estado: f.estado.trim().toUpperCase().slice(0, 2),
				telefone: f.telefone.trim(),
				whatsapp: f.whatsapp.trim(),
				site: f.site.trim(),
				email: f.email.trim(),
				chavePix: f.chavePix.trim(),
				normas: f.normas.trim(),
			};

			// Opcionais: só entram se tiverem valor (ou se precisarem ser LIMPOS).
			const corMarca = opcional(f.corMarca, base.corMarca);
			if (corMarca !== undefined) dados.corMarca = corMarca;
			const garantia = opcional(f.garantiaPadrao, base.garantiaPadrao);
			if (garantia !== undefined) dados.garantiaPadrao = garantia;
			const condicoes = opcional(f.condicoesPagamentoPadrao, base.condicoesPagamentoPadrao);
			if (condicoes !== undefined) dados.condicoesPagamentoPadrao = condicoes;
			const observacoes = opcional(f.observacoesPadrao, base.observacoesPadrao);
			if (observacoes !== undefined) dados.observacoesPadrao = observacoes;
			const linkGoogle = opcional(f.linkGoogleAvaliacoes, base.linkGoogleAvaliacoes);
			if (linkGoogle !== undefined) dados.linkGoogleAvaliacoes = linkGoogle;
			if (f.validadeDiasPadrao !== undefined) dados.validadeDiasPadrao = f.validadeDiasPadrao;

			// 4. Grava. `user_id` NÃO vai no payload: a coluna tem default `auth.uid()` e o
			//    conflito é por `user_id` (uma linha por dono) — igual ao app.
			const { error: erroGravar } = await supabase
				.from("empresa")
				.upsert({ dados, atualizado_em: new Date().toISOString() }, { onConflict: "user_id" });
			if (erroGravar) throw new Error(erroGravar.message || "Não consegui salvar agora. Tente de novo.");

			return dados;
		},
		onSuccess: async (dados) => {
			setForm(dados);
			setSalvoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
			await qc.invalidateQueries({ queryKey: ["olli", "empresa", "me"] });
			// Reancora o teste de conflito na linha RECÉM-GRAVADA: sem isto, um segundo
			// "Salvar" seguido acusaria conflito com a própria escrita anterior.
			const nova = (qc.getQueryData(["olli", "empresa", "me"]) as LinhaEmpresa | null)?.atualizado_em ?? null;
			setSemeadoEm(nova ?? "novo");
		},
	});

	function aoSubmeter(e: React.FormEvent) {
		e.preventDefault();
		if (!form || bloqueado) return;
		const v = validar(form);
		setErros(v);
		if (Object.keys(v).length > 0) {
			// Alguns campos com erro são <input> diretos (data-erro cai no elemento em
			// si); CNPJ/CPF usam CampoMascarado (não repassa props extra pro Input), por
			// isso o data-erro fica num <div> WRAPPER — busca o input dentro dele.
			const alvo = document.querySelector<HTMLElement>("[data-erro='1']");
			if (alvo) {
				alvo.scrollIntoView({ block: "center", behavior: "smooth" });
				(alvo.matches("input,textarea,select")
					? alvo
					: alvo.querySelector<HTMLElement>("input,textarea,select")
				)?.focus();
			}
			return;
		}
		setSalvoEm(null);
		salvar.mutate(form);
	}

	const set = <K extends keyof Empresa>(chave: K, valor: Empresa[K]) => {
		setForm((p) => (p ? { ...p, [chave]: valor } : p));
		// Corrigir o campo limpa o erro dele na hora — não fica preso até o próximo Salvar.
		setErros((e) => {
			const k = chave as unknown as keyof Erros;
			if (!(k in e)) return e;
			const proximo = { ...e };
			delete proximo[k];
			return proximo;
		});
	};

	/* ───────────────────────────  3 estados  ─────────────────────────── */

	if (empresaQ.isLoading || !form) {
		return (
			<Pagina>
				<div className="space-y-5">
					<Skeleton className="h-40 w-full rounded-xl" />
					<Skeleton className="h-64 w-full rounded-xl" />
					<Skeleton className="h-64 w-full rounded-xl" />
				</div>
			</Pagina>
		);
	}

	if (empresaQ.isError && !form) {
		// ERRO NUNCA VIRA FORMULÁRIO VAZIO: um formulário em branco convidaria o dono a
		// redigitar tudo — e o "salvar" desse formulário apagaria o cadastro real.
		// Isto só roda quando NUNCA houve dado nesta sessão (form ainda é null) — uma
		// falha de REFETCH em segundo plano (form já preenchido, com rascunho ou não)
		// não pode substituir a tela inteira: ver o Aviso inline logo abaixo.
		return (
			<Pagina>
				<Card className="flex flex-col items-center gap-3 p-12 text-center">
					<div className="grid size-12 place-items-center rounded-2xl bg-error/10 text-error">
						<AlertTriangle className="size-6" />
					</div>
					<p className="font-semibold text-text-primary">Não consegui carregar o cadastro da sua empresa</p>
					<p className="max-w-md text-sm text-text-secondary">
						{(empresaQ.error as Error)?.message ??
							"Falha ao consultar seus dados. Nada foi alterado — seu cadastro continua salvo."}
					</p>
					<Button variant="outline" onClick={() => empresaQ.refetch()}>
						<RotateCw className="size-4" />
						Tentar de novo
					</Button>
				</Card>
			</Pagina>
		);
	}

	const logo = logoExibivel(form.logoUri);
	const temLogoNaoExibivel = !!form.logoUri && !logo;
	const validadeAtiva = form.validadeDiasPadrao ?? VALIDADE_DIAS_DEFAULT;

	return (
		<Pagina>
			<form id="form-meu-negocio" onSubmit={aoSubmeter} className="space-y-5 pb-28">
				{/* Aviso de permissão — honesto sobre POR QUE está travado. */}
				{somenteLeitura && (
					<Aviso tom="info" Icone={Lock}>
						Este cadastro é da empresa, e só o <strong>dono</strong> pode alterá-lo. Você pode conferir os dados aqui;
						para corrigir algo, fale com o dono da conta.
					</Aviso>
				)}
				{contexto.isError && (
					<Aviso tom="erro" Icone={AlertTriangle}>
						Não consegui confirmar seu papel nesta empresa, então o salvamento está bloqueado (gravar sem saber quem é
						você poderia duplicar o cadastro).{" "}
						<button
							type="button"
							className="font-semibold underline underline-offset-2"
							onClick={() => contexto.refetch()}
						>
							Tentar de novo
						</button>
					</Aviso>
				)}
				{/* Falha de REFETCH em segundo plano (já havia formulário na tela, com ou sem
				    rascunho): avisa sem derrubar o formulário — trocar por um card de erro
				    faria o dono achar que o cadastro sumiu e "descartaria" o rascunho dele. */}
				{empresaQ.isError && (
					<Aviso tom="erro" Icone={AlertTriangle}>
						Não consegui atualizar o cadastro agora. O que está na tela continua aqui, sem alteração.{" "}
						<button
							type="button"
							className="font-semibold underline underline-offset-2"
							onClick={() => empresaQ.refetch()}
						>
							Tentar de novo
						</button>
					</Aviso>
				)}

				{/* ───────────────  IDENTIDADE  ─────────────── */}
				<Bloco
					titulo="Identidade"
					descricao="É o que aparece no cabeçalho do orçamento, do recibo e da OS que o cliente recebe."
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<Campo rotulo="Nome da empresa" obrigatorio erro={erros.nome} className="sm:col-span-2">
							<Input
								data-erro={erros.nome ? "1" : undefined}
								disabled={bloqueado}
								value={form.nome}
								onChange={(e) => set("nome", e.target.value)}
								placeholder="Ex.: Clima Bom Refrigeração"
							/>
						</Campo>

						<Campo rotulo="Nome do prestador" dica="Quem assina o serviço.">
							<Input
								disabled={bloqueado}
								value={form.nomePrestador}
								onChange={(e) => set("nomePrestador", e.target.value)}
								placeholder="Ex.: João da Silva"
							/>
						</Campo>

						<Campo rotulo="Especialidade">
							<Input
								disabled={bloqueado}
								value={form.especialidade}
								onChange={(e) => set("especialidade", e.target.value)}
								placeholder="Ex.: Assistência técnica de ar-condicionado"
							/>
						</Campo>

						<Campo rotulo="Slogan" className="sm:col-span-2">
							<Input
								disabled={bloqueado}
								value={form.slogan}
								onChange={(e) => set("slogan", e.target.value)}
								placeholder="A frase da sua marca"
							/>
						</Campo>

						{/* CampoMascarado não repassa props extras pro <input> (não é o dono deste
						    componente — vive em olli/components/campos.tsx); por isso o
						    data-erro vai no <div> wrapper, e o foco/scroll de erro busca o
						    <input> ali dentro (ver aoSubmeter). */}
						<div data-erro={erros.cnpj ? "1" : undefined}>
							<Campo rotulo="CNPJ" erro={erros.cnpj} dica="Opcional — deixe em branco se você não tem CNPJ.">
								<CampoMascarado tipo="cnpj" disabled={bloqueado} valor={form.cnpj} aoMudar={(v) => set("cnpj", v)} />
							</Campo>
						</div>

						<div data-erro={erros.cpf ? "1" : undefined}>
							<Campo rotulo="CPF" erro={erros.cpf} dica="Opcional — use se você trabalha como pessoa física.">
								<CampoMascarado tipo="cpf" disabled={bloqueado} valor={form.cpf} aoMudar={(v) => set("cpf", v)} />
							</Campo>
						</div>

						<Campo rotulo="Endereço" className="sm:col-span-2">
							<Input
								disabled={bloqueado}
								value={form.endereco}
								onChange={(e) => set("endereco", e.target.value)}
								placeholder="Rua, número, bairro"
							/>
						</Campo>

						<Campo rotulo="Cidade">
							<Input disabled={bloqueado} value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
						</Campo>

						<Campo rotulo="UF">
							<Input
								disabled={bloqueado}
								value={form.estado}
								maxLength={2}
								className="uppercase"
								onChange={(e) => set("estado", e.target.value.toUpperCase().slice(0, 2))}
								placeholder="SP"
							/>
						</Campo>
					</div>
				</Bloco>

				{/* ───────────────  MARCA (logo + cor)  ─────────────── */}
				<Bloco titulo="Marca" descricao="A cor pinta o cabeçalho dos seus documentos — e este painel.">
					<div className="grid gap-6 md:grid-cols-[220px_1fr]">
						<div>
							<p className="mb-2 text-sm font-medium text-text-primary">Logo</p>
							{logo ? (
								<div className="grid h-28 place-items-center rounded-xl border border-border bg-bg-neutral/40 p-3">
									<img src={logo} alt="Logo da sua empresa" className="max-h-full max-w-full object-contain" />
								</div>
							) : (
								<div className="grid h-28 place-items-center gap-1 rounded-xl border border-dashed border-border bg-bg-neutral/30 p-3 text-center">
									<ImageOff className="size-5 text-text-disabled" aria-hidden />
									<span className="text-xs text-text-secondary">
										{temLogoNaoExibivel ? "Logo salvo no celular" : "Sem logo"}
									</span>
								</div>
							)}
							{/* HONESTIDADE: não existe upload aqui, e o `file://` do celular não abre na web. */}
							<p className="mt-2 text-xs text-text-secondary">
								{temLogoNaoExibivel
									? "Seu logo foi enviado pelo app do celular e está guardado naquele aparelho — ele continua saindo nos PDFs gerados lá, mas o navegador não consegue exibi-lo aqui."
									: "O envio de logo é feito pelo app do celular (Meu negócio → Logo). Ele sai no topo dos seus documentos."}
							</p>
						</div>

						<div>
							<p className="mb-1 text-sm font-medium text-text-primary">Cor da marca</p>
							<p className="mb-3 text-xs text-text-secondary">
								Cores testadas para o texto branco do cabeçalho ficar legível no PDF impresso.
							</p>
							<div className="flex flex-wrap gap-2.5">
								{CORES_MARCA.map((c) => {
									const ativa = cor.toLowerCase() === c.value.toLowerCase();
									return (
										<button
											key={c.value}
											type="button"
											disabled={bloqueado}
											aria-pressed={ativa}
											aria-label={`Cor ${c.label}`}
											title={c.label}
											onClick={() => set("corMarca", c.value)}
											className={cn(
												"grid size-11 place-items-center rounded-xl border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
												ativa ? "scale-105 border-text-primary" : "border-transparent hover:scale-105",
											)}
											style={{ backgroundColor: c.value }}
										>
											{ativa && (
												<Check className="size-5" strokeWidth={3} style={{ color: contrasteTextoSobre(c.value) }} />
											)}
										</button>
									);
								})}
								<button
									type="button"
									disabled={bloqueado}
									aria-pressed={!HEX.test(cor)}
									onClick={() => set("corMarca", "")}
									className={cn(
										"h-11 rounded-xl border-2 px-3 text-xs font-semibold text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
										!HEX.test(cor) ? "border-text-primary bg-bg-neutral/60" : "border-border hover:bg-bg-neutral/40",
									)}
								>
									Padrão OLLI
								</button>
							</div>
							{HEX.test(cor) && (
								<p className="mt-3 text-xs text-text-secondary">
									Prévia aplicada. A cor só fica salva quando você clicar em <strong>Salvar alterações</strong>.
								</p>
							)}
						</div>
					</div>
				</Bloco>

				{/* ───────────────  CONTATO E PIX  ─────────────── */}
				<Bloco titulo="Contato e Pix" descricao="Como o cliente fala com você — e como ele te paga.">
					<div className="grid gap-4 sm:grid-cols-2">
						<Campo rotulo="Telefone">
							<CampoMascarado
								tipo="telefone"
								disabled={bloqueado}
								valor={form.telefone}
								aoMudar={(v) => set("telefone", v)}
							/>
						</Campo>

						<Campo rotulo="WhatsApp" dica="É por onde o orçamento é enviado.">
							<CampoMascarado
								tipo="telefone"
								disabled={bloqueado}
								valor={form.whatsapp}
								aoMudar={(v) => set("whatsapp", v)}
							/>
						</Campo>

						<Campo rotulo="E-mail" erro={erros.email}>
							<Input
								data-erro={erros.email ? "1" : undefined}
								type="email"
								disabled={bloqueado}
								value={form.email}
								onChange={(e) => set("email", e.target.value)}
								placeholder="contato@suaempresa.com.br"
							/>
						</Campo>

						<Campo rotulo="Site">
							<Input
								disabled={bloqueado}
								value={form.site}
								onChange={(e) => set("site", e.target.value)}
								placeholder="www.suaempresa.com.br"
							/>
						</Campo>

						<Campo
							rotulo="Chave Pix"
							dica="Sai no orçamento e no recibo para o cliente pagar. Pode ser CPF/CNPJ, telefone, e-mail ou chave aleatória."
							className="sm:col-span-2"
						>
							<Input
								disabled={bloqueado}
								value={form.chavePix}
								onChange={(e) => set("chavePix", e.target.value)}
								placeholder="Sua chave Pix"
							/>
						</Campo>

						<Campo
							rotulo="Link de avaliação no Google"
							dica='O link "Escrever avaliação" do seu perfil no Google. Habilita o pedido de avaliação depois do serviço.'
							className="sm:col-span-2"
						>
							<Input
								disabled={bloqueado}
								value={form.linkGoogleAvaliacoes ?? ""}
								onChange={(e) => set("linkGoogleAvaliacoes", e.target.value)}
								placeholder="https://g.page/r/…"
							/>
						</Campo>
					</div>
				</Bloco>

				{/* ───────────────  PADRÕES  ─────────────── */}
				<Bloco
					titulo="Padrões que saem em todo orçamento"
					descricao="Pré-preenchem cada orçamento novo. Você ainda pode mudar tudo caso a caso, sem alterar estes padrões."
				>
					<div className="space-y-5">
						<div>
							<p className="mb-2 text-sm font-medium text-text-primary">Validade do orçamento</p>
							<div className="flex flex-wrap gap-2">
								{VALIDADES_PADRAO.map((dias) => (
									<Chip
										key={dias}
										ativo={validadeAtiva === dias}
										disabled={bloqueado}
										onClick={() => set("validadeDiasPadrao", dias)}
									>
										{dias} dias
									</Chip>
								))}
							</div>
						</div>

						<div>
							<p className="text-sm font-medium text-text-primary">Garantia</p>
							<p className="mb-2 text-xs text-text-secondary">
								Sugestões baseadas no art. 26 do Código de Defesa do Consumidor. Você pode escrever a sua.
							</p>
							<div className="mb-3 flex flex-wrap gap-2">
								{GARANTIAS_PADRAO.map((g) => (
									<Chip
										key={g.dias}
										ativo={(form.garantiaPadrao ?? "") === g.texto}
										disabled={bloqueado}
										onClick={() => set("garantiaPadrao", g.texto)}
									>
										{g.label}
									</Chip>
								))}
							</div>
							<Campo rotulo="Texto da garantia">
								<Textarea
									rows={3}
									disabled={bloqueado}
									value={form.garantiaPadrao ?? ""}
									onChange={(e) => set("garantiaPadrao", e.target.value)}
									placeholder="Ex.: 90 dias para mão de obra, conforme art. 26 do CDC."
								/>
							</Campo>
						</div>

						<Campo rotulo="Condições de pagamento">
							<Textarea
								rows={2}
								disabled={bloqueado}
								value={form.condicoesPagamentoPadrao ?? ""}
								onChange={(e) => set("condicoesPagamentoPadrao", e.target.value)}
								placeholder="Ex.: 50% de entrada, restante na entrega."
							/>
						</Campo>

						<Campo rotulo="Observações" dica="Texto que aparece em todo orçamento (ex.: horário de atendimento).">
							<Textarea
								rows={2}
								disabled={bloqueado}
								value={form.observacoesPadrao ?? ""}
								onChange={(e) => set("observacoesPadrao", e.target.value)}
								placeholder="Ex.: Atendemos de segunda a sábado, das 8h às 18h."
							/>
						</Campo>

						<Campo rotulo="Normas técnicas" dica="Ex.: NBR 16401, PMOC. Sai no rodapé dos documentos.">
							<Textarea
								rows={2}
								disabled={bloqueado}
								value={form.normas}
								onChange={(e) => set("normas", e.target.value)}
							/>
						</Campo>
					</div>
				</Bloco>

				{/* ───────────────  BARRA DE SALVAR  ─────────────── */}
				<div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur md:left-[var(--layout-nav-width,0px)]">
					<div className="mx-auto flex w-full max-w-5xl flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between md:px-6">
						<div className="min-w-0 text-sm">
							{/* Ordem IMPORTA: erro de mutação > validação falhou > rascunho sujo >
							    salvo > tudo salvo. "sujo" TEM que vencer "salvoEm" — senão a barra
							    continua dizendo "Alterações salvas" mesmo depois de uma edição nova
							    (salvoEm só é limpo no próximo submit, não a cada tecla). */}
							{salvar.isError ? (
								<p role="alert" className="flex items-start gap-2 font-medium text-error-dark dark:text-error">
									<AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
									<span>{(salvar.error as Error).message}</span>
								</p>
							) : Object.keys(erros).length > 0 ? (
								<p role="alert" className="flex items-start gap-2 font-medium text-error-dark dark:text-error">
									<AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
									<span>Confira os campos destacados acima.</span>
								</p>
							) : sujo ? (
								<p className="text-text-secondary">Você tem alterações não salvas.</p>
							) : salvoEm ? (
								<p className="flex items-center gap-2 font-medium text-success-dark dark:text-success">
									<CheckCircle2 className="size-4" aria-hidden />
									Alterações salvas às {salvoEm}
								</p>
							) : (
								<p className="text-text-disabled">Tudo salvo.</p>
							)}
						</div>

						<div className="flex shrink-0 items-center gap-2">
							{salvar.isError && (
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										salvar.reset();
										setForm(null);
										setSemeadoEm(null);
										empresaQ.refetch();
									}}
								>
									<RotateCw className="size-4" />
									Recarregar
								</Button>
							)}
							<Button type="submit" form="form-meu-negocio" disabled={bloqueado || salvar.isPending || !sujo}>
								{salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
								{salvar.isPending ? "Salvando…" : "Salvar alterações"}
							</Button>
						</div>
					</div>
				</div>
			</form>
		</Pagina>
	);
}

/* ────────────────────────────  Peças da tela  ─────────────────────────────── */

function Pagina({ children }: { children: React.ReactNode }) {
	return (
		<div className="mx-auto w-full max-w-5xl p-4 md:p-6">
			<header className="mb-5">
				<h1 className="text-2xl font-bold tracking-tight text-text-primary">Meu negócio</h1>
				<p className="mt-1 text-sm text-text-secondary">
					Estes dados saem em todo orçamento, recibo e ordem de serviço — no app e aqui.
				</p>
			</header>
			{children}
		</div>
	);
}

function Bloco({ titulo, descricao, children }: { titulo: string; descricao: string; children: React.ReactNode }) {
	return (
		<Card className="gap-0 p-5 md:p-6">
			<h2 className="text-base font-semibold text-text-primary">{titulo}</h2>
			<p className="mb-5 mt-0.5 text-sm text-text-secondary">{descricao}</p>
			{children}
		</Card>
	);
}

function Aviso({ tom, Icone, children }: { tom: "info" | "erro"; Icone: LucideIcon; children: React.ReactNode }) {
	return (
		<div
			className={cn(
				"flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm",
				tom === "erro" ? "bg-error/10 text-error" : "bg-info/10 text-info-dark dark:text-info-light",
			)}
		>
			<Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
			<p>{children}</p>
		</div>
	);
}

function Chip({
	ativo,
	disabled,
	onClick,
	children,
}: {
	ativo: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			aria-pressed={ativo}
			onClick={onClick}
			className={cn(
				"rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
				ativo
					? "border-primary bg-primary/10 text-primary"
					: "border-border text-text-secondary hover:bg-bg-neutral/50",
			)}
		>
			{children}
		</button>
	);
}
