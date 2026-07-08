import type { PortaDisponivel, ResultadoPorta } from './comum';

/**
 * AiProvider — a inteligência da OLLI: diagnóstico técnico (código de erro →
 * causas/testes), montagem de orçamento por voz/texto e chat assistente. Toda a
 * IA vive atrás desta porta para que a UI nunca fale direto com um provedor de
 * LLM e para poder trocar/rotear modelos sem tocar as telas.
 *
 * Provider de-facto HOJE (impl concreta, em produção): o Worker Cloudflare
 * `olli-diagnostico` (`DIAGNOSTICO_URL`), com a chave do LLM (Gemini por padrão,
 * Claude opcional) como SECRET do worker — nunca no app. Fica atrás de:
 *   - diagnóstico: `src/services/olliIA.ts` (`diagnosticarCaso`, com cache local
 *     + fallback para a base de 698 códigos offline);
 *   - voz/chat: `src/services/olliAssistente.ts` (`interpretarVoz`, `enviarChat`)
 *     e `src/services/vozNuvem.ts` (gravação → `/transcrever`).
 * `disponivel()` espelha `isDiagnosticoIADisponivel()` (config.ts). A cota de 3
 * usos/mês do plano Grátis NÃO é responsabilidade desta porta — é do gate de
 * plano (`planos.ts` → `getUsosIaRestantes`/`consumirUsoIa`); a porta só executa.
 *
 * Provider(es) futuro(s): LiteLLM como gateway só SE operarmos >1 provedor em
 * produção; Langfuse para observabilidade quando a IA virar recurso pago
 * (pseudonimizar cliente/empresa/equipamento). Ver backlog AI.
 *
 * Onda de fiação: já operante; formalizar o adaptador único (unificar
 * diagnóstico+voz+chat sob esta interface) é refino de baixo risco, sem onda
 * dedicada — feito quando a próxima tela de IA for adicionada.
 */
export interface AiProvider extends PortaDisponivel {
  /**
   * Diagnóstico técnico de um caso. A impl atual sempre resolve (nunca lança):
   * IA quando disponível, senão a base de 698 códigos offline. Espelha
   * `olliIA.ts.diagnosticarCaso`. O tipo de retorno rico já existe em
   * `src/types` (DiagnosticoResultado) — referenciado por comentário para não
   * acoplar a porta ao módulo de tipos enquanto a Onda 3 o edita.
   */
  diagnosticar(input: DiagnosticoInputPort): Promise<DiagnosticoSaidaPort>;

  /**
   * Interpreta uma fala/texto e devolve itens de orçamento. Espelha
   * `olliAssistente.ts.interpretarVoz`.
   */
  interpretarParaOrcamento(texto: string): Promise<ResultadoPorta<ItemOrcamentoIA[]>>;

  /** Conversa assistente (texto). Espelha `olliAssistente.ts.enviarChat`. */
  conversar(mensagens: MensagemChatPort[]): Promise<ResultadoPorta<{ resposta: string }>>;
}

/** Entrada mínima do diagnóstico (alinhada a DiagnosticoInput em src/types). */
export interface DiagnosticoInputPort {
  marca?: string;
  modelo?: string;
  codigo?: string;
  sintoma?: string;
}

/**
 * Saída do diagnóstico. A impl atual devolve muito mais (DiagnosticoResultado
 * completo em src/types); aqui só fixamos o contrato mínimo que a porta garante:
 * de onde veio a resposta e um resumo. O adaptador pode devolver o objeto rico.
 */
export interface DiagnosticoSaidaPort {
  /** 'ia' | 'cache' | 'base' — igual ao campo `fonte` de DiagnosticoResultado. */
  fonte: 'ia' | 'cache' | 'base';
  /** Aviso amigável quando caiu no fallback offline (opcional). */
  aviso?: string;
}

/** Item que a IA monta a partir da fala (alinhado a VozItem em olliAssistente.ts). */
export interface ItemOrcamentoIA {
  descricao: string;
  quantidade: number;
  valorUnitario: number | null;
  tipo: 'servico' | 'peca';
}

/** Mensagem de chat (alinhada a ChatMensagem em olliAssistente.ts). */
export interface MensagemChatPort {
  role: 'user' | 'assistant';
  texto: string;
}
