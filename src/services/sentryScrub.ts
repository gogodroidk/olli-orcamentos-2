/**
 * Última porta de privacidade antes do Sentry. Módulo puro, compartilhado por
 * app, landing, painel e Worker. Não depende do SDK e pode ser testado com
 * eventos sintéticos sem rede.
 */

const EMAIL = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const JWT = /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi;
const BEARER = /\bBearer\s+[a-z0-9._~+/=-]{8,}/gi;
const CPF_CNPJ = /\b(?:\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-\s]?\d{2}|\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/\s-]?\d{4}[-\s]?\d{2})\b/g;
const TELEFONE = /(?<!\d)(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}(?!\d)/g;
const CHAVE_SENSIVEL = /(authorization|cookie|set-cookie|token|secret|password|senha|passwd|api.?key|email|e.?mail|phone|telefone|whats|cpf|cnpj|address|endereco|cep|payload|body|request.?data|cliente|customer|prompt|chat|mensagem)/i;
// Chaves ESTRUTURAIS do evento que casam com CHAVE_SENSIVEL por acidente de
// substring: "ex-CEP-tion" casava com `cep` e o redator apagava o campo inteiro —
// todo erro chegava ao Sentry sem tipo, mensagem e stack (achado 29/09). O
// conteúdo delas continua passando pelo `sanitizar` (mensagem redigida, chaves
// sensíveis internas removidas); só a chave em si deixa de ser descartada.
const CHAVE_ESTRUTURAL = new Set(['exception']);

export function redigirTextoSentry(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  let texto = valor
    .replace(BEARER, '[REDACTED_AUTH]')
    .replace(JWT, '[REDACTED_JWT]')
    .replace(EMAIL, '[REDACTED_EMAIL]')
    .replace(CPF_CNPJ, '[REDACTED_DOCUMENT]')
    .replace(TELEFONE, '[REDACTED_PHONE]');

  // URLs absolutas e relativas perdem query/fragmento. O path preservado ainda
  // identifica a rota que falhou sem enviar código OAuth, token ou busca.
  texto = texto.replace(/https?:\/\/[^\s)\]}]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url.split(/[?#]/, 1)[0];
    }
  });
  texto = texto.replace(/\/(?:[a-z0-9._~-]+\/)*[a-z0-9._~-]+[?#][^\s)\]}]*/gi, (url) => url.split(/[?#]/, 1)[0]);
  return texto.slice(0, 2_000);
}

// O campo de uma linha do stack mora na profundidade 7
// (exception › values › [i] › stacktrace › frames › [j] › filename). Com teto 6
// todo arquivo/função/linha virava "[TRUNCATED]" e o stack chegava inútil.
const PROFUNDIDADE_MAX = 8;
const MAX_ITENS_LISTA = 50;

function sanitizar(valor: unknown, profundidade = 0): unknown {
  if (profundidade > PROFUNDIDADE_MAX) return '[TRUNCATED]';
  if (typeof valor === 'string') return redigirTextoSentry(valor);
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'boolean' || valor === null) return valor;
  if (Array.isArray(valor)) return valor.slice(0, MAX_ITENS_LISTA).map((item) => sanitizar(item, profundidade + 1));
  if (!valor || typeof valor !== 'object') return undefined;

  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor as Record<string, unknown>).slice(0, 80)) {
    if (CHAVE_SENSIVEL.test(chave) && !(profundidade === 0 && CHAVE_ESTRUTURAL.has(chave))) continue;
    // No Sentry o frame que QUEBROU é o último da lista (ordem: mais antigo →
    // mais novo). Cortar do começo jogaria fora justamente ele num stack longo.
    const fonte = chave === 'frames' && Array.isArray(item) ? item.slice(-MAX_ITENS_LISTA) : item;
    const limpo = sanitizar(fonte, profundidade + 1);
    if (limpo !== undefined) saida[chave] = limpo;
  }
  return saida;
}

function urlSemSegredo(valor: unknown): string | undefined {
  if (typeof valor !== 'string' || !valor) return undefined;
  try {
    const parsed = new URL(valor, 'https://local.invalid');
    const relativo = parsed.origin === 'https://local.invalid';
    return relativo ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return redigirTextoSentry(valor).split(/[?#]/, 1)[0];
  }
}

export function limparBreadcrumbSentry<T extends Record<string, unknown>>(breadcrumb: T): T | null {
  const categoria = typeof breadcrumb.category === 'string' ? breadcrumb.category : '';
  // Entrada, clique e console podem repetir texto digitado/nome de cliente.
  if (/^(ui\.(input|click)|console)$/i.test(categoria)) return null;
  const limpo = sanitizar(breadcrumb) as T;
  delete (limpo as Record<string, unknown>).data;
  if (typeof breadcrumb.message === 'string') {
    (limpo as Record<string, unknown>).message = redigirTextoSentry(breadcrumb.message);
  }
  return limpo;
}

export function limparEventoSentry<T extends Record<string, unknown>>(evento: T): T {
  const limpo = sanitizar(evento) as T;
  const obj = limpo as Record<string, unknown>;

  // Campos inteiros que não são necessários para diagnosticar e podem carregar
  // blobs arbitrários, estado da tela ou identidade.
  delete obj.user;
  delete obj.extra;
  delete obj.contexts;

  const request = evento.request;
  if (request && typeof request === 'object' && !Array.isArray(request)) {
    const req = request as Record<string, unknown>;
    obj.request = {
      ...(typeof req.method === 'string' ? { method: req.method.slice(0, 12).toUpperCase() } : {}),
      ...(urlSemSegredo(req.url) ? { url: urlSemSegredo(req.url) } : {}),
    };
  } else {
    delete obj.request;
  }

  if (Array.isArray(evento.breadcrumbs)) {
    obj.breadcrumbs = evento.breadcrumbs
      .slice(-20)
      .map((b) => (b && typeof b === 'object' && !Array.isArray(b) ? limparBreadcrumbSentry(b as Record<string, unknown>) : null))
      .filter(Boolean);
  }

  return limpo;
}
