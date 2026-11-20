import type { PlanoId } from './entitlements';

/**
 * CONTRATO COMERCIAL DO ENVIO DE ORÇAMENTOS — fonte única.
 *
 * ═══ GRÁTIS = ATÉ 5 ORÇAMENTOS ENVIADOS POR MÊS (em produção desde 07/11/2026, D-1827) ═══
 *
 * Histórico: até 01/10/2026 o Grátis tinha cota de 5 envios/mês; de 01/10 a
 * 06/11/2026 ficou sem teto. Desde 07/11/2026 o limite de 5 envios por mês vale
 * de novo para TODAS as contas do Grátis, controlado no servidor pela tabela
 * `limite_gratis_config` (`corte` para contas novas, `corte_antigas` para as
 * anteriores). A copy das telas sai de `planosBase.ts` (`CORTE_GRATIS_DATA`,
 * `CORTE_ANTIGAS_DATA`, `LIMITE_ENVIOS_GRATIS_MES`). O Grátis também leva o selo
 * discreto "Feito com OLLI" no PDF, no recibo e no link (ver `src/utils/marcaOlli.ts`);
 * o Pro tira o limite e o selo.
 *
 * ═══ O QUE CONTINUA EXISTINDO (e por quê) ═══
 *
 * A reserva/confirmação do envio (`reservar_envio_orcamento_gratis` e
 * `confirmar_envio_orcamento_gratis`) continua — não como PORTÃO, mas como
 * REGISTRO: é a confirmação do 1º envio que inicia o teste do Pro de 14 dias
 * (migration 20260930120000) e alimenta o funil de receita. Por isso:
 *
 *  - o envio NUNCA é bloqueado por este módulo. Se o registro falhar (rede, RLS,
 *    servidor antigo), o orçamento sai do mesmo jeito e o resultado diz
 *    `motivo: 'sem_registro'` — um estado NOMEADO, não um vazio disfarçado. O que
 *    se perde nesse caso é só o que dependeria do registro: o teste automático não
 *    começa por ESTE envio (falha fechada para conceder, nunca para entregar);
 *  - os nomes de fio (`dentro_da_cota`, `cota_esgotada`) ficam: o APK 1.1.x que
 *    está nas mãos dos clientes rejeita `motivo` desconhecido e bloquearia o
 *    envio. A migration 20261002150000 faz o servidor responder `dentro_da_cota`
 *    para todo envio do Grátis, sem teto.
 */
export const TRIAL_PRO_DIAS = 14;
/**
 * Crédito de troca ("Vim de outro app"): quem já pagou outro app manda o
 * comprovante e, depois da conferência MANUAL do admin, ganha o Pro por até este
 * número de meses. Concessão de acesso, não venda. 1 crédito por conta.
 * Paridade: migration 20261002153417_creditos_troca.sql e worker/src/creditoTroca.js.
 */
export const CREDITO_TROCA_MESES_MAX = 3;
/** Pedidos no total por conta (recusado por print ilegível pode reenviar). */
export const CREDITO_TROCA_PEDIDOS_MAX = 3;

/**
 * Indicação "colega indica colega": recompensa = meses de Pro para os DOIS lados, só depois
 * de o indicado ENVIAR um orçamento de verdade. FONTE ÚNICA do valor e dos tetos — a copy
 * (src/utils/indicacaoTexto.ts) e o worker (worker/src/indicacao.js, espelho) leem daqui;
 * ninguém digita "1 mês" nem o teto em texto. Benefício de uso: sem dinheiro, intransferível.
 * Paridade: migration 20261010100000_indicacoes.sql (recebe os valores por parâmetro) e
 * teste scripts/teste-indicacoes-sql.ts.
 */
export const INDICACAO_MESES_PRO = 1;
/** Indicações premiadas por pessoa (e vagas de vínculo). */
export const INDICACAO_TETO_PREMIADAS = 3;
/** Prêmios por dia no sistema todo (antifraude: acima disso fica pendente para o dia seguinte). */
export const INDICACAO_TETO_DIARIO = 20;

