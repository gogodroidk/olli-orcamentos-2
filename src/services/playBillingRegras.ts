/**
 * ASSINATURA PELA GOOGLE PLAY (Play Billing direto, via `expo-iap`) — as REGRAS,
 * sem nenhum import nativo.
 *
 * Por que um módulo puro separado: as mesmas regras servem a quatro lugares que
 * não podem divergir —
 *  - o app Android (`playBilling.android.ts`, que fala com a Play Billing Library,
 *    e a PlanosScreen, que decide o que mostrar);
 *  - o worker (`worker/src/play.js`), que consulta a Google Play Developer API e
 *    precisa saber QUAL plano cada produto da Play é (`produtoPlay`);
 *  - o painel web (alias `@play-billing-regras`, só `urlGerenciarNaPlay`);
 *  - os testes (`scripts/teste-play-billing.ts`), que rodam no Node sem subir tela.
 * Se o catálogo de produtos morasse em dois arquivos, um dia o app venderia um
 * produto que o worker não reconhece — o cliente pagaria e o plano não ligaria.
 *
 * ═══ NUNCA MODO DEMO ═══
 * Ordem permanente do dono: ou funciona de verdade, ou fica DESLIGADO dizendo que
 * está desligado. A venda só existe com as QUATRO condições: Android, build nativo
 * (fora do Expo Go), módulo nativo do `expo-iap` presente no binário e o SERVIDOR
 * dizendo `ligado: true` em `GET /play/config` (a chave `PLAY_BILLING_MODE` do
 * worker). Sem qualquer uma, a tela informa que a assinatura pelo app está
 * indisponível — nunca simula compra.
 *
 * ═══ PREÇO VEM DA LOJA ═══
 * Na Play quem cobra é o Google, no valor cadastrado no Play Console. O app mostra
 * o preço que a própria loja devolve — nunca um número digitado aqui nem o de
 * `precosPlanos.ts` (que é o preço da web). Sem preço da loja, sem botão.
 *
 * ═══ QUEM LIBERA É O SERVIDOR ═══
 * A compra concluída na folha da Play só vira plano depois que o worker confere o
 * token na Google Play Developer API (`POST /play/verificar`). As funções
 * `interpretar*` abaixo traduzem as respostas dele em 3+ estados — erro nunca vira
 * "não pago" nem "liberado".
 */

export type PlanoPlay = 'pro' | 'empresa';
export type PeriodoPlay = 'mensal' | 'anual';

export interface ProdutoPlay {
  plano: PlanoPlay;
  periodo: PeriodoPlay;
}

/**
 * Assinaturas cadastradas no Play Console (docs/GOOGLE_PLAY_BILLING.md §1): uma
 * por plano, cada uma com dois PLANOS BÁSICOS (`mensal` e `anual`). O id lógico de
 * produto usado no app, no worker e na coluna `revenuecat_produto_id` é
 * `<assinatura>:<plano básico>` (`olli_pro:mensal`); na API do Google são dois
 * campos separados (`productId` + `basePlanId`), juntados aqui.
 */
export const ASSINATURA_PLAY_POR_PLANO: Readonly<Record<PlanoPlay, string>> = Object.freeze({
  pro: 'olli_pro',
  empresa: 'olli_empresa',
});

/** Os SKUs de assinatura que o app pede à loja (`fetchProducts`). */
export const SKUS_PLAY: readonly string[] = Object.freeze(Object.values(ASSINATURA_PLAY_POR_PLANO));

/** Identificador lógico de produto de cada combinação plano × período. */
export function idProdutoPlay(plano: PlanoPlay, periodo: PeriodoPlay): string {
  return `${ASSINATURA_PLAY_POR_PLANO[plano]}:${periodo}`;
}

