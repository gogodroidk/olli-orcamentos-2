/**
 * Paleta do OLLI — derivada de UMA cor de marca, em dois modos.
 *
 * O app abre sempre no CLARO. O usuário pode ligar o ESCURO e escolher a cor da
 * marca. Tudo o que esta camada produz é o mesmo objeto `Cores` que as telas já
 * consumiam — as chaves não mudaram, só deixaram de ser constantes.
 *
 * ─── CONTRASTE NÃO É GOSTO ───────────────────────────────────────────────────
 * Deixar o usuário escolher a cor da marca é deixá-lo escolher a legibilidade do
 * app. Uma cor clara vira texto invisível no modo claro; uma escura, no escuro.
 * Por isso NENHUM valor de primeiro plano sai daqui sem passar por
 * `ajustarParaContraste`, que usa a razão de contraste do WCAG 2.x de verdade
 * (não a aproximação de luminância que havia em utils/coresMarca.ts):
 *
 *   AA texto normal .......... 4.5:1
 *   AA texto grande / ícone .. 3.0:1
 *
 * ─── O QUE *NÃO* É TEMÁVEL ───────────────────────────────────────────────────
 * As cores de STATUS (sucesso/erro/aviso) não seguem a marca: verde é verde. Elas
 * só são clareadas/escurecidas o bastante para serem legíveis no modo em uso.
 *
 * O PDF e a página pública do cliente NÃO leem esta paleta — `pdfGenerator.ts`
 * embute as próprias cores e o worker gera o HTML dele. Isso é proposital: um
 * tema escuro vazando para o documento que vai ao cliente do cliente seria um
 * desastre silencioso. As chaves `pdf*` abaixo existem só por compatibilidade e
 * são constantes.
 */

export type ModoTema = 'claro' | 'escuro';

/** Cor de marca padrão do OLLI (azul). */
export const COR_MARCA_PADRAO = '#0B6FCE';

// ─── conversões e contraste (WCAG 2.x) ───────────────────────────────────────

interface Rgb { r: number; g: number; b: number }
interface Hsl { h: number; s: number; l: number }

function hexParaRgb(hex: string): Rgb {
  const limpo = hex.replace('#', '');
  const seis = limpo.length === 3 ? limpo.split('').map((c) => c + c).join('') : limpo;
  const valido = /^[0-9a-fA-F]{6}$/.test(seis) ? seis : '000000';
  return {
    r: parseInt(valido.slice(0, 2), 16),
    g: parseInt(valido.slice(2, 4), 16),
    b: parseInt(valido.slice(4, 6), 16),
  };
}