/**
 * Cupom de influenciador: desconto % só na 1ª cobrança, FIXO aqui (o código não carrega percentual).
 * Teto de usos e validade vivem por código (tabela cupons_influenciador), com estes limites duros.
 * Não acumula com a indicação. Nasce desligado (worker: CUPOM_INFLUENCER_ATIVO='1').
 * Sem preço novo: o valor com desconto sai do preço de tabela (PLANO_PIX / price da Stripe) × (100 − %).
 * Paridade: worker/src/cupom.js (espelho) + migration 20261119090000_cupom_influenciador.sql.
 */
export const CUPOM_PERCENTUAL = 10;
/** Teto duro de usos por código (a migration também limita em 500). */
export const CUPOM_USOS_MAX = 500;
/** Validade máxima de um código, em dias a partir da criação. */
export const CUPOM_VALIDADE_DIAS_MAX = 90;

export type CanalEnvioOrcamento = 'pdf' | 'link' | 'whatsapp';
export type TrialEstado = 'unstarted' | 'eligible' | 'active' | 'ended' | 'converted' | 'revoked';

export interface AvisoLimiteAntigas {
  /** Instante (ISO) em que o limite passa a valer para a conta. */
  aPartirDe: string;
  usados30d: number;
}

export interface EstadoOfertaComercial {
  planoEfetivo: PlanoId;
  /** Orçamentos distintos enviados neste mês (informativo; só vira teto se `limiteEnvios` vier). */
  enviosUsados: number;
  /** Teto mensal (ex.: 5) SÓ em conta nova do Grátis com o corte ligado (P0-09); `null` = sem teto. */
  limiteEnvios: number | null;
  /** Quanto falta no mês (0 = esgotado); `null` quando não há teto. */
  enviosRestantes: number | null;
  /**
   * Conta ANTERIOR ao corte, ainda antes do limite (`corte_antigas`): quando o limite começa e quantos envios
   * ela fez nos últimos 30 dias (valor do banco). `null` = nada a avisar (nova, Pro, ou servidor sem o sinal).
   */
  avisoLimiteAntigas: AvisoLimiteAntigas | null;
  trialEstado: TrialEstado;
  trialTerminaEm: string | null;
  trialDias: number;
  requerCartao: false;
  renovaAutomaticamente: false;
  preservaDados: true;
}

export type InicioTrialPro =
  | {
      iniciado: boolean;
      replay: boolean;
      terminaEm: string;
      motivo: null;
    }
  | {
      iniciado: false;
      replay: false;
      terminaEm: null;
      motivo: 'revisao_caixa';
    };

export interface ReservaEnvioOrcamento {
  /**
   * `true` quase sempre: falha de registro NUNCA barra o envio.
   * A ÚNICA recusa é `cota_esgotada` com `permitido:false` vinda do servidor — conta
   * nova do Grátis que já usou o limite do mês (P0-09; o servidor só devolve isso
   * quando o corte está ligado em `limite_gratis_config`). Toda tela que envia
   * precisa tratar `permitido === false` (hoje: `autorizarEntrega` na Visualizar).
   */
  permitido: boolean;
  planoEfetivo: PlanoId;
  /** Orçamentos distintos registrados neste mês (informativo). */
  usados: number;
  contabilizadoAgora: boolean;
  requerConfirmacao: boolean;
  reservaToken: string | null;
  trialElegivel: boolean;
  /**
   * - `dentro_da_cota`: envio do Grátis REGISTRADO (nome de fio mantido pelo APK antigo);
   * - `plano_pago` / `trial_ativo`: plano que não precisa de registro;
   * - `sem_registro`: o registro falhou (rede, servidor, resposta estranha) — o
   *   envio segue, só não conta para o teste automático nem para o funil;
   * - `ambiente_local`: sem Supabase configurado (desenvolvimento).
   *
   * - `cota_esgotada`: recusa REAL (`permitido:false`) do limite do Grátis em conta nova.
   */
  motivo: 'plano_pago' | 'trial_ativo' | 'dentro_da_cota' | 'sem_registro' | 'ambiente_local' | 'cota_esgotada';
  /** Só quando recusado por limite: o teto do mês (ex.: 5). */
  limiteEnvios: number | null;
}

