/**
 * "A que horas eu preciso SAIR" — o MIOLO PURO (Fase 1 do lado do app).
 *
 * Este arquivo NÃO importa nada em tempo de execução (só `import type`, que o
 * TypeScript apaga). Isso é de propósito e não é preciosismo: assim `node`
 * consegue executá-lo direto e `scripts/teste-eta-saida-app.ts` prova o
 * comportamento REAL — e não só a presença de um trecho no fonte. Toda decisão
 * que pode fazer o prestador sair na hora errada mora aqui, e por isso mora
 * onde dá para testar de verdade.
 *
 * A Fase 0 (worker) já existe: `POST /eta/saida` em `worker/src/etaSaida.js`,
 * contrato na seção 12.2 de `docs/ENXAME/IDEIA_ETA_TRANSITO.md`.
 *
 * ─── A REGRA DURA (a mesma do worker, repetida aqui porque aqui é onde ela
 *     pode ser quebrada por descuido) ─────────────────────────────────────────
 * NENHUM caminho produz `estado:'ok'` com um número que não veio da Routes API
 * (direto, ou de um cache que veio dela). Não existe "~10 min, pertinho", não
 * existe estimativa por distância, não existe fallback otimista. Errar a hora
 * de sair faz o prestador chegar ATRASADO no cliente — é PIOR do que não ter a
 * função, porque ele confiou. Quando não dá para calcular, o app cai no
 * lembrete fixo de 1h que já existe (`agenda.ts`), que é honesto.
 *
 * ─── TRÊS ESTADOS, sempre (regra da casa `olli-gate-erro-vira-vazio`) ───────
 *   { estado: 'ok', ... }                              → tem número, com carimbo
 *   { estado: 'indisponivel', erro }                   → "não deu pra checar". Ação: esperar.
 *   { estado: 'endereco_insuficiente', qual }          → "não reconheci o endereço". Ação: corrigir.
 * "Não sei" nunca vira "não tem", e nunca vira sucesso. Os dois estados de
 * falha são DIFERENTES porque levam a ações diferentes — confundi-los manda o
 * prestador reescrever um endereço que estava certo.
 */
import type { Agendamento, Cliente, Empresa } from '../types';

// ─── Tipos ─────────────────────────────────────────────────────────────────

/**
 * Decide o SKU na Routes API, e por isso é OBRIGATÓRIO no corpo (o worker
 * recusa sem ele — ver `MODOS` em worker/src/etaSaida.js):
 *   'planejamento' → TRAFFIC_UNAWARE → Essentials (10.000 grátis/mês · US$ 5/1.000)
 *   'confirmacao'  → TRAFFIC_AWARE   → Pro        ( 5.000 grátis/mês · US$ 10/1.000)
 * Preços conferidos em 18/07/2026 (fontes no fim do doc do cluster).
 */
export type ModoSaida = 'planejamento' | 'confirmacao';

export interface SaidaOk {
  estado: 'ok';
  /** Duração da viagem, em minutos. Sempre >= 1 — nunca 0 por acidente. */
  minutos: number;
  /** Duração sem trânsito (só existe no modo 'confirmacao'). */
  minutosSemTransito: number | null;
  distanciaKm: number | null;
  /** A resposta à pergunta do dono: a que horas sair. */
  sairEm: Date;
  chegarEm: Date;
  /** Se sair AGORA, chega a esta hora. É o que salva o caso `atrasado`. */
  sairAgoraChegaEm: Date;
  folgaMin: number;
  /** `true` = a hora de sair já passou. NÃO é um quarto estado: é sucesso com uma verdade desconfortável. */
  atrasado: boolean;
  /** `false` = número calculado SEM trânsito. A UI PRECISA dizer isso (ver `rotuloTransito`). */
  comTransito: boolean;
  /** Quando a Routes API produziu este número. ETA sem carimbo é mentira em potência. */
  calculadoEm: Date;
  /** `true` = veio do cache local (o carimbo continua sendo o do cálculo original). */
  doCache: boolean;
}

export type ResultadoSaida =
  | SaidaOk
  | { estado: 'indisponivel'; erro: string }
  | { estado: 'endereco_insuficiente'; qual: 'origem' | 'destino' | 'ambos' };

