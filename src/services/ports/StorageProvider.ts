import type { PortaDisponivel, ResultadoPorta } from './comum';

/**
 * StorageProvider — armazenamento de ARQUIVOS/BLOBS: logo do negócio, fotos de
 * serviço, PDFs gerados. É distinto do backup de DADOS (JSON do banco), que já
 * tem seu próprio caminho em `src/services/backup.ts` — esta porta é para
 * binários que precisam de URL pública/assinada consistente em web + mobile +
 * e-mail.
 *
 * Provider escolhido: Supabase Storage com RLS por owner (bucket com policy
 * dono-a-dono, versões otimizadas + original preservado). Decisão D-13; chave de
 * entitlement `storage.limit_mb` já reservada. Ver backlog STORAGE.
 *
 * Impl de-facto HOJE: NÃO EXISTE upload de binário para a nuvem. A logo vive
 * como URI LOCAL (ver telas de personalização, ex.:
 * `src/steps/Step4Personalizacao.tsx`), o que quebra consistência web/mobile e
 * inviabiliza logo nos e-mails da Onda 6 — exatamente o problema que a D-13
 * resolve. Fotos de serviço hoje também são locais (`src/utils/fotosOrcamento.ts`).
 *
 * Onda de fiação: Onda 7 (PDF v2 + identidade) — logo → Storage com RLS é
 * pré-requisito do PDF v2 e da logo nos e-mails.
 */
export interface StorageProvider extends PortaDisponivel {
  /**
   * Envia um binário e devolve a chave interna + uma URL para exibir. `conteudo`
   * é base64 (mesmo formato que `expo-file-system` já produz no app — ver
   * vozNuvem.ts). O provider decide bucket/pasta a partir de `categoria` e do
   * owner logado (RLS).
   */
  enviar(input: EnviarArquivoInput): Promise<ResultadoPorta<ArquivoArmazenado>>;

  /** URL para acesso ao arquivo (assinada e temporária quando o bucket é privado). */
  urlDe(chave: string): Promise<ResultadoPorta<{ url: string }>>;

  /** Remove um arquivo pela chave. No-op se já não existir. */
  remover(chave: string): Promise<void>;
}

export type CategoriaArquivo = 'logo' | 'foto_servico' | 'pdf' | 'anexo';

export interface EnviarArquivoInput {
  categoria: CategoriaArquivo;
  /** Conteúdo em base64 (sem o prefixo data:). */
  conteudoBase64: string;
  /** MIME (ex.: 'image/png', 'application/pdf'). */
  mimeType: string;
  /** Nome sugerido para o arquivo (o provider pode prefixar com hash/owner). */
  nome?: string;
}

export interface ArquivoArmazenado {
  /** Chave interna estável usada por `urlDe`/`remover`. */
  chave: string;
  /** URL utilizável agora (pública ou assinada). */
  url: string;
  tamanhoBytes: number;
}
