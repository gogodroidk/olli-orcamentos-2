/**
 * Tipos compartilhados pela camada de PORTAS (ports) do OLLI.
 *
 * Esta camada é 100% ADITIVA e por enquanto DECLARATIVA: define as interfaces
 * ("portas") atrás das quais cada integração externa deve viver, para que a UI
 * e os casos de uso nunca chamem uma API externa direto (padrão da pesquisa
 * §10 — "UI → caso de uso → porta → adaptador → API externa"). NENHUM call-site
 * existente foi refatorado: cada porta documenta, no seu JSDoc, qual é a IMPL
 * DE-FACTO de hoje (o service que já faz o trabalho) e em que onda a fiação
 * formal (extrair um adaptador que implemente a interface) acontece.
 *
 * Regra de ouro do projeto respeitada aqui: interfaces puras, sem imports
 * quebrados, sem implementação concreta, sem segredo — nada disto deve alterar
 * o comportamento nem o typecheck. Quando um tipo do domínio (ex.: Orcamento,
 * Recibo) for necessário, referenciamos por COMENTÁRIO em vez de importar, para
 * não acoplar as portas ao `src/types` enquanto a Onda 3 ainda mexe nele.
 */

/** Valor monetário em CENTAVOS (inteiro), moeda BRL salvo indicação. Evita float. */
export type Centavos = number;

/** Código ISO 4217 da moeda. Hoje sempre 'BRL'. */
export type Moeda = 'BRL';

/**
 * Resultado uniforme de operação de porta que pode falhar de forma esperada
 * (rede caiu, provider indisponível, recurso não configurado). Espelha o padrão
 * que os services de IA já usam (`{ ok:false, erro }`) para a UI ter sempre um
 * caminho de fallback sem try/catch espalhado. Uma porta NUNCA deve lançar em
 * falha esperada — devolve `ok:false` com um `motivo` que a UI possa traduzir.
 */
export type ResultadoPorta<T> =
  | { ok: true; dados: T }
  | { ok: false; motivo: MotivoFalhaPorta; mensagem?: string };

/**
 * Por que uma porta falhou, sem vazar detalhe técnico do provider. A UI mapeia
 * cada caso para uma mensagem amigável (como `avisoFallback()` em olliIA.ts).
 */
export type MotivoFalhaPorta =
  | 'nao_configurado' // credencial/URL ausente — recurso ainda não ligado
  | 'offline'         // sem conexão
  | 'timeout'         // provider demorou demais
  | 'auth'            // sessão/credencial inválida
  | 'servidor'        // 5xx / provider sobrecarregado
  | 'invalido'        // entrada rejeitada pelo provider
  | 'desconhecido';

/**
 * Toda porta expõe se está ligada AGORA (credencial/URL presente). Espelha os
 * `*Disponivel()` que já existem (isDiagnosticoIADisponivel, linkConfigurado,
 * googleAgendaDisponivel, mapaEmbutidoDisponivel). A UI consulta isto para
 * decidir entre o caminho pleno e o fallback honesto — nunca mostrar "em breve".
 */
export interface PortaDisponivel {
  /** `true` quando o provider de-facto está configurado e utilizável. */
  disponivel(): boolean;
}
