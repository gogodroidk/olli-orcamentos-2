/**
 * logoUpload.ts — arquivo de imagem escolhido no navegador → data URI compacta
 * para o campo `logoUri` do blob `empresa.dados`.
 *
 * POR QUE DATA URI (e não um bucket): a tabela `empresa` guarda TUDO num jsonb, e
 * toda a cadeia já fala data URI — `logoExibivel()` (constantes.ts) exibe `data:`
 * na web, e `imagemParaDataUri()` (src/utils/imagemDataUri.ts) do app repassa
 * `data:` como está para o HTML do PDF. Guardar o logo como data URI no próprio
 * blob = zero migração, zero bucket, zero RLS nova — e o logo enviado no painel
 * aparece também no PDF gerado pelo celular.
 *
 * POR QUE O TETO: o data URI mora no jsonb, que o painel e o app leem e gravam
 * INTEIRO a cada salvamento. Um logo de 5 MB viraria ~6,7 MB de base64 trafegados
 * em toda gravação da empresa. Por isso: redimensiona no cliente (canvas) para no
 * máximo LOGO_MAX_DIM px e recusa qualquer resultado acima de LOGO_MAX_DATAURI_CHARS.
 */

/**
 * `accept` do <input type="file">. SVG fica de fora DE PROPÓSITO: o <Image> do
 * React Native (app do celular) não rasteriza SVG — o logo apareceria aqui e
 * sumiria lá, exatamente o tipo de mentira que esta tela evita.
 */
export const LOGO_TIPOS_ACEITOS = "image/png,image/jpeg,image/webp";

const TIPOS_VALIDOS = new Set(LOGO_TIPOS_ACEITOS.split(","));

/** Teto do ARQUIVO de entrada — só para não decodificar uma foto de dezenas de MB. */
const ARQUIVO_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Maior lado do logo depois do redimensionamento. 512px é mais que o dobro do que
 * o cabeçalho do PDF exibe — nitidez de sobra sem inflar o blob.
 */
export const LOGO_MAX_DIM = 512;

/** Teto do data URI FINAL (~512 KB de string dentro do jsonb). */
export const LOGO_MAX_DATAURI_CHARS = 512 * 1024;

export type ResultadoLogo = { ok: true; dataUri: string } | { ok: false; erro: string };

function carregarImagem(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("decode"));
		img.src = url;
	});
}

/**
 * Converte o arquivo em data URI pronto para `logoUri`.
 * NUNCA lança: qualquer falha vira `{ ok: false, erro }` com mensagem para o usuário
 * — um logo que não converte não pode derrubar a tela do cadastro.
 */
export async function arquivoParaLogoDataUri(arquivo: File): Promise<ResultadoLogo> {
	if (!TIPOS_VALIDOS.has(arquivo.type)) {
		return { ok: false, erro: "Formato não suportado. Envie o logo em PNG, JPG ou WebP." };
	}
	if (arquivo.size > ARQUIVO_MAX_BYTES) {
		return { ok: false, erro: "Arquivo muito grande (máximo 10 MB). Exporte o logo em um tamanho menor." };
	}

	const url = URL.createObjectURL(arquivo);
	let img: HTMLImageElement | null = null;
	try {
		img = await carregarImagem(url);
	} catch {
		// tratado logo abaixo (img continua null)
	} finally {
		URL.revokeObjectURL(url);
	}
	if (!img || !img.naturalWidth || !img.naturalHeight) {
		return { ok: false, erro: "Não consegui ler essa imagem — o arquivo pode estar corrompido." };
	}

	// Só REDUZ (escala ≤ 1): ampliar um logo pequeno não ganha nitidez, só bytes.
	const escala = Math.min(1, LOGO_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
	const largura = Math.max(1, Math.round(img.naturalWidth * escala));
	const altura = Math.max(1, Math.round(img.naturalHeight * escala));

	const canvas = document.createElement("canvas");
	canvas.width = largura;
	canvas.height = altura;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return { ok: false, erro: "Seu navegador não permitiu processar a imagem. Tente outro navegador." };
	}
	ctx.drawImage(img, 0, 0, largura, altura);

	// 1ª tentativa: PNG — preserva a transparência (a maioria dos logos tem fundo
	// transparente, e JPEG destruiria isso).
	const png = canvas.toDataURL("image/png");
	if (png.startsWith("data:image/png") && png.length <= LOGO_MAX_DATAURI_CHARS) {
		return { ok: true, dataUri: png };
	}

	// 2ª tentativa: JPEG sobre fundo BRANCO (fotos/artes densas que estouram o teto
	// em PNG). Branco casa com o papel do PDF, onde o logo é exibido.
	const canvasJpeg = document.createElement("canvas");
	canvasJpeg.width = largura;
	canvasJpeg.height = altura;
	const ctxJpeg = canvasJpeg.getContext("2d");
	if (!ctxJpeg) {
		return { ok: false, erro: "Seu navegador não permitiu processar a imagem. Tente outro navegador." };
	}
	ctxJpeg.fillStyle = "#FFFFFF";
	ctxJpeg.fillRect(0, 0, largura, altura);
	ctxJpeg.drawImage(canvas, 0, 0);
	const jpeg = canvasJpeg.toDataURL("image/jpeg", 0.85);
	if (jpeg.startsWith("data:image/jpeg") && jpeg.length <= LOGO_MAX_DATAURI_CHARS) {
		return { ok: true, dataUri: jpeg };
	}

	return {
		ok: false,
		erro: "A imagem continua pesada demais mesmo depois de reduzida. Exporte o logo em um tamanho menor e tente de novo.",
	};
}
