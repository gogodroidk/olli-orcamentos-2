/**
 * Faxina de PII para analytics remoto (P9 — PostHog). Módulo PURO e testável.
 *
 * A regra vem da própria porta (`ports/AnalyticsProvider.ts`) e da pesquisa §5.1 e
 * é inegociável: **NENHUM dado sensível nas propriedades** — sem CPF/CNPJ,
 * telefone, e-mail, endereço ou conteúdo de orçamento. IDs pseudonimizados.
 *
 * Por que faxinar aqui e não "tomar cuidado no call site": os eventos locais
 * (SQLite, `analytics.ts`) sempre foram do dono e podiam carregar o que fosse. Ao
 * ligar um destino REMOTO, cada `props` que já existe no código passa a sair do
 * aparelho — e ninguém vai reauditar 20 call sites toda vez que adicionar um
 * campo. A faxina é a última porta antes da rede, e ela é conservadora de
 * propósito: **o que não for provadamente inócuo, não sai.**
 *
 * Modelo: ALLOWLIST de forma, não blocklist de nome. Blocklist é uma corrida que
 * se perde — basta alguém mandar `props.obs` ou `props.dados` e o vazamento passa.
 * Aqui só sobrevive o que é pequeno e categórico: número, booleano e string curta
 * que pareça enum/slug. Nome de cliente, endereço e texto de orçamento reprovam
 * por FORMA, mesmo com uma chave inocente.
 */

/** Chaves obviamente sensíveis — barradas mesmo que o valor passasse na forma. */
const CHAVES_PROIBIDAS =
  /(cpf|cnpj|telefone|phone|whats|email|e_mail|endereco|address|cep|nome|name|cliente|token|senha|password|secret|key|auth|pix|chave|texto|descricao|observ|obs|conteudo|dados|payload|lat|lng|latitude|longitude|coord)/i;

/**
 * String só passa se parecer identificador/categoria: curta, sem espaço, sem
 * acento, sem @, sem dígito longo. "aprovado", "hvac", "pro" passam.
 * "João da Silva", "Rua X, 42", "11999998888" não.
 */
const SLUG_OK = /^[a-z0-9][a-z0-9_.:-]{0,31}$/i;

/** Sequência de 6+ dígitos = provável telefone/CPF/CNPJ/CEP, mesmo dentro de slug. */
const DIGITOS_DEMAIS = /\d{6,}/;

/** O valor é inócuo o bastante para sair do aparelho? */
export function valorSeguro(v: unknown): boolean {
  if (typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return SLUG_OK.test(v) && !DIGITOS_DEMAIS.test(v);
  // null/undefined/objeto/array/função: não sai. Objeto aninhado é o caminho
  // clássico de vazar um orçamento inteiro dentro de uma prop "inofensiva".
  return false;
}

/**
 * Devolve só o que pode ir para o PostHog. Não lança nunca: entrada esquisita
 * vira `{}` (analytics jamais quebra a UX — regra da porta).
 *
 * Não "mascara" nem trunca: **descarta**. Valor truncado ainda é PII (metade de um
 * telefone identifica), e mascarar dá a sensação de segurança sem a segurança.
 */
export function limparProps(props?: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  if (!props || typeof props !== 'object') return saida;
  try {
    for (const [k, v] of Object.entries(props)) {
      if (CHAVES_PROIBIDAS.test(k)) continue;
      if (!valorSeguro(v)) continue;
      saida[k] = v;
    }
  } catch {
    return {};
  }
  return saida;
}

/**
 * O nome do evento também sai do aparelho — então também é validado. Os nomes
 * canônicos (`Eventos`) são slugs; um `track('erro: ' + e.message)` acidental
 * levaria a mensagem inteira embora, e é exatamente o tipo de coisa que ninguém
 * revisa. Nome fora do padrão vira `evento_invalido`, que é visível no funil (dá
 * para achar e consertar) e não vaza nada.
 */
export function nomeEventoSeguro(evento: unknown): string {
  return typeof evento === 'string' && SLUG_OK.test(evento) && !DIGITOS_DEMAIS.test(evento)
    ? evento
    : 'evento_invalido';
}
