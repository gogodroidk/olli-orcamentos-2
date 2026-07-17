/**
 * Rate limit FAIL-CLOSED para rotas sensíveis + teto de payload (item O2-18).
 *
 * O que havia: cinco cópias do mesmo `rateOk`, todas fail-OPEN —
 *
 *     if (!env.STRIPE_RL) return true;      // binding ausente: não bloqueia
 *     try { ... } catch { return true; }    // limiter falhou: LIBERA
 *
 * É o padrão proibido da casa (erro → "não sei" → permitido) na camada de
 * infraestrutura: a proteção some exatamente quando é mais necessária, e some
 * calada. E não é hipótese — um build por Git já apagou os 5 rate limiters em
 * produção; com fail-open, ninguém percebeu pelo comportamento, porque
 * "sem limiter" e "dentro do limite" são indistinguíveis para quem chama.
 *
 * Aqui o resultado tem TRÊS estados. Quem decide o que fazer com `indisponivel`
 * é a rota, não o limitador:
 *  - rota SENSÍVEL (dinheiro, convite, exclusão de conta) → nega (503). Prefere
 *    recusar um pedido legítimo a deixar a porta aberta sem vigia.
 *  - rota comum → segue. Derrubar leitura por causa do limiter seria pior.
 */

/** @typedef {'permitido'|'negado'|'indisponivel'} EstadoLimite */

/**
 * Consulta o limiter. NUNCA lança e NUNCA mente: sem binding ou com exceção, o
 * estado é `indisponivel` — que não é sinônimo de `permitido`.
 * @returns {Promise<EstadoLimite>}
 */
export async function checarLimite(rl, key) {
  if (!rl || typeof rl.limit !== 'function') return 'indisponivel';
  if (!key) return 'indisponivel'; // sem chave não há como limitar: não finja que limitou
  try {
    const r = await rl.limit({ key });
    // `success` ausente/não-booleano = resposta que não entendemos. Não vira "pode".
    if (!r || typeof r.success !== 'boolean') return 'indisponivel';
    return r.success ? 'permitido' : 'negado';
  } catch {
    return 'indisponivel';
  }
}

/**
 * Traduz o estado em "deixa passar?", dada a política da rota.
 * `sensivel: true` = fail-closed (o padrão para dinheiro e convite).
 */
export function deixaPassar(estado, { sensivel = true } = {}) {
  if (estado === 'permitido') return true;
  if (estado === 'negado') return false;
  return !sensivel; // indisponivel
}

/**
 * Atalho para as rotas sensíveis: devolve `true` só quando o limiter DISSE que
 * pode. Substitui os `rateOk` fail-open espalhados pelo worker.
 */
export async function rateOkSensivel(env, rl, key) {
  return deixaPassar(await checarLimite(rl, key), { sensivel: true });
}

/**
 * Teto de payload em BYTES, checado ANTES de bufferizar o corpo.
 *
 * Ler `await request.text()` antes de olhar o tamanho é aceitar que qualquer um
 * escolha quanta memória do isolate vai gastar. O `Content-Length` é a checagem
 * barata (o corpo nem foi lido); quem mente no header ainda é pego pelo segundo
 * teste, depois da leitura.
 *
 * @returns {{ok: true} | {ok: false, motivo: 'grande'|'sem_tamanho'}}
 */
export function cabeNoTeto(request, maxBytes) {
  const bruto = request.headers.get('content-length');
  if (bruto === null || bruto === '') return { ok: true }; // sem header: só dá p/ conferir depois
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0) return { ok: false, motivo: 'sem_tamanho' };
  return n > maxBytes ? { ok: false, motivo: 'grande' } : { ok: true };
}

/** Confere o tamanho REAL depois de ler (pega quem mentiu no Content-Length). */
export function textoCabeNoTeto(texto, maxBytes) {
  // Bytes, não caracteres: "ção" tem 3 chars e 5 bytes em UTF-8. Medir errado aqui
  // deixaria passar payloads bem maiores que o teto anunciado.
  return new TextEncoder().encode(texto ?? '').length <= maxBytes;
}

/** Tetos por perfil de rota. Webhook de gateway é pequeno; áudio é grande. */
export const TETO = {
  /** Eventos de webhook (Stripe manda ~4-20 KB; 128 KB é folga de 6x). */
  WEBHOOK: 128 * 1024,
  /** JSON de rota autenticada comum. */
  JSON: 32 * 1024,
};
