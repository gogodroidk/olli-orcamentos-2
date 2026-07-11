/**
 * Taxonomia ÚNICA de falha da OLLI por IA — fonte de verdade para as 3 telas que
 * hoje reimplementavam a mesma classificação (timeout/offline/servidor/auth/cota)
 * com mensagens e visuais divergentes: DiagnosticoIAScreen, OlliChatScreen e
 * CodigosErroScreen. Não muda a lógica de rede/aterramento — só o VOCABULÁRIO e
 * a CÓPIA que a UI mostra pra cada motivo, que continuam vindo de
 * `motivoFalhaDiagnostico()` (olliIA.ts) e do status HTTP mapeado em
 * olliAssistente.ts.
 */
export type TipoErroIA =
  | 'timeout'
  | 'offline'
  | 'servidor'
  | 'auth'
  | 'cota'
  | 'cancelado'
  | 'desconhecido';

export interface EstadoErroIA {
  titulo: string;
  mensagem: string;
  /** Rótulo do botão de recuperação — a tela decide a ação real (retry, ver planos…). */
  acao: string;
}

/** Mapeia o motivo real da falha para {titulo, mensagem, ação} — texto único, sem duplicar tela a tela. */
export function mapearErroIA(tipo: TipoErroIA): EstadoErroIA {
  switch (tipo) {
    case 'timeout':
      return {
        titulo: 'Demorou demais para responder',
        mensagem: 'Sua conexão parece lenta agora — a OLLI não respondeu a tempo.',
        acao: 'Tentar de novo',
      };
    case 'offline':
      return {
        titulo: 'Sem conexão com a internet',
        mensagem: 'Confira o Wi-Fi ou os dados móveis e tente de novo.',
        acao: 'Tentar de novo',
      };
    case 'servidor':
      return {
        titulo: 'A OLLI está muito requisitada',
        mensagem: 'Estamos com alta demanda agora — tente de novo em instantes.',
        acao: 'Tentar de novo',
      };
    case 'auth':
      return {
        titulo: 'Sua sessão expirou',
        mensagem: 'Entre de novo em Conta para continuar usando a OLLI por IA.',
        acao: 'Tentar de novo',
      };
    case 'cota':
      return {
        titulo: 'Seus usos grátis de IA deste mês acabaram',
        mensagem: 'Volta mês que vem com usos novos, ou assine o Pro para IA ilimitada.',
        acao: 'Ver planos',
      };
    case 'cancelado':
      return {
        titulo: 'Análise cancelada',
        mensagem: 'Você cancelou o pedido — pode tentar de novo quando quiser.',
        acao: 'Tentar de novo',
      };
    default:
      return {
        titulo: 'Algo não saiu como esperado',
        mensagem: 'Não consegui falar com a OLLI agora. Tente de novo em instantes.',
        acao: 'Tentar de novo',
      };
  }
}

/**
 * Recuperação honesta quando a confiança do diagnóstico é Baixa: monta uma busca
 * REAL no Google/YouTube com marca+modelo+código — zero IA nova, zero alucinação.
 */
export function buscaExternaUrl(
  motor: 'google' | 'youtube',
  dados: { marca?: string; modelo?: string; codigo?: string; sintoma?: string },
): string {
  const termos = [dados.marca, dados.modelo, dados.codigo || dados.sintoma]
    .filter(Boolean)
    .join(' ')
    .trim();
  const q = encodeURIComponent(termos || 'erro ar condicionado split');
  return motor === 'google'
    ? `https://www.google.com/search?q=${q}`
    : `https://www.youtube.com/results?search_query=${q}`;
}

/** `true` quando o nível de confiança (string livre "Alta"/"Média"/"Baixa") é Baixa. */
export function confiancaBaixa(nivel?: string): boolean {
  return (nivel || '').trim().toLowerCase().startsWith('baix');
}