/**
 * Traduz um identificador de produto da Play no plano que ele libera.
 * `null` = produto desconhecido — e desconhecido NÃO libera nada (fail-closed).
 *
 * Aceita o formato completo (`olli_pro:mensal`) e, para o NÍVEL do plano, também
 * só a assinatura (`olli_pro`): uma compra restaurada pode vir sem o plano básico.
 * Nesse caso o período fica desconhecido, o que não importa ao worker — a vigência
 * vem do `expiryTime` que a API do Google devolve.
 */
export function produtoPlay(id: unknown): (ProdutoPlay & { periodoConhecido: boolean }) | null {
  if (typeof id !== 'string') return null;
  const [assinatura, planoBasico, ...resto] = id.trim().split(':');
  if (resto.length > 0 || !assinatura) return null;
  const plano = (Object.keys(ASSINATURA_PLAY_POR_PLANO) as PlanoPlay[]).find(
    (p) => ASSINATURA_PLAY_POR_PLANO[p] === assinatura,
  );
  if (!plano) return null;
  if (planoBasico === undefined) return { plano, periodo: 'mensal', periodoConhecido: false };
  if (planoBasico !== 'mensal' && planoBasico !== 'anual') return null;
  return { plano, periodo: planoBasico, periodoConhecido: true };
}

export type EstadoPlayBilling =
  | 'ligado'
  | 'desligado_plataforma'
  | 'desligado_expo_go'
  | 'desligado_sem_modulo';

/**
 * Este BINÁRIO consegue vender pela Play? Só com as três condições de build:
 * Android, fora do Expo Go e com o módulo nativo do `expo-iap` compilado. iOS
 * continua sem compra (não há StoreKit — Guideline 3.1.1) e a web vende pelo
 * checkout que já tem. 'ligado' aqui ainda NÃO é venda: falta o servidor dizer
 * que a venda está ligada (`interpretarConfigPlay`).
 */
export function estadoPlayBilling(entrada: { plataforma: string; emExpoGo: boolean; moduloNativo: boolean }): EstadoPlayBilling {
  if (entrada.plataforma !== 'android') return 'desligado_plataforma';
  if (entrada.emExpoGo) return 'desligado_expo_go';
  if (!entrada.moduloNativo) return 'desligado_sem_modulo';
  return 'ligado';
}

/** Venda pela Play no servidor (`GET /play/config`): 3 estados, nunca 2. */
export type ConfigPlay = 'ligada' | 'desligada' | 'erro';

/**
 * Lê a resposta de `GET /play/config` (`{ ligado: boolean }`). Só `ligado === true`
 * com HTTP 2xx liga; `ligado === false` é "desligada de propósito" (kill switch
 * `PLAY_BILLING_MODE=off`); qualquer outra coisa — rede, 5xx, corpo estranho — é
 * 'erro' ("não sei"), que a tela trata com "Tentar de novo", nunca como venda.
 */
export function interpretarConfigPlay(status: number | null, corpo: unknown): ConfigPlay {
  if (status === null || status < 200 || status >= 300) return 'erro';
  const ligado = (corpo as { ligado?: unknown } | null)?.ligado;
  if (ligado === true) return 'ligada';
  if (ligado === false) return 'desligada';
  return 'erro';
}

/**
 * Resultado de `POST /play/verificar`:
 *  - 'ok'          → o servidor conferiu o token na Google e gravou o plano;
 *  - 'outra_conta' → 409: o token já está ligado a OUTRA conta OLLI;
 *  - 'sem_login'   → 401: sessão vencida — entrar de novo e restaurar;
 *  - 'recusada'    → outro 4xx: o servidor olhou e NÃO libera (produto fora do
 *                    catálogo, compra de outra conta, teste não permitido…). Não
 *                    adianta repetir; a compra fica sem `finishTransaction`;
 *  - 'erro'        → rede, 429 ou 5xx: "não sei". Tenta de novo depois (ao voltar
 *                    ao app, no "Restaurar compras").
 */
