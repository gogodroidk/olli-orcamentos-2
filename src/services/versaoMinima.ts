/**
 * VERSÃO MÍNIMA DO APP (D-1326) — o servidor diz qual é o menor build Android aceito; abaixo dele o app mostra uma
 * tela que pede a atualização na Play. Existe porque o 1.2.0 (vc24) ignora o limite do Grátis (trata `cota_esgotada`
 * como envio sem registro): o limite só vale no Android com o app atualizado.
 *
 * TRÊS ESTADOS (erro nunca vira "pode" nem "bloqueia"): `atualizar` só com número confirmado dos dois lados;
 * `ok` quando o build é igual ou maior; `desconhecido` quando a leitura falhou ou o número veio estranho — aí o app
 * segue normal (travar o prestador por falha de rede seria pior que deixar um build velho passar uma vez).
 * Mínimo 0 (padrão do worker) = desligado.
 */
export type DecisaoVersao = 'atualizar' | 'ok' | 'desconhecido';

export function decidirVersaoMinima(codigoAtual: number | null, resposta: unknown): DecisaoVersao {
  if (codigoAtual === null || !Number.isSafeInteger(codigoAtual) || codigoAtual <= 0) return 'desconhecido';
  if (!resposta || typeof resposta !== 'object' || Array.isArray(resposta)) return 'desconhecido';
  const minimo = (resposta as Record<string, unknown>).android;
  if (typeof minimo !== 'number' || !Number.isSafeInteger(minimo) || minimo < 0) return 'desconhecido';
  return codigoAtual < minimo ? 'atualizar' : 'ok';
}

/**
 * versionCode do build INSTALADO (`Application.nativeBuildVersion`, string no Android). Nunca o do app.json: o EAS
 * numera o build sozinho (`appVersionSource: remote` + `autoIncrement`), então o app.json fica defasado e trancaria o
 * build novo para sempre. Ausente ou estranho = null = `desconhecido`.
 */
export function codigoBuildNativo(nativo: string | null | undefined): number | null {
  if (typeof nativo !== 'string' || !/^\d{1,9}$/.test(nativo.trim())) return null;
  const n = Number(nativo.trim());
  return n > 0 ? n : null;
}

/** Lê `GET {base}/app/versao-minima` com prazo curto. Nunca lança: falha vira `desconhecido`. */
export async function consultarVersaoMinima(
  base: string,
  codigoAtual: number | null,
  fetchImpl: typeof fetch = fetch,
  prazoMs = 5000,
): Promise<DecisaoVersao> {
  if (!base) return 'desconhecido';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), prazoMs);
  try {
    const r = await fetchImpl(`${base}/app/versao-minima`, { signal: ctrl.signal });
    if (!r.ok) return 'desconhecido';
    return decidirVersaoMinima(codigoAtual, await r.json());
  } catch {
    return 'desconhecido';
  } finally {
    clearTimeout(t);
  }
}

/** Página do OLLI na Play: app da loja primeiro, navegador se ele não abrir. */
export function linksPlay(pacote: string): { loja: string; web: string } {
  return {
    loja: `market://details?id=${pacote}`,
    web: `https://play.google.com/store/apps/details?id=${pacote}`,
  };
}
