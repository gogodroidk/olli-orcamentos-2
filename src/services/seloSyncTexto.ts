/**
 * Textos do SeloSync e do selo de cada foto — puros, para o gate testar.
 *
 *     testados por: node scripts/teste-confianca-offline.ts
 *
 * Regras de copy (P0 da casa):
 *  - nunca dizer "tudo enviado" sem ter lido a fila: leitura falhou = "não
 *    consegui conferir", com [Tentar agora];
 *  - desligado diz que está desligado (sem nuvem configurada, as fotos ficam só
 *    no aparelho — e a tela fala isso);
 *  - pendência parada há mais de 24h vira alerta, com o tempo real ("há 3 dias").
 */
import type { EstadoFoto, LeituraResumo } from './filaFotos.ts';

export type TomSelo = 'ok' | 'aguardando' | 'alerta' | 'indisponivel' | 'desligado';

export interface TextoSelo {
  tom: TomSelo;
  /** Linha principal (ex.: "3 fotos aguardando sinal"). */
  titulo: string;
  /** Segunda linha opcional. */
  detalhe?: string;
  /** Mostrar o botão [Tentar agora]. */
  tentarAgora: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** "há 1 dia", "há 3 dias" (arredonda para baixo, mínimo 1). */
export function haQuantosDias(desde: number, agora: number): string {
  const dias = Math.max(1, Math.floor((agora - desde) / DIA_MS));
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

/**
 * @param leitura resultado da leitura da fila (ou null enquanto carrega)
 * @param nuvemLigada false = build sem Supabase: envio desligado neste aparelho
 */
export function textoSeloSync(leitura: LeituraResumo | null, agora: number, nuvemLigada = true): TextoSelo | null {
  if (!nuvemLigada) {
    return {
      tom: 'desligado',
      titulo: 'Envio de fotos desligado',
      detalhe: 'Neste aparelho as fotos ficam só no celular.',
      tentarAgora: false,
    };
  }
  if (leitura === null) return null; // carregando: não afirma nada
  if (leitura.status === 'sem_conta') {
    // Sem conta conectada não há nuvem para onde subir: prometer "sobe quando a
    // internet voltar" seria mentira (e o alerta de 24h apareceria para sempre).
    return {
      tom: 'desligado',
      titulo: 'Fotos só neste celular',
      detalhe: 'Sem conta conectada, elas não vão para a nuvem. Entre na sua conta para guardar uma cópia.',
      tentarAgora: false,
    };
  }
  if (leitura.status === 'indisponivel') {
    return {
      tom: 'indisponivel',
      titulo: 'Não consegui conferir o que falta enviar',
      detalhe: 'Suas fotos continuam salvas no aparelho.',
      tentarAgora: true,
    };
  }
  const { aguardando, recusadas, maisAntigaDesde, atrasada } = leitura.resumo;
  if (aguardando === 0 && recusadas === 0) {
    return { tom: 'ok', titulo: 'Fotos enviadas', tentarAgora: false };
  }
  if (recusadas > 0) {
    return {
      tom: 'alerta',
      titulo: plural(recusadas, 'foto não subiu', 'fotos não subiram'),
      detalhe: aguardando > 0
        ? `A nuvem recusou o arquivo. ${aguardando === 1 ? 'Outra aguarda' : `Outras ${aguardando} aguardam`} sinal. Todas seguem no aparelho.`
        : `A nuvem recusou o arquivo. ${recusadas === 1 ? 'Ela continua salva' : 'Elas continuam salvas'} no aparelho.`,
      tentarAgora: true,
    };
  }
  if (atrasada && maisAntigaDesde !== undefined) {
    return {
      tom: 'alerta',
      titulo: `Algumas fotos não subiram ${haQuantosDias(maisAntigaDesde, agora)}`,
      detalhe: `${plural(aguardando, 'foto aguardando', 'fotos aguardando')} sinal. Estão salvas no aparelho.`,
      tentarAgora: true,
    };
  }
  return {
    tom: 'aguardando',
    titulo: `${plural(aguardando, 'foto aguardando', 'fotos aguardando')} sinal`,
    detalhe: aguardando === 1 ? 'Ela sobe sozinha quando a internet voltar.' : 'Elas sobem sozinhas quando a internet voltar.',
    tentarAgora: false,
  };
}

/** Selo curto em cima de cada foto. */
export function rotuloSeloFoto(estado: EstadoFoto | 'sem_registro' | null): { texto: string; tom: TomSelo } | null {
  switch (estado) {
    case 'enviada':
      return { texto: 'Enviada', tom: 'ok' };
    case 'no_aparelho':
    case 'sem_registro':
      return { texto: 'No aparelho', tom: 'aguardando' };
    case 'recusada':
      return { texto: 'Não subiu', tom: 'alerta' };
    case 'ausente':
      return { texto: 'Não está neste aparelho', tom: 'indisponivel' };
    default:
      return null; // fila ilegível: sem selo, em vez de um selo inventado
  }
}
