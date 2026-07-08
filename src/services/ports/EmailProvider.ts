import type { PortaDisponivel, ResultadoPorta } from './comum';

/**
 * EmailProvider — envio de E-MAIL TRANSACIONAL do OLLI (orçamento, recibo,
 * boas-vindas, convite de equipe). Templates HTML com a identidade da marca; a
 * renderização do HTML é candidata a React Email (o provider só ENTREGA — não
 * confundir: React Email gera o HTML, este provider despacha). Ver backlog EMAIL.
 *
 * Provider escolhido: Resend, remetente `mail.olliorcamentos.online` (DNS/DKIM
 * via Hostinger). Decisão D-06; Gmail API nunca como motor do SaaS. A API key
 * fica no worker (`POST /email`), nunca no app. Bloqueio humano: B2 (criar a
 * conta + API key, ~5 min do dono).
 *
 * Impl de-facto HOJE: NÃO EXISTE envio de e-mail no app. O que existe é o
 * fallback offline por outro canal — `mailto:`/WhatsApp deep-link (ver
 * `src/utils/exportarDocumento.ts` → `abrirWhatsApp`, usado em telas de
 * compartilhamento). Este fallback continua sendo o caminho quando
 * `disponivel()` for false.
 *
 * Onda de fiação: Onda 6 (E-mail transacional Resend) — bloqueada só pela B2;
 * todo o resto (worker /email, templates, log `emails_enviados`) sai antes.
 */
export interface EmailProvider extends PortaDisponivel {
  /**
   * Envia um e-mail transacional já renderizado. `template` identifica o
   * conteúdo para o worker montar/escolher o HTML da marca; `dados` são as
   * variáveis do template (sem PII além do necessário — LGPD).
   */
  enviar(input: EnviarEmailInput): Promise<ResultadoPorta<{ id: string }>>;
}

export type TemplateEmail =
  | 'orcamento'
  | 'recibo'
  | 'boas_vindas'
  | 'convite_equipe';

export interface EnviarEmailInput {
  para: string;
  assunto: string;
  template: TemplateEmail;
  /** Variáveis do template (nome do cliente, número do orçamento, link…). */
  dados: Record<string, string | number>;
  /** Nome de exibição do remetente (ex.: o nome do negócio do prestador). */
  remetenteNome?: string;
  /** URL de anexo (ex.: PDF já no Storage) — nunca o binário inline. */
  anexoUrl?: string;
}
