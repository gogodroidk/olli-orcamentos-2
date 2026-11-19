/**
 * Mapa de verdade da Prospecção (pedido da CPO, 19/11): Leaflet + tiles do OpenStreetMap, grátis e
 * com atribuição. Substitui o esquema em SVG, que desenhava um retângulo vazio e empilhava os
 * clientes de "ponto aproximado" numa bolinha só.
 *
 * - Leaflet é carregado SÓ nesta tela (import dinâmico); o resto do painel não paga o peso.
 * - Pontos iguais viram UM marcador com o número de clientes; o popup lista quem está ali.
 * - Ponto aproximado (CEP, bairro, cidade) ganha o círculo da região, não um pino falso na porta.
 * - Nome de cliente entra no popup por `textContent`, nunca como HTML.
 * - `prefers-reduced-motion`: sem animação de zoom e de deslocamento.
 * - A lista abaixo do mapa continua sendo o equivalente acessível (leitor de tela e teclado).
 */
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import { ATRIBUICAO_OSM, type GrupoNoMapa, type PontoProspeccao } from "@prospeccao";

interface Props {
	grupos: readonly GrupoNoMapa[];
	origem: PontoProspeccao | null;
	rotuloOrigem: string;
	/** Traço da rota em [lon, lat], na ordem (origem → 1 → 2…). */
	linha: readonly (readonly [number, number])[];
	aoSelecionar: (clienteId: string) => void;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function semMovimento(): boolean {
	return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function conteudoPopup(grupo: GrupoNoMapa): HTMLElement {
	const raiz = document.createElement("div");
	const lista = document.createElement("ol");
	lista.style.margin = "0";
	lista.style.paddingLeft = "1.1rem";
	for (const item of grupo.itens) {
		const li = document.createElement("li");
		li.value = item.ordem;
		li.textContent = item.cliente.nome;
		lista.appendChild(li);
	}
	raiz.appendChild(lista);
	if (grupo.aproximado) {
		const nota = document.createElement("p");
		nota.style.margin = "6px 0 0";
		nota.style.fontSize = "12px";
		nota.textContent = "Ponto aproximado: o círculo é a região do CEP, bairro ou cidade, não a porta.";
		raiz.appendChild(nota);
	}
	return raiz;
}

export default function MapaProspeccao({ grupos, origem, rotuloOrigem, linha, aoSelecionar }: Props) {
	const caixa = useRef<HTMLElement | null>(null);
	const mapa = useRef<Leaflet.Map | null>(null);
	const camada = useRef<Leaflet.LayerGroup | null>(null);
	const lib = useRef<typeof Leaflet | null>(null);
	const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");

	// Cria o mapa uma vez (e destrói ao sair da tela).
	useEffect(() => {
		let vivo = true;
		(async () => {
			try {
				const [mod] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
				if (!vivo || !caixa.current) return;
				const L = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
				const calmo = semMovimento();
				const m = L.map(caixa.current, {
					zoomControl: true,
					zoomAnimation: !calmo,
					fadeAnimation: !calmo,
					markerZoomAnimation: !calmo,
					scrollWheelZoom: false, // não sequestra a rolagem da página; zoom pelos botões ou pinça
				});
				L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATRIBUICAO_OSM }).addTo(m);
				m.attributionControl.setPrefix(false);
				lib.current = L;
				mapa.current = m;
				camada.current = L.layerGroup().addTo(m);
				setEstado("pronto");
			} catch {
				if (vivo) setEstado("erro");
			}
		})();
		return () => {
			vivo = false;
			mapa.current?.remove();
			mapa.current = null;
			camada.current = null;
		};
	}, []);

	// Redesenha (e reenquadra) só quando muda o recorte: raio, nicho ou origem. A página passa tudo memorizado.
	useEffect(() => {
		const L = lib.current;
		const m = mapa.current;
		const c = camada.current;
		if (estado !== "pronto" || !L || !m || !c) return;
		c.clearLayers();
		const limites: [number, number][] = [];

		if (linha.length > 1) {
			L.polyline(linha.map(([lon, lat]) => [lat, lon] as [number, number]), { color: "#075f5a", weight: 3, opacity: 0.7, dashArray: "6 6" }).addTo(c);
		}

		for (const g of grupos) {
			limites.push([g.lat, g.lon]);
			if (g.aproximado && g.raioM > 0) {
				L.circle([g.lat, g.lon], { radius: g.raioM, color: "#075f5a", weight: 1, fillOpacity: 0.08 }).addTo(c);
				// O círculo não entra no enquadramento: um "cidade" de 8 km afastaria o zoom e empilharia os pinos exatos.
			}
			const rotulo = g.itens.length > 1 ? `${g.itens.length}` : `${g.itens[0].ordem}`;
			const titulo = g.itens.length > 1
				? `${g.itens.length} clientes no mesmo ponto: ${g.itens.map((i) => `${i.ordem}. ${i.cliente.nome}`).join("; ")}`
				: `${g.itens[0].ordem}. ${g.itens[0].cliente.nome}${g.aproximado ? ", ponto aproximado" : ""}`;
			const icone = L.divIcon({
				className: "",
				html: `<span style="display:grid;place-items:center;width:32px;height:32px;border-radius:9999px;font:700 12px/1 Arial,sans-serif;color:#fff;background:#075f5a;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${g.itens.length > 1 ? `${rotulo}+` : rotulo}</span>`,
				iconSize: [32, 32],
				iconAnchor: [16, 16],
			});
			const marcador = L.marker([g.lat, g.lon], { icon: icone, title: titulo, alt: titulo, keyboard: true, riseOnHover: true }).addTo(c);
			marcador.bindPopup(conteudoPopup(g));
			marcador.on("click", () => aoSelecionar(g.itens[0].cliente.id));
		}

		if (origem) {
			limites.push([origem.lat, origem.lon]);
			const icone = L.divIcon({
				className: "",
				html: '<span style="display:grid;place-items:center;width:32px;height:32px;border-radius:9999px;font:700 10px/1 Arial,sans-serif;color:#fff;background:#17212b;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">Eu</span>',
				iconSize: [32, 32],
				iconAnchor: [16, 16],
			});
			L.marker([origem.lat, origem.lon], { icon: icone, title: rotuloOrigem, alt: rotuloOrigem, keyboard: true }).addTo(c);
		}

		if (limites.length === 1) m.setView(limites[0], 14, { animate: !semMovimento() });
		else if (limites.length > 1) m.fitBounds(limites, { padding: [28, 28], maxZoom: 15, animate: !semMovimento() });
		else m.setView([-14.2, -51.9], 4); // Brasil inteiro quando ninguém tem ponto
	}, [estado, grupos, origem, rotuloOrigem, linha, aoSelecionar]);

	return (
		<div className="relative isolate z-0 h-[360px] w-full overflow-hidden rounded-2xl border border-border bg-card md:h-[440px]">
			<section ref={caixa} style={{ position: "absolute", inset: 0, height: "100%", width: "100%" }} aria-label="Mapa dos clientes. A lista abaixo traz os mesmos clientes, na ordem da rota." />
			{estado === "carregando" ? (
				<div className="absolute inset-0 grid place-items-center text-sm text-text-secondary">Carregando o mapa…</div>
			) : null}
			{estado === "erro" ? (
				<div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-text-primary" role="alert">
					Não deu para carregar o mapa agora. A lista abaixo continua completa, com a rota.
				</div>
			) : null}
		</div>
	);
}
