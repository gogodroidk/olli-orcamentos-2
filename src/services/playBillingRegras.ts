/**
 * ASSINATURA PELA GOOGLE PLAY (via RevenueCat) — as REGRAS, sem nenhum import nativo.
 *
 * Por que um módulo puro separado: as mesmas regras servem a três lugares que não
 * podem divergir —
 *  - o app Android (`playBilling.android.ts`, que fala com o SDK nativo, e a
 *    PlanosScreen, que decide o que mostrar);
 *  - o worker (`worker/src/revenuecat.js`), que traduz o webhook do RevenueCat
 *    para `public.assinaturas` e precisa saber QUAL plano cada produto da Play é;
 *  - os testes (`scripts/teste-play-billing.ts`), que rodam no Node sem subir tela.
 * Se o catálogo de produtos morasse em dois arquivos, um dia o app venderia um
 * produto que o worker não reconhece — o cliente pagaria e o plano não ligaria.
 *
 * ═══ NUNCA MODO DEMO ═══
 * O `react-native-purchases` tem um "Preview API Mode" que, dentro do Expo Go,
 * troca as chamadas nativas por MOCKS em JavaScript — compra de mentira que parece
 * de verdade. Ordem permanente do dono: ou funciona de verdade, ou fica DESLIGADO
 * dizendo que está desligado. Por isso `estadoPlayBilling` desliga no Expo Go,
 * sem chave, com chave de outra loja/formato e fora do Android: nessas condições
 * a tela segue exatamente como antes (informa, não vende).
 *
 * ═══ PREÇO VEM DA LOJA ═══
 * Na Play quem cobra é o Google, no valor cadastrado no Play Console. O app mostra
 * o `priceString` que a própria loja devolve — nunca um número digitado aqui nem o
 * de `precosPlanos.ts` (que é o preço da Stripe). Sem preço da loja, sem botão.
 */

export type PlanoPlay = 'pro' | 'empresa';
export type PeriodoPlay = 'mensal' | 'anual';

export interface ProdutoPlay {
  plano: PlanoPlay;
  periodo: PeriodoPlay;
}

/**
 * Assinaturas cadastradas no Play Console (docs/GOOGLE_PLAY_BILLING.md §1): uma
 * por plano, cada uma com dois PLANOS BÁSICOS (`mensal` e `anual`). O RevenueCat
 * identifica produto de assinatura da Google como `<assinatura>:<plano básico>` —
 * é esse o `product_id` que chega no webhook e o `product.identifier` no app.
 */
export const ASSINATURA_PLAY_POR_PLANO: Readonly<Record<PlanoPlay, string>> = Object.freeze({
  pro: 'olli_pro',
  empresa: 'olli_empresa',
});

/** Identificador de produto (RevenueCat/Google) de cada combinação plano × período. */
export function idProdutoPlay(plano: PlanoPlay, periodo: PeriodoPlay): string {
  return `${ASSINATURA_PLAY_POR_PLANO[plano]}:${periodo}`;
}

/** Entitlements do RevenueCat (docs §3). Só informativos: quem decide o plano é o produto. */
export const ENTITLEMENT_PLAY_POR_PLANO: Readonly<Record<PlanoPlay, string>> = Object.freeze({
  pro: 'pro',
  empresa: 'empresa',
});

/**
 * Traduz um identificador de produto da Play no plano que ele libera.
 * `null` = produto desconhecido — e desconhecido NÃO libera nada (fail-closed).
 *
 * Aceita o formato completo (`olli_pro:mensal`) e, para o NÍVEL do plano, também
 * só a assinatura (`olli_pro`): produtos criados no RevenueCat antes de 2023 podiam
 * vir sem o plano básico. Nesse caso o período fica desconhecido (`null`), o que
 * não importa ao worker — a vigência vem do `expiration_at_ms` do evento.
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

/**
 * Chave PÚBLICA do SDK do RevenueCat para a Google Play. Tem prefixo `goog_`
 * (a da Apple é `appl_`, a de teste da RevenueCat é `test_`). Qualquer outra coisa
 * — vazio, chave de outra loja, chave secreta `sk_` colada por engano no lugar
 * errado — deixa a venda DESLIGADA em vez de configurar o SDK com lixo.
 */