function inteiroNaoNegativo(valor: unknown, fallback: number): number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0 ? valor : fallback;
}

/**
 * Lê `meu_estado_oferta_comercial`. `limite_envios`/`envios_restantes` só valem como
 * número inteiro positivo/não negativo e só em plano Grátis; qualquer outra coisa vira
 * `null` (= sem teto). O app NUNCA inventa teto: quem manda é o servidor (corte em
 * `limite_gratis_config`), e conta antiga ou com o corte desligado recebe `null`.
 */
export function interpretarEstadoOferta(valor: unknown): EstadoOfertaComercial | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  const estados = new Set<TrialEstado>(['unstarted', 'eligible', 'active', 'ended', 'converted', 'revoked']);
  if (!estados.has(v.trial_estado as TrialEstado)) return null;
  if (v.requires_card !== false || v.auto_renews !== false || v.data_disposition !== 'preserve') return null;
  if (v.trial_dias !== TRIAL_PRO_DIAS) return null;
  const plano = v.plano_efetivo === 'empresa' ? 'empresa' : v.plano_efetivo === 'pro' ? 'pro' : 'gratis';
  const terminaEm = typeof v.trial_termina_em === 'string' && !Number.isNaN(Date.parse(v.trial_termina_em))
    ? v.trial_termina_em
    : null;
  if (v.trial_estado === 'active' && !terminaEm) return null;
  // O teto só vale com o SINAL do servidor novo (`limite_conta_nova: true`): o servidor antigo mandava limite_envios=5
  // para todo Grátis, sem limite real — mostrar 'X de 5' ali seria informação falsa.
  // Dois sinais do servidor: conta NOVA (`limite_conta_nova`) e conta ANTIGA já limitada (`limite_conta_antiga`, a partir de D+30).
  const sinalLimite = v.limite_conta_nova === true || v.limite_conta_antiga === true;
  const limite = plano === 'gratis' && sinalLimite && typeof v.limite_envios === 'number' && Number.isSafeInteger(v.limite_envios) && v.limite_envios > 0
    ? v.limite_envios
    : null;
  const restantes = limite !== null && typeof v.envios_restantes === 'number' && Number.isSafeInteger(v.envios_restantes) && v.envios_restantes >= 0
    ? v.envios_restantes
    : null;
  return {
    planoEfetivo: plano,
    enviosUsados: inteiroNaoNegativo(v.envios_usados, 0),
    limiteEnvios: limite,
    enviosRestantes: limite !== null ? restantes : null,
    avisoLimiteAntigas: plano === 'gratis' ? interpretarAvisoAntigas(v.aviso_limite_antigas) : null,
    trialEstado: v.trial_estado as TrialEstado,
    trialTerminaEm: terminaEm,
    trialDias: TRIAL_PRO_DIAS,
    requerCartao: false,
    renovaAutomaticamente: false,
    preservaDados: true,
  };
}

function interpretarAvisoAntigas(valor: unknown): AvisoLimiteAntigas | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const a = valor as Record<string, unknown>;
  if (typeof a.a_partir_de !== 'string' || Number.isNaN(Date.parse(a.a_partir_de))) return null;
  if (typeof a.usados_30d !== 'number' || !Number.isSafeInteger(a.usados_30d) || a.usados_30d < 0) return null;
  return { aPartirDe: a.a_partir_de, usados30d: a.usados_30d };
}

