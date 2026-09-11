import type { PortaDisponivel, ResultadoPorta } from './comum';

/**
 * StorageProvider — armazenamento de ARQUIVOS/BLOBS grandes: fotos de serviço,
 * PDFs gerados e anexos. É distinto do backup de DADOS (JSON do banco), que já
 * tem seu próprio caminho em `src/services/backup.ts` — esta porta é para
 * binários que precisam de URL pública/assinada consistente em web + mobile +
 * e-mail.
 *
 * Provider escolhido: Supabase Storage com RLS por owner (bucket com policy
 * dono-a-dono, versões otimizadas + original preservado). Decisão D-13; chave de
 * entitlement `storage.limit_mb` já reservada. Ver backlog STORAGE.
 *
 * Impl de-facto HOJE: logo e assinatura pequenas são convertidas para `data:`
 * URI limitada (máx. 512 px / 512 KiB) e vivem no blob RLS de `empresa.dados`.
 * Isso já as torna portáteis entre app, painel e PDF sem URL pública. Esta porta
 * continua necessária para fotos/anexos/PDFs grandes — colocar esses binários no
 * JSON degradaria SQLite, PostgREST e sincronização.
 *
 * Onda de fiação: fundação de dados/arquivos — bucket privado, RLS por tenant,
 * URLs assinadas e política de retenção antes de migrar binários grandes.
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
  /** Owner do tenant. Ausente = usuário autenticado; equipe envia no owner visível. */
  tenantId?: string;
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
