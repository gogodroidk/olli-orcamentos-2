import React, { useCallback, useRef, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCores, useEstilos, type Cores } from '../theme';
import { enviarDenunciaIA } from '../services/feedback';
// NAO E ENGANO: este componente e MOBILE (chat, diagnostico e voz o montam) e
// mesmo assim importa de `screens/desktop/dialogo`. O nome da pasta envelheceu,
// o modulo nao: `confirmar` delega para <DialogoDesktopHost>, que e montado uma
// vez no topo do App — em TODAS as plataformas, nao so na web — e responde com
// um Modal do RN, dentro do tema, com foco e acessibilidade tratados. E o unico
// confirmar assincrono do app; o `Alert.alert` do RN nao existe na web e o
// `window.confirm` nao existe no aparelho, entao trocar isto por qualquer um
// dos dois quebra o aviso em uma das pontas — e sem aviso NAO PODE HAVER ENVIO
// (regra 2 abaixo). Se alguem for "consertar" este import, mova o modulo e
// atualize os tres docblocks que ainda dizem "web-only" (dialogo.ts,
// DialogoDesktopHost.tsx, App.tsx); nao troque a implementacao.
import { confirmar } from '../screens/desktop/dialogo';

/**
 * "Sinalizar" — o caminho in-app para denunciar conteudo gerado por IA, exigido
 * pela politica de AI-Generated Content da Google Play.
 *
 * O app tem TRES superficies generativas (chat da OLLI, diagnostico por IA e o
 * modo conversa da voz). Um caminho de denuncia que cobrisse so uma delas seria
 * a aparencia da conformidade, nao a conformidade — por isso este componente e
 * compartilhado: as tres montam o MESMO botao, com os mesmos estados e o mesmo
 * aviso. Uma copia por tela ja tinha divergido antes de existir.
 *
 * Tres regras que este componente carrega, e que nao podem se perder numa
 * refatoracao futura:
 *
 * 1. NUNCA confirma sem ter enviado. `enviarDenunciaIA` devolve o resultado
 *    real do insert; so 'ok' vira "Obrigado, vamos revisar". Offline (o caso
 *    normal de quem trabalha em campo) mostra "Nao enviou" e mantem o botao —
 *    denuncia perdida em silencio, num canal exigido por politica de loja, e
 *    buraco de conformidade, nao detalhe de UX.
 *
 * 2. NUNCA envia sem o usuario saber. O texto denunciado sai do aparelho, e
 *    resposta de IA em app de orcamento carrega nome/endereco/preco de cliente
 *    o tempo todo. O `confirmar` abaixo e a unica porta: se ele disser nao,
 *    nada e enviado.
 *
 * 3. NUNCA mexe na resposta. Sinalizar nao apaga, nao esconde e nao edita nada
 *    — quem decide o que fazer com o conteudo continua sendo o usuario. Aqui o
 *    botao e de proposito discreto e subordinado a acao principal da tela.
 */

const AVISO_TITULO = 'Enviar para revisão?';
/** Curto e honesto: o que sai daqui, e o risco que o usuario precisa pesar. */
const AVISO_MENSAGEM =
  'Esta resposta e o seu pedido vão para a nossa equipe revisar. Se houver nome, endereço ou preço de cliente no texto, vai junto.';

type Estado = 'idle' | 'enviando' | 'ok' | 'erro';

