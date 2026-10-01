/**
 * GEO DO CLIENTE — coordenada, código IBGE e precisão (TypeScript PURO).
 *
 * Onda I1 do plano "OLLI Inteligente": o clima por visita, os alertas oficiais
 * por município e, depois, o mapa e o encaixe por distância precisam saber ONDE
 * fica o cliente. Esta é a única fonte da regra; quem usa:
 *   - o app (`database.ts` ao salvar o cliente, `cloudSync.ts` no pull/push);
 *   - o worker (`worker/src/geoClientes.js`, a rota POST /geo e o backfill em fila);
 *   - os testes em Node (`scripts/teste-geo-clientes.ts`).
 * Sem React Native, sem rede, sem relógio.
 *
 * ─── AS QUATRO PEÇAS ────────────────────────────────────────────────────────
 *   lat / lon     coordenada em graus decimais. Os DOIS ou NENHUM: meia
 *                 coordenada não é lugar. 0,0 é um ponto no Atlântico, nunca
 *                 "sem coordenada" — por isso é recusado.
 *   ibge          código do município (7 dígitos). É a chave dos alertas do
 *                 INMET/Defesa Civil. Pode existir SEM coordenada (o ViaCEP
 *                 devolve o IBGE mesmo quando ninguém sabe o ponto).
 *   geoPrecisao   de onde a coordenada veio, do mais fino ao mais grosso:
 *                 'numero' (a casa), 'rua', 'cep' (centro do CEP), 'bairro',
 *                 'cidade'. A tela precisa disto para não prometer o que não
 *                 sabe: coordenada da cidade serve para o clima (a previsão é de
 *                 ~5 km), mas não serve para "chego em 12 min".
 *
 * ─── "NÃO SEI" NUNCA VIRA "NÃO TEM" ─────────────────────────────────────────
 * Ausência de coordenada é `undefined`, nunca 0 nem string vazia. E quem lê uma
 * linha com coordenada pela metade ou fora do planeta recebe "sem coordenada",
 * não um ponto inventado.
 */

/** Do mais fino ao mais grosso. A ordem importa: é a régua de "melhorou?". */
export const GEO_PRECISOES = ['numero', 'rua', 'cep', 'bairro', 'cidade'] as const;
export type GeoPrecisao = (typeof GEO_PRECISOES)[number];

/** Rótulo curto e honesto da precisão, para a tela dizer de onde veio o ponto. */
export const ROTULO_GEO_PRECISAO: Record<GeoPrecisao, string> = {
  numero: 'no número da casa',
  rua: 'na rua',
  cep: 'pelo CEP',
  bairro: 'pelo bairro',
  cidade: 'pela cidade',
};

/** A parte geo de um cliente. Tudo opcional: ausente = não sabemos. */
export interface CamposGeo {
  lat?: number;
  lon?: number;
  ibge?: string;
  geoPrecisao?: GeoPrecisao;
}

/** Os campos de endereço que decidem a coordenada. */
export interface EnderecoGeo {
  cep?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
}

/**
 * Coordenada válida ou `null`. Aceita número ou string numérica (PostgREST manda
 * `double precision` como número; o SQLite pode devolver texto em banco antigo).
 */
export function coordenadaValida(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  if (lat === null || lat === undefined || lat === '' || lon === null || lon === undefined || lon === '') return null;
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  if (la === 0 && lo === 0) return null; // ilha nula: ausência de dado, não endereço
  return { lat: la, lon: lo };
}

/** Código IBGE de município: exatamente 7 dígitos (aceita número). `null` se não for. */
export function normalizarIbge(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return /^\d{7}$/.test(s) ? s : null;
}

export function lerGeoPrecisao(v: unknown): GeoPrecisao | null {
  return typeof v === 'string' && (GEO_PRECISOES as readonly string[]).includes(v) ? (v as GeoPrecisao) : null;
}

