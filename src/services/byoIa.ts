/**
 * Contrato do plugue BYO (D-1438 G22). Só a regra. Não chama provedor, não
 * guarda chave, não abre cobrança.
 *
 * O prestador quer usar o Claude, o GPT ou o Gemini que ele já tem (API, MCP
 * ou plugin) e, na frase do Igor, pagar dentro do OLLI. Preço novo está
 * bloqueado até o Igor decidir. Pro segue R$ 39 e Empresa R$ 99, vindos de
 * `precosPlanos.ts`. Este módulo não inventa outro número.
 *
 * Nada no app importa daqui de propósito. O teste `scripts/teste-byo-ia.ts`
 * recusa import novo: ligar tela, worker ou migration é outro passo, depois
 * da decisão de preço.
 */
import { PRECO_EMPRESA, PRECO_PRO, reais } from './precosPlanos.ts';

export const PROVEDORES_BYO = ['claude', 'gpt', 'gemini'] as const;
export type ProvedorByo = (typeof PROVEDORES_BYO)[number];

export const MODOS_BYO = ['api', 'mcp', 'plugin'] as const;
export type ModoByo = (typeof MODOS_BYO)[number];

/** Plugin, na boca do Igor, é o conector dentro do aplicativo do modelo. O protocolo é o MCP. */
export const PLUGIN_USA_MCP = true as const;

/** Abaixo disso não é chave de provedor; é lixo colado ou prefixo sozinho. */
export const CHAVE_MIN_CARACTERES = 20;

export const COBRANCA_IA_NA_PLATAFORMA = {
  estado: 'bloqueada',
  motivo:
    'Preço novo de IA depende de decisão do Igor. Pro e Empresa não ganham outra cobrança neste item.',
} as const;

export type EstadoCobrancaIa = 'bloqueada' | 'liberada';

export type MotivoRecusaChave = 'vazia' | 'curta' | 'formato' | 'nao_e_chave_de_ia' | 'chave_da_casa';

export type ResultadoChave =
  | { aceita: false; motivo: MotivoRecusaChave }
  | { aceita: true; provedor: ProvedorByo; ultimos4: string };

const NAO_E_CHAVE_DE_IA = ['sb_secret_', 'sk_live_', 'sk_test_', 'rk_live_', 'rk_test_'] as const;

/**
 * Recusa cobrar IA por fora do plano. A mutação `liberada` existe para o teste
 * provar que a trava morde: o constante de produção fica em `bloqueada`.
 */
export function exigirSemCobrancaNova(estado: EstadoCobrancaIa): void {
  if (estado !== 'bloqueada') {
    throw new Error('Cobrança nova de IA está bloqueada até o Igor decidir o preço.');
  }
}

export function frasePlanoPublicado(): string {
  return `O plano publicado segue Pro ${reais(PRECO_PRO.mensalCentavos)} e Empresa ${reais(PRECO_EMPRESA.mensalCentavos)}.`;
}

const TEXTO_DO_MODO: Record<ModoByo, (plano: string) => string> = {
  api: (plano) =>
    `Você usa a sua chave do Claude, do GPT ou do Gemini. A fatura desse uso sai no provedor, não no OLLI. ${plano} Ainda não há campo de chave.`,
  mcp: (plano) =>
    `Você liga o Claude, o ChatGPT ou o Gemini que já usa, pelo conector MCP. A OLLI não vê a chave do modelo. ${plano} Ainda não há conector para ligar.`,
  plugin: (plano) =>
    `O plugin é esse mesmo conector, aberto de dentro do Claude, do ChatGPT ou do Gemini. A OLLI não vê a chave do modelo. ${plano} Ainda não há conector para ligar.`,
};

/** Texto que uma tela futura pode mostrar. Não promete compra de IA nem campo que não existe. */
export function textoDoModo(modo: ModoByo): string {
  return TEXTO_DO_MODO[modo](frasePlanoPublicado());
}

/** Só o modo API pede chave. MCP e plugin entram com a sessão do prestador. */
export function modoPedeChave(modo: ModoByo): boolean {
  return modo === 'api';
}

function limparChave(bruto: string): string {
  return bruto.trim().replace(/\s+/g, '');
}

function provedorDaChave(chave: string): ProvedorByo | null {
  if (/^sk-ant-[A-Za-z0-9_-]+$/.test(chave)) return 'claude';
  if (/^sk-proj-[A-Za-z0-9_-]+$/.test(chave)) return 'gpt';
  if (/^sk-[A-Za-z0-9_-]+$/.test(chave)) return 'gpt';
  if (/^AIza[A-Za-z0-9_-]+$/.test(chave)) return 'gemini';
  return null;
}

/**
 * Classifica um campo que deveria ser só a chave. Não devolve o segredo, não
 * grava e não consulta o provedor (consulta gastaria crédito dele ou nosso).
 * Chave da casa (OpenRouter, prefixo sk-or-v1-) não serve de chave do prestador.
 */
export function classificarChave(bruto: string): ResultadoChave {
  const chave = limparChave(bruto);
  if (!chave) return { aceita: false, motivo: 'vazia' };
  if (chave.startsWith('sk-or-v1-')) return { aceita: false, motivo: 'chave_da_casa' };
  if (NAO_E_CHAVE_DE_IA.some((prefixo) => chave.startsWith(prefixo))) {
    return { aceita: false, motivo: 'nao_e_chave_de_ia' };
  }
  if (chave.length < CHAVE_MIN_CARACTERES) return { aceita: false, motivo: 'curta' };
  const provedor = provedorDaChave(chave);
  if (!provedor) return { aceita: false, motivo: 'formato' };
  return { aceita: true, provedor, ultimos4: chave.slice(-4) };
}

const CORPOS_DE_CHAVE = [
  'sk-or-v1-[A-Za-z0-9]{8,}',
  'sk-ant-[A-Za-z0-9_-]{8,}',
  'sk-proj-[A-Za-z0-9_-]{8,}',
  'sk-[A-Za-z0-9_-]{8,}',
  'AIza[A-Za-z0-9_-]{8,}',
  'sb_secret_[A-Za-z0-9_-]{8,}',
] as const;

/** Tira chave de um texto antes de log, erro ou analytics. O miolo some; fica o marcador. */
export function redigirTexto(texto: string): string {
  let saida = texto;
  for (const corpo of CORPOS_DE_CHAVE) {
    saida = saida.replace(new RegExp(corpo, 'g'), '[chave]');
  }
  return saida;
}
