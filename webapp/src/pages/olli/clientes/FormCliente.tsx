/**
 * CADASTRO / EDIÇÃO DE CLIENTE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 1. O BANCO GUARDA OS CAMPOS **MASCARADOS** — não os dígitos crus.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Conferido no app (`src/screens/ClientesScreen.tsx` + `components/OlliInput.tsx`):
 * o `onChangeText` do OlliInput entrega o texto JÁ MASCARADO e a tela salva esse
 * texto direto. Ou seja, há meses o celular grava:
 *
 *     telefone: "(11) 98765-4321"     cpf: "123.456.789-09"
 *     cnpj:     "12.345.678/0001-95"  cep: "01310-100"
 *
 * O `CampoMascarado` do painel, por outro lado, emite o valor LIMPO (só dígitos) —
 * essa é a convenção interna dele. Então este formulário faz a ponte: guarda
 * dígitos no ESTADO (bom para validar, comparar e buscar duplicata) e **remascara
 * na hora de salvar**, para a linha sair byte a byte igual à que o celular criaria.
 *
 * Por que isso importa e não é firula: `clienteTelefone` / `clienteCpfCnpj` são
 * COPIADOS deste cadastro para dentro do orçamento (ver `clienteParaOrcamento` em
 * SeletorCliente) e de lá vão para o PDF que o cliente final recebe. Gravar dígitos
 * crus faria o orçamento gerado pelo painel sair com "11987654321" no documento —
 * e o do celular com "(11) 98765-4321". Mesmo cliente, dois documentos diferentes.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 2. CPF/CNPJ SÃO OPCIONAIS — o público é MEI e informal.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Só valida o que foi preenchido. Exigir documento aqui trancaria o cadastro de
 * boa parte da base (regra idêntica à do app).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 3. DUPLICIDADE AVISA, NÃO BLOQUEIA.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dois clientes podem legitimamente dividir um telefone (marido/esposa, a mesma
 * empresa com duas filiais). O aviso mostra QUEM já existe e oferece abrir — a
 * decisão é do usuário. E se a consulta de duplicidade FALHAR, o formulário diz
 * que não conseguiu verificar; nunca finge que está tudo limpo.
 */
import type { Cliente } from "@dominio";
import { AlertTriangle, Loader2, MapPin, UserRoundSearch } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
	Campo,
	CampoMascarado,
	cnpjValido,
	cpfValido,
	mascaraCep,
	mascaraCnpj,
	mascaraCpf,
	mascaraTelefone,
} from "@/olli/components/campos";
import FormDialog from "@/olli/components/FormDialog";
import { novoId } from "@/olli/contrato";
import { useOlliList } from "@/olli/data";
import { agoraIso } from "@/olli/datas";
import { useSalvar } from "@/olli/mutacoes";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { buscarCep } from "./cep";

const soDigitos = (s: string | undefined | null) => (s ?? "").replace(/\D/g, "");

/** Linha da tabela `clientes`. Colunas 1:1 com o domínio (ver `clienteToRow`). */
export type LinhaCliente = Record<string, unknown>;

/**
 * Linha (snake_case, do Supabase) → objeto de domínio (camelCase, o que o app lê).
 *
 * Preserva `criadoEm` e `excluidoEm` do registro original: eles NÃO estão no
 * formulário, e recriar o objeto só com os campos da tela zeraria a data de
 * cadastro (e, num registro da lixeira, o ressuscitaria sem querer).
 */
export function linhaParaCliente(linha: LinhaCliente): Cliente {
	const txt = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);

	const c: Cliente = {
		id: String(linha.id ?? ""),
		nome: txt(linha.nome) ?? "",
		telefone: txt(linha.telefone) ?? "",
		criadoEm: txt(linha.criado_em) ?? agoraIso(),
	};
	// Chaves opcionais: OMITIDAS quando vazias — o app grava ausência, não `null`.
	if (txt(linha.cpf)) c.cpf = txt(linha.cpf);
	if (txt(linha.cnpj)) c.cnpj = txt(linha.cnpj);
	if (txt(linha.endereco)) c.endereco = txt(linha.endereco);
	if (txt(linha.complemento)) c.complemento = txt(linha.complemento);
	if (txt(linha.cidade)) c.cidade = txt(linha.cidade);
	if (txt(linha.estado)) c.estado = txt(linha.estado);
	if (txt(linha.cep)) c.cep = txt(linha.cep);
	if (txt(linha.excluido_em)) c.excluidoEm = txt(linha.excluido_em);
	if (txt(linha.atualizado_em)) c.atualizadoEm = txt(linha.atualizado_em);
	return c;
}

/* ────────────────────────────────  Formulário  ─────────────────────────────── */

