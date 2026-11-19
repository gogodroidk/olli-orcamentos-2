/**
 * PROSPECÇÃO NO MAPA (D-1438 G19) — regra pura, sem rede e sem API paga.
 *
 * O que o Igor pediu: ver os clientes a partir de onde o prestador está,
 * por raio, rota e nicho. O que esta leva faz: só os clientes que JÁ estão
 * na conta, com a coordenada que o cadastro já guardou (geocodificador
 * grátis do worker, no salvar). Não busca estabelecimento novo, não chama
 * Places, Geocoding nem Routes do Google e não pede chave.
 *
 * A rota que abre no Google Maps é o link público de direções
 * (`urlRotaDoDia`): o app do Maps traça o caminho. Aqui a ordem é vizinho
 * mais próximo em linha reta, e a tela diz que não é trânsito.
 *
 * Quem importa: a tela do app, a página do painel e
 * `scripts/teste-prospeccao-mapa-d1438.ts`. Sem React e sem banco.
 */
import { distanciaRetaKm } from '../services/etaEstimado.ts';
import { coordenadaValida, lerGeoPrecisao, type GeoPrecisao } from './geoCliente.ts';

export { coordenadaValida };
import { MAX_PARADAS_LINK_MAPS, urlRotaDoDia } from './rotaDoDia.ts';

export { MAX_PARADAS_LINK_MAPS };

/** Raios oferecidos na tela, em km. O padrão é o do meio da cidade. */
export const RAIOS_KM = [2, 5, 10, 20, 50] as const;
export const RAIO_PADRAO_KM = 10;

export const NICHO_TODOS = 'todos';
export const NICHO_SEM = 'sem-nicho';

/** Meia coordenada, 0,0 e precisão solta não são ponto. Igual a `lerGeoDaLinha`. */
const PRECISAO_APROXIMADA: ReadonlySet<GeoPrecisao> = new Set(['cep', 'bairro', 'cidade']);

export const TEXTO_SO_CADASTRO =
  'Este mapa mostra só os clientes da sua conta. Não busca gente nova no Google e não usa API paga.';

export const TEXTO_ROTA =
  'A ordem é a do vizinho mais próximo, em linha reta, sem trânsito. O botão abre o Google Maps pelo link público, no máximo 10 paradas.';

export const TEXTO_SEM_ORIGEM =
  'Sem a sua posição, o raio não corta a lista. Cadastre o endereço em Meu negócio ou use onde você está agora.';

export const TEXTO_GPS_NATIVO =
  'Neste aparelho a posição ao vivo ainda não está ligada. Uso a base do cadastro, quando ela existe.';

export const TEXTO_ESQUEMA_PAINEL =
  'Esquema com as coordenadas que o cadastro já tem. Sem mapa de fundo e sem enviar esses pontos a um serviço de mapa.';

export interface PontoProspeccao {
  lat: number;
  lon: number;
}

export interface NichoCliente {
  id: string;
  rotulo: string;
}

export interface ClienteMapa {
  id: string;
  nome: string;
  endereco: string;
  cidade: string;
  lat: number | null;
  lon: number | null;
  precisao: GeoPrecisao | null;
  /** CEP, bairro ou cidade: o ponto não é a porta. */
  aproximado: boolean;
  nichos: NichoCliente[];
}

export interface EntradaClienteMapa {
  id: string;
  nome?: string | null;
  endereco?: string | null;
  complemento?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  lat?: unknown;
  lon?: unknown;
  geoPrecisao?: unknown;
  nichos?: readonly (string | null | undefined)[];
}

export interface ItemNoMapa {
  cliente: ClienteMapa;
  /** `null` quando não há origem: não inventamos "pertinho". */
  distanciaKm: number | null;
  ordem: number;
}

export interface ItemFora {
  cliente: ClienteMapa;
  distanciaKm: number;
}

export interface ResumoNicho {
  id: string;
  rotulo: string;
  quantidade: number;
}

export interface ResultadoProspeccao {
  dentro: ItemNoMapa[];
  fora: ItemFora[];
  semPonto: ClienteMapa[];
  /** Soma dos trechos em linha reta (origem → 1 → 2…). `null` sem origem ou sem parada. */
  kmLinhaReta: number | null;
  raioAplicado: boolean;
  nichoIndisponivel: boolean;
  nichos: ResumoNicho[];
}

export interface OpcoesProspeccao {
  origem: PontoProspeccao | null;
  clientes: readonly ClienteMapa[];
  /** `null` = não cortar. Número inválido (NaN, ≤ 0) não coloca ninguém dentro. */
  raioKm: number | null;
  nicho: string;
  /**
   * `false` quando a leitura dos equipamentos falhou. Aí o filtro de nicho
   * não roda: dizer "sem equipamento" seria mentira.
   */
  nichosConfiaveis?: boolean;
}