function rgbParaHex({ r, g, b }: Rgb): string {
  const p = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`.toUpperCase();
}

function rgbParaHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function hslParaRgb({ h, s, l }: Hsl): Rgb {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  if (sn === 0) return { r: ln * 255, g: ln * 255, b: ln * 255 };
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const canal = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return { r: canal(hn + 1 / 3) * 255, g: canal(hn) * 255, b: canal(hn - 1 / 3) * 255 };
}

const hexParaHsl = (hex: string) => rgbParaHsl(hexParaRgb(hex));
const hslParaHex = (hsl: Hsl) => rgbParaHex(hslParaRgb(hsl));

/** Luminância relativa (WCAG 2.x, §relative luminance). */
function luminancia(hex: string): number {
  const { r, g, b } = hexParaRgb(hex);
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste do WCAG entre duas cores opacas. 1 = igual, 21 = preto/branco. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a), lb = luminancia(b);
  const claro = Math.max(la, lb), escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Branco ou tinta, o que for mais legível sobre `fundo`. Substitui a aproximação antiga. */
export function textoSobre(fundo: string, tinta = '#0F1B2D'): string {
  return contraste('#FFFFFF', fundo) >= contraste(tinta, fundo) ? '#FFFFFF' : tinta;
}

/**
 * Empurra a luminosidade de `cor` PARA LONGE de `fundo` até bater `alvo` de
 * contraste. Preserva matiz e saturação — a cor continua sendo a cor da marca,
 * só fica legível. Se nem preto nem branco bastarem (impossível pelo teorema do
 * contraste máximo), devolve o extremo mais próximo do alvo.
 */
export function ajustarParaContraste(cor: string, fundo: string, alvo: number): string {
  if (contraste(cor, fundo) >= alvo) return cor;

  const hsl = hexParaHsl(cor);
  const fundoEscuro = luminancia(fundo) < 0.5;
  const passo = fundoEscuro ? 2 : -2; // fundo escuro → clareia; fundo claro → escurece

  let melhor = cor;
  let melhorRazao = contraste(cor, fundo);
  for (let i = 1; i <= 50; i += 1) {
    const l = hsl.l + passo * i;
    if (l < 0 || l > 100) break;
    const candidata = hslParaHex({ ...hsl, l });
    const razao = contraste(candidata, fundo);
    if (razao > melhorRazao) {
      melhor = candidata;
      melhorRazao = razao;
    }
    if (razao >= alvo) return candidata;
  }
  return melhor;
}

/**
 * Um gradiente é uma superfície CONTÍNUA: o texto atravessa as duas pontas, então
 * as duas precisam de contraste com ele. `textoSobre(marca)` responde "que texto
 * vai sobre a cor da marca?", que é outra pergunta — e a resposta errada assim que
 * o gradiente não é feito da marca (o header escuro é azul-marinho fixo).
 *
 * Aqui a PRIMEIRA ponta é a âncora de identidade e decide branco-ou-tinta; depois
 * as duas cedem luminosidade até 4.5:1 contra esse texto. Matiz e saturação — a
 * identidade — não se movem. Com a marca padrão nenhuma ponta muda: elas já
 * passavam (5.02:1 e 15.32:1).
 */
export function parLegivel(a: string, b: string, alvo = 4.5): { pontas: readonly [string, string]; sobre: string } {
  const sobre = textoSobre(a);
  return {
    pontas: [ajustarParaContraste(a, sobre, alvo), ajustarParaContraste(b, sobre, alvo)] as const,
    sobre,
  };
}

/** Compõe `cor` com alfa sobre `fundo` opaco e devolve o hex resultante. */
function compor(cor: string, fundo: string, alfa: number): string {
  const c = hexParaRgb(cor);
  const f = hexParaRgb(fundo);
  const m = (a: number, b: number) => Math.round(a * alfa + b * (1 - alfa));
  const h = (v: number) => v.toString(16).padStart(2, '0');
  return `#${h(m(c.r, f.r))}${h(m(c.g, f.g))}${h(m(c.b, f.b))}`;
}

/**
 * Achata um véu `rgba(r,g,b,a)` sobre uma base OPACA e devolve o hex efetivo.
 *
 * Existe porque `contraste()` só sabe ler cor opaca. Um véu translúcido sobre uma
 * superfície que muda com o tema — o hero da Home é literalmente
 * `rgba(11,111,206,0.38)` sobre `background` — resulta em azul claro no modo claro
 * e azul-marinho no escuro. Medir contra o véu, ou contra a base, dá as duas
 * respostas erradas: o que o olho vê é a composição.
 */
export function achatarVeu(base: string, veu: string): string {
  const m = veu.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!m) return veu; // já é hex (ou algo que não sabemos compor): devolve como veio
  const alfa = m[4] === undefined ? 1 : Number(m[4]);
  const h = (v: string) => Number(v).toString(16).padStart(2, '0');
  return compor(`#${h(m[1])}${h(m[2])}${h(m[3])}`, base, alfa);
}

/**
 * Texto SECUNDÁRIO sobre um gradiente: o mesmo `sobre`, rebaixado por alfa até onde
 * ainda passa 4.5:1 nas DUAS pontas.
 *
 * Um alfa fixo não pode ser seguro. A folga depende da cor de marca: branco opaco
 * sobre o azul padrão mede 5.02:1 — dez por cento de margem — e sobre o vermelho,
 * 4.83:1. Um `comAlfa(sobre, 0.82)` cravado (que eu mesmo escrevi no subtítulo do
 * header) derruba a ponta clara para 3.90:1. Aqui o alfa DESCE a partir de `ideal`
 * só enquanto o contraste aguenta; se nem o mais alto passar, devolve a cor opaca.
 * Hierarquia visual sem sacrificar a legibilidade — e se não der, a hierarquia cede.
 */
export function sobreSecundario(
  sobre: string,
  pontas: readonly [string, string],
  ideal = 0.82,
  alvo = 4.5,
): string {
  const passa = (alfa: number) =>
    pontas.every((p) => contraste(compor(sobre, p, alfa), p) >= alvo);

  // Sobe de `ideal` até 1.0 em passos de 0.02 procurando o menor alfa que passa
  // (menor alfa = texto mais discreto, que é o objetivo).
  for (let alfa = ideal; alfa <= 1.0001; alfa += 0.02) {
    if (passa(Math.min(alfa, 1))) return alfa >= 0.999 ? sobre : comAlfa(sobre, Math.min(alfa, 1));
  }
  return sobre; // nem opaco passaria: devolve opaco, que é o melhor possível
}

