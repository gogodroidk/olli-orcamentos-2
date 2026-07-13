/**
 * cnpj.ts — cadastro mágico por CNPJ, app-side (F1 da estratégia).
 *
 * Contrato do endpoint (worker `olli-diagnostico`, `GET /cnpj/<14 dígitos>` — ver
 * `worker/src/index.js` → `handleCnpj`): mesmo padrão de auth do `eta.ts` (token do
 * Supabase no header `Authorization`, base em `DIAGNOSTICO_URL`). O worker é proxy
 * fino da BrasilAPI; a dedução CNAE→vertical é feita AQUI no cliente
 * (`src/services/verticais.ts` → `deduzirVerticais`).
 *
 * 3 ESTADOS EXPLÍCITOS (regra dura do repo "erro vira vazio"): `consultarCnpj`
 * nunca lança e resolve um destes quatro — o Onboarding trata cada um:
 *   'ok'            — a empresa veio; pré-preenche o cadastro e sugere a vertical.
 *   'nao_encontrado'— CNPJ válido mas sem registro (404) — pede pra conferir.
 *   'invalido'      — não tem 14 dígitos (nem chega a bater no worker).
 *   'indisponivel'  — offline, worker fora, sessão expirada, rate limit. Sutil:
 *                     o cadastro por CNPJ é uma CONVENIÊNCIA, o usuário sempre
 *                     pode preencher na mão (nunca é beco sem saída).
 */
import { DIAGNOSTICO_URL } from '../config';
import { supabase } from './supabase';

export interface CnaeItem {
  codigo: string;
  descricao: string;
}

export interface EmpresaCnpj {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnaePrincipal: CnaeItem;
  cnaesSecundarios: CnaeItem[];
  logradouro: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  porte: string;
  mei: boolean;
}

export type ResultadoCnpj =
  | { estado: 'ok'; empresa: EmpresaCnpj }
  | { estado: 'nao_encontrado' }
  | { estado: 'invalido' }
  | { estado: 'indisponivel' };

const TIMEOUT_CNPJ_MS = 15_000;

/** Só os 14 dígitos do CNPJ (remove máscara). */
export function apenasDigitosCnpj(cnpj: string): string {
  return (cnpj ?? '').replace(/\D/g, '').slice(0, 14);
}

async function tokenAtual(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Consulta um CNPJ e devolve a empresa normalizada. Nunca lança. Ver os 3+1
 * estados acima. A dedução da vertical é responsabilidade do chamador
 * (`deduzirVerticais(empresa.cnaePrincipal.codigo, empresa.cnaesSecundarios.map(c => c.codigo))`).
 */
export async function consultarCnpj(cnpjBruto: string): Promise<ResultadoCnpj> {
  const cnpj = apenasDigitosCnpj(cnpjBruto);
  if (cnpj.length !== 14) return { estado: 'invalido' };
  if (!DIAGNOSTICO_URL) return { estado: 'indisponivel' };

  const token = await tokenAtual();
  if (!token) return { estado: 'indisponivel' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_CNPJ_MS);
  try {
    const r = await fetch(`${DIAGNOSTICO_URL}/cnpj/${cnpj}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (r.status === 404) return { estado: 'nao_encontrado' };
    if (!r.ok) return { estado: 'indisponivel' };
    const data = await r.json().catch(() => null);
    if (!data || data.ok !== true || !data.empresa) return { estado: 'indisponivel' };
    return { estado: 'ok', empresa: normalizar(data.empresa) };
  } catch {
    // AbortError (timeout) ou falha de rede: indisponível, nunca "não tem".
    return { estado: 'indisponivel' };
  } finally {
    clearTimeout(timer);
  }
}

/** Garante o shape (defensivo contra um worker mais novo/velho). */
function normalizar(e: any): EmpresaCnpj {
  const cnae = (v: any): CnaeItem => ({
    codigo: String(v?.codigo ?? ''),
    descricao: String(v?.descricao ?? ''),
  });
  return {
    cnpj: String(e?.cnpj ?? ''),
    razaoSocial: String(e?.razaoSocial ?? ''),
    nomeFantasia: String(e?.nomeFantasia ?? ''),
    cnaePrincipal: cnae(e?.cnaePrincipal),
    cnaesSecundarios: Array.isArray(e?.cnaesSecundarios) ? e.cnaesSecundarios.map(cnae) : [],
    logradouro: String(e?.logradouro ?? ''),
    bairro: String(e?.bairro ?? ''),
    municipio: String(e?.municipio ?? ''),
    uf: String(e?.uf ?? ''),
    cep: String(e?.cep ?? ''),
    porte: String(e?.porte ?? ''),
    mei: !!e?.mei,
  };
}