/**
 * Lê os campos geo de uma linha (SQLite ou nuvem, colunas snake_case). Coordenada
 * sem precisão, ou precisão sem coordenada, vira "sem coordenada" — os dois
 * andam juntos (é o mesmo CHECK da migration). O IBGE é independente.
 */
export function lerGeoDaLinha(row: { lat?: unknown; lon?: unknown; ibge?: unknown; geo_precisao?: unknown } | null | undefined): CamposGeo {
  if (!row || typeof row !== 'object') return {};
  const out: CamposGeo = {};
  const coord = coordenadaValida(row.lat, row.lon);
  const precisao = lerGeoPrecisao(row.geo_precisao);
  if (coord && precisao) {
    out.lat = coord.lat;
    out.lon = coord.lon;
    out.geoPrecisao = precisao;
  }
  const ibge = normalizarIbge(row.ibge);
  if (ibge) out.ibge = ibge;
  return out;
}

/** Os campos geo de um objeto do app, prontos para coluna (null = sem valor). */
export function geoParaColunas(g: CamposGeo): { lat: number | null; lon: number | null; ibge: string | null; geo_precisao: GeoPrecisao | null } {
  const coord = coordenadaValida(g.lat, g.lon);
  const precisao = lerGeoPrecisao(g.geoPrecisao);
  const temPonto = !!coord && !!precisao;
  return {
    lat: temPonto ? coord!.lat : null,
    lon: temPonto ? coord!.lon : null,
    ibge: normalizarIbge(g.ibge),
    geo_precisao: temPonto ? precisao : null,
  };
}

/** Só os 8 dígitos do CEP, ou `null`. */
export function cepParaGeo(cep: unknown): string | null {
  const so = String(cep ?? '').replace(/\D/g, '');
  return so.length === 8 ? so : null;
}

