/**
 * RESUMO DO TESTE DO PRO — "o que o Pro fez por você" (CQ-DINHEIRO-LOTE1, D-2506).
 *
 * 15 testes do Pro começaram e acabaram sem nenhuma compra: o teste começa sozinho no
 * 1º envio e termina sem a pessoa saber o que o Pro fez por ela. Este módulo decide,
 * a partir de números VERDADEIROS da conta, o que dizer na véspera e no fim do teste.
 *
 * Módulo PURO (zero rede): quem lê o banco é a tela. Regra de ouro (CDC):
 *  - só entra número que veio do banco e é maior que zero — nada estimado, nada
 *    arredondado para cima, nada "até X";
 *  - tudo zero → nenhuma conta inventada: 1 frase com o que a pessoa ainda não usou;
 *  - leitura que falhou (`null`) → nem número nem a frase do "não usou" (não sabemos se
 *    usou): fica só o título e o botão. Nunca diz "0" por erro de leitura.
 *
 * Os números vêm de `orcamentos_publicos` (o link /o/ do orçamento) criados DENTRO da
 * janela do teste (`trials_comerciais.iniciado_em` até `termina_em`). No teste a conta é
 * Pro: o link saiu sem o selo "Feito com OLLI" e com o Pix do prestador liberado.
 */

export type EstadoTesteResumo = 'unstarted' | 'eligible' | 'active' | 'ended' | 'converted' | 'revoked';

export interface NumerosTestePro {
  /** Orçamentos que foram pelo link durante o teste (sem o selo da OLLI). */
  linksEnviados: number;
  /** Desses, quantos o cliente abriu. */
  linksAbertos: number;
  /** Desses, quantos o cliente aprovou pelo link. */
  linksAprovados: number;
}

export interface EntradaResumoTestePro {
  agora: Date;
  trialEstado: EstadoTesteResumo;
  /** ISO de quando o teste termina (ou terminou). */
  terminaEm: string | null;
  /** Plano efetivo agora: quem já paga não vê convite. */
  planoEfetivo: 'gratis' | 'pro' | 'empresa';
  /** `null` = a leitura falhou ou ainda não chegou: nenhum número aparece. */
  numeros: NumerosTestePro | null;
}

export interface ResumoTestePro {
  /** `vespera` = teste ativo, acaba em até 3 dias; `fim` = acabou há até 14 dias. */
  momento: 'vespera' | 'fim';
  titulo: string;
  /** Uma linha por número verdadeiro (> 0). Vazio quando não há número para mostrar. */
  feitos: string[];
  /** 1 frase do que a pessoa ainda não usou — só quando `feitos` está vazio. */
  naoUsou: string | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;
/** Mesma janela do aviso "teste acabando" (`lembreteAssinatura.ts`). */
export const DIAS_VESPERA_TESTE = 3;
/** Depois de 14 dias do fim, o resumo some (a pessoa já decidiu). */
export const DIAS_DEPOIS_DO_FIM = 14;

const FORMATO_DIA_BR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dia do calendário de São Paulo como número de dias (UTC meia-noite do mesmo Y-M-D). */
function diaCivilBr(ms: number): number {
  const [a, m, d] = FORMATO_DIA_BR.format(ms).split('-').map(Number);
  return Date.UTC(a, m - 1, d) / DIA_MS;
}

/**
 * Dias de CALENDÁRIO (America/Sao_Paulo) até o fim do teste: 0 = hoje, 1 = amanhã.
 * Nada de `ceil` de 24 h: um teste que acaba hoje às 23h, visto às 10h, é "hoje", não "amanhã".
 */
function diasAte(iso: string | null, agora: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return diaCivilBr(t) - diaCivilBr(agora.getTime());
}

function quando(dias: number): string {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}

function inteiroValido(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${varios}`;
}

/** As linhas do que o Pro fez, só com números verdadeiros e maiores que zero. */
export function linhasDoQueOProFez(numeros: NumerosTestePro | null): string[] {
  if (!numeros) return [];
  const enviados = inteiroValido(numeros.linksEnviados);
  if (enviados === 0) return [];
  // Abertos/aprovados nunca passam dos enviados (os três vêm do mesmo conjunto de links).
  const abertos = Math.min(inteiroValido(numeros.linksAbertos), enviados);
  const aprovados = Math.min(inteiroValido(numeros.linksAprovados), enviados);
  const linhas = [
    `${plural(enviados, 'orçamento foi', 'orçamentos foram')} pelo link sem o selo da OLLI, só com a sua marca.`,
  ];
  if (abertos > 0) linhas.push(`${plural(abertos, 'cliente abriu', 'clientes abriram')} o link.`);
  if (aprovados > 0) {
    linhas.push(`${plural(aprovados, 'orçamento foi aprovado', 'orçamentos foram aprovados')} pelo cliente no próprio link.`);
  }
  return linhas;
}

/** Frase única para quem não usou o link no teste (ou quando a leitura falhou). */
export const FRASE_NAO_USOU_LINK =
  'Você ainda não mandou orçamento pelo link: no Pro, ele vai sem o selo da OLLI e o cliente aprova e paga por Pix ali mesmo.';

/**
 * Decide se há resumo para mostrar e o que ele diz. `null` = não mostra nada
 * (teste fora da janela, conta que já paga, teste convertido ou revogado).
 */
export function resumoTestePro(e: EntradaResumoTestePro): ResumoTestePro | null {
  if (e.planoEfetivo === 'empresa') return null;
  const dias = diasAte(e.terminaEm, e.agora);
  if (dias === null) return null;

  let momento: ResumoTestePro['momento'];
  let titulo: string;
  if (e.trialEstado === 'active') {
    if (dias > DIAS_VESPERA_TESTE || dias < 0) return null;
    momento = 'vespera';
    titulo = `Seu teste do Pro acaba ${quando(dias)}`;
  } else if (e.trialEstado === 'ended') {
    // Quem terminou o teste e já paga o Pro (por outra via) não recebe convite.
    if (e.planoEfetivo !== 'gratis') return null;
    if (dias > 0 || dias < -DIAS_DEPOIS_DO_FIM) return null;
    momento = 'fim';
    titulo = 'Seu teste do Pro terminou';
  } else {
    return null;
  }

  const feitos = linhasDoQueOProFez(e.numeros);
  return {
    momento,
    titulo,
    feitos,
    naoUsou: feitos.length === 0 && e.numeros !== null ? FRASE_NAO_USOU_LINK : null,
  };
}