export function interpretarInicioTrial(valor: unknown): InicioTrialPro | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  if (typeof v.iniciado !== 'boolean' || typeof v.replay !== 'boolean') return null;
  if (v.requires_card !== false || v.auto_renews !== false || v.data_disposition !== 'preserve') return null;
  if (v.motivo === 'revisao_caixa') {
    if (v.iniciado !== false || v.replay !== false || v.termina_em != null) return null;
    return { iniciado: false, replay: false, terminaEm: null, motivo: 'revisao_caixa' };
  }
  if (v.motivo != null) return null;
  if (v.trial_dias !== TRIAL_PRO_DIAS || typeof v.termina_em !== 'string' || Number.isNaN(Date.parse(v.termina_em))) return null;
  return { iniciado: v.iniciado, replay: v.replay, terminaEm: v.termina_em, motivo: null };
}

/** Texto honesto quando o botão de teste não inicia. Não diz que a pessoa já usou o teste. */
export function avisoTrialNaoIniciado(inicio: InicioTrialPro | null): { titulo: string; mensagem: string } {
  if (inicio?.motivo === 'revisao_caixa') {
    return {
      titulo: 'Teste em revisão',
      mensagem: 'Esta caixa de e-mail já tem outras contas na OLLI. O teste novo não começa. Seus orçamentos continuam no Grátis e nada foi apagado.',
    };
  }
  return {
    titulo: 'Não foi possível iniciar',
    mensagem: 'Confirme sua conexão e tente novamente. O teste não foi consumido.',
  };
}

/**
 * Interpreta a resposta de `reservar_envio_orcamento_gratis`.
 *
 * Resposta parcial ou inesperada nunca inventa plano, token ou teste — mas também
 * nunca barra o envio: vira `sem_registro`. Um servidor ANTIGO que ainda responda
 * `cota_esgotada` (antes da migration 20261002150000 ser aplicada) também vira
 * `sem_registro`: a cota não existe mais no produto, e quem decide isso é o
 * contrato comercial, não a versão do banco.
 */
export function interpretarReservaEnvio(valor: unknown): ReservaEnvioOrcamento {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return envioSemRegistro();
  const v = valor as Record<string, unknown>;
  const motivo = v.motivo;
  const motivos = new Set(['plano_pago', 'trial_ativo', 'dentro_da_cota']);
  // Única recusa do contrato: limite do Grátis em conta nova (servidor com corte ligado).
  if (v.permitido === false && motivo === 'cota_esgotada') {
    return {
      ...envioSemRegistro(),
      permitido: false,
      usados: inteiroNaoNegativo(v.usados, 0),
      motivo: 'cota_esgotada',
      limiteEnvios: typeof v.limite_envios === 'number' && Number.isSafeInteger(v.limite_envios) && v.limite_envios > 0 ? v.limite_envios : null,
    };
  }
  if (v.permitido !== true || !motivos.has(motivo as string)) return envioSemRegistro();

  const plano: PlanoId = v.plano_efetivo === 'empresa' ? 'empresa' : v.plano_efetivo === 'pro' ? 'pro' : 'gratis';
  const reservaToken = typeof v.reserva_token === 'string' && /^[0-9a-f-]{36}$/i.test(v.reserva_token)
    ? v.reserva_token
    : null;
  const requerConfirmacao = v.requer_confirmacao === true;
  if (requerConfirmacao && !reservaToken) return envioSemRegistro();
  return {
    permitido: true,
    planoEfetivo: plano,
    usados: inteiroNaoNegativo(v.usados, 0),
    contabilizadoAgora: v.contabilizado_agora === true,
    requerConfirmacao,
    reservaToken,
    trialElegivel: v.trial_elegivel === true,
    motivo: motivo as 'plano_pago' | 'trial_ativo' | 'dentro_da_cota',
    limiteEnvios: null,
  };
}

