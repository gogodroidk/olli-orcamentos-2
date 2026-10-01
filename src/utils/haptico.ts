import * as Haptics from 'expo-haptics';

/**
 * HÁPTICO PADRONIZADO — o único lugar do app que fala com `expo-haptics`.
 *
 * Antes, cada tela chamava `Haptics.impactAsync(...)`/`notificationAsync(...)`
 * com o estilo que lembrava na hora: o mesmo "salvou" vibrava Light numa tela,
 * Success noutra e nada numa terceira. Aqui o vocabulário é SEMÂNTICO — a tela
 * diz o que aconteceu (sucesso, erro, seleção), não qual motor girar:
 *
 *   leve     → toque numa ação principal (botão, card que abre algo)
 *   medio    → ação de peso (o "Orçar" central, arrastar/soltar)
 *   selecao  → trocar de aba, marcar um item, mudar um filtro
 *   sucesso  → algo foi salvo/enviado de verdade
 *   erro     → a ação falhou (acompanha a mensagem de erro, nunca a substitui)
 *   aviso    → antes de uma ação destrutiva (folha de confirmação vermelha)
 *
 * Aparelho sem motor de vibração (ou web) rejeita a promessa: o toque continua
 * valendo, só não vibra — por isso o `catch` vazio é de propósito e não esconde
 * erro de negócio nenhum. Nunca lança.
 */
export type TipoHaptico = 'leve' | 'medio' | 'selecao' | 'sucesso' | 'erro' | 'aviso';

const ignorar = () => {};

export function vibrar(tipo: TipoHaptico): void {
  try {
    switch (tipo) {
      case 'leve':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(ignorar);
        return;
      case 'medio':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(ignorar);
        return;
      case 'selecao':
        Haptics.selectionAsync().catch(ignorar);
        return;
      case 'sucesso':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(ignorar);
        return;
      case 'erro':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(ignorar);
        return;
      case 'aviso':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(ignorar);
        return;
    }
  } catch {
    // Módulo nativo ausente (build antigo/web): sem vibração, sem queda.
  }
}

/** Atalhos: `haptico.sucesso()` lê melhor no meio de um handler que `vibrar('sucesso')`. */
export const haptico = {
  leve: () => vibrar('leve'),
  medio: () => vibrar('medio'),
  selecao: () => vibrar('selecao'),
  sucesso: () => vibrar('sucesso'),
  erro: () => vibrar('erro'),
  aviso: () => vibrar('aviso'),
} as const;
