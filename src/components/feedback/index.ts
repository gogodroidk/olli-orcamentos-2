/**
 * FEEDBACK DO APP — a API que as telas usam no lugar do `Alert.alert` nativo.
 *
 *   toast.sucesso('Backup feito. Seus dados estão na nuvem.');
 *   toast.erro('Não foi possível salvar agora. Tente de novo.');
 *   toast.info('Sem internet: o envio sai quando a conexão voltar.');
 *   toast.sucesso('Movido para a Lixeira', { acao: { rotulo: 'Desfazer', aoTocar } });
 *
 *   if (await confirmar({ titulo: 'Excluir orçamento?', mensagem, destrutivo: true })) { … }
 *
 * Regra de uso: TOAST para aviso que não pede decisão (o que aconteceu);
 * CONFIRMAR para pergunta de sim/não antes de agir. Escolha com 3+ caminhos
 * ("Sair e manter / Sair e apagar / Cancelar") continua no `Alert` até a folha
 * ganhar mais botões.
 *
 * Os hosts (`ToastHost`, `ConfirmSheetHost`) montam uma vez em App.tsx. Sem host
 * montado (teste, tela isolada), a API cai no alerta do sistema — um aviso NUNCA
 * some em silêncio, e um `await confirmar()` nunca fica pendurado. No iOS o
 * `confirmar` usa sempre o alerta nativo (ver o motivo na função).
 */
import { Alert, Platform } from 'react-native';
import { vibrar } from '../../utils/haptico';
import {
  filaConfirmacao,
  filaToast,
  normalizarConfirmacao,
  type OpcoesConfirmar,
  type OpcoesToast,
  type TipoToast,
} from './filaFeedback';

export { ToastHost } from './ToastHost';
export { ConfirmSheetHost } from './ConfirmSheet';
export type { AcaoToast, OpcoesConfirmar, OpcoesToast, TipoToast } from './filaFeedback';

function mostrar(tipo: TipoToast, mensagem: string, opcoes?: OpcoesToast): number {
  if (!filaToast.temOuvinte()) {
    // Sem host: alerta do sistema (na web, window.alert — o Alert do RN-web é mudo).
    const titulo = opcoes?.titulo ?? (tipo === 'erro' ? 'Não deu certo' : tipo === 'sucesso' ? 'Pronto' : 'Aviso');
    if (Platform.OS === 'web') {
      try { globalThis.alert?.(`${titulo}\n\n${mensagem}`); } catch { /* sem janela */ }
    } else {
      Alert.alert(titulo, mensagem);
    }
    return 0;
  }
  return filaToast.mostrar(tipo, mensagem, opcoes);
}

export const toast = {
  sucesso: (mensagem: string, opcoes?: OpcoesToast) => mostrar('sucesso', mensagem, opcoes),
  erro: (mensagem: string, opcoes?: OpcoesToast) => mostrar('erro', mensagem, opcoes),
  info: (mensagem: string, opcoes?: OpcoesToast) => mostrar('info', mensagem, opcoes),
  /** Tira um toast da tela antes do tempo (ex.: a ação que ele anunciava foi desfeita). */
  dispensar: (id: number) => filaToast.dispensar(id),
} as const;

/**
 * Pergunta sim/não numa folha que sobe de baixo. Resolve `true` só no botão de
 * confirmar; Cancelar, tocar fora, arrastar pra baixo ou "voltar" = `false`.
 */
export function confirmar(opcoes: OpcoesConfirmar): Promise<boolean> {
  // iOS: a folha é um `Modal`, e o RN apresenta o Modal a partir do view
  // controller da raiz. Com OUTRO Modal já aberto (lista de backups, menu de
  // ações) o UIKit recusa a apresentação ("already presenting"): a folha não
  // aparece, o `await` fica pendurado e toda confirmação seguinte trava atrás
  // dela na fila. O alerta nativo do iOS (UIAlertController) é apresentado pelo
  // controller do topo — aparece por cima de qualquer Modal — e já tem o botão
  // destrutivo em vermelho. A folha própria fica para Android e web, onde o
  // alerta do sistema é a caixa cinza (ou nem aparece).
  if (Platform.OS !== 'ios' && filaConfirmacao.temOuvinte()) return filaConfirmacao.pedir(opcoes);
  const p = normalizarConfirmacao(opcoes, 0);
  if (p.destrutivo) vibrar('aviso');
  if (Platform.OS === 'web') {
    try {
      return Promise.resolve(!!globalThis.confirm?.(p.mensagem ? `${p.titulo}\n\n${p.mensagem}` : p.titulo));
    } catch {
      return Promise.resolve(false);
    }
  }
  return new Promise<boolean>((resolver) => {
    Alert.alert(p.titulo, p.mensagem, [
      { text: p.rotuloCancelar, style: 'cancel', onPress: () => resolver(false) },
      { text: p.rotuloConfirmar, style: p.destrutivo ? 'destructive' : 'default', onPress: () => resolver(true) },
    ], { cancelable: true, onDismiss: () => resolver(false) });
  });
}
