/**
 * tempoLimite.ts — tempo máximo para uma operação que pode travar sem erro.
 *
 * Por que existe (QA, 20/11/2026): "Compartilhar PDF" ficou girando por mais de 7 minutos num
 * Galaxy S20 FE e nunca abriu a folha nem mostrou erro. O `expo-print` (`printToFileAsync`) só
 * resolve quando o WebView do sistema termina de carregar e imprimir; se o WebView não termina
 * (WebView Beta, processo morto, página que não fecha o load), a Promise nunca resolve nem
 * rejeita — e o app esperava para sempre. Erro nunca vira vazio: toda espera precisa de teto,
 * e o teto precisa virar uma mensagem que a pessoa lê, com saída ("Tentar de novo").
 *
 * Módulo PURO (sem React, sem módulo nativo): testável em Node (`scripts/teste-tempo-limite-pdf.ts`).
 */

/** Teto para gerar um PDF no aparelho (WebView + impressão). Pedido da CPO: 20 s. */
export const TEMPO_LIMITE_PDF_MS = 20_000;

/**
 * Teto para pedir o link público do orçamento antes de montar o PDF. O PDF sai sem link
 * se o servidor não responde (já era a regra: "NUNCA lança"), mas sem teto o `fetch` de
 * uma rede morta também seguraria o botão.
 */
export const TEMPO_LIMITE_LINK_MS = 8_000;

/** A operação passou do tempo. `message` já é texto para a pessoa (nunca vazio). */
export class ErroTempoLimite extends Error {
  readonly operacao: string;
  readonly ms: number;

  constructor(operacao: string, ms: number, mensagem: string) {
    super(mensagem);
    this.name = 'ErroTempoLimite';
    this.operacao = operacao;
    this.ms = ms;
  }
}

/**
 * Corre `trabalho` contra um relógio. Resolve/rejeita como o trabalho se ele terminar antes;
 * rejeita com `ErroTempoLimite` se o relógio vencer. O relógio é sempre desligado quando o
 * trabalho termina (nada de timer pendurado), e uma resposta tardia do trabalho é descartada
 * sem virar "unhandled rejection".
 */
export function comTempoLimite<T>(
  trabalho: Promise<T>,
  ms: number,
  operacao: string,
  mensagem: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let encerrado = false;
    const relogio = setTimeout(() => {
      if (encerrado) return;
      encerrado = true;
      reject(new ErroTempoLimite(operacao, ms, mensagem));
    }, ms);
    trabalho.then(
      (valor) => {
        if (encerrado) return; // chegou depois do teto: descartado
        encerrado = true;
        clearTimeout(relogio);
        resolve(valor);
      },
      (erro) => {
        if (encerrado) return; // falha tardia depois do teto: engolida de propósito
        encerrado = true;
        clearTimeout(relogio);
        reject(erro);
      },
    );
  });
}

/** Mensagem da falha ao gerar PDF. Duas linhas: o que houve + o que fazer. */
export const MENSAGEM_PDF_DEMOROU =
  'O PDF demorou mais de 20 segundos e foi interrompido. Isso costuma ser o celular ocupado ou o visualizador do sistema travado. Feche outros apps e tente de novo; se repetir, envie o link de aprovação.';

const MENSAGEM_PDF_GENERICA = 'Não foi possível gerar o PDF agora. Tente de novo.';

export interface FalhaPdfParaTela {
  titulo: string;
  mensagem: string;
  /** true quando foi o teto de tempo (a tela pode sugerir o link como alternativa). */
  tempoEsgotado: boolean;
}

/** Converte qualquer erro em texto de tela. NUNCA devolve título ou mensagem vazios. */
export function falhaPdfParaTela(erro: unknown): FalhaPdfParaTela {
  if (erro instanceof ErroTempoLimite) {
    return { titulo: 'O PDF não ficou pronto', mensagem: erro.message || MENSAGEM_PDF_DEMOROU, tempoEsgotado: true };
  }
  const texto = erro instanceof Error ? erro.message : typeof erro === 'string' ? erro : '';
  return {
    titulo: 'Não consegui gerar o PDF',
    mensagem: texto.trim() ? texto.trim() : MENSAGEM_PDF_GENERICA,
    tempoEsgotado: false,
  };
}
