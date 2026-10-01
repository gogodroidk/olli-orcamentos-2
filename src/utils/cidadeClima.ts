/**
 * Cidade do cadastro → coordenada de RESERVA do clima, por serviço GRÁTIS.
 * PURO (nenhum import em tempo de execução): `node scripts/teste-painel-rua.ts`.
 *
 * O clima é por célula de ~5 km (o worker arredonda), então a cidade basta.
 *
 * REGRA P0 DO DONO: só serviço gratuito. Nada de Google Geocoding (o
 * `/geocodificar` do worker é o Geocoding PAGO do ETA). A ordem é:
 *   1. CEP do endereço do cadastro → `/cep` do worker (BrasilAPI v2, grátis),
 *      que às vezes traz a coordenada;
 *   2. Nominatim/OpenStreetMap (grátis, política de uso: User-Agent próprio,
 *      no máximo 1 requisição por segundo, resultado guardado). Dado ODbL: a
 *      tela que usar o ponto mostra `ATRIBUICAO_OSM`.
 */

/** Atribuição exigida pela ODbL quando a coordenada veio do OpenStreetMap (mesmo texto do geo do cliente). */
export const ATRIBUICAO_OSM = 'Localização: © colaboradores do OpenStreetMap (ODbL)';

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** Identifica o app e um contato, como a política do Nominatim exige (o `email` cobre o navegador, que não deixa trocar o User-Agent). */
export const NOMINATIM_USER_AGENT = 'OLLI-Orcamentos/1.0 (+https://olliorcamentos.online; contato@olliorcamentos.online)';
export const NOMINATIM_EMAIL = 'contato@olliorcamentos.online';
/** 1 req/s é o máximo da política; 1,1 s dá folga para relógio e rede. */
export const NOMINATIM_INTERVALO_MS = 1100;

/** Caixa do Brasil (com folga para as ilhas): resultado fora dela é homônima de outro país. */
const BBOX_BRASIL = { latMin: -34.5, latMax: 5.6, lonMin: -74.5, lonMax: -28.5 };

const UF_NOME: Readonly<Record<string, string>> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

function limparCidade(cidade: string | null | undefined): string {
  return typeof cidade === 'string' ? cidade.trim().replace(/\s+/g, ' ') : '';
}

function limparUf(estado: string | null | undefined): string {
  const uf = typeof estado === 'string' ? estado.trim().toUpperCase() : '';
  return UF_NOME[uf] ? uf : '';
}

/** `null` quando o cadastro não tem cidade utilizável (aí o clima diz o porquê). */
export function consultaCidadeClima(cidade: string | null | undefined, estado: string | null | undefined): string | null {
  const c = limparCidade(cidade);
  if (c.length < 2) return null;
  const uf = typeof estado === 'string' ? estado.trim().toUpperCase() : '';
  return uf.length === 2 ? `${c} - ${uf}, Brasil` : `${c}, Brasil`;
}

/** Chave estável do cache: a mesma cidade escrita com outra caixa/espaço não busca de novo. */
export function chaveCidadeClima(consulta: string): string {
  return consulta.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** CEP (8 dígitos) escrito no endereço do cadastro, ou `null`. Aceita "01310-100" e "01310100". */
export function cepDoEndereco(endereco: string | null | undefined): string | null {
  if (typeof endereco !== 'string') return null;
  const m = endereco.match(/(?:^|\D)(\d{5})-?(\d{3})(?!\d)/);
  return m ? `${m[1]}${m[2]}` : null;
}

/**
 * URL da busca ESTRUTURADA no Nominatim (cidade + estado por extenso + país).
 * `null` quando não há cidade. UF desconhecida fica de fora (não inventa estado).
 */
export function urlNominatimCidade(cidade: string | null | undefined, estado: string | null | undefined): string | null {
  const c = limparCidade(cidade);
  if (c.length < 2) return null;
  const uf = limparUf(estado);
  const params: [string, string][] = [
    ['city', c],
    ...(uf ? ([['state', UF_NOME[uf]]] as [string, string][]) : []),
    ['country', 'Brasil'],
    ['countrycodes', 'br'],
    ['format', 'jsonv2'],
    ['limit', '1'],
    ['email', NOMINATIM_EMAIL],
  ];
  return `${NOMINATIM_URL}?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/**
 * Lê o 1º resultado do jsonv2. `{ lat, lon }` | `null` (não achou, ou achou
 * fora do Brasil) | `undefined` (corpo ilegível — é falha, não "não existe").
 */
export function lerNominatimCidade(d: unknown): { lat: number; lon: number } | null | undefined {
  if (!Array.isArray(d)) return undefined;
  if (d.length === 0) return null;
  const r = d[0] as { lat?: unknown; lon?: unknown } | null;
  const lat = Number(r?.lat);
  const lon = Number(r?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  if (lat < BBOX_BRASIL.latMin || lat > BBOX_BRASIL.latMax || lon < BBOX_BRASIL.lonMin || lon > BBOX_BRASIL.lonMax) {
    return null;
  }
  return { lat, lon };
}
