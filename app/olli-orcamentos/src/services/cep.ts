// Busca de endereço por CEP via ViaCEP (https://viacep.com.br).
// Defensivo: timeout curto e try/catch — se a rede falhar, o cadastro segue
// manual. Nunca lança: devolve null em qualquer erro.

export interface EnderecoCEP {
  logradouro: string; // rua / logradouro
  bairro: string;
  cidade: string;     // localidade no ViaCEP
  uf: string;         // estado (2 letras)
}

/** Resposta crua do ViaCEP (campos que usamos). `erro: true` quando não existe. */
interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

/**
 * Consulta um CEP no ViaCEP. Aceita CEP com ou sem máscara — só os dígitos
 * importam. Retorna null se o CEP for inválido (≠ 8 dígitos), não existir,
 * a rede falhar ou estourar o timeout (~5s).
 */
export async function buscarCep(cepBruto: string): Promise<EnderecoCEP | null> {
  const cep = (cepBruto ?? '').replace(/\D/g, '');
  if (cep.length !== 8) return null;

  // timeout defensivo: aborta a requisição em ~5s para não travar a UX.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ViaCepResponse;
    if (!data || data.erro) return null;
    return {
      logradouro: data.logradouro ?? '',
      bairro: data.bairro ?? '',
      cidade: data.localidade ?? '',
      uf: (data.uf ?? '').toUpperCase().slice(0, 2),
    };
  } catch {
    // offline / abortado / JSON inválido → segue manual
    return null;
  } finally {
    clearTimeout(timer);
  }
}