export type ResultadoVerificacaoPlay =
  | { estado: 'ok'; plano: PlanoPlay; vigenteAte: string | null }
  | { estado: 'outra_conta' }
  | { estado: 'sem_login' }
  | { estado: 'recusada'; erro: string | null }
  | { estado: 'erro' };

export function interpretarVerificacaoPlay(status: number | null, corpo: unknown): ResultadoVerificacaoPlay {
  if (status === null) return { estado: 'erro' };
  const c = (corpo ?? {}) as { ok?: unknown; plano?: unknown; vigenteAte?: unknown; erro?: unknown };
  if (status >= 200 && status < 300) {
    if (c.ok === true && (c.plano === 'pro' || c.plano === 'empresa')) {
      return { estado: 'ok', plano: c.plano, vigenteAte: typeof c.vigenteAte === 'string' ? c.vigenteAte : null };
    }
    return { estado: 'erro' };
  }
  if (status === 409) return { estado: 'outra_conta' };
  if (status === 401) return { estado: 'sem_login' };
  if (status === 429 || status >= 500) return { estado: 'erro' };
  if (status >= 400) return { estado: 'recusada', erro: typeof c.erro === 'string' ? c.erro : null };
  return { estado: 'erro' };
}

/**
 * `obfuscatedAccountId` da compra = SHA-256 em hex minúsculo do `user.id` do
 * Supabase (64 caracteres, o limite da Play; sem PII). O worker exige a igualdade.
 */
export function hashContaValido(h: unknown): h is string {
  return typeof h === 'string' && /^[0-9a-f]{64}$/.test(h);
}

/**
 * De quem é uma compra que a Play devolveu neste aparelho? A conta Google do
 * aparelho pode ter assinado o OLLI logada em OUTRA conta OLLI.
 *  - 'minha'        → o id ofuscado bate com o deste usuário;
 *  - 'outra'        → veio com id de outra conta — não mexer (nem trocar plano
 *                     por cima, que cobraria a assinatura de outra pessoa);
 *  - 'desconhecida' → veio sem id (reassinatura feita na própria Play Store): só
 *                     o servidor sabe dizer; mandamos verificar e ele decide.
 */
export function donoDaCompraPlay(obfuscado: unknown, hashUsuario: string): 'minha' | 'outra' | 'desconhecida' {
  if (typeof obfuscado !== 'string' || !obfuscado.trim()) return 'desconhecida';
  return obfuscado.trim().toLowerCase() === hashUsuario.toLowerCase() ? 'minha' : 'outra';
}

/** O mínimo que a tela precisa de um plano básico da loja (sem depender dos tipos do pacote). */
export interface PacoteLoja {
  /** Identificador lógico do produto (`olli_pro:mensal`). */
  produtoId: string;
  /** Preço formatado PELA LOJA, com moeda (o que o Google cobra no país do usuário). */
  precoTexto: string;
  /** Token da oferta do plano básico, exigido pela Play para abrir a compra. */
  offerToken?: string;
}

/** Fase de preço como o `expo-iap` devolve (só os campos usados). */
interface FasePrecoLoja {
  formattedPrice?: unknown;
}

/**
 * Converte os produtos de assinatura do `fetchProducts` (expo-iap) em pacotes do
 * catálogo, um por PLANO BÁSICO. Só entra a oferta-base do plano (uma única fase
 * de preço, sem teste grátis nem preço de entrada): o OLLI não tem oferta na Play
 * na v1, e vender uma oferta com teste sem o texto exigido pela política seria
 * pior do que não vender. Sem fases conhecidas, aceita a oferta só se for a única
 * daquele plano básico. O preço é o da fase recorrente, formatado pela loja.
 */
