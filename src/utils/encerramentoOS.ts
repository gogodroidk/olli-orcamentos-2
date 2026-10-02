/**
 * ENCERRAMENTO EM 60 SEGUNDOS (jogada B5 do plano OLLI Inteligente) — a parte PURA.
 *
 * Um fluxo único na OS, "Encerrar atendimento", que fecha a visita na casa do
 * cliente: fotos do depois → assinatura do cliente → cobrança (Pix na tela) →
 * recibo → próxima visita → pedido de avaliação. CADA passo é pulável e o
 * progresso é gravado na própria OS a cada toque (SQLite primeiro, nuvem depois):
 * sem sinal nada se perde, e se o Android matar o app o fluxo volta de onde parou.
 *
 * Por que a cobrança vem ANTES do recibo: recibo é a prova de que o dinheiro
 * ENTROU. Gerar recibo antes do pagamento seria um documento dizendo algo que não
 * aconteceu. O recibo nasce do pagamento registrado (pagamentos.registrarPagamento).
 *
 * Aqui ficam: os passos, o estado de cada um (pendente | feito | pulado), o
 * progresso, a leitura tolerante do que veio do banco, a data sugerida da próxima
 * manutenção e o Pix estático montado no aparelho (fail-closed: chave duvidosa =
 * sem QR, nunca um QR quebrado).
 *
 * Sem import de React Native: roda em `scripts/teste-encerramento-os.ts`.
 */
import { gerarPixCopiaECola, normalizarChavePix, pixCopiaEColaValido } from './pixBrCode.ts';
import { somarMeses } from './posVenda.ts';

export const PASSOS_ENCERRAMENTO = [
  'fotos',
  'assinatura',
  'cobranca',
  'recibo',
  'proxima_visita',
  'avaliacao',
] as const;

export type PassoEncerramento = (typeof PASSOS_ENCERRAMENTO)[number];

export type EstadoPasso = 'pendente' | 'feito' | 'pulado';

export interface RegistroPasso {
  estado: 'feito' | 'pulado';
  /** ISO de quando o passo foi resolvido. */
  em: string;
}

/**
 * O encerramento gravado na OS (coluna `encerramento`: TEXT JSON no SQLite,
 * jsonb na nuvem — migration 20261003102000). Tudo opcional e aditivo.
 */
export interface EncerramentoOS {
  iniciadoEm: string;
  passos: Partial<Record<PassoEncerramento, RegistroPasso>>;
  /** Assinatura do cliente (data URI PNG gerado no aparelho, sem rede). */
  assinaturaClienteUri?: string;
  assinaturaEm?: string;
  assinanteNome?: string;
  /** Recibo nascido do pagamento registrado neste encerramento. */
  reciboId?: string;
  /** Agendamento da próxima visita criado aqui. */
  proximaVisitaId?: string;
  proximaVisitaEm?: string;
  /** ISO de quando o prestador tocou "Concluir atendimento". */
  finalizadoEm?: string;
}

export interface InfoPasso {
  titulo: string;
  /** O que o passo faz, em 1 frase (a explicação curta da primeira vez). */
  descricao: string;
  icone: string;
}

export const INFO_PASSO: Record<PassoEncerramento, InfoPasso> = {
  fotos: {
    titulo: 'Fotos do depois',
    descricao: 'Mostre o serviço pronto. Sem sinal, as fotos ficam no aparelho e sobem sozinhas.',
    icone: 'camera-outline',
  },
  assinatura: {
    titulo: 'Assinatura do cliente',
    descricao: 'O cliente assina com o dedo: comprova que o serviço foi feito.',
    icone: 'draw',
  },
  cobranca: {
    titulo: 'Cobrança',
    descricao: 'O Pix aparece na tela com o valor certo. Só marque como pago quando o dinheiro cair no banco.',
    icone: 'qrcode',
  },
  recibo: {
    titulo: 'Recibo',
    descricao: 'Sai do pagamento registrado, com a sua marca, pronto para mandar.',
    icone: 'receipt',
  },
  proxima_visita: {
    titulo: 'Próxima visita',
    descricao: 'Deixe a próxima manutenção marcada antes de ir embora.',
    icone: 'calendar-refresh-outline',
  },
  avaliacao: {
    titulo: 'Pedir avaliação',
    descricao: 'O cliente está satisfeito agora: é a melhor hora de pedir a avaliação no Google.',
    icone: 'star-outline',
  },
};

const PASSOS_SET: ReadonlySet<string> = new Set(PASSOS_ENCERRAMENTO);

function isoValido(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && Number.isFinite(new Date(v).getTime());
}

function textoOuNada(v: unknown, max = 200): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/** Um encerramento novo, começando agora. */
export function iniciarEncerramento(agora: Date = new Date()): EncerramentoOS {
  return { iniciadoEm: agora.toISOString(), passos: {} };
}