export function chavePlayValida(chave: unknown): chave is string {
  return typeof chave === 'string' && /^goog_[A-Za-z0-9]{10,}$/.test(chave.trim());
}

export type EstadoPlayBilling =
  | 'ligado'
  | 'desligado_plataforma'
  | 'desligado_sem_chave'
  | 'desligado_expo_go';

/**
 * A venda pela Play pode existir NESTE aparelho? Só com as três condições:
 * Android, chave pública válida da Google e build nativo de verdade (não Expo Go).
 * iOS continua sem compra (não há StoreKit — Guideline 3.1.1) e a web vende pelo
 * checkout que já tem.
 */
export function estadoPlayBilling(entrada: { plataforma: string; chave: unknown; emExpoGo: boolean }): EstadoPlayBilling {
  if (entrada.plataforma !== 'android') return 'desligado_plataforma';
  if (!chavePlayValida(entrada.chave)) return 'desligado_sem_chave';
  if (entrada.emExpoGo) return 'desligado_expo_go';
  return 'ligado';
}

/** O mínimo que a tela precisa de um pacote do RevenueCat (sem depender dos tipos do SDK). */
export interface PacoteLoja {
  /** Identificador do produto na loja (`olli_pro:mensal`). */
  produtoId: string;
  /** Preço formatado PELA LOJA, com moeda (ex.: o que o Google cobra no país do usuário). */
  precoTexto: string;
}

export interface OfertaPlay extends ProdutoPlay {
  produtoId: string;
  precoTexto: string;
}

/**
 * Filtra os pacotes da oferta atual para o catálogo do OLLI. Pacote de produto
 * desconhecido ou sem preço da loja é descartado: melhor faltar um botão do que
 * vender algo que o worker não sabe liberar, ou mostrar um preço inventado.
 * Duplicata (mesmo plano × período) fica com o primeiro, na ordem da oferta.
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

/**
 * Resultado de uma tentativa de compra/restauração, já traduzido do código de erro
 * do SDK (`PURCHASES_ERROR_CODE`, que é string: '1' = cancelada etc.).
 *  - 'cancelado'  → o usuário fechou a folha da Play: silêncio, não é erro.
 *  - 'pendente'   → a Play aceitou mas o pagamento não compensou (ex.: forma de
 *                   pagamento lenta). NÃO libera nada: quem libera é o webhook.
 *  - 'outra_conta'→ esta assinatura da Play já está ligada a outra conta OLLI.
 *  - 'erro'       → qualquer outra coisa, com texto pt-BR para a tela.
 */
export type FalhaCompraPlay =
  | { estado: 'cancelado' }
  | { estado: 'pendente' }
  | { estado: 'outra_conta'; mensagem: string }
  | { estado: 'erro'; mensagem: string };

export function traduzirFalhaPlay(codigo: unknown, usuarioCancelou?: unknown): FalhaCompraPlay {
  const c = typeof codigo === 'string' || typeof codigo === 'number' ? String(codigo) : '';
  if (c === '1' || usuarioCancelou === true) return { estado: 'cancelado' };
  if (c === '20') return { estado: 'pendente' };
  if (c === '7' || c === '13') {
    return {
      estado: 'outra_conta',
      mensagem: 'Esta assinatura da Google Play já está ligada a outra conta OLLI. Entre com a conta que fez a compra.',
    };
  }
  if (c === '6') return { estado: 'erro', mensagem: 'Você já tem esta assinatura na Google Play. Toque em “Restaurar compras” para ligá-la à sua conta.' };
  if (c === '10' || c === '35') return { estado: 'erro', mensagem: 'Sem conexão com a internet agora. Verifique sua conexão e tente novamente.' };
  if (c === '2' || c === '5') return { estado: 'erro', mensagem: 'A Google Play não conseguiu concluir agora. Tente novamente em alguns minutos.' };
  if (c === '3') return { estado: 'erro', mensagem: 'Compras estão bloqueadas neste aparelho ou nesta conta Google.' };
  return { estado: 'erro', mensagem: 'Não foi possível concluir a assinatura agora. Se a Google Play chegar a confirmar a cobrança, o plano é liberado sozinho; se não, tente novamente.' };
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