/** De onde o prestador sai. `de` existe para a UI poder dizer a premissa em voz alta. */
export interface OrigemVisita {
  endereco: string;
  de: 'visita_anterior' | 'empresa';
}

// ─── Constantes de política ────────────────────────────────────────────────

/**
 * TTL do cache LOCAL de duração, por modo. Espelha `TTL_CACHE_MS` do worker de
 * propósito: o cache do app nunca pode servir algo mais velho do que o worker
 * serviria.
 *  - planejamento (sem trânsito): 30 dias. É a duração da via em fluxo livre;
 *    só muda com obra. 30 e não 7 porque o padrão de ouro do público é o
 *    cliente SEMANAL — com 7 dias a visita semanal cai exatamente na borda e o
 *    cache erra justo o caso que existe para pegar.
 *  - confirmacao (com trânsito): 10 minutos. Servir trânsito de horas atrás
 *    como se fosse o de agora é a versão sofisticada de "erro vira vazio".
 */
export const TTL_CACHE_MS: Record<ModoSaida, number> = {
  planejamento: 30 * 24 * 3600 * 1000,
  confirmacao: 10 * 60 * 1000,
};

/** Acima disto o cálculo é velho o bastante para o carimbo precisar aparecer na cara do usuário. */
export const IDADE_CARIMBO_MS = 3 * 3600 * 1000;

/** O worker recusa chegada a mais de 14 dias — checamos antes para não gastar a ida e volta. */
export const MAX_HORIZONTE_MS = 14 * 24 * 3600 * 1000;

/** Endereço com menos que isso não é endereço; é ruído. Mesmo piso do worker (`resolverPonto`). */
export const MIN_ENDERECO = 5;

// ─── Texto ─────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `14:23` no fuso do aparelho. Mesmo formato que a agenda já usa (`agenda.ts` → `horaTxt`). */
export function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Marcas de acentuação separadas pelo NFD (U+0300..U+036F). Montada por código
 * em vez de escrita como literal porque, escrita direto no fonte, a classe fica
 * INVISÍVEL no editor (são combining marks — grudam no colchete anterior) e o
 * próximo a mexer apaga sem ver. Mesmo cuidado do worker.
 */
const RE_DIACRITICO = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

/**
 * Normaliza endereço para CHAVE DE CACHE. Absorve acento, caixa e pontuação:
 * "Av. São João, 100" e "AV SAO JOAO 100" viram a mesma chave — que é a
 * diferença entre pagar 1 chamada e pagar 2 pelo mesmo trajeto.
 * NÃO absorve abreviação ("Av." ≠ "Avenida"): expandir abreviatura é adivinhar,
 * e adivinhar endereço é como se chega no lugar errado. Fica como cache miss.
 */
