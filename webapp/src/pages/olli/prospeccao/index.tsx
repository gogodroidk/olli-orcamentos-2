/**
 * PROSPECÇÃO no painel (D-1438 G19).
 *
 * Esquema dos clientes da própria conta: raio, rota e nicho. As coordenadas
 * são as que o cadastro já tem. Este desenho não pede tile e não manda o
 * ponto para serviço de mapa. A rota abre no Google Maps pelo link público.
 */
import type { Empresa } from "@dominio";
import { CATEGORIAS_HVAC } from "@dominio";
import { MapPinned, RefreshCw } from "lucide-react";
import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useMinhaEmpresa, useOlliList } from "@/olli/data";
import { cn } from "@/utils";
import {
	NICHO_TODOS,
	RAIO_PADRAO_KM,
	RAIOS_KM,
	TEXTO_MAPA_PAINEL,
	TEXTO_ROTA,
	TEXTO_SEM_ORIGEM,
	TEXTO_SO_CADASTRO,
	agruparPorPonto,
	clienteParaMapa,
	coordenadaValida,
	linhaDaProspeccao,
	montarProspeccao,
	textoKm,
	urlRotaProspeccao,
	type PontoProspeccao,
} from "@prospeccao";

// Leaflet só entra no bundle desta tela.
const MapaProspeccao = lazy(() => import("./MapaProspeccao"));

const CATALOGO: Record<string, string> = Object.fromEntries(CATEGORIAS_HVAC.map((c) => [c.id, c.label]));

interface LinhaClienteMapa {
	id: string;
	nome: string | null;
	endereco: string | null;
	complemento: string | null;
	cidade: string | null;
	estado: string | null;
	cep: string | null;
	lat: number | null;
	lon: number | null;
	geo_precisao: string | null;
}

interface LinhaNicho {
	id: string;
	cliente_id: string | null;
	categoria: string | null;
}

interface PosicaoWeb {
	coords: { latitude: number; longitude: number };
}