export function pacotesDaLoja(produtos: readonly unknown[] | null | undefined): PacoteLoja[] {
  const saida: PacoteLoja[] = [];
  for (const bruto of produtos ?? []) {
    const p = bruto as { id?: unknown; subscriptionOffers?: unknown } | null;
    const sku = typeof p?.id === 'string' ? p.id.trim() : '';
    if (!sku || !SKUS_PLAY.includes(sku)) continue;
    const ofertas = Array.isArray(p?.subscriptionOffers) ? (p.subscriptionOffers as unknown[]) : [];
    const porPlanoBasico = new Map<string, number>();
    for (const o of ofertas) {
      const base = (o as { basePlanIdAndroid?: unknown } | null)?.basePlanIdAndroid;
      if (typeof base === 'string') porPlanoBasico.set(base, (porPlanoBasico.get(base) ?? 0) + 1);
    }
    for (const bruta of ofertas) {
      const o = bruta as {
        basePlanIdAndroid?: unknown;
        offerTokenAndroid?: unknown;
        displayPrice?: unknown;
        pricingPhasesAndroid?: { pricingPhaseList?: unknown } | null;
      } | null;
      const base = typeof o?.basePlanIdAndroid === 'string' ? o.basePlanIdAndroid.trim() : '';
      const token = typeof o?.offerTokenAndroid === 'string' ? o.offerTokenAndroid.trim() : '';
      if (!base || !token) continue;
      const fases = o?.pricingPhasesAndroid?.pricingPhaseList;
      let preco = '';
      if (Array.isArray(fases) && fases.length > 0) {
        if (fases.length !== 1) continue; // teste grátis / preço de entrada: fora
        const f = fases[0] as FasePrecoLoja | null;
        preco = typeof f?.formattedPrice === 'string' ? f.formattedPrice : '';
      } else {
        if ((porPlanoBasico.get(base) ?? 0) !== 1) continue; // sem fases e ambígua: fora
      }
      if (!preco && typeof o?.displayPrice === 'string') preco = o.displayPrice;
      saida.push({ produtoId: `${sku}:${base}`, precoTexto: preco, offerToken: token });
    }
  }
  return saida;
}

export interface OfertaPlay extends ProdutoPlay {
  produtoId: string;
  precoTexto: string;
}

/**
 * Filtra os pacotes da loja para o catálogo do OLLI. Pacote de produto
 * desconhecido ou sem preço da loja é descartado: melhor faltar um botão do que
 * vender algo que o worker não sabe liberar, ou mostrar um preço inventado.
 * Duplicata (mesmo plano × período) fica com o primeiro, na ordem da loja.
 */