export function normalizarEndereco(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(RE_DIACRITICO, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Chave do cache local de duração. Deliberadamente bucketada pela hora da
 * CHEGADA (não da partida, como no worker): antes de chamar, o app sabe a hora
 * marcada da visita, não a hora de sair — que é justamente o que ele está
 * tentando descobrir. É cache do app, só precisa ser consistente consigo mesmo.
 * O tipo de dia entra porque sábado não é terça.
 */
export function chaveTrajeto(p: {
  origem: string;
  destino: string;
  chegarEm: Date;
  modo: ModoSaida;
}): string {
  const tipoDia = p.chegarEm.getDay() === 0 || p.chegarEm.getDay() === 6 ? 'fs' : 'du';
  return [
    p.modo,
    normalizarEndereco(p.origem),
    normalizarEndereco(p.destino),
    `h${p.chegarEm.getHours()}`,
    tipoDia,
  ].join('|');
}

// ─── De onde sai o endereço (seção 3 do doc do cluster) ────────────────────

/**
 * Endereço da EMPRESA como texto geocodificável.
 *
 * Exige RUA. Cidade/UF sozinhas geocodificam para o centroide do município —
 * um ponto que existe, responde `ok` e está a quilômetros de onde o prestador
 * realmente dorme. Isso produziria uma hora de sair errada com cara de certa,
 * que é exatamente o que este cluster não pode fazer. Sem rua → `null`, e o
 * app diz "não reconheci o endereço" em vez de inventar uma origem.
 */
export function enderecoDaEmpresa(e: Empresa | null | undefined): string | null {
  const rua = (e?.endereco ?? '').trim();
  if (rua.length < MIN_ENDERECO) return null;
  const cidade = (e?.cidade ?? '').trim();
  const uf = (e?.estado ?? '').trim();
  const local = cidade && uf ? `${cidade}/${uf}` : cidade || uf;
  return local ? `${rua}, ${local}` : rua;
}

/**
 * Endereço do CLIENTE como texto geocodificável, com o CEP no meio quando
 * existe: CEP é o desambiguador mais forte que existe no Brasil ("Rua São
 * João" existe em centenas de cidades), e `services/cep.ts` (ViaCEP, grátis)
 * já preenche esse campo no cadastro.
 *
 * `complemento` fica DE FORA de propósito: "fundos", "ao lado do mercado" e
 * "casa 2" só atrapalham o geocoder — não desambiguam nada e derrubam a
 * confiança do resultado.
 */
export function enderecoDoCliente(c: Cliente | null | undefined): string | null {
  const rua = (c?.endereco ?? '').trim();
  if (rua.length < MIN_ENDERECO) return null;
  const partes: string[] = [rua];
  const cepDigitos = (c?.cep ?? '').replace(/\D/g, '');
  if (cepDigitos.length === 8) partes.push(`${cepDigitos.slice(0, 5)}-${cepDigitos.slice(5)}`);
  const cidade = (c?.cidade ?? '').trim();
  const uf = (c?.estado ?? '').trim();
  const local = cidade && uf ? `${cidade}/${uf}` : cidade || uf;
  if (local) partes.push(local);
  return partes.join(', ');
}

/**
 * Endereço de destino de um agendamento: o do próprio compromisso (texto livre
 * que o prestador digitou) e, quando ele está vazio, o do cliente cadastrado.
 * Nunca "inventa" a partir do nome do cliente.
 */
export function enderecoDoAgendamento(
  a: Agendamento | null | undefined,
  clientes: readonly Cliente[] = [],
): string | null {
  const proprio = (a?.endereco ?? '').trim();
  if (proprio.length >= MIN_ENDERECO) return proprio;
  if (!a?.clienteId) return null;
  const c = clientes.find((x) => x.id === a.clienteId);
  return enderecoDoCliente(c);
}

/**
 * DE ONDE o prestador sai para a visita `alvo` — sem GPS, sem permissão nova,
 * sem prebuild (Desenho A da seção 5 do doc): a visita ANTERIOR do mesmo dia,
 * ou o endereço da empresa quando `alvo` é a primeira do dia.
 *
 * Por que não a localização do aparelho: se são 7h e a visita é às 15h, onde o
 * celular está AGORA não diz nada sobre de onde ele sai às 14h20. A origem
 * certa é cadastro, não GPS — e cadastro o app já tem.
 *
 * O RAMO QUE PARECE UM DETALHE E NÃO É: quando existe visita anterior mas o
 * endereço dela é inutilizável, a resposta é `null` — NÃO cai para o endereço
 * da empresa. Cair seria calcular a partir de um lugar de onde ele
 * comprovadamente não vai sair, e devolver essa hora com a mesma cara de
 * certeza da hora certa. Melhor dizer "não reconheci o endereço" e deixar o
 * lembrete fixo de 1h valer.
 */
export function origemParaVisita(
  alvo: Agendamento | null | undefined,
  doDia: readonly Agendamento[],
  empresa: Empresa | null | undefined,
  clientes: readonly Cliente[] = [],
): OrigemVisita | null {
  if (!alvo) return null;
  const iniAlvo = Date.parse(alvo.inicio);
  if (!Number.isFinite(iniAlvo)) return null;

  let anterior: Agendamento | null = null;
  let iniAnterior = -Infinity;
  for (const a of doDia) {
    if (a.id === alvo.id || a.status === 'cancelado') continue;
    const ini = Date.parse(a.inicio);
    if (!Number.isFinite(ini) || ini >= iniAlvo) continue;
    if (ini > iniAnterior) {
      anterior = a;
      iniAnterior = ini;
    }
  }

  if (anterior) {
    const endereco = enderecoDoAgendamento(anterior, clientes);
    return endereco ? { endereco, de: 'visita_anterior' } : null;
  }

  const daEmpresa = enderecoDaEmpresa(empresa);
  return daEmpresa ? { endereco: daEmpresa, de: 'empresa' } : null;
}

// ─── Interpretação da resposta do worker ───────────────────────────────────

/** O que o cache local guarda. Só o que veio da Routes API — nada derivado de "agora". */
export interface DuracaoCacheada {
  minutos: number;
  minutosSemTransito: number | null;
  distanciaKm: number | null;
  /**
   * A folga que o WORKER escolheu (`max(5 min, 12% da duração)`). Guardada em
   * vez de recalculada no app de propósito: reimplementar a fórmula aqui cria
   * duas fontes da verdade que divergem no dia em que uma das duas mudar, e a
   * divergência apareceria como uma hora de sair diferente da que o worker
   * mandou — sem ninguém perceber.
   */
  folgaMin: number;
  comTransito: boolean;
  /** ISO do momento em que a Routes API produziu o número. */
  calculadoEm: string;
}

function numeroFinito(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Monta o `SaidaOk` a partir de uma duração (fresca ou de cache) e do horário
 * de chegada desejado. Tudo que depende de "agora" (`sairAgoraChegaEm`,
 * `atrasado`) é calculado AGORA e nunca cacheado — senão um valor guardado às
 * 08h diria às 14h que a chegada é 08h32.
 */
export function montarSaida(
  d: DuracaoCacheada,
  chegarEm: Date,
  agora: Date,
  doCache: boolean,
): SaidaOk | { estado: 'indisponivel'; erro: string } {
  const minutos = numeroFinito(d.minutos);
  const folgaMin = numeroFinito(d.folgaMin);
  const calculadoMs = Date.parse(d.calculadoEm);
  // Duração ilegível NUNCA vira 0 nem vira "chegou". Vira "não sei".
  if (minutos === null || minutos <= 0 || folgaMin === null || folgaMin < 0 || !Number.isFinite(calculadoMs)) {
    return { estado: 'indisponivel', erro: 'resposta_ilegivel' };
  }
  const sairEmMs = chegarEm.getTime() - minutos * 60_000 - folgaMin * 60_000;
  return {
    estado: 'ok',
    minutos,
    minutosSemTransito: numeroFinito(d.minutosSemTransito),
    distanciaKm: numeroFinito(d.distanciaKm),
    sairEm: new Date(sairEmMs),
    chegarEm: new Date(chegarEm.getTime()),
    sairAgoraChegaEm: new Date(agora.getTime() + minutos * 60_000),
    folgaMin,
    atrasado: sairEmMs < agora.getTime(),
    comTransito: d.comTransito === true,
    calculadoEm: new Date(calculadoMs),
    doCache,
  };
}

/**
 * Traduz o corpo devolvido pelo `POST /eta/saida` nos 3 estados do app.
 *
 * ESTE É O PONTO EM QUE UM ETA CHUTADO NASCERIA. Por isso a ordem é: só existe
 * `ok` quando o corpo diz `ok:true` E `estado:'ok'` E traz uma duração
 * numérica utilizável. Qualquer outra combinação — incluindo um corpo vazio,
 * um HTML de proxy, um `ok:true` sem número — cai em `indisponivel`. E
 * `endereco_insuficiente` NUNCA é achatado em `indisponivel`: são ações
 * diferentes (corrigir endereço vs. esperar).
 *
 * `status` é o HTTP. O worker responde os três estados com corpo JSON mesmo em
 * 400/401/429, então o corpo manda quando é legível; o status só decide quando
 * não há corpo que preste.
 */
export function interpretarResposta(
  corpo: unknown,
  status: number,
  chegarEm: Date,
  agora: Date,
): { resultado: ResultadoSaida; cachear: DuracaoCacheada | null } {
  const c = (corpo ?? {}) as Record<string, unknown>;

  if (c.estado === 'endereco_insuficiente') {
    const qual = c.qual === 'origem' || c.qual === 'destino' ? c.qual : 'ambos';
    return { resultado: { estado: 'endereco_insuficiente', qual }, cachear: null };
  }

  if (c.ok === true && c.estado === 'ok') {
    const duracao: DuracaoCacheada = {
      minutos: numeroFinito(c.minutos) ?? 0,
      minutosSemTransito: numeroFinito(c.minutosSemTransito),
      distanciaKm: numeroFinito(c.distanciaKm),
      folgaMin: numeroFinito(c.folgaMin) ?? -1,
      comTransito: c.comTransito === true,
      calculadoEm: typeof c.calculadoEm === 'string' ? c.calculadoEm : '',
    };
    const montado = montarSaida(duracao, chegarEm, agora, false);
    // Sucesso "vazio" (sem número legível) é falha, não sucesso: não cacheia.
    if (montado.estado !== 'ok') return { resultado: montado, cachear: null };
    return { resultado: montado, cachear: duracao };
  }

  const erro = typeof c.erro === 'string' && c.erro ? c.erro : `http_${status}`;
  return { resultado: { estado: 'indisponivel', erro }, cachear: null };
}

/** O cache expirou? Fora da janela (ou com carimbo do futuro) → miss, e paga-se de novo. */
export function cacheValido(calculadoEm: string, modo: ModoSaida, agora: Date): boolean {
  const ms = Date.parse(calculadoEm);
  if (!Number.isFinite(ms)) return false;
  const idade = agora.getTime() - ms;
  return idade >= 0 && idade <= TTL_CACHE_MS[modo];
}

// ─── Copy (derivada da fonte, nunca de memória) ────────────────────────────

/**
 * Rótulo honesto do que o número é. O modo 'planejamento' custa metade e tem o
 * dobro de franquia porque NÃO olha o trânsito — e o prestador precisa saber
 * disso antes de confiar num "saia às 08h25" de São Paulo.
 */
export function rotuloTransito(r: SaidaOk): string {
  return r.comTransito ? 'com trânsito' : 'sem trânsito';
}

/**
 * Carimbo curto do cálculo. Vazio quando o número é fresco (< 3h) — poluir
 * toda linha com "calculado às 14:02" treina o olho a ignorar o carimbo justo
 * quando ele importa. Acima de 3h, ele aparece: um ETA de 6 horas atrás
 * apresentado como atual é a forma sofisticada de "erro vira vazio".
 */
export function carimboCurto(calculadoEm: Date, agora: Date): string {
  const idade = agora.getTime() - calculadoEm.getTime();
  if (!Number.isFinite(idade) || idade < IDADE_CARIMBO_MS) return '';
  const mesmoDia =
    calculadoEm.getFullYear() === agora.getFullYear() &&
    calculadoEm.getMonth() === agora.getMonth() &&
    calculadoEm.getDate() === agora.getDate();
  return mesmoDia
    ? `calculado às ${hhmm(calculadoEm)}`
    : `calculado ${pad2(calculadoEm.getDate())}/${pad2(calculadoEm.getMonth() + 1)}`;
}

/**
 * A frase que o dono pediu, em uma linha: "saia às 14:23 para chegar às 15:00".
 * Quando a hora de sair já passou, a frase muda de tempo verbal em vez de
 * mostrar um horário no passado sem contexto — e ganha a chegada real se sair
 * agora, que é a informação acionável nesse momento.
 */
export function fraseSaida(r: SaidaOk, agora: Date): string {
  if (r.atrasado) {
    return `Era para sair às ${hhmm(r.sairEm)} · saindo agora você chega ${hhmm(r.sairAgoraChegaEm)}`;
  }
  const carimbo = carimboCurto(r.calculadoEm, agora);
  const base = `Saia às ${hhmm(r.sairEm)} para chegar às ${hhmm(r.chegarEm)}`;
  const detalhe = `${r.minutos} min ${rotuloTransito(r)}`;
  return carimbo ? `${base} · ${detalhe} · ${carimbo}` : `${base} · ${detalhe}`;
}

/**
 * Texto da notificação "hora de sair" (o Toque 2 da seção 2 do doc). Só é
 * chamada com `estado:'ok'` — não existe versão desta notificação sem número.
 */
export function textoNotificacaoSaida(
  r: SaidaOk,
  a: Pick<Agendamento, 'clienteNome' | 'titulo'>,
  agora: Date,
): { titulo: string; corpo: string } {
  const quem = (a.clienteNome || a.titulo || '').trim();
  const carimbo = carimboCurto(r.calculadoEm, agora);
  const pedacos = [
    quem ? `${quem} às ${hhmm(r.chegarEm)}` : `Chegada às ${hhmm(r.chegarEm)}`,
    `${r.minutos} min ${rotuloTransito(r)}`,
  ];
  if (carimbo) pedacos.push(carimbo);
  return { titulo: `Saia às ${hhmm(r.sairEm)}`, corpo: pedacos.join(' · ') };
}

/**
 * A linha que o "Bom dia da OLLI" ganha (Toque 1). Devolve `null` quando não há
 * número — e aí o "Bom dia" sai EXATAMENTE como já saía hoje (cliente,
 * horário, endereço). Falha de trânsito não pode piorar uma notificação que já
 * funciona, e muito menos inventar um horário dentro dela.
 */
export function linhaBomDiaSaida(r: ResultadoSaida | null, agora: Date): string | null {
  if (!r || r.estado !== 'ok' || r.atrasado) return null;
  return `saia às ${hhmm(r.sairEm)} (${r.minutos} min, ${rotuloTransito(r)})`;
}

/**
 * O que a tela diz quando o endereço não dá para geocodificar. Mora aqui, e não
 * no componente, por dois motivos: é lógica (o texto MUDA conforme `qual`), e
 * aqui dá para testar de verdade — num `.tsx` que importa React Native, o
 * `node` não consegue entrar, e a regra viraria só uma busca de string.
 *
 * Dizer QUAL endereço é o ponto inteiro. Um "endereço inválido" genérico faz o
 * prestador abrir o cadastro do cliente quando o problema estava no endereço da
 * própria empresa — ele mexe no que estava certo e o erro continua lá.
 */
/**
 * O que a tela diz quando NÃO deu para checar o trânsito (offline, worker fora,
 * cota). Duas versões, e a diferença não é estilo — é fato: assim que um
 * cálculo dá certo, o aviso calculado SUBSTITUI o lembrete fixo de 1h
 * (`avisoSaida.ts` → `substituirLembreteFixo`). A partir daí, dizer "vale o
 * lembrete de 1h antes" seria apontar para um lembrete que não existe mais.
 *
 * `avisoAgendado` = ainda há um aviso calculado na fila (o cálculo de agora
 * falhou, mas o anterior sobreviveu de propósito — ver o comentário do
 * cancelamento em `avisoSaida.ts`).
 */
export function textoIndisponivel(avisoAgendado: boolean): string {
  return avisoAgendado
    ? 'Não deu para checar o trânsito agora. Vale o horário calculado antes.'
    : 'Não deu para checar o trânsito agora. Vale o lembrete de 1h antes.';
}

export function textoEnderecoInsuficiente(qual: 'origem' | 'destino' | 'ambos'): string {
  if (qual === 'destino') return 'Não reconheci o endereço desta visita. Confira no agendamento.';
  if (qual === 'origem') {
    return 'Não sei de onde você sai. Confira o endereço da visita anterior — ou o do seu cadastro, se esta for a primeira do dia.';
  }
  return 'Não reconheci nem o endereço de saída nem o de chegada. Confira os dois.';
}

/**
 * JANELA de chegada para avisar o CLIENTE (item 7.2a do doc). "Chego às 15:00"
 * é uma promessa exata que o trânsito quebra; "chego entre 14:50 e 15:10" é
 * mais honesto e mais fácil de cumprir — e é a diferença entre o cliente achar
 * que o prestador atrasou e o cliente achar que ele avisou.
 *
 * Meia-largura: 15% da viagem, com piso de 5 e teto de 20 min. Viagem curta
 * ganha janela curta (uma janela de 20 min para 10 min de viagem é inútil);
 * viagem longa não vira uma janela de uma hora, que não é promessa nenhuma.
 */
export function janelaChegada(chegada: Date, minutos: number): { de: Date; ate: Date } | null {
  const m = numeroFinito(minutos);
  const base = chegada?.getTime?.();
  if (m === null || m <= 0 || !Number.isFinite(base)) return null;
  const meia = Math.min(20, Math.max(5, Math.round(m * 0.15)));
  return { de: new Date(base - meia * 60_000), ate: new Date(base + meia * 60_000) };
}