interface Campos {
	nome: string;
	/** Estes 4 vivem como DÍGITOS no estado e são remascarados no submit (ver cabeçalho). */
	telefone: string;
	cpf: string;
	cnpj: string;
	cep: string;
	endereco: string;
	complemento: string;
	cidade: string;
	estado: string;
}

function camposIniciais(c: Cliente | null): Campos {
	return {
		nome: c?.nome ?? "",
		telefone: soDigitos(c?.telefone),
		cpf: soDigitos(c?.cpf),
		cnpj: soDigitos(c?.cnpj),
		cep: soDigitos(c?.cep),
		endereco: c?.endereco ?? "",
		complemento: c?.complemento ?? "",
		cidade: c?.cidade ?? "",
		estado: c?.estado ?? "",
	};
}

type Erros = Partial<Record<"nome" | "telefone" | "cpf" | "cnpj", string>>;

/** Estado da busca de CEP. `falhou` ≠ `nao_encontrado` — ver `cep.ts`. */
type EstadoCep = "parado" | "buscando" | "ok" | "nao_encontrado" | "falhou";

interface Props {
	/** `null` = novo cliente. Caso contrário, edição (o registro já convertido). */
	cliente: Cliente | null;
	aoFechar: () => void;
	/** Abrir o cliente duplicado que o aviso apontou (o pai troca o alvo do formulário). */
	aoAbrirExistente?: (linha: LinhaCliente) => void;
}