export function ofertasDoCatalogo(pacotes: readonly PacoteLoja[]): OfertaPlay[] {
  const vistos = new Set<string>();
  const saida: OfertaPlay[] = [];
  for (const p of pacotes) {
    const prod = produtoPlay(p?.produtoId);
    if (!prod || !prod.periodoConhecido) continue;
    const preco = typeof p.precoTexto === 'string' ? p.precoTexto.trim() : '';
    if (!preco) continue;
    const chave = `${prod.plano}:${prod.periodo}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ plano: prod.plano, periodo: prod.periodo, produtoId: p.produtoId, precoTexto: preco });
  }
  return saida;
}

/** A oferta de um plano num período, ou `null` se a loja não devolveu esse produto. */
export function ofertaPara(ofertas: readonly OfertaPlay[], plano: PlanoPlay, periodo: PeriodoPlay): OfertaPlay | null {
  return ofertas.find((o) => o.plano === plano && o.periodo === periodo) ?? null;
}

/** Uma assinatura que a Play diz que esta conta Google tem (`getAvailablePurchases`). */
export interface CompraAtivaPlay {
  /** SKU da assinatura (`olli_pro`). */
  sku: string;
  /** Plano básico, quando a loja informa (`mensal`/`anual`). */
  planoBasico?: string | null;
  /** Token da compra — exigido pela Play para TROCAR de plano. */
  purchaseToken?: string | null;
}

/**
 * Modo de substituição na troca de plano: a mudança vale NA HORA e o tempo já
 * pago do plano antigo vira crédito no novo (a Play aceita este modo tanto para
 * subir quanto para descer de plano). Assim a linha do servidor muda junto com a
 * compra, sem uma janela em que o app e a Play discordam do plano.
 */
export const MODO_TROCA_PLAY = 'with-time-proration' as const;

/**
 * Como comprar a oferta escolhida SEM abrir uma SEGUNDA assinatura na Play.
 *
 * `olli_pro` e `olli_empresa` são assinaturas DIFERENTES no Play Console, e a Play
 * deixa a mesma conta Google ter as duas ao mesmo tempo. Comprar o Empresa com o
 * Pro ainda ativo, sem dizer à Play que é uma TROCA, cria duas cobranças mensais.
 * Por isso:
 *  - nenhuma assinatura do catálogo ativa → 'nova';
 *  - a MESMA assinatura no MESMO plano básico (ou com plano básico que a loja não
 *    informou — na dúvida, nunca cobrar de novo) → 'ja_tem';
 *  - outra assinatura/plano básico do catálogo ativa, com token → 'troca', levando
 *    o SKU e o token da antiga para a Play SUBSTITUIR em vez de somar;
 *  - troca necessária mas sem token da antiga → 'indeterminado' (não arrisca
 *    cobrança dupla; a tela pede para restaurar e tentar de novo).
 */
export type CompraPlay =
  | { tipo: 'nova' }
  | { tipo: 'ja_tem' }
  | { tipo: 'troca'; oldProductId: string; purchaseToken: string; replacementMode: typeof MODO_TROCA_PLAY }
  | { tipo: 'indeterminado' };

export function comoComprarNaPlay(ativos: readonly CompraAtivaPlay[] | null | undefined, alvo: { produtoId: string }): CompraPlay {
  const destino = produtoPlay(alvo.produtoId);
  const doCatalogo = (ativos ?? []).filter(
    (a): a is CompraAtivaPlay => !!a && typeof a.sku === 'string' && SKUS_PLAY.includes(a.sku.trim()),
  );
  if (doCatalogo.length === 0) return { tipo: 'nova' };
  const skuDestino = destino ? ASSINATURA_PLAY_POR_PLANO[destino.plano] : null;
  const mesmo = doCatalogo.find((a) => a.sku.trim() === skuDestino);
  if (mesmo) {
    const base = typeof mesmo.planoBasico === 'string' ? mesmo.planoBasico.trim() : '';
    if (!base || !destino || base === destino.periodo) return { tipo: 'ja_tem' };
  }
  const antiga = mesmo ?? doCatalogo[0];
  const token = typeof antiga.purchaseToken === 'string' ? antiga.purchaseToken.trim() : '';
  if (!token) return { tipo: 'indeterminado' };
  return { tipo: 'troca', oldProductId: antiga.sku.trim(), purchaseToken: token, replacementMode: MODO_TROCA_PLAY };
}

/**
 * Depois da compra/restauração, o SERVIDOR já confirmou a assinatura da Play?
 *
 * "Plano pago no servidor" sozinho NÃO basta: quem já pagava por Pix ou Stripe (ou
 * tinha o Pro pela Play e está subindo para o Empresa) teria "Plano liberado" antes
 * de o worker gravar. Só confirma quando a linha do servidor traz o PRODUTO DA
 * PLAY — do plano comprado, quando se sabe qual (`esperado`).
 * `produtoNoServidor` = `revenuecat_produto_id` ainda vigente (null = não há).
 */
export function liberacaoPlayConfirmada(
  servidor: { fonte: string; plano: string; origem?: string },
  produtoNoServidor: string | null,
  esperado: PlanoPlay | null,
): boolean {
  if (servidor.fonte !== 'servidor' || servidor.origem !== 'pagamento' || servidor.plano === 'gratis') return false;
  const prod = produtoPlay(produtoNoServidor);
  if (!prod) return false;
  return esperado === null || prod.plano === esperado;
}

/**
 * Resultado de uma tentativa de compra/restauração, já traduzido.
 *  - 'cancelado'  → o usuário fechou a folha da Play: silêncio, não é erro.
 *  - 'pendente'   → a Play aceitou mas o pagamento não compensou (ex.: boleto,
 *                   pagamento lento). NÃO libera nada até a Play confirmar.
 *  - 'outra_conta'→ esta assinatura da Play já está ligada a outra conta OLLI.
 *  - 'erro'       → qualquer outra coisa, com texto pt-BR para a tela.
 */
export type FalhaCompraPlay =
  | { estado: 'cancelado' }
  | { estado: 'pendente' }
  | { estado: 'outra_conta'; mensagem: string }
  | { estado: 'erro'; mensagem: string };

export const MENSAGEM_OUTRA_CONTA_PLAY =
  'Esta assinatura da Google Play já está ligada a outra conta OLLI. Entre com a conta que fez a compra.';

export const MENSAGEM_LOJA_INDISPONIVEL =
  'A Google Play não está disponível neste aparelho agora. Confira se a Play Store está instalada, atualizada e com uma conta Google conectada.';

/**
 * Traduz o `ErrorCode` do `expo-iap` (string, ex.: 'user-cancelled'). Erro de
 * loja bloqueada (`billing-unavailable`, que na PBL 9 substituiu o antigo
 * `ERROR`) é "loja indisponível" — nunca "você não tem plano".
 */
export function traduzirFalhaPlay(codigo: unknown): FalhaCompraPlay {
  const c = typeof codigo === 'string' ? codigo.trim().toLowerCase() : '';
  switch (c) {
    case 'user-cancelled':
      return { estado: 'cancelado' };
    case 'pending':
    case 'deferred-payment':
      return { estado: 'pendente' };
    case 'already-owned':
      return { estado: 'erro', mensagem: 'Você já tem esta assinatura na Google Play. Toque em “Restaurar compras da Google Play” para ligá-la à sua conta.' };
    case 'network-error':
    case 'service-disconnected':
    case 'service-timeout':
    case 'connection-closed':
      return { estado: 'erro', mensagem: 'Sem conexão com a Google Play agora. Verifique sua internet e tente novamente.' };
    case 'billing-unavailable':
    case 'iap-not-available':
    case 'feature-not-supported':
    case 'init-connection':
    case 'not-prepared':
      return { estado: 'erro', mensagem: MENSAGEM_LOJA_INDISPONIVEL };
    case 'item-unavailable':
    case 'sku-not-found':
    case 'sku-offer-mismatch':
    case 'query-product':
      return { estado: 'erro', mensagem: 'Este plano não está disponível na Google Play agora. Tente de novo mais tarde.' };
    case 'service-error':
    case 'remote-error':
    case 'interrupted':
      return { estado: 'erro', mensagem: 'A Google Play não conseguiu concluir agora. Tente novamente em alguns minutos.' };
    case 'user-error':
      return { estado: 'erro', mensagem: 'Compras estão bloqueadas neste aparelho ou nesta conta Google.' };
    default:
      return { estado: 'erro', mensagem: 'Não foi possível concluir a assinatura agora. Se a Google Play chegar a confirmar a cobrança, o plano é liberado sozinho; se não, tente novamente.' };
  }
}

/**
 * Página de assinaturas da própria Play Store, onde o usuário cancela, pausa ou
 * troca a forma de pagamento. É a LOJA gerenciando a compra que ela fez — não é
 * link-out de pagamento. Com o produto, abre direto na assinatura certa.
 */
export function urlGerenciarNaPlay(pacoteApp: string, produtoId?: string | null): string {
  const base = `https://play.google.com/store/account/subscriptions?package=${encodeURIComponent(pacoteApp)}`;
  const prod = produtoPlay(produtoId);
  return prod ? `${base}&sku=${encodeURIComponent(ASSINATURA_PLAY_POR_PLANO[prod.plano])}` : base;
}