export interface UrlRotaProspeccao {
  url: string | null;
  usadas: number;
  semEndereco: number;
  deForaDoLink: number;
}

function texto(v: string | null | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

function compararNome(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR') || a.localeCompare(b);
}

export function textoKm(km: number | null | undefined): string {
  if (typeof km !== 'number' || !Number.isFinite(km) || km < 0) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km).toLocaleString('pt-BR')} km`;
}

export function chaveNicho(bruto: string): string {
  return bruto.trim().toLowerCase();
}

function rotuloNicho(id: string, original: string, catalogo?: Readonly<Record<string, string>>): string {
  const doCatalogo = catalogo?.[id];
  if (doCatalogo?.trim()) return doCatalogo.trim();
  const cru = original.trim();
  return cru || id;
}

export function clienteParaMapa(
  entrada: EntradaClienteMapa,
  catalogo?: Readonly<Record<string, string>>,
): ClienteMapa {
  const nome = texto(entrada.nome) || 'Cliente sem nome';
  const endereco = [entrada.endereco, entrada.complemento, entrada.cidade, entrada.estado, entrada.cep]
    .map((p) => texto(p))
    .filter(Boolean)
    .join(', ');
  const cidade = [entrada.cidade, entrada.estado].map((p) => texto(p)).filter(Boolean).join(', ');
  const coord = coordenadaValida(entrada.lat, entrada.lon);
  const precisao = lerGeoPrecisao(entrada.geoPrecisao);
  const temPonto = !!coord && !!precisao;
  const vistos = new Set<string>();
  const nichos: NichoCliente[] = [];
  for (const bruto of entrada.nichos ?? []) {
    if (typeof bruto !== 'string') continue;
    const id = chaveNicho(bruto);
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    nichos.push({ id, rotulo: rotuloNicho(id, bruto, catalogo) });
  }
  return {
    id: entrada.id,
    nome,
    endereco,
    cidade,
    lat: temPonto ? coord.lat : null,
    lon: temPonto ? coord.lon : null,
    precisao: temPonto ? precisao : null,
    aproximado: temPonto && PRECISAO_APROXIMADA.has(precisao),
    nichos,
  };
}

export function resumirNichos(clientes: readonly ClienteMapa[]): ResumoNicho[] {
  const mapa = new Map<string, ResumoNicho>();
  let sem = 0;
  for (const c of clientes) {
    if (c.nichos.length === 0) {
      sem += 1;
      continue;
    }
    for (const n of c.nichos) {
      const atual = mapa.get(n.id);
      if (atual) atual.quantidade += 1;
      else mapa.set(n.id, { id: n.id, rotulo: n.rotulo, quantidade: 1 });
    }
  }
  const lista = [...mapa.values()].sort(
    (a, b) => b.quantidade - a.quantidade || compararNome(a.rotulo, b.rotulo) || compararNome(a.id, b.id),
  );
  if (sem > 0) lista.push({ id: NICHO_SEM, rotulo: 'Sem equipamento', quantidade: sem });
  return lista;
}

function passaNicho(c: ClienteMapa, nicho: string): boolean {
  if (!nicho || nicho === NICHO_TODOS) return true;
  if (nicho === NICHO_SEM) return c.nichos.length === 0;
  return c.nichos.some((n) => n.id === nicho);
}

function pontoDe(c: ClienteMapa): PontoProspeccao | null {
  if (c.lat === null || c.lon === null) return null;
  return coordenadaValida(c.lat, c.lon);
}

function raioUtil(raioKm: number | null): { aplicado: boolean; invalido: boolean; km: number } {
  if (raioKm === null) return { aplicado: false, invalido: false, km: 0 };
  if (typeof raioKm !== 'number' || !Number.isFinite(raioKm) || raioKm <= 0) {
    return { aplicado: true, invalido: true, km: 0 };
  }
  return { aplicado: true, invalido: false, km: raioKm };
}

/** Empate de meio metro: o nome em pt-BR decide, para o teste e a tela não pularem. */
const EMPATE_KM = 0.0005;

function indiceMaisPerto(atual: PontoProspeccao, lista: readonly ClienteMapa[]): number {
  let melhor = 0;
  let melhorD = Infinity;
  for (let i = 0; i < lista.length; i++) {
    const p = pontoDe(lista[i]);
    if (!p) continue;
    const d = distanciaRetaKm(atual, p);
    const maisPerto = d < melhorD - EMPATE_KM;
    const empate = Math.abs(d - melhorD) <= EMPATE_KM;
    const nomeAntes = compararNome(lista[i].nome, lista[melhor].nome) < 0
      || (lista[i].nome === lista[melhor].nome && lista[i].id < lista[melhor].id);
    if (maisPerto || (empate && nomeAntes)) {
      melhor = i;
      if (maisPerto) melhorD = d;
    }
  }
  return melhor;
}

function ordenarVizinho(origem: PontoProspeccao, clientes: readonly ClienteMapa[]): ClienteMapa[] {
  const resto = [...clientes];
  const out: ClienteMapa[] = [];
  let atual: PontoProspeccao = origem;
  while (resto.length > 0) {
    const i = indiceMaisPerto(atual, resto);
    const escolhido = resto.splice(i, 1)[0];
    out.push(escolhido);
    const p = pontoDe(escolhido);
    if (p) atual = p;
  }
  return out;
}

function porNome(clientes: readonly ClienteMapa[]): ClienteMapa[] {
  return [...clientes].sort((a, b) => compararNome(a.nome, b.nome) || compararNome(a.id, b.id));
}

export function montarProspeccao(opcoes: OpcoesProspeccao): ResultadoProspeccao {
  const confiavel = opcoes.nichosConfiaveis !== false;
  const nicho = confiavel ? opcoes.nicho : NICHO_TODOS;
  const filtrados = opcoes.clientes.filter((c) => passaNicho(c, nicho));
  const semPonto = porNome(filtrados.filter((c) => !pontoDe(c)));
  const comPonto = filtrados.filter((c) => pontoDe(c));
  const origemBruta = opcoes.origem ? coordenadaValida(opcoes.origem.lat, opcoes.origem.lon) : null;
  const nichos = confiavel ? resumirNichos(opcoes.clientes) : [];

  if (!origemBruta) {
    const ordem = porNome(comPonto);
    return {
      dentro: ordem.map((cliente, i) => ({ cliente, distanciaKm: null, ordem: i + 1 })),
      fora: [],
      semPonto,
      kmLinhaReta: null,
      raioAplicado: false,
      nichoIndisponivel: !confiavel,
      nichos,
    };
  }

  const raio = raioUtil(opcoes.raioKm);
  const medidos: { cliente: ClienteMapa; distanciaKm: number }[] = [];
  for (const cliente of comPonto) {
    const p = pontoDe(cliente);
    if (!p) continue;
    medidos.push({ cliente, distanciaKm: distanciaRetaKm(origemBruta, p) });
  }

  let dentroBruto: { cliente: ClienteMapa; distanciaKm: number }[];
  let fora: ItemFora[];
  if (!raio.aplicado) {
    dentroBruto = medidos;
    fora = [];
  } else if (raio.invalido) {
    dentroBruto = [];
    fora = [...medidos].sort((a, b) => a.distanciaKm - b.distanciaKm);
  } else {
    dentroBruto = medidos.filter((m) => m.distanciaKm <= raio.km + EMPATE_KM);
    fora = medidos.filter((m) => m.distanciaKm > raio.km + EMPATE_KM).sort((a, b) => a.distanciaKm - b.distanciaKm);
  }

  const ordenados = ordenarVizinho(origemBruta, dentroBruto.map((m) => m.cliente));
  const distanciaDe = new Map(dentroBruto.map((m) => [m.cliente.id, m.distanciaKm]));
  const dentro: ItemNoMapa[] = ordenados.map((cliente, i) => ({
    cliente,
    distanciaKm: distanciaDe.get(cliente.id) ?? null,
    ordem: i + 1,
  }));

  let kmLinhaReta: number | null = null;
  if (dentro.length > 0) {
    let total = 0;
    let atual: PontoProspeccao = origemBruta;
    for (const item of dentro) {
      const p = pontoDe(item.cliente);
      if (!p) continue;
      total += distanciaRetaKm(atual, p);
      atual = p;
    }
    kmLinhaReta = total;
  }

  return {
    dentro,
    fora,
    semPonto,
    kmLinhaReta,
    raioAplicado: raio.aplicado && !raio.invalido,
    nichoIndisponivel: !confiavel,
    nichos,
  };
}

function enderecoUtil(endereco: string | null | undefined): string {
  return typeof endereco === 'string' ? endereco.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Link público de direções, na ordem recebida (já a da rota). Origem fica de
 * fora: o próprio Maps parte de onde o aparelho está. Acima de 10 paradas o
 * link corta e o retorno diz quantas ficaram de fora — o Maps ignoraria em silêncio.
 */
export function urlRotaProspeccao(enderecos: readonly (string | null | undefined)[]): UrlRotaProspeccao {
  const uteis: string[] = [];
  let semEndereco = 0;
  for (const bruto of enderecos) {
    const e = enderecoUtil(bruto);
    if (e.length < 3) {
      semEndereco += 1;
      continue;
    }
    uteis.push(e);
  }
  const usadasLista = uteis.slice(0, MAX_PARADAS_LINK_MAPS);
  return {
    url: urlRotaDoDia(usadasLista),
    usadas: usadasLista.length,
    semEndereco,
    deForaDoLink: uteis.length - usadasLista.length,
  };
}

export interface PontoTela {
  id: string;
  x: number;
  y: number;
}

/**
 * Projeção equiretangular para o esquema do painel (sem tile, sem rede).
 * Norte fica para cima. Um ponto só vai para o centro.
 */
export function projetarNoRetangulo(
  pontos: readonly { id: string; lat: number; lon: number }[],
  largura: number,
  altura: number,
  margem = 28,
): PontoTela[] | null {
  const validos = pontos.filter((p) => coordenadaValida(p.lat, p.lon));
  if (validos.length === 0 || largura < margem * 2 + 8 || altura < margem * 2 + 8) return null;
  if (validos.length === 1) {
    return [{ id: validos[0].id, x: largura / 2, y: altura / 2 }];
  }
  const latMedia = validos.reduce((s, p) => s + p.lat, 0) / validos.length;
  const k = Math.cos((latMedia * Math.PI) / 180);
  const xs = validos.map((p) => p.lon * k);
  const ys = validos.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const larg = Math.max(maxX - minX, 1e-9);
  const alt = Math.max(maxY - minY, 1e-9);
  const escala = Math.min((largura - 2 * margem) / larg, (altura - 2 * margem) / alt);
  const offX = (largura - larg * escala) / 2;
  const offY = (altura - alt * escala) / 2;
  return validos.map((p, i) => ({
    id: p.id,
    x: offX + (xs[i] - minX) * escala,
    y: altura - (offY + (ys[i] - minY) * escala),
  }));
}

/** Linha da rota em [lon, lat], começando na origem quando ela existe. */
export function linhaDaProspeccao(
  origem: PontoProspeccao | null,
  dentro: readonly ItemNoMapa[],
): [number, number][] {
  const linha: [number, number][] = [];
  const o = origem ? coordenadaValida(origem.lat, origem.lon) : null;
  if (o) linha.push([o.lon, o.lat]);
  for (const item of dentro) {
    if (item.cliente.lat === null || item.cliente.lon === null) continue;
    linha.push([item.cliente.lon, item.cliente.lat]);
  }
  return linha;
}

// ─── Mapa de verdade no painel (Leaflet + OpenStreetMap, 19/11, pedido da CPO) ──────────────────────

/**
 * Privacidade honesta: os tiles do OpenStreetMap são pedidos pela área que a pessoa olha (e pelo IP
 * do navegador). Os nomes e endereços dos clientes não vão ao serviço de mapa.
 */
export const TEXTO_MAPA_PAINEL =
  'Mapa do OpenStreetMap. Para desenhar o fundo, o serviço de mapa recebe só a área que você está olhando; a sua lista de clientes não sai do OLLI.';

/** Atribuição exigida pela licença do OpenStreetMap (ODbL), sempre visível no mapa. */
export const ATRIBUICAO_OSM = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

/** Ponto aproximado vira círculo da região (não pino falso na porta). Raio em metros por precisão. */
export const RAIO_APROXIMADO_M: Readonly<Partial<Record<GeoPrecisao, number>>> = { cep: 600, bairro: 1500, cidade: 8000 };

export interface GrupoNoMapa {
  lat: number;
  lon: number;
  itens: ItemNoMapa[];
  /** Algum item do grupo é aproximado: desenha o círculo da região. */
  aproximado: boolean;
  /** Maior raio aproximado do grupo, em metros (0 quando todos são exatos). */
  raioM: number;
}

/**
 * Junta quem cai na MESMA coordenada (ex.: 5 clientes com ponto "cidade = São Paulo"): um marcador com o
 * número de clientes, em vez de 5 bolinhas empilhadas que parecem uma só. Mantém a ordem da rota.
 */
export function agruparPorPonto(itens: readonly ItemNoMapa[]): GrupoNoMapa[] {
  const grupos = new Map<string, GrupoNoMapa>();
  for (const item of itens) {
    const { lat, lon } = item.cliente;
    if (lat === null || lon === null) continue;
    const chave = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    let g = grupos.get(chave);
    if (!g) {
      g = { lat, lon, itens: [], aproximado: false, raioM: 0 };
      grupos.set(chave, g);
    }
    g.itens.push(item);
    if (item.cliente.aproximado) {
      g.aproximado = true;
      const r = item.cliente.precisao ? RAIO_APROXIMADO_M[item.cliente.precisao] ?? 0 : 0;
      g.raioM = Math.max(g.raioM, r);
    }
  }
  return [...grupos.values()].sort((a, b) => a.itens[0].ordem - b.itens[0].ordem);
}