export default function FormCliente({ cliente, aoFechar, aoAbrirExistente }: Props) {
	const idBase = useId();
	const formId = `form-cliente-${idBase}`;

	const [campos, setCampos] = useState<Campos>(() => camposIniciais(cliente));
	const [erros, setErros] = useState<Erros>({});
	const [estadoCep, setEstadoCep] = useState<EstadoCep>("parado");

	const salvar = useSalvar("clientes");
	const editando = cliente !== null;

	const set = <K extends keyof Campos>(chave: K, valor: Campos[K]) => {
		setCampos((p) => ({ ...p, [chave]: valor }));
		// O erro some assim que o usuário mexe no campo culpado — deixar o vermelho
		// aceso enquanto ele conserta é ruído.
		if (chave in erros) setErros((e) => ({ ...e, [chave]: undefined }));
	};

	/* ───────────────────────────  CEP → endereço  ─────────────────────────── */

	// Guarda o último CEP consultado para não repetir a chamada a cada tecla depois
	// do 8º dígito (backspace + redigitar o mesmo número dispararia de novo).
	const ultimoCepBuscado = useRef<string>("");
	// Corrida: se o usuário troca o CEP enquanto a 1ª busca está no ar, a resposta
	// velha não pode sobrescrever o endereço da nova.
	const cepEmFoco = useRef<string>("");

	useEffect(() => {
		const cep = campos.cep;
		if (cep.length !== 8) {
			ultimoCepBuscado.current = "";
			setEstadoCep("parado");
			return;
		}
		if (cep === ultimoCepBuscado.current) return;

		ultimoCepBuscado.current = cep;
		cepEmFoco.current = cep;
		setEstadoCep("buscando");

		buscarCep(cep).then((r) => {
			if (cepEmFoco.current !== cep) return; // resposta obsoleta: descarta

			if (r.status !== "ok") {
				setEstadoCep(r.status);
				return; // NUNCA trava o cadastro: o usuário segue digitando à mão.
			}
			setEstadoCep("ok");
			setCampos((p) => ({
				...p,
				// Não pisa num endereço que o usuário já escreveu (mesma regra do app).
				endereco: p.endereco.trim() ? p.endereco : r.endereco.logradouro,
				cidade: r.endereco.cidade || p.cidade,
				estado: r.endereco.uf || p.estado,
			}));
		});
	}, [campos.cep]);

	/* ────────────────────────────  Duplicidade  ───────────────────────────── */

	const {
		data: todos,
		isError: erroDuplicidade,
		isLoading: carregandoDuplicidade,
	} = useOlliList<LinhaCliente>("clientes", { orderBy: "nome", ascending: true });

	const duplicados = useMemo(() => {
		const tel = campos.telefone;
		const doc = campos.cpf || campos.cnpj;
		const temTel = tel.length >= 10; // DDD + número: menos que isso não identifica ninguém
		const temDoc = doc.length >= 11; // CPF (11) ou CNPJ (14) completos
		if (!temTel && !temDoc) return [];

		return (todos ?? [])
			.filter((linha) => String(linha.id ?? "") !== cliente?.id) // não me acuso de ser eu mesmo
			.filter((linha) => {
				if (temTel && soDigitos(linha.telefone as string) === tel) return true;
				if (temDoc) {
					const d = soDigitos(linha.cpf as string) || soDigitos(linha.cnpj as string);
					if (d && d === doc) return true;
				}
				return false;
			})
			.slice(0, 3);
	}, [todos, campos.telefone, campos.cpf, campos.cnpj, cliente?.id]);

	/* ──────────────────────────────  Submit  ──────────────────────────────── */

	const validar = (): Erros => {
		const e: Erros = {};
		if (!campos.nome.trim()) e.nome = "Informe o nome do cliente.";
		// Regras copiadas do app: só valida o que foi preenchido.
		if (campos.telefone.length > 0 && campos.telefone.length < 10) {
			e.telefone = "Telefone incompleto — informe DDD + número.";
		}
		if (campos.cpf.length > 0 && !cpfValido(campos.cpf)) e.cpf = "CPF inválido.";
		if (campos.cnpj.length > 0 && !cnpjValido(campos.cnpj)) e.cnpj = "CNPJ inválido.";
		return e;
	};

	const aoSubmeter = async (ev: React.FormEvent) => {
		ev.preventDefault();
		const e = validar();
		if (Object.keys(e).length > 0) {
			setErros(e);
			return;
		}
		setErros({});

		const texto = (s: string) => s.trim();
		// Parte do registro ORIGINAL para não perder nada que não esteja na tela
		// (criadoEm, excluidoEm e qualquer campo que o app venha a acrescentar).
		const c: Cliente = {
			...(cliente ?? {}),
			id: cliente?.id ?? novoId(),
			nome: texto(campos.nome),
			// Remascarado: é assim que o celular grava (ver cabeçalho do arquivo).
			telefone: campos.telefone ? mascaraTelefone(campos.telefone) : "",
			criadoEm: cliente?.criadoEm ?? agoraIso(),
			// Carimbo de sync: sem ele, `clienteToRow` grava `atualizado_em = criado_em`
			// (data antiga) e a cópia do celular VENCE o conflito, desfazendo esta edição.
			atualizadoEm: agoraIso(),
		};

		// Opcionais: presentes só quando preenchidos. Apagar um campo tem que
		// REMOVER a chave — deixar "" no lugar faria o app exibir campo vazio como
		// se fosse valor, e `?? null` gravaria string vazia na coluna.
		const opcional = (chave: "cpf" | "cnpj" | "cep" | "endereco" | "complemento" | "cidade" | "estado", v: string) => {
			if (v) c[chave] = v;
			else delete c[chave];
		};
		opcional("cpf", campos.cpf ? mascaraCpf(campos.cpf) : "");
		opcional("cnpj", campos.cnpj ? mascaraCnpj(campos.cnpj) : "");
		opcional("cep", campos.cep ? mascaraCep(campos.cep) : "");
		opcional("endereco", texto(campos.endereco));
		opcional("complemento", texto(campos.complemento));
		opcional("cidade", texto(campos.cidade));
		opcional("estado", texto(campos.estado).toUpperCase().slice(0, 2));

		try {
			await salvar.mutateAsync(c);
			aoFechar();
		} catch {
			// O erro fica visível no rodapé do diálogo (`salvar.error`), não some num toast.
		}
	};

	/* ──────────────────────────────  Render  ──────────────────────────────── */

	return (
		<FormDialog
			aberto
			aoFechar={aoFechar}
			titulo={editando ? "Editar cliente" : "Novo cliente"}
			descricao={
				editando
					? "As alterações valem para os próximos documentos — orçamentos já emitidos guardam os dados do dia da emissão."
					: "Só o nome é obrigatório. CPF/CNPJ e endereço podem ficar para depois."
			}
			formId={formId}
			salvando={salvar.isPending}
			erro={salvar.isError ? ((salvar.error as Error)?.message ?? "Não foi possível salvar o cliente.") : null}
			rotuloSalvar={editando ? "Salvar alterações" : "Cadastrar cliente"}
		>
			<form id={formId} onSubmit={aoSubmeter} className="space-y-4" noValidate>
				<Campo rotulo="Nome" obrigatorio erro={erros.nome}>
					<Input
						id={`${idBase}-nome`}
						value={campos.nome}
						onChange={(ev) => set("nome", ev.target.value)}
						placeholder="Maria Souza"
						aria-invalid={!!erros.nome}
						autoFocus
					/>
				</Campo>

				<Campo rotulo="Telefone / WhatsApp" erro={erros.telefone} dica="É por aqui que o orçamento é enviado.">
					<CampoMascarado
						tipo="telefone"
						id={`${idBase}-telefone`}
						valor={campos.telefone}
						aoMudar={(v) => set("telefone", v)}
					/>
				</Campo>

				{/* Aviso de duplicidade — logo abaixo dos campos que o disparam. */}
				{duplicados.length > 0 && (
					<div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
						<p className="flex items-center gap-2 text-sm font-medium text-text-primary">
							<UserRoundSearch className="size-4 shrink-0" aria-hidden="true" />
							{duplicados.length === 1 ? "Já existe um cliente com esses dados" : "Já existem clientes com esses dados"}
						</p>
						<ul className="mt-2 space-y-1.5">
							{duplicados.map((d) => (
								<li key={String(d.id)} className="flex items-center justify-between gap-3">
									<span className="min-w-0 text-sm text-text-secondary">
										<span className="font-medium text-text-primary">{String(d.nome ?? "(sem nome)")}</span>
										{d.telefone ? ` · ${String(d.telefone)}` : ""}
									</span>
									{aoAbrirExistente && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="shrink-0"
											onClick={() => aoAbrirExistente(d)}
										>
											Abrir
										</Button>
									)}
								</li>
							))}
						</ul>
						<p className="mt-2 text-xs text-text-secondary">
							Você pode cadastrar assim mesmo — dois clientes podem dividir o mesmo telefone.
						</p>
					</div>
				)}

				{/* Erro ≠ "não há duplicados". Se a consulta falhou, dizemos isso. */}
				{erroDuplicidade && !carregandoDuplicidade && (
					<p className="flex items-center gap-2 text-xs text-text-secondary">
						<AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
						Não consegui verificar se este cliente já existe. O cadastro continua funcionando.
					</p>
				)}

				<div className="grid gap-4 sm:grid-cols-2">
					<Campo rotulo="CPF" erro={erros.cpf}>
						<CampoMascarado tipo="cpf" id={`${idBase}-cpf`} valor={campos.cpf} aoMudar={(v) => set("cpf", v)} />
					</Campo>
					<Campo rotulo="CNPJ" erro={erros.cnpj}>
						<CampoMascarado tipo="cnpj" id={`${idBase}-cnpj`} valor={campos.cnpj} aoMudar={(v) => set("cnpj", v)} />
					</Campo>
				</div>

				<div className="border-t border-border pt-4">
					<p className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
						<MapPin className="size-4 text-text-secondary" aria-hidden="true" />
						Endereço
					</p>

					<div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
						<Campo rotulo="CEP" dica={estadoCep === "parado" ? "Preenche o endereço sozinho." : undefined}>
							<CampoMascarado tipo="cep" id={`${idBase}-cep`} valor={campos.cep} aoMudar={(v) => set("cep", v)} />
							{/* 3 estados da busca — e "não consegui perguntar" não vira "não existe". */}
							<p className="min-h-4 text-xs" aria-live="polite">
								{estadoCep === "buscando" && (
									<span className="flex items-center gap-1.5 text-text-secondary">
										<Loader2 className="size-3 animate-spin" aria-hidden="true" />
										Buscando endereço…
									</span>
								)}
								{estadoCep === "ok" && <span className="text-success">Endereço preenchido.</span>}
								{estadoCep === "nao_encontrado" && <span className="text-warning">CEP não encontrado.</span>}
								{estadoCep === "falhou" && (
									<span className="text-text-secondary">Sem conexão com a busca de CEP — preencha à mão.</span>
								)}
							</p>
						</Campo>

						<Campo rotulo="Endereço">
							<Input
								id={`${idBase}-endereco`}
								value={campos.endereco}
								onChange={(ev) => set("endereco", ev.target.value)}
								placeholder="Rua, número, bairro"
							/>
						</Campo>
					</div>

					<div className="mt-4 grid gap-4 sm:grid-cols-[2fr_2fr_1fr]">
						<Campo rotulo="Complemento">
							<Input
								id={`${idBase}-complemento`}
								value={campos.complemento}
								onChange={(ev) => set("complemento", ev.target.value)}
								placeholder="Apto 42, bloco B"
							/>
						</Campo>
						<Campo rotulo="Cidade">
							<Input
								id={`${idBase}-cidade`}
								value={campos.cidade}
								onChange={(ev) => set("cidade", ev.target.value)}
								placeholder="São Paulo"
							/>
						</Campo>
						<Campo rotulo="UF">
							<Input
								id={`${idBase}-estado`}
								value={campos.estado}
								onChange={(ev) =>
									set(
										"estado",
										ev.target.value
											.replace(/[^a-zA-Z]/g, "")
											.toUpperCase()
											.slice(0, 2),
									)
								}
								placeholder="SP"
								maxLength={2}
								className="uppercase"
							/>
						</Campo>
					</div>
				</div>
			</form>
		</FormDialog>
	);
}