function pedirPosicao(): Promise<PontoProspeccao | null> {
	const geo = (globalThis.navigator as { geolocation?: {
		getCurrentPosition: (
			ok: (p: PosicaoWeb) => void,
			erro: () => void,
			opts: { enableHighAccuracy: boolean; timeout: number; maximumAge: number },
		) => void;
	} } | undefined)?.geolocation;
	if (!geo) return Promise.resolve(null);
	return new Promise((resolve) => {
		geo.getCurrentPosition(
			(p) => resolve(coordenadaValida(p.coords.latitude, p.coords.longitude)),
			() => resolve(null),
			{ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
		);
	});
}

export default function ProspeccaoPage() {
	const clientesQ = useOlliList<LinhaClienteMapa>("clientes", {
		colunas: "id,nome,endereco,complemento,cidade,estado,cep,lat,lon,geo_precisao",
		orderBy: "nome",
		ascending: true,
	});
	const equipamentosQ = useOlliList<LinhaNicho>("assets", {
		colunas: "id,cliente_id,categoria",
	});
	const empresaQ = useMinhaEmpresa();

	const [raioKm, setRaioKm] = useState<number>(RAIO_PADRAO_KM);
	const [nicho, setNicho] = useState(NICHO_TODOS);
	const [fonte, setFonte] = useState<"base" | "aparelho">("base");
	const [aparelho, setAparelho] = useState<PontoProspeccao | null>(null);
	const [avisoGps, setAvisoGps] = useState<string | null>(null);
	const [buscandoGps, setBuscandoGps] = useState(false);
	const [selecionado, setSelecionado] = useState<string | null>(null);

	const dadosEmpresa = (empresaQ.data?.dados ?? null) as Partial<Empresa> | null;
	const baseLat = dadosEmpresa?.baseLat;
	const baseLon = dadosEmpresa?.baseLon;
	const base = useMemo(() => coordenadaValida(baseLat, baseLon), [baseLat, baseLon]);
	const origem = fonte === "aparelho" && aparelho ? aparelho : base;

	const mapaClientes = useMemo(() => {
		const porCliente = new Map<string, string[]>();
		if (!equipamentosQ.isError) {
			for (const linha of equipamentosQ.data ?? []) {
				if (!linha.cliente_id || !linha.categoria) continue;
				const lista = porCliente.get(linha.cliente_id) ?? [];
				lista.push(linha.categoria);
				porCliente.set(linha.cliente_id, lista);
			}
		}
		return (clientesQ.data ?? []).map((linha) => clienteParaMapa({
			id: linha.id,
			nome: linha.nome,
			endereco: linha.endereco,
			complemento: linha.complemento,
			cidade: linha.cidade,
			estado: linha.estado,
			cep: linha.cep,
			lat: linha.lat,
			lon: linha.lon,
			geoPrecisao: linha.geo_precisao,
			nichos: porCliente.get(linha.id) ?? [],
		}, CATALOGO));
	}, [clientesQ.data, equipamentosQ.data, equipamentosQ.isError]);

	const resultado = useMemo(() => montarProspeccao({
		origem,
		clientes: mapaClientes,
		raioKm: origem ? raioKm : null,
		nicho,
		nichosConfiaveis: !equipamentosQ.isError,
	}), [origem, mapaClientes, raioKm, nicho, equipamentosQ.isError]);

	const nichoEfetivo = !equipamentosQ.isError && (nicho === NICHO_TODOS || resultado.nichos.some((n) => n.id === nicho))
		? nicho
		: NICHO_TODOS;
	const resultadoFinal = useMemo(() => (nichoEfetivo === nicho ? resultado : montarProspeccao({
		origem,
		clientes: mapaClientes,
		raioKm: origem ? raioKm : null,
		nicho: nichoEfetivo,
		nichosConfiaveis: !equipamentosQ.isError,
	})), [nichoEfetivo, nicho, resultado, origem, mapaClientes, raioKm, equipamentosQ.isError]);

	const rota = urlRotaProspeccao(resultadoFinal.dentro.map((item) => item.cliente.endereco));
	const dentro = resultadoFinal.dentro;
	// Memorizados: o mapa só redesenha e reenquadra quando o recorte muda de verdade.
	const linha = useMemo(() => linhaDaProspeccao(origem, dentro), [origem, dentro]);
	const grupos = useMemo(() => agruparPorPonto(dentro), [dentro]);
	const rotuloEu = fonte === "aparelho" && aparelho ? "Onde você está agora" : "Base do seu cadastro";

	const carregando = clientesQ.isLoading || equipamentosQ.isLoading || empresaQ.isLoading;
	const erroClientes = clientesQ.isError;

	async function usarOndeEstou() {
		setBuscandoGps(true);
		setAvisoGps(null);
		const ponto = await pedirPosicao();
		setBuscandoGps(false);
		if (!ponto) {
			setAvisoGps("Não consegui ler a posição deste navegador. Continuo na base do cadastro, se ela existir.");
			setFonte("base");
			return;
		}
		setAparelho(ponto);
		setFonte("aparelho");
	}

	function abrirRota() {
		if (!rota.url) return;
		window.open(rota.url, "_blank", "noopener,noreferrer");
	}

	const rotuloOrigem = fonte === "aparelho" && aparelho
		? "Partindo de onde você está agora. Essa posição fica só nesta tela e não é salva."
		: base
			? "Partindo da base do cadastro (o endereço de Meu negócio)."
			: TEXTO_SEM_ORIGEM;

	return (
		<div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
			<header className="flex items-start gap-4">
				<div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
					<MapPinned className="size-6" aria-hidden="true" />
				</div>
				<div>
					<h1 className="text-2xl font-bold tracking-tight text-text-primary">Prospecção</h1>
					<p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">{TEXTO_SO_CADASTRO}</p>
				</div>
			</header>

			{carregando ? (
				<p className="text-sm text-text-secondary">Carregando seus clientes…</p>
			) : erroClientes ? (
				<div className="rounded-2xl border border-border bg-card p-6" role="alert">
					<p className="font-semibold text-text-primary">Não deu para carregar os clientes</p>
					<p className="mt-1 text-sm text-text-secondary">O mapa não abre vazio no lugar de um erro. Tente de novo.</p>
					<button type="button" onClick={() => { void clientesQ.refetch(); }} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
						<RefreshCw className="size-4" aria-hidden="true" />
						Tentar de novo
					</button>
				</div>
			) : (
				<>
					<p className="text-sm leading-6 text-text-secondary">{rotuloOrigem}</p>
					{avisoGps ? <output className="block rounded-xl bg-muted px-3 py-2 text-sm text-text-primary">{avisoGps}</output> : null}
					{equipamentosQ.isError ? (
						<output className="block rounded-xl bg-muted px-3 py-2 text-sm text-text-primary">
							Não deu para ler os equipamentos. O filtro de nicho fica desligado até atualizar.
						</output>
					) : null}
					{empresaQ.isError ? (
						<output className="block rounded-xl bg-muted px-3 py-2 text-sm text-text-primary">
							Não deu para ler Meu negócio. Sem a base, o raio não corta a lista.
						</output>
					) : null}

					<fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
						<legend className="sr-only">De onde partir</legend>
						<Chip ativo={fonte !== "aparelho"} desabilitado={!base} onClick={() => { setFonte("base"); setAvisoGps(null); }}>Base do cadastro</Chip>
						<Chip ativo={fonte === "aparelho" && !!aparelho} desabilitado={buscandoGps} onClick={() => { void usarOndeEstou(); }}>
							{buscandoGps ? "Lendo posição…" : "Onde estou"}
						</Chip>
						{!base ? <Link to="/meu-negocio" className="inline-flex min-h-10 items-center rounded-full border border-border px-4 text-sm font-medium text-primary">Completar em Meu negócio</Link> : null}
					</fieldset>

					<fieldset className="m-0 min-w-0 border-0 p-0">
						<legend className="mb-2 text-sm font-semibold text-text-primary">Raio</legend>
						<div className="flex flex-wrap gap-2">
							{RAIOS_KM.map((km) => (
								<Chip key={km} ativo={raioKm === km} onClick={() => setRaioKm(km)}>{km} km</Chip>
							))}
						</div>
						{!origem ? <p className="mt-2 text-sm text-text-secondary">O raio escolhido vale quando houver uma posição de partida.</p> : null}
					</fieldset>

					{!equipamentosQ.isError ? (
						<fieldset className="m-0 min-w-0 border-0 p-0">
							<legend className="mb-1 text-sm font-semibold text-text-primary">Nicho</legend>
							<p className="mb-2 text-sm text-text-secondary">O nicho é o equipamento já cadastrado naquele cliente.</p>
							<div className="flex flex-wrap gap-2">
								<Chip ativo={nichoEfetivo === NICHO_TODOS} onClick={() => setNicho(NICHO_TODOS)}>Todos</Chip>
								{resultadoFinal.nichos.map((n) => (
									<Chip key={n.id} ativo={nichoEfetivo === n.id} onClick={() => setNicho(n.id)}>{n.rotulo} ({n.quantidade})</Chip>
								))}
							</div>
						</fieldset>
					) : null}

					<Suspense fallback={<div className="grid h-[360px] place-items-center rounded-2xl border border-border bg-card text-sm text-text-secondary md:h-[440px]">Carregando o mapa…</div>}>
						<MapaProspeccao grupos={grupos} origem={origem} rotuloOrigem={rotuloEu} linha={linha} aoSelecionar={setSelecionado} />
					</Suspense>
					{grupos.length === 0 ? <p className="text-sm text-text-secondary">Nenhum cliente com ponto neste recorte.</p> : null}
					{grupos.some((g) => g.itens.length > 1) ? (
						<p className="text-sm text-text-primary">
							Alguns clientes caem no mesmo ponto (mesma cidade ou CEP). O número com “+” é quantos estão ali; toque nele para ver os nomes. Endereço completo no cadastro põe cada um no lugar certo.
						</p>
					) : null}
					<p className="text-sm text-text-secondary">{TEXTO_MAPA_PAINEL}</p>
					<p className="text-sm text-text-secondary">{TEXTO_ROTA}</p>
					{resultadoFinal.kmLinhaReta !== null ? (
						<p className="text-sm text-text-primary">
							Linha reta da rota: {textoKm(resultadoFinal.kmLinhaReta)}. Não é a distância de rua e não inclui trânsito.
						</p>
					) : null}

					<button
						type="button"
						onClick={abrirRota}
						disabled={!rota.url}
						className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
					>
						{rota.url ? `Abrir rota no Google Maps (${rota.usadas})` : "Nenhum endereço para abrir a rota"}
					</button>
					{rota.deForaDoLink > 0 ? (
						<p className="text-sm text-text-primary">
							O link leva {rota.usadas}. {rota.deForaDoLink} {rota.deForaDoLink === 1 ? "ficou" : "ficaram"} de fora: o Maps só aceita 10 paradas nesse link.
						</p>
					) : null}
					{rota.semEndereco > 0 ? (
						<p className="text-sm text-text-secondary">
							{rota.semEndereco === 1
								? "1 cliente está no mapa sem endereço de texto e não entra na rota."
								: `${rota.semEndereco} clientes estão no mapa sem endereço de texto e não entram na rota.`}
						</p>
					) : null}

					<section>
						<h2 className="text-base font-bold text-text-primary">
							{origem && resultadoFinal.raioAplicado ? `Dentro de ${raioKm} km (${resultadoFinal.dentro.length})` : `No mapa (${resultadoFinal.dentro.length})`}
						</h2>
						{resultadoFinal.dentro.length === 0 ? (
							<p className="mt-2 text-sm text-text-secondary">
								{(clientesQ.data ?? []).length === 0
									? "Você ainda não tem cliente cadastrado."
									: "Ninguém deste recorte tem ponto dentro do raio."}
							</p>
						) : (
							<ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
								{resultadoFinal.dentro.map((item) => (
									<li key={item.cliente.id} className={cn("flex items-center gap-3 px-4 py-3", selecionado === item.cliente.id && "bg-primary/5")}>
										<span className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{item.ordem}</span>
										<div className="min-w-0">
											<p className="truncate font-semibold text-text-primary">{item.cliente.nome}</p>
											<p className="truncate text-sm text-text-secondary">
												{[item.distanciaKm === null ? null : textoKm(item.distanciaKm), item.cliente.cidade || null, item.cliente.aproximado ? "ponto aproximado" : null].filter(Boolean).join(" · ") || "Sem cidade no cadastro"}
											</p>
										</div>
									</li>
								))}
							</ul>
						)}
					</section>

					{resultadoFinal.fora.length > 0 ? (
						<section>
							<h2 className="text-base font-bold text-text-primary">Fora do raio ({resultadoFinal.fora.length})</h2>
							<ul className="mt-2 space-y-1 text-sm text-text-secondary">
								{resultadoFinal.fora.map((item) => (
									<li key={item.cliente.id}>{item.cliente.nome} · {textoKm(item.distanciaKm)}</li>
								))}
							</ul>
						</section>
					) : null}

					{resultadoFinal.semPonto.length > 0 ? (
						<section>
							<h2 className="text-base font-bold text-text-primary">Sem ponto no mapa ({resultadoFinal.semPonto.length})</h2>
							<p className="mt-1 text-sm text-text-secondary">
								O ponto nasce quando o cadastro tem CEP ou cidade e UF. Sem isso, o cliente continua na lista e não some.{" "}
								<Link to="/clientes" className="font-semibold text-primary">Abrir Clientes</Link>
							</p>
							<ul className="mt-2 space-y-2 text-sm text-text-primary">
								{resultadoFinal.semPonto.map((c) => (
									<li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
										<span>{c.nome}</span>
										<Link to={`/clientes?editar=${encodeURIComponent(c.id)}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold text-primary">
											Completar endereço
										</Link>
									</li>
								))}
							</ul>
						</section>
					) : null}
				</>
			)}
		</div>
	);
}

function Chip({
	ativo,
	desabilitado,
	onClick,
	children,
}: {
	ativo?: boolean;
	desabilitado?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			disabled={desabilitado}
			aria-pressed={!!ativo}
			onClick={onClick}
			className={cn(
				"inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium disabled:opacity-45",
				ativo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-text-secondary",
			)}
		>
			{children}
		</button>
	);
}