/**
 * Matiz de CATEGORIA (tipo de agendamento, status de OS, situação de equipamento)
 * tornado legível sobre um fundo concreto, preservando o matiz.
 *
 * `#2BD787` significa "limpeza"; `#34C6D9`, "orçamento". São dados, não cores de
 * texto — foram escolhidos num app dark-only e medem 1.88:1 e 2.05:1 sobre branco.
 * Nenhum hex estático resolve: `#64748B` passa no claro (4.76:1) e reprova no escuro
 * (3.37:1). A luminosidade tem que ceder no PONTO DE USO, contra o fundo real; o
 * matiz, que é o significado, não se move.
 *
 * Use só quando o matiz vira TEXTO ou ÍCONE. Como preenchimento translúcido
 * (`cor + '22'`) ou borda, o valor cru continua certo.
 */
export function corCategoria(matiz: string, fundo: string, alvo = 4.5): string {
  return ajustarParaContraste(matiz, fundo, alvo);
}

/**
 * O caso comum: o matiz pinta o rótulo de um chip cujo fundo é o PRÓPRIO matiz
 * translúcido (`cor + '22'`, ou seja ~13%) sobre uma superfície. Medir contra a
 * superfície nua erra: o chip é mais escuro (ou mais claro) que ela.
 *
 * Sem isto, 8 dos 12 pares tipo×modo reprovavam — dois deles no modo ESCURO.
 */
// `tintAlfa` default = 34/255 ≈ 0,1333: bate EXATAMENTE com o alfa hex '22' que
// os chips de status/categoria pintam no fundo (backgroundColor: matiz + '22').
// Calibrar o texto pro mesmo véu que é renderizado fecha o gap de contraste que
// derrubava 'pausada' no escuro (0,13 calibrado vs 0,1333 pintado = 4,492:1).
// Quem pinta MENOS véu (ex.: StatusBadge com '20') só ganha contraste — seguro.
export function corCategoriaEmChip(matiz: string, superficie: string, tintAlfa = 34 / 255, alvo = 4.5): string {
  return corCategoria(matiz, achatarVeu(superficie, comAlfa(matiz, tintAlfa)), alvo);
}

/**
 * Cor de status do ORÇAMENTO com contraste garantido — mesmo mecanismo de
 * `corCategoriaEmChip` acima, só que nomeada para o caso de uso.
 *
 * `STATUS_COLORS` (`types/index.ts`) foi calibrado num app dark-only: o
 * cinza de `rascunho` (`#9CA3AF`) mede 2,54:1 sobre branco — falha AA
 * (4,5:1) no badge mais visto do app. Um hex estático não resolve os dois
 * modos ao mesmo tempo (a luminosidade que passa no claro reprova no
 * escuro, e vice-versa: são exigências opostas). Por isso ninguém deve ler
 * `STATUS_COLORS[status]` puro para pintar texto — sempre por aqui, contra
 * a superfície real do chip.
 */
export function corStatusOrcamento(matiz: string, superficie: string): string {
  return corCategoriaEmChip(matiz, superficie);
}

/**
 * Idem para o status de ORDEM DE SERVIÇO (`STATUS_OS_CORES`). O badge de OS
 * não tem um componente único — é remontado em 5 telas (mobile e desktop) —
 * então cada uma deriva a cor por aqui em vez de ler a constante crua; isso
 * já basta para as cinco ficarem acessíveis sem duplicar o cálculo de
 * contraste em cada uma.
 */
export function corStatusOS(matiz: string, superficie: string): string {
  return corCategoriaEmChip(matiz, superficie);
}