/**
 * Lê o que veio do banco (TEXT JSON local, objeto jsonb da nuvem ou lixo).
 * Nunca lança. Formato irreconhecível → `undefined` ("não há encerramento"),
 * e um passo inválido some sozinho sem derrubar os válidos.
 */
export function lerEncerramento(bruto: unknown): EncerramentoOS | undefined {
  let v: unknown = bruto;
  if (typeof v === 'string') {
    if (!v.trim()) return undefined;
    try { v = JSON.parse(v); } catch { return undefined; }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (!isoValido(o.iniciadoEm)) return undefined;
  const passos: EncerramentoOS['passos'] = {};
  if (o.passos && typeof o.passos === 'object' && !Array.isArray(o.passos)) {
    for (const [k, reg] of Object.entries(o.passos as Record<string, unknown>)) {
      if (!PASSOS_SET.has(k) || !reg || typeof reg !== 'object') continue;
      const r = reg as Record<string, unknown>;
      if ((r.estado === 'feito' || r.estado === 'pulado') && isoValido(r.em)) {
        passos[k as PassoEncerramento] = { estado: r.estado, em: r.em };
      }
    }
  }
  const assinatura = typeof o.assinaturaClienteUri === 'string' && o.assinaturaClienteUri.startsWith('data:image/')
    ? o.assinaturaClienteUri
    : undefined;
  return {
    iniciadoEm: o.iniciadoEm,
    passos,
    ...(assinatura ? { assinaturaClienteUri: assinatura } : {}),
    ...(isoValido(o.assinaturaEm) ? { assinaturaEm: o.assinaturaEm } : {}),
    ...(textoOuNada(o.assinanteNome, 160) ? { assinanteNome: textoOuNada(o.assinanteNome, 160) } : {}),
    ...(textoOuNada(o.reciboId, 80) ? { reciboId: textoOuNada(o.reciboId, 80) } : {}),
    ...(textoOuNada(o.proximaVisitaId, 80) ? { proximaVisitaId: textoOuNada(o.proximaVisitaId, 80) } : {}),
    ...(isoValido(o.proximaVisitaEm) ? { proximaVisitaEm: o.proximaVisitaEm } : {}),
    ...(isoValido(o.finalizadoEm) ? { finalizadoEm: o.finalizadoEm } : {}),
  };
}

/** Estado de um passo (ausente = pendente). */
export function estadoDoPasso(enc: EncerramentoOS | null | undefined, passo: PassoEncerramento): EstadoPasso {
  return enc?.passos?.[passo]?.estado ?? 'pendente';
}

/** Novo encerramento com o passo resolvido (imutável). `extra` grava os campos ligados ao passo. */
export function marcarPasso(
  enc: EncerramentoOS,
  passo: PassoEncerramento,
  estado: 'feito' | 'pulado',
  agora: Date = new Date(),
  extra: Partial<Omit<EncerramentoOS, 'passos' | 'iniciadoEm'>> = {},
): EncerramentoOS {
  return {
    ...enc,
    ...extra,
    passos: { ...enc.passos, [passo]: { estado, em: agora.toISOString() } },
  };
}

/** Volta um passo para pendente ("refazer"). Os campos já gravados (assinatura, recibo) ficam. */
export function reabrirPasso(enc: EncerramentoOS, passo: PassoEncerramento): EncerramentoOS {
  const passos = { ...enc.passos };
  delete passos[passo];
  return { ...enc, passos };
}

/** O primeiro passo ainda pendente, na ordem do trabalho; `null` = todos resolvidos. */
export function proximoPasso(enc: EncerramentoOS | null | undefined): PassoEncerramento | null {
  return PASSOS_ENCERRAMENTO.find((p) => estadoDoPasso(enc, p) === 'pendente') ?? null;
}

export interface Progresso {
  resolvidos: number;
  feitos: number;
  pulados: number;
  total: number;
  /** 0..1, para a barra. */
  fracao: number;
}

export function progressoEncerramento(enc: EncerramentoOS | null | undefined): Progresso {
  const total = PASSOS_ENCERRAMENTO.length;
  let feitos = 0;
  let pulados = 0;
  for (const p of PASSOS_ENCERRAMENTO) {
    const e = estadoDoPasso(enc, p);
    if (e === 'feito') feitos += 1;
    else if (e === 'pulado') pulados += 1;
  }
  const resolvidos = feitos + pulados;
  return { resolvidos, feitos, pulados, total, fracao: total ? resolvidos / total : 0 };
}

/** Rótulo do botão da OS conforme o encerramento. */
export function rotuloBotaoEncerrar(enc: EncerramentoOS | null | undefined): string {
  if (enc?.finalizadoEm) return 'Atendimento encerrado';
  if (!enc) return 'Encerrar atendimento';
  const { resolvidos, total } = progressoEncerramento(enc);
  return `Continuar encerramento · ${resolvidos} de ${total}`;
}

// ─── Próxima visita ──────────────────────────────────────────────────────────

/** Opções de intervalo que a tela oferece (meses). */
export const INTERVALOS_RETORNO = [1, 3, 6, 12] as const;

/**
 * Data sugerida da próxima visita: `meses` depois de `base`, às 9h (hora local),
 * empurrando domingo para segunda. Devolve ISO.
 */
export function sugerirProximaVisita(base: Date, meses: number): string {
  const m = Number.isFinite(meses) && meses > 0 ? Math.min(Math.floor(meses), 36) : 6;
  const d = new Date(somarMeses(base.getTime(), m));
  d.setHours(9, 0, 0, 0);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** "15/04/2027" no fuso do aparelho. */
export function dataCurtaBR(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Cobrança (Pix estático no aparelho) ─────────────────────────────────────

export type SituacaoPixEncerramento = 'com_pix' | 'sem_chave' | 'chave_invalida' | 'sem_valor';

export interface PixEncerramento {
  situacao: SituacaoPixEncerramento;
  /** Pix Copia e Cola; '' quando não é 'com_pix'. */
  codigo: string;
  valor: number;
}

/**
 * Pix Copia e Cola do encerramento. Fail-closed em dinheiro: só sai código quando
 * a chave foi RECONHECIDA e o código passou na conferência EMV + CRC. É o Pix do
 * PRESTADOR (o cliente dele paga o serviço físico) — não é venda de plano do app,
 * então vale igual no APK da Play e no iOS.
 */
export function pixDoEncerramento(entrada: {
  chavePix: string | null | undefined;
  valor: number | null | undefined;
  nome?: string | null;
  cidade?: string | null;
  referencia?: string | null;
}): PixEncerramento {
  const valor = typeof entrada.valor === 'number' && Number.isFinite(entrada.valor) && entrada.valor > 0
    ? Math.round(entrada.valor * 100) / 100
    : 0;
  const bruta = (entrada.chavePix ?? '').trim();
  if (!bruta) return { situacao: 'sem_chave', codigo: '', valor };
  const chave = normalizarChavePix(bruta);
  if (!chave) return { situacao: 'chave_invalida', codigo: '', valor };
  if (valor <= 0) return { situacao: 'sem_valor', codigo: '', valor };
  const codigo = gerarPixCopiaECola({
    chave: chave.chave,
    valor,
    nome: entrada.nome ?? '',
    cidade: entrada.cidade ?? '',
    txid: entrada.referencia ?? undefined,
  });
  if (!pixCopiaEColaValido(codigo)) return { situacao: 'chave_invalida', codigo: '', valor };
  return { situacao: 'com_pix', codigo, valor };
}

/** Mensagem de cobrança para o WhatsApp (o prestador revisa e envia). */
export function mensagemCobrancaEncerramento(entrada: {
  clienteNome: string;
  titulo: string;
  valorFormatado: string;
  pix?: string;
}): string {
  const primeiro = (entrada.clienteNome ?? '').trim().split(/\s+/)[0] || 'tudo bem';
  const linhas = [
    `Oi, ${primeiro}! Serviço concluído: ${entrada.titulo.trim() || 'atendimento'}.`,
    `Valor: ${entrada.valorFormatado}.`,
  ];
  if (entrada.pix) {
    linhas.push('Pix copia e cola (é só colar no app do banco):');
    linhas.push(entrada.pix);
  }
  linhas.push('Qualquer dúvida, é só me chamar.');
  return linhas.join('\n');
}

/** Resumo do atendimento para mandar ao cliente no final (só o que de fato aconteceu). */
export function mensagemResumoAtendimento(entrada: {
  clienteNome: string;
  titulo: string;
  fotos: number;
  enc: EncerramentoOS;
}): string {
  const primeiro = (entrada.clienteNome ?? '').trim().split(/\s+/)[0] || 'tudo bem';
  const linhas = [`Oi, ${primeiro}! Resumo do atendimento de hoje: ${entrada.titulo.trim() || 'serviço'}.`];
  if (entrada.fotos > 0) linhas.push(`Registrei ${entrada.fotos} foto${entrada.fotos === 1 ? '' : 's'} do serviço.`);
  if (entrada.enc.assinaturaClienteUri) linhas.push('O serviço ficou assinado por você no meu aparelho.');
  if (entrada.enc.proximaVisitaEm) linhas.push(`Próxima visita marcada para ${dataCurtaBR(entrada.enc.proximaVisitaEm)}.`);
  linhas.push('Obrigado pela confiança!');
  return linhas.join('\n');
}
