import { useCallback, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { obterEstadoOfertaComercial, iniciarTrialPro } from '../services/cotaEnvios';
import { getResumoAssinatura, type ResumoAssinatura } from '../services/assinatura';
import { PRECO_PRO, reais } from '../services/precosPlanos';
import { sessaoAtiva } from '../services/supabase';
import { TRIAL_PRO_DIAS } from '../services/entitlements';
import {
  chaveDispensaLembrete,
  lembreteAssinatura,
  lembreteDispensado,
  type AcaoLembrete,
  type Lembrete,
} from '../services/lembreteAssinatura';
import { lembreteParaPlataforma, type LembreteExibivel } from '../services/lembreteAssinaturaLoja';
import { recarregarPlanoGlobal } from './usePlano';
// Mesmo `confirmar`/`avisar` que o SinalizarIA usa: o host é montado em TODAS as
// plataformas. Aqui só a WEB usa — lá o `Alert.alert` do RN não existe.
import { confirmar, avisar } from '../screens/desktop/dialogo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * useLembreteAssinatura — liga a regra pura de `services/lembreteAssinatura.ts` à
 * tela: lê oferta + assinatura, aplica o "agora não" guardado no aparelho e adapta
 * o resultado à loja (`services/lembreteAssinaturaLoja.ts`).
 *
 * TRÊS ESTADOS, nunca dois (ver memória "erro vira vazio"):
 *   `carregando`   → ainda não sei; nada na tela.
 *   `indisponivel` → não deu para confirmar a oferta; nada NOVO na tela, mas um
 *                    lembrete já mostrado continua (falha de rede não é "pagou").
 *   `pronto`       → sei: `lembrete` é o aviso ou `null` (genuinamente nada a lembrar).
 * Nenhum erro de rede/storage sobe: tudo é engolido aqui dentro.
 *
 * Revalida a cada foco da tela (voltar do checkout/Planos atualiza sozinho).
 */
export type EstadoLembrete =
  | { estado: 'carregando' }
  | { estado: 'indisponivel'; lembrete: LembreteExibivel | null }
  | { estado: 'pronto'; lembrete: LembreteExibivel | null };

export interface UseLembreteAssinatura {
  estado: EstadoLembrete;
  /** O que a faixa desenha agora (atalho de `estado`). */
  lembrete: LembreteExibivel | null;
  /** "Agora não": grava o momento e esconde. No-op se o lembrete não é dispensável. */
  dispensar: () => void;
  /** Executa a ação de um botão da faixa. */
  executar: (acao: AcaoLembrete) => void;
  /** `true` enquanto o teste do Pro está sendo iniciado. */
  iniciandoTrial: boolean;
}

/** Deriva a linha de assinatura no formato que a regra espera. */
function assinaturaParaRegra(r: ResumoAssinatura) {
  return {
    planoEfetivo: r.planoEfetivo,
    planoContratado: r.planoContratado,
    origem: r.origem,
    renovaSozinho: r.renovaSozinho,
    proximaCobranca: r.proximaCobranca,
  };
}

async function lerDispensa(chave: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(chave);
  } catch {
    // Storage falhou: "não sei se dispensou" → mostra (o aviso não bloqueia nada).
    return null;
  }
}