/** Texto comparável: sem acento, sem caixa, espaço único. */
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g');
export function textoComparavel(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * O que mudou no endereço, do ponto de vista da geo:
 *  - `coordenada`: qualquer um dos quatro campos → a coordenada antiga não vale mais;
 *  - `municipio`: CEP, cidade ou UF → o IBGE antigo também não vale.
 * Trocar só o número da casa invalida o ponto, mas não o município.
 */
export function mudancaDeEndereco(antes: EnderecoGeo, depois: EnderecoGeo): { coordenada: boolean; municipio: boolean } {
  const municipio =
    cepParaGeo(antes.cep) !== cepParaGeo(depois.cep) ||
    textoComparavel(antes.cidade) !== textoComparavel(depois.cidade) ||
    textoComparavel(antes.estado) !== textoComparavel(depois.estado);
  const coordenada = municipio || textoComparavel(antes.endereco) !== textoComparavel(depois.endereco);
  return { coordenada, municipio };
}

/**
 * A geo que o cliente salvo deve carregar. A fonte de verdade é o que JÁ está
 * gravado (`anterior`), não o que a tela mandou: a tela edita um objeto carregado
 * antes e o devolve inteiro, com a geo velha junto — inclusive depois de trocar o
 * CEP. Regra:
 *   - cliente novo → nenhuma geo (a geocodificação vem depois do salvar);
 *   - endereço igual → mantém a geo gravada;
 *   - mudou só rua/número → perde o ponto, mantém o IBGE;
 *   - mudou CEP/cidade/UF → perde tudo.
 */
export function geoAposEdicao(anterior: (EnderecoGeo & CamposGeo) | null | undefined, novo: EnderecoGeo): CamposGeo {
  if (!anterior) return {};
  const mudou = mudancaDeEndereco(anterior, novo);
  const out: CamposGeo = {};
  if (!mudou.municipio) {
    const ibge = normalizarIbge(anterior.ibge);
    if (ibge) out.ibge = ibge;
  }
  if (!mudou.coordenada) {
    const coord = coordenadaValida(anterior.lat, anterior.lon);
    const precisao = lerGeoPrecisao(anterior.geoPrecisao);
    if (coord && precisao) {
      out.lat = coord.lat;
      out.lon = coord.lon;
      out.geoPrecisao = precisao;
    }
  }
  return out;
}

/** Dá para tentar achar este cliente no mapa? (CEP completo, ou cidade + UF.) */
export function enderecoGeocodificavel(e: EnderecoGeo): boolean {
  if (cepParaGeo(e.cep)) return true;
  return textoComparavel(e.cidade).length > 1 && textoComparavel(e.estado).length === 2;
}

/** Vale pedir geocodificação agora? Só quando falta o ponto e há o que procurar. */
export function precisaGeocodificar(c: EnderecoGeo & CamposGeo): boolean {
  if (coordenadaValida(c.lat, c.lon) && lerGeoPrecisao(c.geoPrecisao)) return false;
  return enderecoGeocodificavel(c);
}

/**
 * O número da casa dentro do texto livre do endereço ("Av. Paulista, 1000",
 * "Rua 25 de Março 120", "Rua X, nº 45 - fundos"). Com vírgula, vale o primeiro
 * número DEPOIS da vírgula (o "25" de "Rua 25 de Março" é nome de rua). Sem
 * vírgula, só um número no FIM conta. "s/n" e "sem número" dão `null`.
 */
export function extrairNumeroEndereco(endereco: unknown): string | null {
  const s = String(endereco ?? '').trim();
  if (!s) return null;
  const virgula = s.indexOf(',');
  if (virgula >= 0) {
    const resto = s.slice(virgula + 1);
    if (/^\s*(s\/?n|sem\s+n[uú]mero)\b/i.test(resto)) return null;
    const m = resto.match(/^\s*(?:n[º°o.]?\s*)?(\d{1,6})\b/i);
    return m ? m[1] : null;
  }
  const fim = s.match(/\s(?:n[º°o.]?\s*)?(\d{1,6})\s*$/i);
  return fim ? fim[1] : null;
}

/**
 * A rua sem o número e sem o complemento ("Av. Paulista, 1000 - ap 12" →
 * "Av. Paulista"). Sem vírgula e com número no fim, tira o número do fim.
 */
export function logradouroDoEndereco(endereco: unknown): string {
  const s = String(endereco ?? '').trim();
  if (!s) return '';
  const virgula = s.indexOf(',');
  if (virgula >= 0) return s.slice(0, virgula).trim();
  return s.replace(/\s(?:n[º°o.]?\s*)?\d{1,6}\s*$/i, '').trim();
}

/**
 * Precisão a partir do `place_rank` do Nominatim (jsonv2). Faixas da
 * documentação do Nominatim ("Place ranking"): 30 = casa/edifício,
 * 26–27 = rua, 21–25 = CEP/bairro pequeno, 17–20 = bairro/distrito,
 * 12–16 = cidade. Abaixo de 12 (estado, país) não é endereço de cliente.
 */
export function precisaoPorRankNominatim(rank: unknown): GeoPrecisao | null {
  const r = Number(rank);
  if (!Number.isFinite(r)) return null;
  if (r >= 30) return 'numero';
  if (r >= 26) return 'rua';
  if (r >= 17) return 'bairro';
  if (r >= 12) return 'cidade';
  return null;
}

/** Nome do estado por UF — o Nominatim casa melhor com o nome do que com a sigla. */
export const NOME_UF: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

/** UF válida (2 letras de um estado brasileiro) ou `null`. */
export function normalizarUf(v: unknown): string | null {
  const s = String(v ?? '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(NOME_UF, s) ? s : null;
}

/**
 * Atribuição exigida pela licença ODbL do OpenStreetMap quando a coordenada veio
 * do Nominatim. A tela que MOSTRAR o ponto (mapa, "perto de você") exibe isto.
 */
export const ATRIBUICAO_OSM = 'Localização: © colaboradores do OpenStreetMap (ODbL)';
