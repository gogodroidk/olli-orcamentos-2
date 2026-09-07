import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, Database, ExternalLink, FileText, KeyRound, Palette, Settings2, ShieldCheck, UserRound } from "lucide-react";
import { NavLink } from "react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useMinhaAssinatura } from "@/olli/marcaDocumento";
import { useContextoDeEscrita } from "@/olli/mutacoes";
import { ehMembroNaoDono } from "@/olli/papel";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { BotaoPortalStripe, listarFaturasStripe, obterMetodoStripe } from "../planos/portal";

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const planoNome = (p?: string) => (p === "empresa" ? "Empresa" : p === "pro" ? "Pro" : "Grátis");
const dataBr = (v?: string | number | null) => {
	if (!v) return "—";
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

export default function ConfiguracoesPage() {
	const contexto = useContextoDeEscrita();
	const assinatura = useMinhaAssinatura();
	const membro = ehMembroNaoDono(contexto.data?.papel);
	const donoConfirmado = !contexto.isLoading && !contexto.isError && !membro;
	const temStripe = donoConfirmado && assinatura.data?.planoContratado !== "gratis";
	const faturas = useQuery({ queryKey: ["olli", "stripe", "faturas"], queryFn: listarFaturasStripe, enabled: temStripe, staleTime: 60_000, retry: 1 });
	const metodo = useQuery({ queryKey: ["olli", "stripe", "metodo"], queryFn: obterMetodoStripe, enabled: temStripe, staleTime: 60_000, retry: 1 });
	const [conta, setConta] = useState({ nome: "", email: "", avatarUrl: "", senha: "" });
	const [salvandoConta, setSalvandoConta] = useState(false);

	useEffect(() => {
		supabase.auth.getUser().then(({ data }) => {
			const user = data.user;
			if (!user) return;
			setConta({
				nome: String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""),
				email: user.email ?? "",
				avatarUrl: String(user.user_metadata?.avatar_url ?? ""),
				senha: "",
			});
		});
	}, []);

	const salvarConta = async (evento: React.FormEvent) => {
		evento.preventDefault();
		if (salvandoConta) return;
		setSalvandoConta(true);
		try {
			const atualizacao: Parameters<typeof supabase.auth.updateUser>[0] = {
				data: {
					full_name: conta.nome.trim(),
					name: conta.nome.trim(),
					...(conta.avatarUrl.trim() ? { avatar_url: conta.avatarUrl.trim() } : { avatar_url: null }),
				},
			};
			if (conta.email.trim()) atualizacao.email = conta.email.trim();
			if (conta.senha.trim()) atualizacao.password = conta.senha;
			const { error } = await supabase.auth.updateUser(atualizacao);
			if (error) throw error;
			setConta((atual) => ({ ...atual, senha: "" }));
			toast.success(conta.email.trim() ? "Dados da conta atualizados. Confira seu e-mail se houver confirmação pendente." : "Dados da conta atualizados.");
		} catch (erro) {
			toast.error(erro instanceof Error ? erro.message : "Não consegui atualizar a conta.");
		} finally {
			setSalvandoConta(false);
		}
	};

	return (
		<div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
			<header>
				<div className="flex items-center gap-2.5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Settings2 className="size-5" /></span><h1 className="text-2xl font-bold text-text-primary">Configurações</h1></div>
				<p className="mt-1 text-sm text-text-secondary">Empresa, dados, aparência, privacidade e cobrança em um só lugar.</p>
			</header>

			<div className="grid gap-4 md:grid-cols-2">
				<Atalho icone={<Building2 className="size-5" />} titulo="Meu negócio" texto="Logo, dados da empresa e identidade dos documentos." destino="/meu-negocio" rotulo="Abrir meu negócio" />
				<Atalho icone={<Database className="size-5" />} titulo="Central de Dados" texto="Exportação, importação e atualização de tabelas de preço com revisão." destino="/dados" rotulo="Abrir Central de Dados" />
				<Card className="p-5"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning"><Palette className="size-5" /></span><div><h2 className="font-semibold text-text-primary">Aparência</h2><p className="mt-1 text-sm text-text-secondary">Tema, cor e formato do painel ficam no botão de aparência no canto superior.</p><Badge variant="secondary" className="mt-4">Preferência salva neste navegador</Badge></div></div></Card>
				<Card className="p-5"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success"><ShieldCheck className="size-5" /></span><div><h2 className="font-semibold text-text-primary">Segurança e privacidade</h2><p className="mt-1 text-sm text-text-secondary">Sessão Supabase e isolamento dos dados por empresa.</p><div className="mt-4 flex flex-wrap gap-2"><LinkExterno href="https://olliorcamentos.online/legal/privacidade/">Privacidade</LinkExterno><LinkExterno href="https://olliorcamentos.online/excluir-conta/">Excluir conta</LinkExterno></div></div></div></Card>
			</div>

			<Card className="p-5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CreditCard className="size-5" /></span><div><h2 className="font-semibold text-text-primary">Cobrança e assinatura</h2>{contexto.isLoading || assinatura.isLoading ? <Skeleton className="mt-2 h-4 w-52" /> : contexto.isError || assinatura.isError ? <p className="mt-1 text-sm text-error">Não consegui confirmar a cobrança agora. Nada foi alterado.</p> : membro ? <p className="mt-1 text-sm text-text-secondary">A cobrança é administrada por quem é dono da empresa.</p> : <p className="mt-1 text-sm text-text-secondary">Plano {planoNome(assinatura.data?.planoEfetivo)} · próxima renovação {dataBr(assinatura.data?.proximaCobranca)}</p>}</div></div>
					{temStripe ? <BotaoPortalStripe /> : <Button asChild><NavLink to="/planos">Ver planos</NavLink></Button>}
				</div>

				{temStripe && <div className="mt-5 grid gap-4 border-t border-border pt-5 lg:grid-cols-[220px_1fr]">
					<div><p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Cartão</p>{metodo.isLoading ? <Skeleton className="mt-2 h-5 w-32" /> : metodo.isError ? <p className="mt-2 text-sm text-error">Consulta indisponível.</p> : metodo.data ? <p className="mt-2 text-sm font-medium text-text-primary">{metodo.data.brand.toUpperCase()} •••• {metodo.data.last4}</p> : <p className="mt-2 text-sm text-text-secondary">Nenhum cartão salvo.</p>}</div>
					<div><p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Faturas recentes</p>{faturas.isLoading ? <Skeleton className="mt-2 h-14 w-full" /> : faturas.isError ? <p className="mt-2 text-sm text-error">Consulta indisponível.</p> : !faturas.data?.length ? <p className="mt-2 text-sm text-text-secondary">Nenhuma fatura encontrada.</p> : <div className="mt-2 divide-y divide-border rounded-lg border border-border">{faturas.data.slice(0, 4).map((f) => <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"><span><strong className="text-text-primary">{dinheiro.format(f.valorCentavos / 100)}</strong><span className="ml-2 text-text-secondary">{dataBr(f.data)}</span></span>{f.recibo ? <a href={f.recibo} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Abrir <FileText className="size-3.5" /></a> : <Badge variant={f.pago ? "success" : "secondary"}>{f.pago ? "Paga" : f.status ?? "Pendente"}</Badge>}</div>)}</div>}</div>
				</div>}
			</Card>

			<Card className="p-5">
				<div className="flex items-start gap-3">
					<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="size-5" /></span>
					<div><h2 className="font-semibold text-text-primary">Minha conta</h2><p className="mt-1 text-sm text-text-secondary">Nome, e-mail, foto e senha do seu acesso pessoal. A identidade da empresa fica em Meu negócio.</p></div>
				</div>
				<form onSubmit={salvarConta} className="mt-5 grid gap-4 sm:grid-cols-2">
					<label className="text-sm font-medium text-text-primary">Nome de exibição<input className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" value={conta.nome} onChange={(e) => setConta((atual) => ({ ...atual, nome: e.target.value }))} autoComplete="name" /></label>
					<label className="text-sm font-medium text-text-primary">E-mail<input className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" type="email" value={conta.email} onChange={(e) => setConta((atual) => ({ ...atual, email: e.target.value }))} autoComplete="email" /></label>
					<label className="text-sm font-medium text-text-primary">URL da foto de perfil<input className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" value={conta.avatarUrl} onChange={(e) => setConta((atual) => ({ ...atual, avatarUrl: e.target.value }))} placeholder="https://…" inputMode="url" /></label>
					<label className="text-sm font-medium text-text-primary">Nova senha (opcional)<span className="relative mt-1.5 block"><KeyRound className="pointer-events-none absolute left-3 top-2.5 size-4 text-text-disabled" /><input className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm" type="password" value={conta.senha} onChange={(e) => setConta((atual) => ({ ...atual, senha: e.target.value }))} autoComplete="new-password" minLength={8} placeholder="Deixe em branco para manter" /></span></label>
					<div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={salvandoConta}>{salvandoConta ? "Salvando…" : "Salvar dados da conta"}</Button><span className="text-xs text-text-secondary">Alterar e-mail pode exigir confirmação no endereço novo.</span></div>
				</form>
			</Card>
		</div>
	);
}

function Atalho({ icone, titulo, texto, destino, rotulo }: { icone: React.ReactNode; titulo: string; texto: string; destino: string; rotulo: string }) {
	return <Card className="p-5"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icone}</span><div><h2 className="font-semibold text-text-primary">{titulo}</h2><p className="mt-1 text-sm text-text-secondary">{texto}</p><Button asChild variant="outline" className="mt-4"><NavLink to={destino}>{rotulo}</NavLink></Button></div></div></Card>;
}

function LinkExterno({ href, children }: { href: string; children: React.ReactNode }) {
	return <Button asChild variant="outline" size="sm"><a href={href} target="_blank" rel="noreferrer">{children}<ExternalLink className="size-3.5" /></a></Button>;
}
