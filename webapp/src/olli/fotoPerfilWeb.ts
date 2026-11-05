import {
	fotoPerfilAceita,
	FOTO_PERFIL_MAX_DIMENSAO,
	type RecortePx,
} from "@identidade-visual";

const TIPOS = new Set(["image/png", "image/jpeg", "image/webp"]);
const ARQUIVO_MAX_BYTES = 10 * 1024 * 1024;

export type ResultadoFoto = { ok: true; dataUri: string } | { ok: false; erro: string };

/** Mensagem para a pessoa, ou null se o arquivo pode ir para o recorte quadrado. */
export function erroArquivoFoto(arquivo: { type: string; size: number } | null | undefined): string | null {
	if (!arquivo) return "Escolha uma foto.";
	if (!TIPOS.has(arquivo.type)) return "Envie a foto em PNG, JPG ou WebP.";
	if (arquivo.size > ARQUIVO_MAX_BYTES) return "A foto original passa de 10 MB. Escolha outra.";
	return null;
}

/**
 * Recorte quadrado → JPEG pequeno, fundo branco, sem EXIF.
 * O teto é o que a conta aceita guardar em user_metadata.
 */
export function recorteParaFotoDataUri(img: HTMLImageElement, recorte: RecortePx): ResultadoFoto {
	const iw = img.naturalWidth;
	const ih = img.naturalHeight;
	if (!iw || !ih) return { ok: false, erro: "Não consegui ler essa foto. Escolha outra." };

	const x = Math.max(0, Math.min(iw - 1, Math.round(recorte.x)));
	const y = Math.max(0, Math.min(ih - 1, Math.round(recorte.y)));
	const sw = Math.max(1, Math.min(iw - x, Math.round(recorte.largura)));
	const sh = Math.max(1, Math.min(ih - y, Math.round(recorte.altura)));
	const escala = Math.min(1, FOTO_PERFIL_MAX_DIMENSAO / Math.max(sw, sh));
	const largura = Math.max(1, Math.round(sw * escala));
	const altura = Math.max(1, Math.round(sh * escala));

	const canvas = document.createElement("canvas");
	canvas.width = largura;
	canvas.height = altura;
	const ctx = canvas.getContext("2d");
	if (!ctx) return { ok: false, erro: "Seu navegador não permitiu processar a foto. Tente outro." };
	ctx.fillStyle = "#FFFFFF";
	ctx.fillRect(0, 0, largura, altura);
	ctx.drawImage(img, x, y, sw, sh, 0, 0, largura, altura);

	for (const qualidade of [0.72, 0.55, 0.4]) {
		const jpeg = canvas.toDataURL("image/jpeg", qualidade);
		if (!jpeg.startsWith("data:image/jpeg")) continue;
		const aceite = fotoPerfilAceita(jpeg);
		if (aceite.ok) return { ok: true, dataUri: jpeg };
	}
	return { ok: false, erro: "Não consegui deixar a foto leve o bastante. Tente outra." };
}