/** `#RRGGBB` + alfa → `rgba(r,g,b,a)`. Usado nos containers e hairlines. */
export function comAlfa(hex: string, alfa: number): string {
  const { r, g, b } = hexParaRgb(hex);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alfa})`;
}

// ─── superfícies por modo ────────────────────────────────────────────────────

/**
 * ─── A ESCADA DE ELEVAÇÃO ────────────────────────────────────────────────────
 *
 * Uma superfície só "existe" se a vizinha dela for perceptivelmente diferente. A
 * régua para isso NÃO é a razão de contraste do WCAG (ela responde "dá pra ler o
 * texto?", que é outra pergunta): é o L* do CIELAB, que é luminosidade
 * perceptual. Entre duas superfícies grandes e adjacentes, ΔL* < 2 é do tamanho
 * do ruído de painel — o olho não separa.
 *
 * O modo ESCURO sempre teve escada (ΔL* 4,12 / 3,82 / 6,45; amplitude 14,39). O
 * CLARO não tinha: `background` #F5F7FA e `surface` #FFFFFF ficavam a ΔL* 2,84 e
 * a sombra que deveria completar a separação valia 0,008 de alfa (ver
 * `criarSombras`). Cartão e página eram quase a mesma folha — a queixa de que
 * "a cor está estranha" no claro é isso: nada se destacava de nada.
 *
 * A correção move a escada PARA BAIXO, nunca para cima:
 *
 *   surfaceVariant  #D6DFEA  L* 88,45   ← recuado (campo, chip)
 *   background      #E1E8F0  L* 91,69   ΔL* 3,24   página
 *   surface         #FFFFFF  L* 100,0   ΔL* 8,31   CARTÃO — o texto mora aqui
 *   surfaceElevated #FFFFFF  L* 100,0             (mesmo nível; ver nota)
 *
 * O cartão CONTINUA branco puro de propósito. Este app é usado na rua, com sol
 * na tela: sob luz refletida o que sobra de contraste depende da luminância
 * absoluta da superfície onde o texto está. Escurecer o cartão para "abrir"
 * espaço na escada pagaria a hierarquia com legibilidade no sol — a troca
 * errada. Quem desce é a página e o campo, que não carregam corpo de texto.
 * Resultado: cartão↔página vai de ΔL* 2,84 → 8,31 e `onSurface` fica intacto
 * em 17,28:1.
 *
 * Matiz: 212–216°, saturação 32–33% nos quatro níveis — a mesma família do modo
 * escuro (212–215°). Antes, `background` era azul-acinzentado e `surface` era
 * branco NEUTRO (s = 0%): um branco neutro cercado de cinza-azulado sofre
 * contraste simultâneo e o olho o lê como amarelado. Agora o branco puro tem
 * uma família fria embaixo dele em vez de ao lado dele.
 *
 * NOTA sobre `surface` == `surfaceElevated`: os dois são o mesmo branco de
 * propósito, e isso não é a escada faltando. Conferido sítio a sítio, os 16 usos
 * de `surfaceElevated` (campo em FOCO, `OlliCard variant="metric"`, linhas da
 * Conta, balão do chat) têm sempre `background` ou `surfaceVariant` como
 * vizinho — nunca `surface`. Não existe elevado DENTRO de cartão. Separar os
 * dois custaria luminância num deles em troca de uma diferença que ninguém vê.
 * O que os dois precisavam era subir junto em relação à página, e isso é o que
 * a escada acima faz. A redundância dos nomes é dívida de nomenclatura, não de
 * cor.
 */
const SUPERFICIES = {
  claro: {
    background: '#E1E8F0',
    surface: '#FFFFFF',
    surfaceVariant: '#D6DFEA',
    surfaceElevated: '#FFFFFF',
    card: '#FFFFFF',
    tinta: '#0F1B2D',
  },
  escuro: {
    background: '#07111F',
    surface: '#102238',
    surfaceVariant: '#0D1A2C',
    surfaceElevated: '#16304D',
    card: '#102238',
    tinta: '#FFFFFF',
  },
} as const;

/** Status: matiz fixa (verde é verde). Só a luminosidade se adapta ao modo. */
const STATUS_BASE = { success: '#1FA971', danger: '#E5484D', warning: '#D98008' };

export interface Cores {
  primary: string; primaryLight: string; primaryDark: string;
  primaryContainer: string; primaryContainerText: string;
  accent: string; accentLight: string; accentContainer: string;
  secondary: string; secondaryContainer: string;
  success: string; successLight: string;
  danger: string; dangerLight: string;
  warning: string; warningLight: string;
  /** Rampa de severidade da falha — 4 níveis com matiz distinta (não colapsar Crítica e Alta no mesmo vermelho). */
  sevCritica: string; sevAlta: string; sevMedia: string; sevInfo: string;
  background: string; surface: string; surfaceVariant: string;
  surfaceElevated: string; surfaceGlass: string; surfacePressed: string; card: string;
  onPrimary: string; onBackground: string; onSurface: string;
  onSurfaceVariant: string; onSurfaceMuted: string;
  outline: string; outlineDark: string; strokeGlow: string;
  tabInactive: string; tabActive: string;
  whatsapp: string; plan: string; voice: string; avatarLilac: string; inkLight: string;
  /** Elevação: no escuro é superfície mais clara; no claro, sombra. Ver MOTION_SPEC. */
  sombraCor: string;
  pdfSectionBg: string; pdfColumnHeaderBg: string; pdfTotalBarBg: string;
  pdfApproveGreen: string; pdfRejectRed: string; pdfCardBg: string; pdfBorderColor: string;
}

/** Constantes do documento. NÃO seguem o tema — ver cabeçalho. */
const PDF = {
  pdfSectionBg: '#0A2547',
  pdfColumnHeaderBg: '#13385F',
  pdfTotalBarBg: '#0A2547',
  pdfApproveGreen: '#15B66E',
  pdfRejectRed: '#F25555',
  pdfCardBg: '#F4F7FB',
  pdfBorderColor: '#E2E8F0',
} as const;

/**
 * Constrói a paleta inteira a partir de uma cor de marca.
 *
 * `primary` é a marca PURA — é preenchimento de botão, e o texto por cima dela é
 * escolhido por contraste (`onPrimary`). Já `primaryLight` e `accentLight` são as
 * variantes de PRIMEIRO PLANO: é com elas que se pinta ícone e rótulo sobre o
 * fundo, então são elas que passam pelo ajuste de contraste. No escuro clareiam;
 * no claro, escurecem. Os nomes ficaram por compatibilidade com 70 arquivos.
 */
export function criarPaleta(modo: ModoTema, corMarca: string = COR_MARCA_PADRAO): Cores {
  const sup = SUPERFICIES[modo];
  const escuro = modo === 'escuro';
  const marca = hexParaHsl(corMarca);

  // Acento: análogo à marca, deslocado -21° e mais luminoso — um par harmônico,
  // em vez de um ciano cravado que brigaria com uma marca terracota ou vinho.
  // Para a cor PADRÃO usamos o ciano exato do design handoff: a fórmula chega
  // perto (#40DCF5), mas "perto" não é a identidade da marca.
  const acentoBase =
    corMarca.toUpperCase() === COR_MARCA_PADRAO
      ? '#34C6D9'
      : hslParaHex({
          h: marca.h - 21,
          s: Math.max(60, Math.min(92, marca.s)),
          l: Math.max(50, Math.min(70, marca.l + 18)),
        });

  const primary = corMarca;
  const accent = acentoBase;

  // Primeiro plano: 4.5:1 para texto; 3:1 basta para ícone/borda, mas usamos 4.5
  // porque estas chaves aparecem em rótulo também.
  //
  // O ajuste é contra a superfície mais DIFÍCIL, não contra `background`. Estes
  // tokens também são pintados sobre `surface` e `surfaceElevated`, e no escuro
  // essas superfícies são mais CLARAS que o fundo — garantir contra o fundo é
  // garantir contra o caso fácil. Com o azul padrão sobrava folga e ninguém via;
  // com marca terracota ou vinho o texto caía a 3.9:1 sobre um card.
  //
  // Token claro (modo escuro) → a superfície mais clara é a pior. Token escuro
  // (modo claro) → a pior é a mais escura. `ajustarParaContraste` é monótono na
  // luminosidade, então satisfazer a pior satisfaz todas as outras.
  const fundoDificil = escuro ? sup.surfaceElevated : sup.surfaceVariant;
  const primaryLight = ajustarParaContraste(hslParaHex({ ...marca, l: escuro ? marca.l + 14 : marca.l - 6 }), fundoDificil, 4.5);
  const accentLight = ajustarParaContraste(acentoBase, fundoDificil, 4.5);
  const tabActive = ajustarParaContraste(accent, sup.surfaceVariant, 3);

  const success = ajustarParaContraste(STATUS_BASE.success, fundoDificil, 4.5);
  const danger = ajustarParaContraste(STATUS_BASE.danger, fundoDificil, 4.5);
  const warning = ajustarParaContraste(STATUS_BASE.warning, fundoDificil, 4.5);

  const tinta = sup.tinta;
  const primaryDark = escuro ? '#0A2547' : hslParaHex({ ...marca, l: Math.max(12, marca.l - 28) });

  // Um único véu para o container e para o texto dele: se os dois alfas fossem
  // escritos separados, um dia divergiriam e o rótulo voltaria a ser calibrado
  // contra um fundo que ninguém pinta.
  const veuContainer = comAlfa(primary, escuro ? 0.16 : 0.10);

  return {
    primary,
    primaryLight,
    primaryDark,
    primaryContainer: veuContainer,
    // Medido contra o CHIP, não contra a superfície nua nem contra um branco
    // cravado. O rótulo é pintado sobre `primaryContainer`, que é a marca a 10%
    // (16% no escuro) sobre a superfície — um azul-clarinho no claro, um
    // azul-marinho no escuro. Nenhum dos dois é `sup.surface`, e no claro o
    // '#FFFFFF' cravado que estava aqui simplesmente ignorava o véu.
    //
    // Isso é o mesmo padrão que `corCategoriaEmChip` já usava logo acima; a
    // diferença é que este token não estava na lista `PRIMEIRO_PLANO` do
    // `scripts/checar-contraste.mjs`, então o gate ficava verde enquanto o chip
    // reprovava. Medido contra o chip real, a versão antiga falhava AA em
    // 5 das 12 marcas no claro (pior 4,13:1, Vermelho) e em 11 das 12 no
    // ESCURO (pior 3,87:1, o próprio Azul OLLI). Bug pré-existente nos dois
    // modos; aqui vai a 0/12 e 0/12.
    primaryContainerText: ajustarParaContraste(primary, achatarVeu(sup.surface, veuContainer), 4.5),
    accent,
    accentLight,
    accentContainer: comAlfa(accent, escuro ? 0.15 : 0.12),
    secondary: accent,
    secondaryContainer: comAlfa(accent, escuro ? 0.15 : 0.12),

    success,
    successLight: comAlfa(success, escuro ? 0.16 : 0.12),
    danger,
    dangerLight: comAlfa(danger, escuro ? 0.16 : 0.12),
    warning,
    warningLight: comAlfa(warning, escuro ? 0.16 : 0.12),

    // Severidade: Crítica reaproveita danger (vermelho) e Média reaproveita warning
    // (âmbar); Alta ganha um laranja próprio (entre os dois) e Info um azul frio —
    // assim os quatro níveis ficam distinguíveis num relance. Cada base passa pelo
    // mesmo ajuste de contraste dos status, pra ficar legível como texto nos 2 modos.
    sevCritica: danger,
    sevAlta: ajustarParaContraste('#E8620E', fundoDificil, 4.5),
    sevMedia: warning,
    sevInfo: ajustarParaContraste('#5C82A6', fundoDificil, 4.5),

    background: sup.background,
    surface: sup.surface,
    surfaceVariant: sup.surfaceVariant,
    surfaceElevated: sup.surfaceElevated,
    // Glass: no escuro é uma superfície translúcida; no claro, branco quase sólido
    // (vidro escuro sobre fundo claro vira sujeira).
    surfaceGlass: escuro ? 'rgba(22,48,77,0.72)' : 'rgba(255,255,255,0.88)',
    surfacePressed: comAlfa(accent, escuro ? 0.10 : 0.08),
    card: sup.card,

    onPrimary: textoSobre(primary),
    onBackground: tinta,
    onSurface: tinta,
    // Alfa NÃO é linear em luminosidade percebida, e os números do claro tinham
    // sido herdados do escuro com um ajuste pequeno — nunca calibrados contra as
    // superfícies claras de verdade. Recalibrados aqui contra a PIOR superfície
    // do claro (`surfaceVariant`, a mais escura, onde o texto escuro tem menos
    // folga). Só o ramo claro muda; o escuro fica exatamente como estava.
    //
    //                        antes → depois   no cartão      no campo
    //   onSurfaceVariant     0,64  → 0,70     6,44:1 Lc 82   5,53:1 Lc 66
    //   tabInactive          0,50  → 0,62     4,87:1 Lc 74   4,38:1 Lc 60
    //   onSurfaceMuted       0,45  → 0,58     4,27:1 Lc 70   3,89:1 Lc 57
    //
    // `onSurfaceMuted` tem 227 usos e media 2,90:1 (Lc 55) — sob sombra externa
    // isso cai para 2,12:1 e sob sol para 1,80:1, ou seja, sumia justamente onde
    // o app é usado. A rampa continua sendo rampa (Lc 104 / 82 / 74 / 70).
    onSurfaceVariant: comAlfa(tinta, escuro ? 0.62 : 0.70),
    onSurfaceMuted: comAlfa(tinta, escuro ? 0.40 : 0.58),

    // Hairline: 290 bordas no app. Com a escada nova o degrau de luminosidade já
    // separa cartão de página, então a linha é reforço, não estrutura — sobe o
    // suficiente para sobreviver ao reflexo (Lc 11 → 17) sem virar grade.
    outline: comAlfa(tinta, escuro ? 0.10 : 0.14),
    outlineDark: comAlfa(tinta, escuro ? 0.18 : 0.22),
    // O glow é um efeito de fundo ESCURO: um véu de acento sobre superfície
    // escura lê como brilho. No claro o mesmo véu sobre superfície clara lê como
    // contorno colorido de adesivo — e, como a marca é configurável, cada
    // prestador ganhava uma cor de contorno diferente em 76 bordas: o Vermelho
    // deixava o app inteiro com cartão de contorno rosa (#F5C2C2, s = 72%), o
    // Roxo com lilás (s = 69%), o Azul com azul-claro (s = 66%). Cor de marca
    // saturada aplicada ao PERÍMETRO de tudo é pior que em bloco, porque o olho
    // persegue borda. No claro vira traço neutro, igual para as 12 marcas; a
    // marca continua aparecendo onde deve (botão primário, gradiente, tabActive).
    strokeGlow: escuro ? comAlfa(accent, 0.24) : comAlfa(tinta, 0.18),

    tabInactive: comAlfa(tinta, escuro ? 0.45 : 0.62),
    tabActive,

    whatsapp: '#25D366',
    plan: ajustarParaContraste('#7C3AED', fundoDificil, 4.5),
    voice: ajustarParaContraste('#7C3AED', fundoDificil, 4.5),
    avatarLilac: '#A4B6F5',
    inkLight: escuro ? '#16202E' : '#E7ECF3',

    // Elevação (MOTION_SPEC §7): no escuro a sombra não existe — a elevação vem da
    // superfície mais clara. No claro, sombra neutra.
    //
    // OPACA de propósito. Era `rgba(15,27,45,0.10)`, e a doc do React Native diz
    // que `shadowOpacity` é "multiplied by the color's alpha component" — ou
    // seja, o 0,10 da cor multiplicava o 0,08 de `shadowOpacity` e a sombra `md`
    // saía com alfa EFETIVO 0,008. Isso não é sombra suave, é sombra ausente
    // (cavava ΔL* 0,69 no fundo). Com a cor opaca, `shadowOpacity` passa a valer
    // o que diz — ver `criarSombras`, onde os valores foram recalibrados para
    // compensar. Navy e não preto: a página do OLLI é fria, e sombra preta sobre
    // superfície fria acinzenta.
    sombraCor: escuro ? 'transparent' : '#0F1B2D',

    ...PDF,
  };
}

export interface Gradientes {
  primary: readonly [string, string];
  primaryDiagonal: readonly [string, string];
  brand: readonly [string, string];
  frost: readonly [string, string];
  success: readonly [string, string];
  progress: readonly [string, string];
  liveCard: readonly [string, string];
  header: readonly [string, string];
  card: readonly [string, string];
  dark: readonly [string, string];
  cockpit: readonly [string, string];
  surface: readonly [string, string];

  // Texto legível sobre as DUAS pontas do gradiente de mesmo nome. Existem porque
  // `cores.onPrimary` só sabe da cor da marca, e o header no escuro não é feito
  // dela. Sempre use estes — nunca `'#fff'` cravado.
  sobrePrimary: string;
  sobreHeader: string;
  sobreBrand: string;
}

/** Gradientes derivados da mesma cor de marca. Os de superfície mudam com o modo. */
export function criarGradientes(modo: ModoTema, corMarca: string = COR_MARCA_PADRAO): Gradientes {
  const c = criarPaleta(modo, corMarca);
  const escuro = modo === 'escuro';
  const marca = hexParaHsl(corMarca);
  const marcaEscura = hslParaHex({ ...marca, l: Math.max(12, marca.l - 28) });

  // Gradientes que CARREGAM TEXTO passam por `parLegivel`: as duas pontas ficam
  // legíveis sob a mesma cor de rótulo, para qualquer marca que o dono escolher.
  // Os decorativos (frost, progress, liveCard) não passam — não têm texto em cima,
  // e escurecê-los só apagaria o brilho da marca sem ganho de acessibilidade.
  const gPrimary = parLegivel(c.primary, marcaEscura);
  const gBrand = parLegivel(c.primary, c.accent);
  // O header no escuro é azul-marinho FIXO, não a marca: a âncora tem que ser ele
  // mesmo, senão uma marca clara pinta tinta escura sobre marinho (1.10:1).
  const gHeader = escuro ? parLegivel('#12385D', c.background) : parLegivel(c.primary, marcaEscura);

  return {
    primary: gPrimary.pontas,
    primaryDiagonal: gBrand.pontas,
    brand: gBrand.pontas,
    frost: [c.accent, hslParaHex({ ...hexParaHsl(c.accent), l: Math.min(86, hexParaHsl(c.accent).l + 14) })],
    success: [c.success, ajustarParaContraste(c.success, '#FFFFFF', 4.5)],
    progress: [c.primary, c.accent],
    liveCard: [comAlfa(c.primary, escuro ? 0.34 : 0.14), comAlfa(c.accent, escuro ? 0.07 : 0.05)],
    // Cabeçalho: no escuro é o gradiente cockpit; no claro é a marca (como um
    // banner) — inverter isso deixaria o header cinza e sem marca.
    header: gHeader.pontas,

    sobrePrimary: gPrimary.sobre,
    sobreHeader: gHeader.sobre,
    sobreBrand: gBrand.sobre,
    card: escuro ? [c.surfaceElevated, c.surfaceVariant] : [c.surface, c.surfaceVariant],
    dark: escuro ? ['#102A47', c.background] : [c.surfaceVariant, c.background],
    cockpit: escuro ? [c.surfaceVariant, c.background] : [c.background, c.surfaceVariant],
    surface: escuro ? [c.surfaceElevated, c.surface] : [c.surface, c.surfaceVariant],
  };
}

/**
 * Sombras por MODO. No escuro a sombra preta some no fundo — a elevação vem da
 * superfície mais clara (MOTION_SPEC §7), então as sombras são fortes só para dar
 * separação de borda. No claro a sombra é neutra e suave; sombra colorida sobre
 * branco lê como borrão, não como elevação.
 */
export function criarSombras(modo: ModoTema, cores: Cores) {
  const escuro = modo === 'escuro';
  const cor = escuro ? '#000' : cores.sombraCor;
  const op = (d: number, c: number) => (escuro ? d : c);
  // ─── os números do CLARO mudaram junto com `sombraCor` ────────────────────
  //
  // `sombraCor` deixou de carregar alfa 0,10 embutido (ver `criarPaleta`), então
  // os `shadowOpacity` do claro precisavam subir na mesma proporção, senão a
  // sombra saltaria de "invisível" para "borrão". Alfa EFETIVO antes → depois:
  //
  //        antes (0,10 × op)   depois (1,00 × op)   ΔL* que cava no fundo
  //   sm       0,0060               0,10             0,35 →  7,2
  //   md       0,0080               0,13             0,69 →  9,4
  //   lg       0,0100               0,16             0,69 → 11,4
  //
  // ATENÇÃO DE PLATAFORMA: `shadowOffset`/`shadowOpacity`/`shadowRadius` são
  // iOS-only no RN — no Android quem desenha é `elevation`, que não mudou. Ou
  // seja, esta correção conserta iOS e RN-web e deixa o APK Android como está.
  // É exatamente por isso que o app na web parecia mais chapado que o APK.
  return {
    sm: { shadowColor: cor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: op(0.25, 0.10), shadowRadius: 6, elevation: 3 },
    md: { shadowColor: cor, shadowOffset: { width: 0, height: 8 }, shadowOpacity: op(0.32, 0.13), shadowRadius: 16, elevation: 6 },
    lg: { shadowColor: cor, shadowOffset: { width: 0, height: 14 }, shadowOpacity: op(0.38, 0.16), shadowRadius: 28, elevation: 10 },
    // Glow é efeito de fundo escuro. No claro ele vira sombra neutra: manter o
    // brilho ciano sobre branco sujaria o card em vez de destacá-lo. O 0,10 aqui
    // é o alfa efetivo pretendido (antes era 0,010 pelo mesmo bug acima) — a
    // sombra de um botão primário, não um halo.
    glowCyan: escuro
      ? { shadowColor: cores.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 8 }
      : { shadowColor: cores.sombraCor, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.10, shadowRadius: 14, elevation: 6 },
    glowBlue: escuro
      ? { shadowColor: cores.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 8 }
      : { shadowColor: cores.sombraCor, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.10, shadowRadius: 14, elevation: 6 },
    focusRing: { shadowColor: cores.accentLight, shadowOffset: { width: 0, height: 0 }, shadowOpacity: escuro ? 0.5 : 0.35, shadowRadius: 8, elevation: 4 },
  };
}

/**
 * Sombras a partir SÓ da paleta — o modo é inferido da luminância do fundo.
 *
 * Existe para a fábrica de estilos (`useEstilos(c => ...)`) poder usar sombra sem
 * receber o modo por fora. Setenta arquivos usam `Shadow.md` dentro do
 * `StyleSheet.create`; passar o modo em todos eles seria ruído sem informação.
 */
export function sombrasDe(cores: Cores) {
  return criarSombras(luminancia(cores.background) < 0.5 ? 'escuro' : 'claro', cores);
}
