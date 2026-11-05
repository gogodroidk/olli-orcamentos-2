import { useEffect, useRef, useState } from "react";
import { aspectoDoModo, recorteNaImagem, type ModoRecorteLogo, type RecortePx } from "@identidade-visual";
import { Button } from "@/ui/button";
import { cn } from "@/utils";

const MODOS: { id: ModoRecorteLogo; rotulo: string }[] = [
	{ id: "inteira", rotulo: "Imagem inteira" },
	{ id: "faixa", rotulo: "Faixa do cabeçalho" },
	{ id: "quadrada", rotulo: "Quadrada" },
];

function limitar(n: number, min: number, max: number): number {
	if (!Number.isFinite(n)) return min;
	return Math.min(max, Math.max(min, n));
}

/**
 * Recorte no navegador: o arquivo não tem o recorte do sistema operacional.
 * A moldura é o que entra no PDF (logo) ou no perfil (foto quadrada).
 * O cálculo do retângulo mora em `identidadeVisual.ts`, testado sem canvas.
 */
export function RecorteImagem({
	arquivo,
	uso,
	aplicando,
	onAplicar,
	onCancelar,
}: {
	arquivo: File;
	uso: "logo" | "foto";
	aplicando: boolean;
	onAplicar: (img: HTMLImageElement, recorte: RecortePx) => void;
	onCancelar: () => void;
}) {
	const [img, setImg] = useState<HTMLImageElement | null>(null);
	const [erro, setErro] = useState<string | null>(null);
	const [modo, setModo] = useState<ModoRecorteLogo>(uso === "foto" ? "quadrada" : "inteira");
	const [zoom, setZoom] = useState(1);
	const [panX, setPanX] = useState(0);
	const [panY, setPanY] = useState(0);
	const arraste = useRef<{ x: number; y: number; panX: number; panY: number; larguraCaixa: number } | null>(null);

	useEffect(() => {
		const url = URL.createObjectURL(arquivo);
		let cancelado = false;
		const imagem = new Image();
		imagem.onload = () => {
			if (!cancelado) setImg(imagem);
		};
		imagem.onerror = () => {
			if (!cancelado) setErro("Não consegui ler essa imagem — o arquivo pode estar corrompido.");
		};
		imagem.src = url;
		return () => {
			cancelado = true;
			URL.revokeObjectURL(url);
		};
	}, [arquivo]);

	const modoEfetivo: ModoRecorteLogo = uso === "foto" ? "quadrada" : modo;
	const aspecto = img ? aspectoDoModo(modoEfetivo, img.naturalWidth, img.naturalHeight) : 1;
	const recorte = img
		? recorteNaImagem(img.naturalWidth, img.naturalHeight, aspecto, zoom, panX, panY)
		: null;

	function escolherModo(proximo: ModoRecorteLogo) {
		setModo(proximo);
		setPanX(0);
		setPanY(0);
	}

	function aoPonteiroBaixo(evento: React.PointerEvent<HTMLDivElement>) {
		if (!img || aplicando) return;
		evento.currentTarget.setPointerCapture(evento.pointerId);
		arraste.current = {
			x: evento.clientX,
			y: evento.clientY,
			panX,
			panY,
			larguraCaixa: evento.currentTarget.getBoundingClientRect().width,
		};
	}

	function aoPonteiroMover(evento: React.PointerEvent<HTMLDivElement>) {
		const inicio = arraste.current;
		if (!inicio || !img) return;
		const antes = recorteNaImagem(
			img.naturalWidth,
			img.naturalHeight,
			aspectoDoModo(modoEfetivo, img.naturalWidth, img.naturalHeight),
			zoom,
			inicio.panX,
			inicio.panY,
		);
		const escala = inicio.larguraCaixa / antes.largura;
		if (!Number.isFinite(escala) || escala <= 0) return;
		const folgaX = Math.max(0, img.naturalWidth - antes.largura);
		const folgaY = Math.max(0, img.naturalHeight - antes.altura);
		const novoX = antes.x - (evento.clientX - inicio.x) / escala;
		const novoY = antes.y - (evento.clientY - inicio.y) / escala;
		setPanX(folgaX > 0 ? limitar((2 * novoX) / folgaX - 1, -1, 1) : 0);
		setPanY(folgaY > 0 ? limitar((2 * novoY) / folgaY - 1, -1, 1) : 0);
	}

	function soltarPonteiro() {
		arraste.current = null;
	}

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Recortar imagem">
			<div className="w-full max-w-lg rounded-2xl border border-border bg-background p-4 shadow-xl">
				<h2 className="text-base font-semibold text-text-primary">
					{uso === "foto" ? "Ajustar foto" : "Ajustar logo"}
				</h2>
				<p className="mt-1 text-sm text-text-secondary">
					{uso === "foto"
						? "A foto do perfil fica quadrada. Arraste para centralizar e use o zoom para aproximar."
						: "A moldura é o que sai no cabeçalho do PDF. Arraste para posicionar e use o zoom para aproximar."}
				</p>

				{erro ? (
					<p role="alert" className="mt-4 text-sm font-medium text-error">{erro}</p>
				) : (
					<div
						className="relative mt-4 w-full overflow-hidden rounded-xl bg-bg-neutral"
						style={{
							aspectRatio: String(aspecto),
							maxHeight: 280,
							touchAction: "none",
							cursor: aplicando ? "wait" : "grab",
						}}
						onPointerDown={aoPonteiroBaixo}
						onPointerMove={aoPonteiroMover}
						onPointerUp={soltarPonteiro}
						onPointerCancel={soltarPonteiro}
					>
						{img && recorte && (
							<img
								src={img.src}
								alt=""
								draggable={false}
								className="pointer-events-none absolute max-w-none select-none"
								style={{
									width: `${(img.naturalWidth / recorte.largura) * 100}%`,
									height: `${(img.naturalHeight / recorte.altura) * 100}%`,
									left: `${(-recorte.x / recorte.largura) * 100}%`,
									top: `${(-recorte.y / recorte.altura) * 100}%`,
								}}
							/>
						)}
					</div>
				)}

				{uso === "logo" && (
					<fieldset className="m-0 mt-4 flex min-w-0 flex-wrap gap-2 border-0 p-0" aria-label="Formato do recorte">
						{MODOS.map((item) => (
							<Button
								key={item.id}
								type="button"
								size="sm"
								variant={modoEfetivo === item.id ? "default" : "outline"}
								disabled={aplicando}
								onClick={() => escolherModo(item.id)}
								className={cn(modoEfetivo === item.id && "pointer-events-none")}
							>
								{item.rotulo}
							</Button>
						))}
					</fieldset>
				)}

				<label className="mt-4 block text-sm font-medium text-text-primary">
					Zoom
					<input
						className="mt-1.5 w-full"
						type="range"
						min={1}
						max={3}
						step={0.05}
						value={zoom}
						disabled={aplicando || !!erro}
						aria-label="Zoom do recorte"
						onChange={(evento) => setZoom(limitar(Number(evento.target.value), 1, 3))}
					/>
				</label>

				<div className="mt-4 flex flex-wrap justify-end gap-2">
					<Button type="button" variant="outline" disabled={aplicando} onClick={onCancelar}>
						Cancelar
					</Button>
					<Button
						type="button"
						disabled={!img || !recorte || !!erro || aplicando}
						onClick={() => {
							if (img && recorte) onAplicar(img, recorte);
						}}
					>
						{aplicando ? "Aplicando…" : "Usar este recorte"}
					</Button>
				</div>
			</div>
		</div>
	);
}