/** O registro do envio falhou: o envio segue, sem token, sem teste, sem inventar plano. */
export function envioSemRegistro(): ReservaEnvioOrcamento {
  return {
    permitido: true,
    planoEfetivo: 'gratis',
    usados: 0,
    contabilizadoAgora: false,
    requerConfirmacao: false,
    reservaToken: null,
    trialElegivel: false,
    motivo: 'sem_registro',
    limiteEnvios: null,
  };
}

export function reservaAmbienteLocal(): ReservaEnvioOrcamento {
  return { ...envioSemRegistro(), motivo: 'ambiente_local' };
}

// ─── Contador "X de 5" (P0-09) ───────────────────────────────────────────────

/** O contador só aparece a partir do 3º envio do mês (antes disso é ruído). */
export const CONTADOR_ENVIOS_A_PARTIR_DE = 3;

export type ContadorEnvios =
  | { mostrar: false }
  | { mostrar: true; usados: number; limite: number; restantes: number; esgotado: boolean; texto: string };

/**
 * Regra PURA do contador: só conta nova do Grátis com teto (`limiteEnvios` do servidor), a
 * partir do 3º envio. Conta antiga (limite nulo), Pro/Empresa e oferta que não carregou
 * (`null`) não mostram nada — o servidor continua sendo quem barra o 6º envio.
 */
export function contadorEnvios(oferta: EstadoOfertaComercial | null): ContadorEnvios {
  if (!oferta || oferta.planoEfetivo !== 'gratis' || oferta.limiteEnvios === null) return { mostrar: false };
  const limite = oferta.limiteEnvios;
  const usados = Math.min(oferta.enviosUsados, limite);
  if (oferta.enviosUsados < CONTADOR_ENVIOS_A_PARTIR_DE) return { mostrar: false };
  const restantes = oferta.enviosRestantes ?? Math.max(0, limite - oferta.enviosUsados);
  const esgotado = restantes <= 0;
  return {
    mostrar: true,
    usados,
    limite,
    restantes,
    esgotado,
    texto: esgotado
      ? `Você usou os ${limite} envios do Grátis deste mês. Eles voltam no próximo mês.`
      : `${usados} de ${limite} envios do Grátis usados neste mês.`,
  };
}

// ─── Aviso às contas ANTIGAS (limite a partir de D+30) ───────────────────────

export type AvisoAntigas =
  | { mostrar: false }
  | { mostrar: true; chave: string; dataBR: string; texto: string };

/** `dd/mm/aaaa` no fuso de Brasília (UTC−3, sem horário de verão), sem depender de Intl. */
function dataBrasilia(iso: string): string {
  const d = new Date(Date.parse(iso) - 3 * 60 * 60 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/**
 * Regra PURA do banner "a partir de {D+30} o Grátis passa a permitir até 5 envios por mês". Só aparece com o sinal do
 * servidor (`avisoLimiteAntigas`) e enquanto o limite ainda não começou; `limite` vem do servidor (nunca fixo aqui).
 * `chave` identifica ESTE aviso (muda se a data mudar) para a dispensa de 1 vez.
 */
export function avisoAntigas(oferta: EstadoOfertaComercial | null, limite: number, agora: Date = new Date()): AvisoAntigas {
  const a = oferta?.avisoLimiteAntigas;
  if (!oferta || oferta.planoEfetivo !== 'gratis' || !a) return { mostrar: false };
  if (Date.parse(a.aPartirDe) <= agora.getTime()) return { mostrar: false };
  const dataBR = dataBrasilia(a.aPartirDe);
  const usou = a.usados30d === 1 ? 'Você usou 1 nos últimos 30 dias.' : `Você usou ${a.usados30d} nos últimos 30 dias.`;
  return {
    mostrar: true,
    chave: `olli:aviso_limite_antigas:${a.aPartirDe}`,
    dataBR,
    texto: `A partir de ${dataBR} o Grátis passa a permitir até ${limite} envios por mês. ${usou}`,
  };
}