export function SinalizarIA({
  tela,
  resposta,
  pedido,
  style,
}: {
  /** Tela onde o conteudo foi renderizado (vai no contexto do /admin). */
  tela: string;
  /**
   * O texto gerado pela IA que esta sendo denunciado.
   *
   * ATENCAO ao montar isto num lugar da arvore onde o conteudo TROCA (uma tela
   * de resultado que refaz a consulta, por exemplo): passe uma `key` que mude a
   * CADA CHAMADA (um contador de consultas serve). Sem a key, o React reusa
   * esta instancia e o "Obrigado, vamos revisar" de um conteudo antigo aparece
   * grudado no conteudo novo — exatamente o "confirmar sem ter enviado" que
   * este componente existe para impedir. `key={resposta}` NAO basta: quando a
   * nova consulta devolve o mesmo texto (cache), a key nao muda e a instancia
   * antiga sobrevive. Onde a resposta e imutavel (uma bolha de chat, que nunca
   * muda de texto depois de criada), a key da propria bolha ja resolve.
   */
  resposta: string;
  /**
   * O pedido do usuario que gerou essa resposta — a fala anterior no chat, o
   * sintoma/codigo no diagnostico, a resposta falada na voz. Sem ele o
   * moderador recebe uma resposta ofensiva sem a pergunta que a provocou, e o
   * canal existe no papel sem servir pra nada. Vazio e aceito (e registrado
   * como "sem pedido"), nunca inventado.
   */
  pedido: string;
  style?: StyleProp<ViewStyle>;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [estado, setEstado] = useState<Estado>('idle');
  /**
   * Trava de toque duplo. Estado do React NAO serve aqui: entre o toque e o
   * `setEstado('enviando')` existe um `await` (o dialogo), e durante ele
   * `estado` continua 'idle'. Dois toques rapidos passavam os dois pela
   * guarda, o Host enfileirava DOIS dialogos (a fila e FIFO, um depois do
   * outro) e confirmar ambos gravava DUAS linhas da mesma denuncia — ruido
   * exatamente na caixa que alguem precisa moderar. O ref muda no mesmo tick,
   * antes de qualquer await, entao o segundo toque morre na porta.
   */
  const emCursoRef = useRef(false);

  const sinalizar = useCallback(async () => {
    if (emCursoRef.current) return;
    emCursoRef.current = true;
    try {
      Haptics.selectionAsync().catch(() => {});
      // Porta unica: sem este "sim", nada sai do aparelho.
      const querEnviar = await confirmar(AVISO_TITULO, AVISO_MENSAGEM);
      if (!querEnviar) return;
      setEstado('enviando');
      const r = await enviarDenunciaIA({ tela, resposta, pedido }).catch(() => 'erro' as const);
      // 'sem_sessao' tambem NAO e sucesso: a linha nao entrou.
      setEstado(r === 'ok' ? 'ok' : 'erro');
    } finally {
      // Libera para o "tocar para tentar" do estado de erro (e para quem disse
      // "nao" e mudou de ideia). No caminho 'ok' o botao nem existe mais.
      emCursoRef.current = false;
    }
  }, [tela, resposta, pedido]);

  if (estado === 'ok') {
    return (
      <View style={style}>
        <Text style={styles.enviadoText} accessibilityLiveRegion="polite">
          Obrigado, vamos revisar
        </Text>
      </View>
    );
  }

  const enviando = estado === 'enviando';
  const falhou = estado === 'erro';

  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={sinalizar}
      disabled={enviando}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={falhou ? 'Tentar sinalizar de novo' : 'Sinalizar esta resposta'}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <MaterialCommunityIcons
        name={falhou ? 'refresh' : 'flag-outline'}
        size={12}
        color={cores.onSurfaceVariant}
      />
      {/* O texto de falha nao culpa o usuario nem esconde o que houve: a
          denuncia NAO entrou, e o botao continua ali para tentar de novo. */}
      <Text style={styles.btnText} accessibilityLiveRegion={falhou ? 'polite' : 'none'}>
        {enviando ? 'Enviando…' : falhou ? 'Não enviou — tocar para tentar' : 'Sinalizar'}
      </Text>
    </TouchableOpacity>
  );
}

const criarEstilos = (c: Cores) => StyleSheet.create({
  // Discreto de proposito: nao pode competir visualmente com a acao principal
  // da tela (transformar em orcamento, criar orcamento, responder a Olli).
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, alignSelf: 'flex-start' },
  btnText: { fontSize: 11.5, fontWeight: '600', color: c.onSurfaceVariant },
  enviadoText: { fontSize: 11.5, fontWeight: '600', color: c.onSurfaceVariant, fontStyle: 'italic', paddingVertical: 4 },
});