export function useLembreteAssinatura(): UseLembreteAssinatura {
  const nav = useNavigation<Nav>();
  const [estado, setEstado] = useState<EstadoLembrete>({ estado: 'carregando' });
  const [iniciandoTrial, setIniciandoTrial] = useState(false);
  // Lembrete ORIGINAL da regra + dono: a chave do "agora não" usa o id da regra.
  const atual = useRef<{ userId: string; lembrete: Lembrete } | null>(null);
  // Leituras concorrentes (foco repetido): só a mais recente publica.
  const revisao = useRef(0);

  const carregar = useCallback(async () => {
    const minha = ++revisao.current;
    try {
      const sessao = await sessaoAtiva();
      const userId = sessao?.user?.id;
      if (minha !== revisao.current) return;
      if (!userId) {
        // Sem sessão não há conta para lembrar — resposta definitiva, não erro.
        atual.current = null;
        setEstado({ estado: 'pronto', lembrete: null });
        return;
      }

      const [oferta, resumo] = await Promise.all([
        obterEstadoOfertaComercial().catch(() => null),
        getResumoAssinatura().catch(() => null),
      ]);
      if (minha !== revisao.current) return;

      const agora = new Date();
      const lembrete = lembreteAssinatura({
        agora,
        oferta,
        assinatura: resumo ? assinaturaParaRegra(resumo) : null,
        precoProMensal: reais(PRECO_PRO.mensalCentavos),
      });

      if (!lembrete) {
        // Oferta não confirmada + regra sem nada a dizer = "não sei", não "nada a
        // lembrar": mantém o que já estava na tela em vez de apagá-lo.
        if (oferta === null) {
          setEstado((ant) => ({ estado: 'indisponivel', lembrete: ant.estado === 'carregando' ? null : ant.lembrete }));
        } else {
          atual.current = null;
          setEstado({ estado: 'pronto', lembrete: null });
        }
        return;
      }

      const dispensadoEm = await lerDispensa(chaveDispensaLembrete(userId, lembrete));
      if (minha !== revisao.current) return;
      atual.current = { userId, lembrete };
      const escondido = lembreteDispensado(lembrete, dispensadoEm, agora);
      setEstado({
        estado: 'pronto',
        lembrete: escondido ? null : lembreteParaPlataforma(lembrete, Platform.OS),
      });
    } catch {
      if (minha !== revisao.current) return;
      setEstado((ant) => ({ estado: 'indisponivel', lembrete: ant.estado === 'carregando' ? null : ant.lembrete }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  const dispensar = useCallback(() => {
    const a = atual.current;
    if (!a || a.lembrete.dispensavelPorHoras === null) return;
    // Esconde já (é a intenção do usuário); gravar é best-effort — se o storage
    // falhar, o aviso só volta na próxima leitura.
    setEstado({ estado: 'pronto', lembrete: null });
    AsyncStorage.setItem(chaveDispensaLembrete(a.userId, a.lembrete), new Date().toISOString()).catch(() => {});
  }, []);

  // Mesma copy e mesmo comportamento do `pedirInicioTrial`/`executarInicioTrial`
  // da PlanosScreen.
  const executarInicioTrial = useCallback(async () => {
    setIniciandoTrial(true);
    const inicio = await iniciarTrialPro().catch(() => null);
    if (!inicio) {
      setIniciandoTrial(false);
      aviso('Não foi possível iniciar', 'Confirme sua conexão e tente novamente. O teste não foi consumido.');
      return;
    }
    await recarregarPlanoGlobal().catch(() => {});
    await carregar();
    setIniciandoTrial(false);
    aviso('Pro liberado', `Seu teste vai até ${new Date(inicio.terminaEm).toLocaleDateString('pt-BR')}. Não haverá cobrança automática.`);
  }, [carregar]);

  const pedirInicioTrial = useCallback(() => {
    const titulo = `Experimentar o Pro por ${TRIAL_PRO_DIAS} dias`;
    const texto = 'Você não precisa informar cartão e não haverá cobrança automática. Ao terminar, sua conta volta ao Grátis e seus dados continuam salvos.';
    if (Platform.OS === 'web') {
      void confirmar(titulo, texto).then((ok) => { if (ok) void executarInicioTrial(); });
      return;
    }
    Alert.alert(titulo, texto, [
      { text: 'Agora não', style: 'cancel' },
      { text: 'Começar teste', onPress: () => { void executarInicioTrial(); } },
    ]);
  }, [executarInicioTrial]);

  const executar = useCallback((acao: AcaoLembrete) => {
    // Defesa em profundidade: a adaptação da loja já tirou esses botões fora da
    // web; se algum voltar por engano, o clique não leva a lugar nenhum de compra.
    const podeVender = Platform.OS === 'web';
    switch (acao) {
      case 'planos':
        if (podeVender) nav.navigate('Planos');
        return;
      case 'renovar_pix':
        // A AssinaturaScreen tem o "Renovar com Pix" (e o esconde fora da web).
        if (podeVender) nav.navigate('Assinatura');
        return;
      case 'iniciar_trial':
        if (!iniciandoTrial) pedirInicioTrial();
        return;
    }
  }, [nav, iniciandoTrial, pedirInicioTrial]);

  const lembrete = estado.estado === 'carregando' ? null : estado.lembrete;
  return { estado, lembrete, dispensar, executar, iniciandoTrial };
}

/** Aviso de uma linha nas duas pontas (Alert não existe na web). */
function aviso(titulo: string, texto: string): void {
  if (Platform.OS === 'web') avisar(titulo, texto);
  else Alert.alert(titulo, texto);
}
